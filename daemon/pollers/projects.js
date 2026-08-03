const path = require("path");
const os = require("os");
const chokidar = require("chokidar");
const { scanAllProjects } = require("../shared/scan");
const { buildUsedPortsExport } = require("../shared/docs");

const PROJECTS_BASE_PATH =
  process.env.PROJECTS_BASE_PATH || path.join(os.homedir(), "Projects");

const RESCAN_INTERVAL_MS = 5 * 60 * 1000;

let stateRef = null;
let currentProjects = []; // base scan result
const gitByProject = new Map(); // projectId -> gitInfo, layered on by the git poller

let rescanInFlight = false;
let pendingRescan = false;

// Merge live git info into the scanned projects and publish. Both the rescan
// and the git poller funnel through here so neither clobbers the other.
function publishProjects() {
  if (!stateRef) return;
  const merged = currentProjects.map((p) => ({
    ...p,
    gitInfo: gitByProject.get(p.id) ?? p.gitInfo ?? null,
  }));
  stateRef.set("projects", merged);
}

async function rescanAndWrite(state) {
  if (state) stateRef = state;
  if (rescanInFlight) {
    pendingRescan = true;
    return;
  }
  rescanInFlight = true;
  try {
    console.log("[projects] starting rescan");
    const projects = await scanAllProjects(PROJECTS_BASE_PATH);
    currentProjects = projects;

    // Drop git info for projects that no longer exist.
    const ids = new Set(projects.map((p) => p.id));
    for (const id of gitByProject.keys()) {
      if (!ids.has(id)) gitByProject.delete(id);
    }

    publishProjects();
    stateRef.set("usedPortsExport", buildUsedPortsExport(projects));

    console.log(`[projects] published ${projects.length} projects + port export`);
  } catch (err) {
    console.error("[projects] rescan failed:", err.message);
  } finally {
    rescanInFlight = false;
    if (pendingRescan) {
      pendingRescan = false;
      setTimeout(() => rescanAndWrite(), 250);
    }
  }
}

function setGitInfo(projectId, info) {
  gitByProject.set(projectId, info);
  publishProjects();
}

function patchProject(projectId, fields) {
  const idx = currentProjects.findIndex((p) => p.id === projectId);
  if (idx === -1) return false;
  currentProjects[idx] = { ...currentProjects[idx], ...fields };
  publishProjects();
  return true;
}

function getCurrentProjects() {
  return currentProjects;
}

function start(state) {
  stateRef = state;
  rescanAndWrite();
  setInterval(() => rescanAndWrite(), RESCAN_INTERVAL_MS);

  const watcher = chokidar.watch(
    [
      `${PROJECTS_BASE_PATH}/*/.webfootprint/ports.json`,
      `${PROJECTS_BASE_PATH}/*/wf-ports.json`,
    ],
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 3,
    }
  );
  let debounceTimer = null;
  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => rescanAndWrite(), 800);
  };
  watcher.on("add", trigger);
  watcher.on("change", trigger);
  watcher.on("unlink", trigger);
  console.log(
    `[projects] watching ${PROJECTS_BASE_PATH}/*/.webfootprint/ports.json (+ legacy wf-ports.json)`
  );
}

module.exports = {
  start,
  rescanAndWrite,
  setGitInfo,
  getCurrentProjects,
  patchProject,
};
