const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { killPort } = require("../../shared/lsof");
const pm2 = require("../../shared/pm2");
const applescript = require("../../shared/applescript");
const taskRunner = require("../../shared/task-runner");
const { rescanAndWrite, patchProject } = require("../../pollers/projects");

const ARCHIVE_DIR = "/Users/markgrenville/Archived-Projects";

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

async function handleArchiveProject(cmd, ctx) {
  const { projectPath, projectId } = cmd.payload;
  if (!projectPath) throw new Error("payload.projectPath required");
  if (!fs.existsSync(projectPath)) throw new Error(`Project path not found: ${projectPath}`);

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  const folderName = path.basename(projectPath);
  let dest = path.join(ARCHIVE_DIR, folderName);

  // Avoid clobbering an existing archive with the same name
  if (fs.existsSync(dest)) {
    dest = `${dest}-${Date.now()}`;
  }

  fs.renameSync(projectPath, dest);

  // Rescan so the project disappears from the UI immediately
  await rescanAndWrite(ctx.state);
  return { archived: true, from: projectPath, to: dest };
}

async function handleToggleServiceVisibility(cmd) {
  const { configPath, port, projectId } = cmd.payload;
  if (!configPath) throw new Error("payload.configPath required");
  if (port == null) throw new Error("payload.port required");
  if (!projectId) throw new Error("payload.projectId required");

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);
  const hidden = Array.isArray(cfg.hiddenServices) ? cfg.hiddenServices : [];

  if (hidden.includes(port)) {
    cfg.hiddenServices = hidden.filter((p) => p !== port);
  } else {
    cfg.hiddenServices = [...hidden, port];
  }

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");

  patchProject(projectId, { hiddenServices: cfg.hiddenServices });
  return { hiddenServices: cfg.hiddenServices };
}

async function handleRescanProjects(cmd, ctx) {
  await rescanAndWrite(ctx.state);
  return { rescanned: true };
}

async function handlePauseCronJob(cmd) {
  const { plistPath } = cmd.payload;
  if (!plistPath) throw new Error("payload.plistPath required");
  if (!fs.existsSync(plistPath)) throw new Error(`Plist not found: ${plistPath}`);
  try {
    execSync(`launchctl unload "${plistPath}"`, { encoding: "utf8", timeout: 10_000 });
  } catch (err) {
    if (err.stderr && err.stderr.includes("Could not find specified service")) {
      return { paused: true, alreadyUnloaded: true };
    }
    throw err;
  }
  return { paused: true };
}

async function handleResumeCronJob(cmd) {
  const { plistPath } = cmd.payload;
  if (!plistPath) throw new Error("payload.plistPath required");
  if (!fs.existsSync(plistPath)) throw new Error(`Plist not found: ${plistPath}`);
  try {
    execSync(`launchctl load "${plistPath}"`, { encoding: "utf8", timeout: 10_000 });
  } catch (err) {
    if (err.stderr && err.stderr.includes("service already loaded")) {
      return { resumed: true, alreadyLoaded: true };
    }
    throw err;
  }
  return { resumed: true };
}

async function handleCronJobLogs(cmd) {
  const { logFile, lines } = cmd.payload;
  if (!logFile) throw new Error("payload.logFile required");
  const lineCount = lines || 100;
  try {
    const content = fs.readFileSync(logFile, "utf8");
    const allLines = content.split("\n");
    return { logs: allLines.slice(-lineCount).join("\n") };
  } catch (err) {
    throw new Error(`Cannot read log file: ${err.message}`);
  }
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
  archiveProject: handleArchiveProject,
  toggleServiceVisibility: handleToggleServiceVisibility,
  pauseCronJob: handlePauseCronJob,
  resumeCronJob: handleResumeCronJob,
  cronJobLogs: handleCronJobLogs,
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
  "archiveProject",
]);

const CRON_MUTATING_TYPES = new Set([
  "pauseCronJob",
  "resumeCronJob",
]);

module.exports = { HANDLERS, MUTATING_TYPES, CRON_MUTATING_TYPES };
