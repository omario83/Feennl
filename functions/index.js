// ============================================================
// FIREBASE CLOUD FUNCTIONS — Feen
// 1. sendContactEmail:    E-mail bij nieuw contactbericht
// 2. sendToolUsageEmail:  E-mail bij elk tool-gebruik (rekentool/checklist)
// 3. sendToolLeadEmail:   E-mail als iemand e-mail achterlaat na tool-gebruik
// ============================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// SMTP configuratie via .env bestand in functions/
function getTransporter() {
  const port = parseInt(process.env.SMTP_PORT || "465");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

function smtpFrom() {
  return `"Feen Website" <${process.env.SMTP_USER || "noreply@feennl.nl"}>`;
}

function toolDetails(d) {
  if (d.type === "rekentool") {
    return `<strong>Rekentool resultaat:</strong><br>
      Functie: ${d.functie || "—"}<br>
      Medewerkers: ${d.medewerkers || 0}<br>
      Uurloon: &euro;${d.uurloon || 0}<br>
      Uren/maand: ${d.uren || 0}<br>
      <strong style="color:#1a5e1a;">Besparing: &euro;${(d.besparingPerMaand || 0).toFixed(2)}/maand</strong>`;
  }
  if (d.type === "checklist") {
    return `<strong>Checklist resultaat:</strong><br>
      Score: ${d.score || 0}/${d.maxScore || 15}<br>
      Fase ${d.fase || "?"}: ${d.faseTitel || ""}`;
  }
  return "";
}

// ── 1. Contactbericht → mail ──────────────────────────────
exports.sendContactEmail = functions
  .region("europe-west1")
  .firestore.document("contact-berichten/{docId}")
  .onCreate(async (snap) => {
    const d = snap.data();
    const transporter = getTransporter();

    const mailOptions = {
      from: smtpFrom(),
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
        </div>`,
    };

    try {
      await transporter.sendMail(mailOptions);
      functions.logger.info(`Contact e-mail verstuurd voor ${snap.id}`);
    } catch (err) {
      functions.logger.error("Contact e-mail mislukt:", err.message);
    }
  });

// ── 2. Elk tool-gebruik → melding ─────────────────────────
exports.sendToolUsageEmail = functions
  .region("europe-west1")
  .firestore.document("tool-gebruik/{docId}")
  .onCreate(async (snap) => {
    const d = snap.data();
    const transporter = getTransporter();
    const typeName = d.type === "rekentool" ? "Rekentool" : "Checklist";

    const mailOptions = {
      from: smtpFrom(),
      to: "omar@feennl.nl",
      subject: `[Feen Tool] Iemand heeft de ${typeName} gebruikt`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a1f3a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#b8f470;margin:0;">${typeName} gebruikt op Feen.nl</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
            <p style="line-height:1.8;color:#333;">${toolDetails(d)}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <p style="color:#999;font-size:13px;">Bekijk de details in je <a href="https://feennl.nl/admin" style="color:#b8f470;">admin panel</a>.</p>
          </div>
        </div>`,
    };

    try {
      await transporter.sendMail(mailOptions);
      functions.logger.info(`Tool usage e-mail verstuurd voor ${snap.id}`);
    } catch (err) {
      functions.logger.error("Tool usage e-mail mislukt:", err.message);
    }
  });

// ── 3. E-mail achtergelaten na tool → lead melding ────────
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
    const typeName = d.type === "rekentool" ? "Rekentool" : "Checklist";

    const mailOptions = {
      from: smtpFrom(),
      to: "omar@feennl.nl",
      replyTo: d.email,
      subject: `[Feen Lead] ${typeName} — ${d.email}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a1f3a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#b8f470;margin:0;">Nieuwe lead via ${typeName}</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
            <p style="font-size:16px;"><strong>E-mail:</strong> <a href="mailto:${d.email}">${d.email}</a></p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <p style="line-height:1.8;color:#333;">${toolDetails(d)}</p>
            <p style="color:#999;font-size:13px;margin-top:16px;">Maak deze lead aan als opdrachtgever in je <a href="https://feennl.nl/admin" style="color:#b8f470;">admin panel</a>.</p>
          </div>
        </div>`,
    };

    try {
      await transporter.sendMail(mailOptions);
      functions.logger.info(`Tool lead e-mail verstuurd voor ${change.after.id}`);
    } catch (err) {
      functions.logger.error("Tool lead e-mail mislukt:", err.message);
    }
  });
