// ============================================================
// FIREBASE CLOUD FUNCTION — TenderNed Integratie
// Haalt overheids­opdrachten op van TenderNed en slaat ze op
// in Firestore collectie "overheidsopdrachten".
// ============================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// Relevante zoektermen voor finance & accountancy sector
const ZOEKTERMEN = [
  "accountant",
  "accountancy",
  "financieel",
  "finance",
  "boekhouding",
  "controller",
  "audit",
  "fiscaal",
  "belasting",
  "interim",
  "detachering personeel",
  "salarisadministratie",
  "payroll",
  "administratie",
];

const TENDERNED_BASE = "https://www.tenderned.nl/papi/tenderned-rs-tns/v2";

/**
 * Haal publicaties op van TenderNed API
 */
async function fetchPublicaties(zoekterm, page = 0, size = 20) {
  const params = new URLSearchParams({
    q: zoekterm,
    page: String(page),
    size: String(size),
  });

  const url = `${TENDERNED_BASE}/publicaties?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Feen-Bot/1.0 (contact@feennl.nl)",
    },
    timeout: 15000,
  });

  if (!response.ok) {
    functions.logger.warn(`TenderNed API error ${response.status} voor "${zoekterm}"`);
    return [];
  }

  const data = await response.json();
  return data.content || data || [];
}

/**
 * Parse een publicatie naar een opgeschoond Firestore document
 */
function parsePublicatie(pub) {
  return {
    publicatieId: String(
      pub.publicatieId || pub.id || pub.publicationId || ""
    ),
    titel: pub.publicatieTitel || pub.titel || pub.title || "Onbekende titel",
    beschrijving:
      pub.omschrijving ||
      pub.beschrijving ||
      pub.description ||
      "",
    aanbestedendeDienst:
      (pub.aanbestedendeDienst && pub.aanbestedendeDienst.naam) ||
      pub.aanbestedendeDienstNaam ||
      pub.organisatie ||
      "Onbekend",
    publicatieDatum:
      pub.publicatieDatum || pub.datumPublicatie || pub.publicationDate || null,
    sluitingsDatum:
      pub.sluitingsDatum ||
      pub.sluitingsdatum ||
      pub.deadlineDate ||
      null,
    type:
      pub.publicatieType ||
      pub.type ||
      pub.aankondigingType ||
      "Onbekend",
    cpvCodes: pub.cpvCodes || pub.cpvOmschrijvingen || [],
    procedure: pub.procedure || pub.procedureType || "",
    status: pub.status || "actief",
    url: pub.publicatieId
      ? `https://www.tenderned.nl/aankondigingen/overzicht/publicatie/${pub.publicatieId}`
      : pub.url || "",
    laatstBijgewerkt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Scheduled Cloud Function — draait elk uur
 * Haalt de nieuwste relevante TenderNed publicaties op
 */
exports.fetchTenderNed = functions
  .region("europe-west1")
  .pubsub.schedule("every 1 hours")
  .timeZone("Europe/Amsterdam")
  .onRun(async () => {
    functions.logger.info("TenderNed sync gestart");

    let totalOpgeslagen = 0;
    const gezienIds = new Set();

    for (const zoekterm of ZOEKTERMEN) {
      try {
        const publicaties = await fetchPublicaties(zoekterm);

        for (const pub of publicaties) {
          const parsed = parsePublicatie(pub);

          // Skip als geen ID of al gezien
          if (!parsed.publicatieId || gezienIds.has(parsed.publicatieId)) {
            continue;
          }
          gezienIds.add(parsed.publicatieId);

          // Opslaan in Firestore (merge = update bestaande docs)
          await db
            .collection("overheidsopdrachten")
            .doc(parsed.publicatieId)
            .set(parsed, { merge: true });

          totalOpgeslagen++;
        }
      } catch (err) {
        functions.logger.error(`Fout bij zoekterm "${zoekterm}":`, err.message);
      }
    }

    // Verwijder verlopen opdrachten (sluitingsDatum > 30 dagen geleden)
    try {
      const dertigDagenGeleden = new Date();
      dertigDagenGeleden.setDate(dertigDagenGeleden.getDate() - 30);
      const verlopenQuery = await db
        .collection("overheidsopdrachten")
        .where("sluitingsDatum", "<", dertigDagenGeleden.toISOString())
        .get();

      const batch = db.batch();
      let verwijderd = 0;
      verlopenQuery.forEach((doc) => {
        batch.delete(doc.ref);
        verwijderd++;
      });

      if (verwijderd > 0) {
        await batch.commit();
        functions.logger.info(`${verwijderd} verlopen opdrachten verwijderd`);
      }
    } catch (err) {
      functions.logger.warn("Cleanup van verlopen opdrachten mislukt:", err.message);
    }

    functions.logger.info(
      `TenderNed sync voltooid: ${totalOpgeslagen} opdrachten opgeslagen/bijgewerkt`
    );
    return null;
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
            .set(parsed, { merge: true });

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
