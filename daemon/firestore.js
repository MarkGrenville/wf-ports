const path = require("path");
const fs = require("fs");
const os = require("os");
const admin = require("firebase-admin");

const DEFAULT_SA_PATH = path.join(os.homedir(), ".portio", "firebase-service-account.json");

let initialized = false;
let db = null;

function init() {
  if (initialized) return { admin, db };

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_SA_PATH;

  if (!fs.existsSync(credentialsPath)) {
    console.error("");
    console.error("============================================================");
    console.error("portio-daemon: Firebase service account not found.");
    console.error("");
    console.error("Expected file at:");
    console.error("  " + credentialsPath);
    console.error("");
    console.error("To fix:");
    console.error("  1. Open https://console.firebase.google.com/project/portio-ea1df/settings/serviceaccounts/adminsdk");
    console.error("  2. Click 'Generate new private key' and download the JSON.");
    console.error("  3. mkdir -p ~/.portio");
    console.error("     mv ~/Downloads/portio-ea1df-*.json ~/.portio/firebase-service-account.json");
    console.error("  4. pm2 restart portio-daemon");
    console.error("");
    console.error("Or set GOOGLE_APPLICATION_CREDENTIALS in the PM2 env to point elsewhere.");
    console.error("============================================================");
    console.error("");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  initialized = true;
  console.log(`[firestore] connected to project ${serviceAccount.project_id}`);
  return { admin, db };
}

module.exports = { init };
