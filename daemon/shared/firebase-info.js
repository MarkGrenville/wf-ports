const fs = require("fs").promises;
const path = require("path");
const { execWithTimeout } = require("./exec");

async function getFirebaseInfo(projectPath) {
  try {
    let firebaseConfigPath = path.join(projectPath, "firebase.json");

    try {
      await fs.access(firebaseConfigPath);
    } catch {
      const subdirs = ["frontend", "backend", "web", "client", "server", "app"];
      let found = false;
      for (const subdir of subdirs) {
        const candidate = path.join(projectPath, subdir, "firebase.json");
        try {
          await fs.access(candidate);
          firebaseConfigPath = candidate;
          found = true;
          break;
        } catch {}
      }
      if (!found) return null;
    }

    const firebaseInfo = {
      isFirebaseProject: true,
      currentProject: null,
      projectId: null,
      projectAlias: null,
      firebaseConfig: null,
      hasFirebaseRC: false,
      availableProjects: [],
      firebaseTools: { hasFirebaseCLI: false, version: null },
    };

    try {
      const version = await execWithTimeout("firebase --version", { cwd: projectPath }, 5000);
      firebaseInfo.firebaseTools.hasFirebaseCLI = true;
      firebaseInfo.firebaseTools.version = version;
    } catch {}

    try {
      const cfg = await fs.readFile(firebaseConfigPath, "utf8");
      firebaseInfo.firebaseConfig = JSON.parse(cfg);
    } catch {}

    const rcPath = path.join(projectPath, ".firebaserc");
    try {
      await fs.access(rcPath);
      firebaseInfo.hasFirebaseRC = true;
      const rc = JSON.parse(await fs.readFile(rcPath, "utf8"));
      if (rc.projects?.default) {
        firebaseInfo.currentProject = rc.projects.default;
        firebaseInfo.projectId = rc.projects.default;
      }
      if (rc.projects) {
        firebaseInfo.availableProjects = Object.keys(rc.projects).map((alias) => ({
          alias,
          projectId: rc.projects[alias],
        }));
      }
    } catch {}

    if (firebaseInfo.firebaseTools.hasFirebaseCLI && !firebaseInfo.projectId) {
      try {
        const useResult = await execWithTimeout("firebase use", { cwd: projectPath }, 5000);
        const m = useResult.match(/Active project:\s*([^\s]+)(?:\s+\(([^)]+)\))?/);
        if (m) {
          firebaseInfo.currentProject = m[1];
          firebaseInfo.projectId = m[1];
          if (m[2]) firebaseInfo.projectAlias = m[2];
        }
      } catch {}
    }

    return firebaseInfo;
  } catch {
    return null;
  }
}

module.exports = { getFirebaseInfo };
