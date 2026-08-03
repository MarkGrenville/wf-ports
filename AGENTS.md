# AGENTS.md - PortIO Project

## Overview
PortIO is a local development manager for ports + PM2 processes, opened in the browser at `http://localhost:3850`.

Everything runs locally on the Mac. There is no database and no Firebase: the daemon holds live state in memory and pushes it to the browser over a localhost WebSocket. Port **claims** are the exception — they persist on disk in `daemon/data/port-registry.json`. The old Firebase-emulator and React/Express stacks have been fully retired (see [CUTOVER.md](CUTOVER.md) for history).

## Live PM2 processes (current state)

| Name | What it does | Port |
|---|---|---|
| `portio-daemon` | Snapshots ports/PM2/git, holds state in memory, WebSocket push + POST /cmd actions + port registry REST API | HTTP + WS on 3853 |
| `portio-frontend-svelte` | SvelteKit dev server (the UI) | 3850 |

These two are the entire stack.

## Architecture

```
Browser (Chrome :3850)
  <-- WebSocket (ws://127.0.0.1:3853/ws) -- live state pushed as topic diffs
  --> POST /cmd (http://127.0.0.1:3853/cmd) -- action commands
  --> GET/POST /api/ports* -- port registry (Swagger at /api-docs)

portio-daemon
  -- in-memory state hub (daemon/state.js): topics projects/liveStatus/pm2/usedPortsExport/ciStatus/cronJobs/network
  -- port registry (daemon/data/port-registry.json) -- persisted claims
  -- lsof / pm2 / osascript ---------------------------> macOS + ~/Projects/*
  -- GitHub Actions API (ci poller) ------------------> api.github.com (needs GITHUB_TOKEN env var)
```

- **State**: pollers in the daemon write topics into the in-memory hub. The hub broadcasts a diff over the WebSocket only when a topic actually changes. The Svelte stores subscribe per-topic and re-render live. Sub-millisecond pushes, one hop.
- **Actions**: every button click POSTs `{type, payload}` to `http://127.0.0.1:3853/cmd`. The daemon runs the handler synchronously, then for mutating commands re-snapshots ports + pm2 immediately so the UI confirms the new state within a few hundred ms. Optimistic UI greys the affected ports/processes the instant you click.
- **Port registry**: agents/scripts should claim ports via REST instead of guessing. Claims do **not** rewrite project `.webfootprint/ports.json` — update that file after claiming.
- **Cost**: zero. Nothing leaves the Mac (except optional GitHub Actions polling).

## Port Registry API

Swagger UI: `http://127.0.0.1:3853/api-docs` (also linked as **API** in the dashboard top nav).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ports` | Declared + claimed + blocked + listening |
| `GET` | `/api/ports/conflicts` | Declared duplicate ports |
| `GET` | `/api/ports/blocked` | Always-unavailable (0–1023 + curated) |
| `GET` | `/api/ports/next?count=1&from=4000` | Suggest free port(s) without claiming |
| `POST` | `/api/ports/claim` | `{ projectId, service?, port?, count?, from? }` — persist claim |
| `DELETE` | `/api/ports/claim/:port` | Release a claim |

## Docs API (static, curl-able)

The reference docs are plain static markdown built by `daemon/shared/docs.js` and served over HTTP. They are **not** a WebSocket topic and do not depend on the project scan, so they are available the moment the daemon boots.

| URL | Returns |
|---|---|
| `http://127.0.0.1:3853/docs` (or `/docs.md`) | `text/markdown` |
| `http://127.0.0.1:3853/docs.json` | `{ ok, markdown }` |
| `http://localhost:3850/help.md` (or `/help.txt`) | same markdown, via the dev server |
| `http://localhost:3850/help` | markdown for clients that don't accept HTML (curl, agents), rendered page for browsers |

The 3850 variants are handled by a small Vite middleware in `frontend/vite.config.ts` that proxies to the daemon. The `/help` page itself fetches `/docs` once on mount; it does not subscribe to a live topic.

When finding/claiming a port, the daemon excludes: always-blocked ports, ports declared in scanned project configs, registry claims, and currently listening ports (lsof). Persistence file is gitignored under `daemon/data/`.

## State model (in-memory topics in daemon/state.js)

| Topic | Writer | Reader | Purpose |
|---|---|---|---|
| `projects` | daemon (rescan + git merge) | UI | Project[] — config + git/firebase/vscode/favicon |
| `liveStatus` | daemon (1 s poll) | UI | `{ id, services }[]` — per-project port status |
| `pm2` | daemon (2 s poll) | UI | Pm2Process[] (CPU/memory dropped to keep diffs stable) |
| `usedPortsExport` | daemon (rescan) | UI (`/export`) | Aggregated port export |
| `ciStatus` | daemon (30 s / 15 s adaptive) | UI | `CIStatus[]` — GitHub Actions workflow runs per project |

Live topics are **in-memory** — a daemon restart rebuilds them within ~1 s. Claims reload from `daemon/data/port-registry.json`. While the daemon is down the UI shows a "daemon offline" badge and auto-reconnects.

## Daemon code map

```
daemon/
  index.js              entry: starts caffeinate, http + websocket, 5 pollers
  state.js              in-memory topic hub (diff + broadcast)
  http.js               Express + ws on :3853: POST /cmd, GET /health, /ws, /api/ports*, /api-docs, /docs
  openapi.json          OpenAPI 3 spec for the port registry + docs endpoints
  data/port-registry.json  persisted claims (gitignored, created on first claim)
  pollers/
    projects.js         5 min + chokidar -> "projects" + "usedPortsExport"; owns git merge
    ports.js            1 s -> "liveStatus" via a single lsof snapshot
    pm2.js              2 s -> "pm2"
    git.js             30 s -> feeds gitInfo back into projects.js
    ci.js              30 s (15 s when active) -> "ciStatus" via GitHub Actions API; needs GITHUB_TOKEN
  commands/handlers/index.js   one function per command type; MUTATING_TYPES trigger an immediate re-snapshot
  shared/{exec,lsof,pm2,git,github,firebase-info,scan,applescript,task-runner,docs,blocked-ports,port-registry}.js
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
    ci.svelte.ts                 socket.onTopic("ciStatus") — GitHub Actions runs per project
    system.svelte.ts             usedPortsExport topic
  src/lib/commands.svelte.ts     dispatch(type, payload) -> POST /cmd; daemonBase(); optimistic hidden ports/pm2
  src/routes/+layout.svelte      starts/stops all stores
  src/routes/+page.svelte        dashboard (includes API/Swagger link)
  src/routes/help/+page.svelte   one-off fetch of daemon /docs, rendered with marked
  vite.config.ts                 serves /help.md, /help.txt and non-HTML /help as raw markdown
  src/routes/export/+page.svelte tabs over usedPortsExport
```

## Important Patterns

- The Svelte UI is **store-driven**. Data shown comes from a `$state`-backed reactive store wrapping a WebSocket topic subscription. Never `fetch()` JSON state (except one-off agent tooling against the port registry REST API, and the `/help` page which fetches static docs once).
- The WebSocket client (`socket.svelte.ts`) replays the last value to late subscribers, so stores get data immediately whether they subscribe before or after connect.
- Every mutation goes through `commandsStore.run(key, type, payload)` which POSTs to the daemon's localhost HTTP. The `key` doubles as the in-flight UI flag (`commandsStore.isRunning(key)`). Kills/deletes also call `setPortsHidden` / `setPm2Hidden` for optimistic feedback, cleared when the command resolves.
- The daemon's command handlers live in [daemon/commands/handlers/index.js](daemon/commands/handlers/index.js), dispatched by `http.js` via the `HANDLERS` map. Types in `MUTATING_TYPES` trigger an immediate ports + pm2 re-snapshot.
- PM2 process names follow `{projectId}-{taskName}`. The pm2 poller uses the prefix to derive `projectId`.
- Port detection uses one `lsof -nP -iTCP -sTCP:LISTEN` snapshot per tick; port killing uses `lsof -ti:PORT | xargs kill -9`. On lsof failure the poller keeps the last known state (no flapping).
- New local ports should be obtained via `POST /api/ports/claim` (or suggested via `GET /api/ports/next`), not by picking numbers ad hoc.
- CI polling uses the GitHub Actions REST API. Set `GITHUB_TOKEN` env var with a PAT that has `repo` or `actions:read` scope. Without it the CI poller is silently disabled. The poller adapts its tick rate: 15s when any run is in-progress/queued, 30s when idle. Rate-limit responses trigger automatic backoff.
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
- A daemon restart is cheap now — state is in memory and the UI repopulates within ~1 s (it shows a "daemon offline" badge while reconnecting). Claims survive restarts via `daemon/data/port-registry.json`.
- Never deploy; the user deploys manually.
- Don't run git commits; the user does them manually.
- CORS errors are often red herrings.
- Use flat icons only, not 3D colourful ones.
