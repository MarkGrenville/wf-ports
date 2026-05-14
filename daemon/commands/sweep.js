const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const MAX_AGE_MS = 60 * 60 * 1000;

async function sweep(db) {
  try {
    const cutoff = new Date(Date.now() - MAX_AGE_MS);
    const snap = await db
      .collection("commands")
      .where("completedAt", "<", cutoff)
      .limit(200)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`[commands] swept ${snap.size} old command docs`);
  } catch (err) {
    console.error("[commands] sweep failed:", err.message);
  }
}

function start(db) {
  setTimeout(() => sweep(db), 60_000);
  setInterval(() => sweep(db), SWEEP_INTERVAL_MS);
}

module.exports = { start };
