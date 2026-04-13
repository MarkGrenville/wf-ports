/**
 * Project Configuration Models for PortIO
 *
 * These models define the structure of wf-ports.json files and the
 * project objects used throughout the application.
 */

/**
 * Service object in wf-ports.json
 * @typedef {Object} ServiceConfig
 * @property {string} name - Service name (e.g., "Frontend", "API")
 * @property {number} port - Port number
 * @property {string} url - URL to open in browser
 * @property {string} [purpose] - Description of what the service does
 */

/**
 * wf-ports.json configuration file structure
 * This is what users define in their project root
 *
 * @typedef {Object} WFPortsConfig
 * @property {string} id - Unique identifier (lowercase with hyphens)
 * @property {string} name - Display name shown in PortIO
 * @property {ServiceConfig[]} services - Array of services to monitor
 * @property {string} [faviconPath] - Absolute path to favicon image (source file)
 * @property {string} [description] - Brief project description
 * @property {string} [focusIdentifier] - Identifier to focus Cursor window
 * @property {string} [projectPath] - Absolute path to project root
 * @property {string} [projectBackendPath] - Path to backend subdirectory
 * @property {string} [firebaseProjectId] - Firebase project ID
 */

/**
 * Git information detected from project
 * @typedef {Object} GitInfo
 * @property {string} branch - Current branch name
 * @property {Object} status - Git status
 * @property {boolean} status.hasUncommittedChanges - Whether there are uncommitted changes
 * @property {string} [repoUrl] - Remote repository URL
 */

/**
 * Firebase information detected or configured
 * @typedef {Object} FirebaseInfo
 * @property {boolean} isFirebaseProject - Whether this is a Firebase project
 * @property {string} [projectId] - Firebase project ID
 * @property {string} [currentProject] - Current active project
 */

/**
 * Full project object used in the application
 * This is what's stored in Firestore and used by the frontend
 *
 * @typedef {Object} Project
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {ServiceConfig[]} services - Array of services
 * @property {string} [favicon] - Public URL to favicon (e.g., "/project-icons/myapp.png")
 * @property {string} [faviconPath] - Original absolute path from config (preserved for reference)
 * @property {string} [description] - Project description
 * @property {string} [focusIdentifier] - Cursor window identifier
 * @property {string} projectPath - Absolute path to project root
 * @property {string} [projectBackendPath] - Path to backend subdirectory
 * @property {string} [firebaseProjectId] - Firebase project ID from config
 * @property {string} configPath - Path to wf-ports.json
 * @property {string} directoryName - Name of project directory
 * @property {boolean} pathExists - Whether project path exists
 * @property {Object} [vscodeTasksInfo] - VS Code tasks.json info
 * @property {Array} startAllTasks - "Start All" type tasks
 * @property {boolean} hasStartAllTasks - Whether project has start all tasks
 * @property {GitInfo} [gitInfo] - Git information
 * @property {FirebaseInfo} [firebaseInfo] - Firebase information
 */

/**
 * Database Model - What gets saved to Firestore
 * This is the exact structure stored in the 'projects' collection
 */
export const DATABASE_MODEL = {
  // Example document structure in Firestore
  example: {
    // From wf-ports.json (user-defined)
    id: "my-project",
    name: "My Project",
    description: "A full-stack web application",
    services: [
      {
        name: "Frontend",
        port: 3000,
        url: "http://localhost:3000",
        purpose: "React web application",
      },
      {
        name: "API",
        port: 3001,
        url: "http://localhost:3001",
        purpose: "Express backend server",
      },
    ],
    focusIdentifier: "my-project",
    firebaseProjectId: "my-firebase-project",

    // Paths
    projectPath: "/Users/me/Projects/my-project",
    projectBackendPath: "/Users/me/Projects/my-project/backend",
    configPath: "/Users/me/Projects/my-project/wf-ports.json",
    directoryName: "my-project",
    pathExists: true,

    // Favicon
    faviconPath: "/Users/me/Projects/my-project/public/icon.png", // Original source path
    favicon: "/project-icons/my-project.png", // Public URL (set by server)

    // VS Code Tasks
    vscodeTasksInfo: {
      tasksPath: "/Users/me/Projects/my-project/.vscode/tasks.json",
      tasks: [{ label: "Start Dev", type: "shell", command: "npm run dev" }],
    },
    startAllTasks: [{ label: "A. Start All", type: "shell" }],
    hasStartAllTasks: true,

    // Git Info (auto-detected)
    gitInfo: {
      branch: "main",
      status: {
        hasUncommittedChanges: false,
      },
      repoUrl: "https://github.com/user/my-project",
    },

    // Firebase Info (auto-detected or from firebaseProjectId)
    firebaseInfo: {
      isFirebaseProject: true,
      projectId: "my-firebase-project",
      currentProject: "my-firebase-project",
    },
  },

  // Field definitions
  fields: {
    // Required fields
    id: { type: "string", required: true, source: "wf-ports.json" },
    name: { type: "string", required: true, source: "wf-ports.json" },
    services: { type: "array", required: true, source: "wf-ports.json" },

    // Optional user-defined fields
    description: { type: "string", required: false, source: "wf-ports.json" },
    focusIdentifier: {
      type: "string",
      required: false,
      source: "wf-ports.json",
    },
    firebaseProjectId: {
      type: "string",
      required: false,
      source: "wf-ports.json",
    },
    faviconPath: { type: "string", required: false, source: "wf-ports.json" },

    // Paths (auto-detected or from config)
    projectPath: { type: "string", required: true, source: "auto-detected" },
    projectBackendPath: {
      type: "string",
      required: false,
      source: "wf-ports.json",
    },
    configPath: { type: "string", required: true, source: "auto-detected" },
    directoryName: { type: "string", required: true, source: "auto-detected" },
    pathExists: { type: "boolean", required: true, source: "auto-detected" },

    // Server-generated fields
    favicon: {
      type: "string",
      required: false,
      source: "server (copied to /project-icons/)",
    },

    // VS Code integration
    vscodeTasksInfo: {
      type: "object",
      required: false,
      source: "auto-detected from .vscode/tasks.json",
    },
    startAllTasks: { type: "array", required: true, source: "auto-detected" },
    hasStartAllTasks: {
      type: "boolean",
      required: true,
      source: "auto-detected",
    },

    // Git integration
    gitInfo: {
      type: "object",
      required: false,
      source: "auto-detected from .git",
    },

    // Firebase integration
    firebaseInfo: {
      type: "object",
      required: false,
      source: "auto-detected or from firebaseProjectId",
    },
  },
};

/**
 * Field documentation for wf-ports.json
 * Used for generating help documentation
 */
export const WF_PORTS_FIELDS = {
  required: [
    {
      name: "id",
      type: "string",
      description:
        "Unique identifier (lowercase with hyphens). Used for PM2 naming and database storage.",
      example: '"my-project"',
    },
    {
      name: "name",
      type: "string",
      description:
        "Display name shown in PortIO. Can contain spaces and special characters.",
      example: '"My Project"',
    },
    {
      name: "services",
      type: "array",
      description:
        "Array of service objects to monitor (see Service Object Fields)",
      example:
        '[{ "name": "Frontend", "port": 3000, "url": "http://localhost:3000" }]',
    },
  ],
  optional: [
    {
      name: "faviconPath",
      type: "string",
      description:
        "Absolute path to favicon image. Will be copied to public directory on rescan.",
      example: '"/Users/me/project/public/icon.png"',
    },
    {
      name: "description",
      type: "string",
      description: "Brief project description shown in details popup",
    },
    {
      name: "focusIdentifier",
      type: "string",
      description:
        "Identifier to focus Cursor window. Should match part of window title.",
    },
    {
      name: "projectPath",
      type: "string",
      description:
        "Absolute path to project root. Auto-detected if not specified.",
    },
    {
      name: "projectBackendPath",
      type: "string",
      description: "Path to backend subdirectory for terminal actions.",
    },
    {
      name: "firebaseProjectId",
      type: "string",
      description:
        "Firebase project ID. Enables Firebase Console and Google Cloud Console buttons.",
    },
    {
      name: "pm2Prefix",
      type: "string",
      description:
        "Custom prefix for PM2 process matching. Defaults to project id. PM2 processes must be named {prefix}-{taskLabel}.",
    },
  ],
  serviceFields: [
    {
      name: "name",
      type: "string",
      description: 'Service name (e.g., "Frontend", "API")',
    },
    { name: "port", type: "number", description: "Port number (e.g., 3000)" },
    { name: "url", type: "string", description: "URL to open in browser" },
    {
      name: "purpose",
      type: "string",
      description: "Description of what the service does",
      optional: true,
    },
  ],
};

export default WF_PORTS_FIELDS;
