// ============================================================
// FIREBASE CLOUD FUNCTIONS — Feen
// 1. sendContactEmail: E-mail notificatie bij nieuw contactbericht
// 2. sendToolLeadEmail: E-mail notificatie bij tool-gebruik met e-mail
// ============================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// SMTP configuratie via Firebase environment config
// Stel in met: firebase functions:config:set smtp.host="mail.feennl.nl" smtp.port="587" smtp.user="omar@feennl.nl" smtp.pass="JOUW_WACHTWOORD"
function getTransporter() {
  const config = functions.config().smtp || {};
  return nodemailer.createTransport({
    host: config.host || "smtp.example.com",
    port: parseInt(config.port || "587"),
    secure: config.port === "465",
    auth: {
      user: config.user || "",
      pass: config.pass || "",
    },
  });
}

/**
 * Trigger: nieuw document in 'contact-berichten'
 * Stuurt een e-mail naar omar@feennl.nl met het contactbericht
 */
exports.sendContactEmail = functions
  .region("europe-west1")
  .firestore.document("contact-berichten/{docId}")
  .onCreate(async (snap) => {
    const d = snap.data();
    const transporter = getTransporter();

    const mailOptions = {
      from: `"Feen Website" <${(functions.config().smtp || {}).user || "noreply@feennl.nl"}>`,
      to: "omar@feennl.nl",
      replyTo: d.email || undefined,
      subject: `[Feen Contact] ${d.onderwerp || "Nieuw bericht"}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a1f3a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#b8f470;margin:0;">Nieuw contactbericht via Feen.nl</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;font-weight:bold;color:#666;width:120px;">Naam:</td><td style="padding:8px 0;">${d.naam || "—"}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#666;">E-mail:</td><td style="padding:8px 0;"><a href="mailto:${d.email || ""}">${d.email || "—"}</a></td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#666;">Telefoon:</td><td style="padding:8px 0;">${d.telefoon || "—"}</td></tr>
              <tr><td style="padding:8px 0;font-weight:bold;color:#666;">Onderwerp:</td><td style="padding:8px 0;"><strong>${d.onderwerp || "—"}</strong></td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <p style="color:#333;line-height:1.6;white-space:pre-wrap;">${d.bericht || "Geen bericht"}</p>
          </div>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      functions.logger.info(`Contact e-mail verstuurd voor ${snap.id}`);
    } catch (err) {
      functions.logger.error("E-mail versturen mislukt:", err.message);
    }
  });

/**
 * Trigger: nieuw/bijgewerkt document in 'tool-gebruik' met e-mail
 * Stuurt een notificatie naar omar@feennl.nl
 */
exports.sendToolLeadEmail = functions
  .region("europe-west1")
  .firestore.document("tool-gebruik/{docId}")
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    // Alleen sturen als er een email is toegevoegd (was leeg, nu gevuld)
    if (before.email || !after.email) return;

    const d = after;
    const transporter = getTransporter();

    let details = "";
    if (d.type === "rekentool") {
      details = `<strong>Rekentool resultaat:</strong><br>
        Functie: ${d.functie || "—"}<br>
        Medewerkers: ${d.medewerkers || 0}<br>
        Uurloon: €${d.uurloon || 0}<br>
        Uren/maand: ${d.uren || 0}<br>
        <strong style="color:#1a5e1a;">Besparing: €${(d.besparingPerMaand || 0).toFixed(2)}/maand</strong>`;
    } else if (d.type === "checklist") {
      details = `<strong>Checklist resultaat:</strong><br>
        Score: ${d.score || 0}/${d.maxScore || 15}<br>
        Fase ${d.fase || "?"}: ${d.faseTitel || ""}`;
    }

    const mailOptions = {
      from: `"Feen Website" <${(functions.config().smtp || {}).user || "noreply@feennl.nl"}>`,
      to: "omar@feennl.nl",
      subject: `[Feen Lead] ${d.type === "rekentool" ? "Rekentool" : "Checklist"} — ${d.email}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a1f3a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#b8f470;margin:0;">Nieuwe lead via ${d.type === "rekentool" ? "Rekentool" : "Checklist"}</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
            <p style="font-size:16px;"><strong>E-mail:</strong> <a href="mailto:${d.email}">${d.email}</a></p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <p style="line-height:1.8;color:#333;">${details}</p>
          </div>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      functions.logger.info(`Tool lead e-mail verstuurd voor ${change.after.id}`);
    } catch (err) {
      functions.logger.error("Tool lead e-mail mislukt:", err.message);
    }
  });

/**
 * HTTP trigger — handmatig de sync uitvoeren (voor testen)
 * Aanroepen via: https://europe-west1-feen-3c09a.cloudfunctions.net/manualFetchTenderNed
 */
exports.manualFetchTenderNed = functions
  .region("europe-west1")
  .https.onRequest(async (req, res) => {
    // Alleen admin mag dit aanroepen
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Niet geautoriseerd" });
      return;
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await admin.auth().verifyIdToken(token);

      if (decoded.email !== "omarelazami@hotmail.nl") {
        res.status(403).json({ error: "Geen admin rechten" });
        return;
      }
    } catch (err) {
      res.status(401).json({ error: "Ongeldig token" });
      return;
    }

    functions.logger.info("Handmatige TenderNed sync gestart door admin");

    let totalOpgeslagen = 0;
    const gezienIds = new Set();

    for (const zoekterm of ZOEKTERMEN) {
      try {
        const publicaties = await fetchPublicaties(zoekterm);

        for (const pub of publicaties) {
          const parsed = parsePublicatie(pub);
          if (!parsed.publicatieId || gezienIds.has(parsed.publicatieId)) continue;
          gezienIds.add(parsed.publicatieId);

          await db
            .collection("overheidsopdrachten")
            .doc(parsed.publicatieId)
            .set(parsed);

          totalOpgeslagen++;
        }
      } catch (err) {
        functions.logger.error(`Fout bij zoekterm "${zoekterm}":`, err.message);
      }
    }

    res.json({
      success: true,
      message: `${totalOpgeslagen} opdrachten opgeslagen/bijgewerkt`,
    });
  });
