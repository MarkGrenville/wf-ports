# AGENTS.md - PortIO Project

## Overview
PortIO is a local development manager for ports + PM2 processes, opened in the browser at `http://localhost:3852` (will move to `:3850` once the React stack is fully cut over — see [CUTOVER.md](CUTOVER.md)).

Everything runs locally on the Mac. There is no cloud dependency: a local Firebase Emulator is the only Firestore involved.

## Live PM2 processes (current state)

| Name | What it does | Port |
|---|---|---|
| `portio-emulator` | Local Firebase Firestore emulator (the only "database") | 8181 (firestore), 4444 (hub) |
| `portio-daemon` | Polls ports/PM2/git, writes to emulator, listens for action commands | HTTP on 3853 |
| `portio-frontend-svelte` | SvelteKit dev server (the new UI) | 3852 |
| `portio-backend` | Old Express API (legacy, still up for the React UI rollback path) | 3851 |
| `portio-frontend` | Old React dev server (legacy, still up for rollback) | 3850 |

After the cutover (Phase 5 in CUTOVER.md), only the first three remain.

## Architecture

```
Browser (Chrome :3852)
  -- firestore web SDK + connectFirestoreEmulator -->  portio-emulator (127.0.0.1:8181)
  -- POST /cmd (localhost HTTP) ----------------------> portio-daemon (127.0.0.1:3853)

portio-daemon
  -- firebase-admin + FIRESTORE_EMULATOR_HOST -------->  portio-emulator
  -- lsof / pm2 / osascript ---------------------------> macOS + ~/Projects/*
```

- **State**: pollers in the daemon write to the emulator every 5–30 s. The Svelte UI subscribes via `onSnapshot` and re-renders live. Sub-millisecond reads/writes.
- **Actions**: every button click POSTs `{type, payload}` to `http://127.0.0.1:3853/cmd`. The daemon runs the handler synchronously and returns the result. Sub-50 ms for kill / restart; ~200 ms for actions that shell out to AppleScript or `pm2 logs`.
- **Cost**: zero. Nothing leaves the Mac.

## Firestore data model (project `demo-portio` in the emulator)

| Collection / doc | Writer | Reader | Purpose |
|---|---|---|---|
| `projects/{id}` | daemon (rescan) | UI | Project config + git/firebase/vscode/favicon |
| `liveStatus/{id}` | daemon (10 s poll) | UI | Per-project port status |
| `pm2/{name}` | daemon (5 s poll) | UI | Live PM2 process state (CPU/memory dropped to keep writes minimal) |
| `system/portioDocs` | daemon (rescan) | UI (`/help`) | Generated markdown |
| `system/usedPortsExport` | daemon (rescan) | UI (`/export`) | Aggregated port export |
| `commands/{id}` | (legacy, unused) | (legacy, unused) | Pre-emulator command queue. Still wired in case we want a Firestore-based action path again. |

Emulator data is **in-memory** — a daemon/emulator restart wipes it. Pollers regenerate everything within ~5 s, so this only ever causes a brief empty dashboard.

## Daemon code map

```
daemon/
  index.js              entry: starts caffeinate, http, pollers, listener
  firestore.js          firebase-admin init (emulator-aware via FIRESTORE_EMULATOR_HOST)
  http.js               Express on 127.0.0.1:3853, POST /cmd dispatches HANDLERS
  pollers/{projects,ports,pm2,git}.js
  commands/listener.js  legacy Firestore command queue (kept, but UI no longer writes here)
  commands/sweep.js     drops command docs > 1 h old
  commands/handlers/index.js   one function per command type, called by both http.js and listener.js
  shared/{exec,lsof,pm2,git,firebase-info,scan,applescript,task-runner,docs}.js
```

## Frontend code map (SvelteKit, Svelte 5 runes)

```
frontend/
  src/lib/firebase.ts            web SDK init, connectFirestoreEmulator(127.0.0.1, 8181)
  src/lib/types.ts
  src/lib/stores/
    projects.svelte.ts           onSnapshot collection
    liveStatus.svelte.ts
    pm2.svelte.ts
    system.svelte.ts             portioDocs + usedPortsExport
  src/lib/commands.svelte.ts     dispatch(type, payload) -> POST http://127.0.0.1:3853/cmd
  src/routes/+layout.svelte      starts/stops all stores
  src/routes/+page.svelte        dashboard
  src/routes/help/+page.svelte   markdown render
  src/routes/export/+page.svelte tabs over usedPortsExport
```

## Important Patterns

- The Svelte UI is **store-driven**. Data shown comes from a `$state`-backed reactive store wrapping a Firestore listener. Never `fetch()` JSON state.
- Every mutation goes through `commandsStore.run(key, type, payload)` which POSTs to the daemon's localhost HTTP. The `key` doubles as the in-flight UI flag (`commandsStore.isRunning(key)`).
- The daemon's command handlers live in [daemon/commands/handlers/index.js](daemon/commands/handlers/index.js). Both `http.js` and the legacy `listener.js` dispatch via the same `HANDLERS` map.
- PM2 process names follow `{projectId}-{taskName}`. The pm2 poller uses the prefix to derive `projectId`.
- Port killing uses `lsof -ti:PORT | xargs kill -9`.
- AppleScript runs through helpers in [daemon/shared/applescript.js](daemon/shared/applescript.js) via `runOsascript` (stdin-piped, multi-line safe).

## Running / restarting

```bash
# Start everything from cold:
pm2 start "firebase emulators:start --only firestore --project demo-portio" \
  --name portio-emulator --cwd /Users/markgrenville/Projects/portio --time
# wait ~10 s for "All emulators ready"
FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 \
  pm2 start /Users/markgrenville/Projects/portio/daemon/index.js \
  --name portio-daemon --time --update-env
pm2 start "npm --prefix /Users/markgrenville/Projects/portio/frontend run dev -- --port 3852 --host" \
  --name portio-frontend-svelte
pm2 save
```

## Development Notes

- Run via PM2; never `npm run dev` directly.
- Use `pm2 logs <name> --lines N --nostream` to inspect.
- Don't kill or restart the emulator unless explicitly asked — it wipes Firestore (data regenerates within 10 s, but UI flickers).
- Never deploy; the user deploys manually.
- Don't run git commits; the user does them manually.
- CORS errors are often red herrings.
- Use flat icons only, not 3D colourful ones.
