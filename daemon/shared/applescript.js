const { spawn } = require("child_process");
const { execWithTimeout } = require("./exec");

function run(cmd, timeoutMs = 8000) {
  return execWithTimeout(cmd, {}, timeoutMs);
}

function escapeForAppleScript(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runOsascript(script, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`osascript timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`osascript exited ${code}: ${stderr.trim()}`));
    });

    child.stdin.end(script);
  });
}

async function openFinder(projectPath) {
  return run(`open ${JSON.stringify(projectPath)}`);
}

async function isItermRunning() {
  try {
    const out = await run(
      `osascript -e 'tell application "System Events" to (name of processes) contains "iTerm2"'`,
      4000,
    );
    return out.trim() === "true";
  } catch {
    return false;
  }
}

async function isItermInstalled() {
  try {
    const out = await run(
      `osascript -e 'tell application "System Events" to exists application "iTerm2"'`,
      4000,
    );
    return out.trim() === "true";
  } catch {
    return false;
  }
}

async function openTerminalAt(projectPath) {
  const cwd = escapeForAppleScript(projectPath);
  const itermRunning = await isItermRunning();
  const itermInstalled = itermRunning ? true : await isItermInstalled();

  if (itermRunning || itermInstalled) {
    const script = `tell application "iTerm2"
      try
        ${itermRunning ? "" : "activate"}
        create window with default profile
        tell current session of current window
          write text "cd \\"${cwd}\\""
        end tell
        activate
      on error errorMessage
        error errorMessage
      end try
    end tell`;
    await runOsascript(script, 10000);
    return "iTerm2";
  }

  const script = `tell application "Terminal"
    try
      activate
      do script "cd \\"${cwd}\\""
    on error errorMessage
      error errorMessage
    end try
  end tell`;
  await runOsascript(script, 10000);
  return "Terminal";
}

async function watchPort(port, serviceName) {
  const safeName = escapeForAppleScript(serviceName || "");
  const script = `tell application "Terminal"
    do script "echo \\"Watching port ${port} for ${safeName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && while true; do echo \\"$(date): Processes on port ${port}:\\"; lsof -i :${port} 2>/dev/null || echo \\"No processes found on port ${port}\\"; echo \\"---\\"; sleep 2; done"
    activate
  end tell`;
  return runOsascript(script, 8000);
}

async function focusCursorWindow(focusIdentifier, projectPath) {
  const safeIdent = String(focusIdentifier).replace(/"/g, '\\"');
  let windowId = "";
  try {
    windowId = (await run(
      `yabai -m query --windows | jq '.[] | select(.app == "Cursor" and (.title | contains("${safeIdent}"))) | .id'`,
      6000,
    )).trim();
  } catch {}

  if (windowId) {
    await run(`yabai -m window --focus "${windowId}"`, 4000);
    return { action: "focused", windowId };
  }
  if (projectPath) {
    await run(`cursor ${JSON.stringify(projectPath)}`, 8000);
    return { action: "opened" };
  }
  return { action: "not_found" };
}

async function minimizeAllCursorWindows() {
  let ids = [];
  try {
    const out = await run(
      `yabai -m query --windows | jq '.[] | select(.app == "Cursor") | .id'`,
      6000,
    );
    ids = out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {}
  if (ids.length === 0) return { minimized: 0, failed: 0, total: 0 };

  let minimized = 0;
  let failed = 0;
  await Promise.all(
    ids.map(async (id) => {
      try {
        await run(`yabai -m window ${id} --minimize`, 4000);
        minimized++;
      } catch {
        failed++;
      }
    }),
  );
  return { minimized, failed, total: ids.length };
}

async function openPm2LogsTerminal(processName) {
  const safeName = escapeForAppleScript(processName);
  const itermRunning = await isItermRunning();
  const itermInstalled = itermRunning ? true : await isItermInstalled();

  if (itermRunning || itermInstalled) {
    const script = `tell application "iTerm2"
      try
        create window with default profile
        tell current session of current window
          write text "echo \\"PM2 Logs for ${safeName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && pm2 logs \\"${safeName}\\" --lines 100"
        end tell
        tell current window
          set fullScreen to true
        end tell
        activate
      on error errorMessage
        error errorMessage
      end try
    end tell`;
    try {
      await runOsascript(script, 10000);
      return { terminalApp: "iTerm2" };
    } catch (err) {
      console.error("[applescript] iTerm pm2 logs failed:", err.message);
    }
  }

  const fallback = `tell application "Terminal"
    try
      do script "echo \\"PM2 Logs for ${safeName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && pm2 logs \\"${safeName}\\" --lines 100"
      activate
    on error errorMessage
      error errorMessage
    end try
  end tell`;
  await runOsascript(fallback, 10000);
  return { terminalApp: "Terminal" };
}

module.exports = {
  openFinder,
  openTerminalAt,
  watchPort,
  focusCursorWindow,
  minimizeAllCursorWindows,
  openPm2LogsTerminal,
};
