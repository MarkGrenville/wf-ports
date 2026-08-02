const { getWorkflowRuns, parseOwnerRepo } = require("../shared/github");
const projectsPoller = require("./projects");

const BASE_TICK_MS = 30_000;
const FAST_TICK_MS = 15_000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

let stateRef = null;
let timer = null;

const lastFingerprint = new Map();
const lastRuns = new Map();
let hasActiveRuns = false;

function fingerprintFor(runs) {
  if (!runs || runs.length === 0) return "none";
  return runs.map((r) => `${r.id}:${r.status}:${r.conclusion}`).join("|");
}

async function checkOne(project) {
  const repoUrl = project.gitInfo?.repoUrl;
  if (!repoUrl) return;

  const parsed = parseOwnerRepo(repoUrl);
  if (!parsed) return;

  try {
    const runs = await getWorkflowRuns(parsed.owner, parsed.repo, GITHUB_TOKEN);
    if (runs === null) return;

    const fp = fingerprintFor(runs);
    if (lastFingerprint.get(project.id) === fp) return;
    lastFingerprint.set(project.id, fp);
    lastRuns.set(project.id, runs);

    publish();
  } catch (err) {
    console.error(`[ci] ${project.id} failed:`, err.message);
  }
}

function publish() {
  if (!stateRef) return;
  const entries = [];
  for (const [projectId, runs] of lastRuns) {
    entries.push({ projectId, runs, lastPolled: new Date().toISOString() });
  }
  stateRef.set("ciStatus", entries);
}

async function tick() {
  if (!GITHUB_TOKEN) return;
  try {
    const projects = projectsPoller.getCurrentProjects();
    hasActiveRuns = false;

    for (const p of projects) {
      await checkOne(p);
      const runs = lastRuns.get(p.id);
      if (runs?.some((r) => r.status === "in_progress" || r.status === "queued")) {
        hasActiveRuns = true;
      }
    }
  } catch (err) {
    console.error("[ci] tick failed:", err.message);
  }

  scheduleNext();
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  const delay = hasActiveRuns ? FAST_TICK_MS : BASE_TICK_MS;
  timer = setTimeout(tick, delay);
}

function start(state) {
  stateRef = state;
  if (!GITHUB_TOKEN) {
    console.log("[ci] GITHUB_TOKEN not set — CI polling disabled");
    return;
  }
  console.log(`[ci] polling GitHub Actions every ${BASE_TICK_MS / 1000}s (${FAST_TICK_MS / 1000}s when active)`);
  setTimeout(tick, 5000);
}

module.exports = { start };
