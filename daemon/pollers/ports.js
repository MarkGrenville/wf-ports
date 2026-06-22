const { snapshotListeningPorts } = require("../shared/lsof");
const projectsPoller = require("./projects");

const TICK_MS = 1000;
let stateRef = null;
let inFlight = false;

async function tick() {
  if (inFlight || !stateRef) return;
  inFlight = true;
  try {
    const snapshot = await snapshotListeningPorts();
    // null = lsof failed/timed out: keep the last known liveStatus rather than
    // reporting everything closed. This is what kills the flashing on/off.
    if (snapshot === null) return;

    const projects = projectsPoller.getCurrentProjects();
    const liveStatus = [];
    for (const project of projects) {
      if (!Array.isArray(project.services) || project.services.length === 0) continue;
      const services = project.services.map((s) => {
        const hit = snapshot.get(Number(s.port));
        return {
          name: s.name,
          port: s.port,
          url: s.url ?? null,
          purpose: s.purpose ?? null,
          isRunning: !!hit,
          pid: hit?.pid ?? null,
          processName: hit?.command ?? null,
        };
      });
      liveStatus.push({ id: project.id, services });
    }
    stateRef.set("liveStatus", liveStatus);
  } catch (err) {
    console.error("[ports] tick failed:", err.message);
  } finally {
    inFlight = false;
  }
}

function start(state) {
  stateRef = state;
  setTimeout(tick, 500);
  setInterval(tick, TICK_MS);
  console.log(`[ports] polling every ${TICK_MS}ms`);
}

// Immediate re-snapshot, used right after a kill so the UI confirms instantly.
async function refresh() {
  await tick();
}

module.exports = { start, refresh };
