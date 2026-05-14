# portio-daemon

Background process that polls ports / PM2 / git on this Mac and pushes
everything into Firestore. Listens for command docs and executes them.

## Setup

### 1. Mint a Firebase Admin service account

The daemon needs admin credentials for Firestore project `portio-ea1df`.

1. Open https://console.firebase.google.com/project/portio-ea1df/settings/serviceaccounts/adminsdk
2. Click **Generate new private key**, save the JSON file.
3. Move it into place:
   ```bash
   mkdir -p ~/.portio
   mv ~/Downloads/portio-ea1df-firebase-adminsdk-*.json ~/.portio/firebase-service-account.json
   chmod 600 ~/.portio/firebase-service-account.json
   ```

### 2. Start the daemon under PM2

```bash
cd ~/Projects/portio
pm2 start daemon/index.js --name portio-daemon
pm2 save
```

The daemon will:

- Scan `~/Projects/*/wf-ports.json` immediately, then every 5 min plus on file change.
- Poll ports every 10 s, PM2 every 5 s, git every 30 s.
- Listen for new docs in the `commands/` collection in Firestore.
- Run `caffeinate -dimsu -w <pid>` to keep the Mac awake while the daemon is running
  (set `PORTIO_DISABLE_CAFFEINATE=1` to disable).

### 3. Verify

Within a few seconds you should see:

- `pm2 logs portio-daemon` printing scan / poller messages.
- New docs in Firestore: `projects/`, `liveStatus/`, `pm2/`, `system/portioDocs`,
  `system/usedPortsExport`.

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | `~/.portio/firebase-service-account.json` | Service account JSON path |
| `PROJECTS_BASE_PATH` | `~/Projects` | Where to scan for `wf-ports.json` |
| `AGENT_RUNNER_HOSTNAME` | `os.hostname()` | Used in command claim transactions |
| `PORTIO_DISABLE_CAFFEINATE` | `0` | Set `1` to skip the no-sleep wrapper |

## Module map

```
daemon/
  index.js              entry: starts pollers + command listener
  firestore.js          firebase-admin init
  pollers/
    projects.js         5 min + chokidar -> projects/{id}, system/portioDocs, system/usedPortsExport
    ports.js            10 s -> liveStatus/{id}
    pm2.js              5 s -> pm2/{name}
    git.js              30 s -> projects/{id}.gitInfo
  commands/
    listener.js         onSnapshot pending, atomic claim, dispatch
    sweep.js            delete commands > 1 h old
    handlers/index.js   one function per command type
  shared/
    exec.js, lsof.js, pm2.js, git.js, firebase-info.js,
    scan.js, applescript.js, task-runner.js, docs.js
```

## Command types

The Svelte UI dispatches these by writing a doc to `commands/{auto-id}`:

| type | payload | result |
|------|---------|--------|
| `killPort` | `{ port }` | `{ port, killed }` |
| `killPorts` | `{ ports[] }` | `{ killed: [...] }` |
| `pm2Restart` | `{ pm2Name }` | `{ restarted }` |
| `pm2Delete` | `{ pm2Name }` | `{ deleted }` |
| `pm2DeleteAll` | `{ projectId }` | `{ results: [...] }` |
| `pm2Logs` | `{ pm2Name, lines? }` | `{ logs }` |
| `openFinder` | `{ projectPath }` | `{ opened }` |
| `openTerminal` | `{ projectPath }` | `{ terminalApp }` |
| `watchPort` | `{ port, serviceName? }` | `{ watching }` |
| `focusTerminal` | `{ focusIdentifier, projectPath? }` | `{ action }` |
| `minimizeCursorWindows` | `{}` | `{ minimized, failed, total }` |
| `pm2LogsTerminal` | `{ pm2Name }` | `{ terminalApp }` |
| `executeTask` | `{ task, projectPath, projectId }` | `{ taskLabel, pm2Name, success, ... }` |
| `executeStartAllTasks` | `{ projects[] }` | `{ results: [...] }` |
| `rescanProjects` | `{}` | `{ rescanned: true }` |

Lifecycle: `pending` → `running` → `done` / `error`.
Docs older than 1 h are swept automatically.
