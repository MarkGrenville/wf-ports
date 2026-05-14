const os = require("os");
const { HANDLERS } = require("./handlers");

const HOSTNAME = process.env.AGENT_RUNNER_HOSTNAME || os.hostname();
const claiming = new Set();

async function tryClaim(db, admin, docRef) {
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const data = snap.data();
      if (data.status !== "pending") return null;
      tx.update(docRef, {
        status: "running",
        claimedBy: HOSTNAME,
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { id: snap.id, ...data, status: "running" };
    });
  } catch (err) {
    console.error(`[commands] claim transaction failed for ${docRef.id}:`, err.message);
    return null;
  }
}

async function execute(db, admin, claimed) {
  const docRef = db.collection("commands").doc(claimed.id);
  const handler = HANDLERS[claimed.type];
  if (!handler) {
    await docRef.update({
      status: "error",
      error: `Unknown command type: ${claimed.type}`,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }
  try {
    const result = await handler(claimed, { db, admin });
    await docRef.update({
      status: "done",
      result: result || null,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[commands] ${claimed.id} (${claimed.type}) done`);
  } catch (err) {
    await docRef.update({
      status: "error",
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.error(`[commands] ${claimed.id} (${claimed.type}) errored:`, err.message);
  }
}

function start(db, admin) {
  const q = db.collection("commands").where("status", "==", "pending");
  q.onSnapshot(
    async (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const id = change.doc.id;
        if (claiming.has(id)) continue;
        claiming.add(id);
        try {
          const claimed = await tryClaim(db, admin, change.doc.ref);
          if (claimed) await execute(db, admin, claimed);
        } finally {
          claiming.delete(id);
        }
      }
    },
    (err) => console.error("[commands] listener error:", err.message),
  );
  console.log(`[commands] listening (hostname: ${HOSTNAME})`);
}

module.exports = { start };
