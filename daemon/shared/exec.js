const { exec } = require("child_process");

function execWithTimeout(command, options = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = exec(command, options, (error, stdout) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);
  });
}

module.exports = { execWithTimeout };
