const { execWithTimeout } = require("./exec");

// One atomic snapshot of every listening TCP port on the machine. Replaces the
// old per-port `lsof -ti:PORT` calls (N calls, each with a 3s timeout that, on
// timeout, falsely reported the port as closed -> the flashing on/off bug).
// `-F pcn` gives machine-readable field output: p=pid, c=command, n=name.
async function snapshotListeningPorts() {
  let raw;
  try {
    raw = await execWithTimeout(
      "lsof -nP -iTCP -sTCP:LISTEN -F pcn",
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 },
      4000,
    );
  } catch (err) {
    // code 1 with no matches is theoretically possible but normally there are
    // always listeners; treat any failure as "unknown" so the caller keeps the
    // last known state instead of blanking every port.
    if (err && err.code === 1 && typeof err.stdout === "string") {
      raw = err.stdout;
    } else {
      return null;
    }
  }
  if (raw == null) return null;

  const byPort = new Map(); // port (number) -> { pid, command }
  let pid = null;
  let command = null;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const tag = line[0];
    const rest = line.slice(1);
    if (tag === "p") {
      pid = parseInt(rest, 10) || null;
      command = null;
    } else if (tag === "c") {
      command = rest;
    } else if (tag === "n") {
      const idx = rest.lastIndexOf(":");
      if (idx === -1) continue;
      const port = parseInt(rest.slice(idx + 1), 10);
      if (!port) continue;
      if (!byPort.has(port)) byPort.set(port, { pid, command });
    }
  }
  return byPort;
}

async function killPort(port) {
  try {
    await execWithTimeout(
      `lsof -ti:${port} | xargs kill -9`,
      { encoding: "utf8" },
      5000,
    );
    return { port, killed: true };
  } catch (err) {
    return { port, killed: false, error: err.message };
  }
}

module.exports = { snapshotListeningPorts, killPort };
