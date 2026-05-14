const path = require("path");
const os = require("os");
const chokidar = require("chokidar");
const { scanAllProjects } = require("../shared/scan");
const { buildPortioDocsMarkdown, buildUsedPortsExport } = require("../shared/docs");

const PROJECTS_BASE_PATH =
  process.env.PROJECTS_BASE_PATH || path.join(os.homedir(), "Projects");

const RESCAN_INTERVAL_MS = 5 * 60 * 1000;

let rescanInFlight = false;
let pendingRescan = false;

async function rescanAndWrite(db) {
  if (rescanInFlight) {
    pendingRescan = true;
    return;
  }
  rescanInFlight = true;
  try {
    console.log("[projects] starting rescan");
    const projects = await scanAllProjects(PROJECTS_BASE_PATH);
    const now = new Date();

    const batch = db.batch();
    const seenIds = new Set();
    for (const project of projects) {
      seenIds.add(project.id);
      batch.set(
        db.collection("projects").doc(project.id),
        { ...project, lastScanned: now },
        { merge: false },
      );
    }
    await batch.commit();

    const existing = await db.collection("projects").get();
    const stale = existing.docs.filter((d) => !seenIds.has(d.id));
    if (stale.length > 0) {
      const deleteBatch = db.batch();
      for (const d of stale) deleteBatch.delete(d.ref);
      await deleteBatch.commit();
      console.log(`[projects] deleted ${stale.length} stale project docs`);
    }

    await db.collection("system").doc("portioDocs").set({
      markdown: buildPortioDocsMarkdown(projects),
      lastGenerated: now,
    });
    await db.collection("system").doc("usedPortsExport").set({
      ...buildUsedPortsExport(projects),
      lastGenerated: now,
    });

    console.log(`[projects] wrote ${projects.length} projects + system docs`);
  } catch (err) {
    console.error("[projects] rescan failed:", err.message);
  } finally {
    rescanInFlight = false;
    if (pendingRescan) {
      pendingRescan = false;
      setTimeout(() => rescanAndWrite(db), 250);
    }
  }
}

function start(db) {
  rescanAndWrite(db);
  setInterval(() => rescanAndWrite(db), RESCAN_INTERVAL_MS);

  const watcher = chokidar.watch(`${PROJECTS_BASE_PATH}/*/wf-ports.json`, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 2,
  });
  let debounceTimer = null;
  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => rescanAndWrite(db), 800);
  };
  watcher.on("add", trigger);
  watcher.on("change", trigger);
  watcher.on("unlink", trigger);
  console.log(`[projects] watching ${PROJECTS_BASE_PATH}/*/wf-ports.json`);

  return { rescan: () => rescanAndWrite(db) };
}

module.exports = { start, rescanAndWrite };
