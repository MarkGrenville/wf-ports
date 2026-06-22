const { getGitInfo } = require("../shared/git");
const projectsPoller = require("./projects");

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

async function checkOne(project) {
  if (!project.projectPath) return;
  try {
    const info = await getGitInfo(project.projectPath);
    const fp = fingerprintFor(info);
    if (lastFingerprint.get(project.id) === fp) return;
    lastFingerprint.set(project.id, fp);
    projectsPoller.setGitInfo(project.id, info);
  } catch (err) {
    console.error(`[git] ${project.id} failed:`, err.message);
  }
}

async function tick() {
  try {
    const projects = projectsPoller.getCurrentProjects();
    for (const p of projects) {
      await checkOne(p);
    }
  } catch (err) {
    console.error("[git] tick failed:", err.message);
  }
}

function start() {
  setTimeout(tick, 4000);
  setInterval(tick, TICK_MS);
  console.log(`[git] polling every ${TICK_MS}ms`);
}

module.exports = { start };
