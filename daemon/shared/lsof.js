const { execWithTimeout } = require("./exec");

async function checkPort(port) {
  try {
    const lsofResult = await execWithTimeout(
      `lsof -ti:${port}`,
      { encoding: "utf8" },
      3000,
    );
    const pid = lsofResult ? parseInt(lsofResult.split("\n")[0], 10) : null;
    if (!pid) return { port, isRunning: false };

    let processName = null;
    try {
      processName = await execWithTimeout(
        `ps -p ${pid} -o comm=`,
        { encoding: "utf8" },
        2000,
      );
    } catch {
      processName = null;
    }
    return { port, isRunning: true, pid, processName };
  } catch (err) {
    if (err && err.code === 1) return { port, isRunning: false };
    return { port, isRunning: false, error: err.message };
  }
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

module.exports = { checkPort, killPort };
