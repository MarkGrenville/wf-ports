const { spawn } = require("child_process");
const state = require("./state");
const http = require("./http");
const projectsPoller = require("./pollers/projects");
const portsPoller = require("./pollers/ports");
const pm2Poller = require("./pollers/pm2");
const gitPoller = require("./pollers/git");
const ciPoller = require("./pollers/ci");
const cronPoller = require("./pollers/cron");

let caffeinateProcess = null;

function startCaffeinate() {
  if (process.env.PORTIO_DISABLE_CAFFEINATE === "1") {
    console.log("[daemon] caffeinate disabled by env");
    return;
  }
  try {
    caffeinateProcess = spawn("caffeinate", ["-dimsu", "-w", String(process.pid)], {
      detached: true,
      stdio: "ignore",
    });
    caffeinateProcess.unref();
    console.log(`[daemon] caffeinate started for pid ${process.pid}`);
  } catch (err) {
    console.error("[daemon] could not start caffeinate:", err.message);
  }
}

async function main() {
  console.log("[daemon] starting portio-daemon");

  startCaffeinate();

  const refreshers = {
    ports: () => portsPoller.refresh(),
    pm2: () => pm2Poller.refresh(),
    cron: () => cronPoller.refresh(),
  };
  http.start(state, refreshers, {
    getProjects: () => projectsPoller.getCurrentProjects(),
  });

  projectsPoller.start(state);
  portsPoller.start(state);
  pm2Poller.start(state);
  gitPoller.start();
  ciPoller.start(state);
  cronPoller.start(state);

  console.log("[daemon] ready");
}

main().catch((err) => {
  console.error("[daemon] fatal:", err);
  process.exit(1);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
