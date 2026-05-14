const { spawn } = require("child_process");
const firestore = require("./firestore");
const projectsPoller = require("./pollers/projects");
const portsPoller = require("./pollers/ports");
const pm2Poller = require("./pollers/pm2");
const gitPoller = require("./pollers/git");
const commandListener = require("./commands/listener");
const commandSweep = require("./commands/sweep");

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
  const { admin, db } = firestore.init();

  startCaffeinate();
  projectsPoller.start(db);
  setTimeout(() => portsPoller.start(db), 3000);
  pm2Poller.start(db);
  setTimeout(() => gitPoller.start(db), 6000);
  commandListener.start(db, admin);
  commandSweep.start(db);

  console.log("[daemon] ready");
}

main().catch((err) => {
  console.error("[daemon] fatal:", err);
  process.exit(1);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
