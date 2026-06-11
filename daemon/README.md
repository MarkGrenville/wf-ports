# portio-daemon

Background process that polls ports / PM2 / git on this Mac and pushes everything into a local Firestore emulator. Also exposes a localhost HTTP endpoint for snappy action commands from the UI.

## Setup (emulator-only mode)

The daemon requires the Firebase Firestore emulator to be reachable at `127.0.0.1:8181`. The emulator is itself a PM2-managed process — `portio-emulator`.

### One-time

You need Java (any JDK 11+) and `firebase-tools`. Both are installed:

```bash
java -version    # OpenJDK 21+
firebase --version  # 15+
```

Repo-level config files at the project root:

- [firebase.json](../firebase.json) — emulator ports
- [.firebaserc](../.firebaserc) — points at the demo project `demo-portio`

### Start everything from cold

```bash
cd ~/Projects/portio

pm2 start "firebase emulators:start --only firestore --project demo-portio" \
  --name portio-emulator --cwd $PWD --time
# wait ~10 s for "All emulators ready"

FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 \
  pm2 start ./daemon/index.js --name portio-daemon --time --update-env

pm2 start "npm --prefix ./frontend run dev -- --port 3852 --host" \
  --name portio-frontend-svelte

pm2 save
```

## How it works

```
portio-daemon
  - reads PROJECTS_BASE_PATH (~/Projects) and discovers wf-ports.json files
  - polls every:
      ports     10 s   -> writes liveStatus/{id}
      pm2        5 s   -> writes pm2/{name}
      git       30 s   -> merges into projects/{id}.gitInfo
      projects   5 m + chokidar -> writes projects/{id} + system/portioDocs + system/usedPortsExport
  - exposes POST http://127.0.0.1:3853/cmd that runs HANDLERS synchronously and returns the result
  - keeps the Mac awake via `caffeinate -dimsu -w <pid>` while running
```

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `FIRESTORE_EMULATOR_HOST` | (none) | Set to `127.0.0.1:8181` to use the emulator. When set, no service account is read. |
| `GOOGLE_APPLICATION_CREDENTIALS` | `~/.portio/firebase-service-account.json` | Cloud Firestore service account JSON. **Only used when `FIRESTORE_EMULATOR_HOST` is unset.** |
| `PROJECTS_BASE_PATH` | `~/Projects` | Where to scan for `wf-ports.json` |
| `AGENT_RUNNER_HOSTNAME` | `os.hostname()` | Used in command claim transactions (legacy Firestore command queue) |
| `PORTIO_DAEMON_HTTP_PORT` | `3853` | Localhost HTTP port |
| `PORTIO_DISABLE_CAFFEINATE` | `0` | Set `1` to skip the no-sleep wrapper |

## Module map

```
daemon/
  index.js                  entry: starts http + 4 pollers + Firestore command listener
  firestore.js              firebase-admin init (emulator-aware)
  http.js                   Express on 127.0.0.1:3853, POST /cmd, GET /health
  pollers/
    projects.js             5 min + chokidar -> projects/{id}, system/portioDocs, system/usedPortsExport
    ports.js                10 s -> liveStatus/{id}
    pm2.js                  5 s -> pm2/{name}, fingerprint excludes CPU/mem to keep writes minimal
    git.js                  30 s -> projects/{id}.gitInfo
  commands/
    listener.js             legacy Firestore command queue (UI no longer writes here, kept as fallback)
    sweep.js                drops command docs > 1 h old
    handlers/index.js       one function per command type, called by both http.js and listener.js
  shared/
    exec.js, lsof.js, pm2.js, git.js, firebase-info.js,
    scan.js, applescript.js, task-runner.js, docs.js
```

## Command types

The Svelte UI POSTs `{type, payload}` to `/cmd`. Each handler returns its own result shape, wrapped in `{ ok: true, result }`.

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

## Persistence

The emulator runs in-memory by default. A daemon or emulator restart wipes Firestore. Pollers regenerate everything within ~5 s, so the only visible cost is a brief empty dashboard right after restart.

To turn on persistence (writes data to `./emulator-data/` between runs):

```bash
pm2 delete portio-emulator
pm2 start "firebase emulators:start --only firestore --project demo-portio --import emulator-data --export-on-exit emulator-data" \
  --name portio-emulator --cwd ~/Projects/portio --time
pm2 save
```

Note that PM2's default kill signal won't trigger emulator's export-on-exit. Use `pm2 stop portio-emulator` (which sends SIGINT) before reboots if you care about persistence.
