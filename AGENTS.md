# AGENTS.md - PortIO Project

## Overview
PortIO is a local development manager for ports + PM2 processes, opened in the browser at `http://localhost:3850`.

The repo is mid-migration from a React + Express stack to a SvelteKit + local daemon stack. **Both stacks coexist** until the user does the cutover documented in [CUTOVER.md](CUTOVER.md).

## Live PM2 processes (current state)

- `portio-backend` — Express server, [server.js](server.js), port 3851. Old stack, still serving the React UI.
- `portio-frontend` — React dev server, [src/](src/), port 3850. Old stack, the bookmarked URL.
- `portio-frontend-svelte` — SvelteKit dev server, [frontend/](frontend/), port 3852. New stack, side-by-side observer.
- `portio-daemon` — Local poller + Firestore command worker, [daemon/](daemon/). New stack. **Will not start until the user installs a Firebase Admin service account at `~/.portio/firebase-service-account.json`.** See [daemon/README.md](daemon/README.md).

After cutover (Phase 5 in CUTOVER.md), only `portio-daemon` and `portio-frontend` (Svelte) remain.

## New stack architecture

```
Browser (Chrome) <--Firestore--> portio-ea1df <--firebase-admin--> portio-daemon (Mac)
                                                                       |
                                                                       v
                                                       lsof / pm2 / git / AppleScript
```

- The Svelte UI never makes HTTP calls. It subscribes to Firestore collections and writes command docs.
- The daemon polls (ports 10s, pm2 5s, git 30s, projects 5min + chokidar) and listens for new commands.
- Command lifecycle: `pending` → daemon claims via transaction → `running` → `done` / `error`.

## Firestore data model (project `portio-ea1df`)

| Collection / doc | Writer | Reader | Purpose |
|---|---|---|---|
| `projects/{id}` | daemon (rescan) | UI | Project config + git/firebase/vscode/favicon |
| `liveStatus/{id}` | daemon (10s poll) | UI | Per-project port status |
| `pm2/{name}` | daemon (5s poll) | UI | Live PM2 process state |
| `system/portioDocs` | daemon (rescan) | UI (`/help`) | Generated markdown |
| `system/usedPortsExport` | daemon (rescan) | UI (`/export`) | Aggregated port export |
| `commands/{id}` | UI | daemon | Mutation queue |

## Old stack architecture (still present, will be deleted in Phase 6)

- React app in `src/` polls `/api/*` on the Express server every 60 s and on every action.
- Express in `server.js` exposes 21 endpoints: scan/discovery, port checks, kill, PM2, AppleScript, task execution.
- Firestore is used by the React UI only as a one-shot project list cache (`getDocs` on mount, `saveProjects` on rescan).

## Daemon code map

```
daemon/
  index.js              entry
  firestore.js          firebase-admin init (fail-fast on missing SA)
  pollers/{projects,ports,pm2,git}.js
  commands/listener.js  onSnapshot pending + atomic claim
  commands/sweep.js     drop docs > 1h old
  commands/handlers/index.js
  shared/{exec,lsof,pm2,git,firebase-info,scan,applescript,task-runner,docs}.js
```

## Frontend code map (SvelteKit, Svelte 5 runes)

```
frontend/
  src/lib/firebase.ts            web SDK init
  src/lib/types.ts
  src/lib/stores/
    projects.svelte.ts           onSnapshot collection
    liveStatus.svelte.ts
    pm2.svelte.ts
    system.svelte.ts             portioDocs + usedPortsExport
  src/lib/commands.svelte.ts     dispatch(type, payload) -> awaits doc terminal state
  src/routes/+layout.svelte      starts/stops all stores
  src/routes/+page.svelte        dashboard (PortMonitor parity)
  src/routes/help/+page.svelte   markdown render
  src/routes/export/+page.svelte tabs over usedPortsExport
```

## Important Patterns

- The Svelte UI is **store-driven**: any data shown comes from a `$state`-backed reactive store wrapping a Firestore listener. Never `fetch()` from the SvelteKit code.
- Every mutation goes through `commandsStore.run(key, type, payload)`. The `key` doubles as the in-flight UI flag (`commandsStore.isRunning(key)`).
- The daemon's command handlers live in [daemon/commands/handlers/index.js](daemon/commands/handlers/index.js) and dispatch via the `HANDLERS` map.
- PM2 process names follow `{projectId}-{taskName}` (e.g. `portio-backend`, `crm-2024-frontend`). The pm2 poller uses the prefix to compute `projectId`.
- Port killing uses `lsof -ti:PORT | xargs kill -9`.
- AppleScript runs through helpers in [daemon/shared/applescript.js](daemon/shared/applescript.js).

## Development Notes

- Run via PM2; never `npm run dev` directly.
- Use `pm2 logs <name> --lines N --nostream` to inspect.
- Don't kill or restart the emulator.
- Never deploy; the user deploys manually.
- Don't run git commits; the user does them manually.
- CORS errors are often red herrings (the new UI doesn't need CORS at all).
- Use flat icons only, not 3D colourful ones.
