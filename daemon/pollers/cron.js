const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const PROJECTS_BASE_PATH =
  process.env.PROJECTS_BASE_PATH || path.join(os.homedir(), "Projects");
const CRON_CONFIG = "cron.json";
const CONFIG_DIR = ".webfootprint";
const TICK_MS = 10_000;
const LOG_TAIL_LINES = 80;

let stateRef = null;
let timer = null;
let lastJson = "";

function expandHome(p) {
  if (p && p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function discoverCronConfigs() {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(PROJECTS_BASE_PATH, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const cronPath = path.join(
      PROJECTS_BASE_PATH,
      entry.name,
      CONFIG_DIR,
      CRON_CONFIG,
    );
    try {
      fs.accessSync(cronPath);
      const raw = fs.readFileSync(cronPath, "utf8");
      const cfg = JSON.parse(raw);
      if (Array.isArray(cfg.jobs)) {
        results.push({
          projectDir: path.join(PROJECTS_BASE_PATH, entry.name),
          projectName: entry.name,
          jobs: cfg.jobs,
        });
      }
    } catch {
      // no cron.json or invalid
    }
  }
  return results;
}

function getLaunchctlStatus() {
  const loaded = new Map();
  try {
    const out = execSync("launchctl list", {
      encoding: "utf8",
      timeout: 5000,
    });
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parts[0] === "-" ? null : Number(parts[0]);
        const lastExit = parts[1] === "-" ? null : Number(parts[1]);
        const label = parts[2];
        loaded.set(label, { pid, lastExit, loaded: true });
      }
    }
  } catch (err) {
    console.error("[cron] launchctl list failed:", err.message);
  }
  return loaded;
}

function parseScheduleFromPlist(plistPath) {
  const resolved = expandHome(plistPath);
  try {
    const out = execSync(
      `plutil -convert json -o - "${resolved}"`,
      { encoding: "utf8", timeout: 5000 },
    );
    const plist = JSON.parse(out);
    const interval = plist.StartCalendarInterval;
    if (!interval) return null;

    if (Array.isArray(interval)) {
      return interval.map(formatCalendarInterval).join(", ");
    }
    return formatCalendarInterval(interval);
  } catch {
    return null;
  }
}

function formatCalendarInterval(dict) {
  const parts = [];
  if (dict.Weekday != null) {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    parts.push(days[dict.Weekday] || `day ${dict.Weekday}`);
  }
  if (dict.Hour != null) {
    parts.push(`${String(dict.Hour).padStart(2, "0")}:${String(dict.Minute ?? 0).padStart(2, "0")}`);
  } else if (dict.Minute != null) {
    parts.push(`every hour at :${String(dict.Minute).padStart(2, "0")}`);
  }
  return parts.join(" ") || "custom schedule";
}

function checkLockFile(projectDir, lockFile) {
  if (!lockFile) return { locked: false, lockAge: null };
  const lockPath = path.join(projectDir, lockFile);
  try {
    const stat = fs.statSync(lockPath);
    const age = Math.floor((Date.now() - stat.mtimeMs) / 1000);
    let pid = null;
    try {
      const content = fs.readFileSync(lockPath, "utf8").trim();
      const parsed = Number(content);
      if (!isNaN(parsed) && parsed > 0) pid = parsed;
    } catch {}
    return { locked: true, lockAge: age, lockPid: pid };
  } catch {
    return { locked: false, lockAge: null, lockPid: null };
  }
}

function parseRecentRuns(projectDir, logFile) {
  if (!logFile) return [];
  const logPath = path.join(projectDir, logFile);
  let lines;
  try {
    const content = fs.readFileSync(logPath, "utf8");
    lines = content.split("\n");
    lines = lines.slice(-LOG_TAIL_LINES);
  } catch {
    return [];
  }

  const runs = [];
  let currentRun = null;

  for (const line of lines) {
    const startMatch = line.match(
      /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]\s+Starting/,
    );
    if (startMatch) {
      if (currentRun) {
        currentRun.status = "unknown";
        runs.push(currentRun);
      }
      currentRun = {
        startedAt: startMatch[1],
        endedAt: null,
        exitCode: null,
        status: "running",
      };
      continue;
    }

    const endMatch = line.match(
      /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]\s+Run finished with exit code (\d+)/,
    );
    if (endMatch && currentRun) {
      currentRun.endedAt = endMatch[1];
      currentRun.exitCode = Number(endMatch[2]);
      currentRun.status = currentRun.exitCode === 0 ? "success" : "failed";
      if (currentRun.startedAt && currentRun.endedAt) {
        currentRun.durationMs =
          new Date(currentRun.endedAt).getTime() -
          new Date(currentRun.startedAt).getTime();
      }
      runs.push(currentRun);
      currentRun = null;
      continue;
    }

    const skipMatch = line.match(
      /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]\s+Skipping/,
    );
    if (skipMatch) {
      runs.push({
        startedAt: skipMatch[1],
        endedAt: skipMatch[1],
        exitCode: null,
        status: "skipped",
        durationMs: 0,
      });
    }
  }

  if (currentRun) {
    runs.push(currentRun);
  }

  return runs.slice(-20).reverse();
}

function getLogTail(projectDir, logFile, lineCount = 30) {
  if (!logFile) return null;
  const logPath = path.join(projectDir, logFile);
  try {
    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.split("\n");
    return lines.slice(-lineCount).join("\n");
  } catch {
    return null;
  }
}

function buildJobState(projectDir, projectName, jobConfig, launchctlMap) {
  const launchd = launchctlMap.get(jobConfig.label) || {
    pid: null,
    lastExit: null,
    loaded: false,
  };
  const lock = checkLockFile(projectDir, jobConfig.lockFile);
  const recentRuns = parseRecentRuns(projectDir, jobConfig.logFile);
  const schedule = jobConfig.plistPath
    ? parseScheduleFromPlist(jobConfig.plistPath)
    : null;

  const isRunning = lock.locked && (lock.lockAge ?? 0) < 7200;
  const latestRun = recentRuns[0] || null;

  return {
    id: jobConfig.label,
    projectId: projectName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    projectName,
    projectDir,
    name: jobConfig.name || jobConfig.label,
    description: jobConfig.description || null,
    label: jobConfig.label,
    plistPath: jobConfig.plistPath
      ? expandHome(jobConfig.plistPath)
      : null,
    schedule: schedule || "unknown",
    loaded: launchd.loaded,
    launchdPid: launchd.pid,
    launchdLastExit: launchd.lastExit,
    isRunning,
    lockAge: lock.locked ? lock.lockAge : null,
    lockPid: lock.lockPid || null,
    logFile: jobConfig.logFile
      ? path.join(projectDir, jobConfig.logFile)
      : null,
    latestRun,
    recentRuns,
    lastPolled: new Date().toISOString(),
  };
}

function tick() {
  try {
    const configs = discoverCronConfigs();
    const launchctlMap = getLaunchctlStatus();

    const jobs = [];
    for (const cfg of configs) {
      for (const jobDef of cfg.jobs) {
        jobs.push(
          buildJobState(cfg.projectDir, cfg.projectName, jobDef, launchctlMap),
        );
      }
    }

    const json = JSON.stringify(jobs);
    if (json !== lastJson) {
      lastJson = json;
      if (stateRef) stateRef.set("cronJobs", jobs);
    }
  } catch (err) {
    console.error("[cron] tick failed:", err.message);
  }
}

function start(state) {
  stateRef = state;
  console.log(
    `[cron] polling scheduled jobs every ${TICK_MS / 1000}s from ${PROJECTS_BASE_PATH}/*/${CONFIG_DIR}/${CRON_CONFIG}`,
  );
  setTimeout(tick, 2000);
  timer = setInterval(tick, TICK_MS);
}

function refresh() {
  tick();
}

module.exports = { start, refresh };
