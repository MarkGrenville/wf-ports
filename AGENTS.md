# AGENTS.md - PortIO Project

## Overview
PortIO is a local development manager for ports + PM2 processes, opened in the browser at `http://localhost:3850`.

Everything runs locally on the Mac. There is no database and no Firebase: the daemon holds all state in memory and pushes it to the browser over a localhost WebSocket. The old Firebase-emulator and React/Express stacks have been fully retired (see [CUTOVER.md](CUTOVER.md) for history).

## Live PM2 processes (current state)

| Name | What it does | Port |
|---|---|---|
| `portio-daemon` | Snapshots ports/PM2/git, holds state in memory, WebSocket push + POST /cmd actions | HTTP + WS on 3853 |
| `portio-frontend-svelte` | SvelteKit dev server (the UI) | 3850 |

These two are the entire stack.

## Architecture

```
Browser (Chrome :3850)
  <-- WebSocket (ws://127.0.0.1:3853/ws) -- live state pushed as topic diffs
  --> POST /cmd (http://127.0.0.1:3853/cmd) -- action commands

portio-daemon
  -- in-memory state hub (daemon/state.js): topics projects/liveStatus/pm2/portioDocs/usedPortsExport
  -- lsof / pm2 / osascript ---------------------------> macOS + ~/Projects/*
```

- **State**: pollers in the daemon write topics into the in-memory hub. The hub broadcasts a diff over the WebSocket only when a topic actually changes. The Svelte stores subscribe per-topic and re-render live. Sub-millisecond pushes, one hop.
- **Actions**: every button click POSTs `{type, payload}` to `http://127.0.0.1:3853/cmd`. The daemon runs the handler synchronously, then for mutating commands re-snapshots ports + pm2 immediately so the UI confirms the new state within a few hundred ms. Optimistic UI greys the affected ports/processes the instant you click.
- **Cost**: zero. Nothing leaves the Mac, nothing is written to disk.

## State model (in-memory topics in daemon/state.js)

| Topic | Writer | Reader | Purpose |
|---|---|---|---|
| `projects` | daemon (rescan + git merge) | UI | Project[] — config + git/firebase/vscode/favicon |
| `liveStatus` | daemon (1 s poll) | UI | `{ id, services }[]` — per-project port status |
| `pm2` | daemon (2 s poll) | UI | Pm2Process[] (CPU/memory dropped to keep diffs stable) |
| `portioDocs` | daemon (rescan) | UI (`/help`) | Generated markdown |
| `usedPortsExport` | daemon (rescan) | UI (`/export`) | Aggregated port export |

State is **in-memory** — a daemon restart rebuilds everything within ~1 s. While the daemon is down the UI shows a "daemon offline" badge and auto-reconnects.

## Daemon code map

```
daemon/
  index.js              entry: starts caffeinate, http + websocket, 4 pollers
  state.js              in-memory topic hub (diff + broadcast)
  http.js               Express + ws on 127.0.0.1:3853: POST /cmd, GET /health, /ws
  pollers/
    projects.js         5 min + chokidar -> "projects" + "portioDocs" + "usedPortsExport"; owns git merge
    ports.js            1 s -> "liveStatus" via a single lsof snapshot
    pm2.js              2 s -> "pm2"
    git.js             30 s -> feeds gitInfo back into projects.js
  commands/handlers/index.js   one function per command type; MUTATING_TYPES trigger an immediate re-snapshot
  shared/{exec,lsof,pm2,git,firebase-info,scan,applescript,task-runner,docs}.js
```

## Frontend code map (SvelteKit, Svelte 5 runes)

```
frontend/
  src/lib/socket.svelte.ts       WebSocket client to ws://127.0.0.1:3853/ws, reconnect + onTopic()
  src/lib/types.ts
  src/lib/stores/
    projects.svelte.ts           socket.onTopic("projects")
    liveStatus.svelte.ts         socket.onTopic("liveStatus")
    pm2.svelte.ts                socket.onTopic("pm2")
    system.svelte.ts             portioDocs + usedPortsExport topics
  src/lib/commands.svelte.ts     dispatch(type, payload) -> POST /cmd; optimistic hidden ports/pm2
  src/routes/+layout.svelte      starts/stops all stores
  src/routes/+page.svelte        dashboard
  src/routes/help/+page.svelte   markdown render
  src/routes/export/+page.svelte tabs over usedPortsExport
```

## Important Patterns

- The Svelte UI is **store-driven**. Data shown comes from a `$state`-backed reactive store wrapping a WebSocket topic subscription. Never `fetch()` JSON state.
- The WebSocket client (`socket.svelte.ts`) replays the last value to late subscribers, so stores get data immediately whether they subscribe before or after connect.
- Every mutation goes through `commandsStore.run(key, type, payload)` which POSTs to the daemon's localhost HTTP. The `key` doubles as the in-flight UI flag (`commandsStore.isRunning(key)`). Kills/deletes also call `setPortsHidden` / `setPm2Hidden` for optimistic feedback, cleared when the command resolves.
- The daemon's command handlers live in [daemon/commands/handlers/index.js](daemon/commands/handlers/index.js), dispatched by `http.js` via the `HANDLERS` map. Types in `MUTATING_TYPES` trigger an immediate ports + pm2 re-snapshot.
- PM2 process names follow `{projectId}-{taskName}`. The pm2 poller uses the prefix to derive `projectId`.
- Port detection uses one `lsof -nP -iTCP -sTCP:LISTEN` snapshot per tick; port killing uses `lsof -ti:PORT | xargs kill -9`. On lsof failure the poller keeps the last known state (no flapping).
- AppleScript runs through helpers in [daemon/shared/applescript.js](daemon/shared/applescript.js) via `runOsascript` (stdin-piped, multi-line safe).

## Running / restarting

```bash
# Start everything from cold:
pm2 start /Users/markgrenville/Projects/portio/daemon/index.js \
  --name portio-daemon --time
pm2 start "npm --prefix /Users/markgrenville/Projects/portio/frontend run dev -- --port 3850 --host" \
  --name portio-frontend-svelte
pm2 save

# Reload daemon after code changes:
pm2 restart portio-daemon
```

## Development Notes

- Run via PM2; never `npm run dev` directly.
- Use `pm2 logs <name> --lines N --nostream` to inspect.
- A daemon restart is cheap now — state is in memory and the UI repopulates within ~1 s (it shows a "daemon offline" badge while reconnecting).
- Never deploy; the user deploys manually.
- Don't run git commits; the user does them manually.
- CORS errors are often red herrings.
- Use flat icons only, not 3D colourful ones.
