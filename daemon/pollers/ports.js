const { checkPort } = require("../shared/lsof");

const TICK_MS = 10_000;
const lastWritten = new Map();

function statusKey(services) {
  return services
    .map((s) => `${s.port}:${s.isRunning ? s.pid || "1" : "0"}`)
    .sort()
    .join("|");
}

async function checkOneProject(db, project) {
  if (!Array.isArray(project.services) || project.services.length === 0) {
    return;
  }
  const portChecks = await Promise.all(
    project.services.map((s) =>
      checkPort(s.port).then((result) => ({ ...s, ...result })),
    ),
  );
  const services = portChecks.map((s) => ({
    name: s.name,
    port: s.port,
    url: s.url,
    purpose: s.purpose,
    isRunning: !!s.isRunning,
    pid: s.pid ?? null,
    processName: s.processName ?? null,
  }));

  const key = statusKey(services);
  if (lastWritten.get(project.id) === key) return;
  lastWritten.set(project.id, key);

  await db
    .collection("liveStatus")
    .doc(project.id)
    .set({ services, lastChecked: new Date() });
}

let inFlight = false;
async function tick(db) {
  if (inFlight) return;
  inFlight = true;
  try {
    const snap = await db.collection("projects").get();
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await Promise.all(projects.map((p) => checkOneProject(db, p).catch(() => {})));
  } catch (err) {
    console.error("[ports] tick failed:", err.message);
  } finally {
    inFlight = false;
  }
}

function start(db) {
  setTimeout(() => tick(db), 2000);
  setInterval(() => tick(db), TICK_MS);
  console.log(`[ports] polling every ${TICK_MS}ms`);
}

module.exports = { start };
