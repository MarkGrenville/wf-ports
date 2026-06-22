const { listProcesses } = require("../shared/pm2");

const TICK_MS = 2000;
let stateRef = null;
let inFlight = false;

function projectIdFor(name) {
  const idx = name.indexOf("-");
  return idx === -1 ? name : name.slice(0, idx);
}

async function tick() {
  if (inFlight || !stateRef) return;
  inFlight = true;
  try {
    const procs = await listProcesses();
    // null = pm2 jlist failed: keep last known state.
    if (procs === null) return;

    const list = procs.map((p) => ({
      name: p.name,
      pm_id: p.pm_id,
      status: p.status,
      pid: p.pid,
      restarts: p.restarts,
      uptime: p.uptime,
      execPath: p.execPath,
      cwd: p.cwd,
      projectId: projectIdFor(p.name),
    }));
    // The hub diffs before broadcasting, so identical ticks are free. CPU/memory
    // are intentionally excluded so they don't churn the diff every tick.
    stateRef.set("pm2", list);
  } catch (err) {
    console.error("[pm2] tick failed:", err.message);
  } finally {
    inFlight = false;
  }
}

function start(state) {
  stateRef = state;
  setTimeout(tick, 800);
  setInterval(tick, TICK_MS);
  console.log(`[pm2] polling every ${TICK_MS}ms`);
}

async function refresh() {
  await tick();
}

module.exports = { start, refresh };
