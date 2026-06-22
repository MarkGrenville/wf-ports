const { killPort } = require("../../shared/lsof");
const pm2 = require("../../shared/pm2");
const applescript = require("../../shared/applescript");
const taskRunner = require("../../shared/task-runner");
const { rescanAndWrite } = require("../../pollers/projects");

async function handleKillPort(cmd) {
  const { port } = cmd.payload;
  if (!port) throw new Error("payload.port required");
  return await killPort(port);
}

async function handleKillPorts(cmd) {
  const { ports } = cmd.payload;
  if (!Array.isArray(ports)) throw new Error("payload.ports[] required");
  const results = [];
  for (const port of ports) results.push(await killPort(port));
  return { killed: results };
}

async function handlePm2Restart(cmd) {
  const { pm2Name } = cmd.payload;
  if (!pm2Name) throw new Error("payload.pm2Name required");
  await pm2.restart(pm2Name);
  return { restarted: pm2Name };
}

async function handlePm2Delete(cmd) {
  const { pm2Name } = cmd.payload;
  if (!pm2Name) throw new Error("payload.pm2Name required");
  await pm2.deleteByName(pm2Name);
  return { deleted: pm2Name };
}

async function handlePm2DeleteAll(cmd) {
  const { projectId } = cmd.payload;
  if (!projectId) throw new Error("payload.projectId required");
  const results = await pm2.deleteAllForProject(projectId);
  return { results };
}

async function handlePm2Logs(cmd) {
  const { pm2Name, lines } = cmd.payload;
  if (!pm2Name) throw new Error("payload.pm2Name required");
  return { logs: await pm2.readLogs(pm2Name, lines || 200) };
}

async function handleOpenFinder(cmd) {
  const { projectPath } = cmd.payload;
  if (!projectPath) throw new Error("payload.projectPath required");
  await applescript.openFinder(projectPath);
  return { opened: projectPath };
}

async function handleOpenTerminal(cmd) {
  const { projectPath } = cmd.payload;
  if (!projectPath) throw new Error("payload.projectPath required");
  const terminalApp = await applescript.openTerminalAt(projectPath);
  return { terminalApp };
}

async function handleWatchPort(cmd) {
  const { port, serviceName } = cmd.payload;
  if (!port) throw new Error("payload.port required");
  await applescript.watchPort(port, serviceName);
  return { watching: port };
}

async function handleFocusTerminal(cmd) {
  const { focusIdentifier, projectPath } = cmd.payload;
  if (!focusIdentifier) throw new Error("payload.focusIdentifier required");
  return await applescript.focusCursorWindow(focusIdentifier, projectPath);
}

async function handleMinimizeCursorWindows() {
  return await applescript.minimizeAllCursorWindows();
}

async function handlePm2LogsTerminal(cmd) {
  const { pm2Name, projectId, taskLabel } = cmd.payload;
  const name = pm2Name || (projectId && taskLabel ? taskRunner.createPM2Name(projectId, taskLabel) : null);
  if (!name) throw new Error("payload.pm2Name or projectId+taskLabel required");
  return await applescript.openPm2LogsTerminal(name);
}

async function handleExecuteTask(cmd) {
  const { task, projectPath, projectId, allTasks } = cmd.payload;
  if (!task || !projectPath || !projectId) {
    throw new Error("payload.task, projectPath, projectId required");
  }
  if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
    const tasks = allTasks || [];
    const dependent = taskRunner.resolveDependentTasks(task, tasks);
    if (dependent.length === 0) {
      throw new Error(`Compound task "${task.label}" has dependsOn but none of the referenced tasks were found`);
    }
    const results = [];
    for (const t of dependent) {
      results.push(await taskRunner.executeTask(t, projectPath, projectId));
    }
    return { compound: true, taskLabel: task.label, results };
  }
  return await taskRunner.executeTask(task, projectPath, projectId);
}

async function handleExecuteStartAllTasks(cmd) {
  const { projects } = cmd.payload;
  if (!Array.isArray(projects)) throw new Error("payload.projects[] required");
  const results = [];
  for (const p of projects) {
    if (!p.startAllTasks?.length) continue;
    const startAll = p.startAllTasks[0];
    const allTasks = p.vscodeTasksInfo?.tasks || [];
    const dependent = taskRunner.resolveDependentTasks(startAll, allTasks);
    for (const task of dependent) {
      results.push(await taskRunner.executeTask(task, p.projectPath, p.id));
    }
  }
  return { results };
}

async function handleRescanProjects(cmd, ctx) {
  await rescanAndWrite(ctx.state);
  return { rescanned: true };
}

const HANDLERS = {
  killPort: handleKillPort,
  killPorts: handleKillPorts,
  pm2Restart: handlePm2Restart,
  pm2Delete: handlePm2Delete,
  pm2DeleteAll: handlePm2DeleteAll,
  pm2Logs: handlePm2Logs,
  openFinder: handleOpenFinder,
  openTerminal: handleOpenTerminal,
  watchPort: handleWatchPort,
  focusTerminal: handleFocusTerminal,
  minimizeCursorWindows: handleMinimizeCursorWindows,
  pm2LogsTerminal: handlePm2LogsTerminal,
  executeTask: handleExecuteTask,
  executeStartAllTasks: handleExecuteStartAllTasks,
  rescanProjects: handleRescanProjects,
};

// Commands that change port/pm2 state. http.js re-snapshots after these so the
// UI gets the confirmed new state pushed almost immediately.
const MUTATING_TYPES = new Set([
  "killPort",
  "killPorts",
  "pm2Restart",
  "pm2Delete",
  "pm2DeleteAll",
  "executeTask",
  "executeStartAllTasks",
]);

module.exports = { HANDLERS, MUTATING_TYPES };
