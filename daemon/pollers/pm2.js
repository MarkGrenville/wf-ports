const { listProcesses } = require("../shared/pm2");

const TICK_MS = 5000;
let lastWritten = null;
let inFlight = false;

function safeDocId(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function projectIdFor(name) {
  const idx = name.indexOf("-");
  return idx === -1 ? name : name.slice(0, idx);
}

async function tick(db) {
  if (inFlight) return;
  inFlight = true;
  try {
    const procs = await listProcesses();
    if (procs === null) return;
    // Fingerprint excludes CPU + memory because they fluctuate every second
    // and would force a full-collection rewrite on every tick (blew through
    // the Firestore free tier in hours).
    const fingerprint = procs
      .map((p) => `${p.name}:${p.status}:${p.pid}:${p.restarts}`)
      .sort()
      .join("|");
    if (fingerprint === lastWritten) return;
    lastWritten = fingerprint;

    const now = new Date();
    const batch = db.batch();
    const seenIds = new Set();
    for (const p of procs) {
      const docId = safeDocId(p.name);
      seenIds.add(docId);
      batch.set(db.collection("pm2").doc(docId), {
        name: p.name,
        pm_id: p.pm_id,
        status: p.status,
        pid: p.pid,
        restarts: p.restarts,
        uptime: p.uptime,
        execPath: p.execPath,
        cwd: p.cwd,
        projectId: projectIdFor(p.name),
        lastSeen: now,
      });
    }

    const existing = await db.collection("pm2").get();
    for (const d of existing.docs) {
      if (!seenIds.has(d.id)) batch.delete(d.ref);
    }
    await batch.commit();
    console.log(`[pm2] wrote ${procs.length} processes`);
  } catch (err) {
    console.error("[pm2] tick failed:", err.message);
  } finally {
    inFlight = false;
  }
}

function start(db) {
  setTimeout(() => tick(db), 1500);
  setInterval(() => tick(db), TICK_MS);
  console.log(`[pm2] polling every ${TICK_MS}ms`);
}

module.exports = { start };
