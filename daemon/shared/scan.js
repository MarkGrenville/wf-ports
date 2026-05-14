const fs = require("fs").promises;
const path = require("path");
const { getGitInfo } = require("./git");
const { getFirebaseInfo } = require("./firebase-info");

const CONFIG_FILE_NAME = "wf-ports.json";
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".idea"]);

async function scanVSCodeTasks(projectPath) {
  const tasksPath = path.join(projectPath, ".vscode", "tasks.json");
  try {
    await fs.access(tasksPath);
    const raw = await fs.readFile(tasksPath, "utf8");
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const cfg = JSON.parse(cleaned);
    return {
      tasksPath,
      tasks: cfg.tasks || [],
      version: cfg.version || "2.0.0",
    };
  } catch {
    return null;
  }
}

function findStartAllTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((task) => {
    if (!task.label) return false;
    const label = task.label.toLowerCase();
    return (
      label.includes("start all") ||
      label.includes("start everything") ||
      (label.startsWith("a.") &&
        (label.includes("start all") ||
          label.includes("start everything") ||
          /a\.\s*start\s+everything/i.test(task.label) ||
          /a\.\s*start\s+all/i.test(task.label)))
    );
  });
}

async function findConfigFiles(dirPath, maxDepth = 2, currentDepth = 0) {
  const results = [];
  if (currentDepth >= maxDepth) return results;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  const configPath = path.join(dirPath, CONFIG_FILE_NAME);
  try {
    await fs.access(configPath);
    const [vscodeTasksInfo, gitInfo, firebaseInfo] = await Promise.all([
      scanVSCodeTasks(dirPath),
      getGitInfo(dirPath),
      getFirebaseInfo(dirPath),
    ]);
    results.push({
      configPath,
      projectPath: dirPath,
      directoryName: path.basename(dirPath),
      pathExists: true,
      vscodeTasksInfo,
      gitInfo,
      firebaseInfo,
    });
  } catch {}

  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
      const sub = path.join(dirPath, entry.name);
      const subResults = await findConfigFiles(sub, maxDepth, currentDepth + 1);
      results.push(...subResults);
    }
  }
  return results;
}

const FAVICON_MAX_BYTES = 64 * 1024;

async function readFaviconBase64(faviconPath) {
  if (!faviconPath) return null;
  try {
    const stat = await fs.stat(faviconPath);
    if (!stat.isFile()) return null;
    if (stat.size > FAVICON_MAX_BYTES) return null;
    const buf = await fs.readFile(faviconPath);
    const ext = path.extname(faviconPath).toLowerCase().slice(1);
    const mime = {
      png: "image/png",
      svg: "image/svg+xml",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      ico: "image/x-icon",
      webp: "image/webp",
      gif: "image/gif",
    }[ext] || "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function scanAllProjects(basePath) {
  const configs = await findConfigFiles(basePath);
  const projects = [];
  for (const c of configs) {
    try {
      const cfg = JSON.parse(await fs.readFile(c.configPath, "utf8"));
      const projectId = cfg.id || c.directoryName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const startAllTasks = c.vscodeTasksInfo ? findStartAllTasks(c.vscodeTasksInfo.tasks) : [];
      const faviconDataUrl = cfg.faviconPath ? await readFaviconBase64(cfg.faviconPath) : null;

      projects.push({
        ...cfg,
        id: projectId,
        projectPath: c.projectPath,
        configPath: c.configPath,
        directoryName: c.directoryName,
        pathExists: c.pathExists,
        vscodeTasksInfo: c.vscodeTasksInfo,
        startAllTasks,
        hasStartAllTasks: startAllTasks.length > 0,
        gitInfo: c.gitInfo,
        firebaseInfo: c.firebaseInfo,
        faviconDataUrl,
      });
    } catch (err) {
      console.error(`[scan] invalid wf-ports.json at ${c.configPath}: ${err.message}`);
    }
  }
  return projects;
}

module.exports = {
  CONFIG_FILE_NAME,
  scanAllProjects,
  findConfigFiles,
  findStartAllTasks,
  scanVSCodeTasks,
  readFaviconBase64,
};
