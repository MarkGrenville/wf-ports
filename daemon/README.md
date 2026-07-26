# portio-daemon

Background process that snapshots ports / PM2 / git on this Mac, holds all state in memory, and pushes live updates to the UI over a localhost WebSocket. The same Express server also exposes a localhost HTTP endpoint for action commands.

No database. No Firebase. The daemon and the SvelteKit UI talk directly: one process, one hop, sub-millisecond pushes.

## Start everything from cold

```bash
cd ~/Projects/portio

pm2 start ./daemon/index.js --name portio-daemon --time

pm2 start "npm --prefix ./frontend run dev -- --port 3850 --host" \
  --name portio-frontend-svelte

pm2 save
```

Open `http://localhost:3850`. The dashboard populates within ~1 s and stays live.

## How it works

```
portio-daemon
  - reads PROJECTS_BASE_PATH (~/Projects) and discovers .webfootprint/ports.json files (legacy wf-ports.json still supported)
  - holds all state in daemon/state.js (an in-memory topic hub)
  - polls every:
      ports      1 s   -> one `lsof` snapshot of all listeners -> state "liveStatus"
      pm2        2 s   -> `pm2 jlist` -> state "pm2"
      git       30 s   -> merges into the "projects" topic (per-project gitInfo)
      projects   5 m + chokidar -> state "projects" + "portioDocs" + "usedPortsExport"
  - pushes a full snapshot on WebSocket connect, then per-topic diffs on change
  - exposes POST http://127.0.0.1:3853/cmd that runs HANDLERS synchronously;
    after a mutating command it re-snapshots ports + pm2 immediately so the UI
    confirms the new state within a few hundred ms
  - keeps the Mac awake via `caffeinate -dimsu -w <pid>` while running
```

### Why this is responsive

- Port detection is a single atomic `lsof -nP -iTCP -sTCP:LISTEN` call per tick, not one call per port. If it fails or times out the daemon keeps the last known state instead of reporting everything closed, which eliminates the flashing on/off behaviour.
- Every mutating command (`killPort`, `pm2Delete`, ...) triggers an immediate re-snapshot, so kills/restarts reflect in the UI almost instantly rather than at the next poll boundary.
- The state hub only broadcasts when a topic's serialised value actually changes, so idle ticks cost nothing.

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `PROJECTS_BASE_PATH` | `~/Projects` | Where to scan for `.webfootprint/ports.json` |
| `PORTIO_DAEMON_HTTP_PORT` | `3853` | Localhost HTTP + WebSocket port |
| `PORTIO_DISABLE_CAFFEINATE` | `0` | Set `1` to skip the no-sleep wrapper |

## Module map

```
daemon/
  index.js                  entry: starts http + WebSocket + 4 pollers
  state.js                  in-memory topic hub (diff + broadcast)
  http.js                   Express + ws on 127.0.0.1:3853: POST /cmd, GET /health, /ws
  pollers/
    projects.js             5 min + chokidar -> "projects", "portioDocs", "usedPortsExport"; owns git merge
    ports.js                1 s -> "liveStatus" via a single lsof snapshot
    pm2.js                  2 s -> "pm2"
    git.js                 30 s -> feeds gitInfo back into projects.js
  commands/
    handlers/index.js       one function per command type; MUTATING_TYPES trigger re-snapshot
  shared/
    exec.js, lsof.js, pm2.js, git.js, firebase-info.js,
    scan.js, applescript.js, task-runner.js, docs.js
```

## WebSocket protocol (ws://127.0.0.1:3853/ws)

| Message | Shape | When |
|---------|-------|------|
| snapshot | `{ type: "snapshot", data: { [topic]: value } }` | once, on connect |
| update | `{ type: "update", topic, data }` | whenever a topic changes |

Topics: `projects` (Project[]), `liveStatus` ({ id, services }[]), `pm2` (Pm2Process[]), `portioDocs` ({ markdown }), `usedPortsExport` (export object).

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

State is purely in-memory and rebuilt by the pollers on boot. A daemon restart shows a dashboard that repopulates within ~1 s; the UI displays a "daemon offline" badge and auto-reconnects while it's down. Nothing is written to disk.
