# Cutover history: React+Express -> SvelteKit + Firebase emulator -> SvelteKit + WebSocket daemon

PortIO went through three stacks. This document records the final state and how we got here.

## Final stack (current)

Two PM2 processes, no database, no Firebase:

| Process | Role | Port |
|---|---|---|
| `portio-daemon` | [daemon/index.js](daemon/index.js) — in-memory state hub, WebSocket push, POST /cmd | 3853 (HTTP + WS) |
| `portio-frontend-svelte` | SvelteKit dev server, the UI | 3850 |

Open `http://localhost:3850`. The dashboard is pushed live over `ws://127.0.0.1:3853/ws` and repopulates within ~1 s of a daemon restart.

## History

1. **React + Express** — `portio-frontend` (React, :3850) + `portio-backend` (Express, :3851). Polled over HTTP; sluggish, manual refreshes.
2. **SvelteKit + Firebase emulator** — `portio-emulator` (local Firestore, :8181) + `portio-daemon` (pollers writing to the emulator) + `portio-frontend-svelte` (:3852). Live via `onSnapshot`, but four hops (daemon -> admin SDK -> emulator -> web SDK -> UI), 5–10 s poll latency, and per-port `lsof` timeouts caused status flapping.
3. **SvelteKit + WebSocket daemon (current)** — the emulator and both legacy React/Express processes were retired. The daemon now holds state in memory and pushes diffs straight to the UI over a WebSocket. Port detection is a single atomic `lsof` snapshot every 1 s, and mutating commands trigger an immediate re-snapshot, so kills/restarts/runs reflect almost instantly with no flapping.

## What was removed in the final cutover

- PM2: deleted `portio-emulator`, `portio-backend`, `portio-frontend`. Moved `portio-frontend-svelte` from :3852 to :3850.
- Daemon: deleted `daemon/firestore.js`, `daemon/commands/listener.js`, `daemon/commands/sweep.js`. Dropped `firebase-admin`; added `ws`.
- Frontend: deleted `src/lib/firebase.ts`; dropped the `firebase` web SDK; stores now subscribe to WebSocket topics via `src/lib/socket.svelte.ts`.
- Repo root: deleted the legacy React app (`src/`, `public/`, `server.js`), `firebase.json`, `.firebaserc`. Pruned root `package.json` to daemon-only deps.

## Cold-start everything from scratch

```bash
cd ~/Projects/portio

pm2 start ./daemon/index.js --name portio-daemon --time

pm2 start "npm --prefix ./frontend run dev -- --port 3850 --host" \
  --name portio-frontend-svelte

pm2 save
```

No emulator, no warm-up wait. The pollers repopulate the dashboard within ~1 s.
