const { getGitInfo } = require("../shared/git");

const TICK_MS = 30_000;
const lastFingerprint = new Map();

function fingerprintFor(info) {
  if (!info) return "none";
  return [
    info.branch,
    info.status?.hasChanges ? "dirty" : "clean",
    info.status?.ahead ?? 0,
    info.status?.behind ?? 0,
    info.lastCommit?.hash?.slice(0, 8) ?? "",
  ].join("|");
}

async function checkOne(db, project) {
  if (!project.projectPath) return;
  try {
    const info = await getGitInfo(project.projectPath);
    const fp = fingerprintFor(info);
    if (lastFingerprint.get(project.id) === fp) return;
    lastFingerprint.set(project.id, fp);
    await db
      .collection("projects")
      .doc(project.id)
      .set({ gitInfo: info, gitInfoLastUpdated: new Date() }, { merge: true });
  } catch (err) {
    console.error(`[git] ${project.id} failed:`, err.message);
  }
}

async function tick(db) {
  try {
    const snap = await db.collection("projects").get();
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const p of projects) {
      await checkOne(db, p);
    }
  } catch (err) {
    console.error("[git] tick failed:", err.message);
  }
}

function start(db) {
  setTimeout(() => tick(db), 4000);
  setInterval(() => tick(db), TICK_MS);
  console.log(`[git] polling every ${TICK_MS}ms`);
}

module.exports = { start };
