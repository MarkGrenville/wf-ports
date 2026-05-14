const { execWithTimeout } = require("./exec");

async function listProcesses() {
  try {
    const raw = await execWithTimeout("pm2 jlist --no-color", {}, 30000);
    if (!raw) return null;
    const cleaned = raw.replace(/^[^\[]*/, "").replace(/[^\]]*$/, "");
    const arr = JSON.parse(cleaned);
    return arr.map((p) => ({
      pm_id: p.pm_id,
      name: p.name,
      status: p.pm2_env?.status || "unknown",
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      pid: p.pid ?? null,
      restarts: p.pm2_env?.restart_time ?? 0,
      uptime: p.pm2_env?.pm_uptime ?? null,
      execPath: p.pm2_env?.pm_exec_path ?? null,
      cwd: p.pm2_env?.pm_cwd ?? null,
    }));
  } catch (err) {
    console.error("[pm2] jlist failed:", err.message);
    return null;
  }
}

async function restart(name) {
  return execWithTimeout(`pm2 restart ${JSON.stringify(name)}`, {}, 15000);
}

async function deleteByName(name) {
  return execWithTimeout(`pm2 delete ${JSON.stringify(name)}`, {}, 10000);
}

async function deleteAllForProject(projectId) {
  const procs = (await listProcesses()) || [];
  const matching = procs.filter((p) => p.name.startsWith(`${projectId}-`) || p.name === projectId);
  const results = [];
  for (const p of matching) {
    try {
      await deleteByName(p.name);
      results.push({ name: p.name, deleted: true });
    } catch (err) {
      results.push({ name: p.name, deleted: false, error: err.message });
    }
  }
  return results;
}

async function readLogs(name, lines = 200) {
  try {
    return await execWithTimeout(
      `pm2 logs ${JSON.stringify(name)} --lines ${lines} --nostream`,
      {},
      8000,
    );
  } catch (err) {
    return `pm2 logs failed: ${err.message}`;
  }
}

module.exports = { listProcesses, restart, deleteByName, deleteAllForProject, readLogs };
