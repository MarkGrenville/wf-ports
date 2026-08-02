const { formatBlockedMarkdown } = require("./blocked-ports");

function buildPortioDocsMarkdown(projects) {
  const allPorts = [];
  for (const project of projects) {
    if (Array.isArray(project.services)) {
      for (const service of project.services) {
        if (typeof service.port === "number" && !allPorts.includes(service.port)) {
          allPorts.push(service.port);
        }
      }
    }
  }
  allPorts.sort((a, b) => a - b);

  return `# PortIO Reference

PortIO is the local development manager for this Mac. It tracks ports, PM2 processes, scheduled jobs, and git/CI status across all projects under \`~/Projects\`. Dashboard: \`http://localhost:3850\`. Daemon API: \`http://127.0.0.1:3853\`.

Everything runs locally. No database. The daemon holds live state in-memory and pushes it to the browser over a localhost WebSocket. Port claims are the one exception; they persist on disk.

---

## Port Registry API

**Do not guess port numbers.** Claim them through the PortIO daemon so they don't conflict with the ${allPorts.length} ports already in use across ${projects.length} projects.

Swagger UI: \`http://127.0.0.1:3853/api-docs\`
OpenAPI spec: \`http://127.0.0.1:3853/openapi.json\`

| Method | Path | Purpose |
|--------|------|---------|
| \`GET\` | \`/api/ports\` | All declared, claimed, blocked, and listening ports |
| \`GET\` | \`/api/ports/next?count=N&from=4000\` | Suggest N free ports (no side effects) |
| \`POST\` | \`/api/ports/claim\` | Reserve port(s): \`{"projectId":"x","service":"Frontend","count":1}\` |
| \`DELETE\` | \`/api/ports/claim/:port\` | Release a previously claimed port |
| \`GET\` | \`/api/ports/conflicts\` | Ports declared by more than one project |
| \`GET\` | \`/api/ports/blocked\` | Ports that are never allocatable |

### What counts as "taken"

The allocator excludes: system ports 0-1023, curated service ports (MySQL 3306, PostgreSQL 5432, Redis 6379, etc.), all ports declared in any project's \`ports.json\`, all registry claims, and all ports currently listening (\`lsof\`).

### Workflow

\`\`\`bash
# 1. Find free ports
curl 'http://127.0.0.1:3853/api/ports/next?count=3&from=4000'

# 2. Claim them
curl -X POST http://127.0.0.1:3853/api/ports/claim \\
  -H 'Content-Type: application/json' \\
  -d '{"projectId":"my-app","service":"Frontend","count":1,"from":4000}'

# 3. Write the returned ports into your app config AND .webfootprint/ports.json
# Claiming does NOT auto-update ports.json.

# 4. Release if no longer needed
curl -X DELETE http://127.0.0.1:3853/api/ports/claim/4001
\`\`\`

### Currently used ports

${allPorts.join(", ")}

---

## Command API

All mutations go through \`POST http://127.0.0.1:3853/cmd\` with body \`{"type":"<type>","payload":{...}}\`.

| Type | Payload | Effect |
|------|---------|--------|
| \`killPort\` | \`{port}\` | \`kill -9\` all processes on that port |
| \`killPorts\` | \`{ports:[]}\` | Kill multiple ports |
| \`pm2Restart\` | \`{pm2Name, projectId}\` | Restart a PM2 process |
| \`pm2Delete\` | \`{pm2Name, projectId}\` | Delete a PM2 process |
| \`pm2DeleteAll\` | \`{projectId}\` | Delete all PM2 processes for a project |
| \`pm2Logs\` | \`{pm2Name, lines?}\` | Read last N log lines |
| \`executeTask\` | \`{task, projectPath, projectId, allTasks}\` | Run a VS Code task via PM2 |
| \`rescanProjects\` | \`{}\` | Re-scan \`~/Projects\` for config files |
| \`pauseCronJob\` | \`{plistPath}\` | \`launchctl unload\` a scheduled job |
| \`resumeCronJob\` | \`{plistPath}\` | \`launchctl load\` a scheduled job |
| \`cronJobLogs\` | \`{logFile, lines?}\` | Read last N lines of a cron job log |
| \`openFinder\` | \`{projectPath}\` | Open project folder in Finder |
| \`focusTerminal\` | \`{focusIdentifier, projectPath}\` | Focus a Cursor window |
| \`archiveProject\` | \`{projectPath, projectId}\` | Move project to \`~/Archived-Projects\` |

---

## WebSocket

\`ws://127.0.0.1:3853/ws\`

On connect the daemon sends a full snapshot: \`{"type":"snapshot","data":{...}}\`. After that, per-topic diffs: \`{"type":"update","topic":"<name>","data":<value>}\`. Topics only broadcast when their JSON actually changes.

| Topic | Poll interval | Content |
|-------|---------------|---------|
| \`projects\` | 5 min + file watcher | Array of project configs with git/firebase info |
| \`liveStatus\` | 1s | Per-project port status (running, PID, network vs local) |
| \`pm2\` | 2s | All PM2 processes (name, status, CPU, memory, uptime) |
| \`ciStatus\` | 30s (15s when active) | GitHub Actions runs per project |
| \`cronJobs\` | 10s | Scheduled launchd job status, run history |
| \`network\` | once | LAN IP and daemon port |
| \`portioDocs\` | on rescan | This documentation (markdown) |
| \`usedPortsExport\` | on rescan | Aggregated port data for export |

---

## Project Config: .webfootprint/ports.json

Place at \`<project>/.webfootprint/ports.json\`. This registers a project with PortIO for port monitoring, PM2 association, and dashboard display.

\`\`\`json
{
  "id": "my-project",
  "name": "My Project",
  "description": "What this project does",
  "services": [
    {"name": "Frontend", "port": 4200, "url": "http://localhost:4200", "purpose": "SvelteKit dev server"},
    {"name": "Backend", "port": 4201, "url": "http://localhost:4201", "purpose": "Express API"}
  ],
  "faviconPath": "/absolute/path/to/favicon.png",
  "focusIdentifier": "my-project"
}
\`\`\`

| Field | Required | Description |
|-------|----------|-------------|
| \`id\` | yes | Unique lowercase identifier with hyphens |
| \`name\` | yes | Display name |
| \`services\` | yes | Array of \`{name, port, url?, purpose?}\` |
| \`description\` | no | Shown in project details modal |
| \`faviconPath\` | no | Absolute path to icon (png/svg/ico/webp, max 64KB) |
| \`focusIdentifier\` | no | Substring to match Cursor window title for focus |
| \`firebaseProjectId\` | no | Auto-detected from \`.firebaserc\` if not set |
| \`pm2Prefix\` | no | Custom prefix for PM2 process matching (defaults to \`id\`) |
| \`hiddenServices\` | no | Array of port numbers to hide from the dashboard by default |

### PM2 naming

PM2 processes should be named \`{projectId}-{taskName}\` (e.g. \`my-project-frontend\`). PortIO uses the prefix to associate processes with projects.

---

## Scheduled Jobs: .webfootprint/cron.json

Place at \`<project>/.webfootprint/cron.json\` to register launchd-scheduled jobs for monitoring. PortIO polls these every 10 seconds and shows them on the Cron tab (\`http://localhost:3850/cron\`).

\`\`\`json
{
  "jobs": [
    {
      "label": "com.myproject.generate",
      "name": "Page Generator",
      "description": "Generates content hourly via a Cursor agent",
      "lockFile": ".my-job.lock",
      "logFile": "logs/generator.log",
      "plistPath": "~/Library/LaunchAgents/com.myproject.generate.plist"
    }
  ]
}
\`\`\`

| Field | Required | Description |
|-------|----------|-------------|
| \`label\` | yes | launchd job label (must match the plist \`Label\` key) |
| \`name\` | yes | Human-readable display name |
| \`description\` | no | Shown on the cron monitoring page |
| \`lockFile\` | no | Path relative to project root; if present and not stale (<2h), job is "running" |
| \`logFile\` | no | Path relative to project root; parsed for run history |
| \`plistPath\` | no | Path to the \`.plist\` file (supports \`~/\`); enables pause/resume and schedule parsing |

### What the poller checks

- **launchctl list**: is the job loaded? What PID? Last exit code?
- **Lock file**: does it exist? How old? Contains a PID?
- **Log file**: parses \`[timestamp] Starting...\` and \`[timestamp] Run finished with exit code N.\` lines to build run history.

### Log format for automatic parsing

The poller recognizes these log line patterns:

\`\`\`
[2026-08-02T10:00:00Z] Starting page generation run...
[2026-08-02T10:09:39Z] Run finished with exit code 0.
[2026-08-02T11:00:00Z] Skipping: previous run still in progress (lock age 540s).
\`\`\`

Lines matching \`[ISO-timestamp] Starting\` open a run. Lines matching \`[ISO-timestamp] Run finished with exit code N.\` close it. Lines matching \`[ISO-timestamp] Skipping\` record a skipped run. Anything else is ignored.

### Pause/Resume

\`\`\`bash
# Pause (unload from launchd)
curl -X POST http://127.0.0.1:3853/cmd \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"pauseCronJob","payload":{"plistPath":"/Users/.../com.x.plist"}}'

# Resume (reload into launchd)
curl -X POST http://127.0.0.1:3853/cmd \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"resumeCronJob","payload":{"plistPath":"/Users/.../com.x.plist"}}'
\`\`\`

---

## Blocked Ports

${formatBlockedMarkdown()}

---

## Architecture

\`\`\`
portio-daemon (:3853)        portio-frontend-svelte (:3850)
  HTTP + WebSocket               SvelteKit dev server
  POST /cmd (actions)            Subscribes to WS topics
  GET /api/ports* (REST)         Renders live state
  Pollers:                       Stores:
    projects (5m + watcher)        projects, liveStatus,
    ports (1s lsof)                pm2, ci, cron, network
    pm2 (2s)
    git (30s)
    ci (30s/15s GitHub API)
    cron (10s launchd/logs)
\`\`\`

The daemon is the only process that reads system state (lsof, pm2, launchctl, git). The frontend is purely reactive, subscribing to WebSocket topics. A daemon restart rebuilds all state within ~1 second; the UI auto-reconnects.
`;
}

function buildUsedPortsExport(projects) {
  const allPorts = new Set();
  const portToServices = new Map();
  const projectsOut = [];

  for (const project of projects) {
    if (!Array.isArray(project.services)) continue;
    const svcOut = [];
    for (const svc of project.services) {
      if (typeof svc.port !== "number") continue;
      allPorts.add(svc.port);
      svcOut.push({
        name: svc.name,
        port: svc.port,
        description: svc.purpose || "",
        url: svc.url,
      });
      if (!portToServices.has(svc.port)) portToServices.set(svc.port, []);
      portToServices.get(svc.port).push({ project: project.name || project.id, service: svc.name });
    }
    projectsOut.push({
      id: project.id,
      name: project.name || project.id,
      path: project.projectPath,
      services: svcOut,
    });
  }

  const duplicatePorts = [];
  for (const [port, usedBy] of portToServices.entries()) {
    if (usedBy.length > 1) duplicatePorts.push({ port, usedBy });
  }

  const portsByType = {};
  for (const project of projectsOut) {
    for (const svc of project.services) {
      const type = svc.name?.toLowerCase().includes("backend")
        ? "Backend"
        : svc.name?.toLowerCase().includes("frontend")
        ? "Frontend"
        : svc.name?.toLowerCase().includes("emul")
        ? "Emulator"
        : "Other";
      if (!portsByType[type]) portsByType[type] = [];
      portsByType[type].push({ port: svc.port, project: project.name });
    }
  }

  return {
    summary: {
      totalProjects: projectsOut.length,
      totalPorts: Array.from(allPorts).length,
      uniquePorts: Array.from(allPorts).length,
      lastScanned: new Date().toISOString(),
    },
    allPorts: Array.from(allPorts).sort((a, b) => a - b),
    projects: projectsOut,
    duplicatePorts,
    portsByType,
  };
}

module.exports = { buildPortioDocsMarkdown, buildUsedPortsExport };
