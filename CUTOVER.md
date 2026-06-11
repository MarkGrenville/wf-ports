# Cutover from React+Express to SvelteKit+daemon (emulator-only)

This is the one-time migration from the old PortIO stack
(`portio-frontend` React on :3850 + `portio-backend` Express on :3851)
to the new stack: `portio-emulator` (local Firestore) + `portio-daemon` (background poller + localhost HTTP) + `portio-frontend-svelte` SvelteKit UI on :3850.

## Current state of the repo

- **Old stack (still running, optional rollback)**: `portio-backend` ([server.js](server.js)) on :3851, `portio-frontend` ([src/](src/)) on :3850.
- **New stack (live, side-by-side)**:
  - `portio-emulator` — local Firebase Firestore emulator on `127.0.0.1:8181` (hub on `:4444`).
  - `portio-daemon` — pollers + localhost HTTP at `127.0.0.1:3853`. Connects to the emulator via `FIRESTORE_EMULATOR_HOST=127.0.0.1:8181`.
  - `portio-frontend-svelte` — SvelteKit dev server on **:3852**. Open `http://localhost:3852` to see it.

Nothing in the new stack uses the cloud Firebase project anymore. The `portio-ea1df` project sits idle in Firebase console; you can delete it when comfortable.

## Step 1 — Verify the new stack works

Open `http://localhost:3852`. Within ~5 s:

- Dashboard table populates from the emulator (live).
- Active port count + PM2 column update without manual refresh.
- Click **Kill** / **Restart** / **View Logs** / **Open Finder** — each completes in 50–200 ms via the daemon's localhost HTTP, no Firestore round-trip required for the action.
- `/help` renders generated markdown.
- `/export` shows the summary tabs.

## Step 2 — Flip ports (cutover)

When you're confident:

```bash
# Stop the old React + Express pair
pm2 stop  portio-frontend portio-backend
pm2 delete portio-frontend portio-backend

# Move SvelteKit onto :3850 (the bookmarked URL)
pm2 delete portio-frontend-svelte
pm2 start "npm --prefix /Users/markgrenville/Projects/portio/frontend run dev -- --port 3850 --host" \
  --name portio-frontend
pm2 save
```

Bookmark `http://localhost:3850` continues to work, now showing the SvelteKit UI backed by the local emulator.

After cutover the running PM2 processes for PortIO are exactly:

- `portio-emulator` — Firestore on :8181
- `portio-daemon` — HTTP on :3853
- `portio-frontend` — SvelteKit on :3850

## Step 3 — (After a week of stability) Cleanup

Only delete the old code once you're sure you don't need to roll back.

The cleanup will:

- Delete `server.js`, `src/`, `public/`, `project-icons/`.
- Drop root `package.json` deps: `react`, `react-dom`, `react-router-dom`, `react-icons`, `react-scripts`, `firebase` (web SDK now only in `frontend/`), `cors`, `express`, `axios`, `sass` if unused.
- Update [README.md](README.md).
- Optionally delete the cloud `portio-ea1df` Firebase project from console.
- Optionally delete `~/.portio/firebase-service-account.json` (no longer read by the daemon in emulator mode).

## Cold-start everything from scratch

If you reboot the Mac and PM2 didn't restore (or you want to start fresh):

```bash
cd ~/Projects/portio

pm2 start "firebase emulators:start --only firestore --project demo-portio" \
  --name portio-emulator --cwd $PWD --time
# wait ~10 s for "All emulators ready"

FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 \
  pm2 start ./daemon/index.js --name portio-daemon --time --update-env

pm2 start "npm --prefix ./frontend run dev -- --port 3852 --host" \
  --name portio-frontend-svelte
# (after Step 2 above this name becomes portio-frontend on :3850)

pm2 save
```

Emulator data is in-memory; first 5–10 s after a fresh start, the dashboard will be empty while the pollers repopulate.

## Rolling back (any point before Step 3 cleanup)

```bash
pm2 delete portio-frontend portio-frontend-svelte portio-daemon portio-emulator 2>/dev/null
pm2 start "npm --prefix /Users/markgrenville/Projects/portio run server" --name portio-backend
pm2 start "npm --prefix /Users/markgrenville/Projects/portio start"      --name portio-frontend
pm2 save
```

The old code is untouched on disk; both stacks coexist until cleanup.
