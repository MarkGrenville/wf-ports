const fs = require("fs");
const path = require("path");
const { execWithTimeout } = require("./exec");

function createPM2Name(projectId, taskLabel) {
  const cleanProjectId = projectId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const cleanTaskLabel = taskLabel.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${cleanProjectId}-${cleanTaskLabel}`;
}

function resolveDependentTasks(startAllTask, allTasks) {
  if (!Array.isArray(startAllTask?.dependsOn)) return [];
  const seen = new Set();
  const out = [];
  for (const label of startAllTask.dependsOn) {
    if (seen.has(label)) continue;
    const task = allTasks.find((t) => t.label === label);
    if (task) {
      out.push(task);
      seen.add(label);
    }
  }
  return out;
}

function extractCommand(task) {
  let command = "";
  if (task.command) {
    command = task.command;
    if (Array.isArray(task.args)) command += " " + task.args.join(" ");
  } else if (task.execution?.command) {
    command = task.execution.command;
    if (Array.isArray(task.execution.args)) command += " " + task.execution.args.join(" ");
  }
  return command;
}

async function executeTask(task, projectPath, projectId) {
  const command = extractCommand(task);
  if (!command) {
    return { taskLabel: task.label, success: false, error: "No executable command found in task" };
  }

  const isPM2Command = command.trim().startsWith("pm2 start");
  let pm2Name;
  let executionCommand;

  if (isPM2Command) {
    const m = command.match(/--name\s+["']?([^"'\s]+)["']?/);
    pm2Name = m ? m[1] : createPM2Name(projectId, task.label);
    executionCommand = command;
  } else {
    pm2Name = createPM2Name(projectId, task.label);
  }

  try {
    await execWithTimeout(`pm2 delete ${JSON.stringify(pm2Name)}`, { cwd: projectPath }, 5000);
  } catch {}

  try {
    if (isPM2Command) {
      const out = await execWithTimeout(executionCommand, { cwd: projectPath }, 30000);
      return { taskLabel: task.label, pm2Name, success: true, command, pm2Command: executionCommand, stdout: out };
    }
    const scriptPath = path.join(projectPath, `pm2-${pm2Name}.sh`);
    const scriptContent = `#!/bin/bash\ncd "${projectPath}"\n${command}\n`;
    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, 0o755);
    const pm2Command = `pm2 start ${JSON.stringify(scriptPath)} --name ${JSON.stringify(pm2Name)} --cwd ${JSON.stringify(projectPath)}`;
    try {
      const out = await execWithTimeout(pm2Command, { cwd: projectPath }, 30000);
      setTimeout(() => { try { fs.unlinkSync(scriptPath); } catch {} }, 2000);
      return { taskLabel: task.label, pm2Name, success: true, command, pm2Command, stdout: out };
    } catch (err) {
      setTimeout(() => { try { fs.unlinkSync(scriptPath); } catch {} }, 2000);
      return { taskLabel: task.label, pm2Name, success: false, error: err.message, command, pm2Command };
    }
  } catch (err) {
    return { taskLabel: task.label, pm2Name, success: false, error: err.message, command };
  }
}

module.exports = { createPM2Name, resolveDependentTasks, executeTask };
