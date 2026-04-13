const express = require("express");
const { exec } = require("child_process");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const PORT = 3851;

// Helper function to execute commands with timeout (kills process on timeout)
const execWithTimeout = (command, options = {}, timeoutMs = 5000) => {
  return new Promise((resolve, reject) => {
    const child = exec(command, options, (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);
  });
};

const os = require("os");
const PROJECTS_BASE_PATH =
  process.env.PROJECTS_BASE_PATH || path.join(os.homedir(), "Projects");
const CONFIG_FILE_NAME = "wf-ports.json";
// Store icons outside public folder to avoid React hot-reload triggering
const PROJECT_ICONS_DIR = path.join(__dirname, "project-icons");
// Store docs outside public folder to avoid React hot-reload triggering
const DOCS_FILE_PATH = path.join(__dirname, "portio-docs.md");
// Store cached projects for Alfred workflow
const PROJECTS_CACHE_PATH = path.join(__dirname, "projects-cache.json");

// Middleware
app.use(cors());
app.use(express.json());

// Serve project icons from non-public folder (to avoid React hot-reload)
app.use(
  "/project-icons",
  express.static(path.join(__dirname, "project-icons"))
);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Port killer service is running" });
});

// Get cached projects endpoint (for Alfred workflow)
app.get("/api/projects", async (req, res) => {
  try {
    // Try to read from cache first
    try {
      const cacheContent = await fs.readFile(PROJECTS_CACHE_PATH, "utf8");
      const cachedData = JSON.parse(cacheContent);
      console.log(`Returning ${cachedData.projects.length} cached projects`);
      return res.json(cachedData);
    } catch (cacheError) {
      // Cache doesn't exist or is invalid, scan projects
      console.log("Projects cache not found, scanning...");
    }

    // If no cache, do a quick scan
    const configFiles = await findConfigFiles(PROJECTS_BASE_PATH);
    const projects = [];

    for (const {
      configPath,
      projectPath,
      directoryName,
      pathExists,
      vscodeTasksInfo,
      gitInfo,
      firebaseInfo,
    } of configFiles) {
      try {
        const configContent = await fs.readFile(configPath, "utf8");
        const projectConfig = JSON.parse(configContent);

        const projectId =
          projectConfig.id ||
          directoryName.toLowerCase().replace(/[^a-z0-9]/g, "-");

        const startAllTasks = vscodeTasksInfo
          ? findStartAllTasks(vscodeTasksInfo.tasks)
          : [];

        const project = {
          ...projectConfig,
          id: projectId,
          projectPath: projectPath,
          configPath: configPath,
          directoryName: directoryName,
          pathExists: pathExists,
          vscodeTasksInfo: vscodeTasksInfo,
          startAllTasks: startAllTasks,
          hasStartAllTasks: startAllTasks.length > 0,
          gitInfo: gitInfo,
          firebaseInfo: firebaseInfo,
        };

        projects.push(project);
      } catch (error) {
        console.log(`Invalid wf-ports.json at ${configPath}: ${error.message}`);
      }
    }

    // Cache the results
    const responseData = { projects, cachedAt: new Date().toISOString() };
    await fs.writeFile(PROJECTS_CACHE_PATH, JSON.stringify(responseData, null, 2));

    res.json(responseData);
  } catch (error) {
    console.error("Error getting projects:", error);
    res.status(500).json({
      error: "Failed to get projects",
      details: error.message,
    });
  }
});

// Get documentation content
app.get("/api/docs", async (req, res) => {
  try {
    const content = await fs.readFile(DOCS_FILE_PATH, "utf8");
    res.json({ success: true, content });
  } catch (error) {
    if (error.code === "ENOENT") {
      res.json({
        success: false,
        content:
          '# Documentation Not Generated Yet\n\nPlease click "Rescan Projects" to generate the documentation.',
        error: "File not found",
      });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// Serve local files (for favicons and other project assets)
app.get("/api/serve-file", async (req, res) => {
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: "File path is required" });
  }

  // Security check: only allow files within the Projects directory
  if (!filePath.startsWith(PROJECTS_BASE_PATH + "/")) {
    return res.status(403).json({
      error: "Access denied - file must be within Projects directory",
    });
  }

  try {
    // Check if file exists
    await fs.access(filePath);

    // Determine content type based on extension
    const ext = filePath.toLowerCase().split(".").pop();
    const contentTypes = {
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      ico: "image/x-icon",
      gif: "image/gif",
      webp: "image/webp",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    // Read and send the file
    const fileContent = await fs.readFile(filePath);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.send(fileContent);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.status(404).json({ error: "File not found", path: filePath });
    } else {
      console.error("Error serving file:", error);
      res
        .status(500)
        .json({ error: "Failed to serve file", details: error.message });
    }
  }
});

// Kill ports endpoint
app.post("/api/kill-ports", async (req, res) => {
  const { projectId, ports } = req.body;

  if (!projectId || !ports || !Array.isArray(ports)) {
    return res.status(400).json({
      error: "Invalid request. projectId and ports array are required.",
    });
  }

  console.log(`Killing ports for project ${projectId}:`, ports);

  try {
    const killPromises = ports.map((port) => {
      return new Promise((resolve) => {
        // Use lsof to find processes on the port and kill them
        const command = `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`;

        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.log(`Port ${port}: No process found or already killed`);
            resolve({ port, killed: false, reason: "No process found" });
          } else {
            console.log(`Port ${port}: Process killed successfully`);
            resolve({ port, killed: true });
          }
        });
      });
    });

    const results = await Promise.all(killPromises);
    const killedPorts = results.filter((r) => r.killed).map((r) => r.port);
    const notKilledPorts = results.filter((r) => !r.killed).map((r) => r.port);

    let message = "";
    if (killedPorts.length > 0) {
      message += `Successfully killed processes on ports: ${killedPorts.join(
        ", "
      )}`;
    }
    if (notKilledPorts.length > 0) {
      if (message) message += ". ";
      message += `No processes found on ports: ${notKilledPorts.join(", ")}`;
    }

    res.json({
      success: true,
      message: message || "All ports checked",
      results: results,
      projectId,
    });
  } catch (error) {
    console.error("Error killing ports:", error);
    res.status(500).json({
      error: "Failed to kill ports",
      details: error.message,
    });
  }
});

// Kill individual port endpoint
app.post("/api/kill-port", async (req, res) => {
  const { projectId, port, serviceName } = req.body;

  if (!projectId || !port) {
    return res.status(400).json({
      error: "Invalid request. projectId and port are required.",
    });
  }

  console.log(
    `Killing individual port ${port} for service ${serviceName} in project ${projectId}`
  );

  try {
    const killResult = await new Promise((resolve) => {
      // Use lsof to find processes on the port and kill them
      const command = `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.log(`Port ${port}: No process found or already killed`);
          resolve({ port, killed: false, reason: "No process found" });
        } else {
          console.log(`Port ${port}: Process killed successfully`);
          resolve({ port, killed: true });
        }
      });
    });

    console.log(`Kill result for port ${port}:`, killResult);

    res.json({
      success: killResult.killed,
      projectId,
      port,
      serviceName,
      result: killResult,
      message: killResult.killed
        ? `Successfully killed process on port ${port}`
        : `No process found on port ${port}`,
    });
  } catch (error) {
    console.error(`Error killing port ${port}:`, error);
    res.status(500).json({
      success: false,
      error: "Failed to kill port",
      details: error.message,
    });
  }
});

// Open project in Finder endpoint
app.post("/api/open-finder", async (req, res) => {
  const { projectId, projectPath } = req.body;

  if (!projectId || !projectPath) {
    return res.status(400).json({
      error: "Invalid request. projectId and projectPath are required.",
    });
  }

  console.log(`Opening project ${projectId} in Finder at path: ${projectPath}`);

  try {
    const openCommand = `open "${projectPath}"`;

    await new Promise((resolve, reject) => {
      exec(openCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error opening ${projectPath} in Finder:`,
            error.message
          );
          reject(new Error(`Failed to open in Finder: ${error.message}`));
        } else {
          console.log(`Successfully opened ${projectPath} in Finder`);
          resolve();
        }
      });
    });

    res.json({
      success: true,
      message: `Successfully opened ${projectId} in Finder`,
      projectId,
      projectPath,
    });
  } catch (error) {
    console.error("Error opening project in Finder:", error);
    res.status(500).json({
      error: "Failed to open project in Finder",
      details: error.message,
      suggestion: "Make sure the project path exists and is accessible",
    });
  }
});

// Open terminal at project folder endpoint
app.post("/api/open-terminal", async (req, res) => {
  const { projectId, projectPath, isBackendPath } = req.body;

  if (!projectId || !projectPath) {
    return res.status(400).json({
      error: "Invalid request. projectId and projectPath are required.",
    });
  }

  const pathType = isBackendPath ? "backend" : "project";
  console.log(
    `Opening terminal for project ${projectId} at ${pathType} path: ${projectPath}`
  );

  try {
    // First, try to check if iTerm2 is available and running
    const checkItermCommand = `osascript -e 'tell application "System Events" to (name of processes) contains "iTerm2"'`;

    const isItermRunning = await new Promise((resolve) => {
      exec(checkItermCommand, (error, stdout, stderr) => {
        if (error) {
          resolve(false);
        } else {
          resolve(stdout.trim() === "true");
        }
      });
    });

    let terminalCommand;
    let terminalType;

    if (isItermRunning) {
      // Use iTerm2 if it's running
      terminalType = "iTerm2";
      terminalCommand = `
        osascript -e 'tell application "iTerm2"
          try
            create window with default profile
            tell current session of current window
              write text "cd \"${projectPath}\""
            end tell
            activate
          on error errorMessage
            error errorMessage
          end try
        end tell'
      `;
    } else {
      // Check if iTerm2 is installed but not running
      const checkItermInstalledCommand = `osascript -e 'tell application "System Events" to exists application "iTerm2"'`;

      const isItermInstalled = await new Promise((resolve) => {
        exec(checkItermInstalledCommand, (error, stdout, stderr) => {
          if (error) {
            resolve(false);
          } else {
            resolve(stdout.trim() === "true");
          }
        });
      });

      if (isItermInstalled) {
        // Launch iTerm2 and open terminal
        terminalType = "iTerm2";
        terminalCommand = `
          osascript -e 'tell application "iTerm2"
            try
              activate
              create window with default profile
              tell current session of current window
                write text "cd \"${projectPath}\""
              end tell
            on error errorMessage
              error errorMessage
            end try
          end tell'
        `;
      } else {
        // Fallback to Terminal.app
        terminalType = "Terminal";
        terminalCommand = `
          osascript -e 'tell application "Terminal"
            try
              activate
              do script "cd \"${projectPath}\""
            on error errorMessage
              error errorMessage
            end try
          end tell'
        `;
      }
    }

    await new Promise((resolve, reject) => {
      exec(terminalCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error opening terminal at ${projectPath}:`,
            error.message
          );
          reject(new Error(`Failed to open terminal: ${error.message}`));
        } else {
          console.log(
            `Successfully opened ${terminalType} terminal at ${pathType} path: ${projectPath}`
          );
          resolve();
        }
      });
    });

    res.json({
      success: true,
      message: `Successfully opened ${terminalType} terminal for ${projectId} at ${pathType} path`,
      projectId,
      projectPath,
      terminalApp: terminalType,
      pathType,
    });
  } catch (error) {
    console.error("Error opening terminal:", error);
    res.status(500).json({
      error: "Failed to open terminal",
      details: error.message,
      suggestion:
        "Make sure the project path exists and Terminal.app is accessible",
    });
  }
});

// Open terminal to watch port endpoint
app.post("/api/watch-port", async (req, res) => {
  const { projectId, port, serviceName } = req.body;

  if (!projectId || !port) {
    return res.status(400).json({
      error: "Invalid request. projectId and port are required.",
    });
  }

  console.log(
    `Opening terminal to watch port ${port} for service ${serviceName} in project ${projectId}`
  );

  try {
    // Create a command that opens a new terminal window and watches the port
    // This command will show processes using the port and monitor for changes
    const watchCommand = `
      osascript -e 'tell application "Terminal"
        do script "echo \\"Watching port ${port} for ${serviceName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && while true; do echo \\"$(date): Processes on port ${port}:\\"; lsof -i :${port} 2>/dev/null || echo \\"No processes found on port ${port}\\"; echo \\"---\\"; sleep 2; done"
        activate
      end tell'
    `;

    await new Promise((resolve, reject) => {
      exec(watchCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error opening terminal for port ${port}:`,
            error.message
          );
          reject(new Error(`Failed to open terminal: ${error.message}`));
        } else {
          console.log(`Successfully opened terminal to watch port ${port}`);
          resolve();
        }
      });
    });

    res.json({
      success: true,
      message: `Successfully opened terminal to watch port ${port}`,
      projectId,
      port,
      serviceName,
    });
  } catch (error) {
    console.error("Error opening terminal to watch port:", error);
    res.status(500).json({
      error: "Failed to open terminal to watch port",
      details: error.message,
      suggestion: "Make sure Terminal.app is available and accessible",
    });
  }
});

// Focus project terminal endpoint
app.post("/api/focus-terminal", async (req, res) => {
  const { projectId, focusIdentifier, projectPath } = req.body;

  if (!projectId || !focusIdentifier) {
    return res.status(400).json({
      error: "Invalid request. projectId and focusIdentifier are required.",
    });
  }

  console.log(
    `Focusing terminal for project ${projectId} with identifier: ${focusIdentifier}`
  );

  try {
    // First, check if a Cursor window with the project identifier exists
    const queryCommand = `yabai -m query --windows | jq '.[] | select(.app == "Cursor" and (.title | contains("${focusIdentifier}"))) | .id'`;

    const windowId = await new Promise((resolve, reject) => {
      exec(queryCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          const id = stdout.trim();
          resolve(id);
        }
      });
    });

    // If we found a window ID, try to focus it
    if (windowId && windowId !== "") {
      const focusCommand = `yabai -m window --focus "${windowId}"`;

      await new Promise((resolve, reject) => {
        exec(focusCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error focusing window ${windowId}:`, error.message);
            reject(error);
          } else {
            console.log(
              `Successfully focused existing terminal for project ${projectId}`
            );
            resolve();
          }
        });
      });

      res.json({
        success: true,
        message: `Successfully focused terminal for ${projectId}`,
        action: "focused",
        projectId,
        focusIdentifier,
      });
      return;
    }

    // No existing window found, try to open the project if we have a path
    if (projectPath) {
      console.log(
        `No existing window found for project ${projectId}, opening at path: ${projectPath}`
      );

      const openCommand = `cursor "${projectPath}"`;

      await new Promise((resolve, reject) => {
        exec(openCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error opening project ${projectId}:`, error.message);
            reject(new Error(`Failed to open project: ${error.message}`));
          } else {
            console.log(`Successfully opened project ${projectId}`);
            resolve();
          }
        });
      });

      res.json({
        success: true,
        message: `Successfully opened project ${projectId}`,
        action: "opened",
        projectId,
        focusIdentifier,
        projectPath,
      });
    } else {
      // No project path provided, can't open
      res.json({
        success: false,
        message: `Project ${projectId} not found in Cursor and no project path provided`,
        action: "not_found",
        projectId,
        focusIdentifier,
      });
    }
  } catch (error) {
    console.error("Error with focus/open operation:", error);
    res.status(500).json({
      error: "Failed to focus or open project",
      details: error.message,
      suggestion:
        "Make sure yabai and jq are installed, Cursor is available in PATH, and the project path is correct",
    });
  }
});

// Minimize all Cursor windows endpoint
app.post("/api/minimize-cursor-windows", async (req, res) => {
  console.log("Minimizing all Cursor windows...");

  try {
    // First, get all Cursor window IDs
    const getWindowsCommand = `yabai -m query --windows | jq '.[] | select(.app == "Cursor") | .id'`;

    const windowIds = await new Promise((resolve, reject) => {
      exec(getWindowsCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          const ids = stdout
            .trim()
            .split("\n")
            .filter((id) => id && id !== "");
          resolve(ids);
        }
      });
    });

    if (windowIds.length === 0) {
      console.log("No Cursor windows found to minimize");
      return res.json({
        success: true,
        message: "No Cursor windows found to minimize",
        minimized: 0,
        failed: 0,
      });
    }

    console.log(`Found ${windowIds.length} Cursor windows to minimize`);

    // Minimize each window individually for better error handling and speed
    const minimizePromises = windowIds.map((windowId) => {
      return new Promise((resolve) => {
        const minimizeCommand = `yabai -m window ${windowId} --minimize`;

        exec(minimizeCommand, (error, stdout, stderr) => {
          if (error) {
            const errorMessage = (error.message + " " + stderr).toLowerCase();
            if (
              errorMessage.includes("already minimized") ||
              errorMessage.includes("is already minimized") ||
              errorMessage.includes("does not support the minimize operation")
            ) {
              console.log(
                `Window ${windowId}: Already minimized or not supported`
              );
              resolve({
                windowId,
                minimized: false,
                reason: "already_minimized_or_unsupported",
              });
            } else {
              console.log(
                `Window ${windowId}: Failed to minimize - ${error.message}`
              );
              resolve({ windowId, minimized: false, reason: error.message });
            }
          } else {
            console.log(`Window ${windowId}: Successfully minimized`);
            resolve({ windowId, minimized: true });
          }
        });
      });
    });

    // Execute all minimize operations in parallel for speed
    const results = await Promise.all(minimizePromises);

    const minimizedCount = results.filter((r) => r.minimized).length;
    const failedCount = results.filter((r) => !r.minimized).length;

    console.log(
      `Minimize complete: ${minimizedCount} minimized, ${failedCount} failed/skipped`
    );

    res.json({
      success: true,
      message: `Successfully processed ${windowIds.length} Cursor windows: ${minimizedCount} minimized, ${failedCount} skipped`,
      minimized: minimizedCount,
      failed: failedCount,
      total: windowIds.length,
    });
  } catch (error) {
    console.error("Error minimizing Cursor windows:", error);
    res.status(500).json({
      error: "Failed to minimize Cursor windows",
      details: error.message,
      suggestion:
        "Make sure yabai is installed and running, and that jq is available",
    });
  }
});

// Note: Path validation removed - if we found wf-ports.json, the directory exists

// Function to scan for VS Code tasks.json file
const scanVSCodeTasks = async (projectPath) => {
  const tasksPath = path.join(projectPath, ".vscode", "tasks.json");
  try {
    await fs.access(tasksPath);
    const tasksContent = await fs.readFile(tasksPath, "utf8");

    // Remove comments from JSON (VS Code allows comments in tasks.json)
    const cleanedContent = tasksContent.replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      ""
    );
    const tasksConfig = JSON.parse(cleanedContent);

    return {
      tasksPath,
      tasks: tasksConfig.tasks || [],
      version: tasksConfig.version || "2.0.0",
    };
  } catch (error) {
    return null;
  }
};

// Function to get git status and branch information
const getGitInfo = async (projectPath) => {
  try {
    // Check if it's a git repository
    const gitDir = path.join(projectPath, ".git");
    try {
      await fs.access(gitDir);
    } catch (error) {
      return null; // Not a git repository
    }

    const gitInfo = {
      isGitRepo: true,
      branch: null,
      remoteUrl: null,
      repoUrl: null, // Formatted URL for browser opening
      status: {
        modified: [],
        untracked: [],
        staged: [],
        ahead: 0,
        behind: 0,
        hasChanges: false,
        hasUncommittedChanges: false,
      },
      lastCommit: null,
    };

    // Get current branch
    try {
      const branchResult = await execWithTimeout(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: projectPath },
        3000
      );
      gitInfo.branch = branchResult;
    } catch (error) {
      console.log(
        `Could not get git branch for ${projectPath}:`,
        error.message
      );
    }

    // Get remote URL
    try {
      const remoteResult = await execWithTimeout(
        "git remote get-url origin",
        { cwd: projectPath },
        3000
      );
      gitInfo.remoteUrl = remoteResult;

      // Convert to browser-friendly URL if it's SSH
      if (remoteResult.startsWith("git@github.com:")) {
        gitInfo.repoUrl = remoteResult
          .replace("git@github.com:", "https://github.com/")
          .replace(".git", "");
      } else if (remoteResult.startsWith("https://github.com/")) {
        gitInfo.repoUrl = remoteResult.replace(".git", "");
      }
    } catch (error) {
      // No remote configured
    }

    // Get status information
    try {
      const statusResult = await execWithTimeout(
        "git status --porcelain",
        { cwd: projectPath },
        5000
      );

      const statusLines = statusResult
        .split("\n")
        .filter((line) => line.trim());
      gitInfo.status.hasChanges = statusLines.length > 0;
      gitInfo.status.hasUncommittedChanges = statusLines.length > 0;

      for (const line of statusLines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status[0] !== " " && status[0] !== "?") {
          gitInfo.status.staged.push(file);
        }
        if (status[1] !== " ") {
          if (status[1] === "?") {
            gitInfo.status.untracked.push(file);
          } else {
            gitInfo.status.modified.push(file);
          }
        }
      }
    } catch (error) {
      // Could not get status
    }

    // Get ahead/behind information
    try {
      const aheadBehindResult = await execWithTimeout(
        "git rev-list --left-right --count HEAD...@{u}",
        { cwd: projectPath },
        3000
      );

      const [ahead, behind] = aheadBehindResult.split("\t").map(Number);
      gitInfo.status.ahead = ahead || 0;
      gitInfo.status.behind = behind || 0;
    } catch (error) {
      // No tracking branch or other error
    }

    // Get last commit info
    try {
      const lastCommitResult = await execWithTimeout(
        'git log -1 --pretty=format:"%H|%an|%ad|%s" --date=iso',
        { cwd: projectPath },
        3000
      );

      if (lastCommitResult) {
        const [hash, author, date, message] = lastCommitResult.split("|");
        gitInfo.lastCommit = {
          hash: hash,
          author: author,
          date: date,
          message: message,
        };
      }
    } catch (error) {
      // Could not get last commit
    }

    return gitInfo;
  } catch (error) {
    return null;
  }
};

// Function to get Firebase project information
const getFirebaseInfo = async (projectPath) => {
  try {
    // Check if firebase.json exists in current directory
    let firebaseConfigPath = path.join(projectPath, "firebase.json");
    let actualFirebaseDir = projectPath;

    try {
      await fs.access(firebaseConfigPath);
    } catch (error) {
      // Not found in root, check common subdirectories
      const commonFirebaseDirs = [
        "frontend",
        "backend",
        "web",
        "client",
        "server",
        "app",
      ];
      let foundInSubdir = false;

      for (const subdir of commonFirebaseDirs) {
        const subdirPath = path.join(projectPath, subdir);
        const subdirFirebaseConfig = path.join(subdirPath, "firebase.json");

        try {
          await fs.access(subdirFirebaseConfig);
          firebaseConfigPath = subdirFirebaseConfig;
          actualFirebaseDir = subdirPath;
          foundInSubdir = true;
          break;
        } catch (subdirError) {
          // Continue searching other subdirectories
        }
      }

      if (!foundInSubdir) {
        return null; // Not a Firebase project
      }
    }

    const firebaseInfo = {
      isFirebaseProject: true,
      currentProject: null,
      projectId: null,
      projectAlias: null,
      firebaseConfig: null,
      hasFirebaseRC: false,
      availableProjects: [],
      firebaseTools: {
        hasFirebaseCLI: false,
        version: null,
      },
    };

    // Check if Firebase CLI is available
    try {
      const versionResult = await execWithTimeout(
        "firebase --version",
        { cwd: projectPath },
        5000
      );
      firebaseInfo.firebaseTools.hasFirebaseCLI = true;
      firebaseInfo.firebaseTools.version = versionResult;
    } catch (error) {
      // Continue without CLI functionality
    }

    // Read firebase.json configuration
    try {
      const firebaseConfig = await fs.readFile(firebaseConfigPath, "utf8");
      firebaseInfo.firebaseConfig = JSON.parse(firebaseConfig);
    } catch (error) {
      console.log(
        `Could not read firebase.json in ${projectPath}:`,
        error.message
      );
    }

    // Check for .firebaserc file
    const firebaseRCPath = path.join(projectPath, ".firebaserc");
    try {
      await fs.access(firebaseRCPath);
      firebaseInfo.hasFirebaseRC = true;

      const firebaseRC = await fs.readFile(firebaseRCPath, "utf8");
      const rcConfig = JSON.parse(firebaseRC);

      if (rcConfig.projects && rcConfig.projects.default) {
        firebaseInfo.currentProject = rcConfig.projects.default;
        firebaseInfo.projectId = rcConfig.projects.default;
        console.log(
          `🔥 Firebase Project: ${firebaseInfo.projectId} → ${firebaseInfo.projectId}`
        );
      }

      // Extract available projects/aliases
      if (rcConfig.projects) {
        firebaseInfo.availableProjects = Object.keys(rcConfig.projects).map(
          (alias) => ({
            alias: alias,
            projectId: rcConfig.projects[alias],
          })
        );
      }
    } catch (error) {
      // No .firebaserc found
    }

    // If we have Firebase CLI, try to get current project (only if no .firebaserc found)
    if (firebaseInfo.firebaseTools.hasFirebaseCLI && !firebaseInfo.projectId) {
      try {
        const currentProjectResult = await execWithTimeout(
          "firebase use",
          { cwd: projectPath },
          5000
        );

        // Parse the "firebase use" output
        // Typically returns something like "Active project: my-project-id (my-project-alias)"
        const match = currentProjectResult.match(
          /Active project:\s*([^\s]+)(?:\s+\(([^)]+)\))?/
        );
        if (match) {
          firebaseInfo.currentProject = match[1];
          firebaseInfo.projectId = match[1];
          if (match[2]) {
            firebaseInfo.projectAlias = match[2];
          }
        }
      } catch (error) {
        // Could not get current Firebase project from CLI
      }

      // Skip projects:list command to speed up scanning
      // This command can be slow and is not critical for basic Firebase detection
    }

    return firebaseInfo;
  } catch (error) {
    console.log(
      `Error getting Firebase info for ${projectPath}:`,
      error.message
    );
    return null;
  }
};

// Function to find "A. Start All" type tasks
const findStartAllTasks = (tasks) => {
  if (!tasks || !Array.isArray(tasks)) return [];

  return tasks.filter((task) => {
    if (!task.label) return false;

    const label = task.label.toLowerCase();

    // More specific patterns to avoid false matches
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
};

// Ensure project-icons directory exists
const ensureProjectIconsDir = async () => {
  try {
    await fs.mkdir(PROJECT_ICONS_DIR, { recursive: true });
  } catch (error) {
    console.error("Error creating project-icons directory:", error);
  }
};

// Generate documentation MD file with current ports and instructions
const generateDocumentation = async (projects) => {
  // Collect all unique port numbers
  const allPorts = [];
  projects.forEach((project) => {
    if (project.services) {
      project.services.forEach((service) => {
        if (!allPorts.includes(service.port)) {
          allPorts.push(service.port);
        }
      });
    }
  });

  // Sort ports by number
  allPorts.sort((a, b) => a - b);

  const mdContent = `# PortIO - Local Development Ports

I have various local projects running in development on my computer at any one time. In light of that, can you update all the ports of this project to use unique ports? Here are the ports I'm currently using:

## Currently Used Ports

${allPorts.join(", ")}

---

## Standard Ports to Avoid

These are common system and web ports that should not be used for local development:

**System Ports (0-1023):**
20, 21 (FTP), 22 (SSH), 23 (Telnet), 25 (SMTP), 53 (DNS), 67, 68 (DHCP), 80 (HTTP), 110 (POP3), 119 (NNTP), 123 (NTP), 143 (IMAP), 161, 162 (SNMP), 194 (IRC), 443 (HTTPS), 465 (SMTPS), 514 (Syslog), 587 (SMTP), 993 (IMAPS), 995 (POP3S)

**Common Development Ports:**
3306 (MySQL), 5432 (PostgreSQL), 6379 (Redis), 27017 (MongoDB), 5672, 15672 (RabbitMQ), 9200, 9300 (Elasticsearch), 2181 (Zookeeper), 9092 (Kafka)

**macOS Specific:**
88 (Kerberos), 311 (AppleShare), 389 (LDAP), 427 (SLP), 548 (AFP), 631 (CUPS/Printing), 636 (LDAPS), 749 (Kerberos Admin), 1023 (Reserved)

**Other Common Services:**
1433 (MSSQL), 1521 (Oracle), 2049 (NFS), 3389 (RDP), 5000 (Flask default, macOS AirPlay), 5001 (macOS AirPlay), 5353 (mDNS/Bonjour), 5900 (VNC), 8000 (common dev), 8080 (HTTP alt), 8443 (HTTPS alt), 8888 (Jupyter), 9000 (PHP-FPM), 9090 (Prometheus)

---

## wf-ports.json Reference

The \`wf-ports.json\` file configures how PortIO monitors your project. Place it in your project root directory.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| \`id\` | string | Unique identifier (lowercase with hyphens). Used for PM2 naming and database storage. Example: \`"my-project"\` |
| \`name\` | string | Display name shown in PortIO. Can contain spaces and special characters. Example: \`"My Project"\` |
| \`services\` | array | Array of service objects to monitor (see below) |

### Service Object Fields

| Field | Type | Description |
|-------|------|-------------|
| \`name\` | string | Service name (e.g., "Frontend", "API") |
| \`port\` | number | Port number (e.g., 3000) |
| \`url\` | string | URL to open in browser (e.g., \`"http://localhost:3000"\`) |
| \`purpose\` | string | Description of what the service does |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| \`faviconPath\` | string | Absolute path to favicon image. Copied to public dir on rescan. Example: \`"/Users/me/project/public/icon.png"\` |
| \`description\` | string | Brief project description shown in details popup |
| \`focusIdentifier\` | string | Identifier to focus Cursor window. Should match part of window title |
| \`projectPath\` | string | Absolute path to project root. Auto-detected if not specified |
| \`projectBackendPath\` | string | Path to backend subdirectory for terminal actions |
| \`firebaseProjectId\` | string | Firebase project ID. Auto-detected from \`firebase.json\` or \`.firebaserc\` |
| \`pm2Prefix\` | string | Custom prefix for PM2 process matching. Defaults to \`id\`. Example: if set to \`"port-monitor"\`, matches \`port-monitor-backend\` |

---

## PM2 Process Naming Convention

**IMPORTANT:** For PortIO to detect and display your PM2 processes, they MUST follow one of these naming conventions:

**Option 1: Exact match**
\`\`\`
{projectId}
\`\`\`
Example: PM2 name \`toyota-contacts\` matches project ID \`toyota-contacts\`

**Option 2: Prefix with task label**
\`\`\`
{projectId}-{taskLabel}
\`\`\`
Example: PM2 name \`talevana-backend\` matches project ID \`talevana\`

Where:
- \`{projectId}\` = The \`id\` field from your \`wf-ports.json\` (or \`pm2Prefix\` if specified)
- \`{taskLabel}\` = A descriptive label for the task (e.g., \`frontend\`, \`backend\`, \`api\`)

### Examples

| Project ID | Valid PM2 Names | Invalid PM2 Names |
|------------|-----------------|-------------------|
| \`my-app\` | \`my-app-frontend\`, \`my-app-backend\`, \`my-app-api\` | \`myapp-frontend\`, \`app-frontend\` |
| \`talevana\` | \`talevana-backend\`, \`talevana-frontend\` | \`tal-backend\`, \`backend\` |
| \`portio\` | \`portio-backend\`, \`portio-frontend\` | \`port-monitor-backend\` |

### Setting PM2 Names in tasks.json

In your \`.vscode/tasks.json\`, use the \`--name\` flag to set the correct PM2 process name:

\`\`\`json
{
  "label": "Backend: Start Server",
  "type": "shell",
  "command": "pm2 start \\"npm run dev\\" --name my-app-backend"
}
\`\`\`

The PM2 name MUST start with your project's \`id\` followed by a hyphen.

---

### Example wf-ports.json

\`\`\`json
{
  "id": "my-app",
  "name": "My Application",
  "description": "A full-stack web application",
  "faviconPath": "/Users/me/Projects/my-app/public/favicon.png",
  "focusIdentifier": "my-app",
  "projectPath": "/Users/me/Projects/my-app",
  "firebaseProjectId": "my-firebase-project",
  "services": [
    {
      "name": "Frontend",
      "port": 3000,
      "url": "http://localhost:3000",
      "purpose": "React web application"
    },
    {
      "name": "API",
      "port": 3001,
      "url": "http://localhost:3001",
      "purpose": "Express backend server"
    }
  ]
}
\`\`\`
`;

  try {
    await fs.writeFile(DOCS_FILE_PATH, mdContent, "utf8");
    console.log(`📝 Generated documentation: ${DOCS_FILE_PATH}`);
    return true;
  } catch (error) {
    console.error("Error generating documentation:", error);
    return false;
  }
};

// Copy favicon to public directory if it exists
const copyFaviconToPublic = async (projectId, faviconPath) => {
  if (!faviconPath) return null;

  try {
    // Check if source file exists
    await fs.access(faviconPath);

    // Get file extension
    const ext = path.extname(faviconPath).toLowerCase();
    const destFilename = `${projectId}${ext}`;
    const destPath = path.join(PROJECT_ICONS_DIR, destFilename);

    // Copy the file
    await fs.copyFile(faviconPath, destPath);
    console.log(
      `📷 Copied favicon for ${projectId}: ${faviconPath} → ${destPath}`
    );

    // Return the public URL path
    return `/project-icons/${destFilename}`;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`⚠️  Favicon not found for ${projectId}: ${faviconPath}`);
    } else {
      console.error(`Error copying favicon for ${projectId}:`, error.message);
    }
    return null;
  }
};

// Function to find wf-ports.json files and VS Code tasks
// maxDepth = 2: Projects folder (depth 0) -> project folders (depth 1) where wf-ports.json lives
const findConfigFiles = async (dirPath, maxDepth = 2, currentDepth = 0) => {
  const results = [];

  if (currentDepth >= maxDepth) {
    return results;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // Check for wf-ports.json in current directory
    const configPath = path.join(dirPath, CONFIG_FILE_NAME);
    try {
      await fs.access(configPath);

      // If we found the config file, the directory definitely exists
      const pathExists = true;

      // Scan for VS Code tasks
      const vscodeTasksInfo = await scanVSCodeTasks(dirPath);

      // Get git information
      const gitInfo = await getGitInfo(dirPath);

      // Get Firebase information
      const firebaseInfo = await getFirebaseInfo(dirPath);

      results.push({
        configPath,
        projectPath: dirPath,
        directoryName: path.basename(dirPath),
        pathExists,
        vscodeTasksInfo,
        gitInfo,
        firebaseInfo,
      });
      console.log(
        `Found config at: ${configPath} (Path exists: ${pathExists})`
      );

      if (vscodeTasksInfo) {
        console.log(
          `  └─ Found VS Code tasks.json with ${vscodeTasksInfo.tasks.length} tasks`
        );
        const startAllTasks = findStartAllTasks(vscodeTasksInfo.tasks);
        if (startAllTasks.length > 0) {
          console.log(`  └─ Found ${startAllTasks.length} "Start All" tasks`);
        }
      }

      if (gitInfo) {
        console.log(
          `  └─ Git: ${gitInfo.branch || "unknown branch"}${
            gitInfo.status.hasUncommittedChanges
              ? " (uncommitted changes)"
              : " (clean)"
          }`
        );
        if (gitInfo.status.ahead > 0 || gitInfo.status.behind > 0) {
          console.log(
            `  └─ Git: ${gitInfo.status.ahead} ahead, ${gitInfo.status.behind} behind`
          );
        }
      }

      if (firebaseInfo) {
        console.log(
          `  └─ Firebase: ${firebaseInfo.isFirebaseProject ? "Yes" : "No"}`
        );
      }
    } catch (error) {
      // No config file in this directory
    }

    // Recursively check subdirectories (skip node_modules, .git, etc.)
    const skipDirs = [
      "node_modules",
      ".git",
      ".next",
      "dist",
      "build",
      ".idea",
    ];
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !skipDirs.includes(entry.name) &&
        !entry.name.startsWith(".")
      ) {
        const subDirPath = path.join(dirPath, entry.name);
        const subResults = await findConfigFiles(
          subDirPath,
          maxDepth,
          currentDepth + 1
        );
        results.push(...subResults);
      }
    }
  } catch (error) {
    console.log(`Cannot access directory: ${dirPath}`);
  }

  return results;
};

// Add new endpoint for scanning projects
app.get("/api/scan-projects", async (req, res) => {
  try {
    const projects = [];

    console.log(
      `Scanning for wf-ports.json files recursively in: ${PROJECTS_BASE_PATH}`
    );

    // Ensure project-icons directory exists
    await ensureProjectIconsDir();

    // Find all wf-ports.json files recursively
    const configFiles = await findConfigFiles(PROJECTS_BASE_PATH);

    console.log(`Found ${configFiles.length} config files`);

    // Process each config file
    for (const {
      configPath,
      projectPath,
      directoryName,
      pathExists,
      vscodeTasksInfo,
      gitInfo,
      firebaseInfo,
    } of configFiles) {
      try {
        // Read and parse the config file
        const configContent = await fs.readFile(configPath, "utf8");
        const projectConfig = JSON.parse(configContent);

        // Check for Firebase info in backend path if specified
        let finalFirebaseInfo = firebaseInfo;
        if (projectConfig.projectBackendPath) {
          // Check Firebase in backend path first
          const backendFirebaseInfo = await getFirebaseInfo(
            projectConfig.projectBackendPath
          );
          if (backendFirebaseInfo && backendFirebaseInfo.isFirebaseProject) {
            finalFirebaseInfo = backendFirebaseInfo;
          }
        }

        // Override with firebaseProjectId from wf-ports.json if specified
        if (projectConfig.firebaseProjectId) {
          if (!finalFirebaseInfo) {
            finalFirebaseInfo = {
              isFirebaseProject: true,
              projectId: projectConfig.firebaseProjectId,
              currentProject: projectConfig.firebaseProjectId,
            };
          } else {
            finalFirebaseInfo.projectId = projectConfig.firebaseProjectId;
            finalFirebaseInfo.currentProject = projectConfig.firebaseProjectId;
            finalFirebaseInfo.isFirebaseProject = true;
          }
          console.log(
            `  🔥 Using firebaseProjectId from config: ${projectConfig.firebaseProjectId}`
          );
        }

        // Find "Start All" tasks if VS Code tasks exist
        const startAllTasks = vscodeTasksInfo
          ? findStartAllTasks(vscodeTasksInfo.tasks)
          : [];

        // Generate project ID
        const projectId =
          projectConfig.id ||
          directoryName.toLowerCase().replace(/[^a-z0-9]/g, "-");

        // Copy favicon to public directory if specified (reads faviconPath from config)
        let favicon = null;
        const faviconPath = projectConfig.faviconPath || projectConfig.favicon; // Support both for backwards compatibility
        if (faviconPath) {
          favicon = await copyFaviconToPublic(projectId, faviconPath);
        }

        // Add project metadata
        const project = {
          ...projectConfig,
          id: projectId,
          projectPath: projectPath,
          configPath: configPath,
          directoryName: directoryName,
          pathExists: pathExists,
          vscodeTasksInfo: vscodeTasksInfo,
          startAllTasks: startAllTasks,
          hasStartAllTasks: startAllTasks.length > 0,
          gitInfo: gitInfo,
          firebaseInfo: finalFirebaseInfo,
          faviconPath: faviconPath || null, // Original source path (preserved for reference)
          favicon: favicon, // Public URL for favicon (e.g., /project-icons/myapp.png)
        };

        projects.push(project);
        console.log(`Loaded project config: ${directoryName} (${configPath})`);

        if (startAllTasks.length > 0) {
          console.log(`  ✅ Found ${startAllTasks.length} "Start All" tasks`);
        }

        if (gitInfo) {
          console.log(
            `  ✅ Git: ${gitInfo.branch || "unknown"}${
              gitInfo.status.hasUncommittedChanges ? " (dirty)" : " (clean)"
            }`
          );
        }

        if (firebaseInfo) {
          console.log(
            `  ✅ Firebase: ${firebaseInfo.isFirebaseProject ? "Yes" : "No"}`
          );
        }
      } catch (error) {
        console.log(
          `Invalid wf-ports.json found at ${configPath}: ${error.message}`
        );
      }
    }

    // Cache the projects for Alfred workflow
    const cacheData = { projects, cachedAt: new Date().toISOString() };
    await fs.writeFile(PROJECTS_CACHE_PATH, JSON.stringify(cacheData, null, 2));
    console.log(`📦 Cached ${projects.length} projects for Alfred workflow`);

    // Send response first, then generate docs (to avoid React hot-reload interrupting the request)
    res.json({ projects });

    // Generate documentation MD file in background (after response is sent)
    generateDocumentation(projects).catch((err) =>
      console.error("Error generating documentation:", err)
    );
  } catch (error) {
    console.error("Error scanning projects:", error);
    res
      .status(500)
      .json({ error: "Failed to scan projects", details: error.message });
  }
});

// Simple ports.json endpoint - just returns array of taken ports
app.get("/api/ports.json", async (req, res) => {
  try {
    console.log("Exporting simple ports array...");

    // Find all wf-ports.json files recursively
    const configFiles = await findConfigFiles(PROJECTS_BASE_PATH);

    const allPorts = [];

    // Process each config file
    for (const { configPath } of configFiles) {
      try {
        const configContent = await fs.readFile(configPath, "utf8");
        const projectConfig = JSON.parse(configContent);

        // Extract ports from services
        if (projectConfig.services && Array.isArray(projectConfig.services)) {
          for (const service of projectConfig.services) {
            if (service.port) {
              allPorts.push(service.port);
            }
          }
        }
      } catch (error) {
        console.log(
          `Error processing config at ${configPath}: ${error.message}`
        );
      }
    }

    // Return unique sorted ports as simple array
    const uniquePorts = [...new Set(allPorts)].sort((a, b) => a - b);

    console.log(`Exported ${uniquePorts.length} unique ports`);

    res.json(uniquePorts);
  } catch (error) {
    console.error("Error exporting ports:", error);
    res.status(500).json({
      error: "Failed to export ports",
      details: error.message,
    });
  }
});

// Export used ports endpoint (full details - kept for backward compatibility)
app.get("/api/export-used-ports", async (req, res) => {
  try {
    console.log("Exporting all used ports from monitored projects...");

    // Find all wf-ports.json files recursively
    const configFiles = await findConfigFiles(PROJECTS_BASE_PATH);

    const portData = {
      summary: {
        totalProjects: 0,
        totalPorts: 0,
        uniquePorts: 0,
        lastScanned: new Date().toISOString(),
      },
      projects: [],
      allPorts: [],
      portsByType: {},
      duplicatePorts: [],
    };

    const allPorts = [];
    const portUsage = {};

    // Process each config file
    for (const { configPath, projectPath, directoryName } of configFiles) {
      try {
        // Read and parse the config file
        const configContent = await fs.readFile(configPath, "utf8");
        const projectConfig = JSON.parse(configContent);

        const projectData = {
          name: projectConfig.name || directoryName,
          id:
            projectConfig.id ||
            directoryName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          path: projectPath,
          services: [],
        };

        // Extract ports from services
        if (projectConfig.services && Array.isArray(projectConfig.services)) {
          for (const service of projectConfig.services) {
            if (service.port) {
              const serviceData = {
                name: service.name,
                port: service.port,
                description: service.description || "",
                url: service.url || `http://localhost:${service.port}`,
              };

              projectData.services.push(serviceData);
              allPorts.push(service.port);

              // Track port usage for duplicates
              if (portUsage[service.port]) {
                portUsage[service.port].push({
                  project: projectData.name,
                  service: service.name,
                });
              } else {
                portUsage[service.port] = [
                  {
                    project: projectData.name,
                    service: service.name,
                  },
                ];
              }

              // Group by service type/name for analysis
              const serviceType = service.name || "unknown";
              if (!portData.portsByType[serviceType]) {
                portData.portsByType[serviceType] = [];
              }
              portData.portsByType[serviceType].push({
                port: service.port,
                project: projectData.name,
              });
            }
          }
        }

        if (projectData.services.length > 0) {
          portData.projects.push(projectData);
        }
      } catch (error) {
        console.log(
          `Error processing config at ${configPath}: ${error.message}`
        );
      }
    }

    // Find duplicate ports
    const duplicatePorts = [];
    for (const [port, usage] of Object.entries(portUsage)) {
      if (usage.length > 1) {
        duplicatePorts.push({
          port: parseInt(port),
          usedBy: usage,
        });
      }
    }

    // Update summary
    portData.summary.totalProjects = portData.projects.length;
    portData.summary.totalPorts = allPorts.length;
    portData.summary.uniquePorts = [...new Set(allPorts)].length;
    portData.allPorts = [...new Set(allPorts)].sort((a, b) => a - b);
    portData.duplicatePorts = duplicatePorts.sort((a, b) => a.port - b.port);

    console.log(
      `Export complete: ${portData.summary.totalProjects} projects, ${portData.summary.uniquePorts} unique ports`
    );

    res.json(portData);
  } catch (error) {
    console.error("Error exporting used ports:", error);
    res.status(500).json({
      error: "Failed to export used ports",
      details: error.message,
    });
  }
});

// Track ongoing task executions to prevent duplicates
const ongoingExecutions = new Set();

// Execute VS Code task endpoint
app.post("/api/execute-task", async (req, res) => {
  const { projectId, projectPath, taskLabel, task, allTasks } = req.body;

  if (!projectId || !projectPath || !taskLabel) {
    return res.status(400).json({
      error:
        "Invalid request. projectId, projectPath, and taskLabel are required.",
    });
  }

  // Create unique execution key to prevent duplicates
  const executionKey = `${projectId}-${taskLabel}`;

  if (ongoingExecutions.has(executionKey)) {
    console.log(
      `⚠️  Task "${taskLabel}" for project ${projectId} is already executing - skipping duplicate request`
    );
    return res.status(429).json({
      error: "Task is already executing",
      message: `Task "${taskLabel}" is already running for project ${projectId}`,
      taskLabel,
      projectId,
    });
  }

  // Mark task as executing
  ongoingExecutions.add(executionKey);
  console.log(
    `🚀 Starting execution of task "${taskLabel}" for project ${projectId} at ${projectPath}`
  );

  // Auto-cleanup after 5 minutes in case something goes wrong
  setTimeout(() => {
    if (ongoingExecutions.has(executionKey)) {
      console.log(`⏰ Auto-cleaning stale execution: ${executionKey}`);
      ongoingExecutions.delete(executionKey);
    }
  }, 5 * 60 * 1000); // 5 minutes

  try {
    let tasksToExecute = [];

    // Priority 1: If task has a command, execute that command (ignore dependsOn)
    if (task && (task.command || (task.execution && task.execution.command))) {
      console.log(`Task "${taskLabel}" has a command - executing directly`);
      tasksToExecute = [task];
    }
    // Priority 2: If task has NO command but has dependencies, execute dependencies
    else if (
      task &&
      task.dependsOn &&
      Array.isArray(task.dependsOn) &&
      allTasks
    ) {
      console.log(
        `Task "${taskLabel}" has no command but has dependencies:`,
        task.dependsOn
      );
      tasksToExecute = resolveDependentTasks(task, allTasks);
    }
    // Priority 3: Neither command nor dependencies
    else {
      return res.status(400).json({
        error: `Task "${taskLabel}" has neither command nor dependencies`,
        taskLabel,
      });
    }

    if (tasksToExecute.length === 0) {
      return res.status(400).json({
        error: "No executable tasks found",
        taskLabel,
      });
    }

    const results = [];

    // Execute each task
    for (const taskToExecute of tasksToExecute) {
      const result = await executeTask(taskToExecute, projectPath, projectId);
      results.push(result);

      // Small delay between tasks
      if (tasksToExecute.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const successfulTasks = results.filter((r) => r.success).length;
    const allSuccessful = successfulTasks === results.length;

    // Clean up execution tracking
    ongoingExecutions.delete(executionKey);
    console.log(
      `✅ Completed execution of task "${taskLabel}" for project ${projectId}`
    );

    res.json({
      success: allSuccessful,
      message: allSuccessful
        ? tasksToExecute.length === 1
          ? `Successfully started task "${taskLabel}"`
          : `Successfully started ${successfulTasks}/${results.length} dependent tasks for "${taskLabel}"`
        : `Started ${successfulTasks}/${results.length} tasks successfully for "${taskLabel}"`,
      projectId,
      taskLabel,
      projectPath,
      executedTasks: results.length,
      results,
    });
  } catch (error) {
    // Clean up execution tracking on error
    ongoingExecutions.delete(executionKey);
    console.error(
      `❌ Error executing task "${taskLabel}" for project ${projectId}:`,
      error
    );
    res.status(500).json({
      error: "Failed to execute task",
      details: error.message,
    });
  }
});

// Function to resolve task dependencies and get executable tasks
const resolveDependentTasks = (startAllTask, allTasks) => {
  const executableTasks = [];
  const seenTasks = new Set(); // Prevent duplicates

  if (!startAllTask.dependsOn || !Array.isArray(startAllTask.dependsOn)) {
    console.warn(
      `Task "${startAllTask.label}" called resolveDependentTasks but has no dependencies`
    );
    return [];
  }

  // Find each dependent task in the full tasks list (only once each)
  for (const dependentLabel of startAllTask.dependsOn) {
    // Skip if we've already processed this dependency
    if (seenTasks.has(dependentLabel)) {
      console.log(`Skipping duplicate dependency: ${dependentLabel}`);
      continue;
    }

    const dependentTask = allTasks.find(
      (task) => task.label === dependentLabel
    );
    if (dependentTask) {
      executableTasks.push(dependentTask);
      seenTasks.add(dependentLabel);
      console.log(`Added dependency task: ${dependentLabel}`);
    } else {
      console.warn(
        `Dependent task "${dependentLabel}" not found in tasks list`
      );
    }
  }

  return executableTasks;
};

// Helper function to create PM2 process name
const createPM2Name = (projectId, taskLabel) => {
  const cleanProjectId = projectId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const cleanTaskLabel = taskLabel.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${cleanProjectId}-${cleanTaskLabel}`;
};

// Function to execute a single task with PM2
const executeTask = async (task, projectPath, projectId) => {
  // Extract the actual command from the task
  let command = "";

  if (task.command) {
    // Direct command
    command = task.command;
    if (task.args && Array.isArray(task.args)) {
      command += " " + task.args.join(" ");
    }
  } else if (task.execution && task.execution.command) {
    // Execution object format
    command = task.execution.command;
    if (task.execution.args && Array.isArray(task.execution.args)) {
      command += " " + task.execution.args.join(" ");
    }
  }

  if (!command) {
    console.log(`Task "${task.label}" has no executable command`);
    return {
      taskLabel: task.label,
      success: false,
      error: "No executable command found in task",
    };
  }

  // Check if command is already a PM2 command
  const isPM2Command = command.trim().startsWith("pm2 start");
  let pm2Name;
  let executionCommand;

  if (isPM2Command) {
    // Extract PM2 process name from existing command
    const nameMatch = command.match(/--name\s+["']?([^"'\s]+)["']?/);
    if (nameMatch) {
      pm2Name = nameMatch[1];
      console.log(`Task "${task.label}" uses explicit PM2 name: ${pm2Name}`);
    } else {
      // Fallback to generated name if no --name found
      pm2Name = createPM2Name(projectId, task.label);
      console.log(
        `Task "${task.label}" PM2 command without --name, using generated: ${pm2Name}`
      );
    }
    executionCommand = command;
    console.log(`Task "${task.label}" is already a PM2 command`);
  } else {
    // Create unique PM2 process name for non-PM2 commands
    pm2Name = createPM2Name(projectId, task.label);
    executionCommand = `pm2 start "${command}" --name "${pm2Name}"`;
    console.log(
      `Task "${task.label}" will be wrapped in PM2 with name: ${pm2Name}`
    );
  }

  console.log(`Executing task "${task.label}" with PM2 name: ${pm2Name}`);
  console.log(`Command: ${command}`);

  return await new Promise((resolve) => {
    // First, try to delete any existing process with the same name
    console.log(`🗑️  Attempting to delete existing PM2 process: ${pm2Name}`);
    exec(
      `pm2 delete ${pm2Name}`,
      { cwd: projectPath },
      (deleteError, deleteStdout, deleteStderr) => {
        if (deleteError) {
          console.log(`PM2 delete ${pm2Name}: ${deleteError.message}`);
          if (deleteStderr) console.log(`PM2 delete stderr: ${deleteStderr}`);
        } else {
          console.log(
            `✅ Successfully deleted existing PM2 process: ${pm2Name}`
          );
          if (deleteStdout) console.log(`PM2 delete stdout: ${deleteStdout}`);
        }

        if (isPM2Command) {
          // Execute PM2 command directly
          console.log(`Running PM2 command directly: ${executionCommand}`);

          exec(
            executionCommand,
            { cwd: projectPath },
            (error, stdout, stderr) => {
              if (error) {
                console.error(
                  `PM2 start error for "${task.label}": ${error.message}`
                );
                console.error(`PM2 stdout: ${stdout || "(empty)"}`);
                console.error(`PM2 stderr: ${stderr || "(empty)"}`);
                resolve({
                  taskLabel: task.label,
                  pm2Name: pm2Name,
                  success: false,
                  error: error.message,
                  command: command,
                  pm2Command: executionCommand,
                  stdout: stdout || "",
                  stderr: stderr || "",
                });
              } else {
                console.log(
                  `PM2 started task "${task.label}" successfully as ${pm2Name}`
                );
                console.log(`PM2 stdout: ${stdout || "(empty)"}`);
                resolve({
                  taskLabel: task.label,
                  pm2Name: pm2Name,
                  success: true,
                  command: command,
                  pm2Command: executionCommand,
                  message: `Task started with PM2 as ${pm2Name}`,
                  stdout: stdout || "",
                  stderr: stderr || "",
                });
              }
            }
          );
        } else {
          // Create a temporary script file for PM2 to execute (legacy behavior)
          const scriptPath = path.join(projectPath, `pm2-${pm2Name}.sh`);
          const scriptContent = `#!/bin/bash\ncd "${projectPath}"\n${command}\n`;

          // Write the script file
          try {
            require("fs").writeFileSync(scriptPath, scriptContent);
            require("fs").chmodSync(scriptPath, "755");
            console.log(`Created PM2 script: ${scriptPath}`);
          } catch (writeError) {
            console.error(`Error creating script file: ${writeError.message}`);
            resolve({
              taskLabel: task.label,
              pm2Name: pm2Name,
              success: false,
              error: `Script creation failed: ${writeError.message}`,
              command: command,
            });
            return;
          }

          // Use PM2 to run the script
          const pm2Command = `pm2 start "${scriptPath}" --name "${pm2Name}" --cwd "${projectPath}"`;
          console.log(`Running PM2 command: ${pm2Command}`);

          exec(pm2Command, { cwd: projectPath }, (error, stdout, stderr) => {
            // Clean up script file after PM2 has had time to read it
            setTimeout(() => {
              try {
                require("fs").unlinkSync(scriptPath);
                console.log(`Cleaned up script file: ${scriptPath}`);
              } catch (e) {
                console.log(`Could not clean up script file: ${e.message}`);
              }
            }, 2000); // Wait 2 seconds before cleanup

            if (error) {
              console.error(
                `PM2 start error for "${task.label}": ${error.message}`
              );
              console.error(`PM2 stdout: ${stdout || "(empty)"}`);
              console.error(`PM2 stderr: ${stderr || "(empty)"}`);
              resolve({
                taskLabel: task.label,
                pm2Name: pm2Name,
                success: false,
                error: error.message,
                command: command,
                pm2Command: pm2Command,
                stdout: stdout || "",
                stderr: stderr || "",
              });
            } else {
              console.log(
                `PM2 started task "${task.label}" successfully as ${pm2Name}`
              );
              console.log(`PM2 stdout: ${stdout || "(empty)"}`);
              resolve({
                taskLabel: task.label,
                pm2Name: pm2Name,
                success: true,
                command: command,
                pm2Command: pm2Command,
                message: `Task started with PM2 as ${pm2Name}`,
                stdout: stdout || "",
                stderr: stderr || "",
              });
            }
          });
        }
      }
    );
  });
};

// Execute all "Start All" tasks endpoint
app.post("/api/execute-start-all-tasks", async (req, res) => {
  const { projects } = req.body;

  if (!projects || !Array.isArray(projects)) {
    return res.status(400).json({
      error: "Invalid request. projects array is required.",
    });
  }

  console.log(`Executing "Start All" tasks for ${projects.length} projects`);

  try {
    const results = [];

    // Execute tasks for each project in parallel
    const taskPromises = projects.map(async (project) => {
      const {
        id: projectId,
        projectPath,
        startAllTasks,
        vscodeTasksInfo,
      } = project;

      if (!startAllTasks || startAllTasks.length === 0) {
        return {
          projectId,
          success: false,
          message: "No 'Start All' tasks found",
          tasks: [],
        };
      }

      if (!vscodeTasksInfo || !vscodeTasksInfo.tasks) {
        return {
          projectId,
          success: false,
          message: "No VS Code tasks information available",
          tasks: [],
        };
      }

      // Execute only the FIRST "Start All" task to avoid duplicates
      const taskResults = [];

      if (startAllTasks.length > 1) {
        console.log(
          `⚠️  Found ${startAllTasks.length} "Start All" tasks, executing only the first one to avoid duplicates:`,
          startAllTasks.map((t) => t.label)
        );
      }

      const startAllTask = startAllTasks[0]; // Only execute the first one

      try {
        console.log(`Processing "Start All" task: ${startAllTask.label}`);

        // Resolve dependent tasks
        const executableTasks = resolveDependentTasks(
          startAllTask,
          vscodeTasksInfo.tasks
        );

        if (executableTasks.length === 0) {
          console.log(`No executable tasks found for "${startAllTask.label}"`);
          taskResults.push({
            taskLabel: startAllTask.label,
            success: false,
            error: "No executable dependent tasks found",
          });
        } else {
          console.log(
            `Found ${executableTasks.length} dependent tasks to execute:`,
            executableTasks.map((t) => t.label)
          );

          // Execute each dependent task
          for (const task of executableTasks) {
            const taskResult = await executeTask(task, projectPath, projectId);
            taskResults.push(taskResult);

            // Small delay between tasks to avoid overwhelming the system
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      } catch (error) {
        taskResults.push({
          taskLabel: startAllTask.label,
          success: false,
          error: error.message,
        });
      }

      const successfulTasks = taskResults.filter((r) => r.success).length;
      return {
        projectId,
        projectPath,
        success: successfulTasks > 0,
        message: `Started ${successfulTasks}/${taskResults.length} tasks successfully`,
        tasks: taskResults,
      };
    });

    const allResults = await Promise.all(taskPromises);
    const successfulProjects = allResults.filter((r) => r.success).length;

    res.json({
      success: successfulProjects > 0,
      message: `Successfully started tasks for ${successfulProjects}/${projects.length} projects`,
      totalProjects: projects.length,
      successfulProjects,
      results: allResults,
    });
  } catch (error) {
    console.error("Error executing start all tasks:", error);
    res.status(500).json({
      error: "Failed to execute start all tasks",
      details: error.message,
    });
  }
});

// PM2 delete all processes for a project endpoint
app.post("/api/pm2-delete-all", async (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({
      error: "Invalid request. projectId is required.",
    });
  }

  console.log(`Deleting all PM2 processes for project: ${projectId}`);

  try {
    // Get list of all PM2 processes
    const listResult = await new Promise((resolve) => {
      // Use PM2_NO_COLOR and --no-color to force non-colored output
      // Suppress stderr to avoid any warning messages
      const env = {
        ...process.env,
        PM2_NO_COLOR: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      };
      exec(
        "pm2 jlist --no-color 2>/dev/null",
        { env },
        (error, stdout, stderr) => {
          if (error) {
            console.error(`PM2 list error: ${error.message}`);
            resolve({ success: false, processes: [] });
          } else {
            try {
              // Strip any non-JSON content before the opening bracket
              let cleanedOutput = stdout || "[]";
              const jsonStart = cleanedOutput.indexOf("[");
              if (jsonStart > 0) {
                cleanedOutput = cleanedOutput.substring(jsonStart);
              }

              const processes = JSON.parse(cleanedOutput);
              resolve({ success: true, processes });
            } catch (parseError) {
              resolve({ success: false, processes: [] });
            }
          }
        }
      );
    });

    if (!listResult.success) {
      throw new Error("Failed to get PM2 process list");
    }

    // Filter processes that belong to this project
    const projectPrefix = projectId.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const projectProcesses = listResult.processes.filter(
      (process) => process.name && process.name.startsWith(`${projectPrefix}-`)
    );

    console.log(
      `Found ${projectProcesses.length} PM2 processes for project ${projectId}`
    );

    if (projectProcesses.length === 0) {
      return res.json({
        success: true,
        message: `No PM2 processes found for project ${projectId}`,
        projectId,
        deletedCount: 0,
        processes: [],
      });
    }

    // Delete each process
    const deleteResults = [];
    for (const process of projectProcesses) {
      const deleteResult = await new Promise((resolve) => {
        exec(`pm2 delete ${process.name}`, (error, stdout, stderr) => {
          if (error) {
            console.error(
              `PM2 delete error for ${process.name}: ${error.message}`
            );
            resolve({
              processName: process.name,
              success: false,
              error: error.message,
            });
          } else {
            console.log(`PM2 process ${process.name} deleted successfully`);
            resolve({
              processName: process.name,
              success: true,
            });
          }
        });
      });
      deleteResults.push(deleteResult);
    }

    const successfulDeletes = deleteResults.filter((r) => r.success).length;
    const failedDeletes = deleteResults.filter((r) => !r.success).length;

    res.json({
      success: successfulDeletes > 0,
      message: `Deleted ${successfulDeletes}/${projectProcesses.length} PM2 processes for project ${projectId}`,
      projectId,
      deletedCount: successfulDeletes,
      failedCount: failedDeletes,
      totalCount: projectProcesses.length,
      results: deleteResults,
    });
  } catch (error) {
    console.error("Error deleting PM2 processes:", error);
    res.status(500).json({
      error: "Failed to delete PM2 processes",
      details: error.message,
      projectId,
    });
  }
});

// PM2 restart process endpoint
app.post("/api/pm2-restart", async (req, res) => {
  const { projectId, taskLabel, pm2Name } = req.body;

  if (!projectId || !taskLabel) {
    return res.status(400).json({
      error: "Invalid request. projectId and taskLabel are required.",
    });
  }

  const processName = pm2Name || createPM2Name(projectId, taskLabel);

  console.log(`Restarting PM2 process: ${processName}`);

  try {
    const restartResult = await new Promise((resolve) => {
      exec(`pm2 restart ${processName}`, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `PM2 restart error for ${processName}: ${error.message}`
          );
          resolve({
            success: false,
            error: error.message,
            stdout: stdout || "",
            stderr: stderr || "",
          });
        } else {
          console.log(`PM2 process ${processName} restarted successfully`);
          resolve({
            success: true,
            message: `Successfully restarted process ${processName}`,
            stdout: stdout || "",
            stderr: stderr || "",
          });
        }
      });
    });

    res.json({
      success: restartResult.success,
      message: restartResult.message || restartResult.error,
      projectId,
      taskLabel,
      pm2Name: processName,
      result: restartResult,
    });
  } catch (error) {
    console.error("Error restarting PM2 process:", error);
    res.status(500).json({
      error: "Failed to restart PM2 process",
      details: error.message,
    });
  }
});

// PM2 delete process endpoint
app.post("/api/pm2-delete", async (req, res) => {
  const { projectId, taskLabel, pm2Name } = req.body;

  if (!projectId || !taskLabel) {
    return res.status(400).json({
      error: "Invalid request. projectId and taskLabel are required.",
    });
  }

  const processName = pm2Name || createPM2Name(projectId, taskLabel);

  console.log(`Deleting PM2 process: ${processName}`);

  try {
    const deleteResult = await new Promise((resolve) => {
      exec(`pm2 delete ${processName}`, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `PM2 delete error for ${processName}: ${error.message}`
          );
          resolve({
            success: false,
            error: error.message,
            stdout: stdout || "",
            stderr: stderr || "",
          });
        } else {
          console.log(`PM2 process ${processName} deleted successfully`);
          resolve({
            success: true,
            message: `Successfully deleted process ${processName}`,
            stdout: stdout || "",
            stderr: stderr || "",
          });
        }
      });
    });

    res.json({
      success: deleteResult.success,
      message: deleteResult.message || deleteResult.error,
      projectId,
      taskLabel,
      pm2Name: processName,
      result: deleteResult,
    });
  } catch (error) {
    console.error("Error deleting PM2 process:", error);
    res.status(500).json({
      error: "Failed to delete PM2 process",
      details: error.message,
    });
  }
});

// PM2 logs endpoint
app.post("/api/pm2-logs", async (req, res) => {
  const { projectId, taskLabel, pm2Name, lines = 50 } = req.body;

  if (!projectId || !taskLabel) {
    return res.status(400).json({
      error: "Invalid request. projectId and taskLabel are required.",
    });
  }

  const processName = pm2Name || createPM2Name(projectId, taskLabel);

  console.log(`Getting PM2 logs for process: ${processName}`);

  try {
    const logsResult = await new Promise((resolve) => {
      exec(
        `pm2 logs ${processName} --lines ${lines} --nostream`,
        (error, stdout, stderr) => {
          if (error) {
            console.error(
              `PM2 logs error for ${processName}: ${error.message}`
            );
            resolve({
              success: false,
              error: error.message,
              logs: "",
              stderr: stderr || "",
            });
          } else {
            console.log(`PM2 logs retrieved for ${processName}`);
            resolve({
              success: true,
              logs: stdout || "",
              stderr: stderr || "",
            });
          }
        }
      );
    });

    res.json({
      success: logsResult.success,
      message: logsResult.success
        ? `Retrieved logs for ${processName}`
        : logsResult.error,
      projectId,
      taskLabel,
      pm2Name: processName,
      logs: logsResult.logs,
      result: logsResult,
    });
  } catch (error) {
    console.error("Error getting PM2 logs:", error);
    res.status(500).json({
      error: "Failed to get PM2 logs",
      details: error.message,
    });
  }
});

// PM2 logs in terminal endpoint
app.post("/api/pm2-logs-terminal", async (req, res) => {
  const { projectId, taskLabel, pm2Name } = req.body;

  if (!projectId || !taskLabel) {
    return res.status(400).json({
      error: "Invalid request. projectId and taskLabel are required.",
    });
  }

  const processName = pm2Name || createPM2Name(projectId, taskLabel);

  console.log(`Opening terminal to view PM2 logs for process: ${processName}`);

  try {
    // First, try to check if iTerm2 is available and running
    const checkItermCommand = `osascript -e 'tell application "System Events" to (name of processes) contains "iTerm2"'`;

    const isItermRunning = await new Promise((resolve) => {
      exec(checkItermCommand, (error, stdout, stderr) => {
        if (error) {
          resolve(false);
        } else {
          resolve(stdout.trim() === "true");
        }
      });
    });

    let terminalCommand;
    let terminalType;

    if (isItermRunning) {
      // Use iTerm2 if it's running
      terminalType = "iTerm2";
      terminalCommand = `
        osascript -e 'tell application "iTerm2"
          try
            create window with default profile
            tell current session of current window
              write text "echo \\"PM2 Logs for ${processName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && pm2 logs ${processName} --lines 100"
            end tell
            tell current window
              set fullScreen to true
            end tell
            activate
          on error errorMessage
            error errorMessage
          end try
        end tell'
      `;
    } else {
      // Check if iTerm2 is installed but not running
      const checkItermInstalledCommand = `osascript -e 'tell application "System Events" to exists application "iTerm2"'`;

      const isItermInstalled = await new Promise((resolve) => {
        exec(checkItermInstalledCommand, (error, stdout, stderr) => {
          if (error) {
            resolve(false);
          } else {
            resolve(stdout.trim() === "true");
          }
        });
      });

      if (isItermInstalled) {
        // iTerm2 is installed, try to launch it
        terminalType = "iTerm2";
        terminalCommand = `
          osascript -e 'tell application "iTerm2"
            try
              create window with default profile
              tell current session of current window
                write text "echo \\"PM2 Logs for ${processName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && pm2 logs ${processName} --lines 100"
              end tell
              tell current window
                set fullScreen to true
              end tell
              activate
            on error errorMessage
              error errorMessage
            end try
          end tell'
        `;
      } else {
        // Fall back to default Terminal app
        terminalType = "Terminal";
        terminalCommand = `
          osascript -e 'tell application "Terminal"
            try
              do script "echo \\"PM2 Logs for ${processName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && pm2 logs ${processName} --lines 100"
              activate
            on error errorMessage
              error errorMessage
            end try
          end tell'
        `;
      }
    }

    console.log(
      `Attempting to open ${terminalType} for PM2 logs: ${processName}`
    );

    await new Promise((resolve, reject) => {
      exec(terminalCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error opening ${terminalType} for PM2 logs ${processName}:`,
            error.message
          );

          // If iTerm2 failed, try Terminal as final fallback
          if (terminalType === "iTerm2") {
            console.log("iTerm2 failed, trying Terminal app as fallback...");

            const fallbackCommand = `
              osascript -e 'tell application "Terminal"
                try
                  do script "echo \\"PM2 Logs for ${processName}\\" && echo \\"Press Ctrl+C to stop\\" && echo \\"---\\" && pm2 logs ${processName} --lines 100"
                  activate
                on error errorMessage
                  error errorMessage
                end try
              end tell'
            `;

            exec(
              fallbackCommand,
              (fallbackError, fallbackStdout, fallbackStderr) => {
                if (fallbackError) {
                  console.error(
                    `Terminal fallback also failed: ${fallbackError.message}`
                  );
                  reject(
                    new Error(
                      `Failed to open both iTerm2 and Terminal: ${error.message} / ${fallbackError.message}`
                    )
                  );
                } else {
                  console.log(
                    `Successfully opened Terminal (fallback) for PM2 logs ${processName}`
                  );
                  resolve("Terminal");
                }
              }
            );
          } else {
            reject(new Error(`Failed to open Terminal: ${error.message}`));
          }
        } else {
          console.log(
            `Successfully opened ${terminalType} for PM2 logs ${processName}`
          );
          resolve(terminalType);
        }
      });
    });

    res.json({
      success: true,
      message: `Successfully opened terminal for PM2 logs ${processName}`,
      projectId,
      taskLabel,
      pm2Name: processName,
      terminalApp: terminalType,
    });
  } catch (error) {
    console.error("Error opening terminal for PM2 logs:", error);
    res.status(500).json({
      error: "Failed to open terminal for PM2 logs",
      details: error.message,
      suggestion:
        "Make sure Terminal.app is accessible. iTerm2 is optional but recommended.",
    });
  }
});

// Check port status endpoint
app.post("/api/check-ports", async (req, res) => {
  const { services } = req.body;

  if (!services || !Array.isArray(services)) {
    return res.status(400).json({
      error: "Invalid request. services array is required.",
    });
  }

  console.log(`Checking status for ${services.length} services`);

  try {
    const checkPromises = services.map(async (service) => {
      if (!service.port) {
        return {
          ...service,
          isRunning: false,
          error: "No port specified",
        };
      }

      return new Promise((resolve) => {
        // Use lsof to check if port is in use
        const command = `lsof -i :${service.port} -t`;

        exec(command, (error, stdout, stderr) => {
          if (error) {
            // Port is not in use
            resolve({
              ...service,
              isRunning: false,
              pid: null,
              processName: null,
            });
          } else {
            // Port is in use, get process info
            const pids = stdout
              .trim()
              .split("\n")
              .filter((pid) => pid);
            if (pids.length > 0) {
              const mainPid = pids[0];

              // Get process name
              const processCommand = `ps -p ${mainPid} -o comm= 2>/dev/null || echo "unknown"`;
              exec(
                processCommand,
                (processError, processStdout, processStderr) => {
                  resolve({
                    ...service,
                    isRunning: true,
                    pid: mainPid,
                    processName: processStdout.trim() || "unknown",
                  });
                }
              );
            } else {
              resolve({
                ...service,
                isRunning: false,
                pid: null,
                processName: null,
              });
            }
          }
        });
      });
    });

    const results = await Promise.all(checkPromises);

    res.json({
      success: true,
      services: results,
      message: `Checked ${results.length} services`,
    });
  } catch (error) {
    console.error("Error checking port status:", error);
    res.status(500).json({
      error: "Failed to check port status",
      details: error.message,
    });
  }
});

// Get git status for a project
app.post("/api/git-status", async (req, res) => {
  const { projectPath } = req.body;

  if (!projectPath) {
    return res.status(400).json({ error: "Project path is required" });
  }

  try {
    const gitInfo = await getGitInfo(projectPath);
    res.json({ success: true, gitInfo });
  } catch (error) {
    console.error("Error getting git status:", error);
    res.status(500).json({ error: error.message });
  }
});

// PM2 list processes endpoint
app.get("/api/pm2-list", async (req, res) => {
  console.log("Getting PM2 process list");

  try {
    const listResult = await new Promise((resolve) => {
      // Use PM2_NO_COLOR and --no-color to force non-colored output
      // Suppress stderr to avoid any warning messages
      const env = {
        ...process.env,
        PM2_NO_COLOR: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      };
      exec(
        "pm2 jlist --no-color 2>/dev/null",
        { env },
        (error, stdout, stderr) => {
          if (error) {
            console.error(`PM2 list error: ${error.message}`);
            resolve({
              success: false,
              error: error.message,
              processes: [],
              stderr: stderr || "",
            });
          } else {
            try {
              // Strip any non-JSON content before the opening bracket
              let cleanedOutput = stdout || "[]";
              const jsonStart = cleanedOutput.indexOf("[");
              if (jsonStart > 0) {
                cleanedOutput = cleanedOutput.substring(jsonStart);
              }

              const processes = JSON.parse(cleanedOutput);
              console.log(`PM2 list retrieved: ${processes.length} processes`);
              resolve({
                success: true,
                processes: processes,
                stderr: stderr || "",
              });
            } catch (parseError) {
              console.error(`PM2 list parse error: ${parseError.message}`);
              console.error(
                `PM2 raw output (first 500 chars): ${(stdout || "").substring(
                  0,
                  500
                )}`
              ); // Log first 500 chars for debugging
              resolve({
                success: false,
                error: `Failed to parse PM2 output: ${parseError.message}`,
                processes: [],
                stderr: stderr || "",
              });
            }
          }
        }
      );
    });

    res.json({
      success: listResult.success,
      message: listResult.success
        ? `Retrieved ${listResult.processes.length} PM2 processes`
        : listResult.error,
      processes: listResult.processes,
      result: listResult,
    });
  } catch (error) {
    console.error("Error getting PM2 process list:", error);
    res.status(500).json({
      error: "Failed to get PM2 process list",
      details: error.message,
    });
  }
});

// Start server function
const startServer = () => {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Port killer service running on http://localhost:${PORT}`);
    console.log(
      `📡 Ready to kill ports and focus terminals for your projects!`
    );
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🛑 Port killer service shutting down...");
    server.close(() => {
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("🛑 Port killer service shutting down...");
    server.close(() => {
      process.exit(0);
    });
  });

  return server;
};

// Export the app and start function
module.exports = { app, startServer };

// If this file is run directly (not imported), start the server
if (require.main === module) {
  startServer();
}
