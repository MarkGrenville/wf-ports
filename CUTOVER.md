# Cutover from React+Express to SvelteKit+daemon

This is the one-time migration from the old PortIO stack
(`portio-frontend` React on :3850 + `portio-backend` Express on :3851)
to the new stack (`portio-daemon` background poller + `portio-frontend`
SvelteKit on :3850, talking only to Firestore).

## Current state of the repo

- **Old stack (still running)**: `portio-backend` ([server.js](server.js)) on :3851, `portio-frontend` ([src/](src/)) on :3850. PM2 restart-keeps both alive. Bookmark `http://localhost:3850` still points here.
- **New SvelteKit UI (live, side-by-side)**: PM2 process `portio-frontend-svelte` running on **:3852**. Open `http://localhost:3852` to see it. Will show "Loading projects from Firestore…" until the daemon starts.
- **Daemon code (built but not running)**: [daemon/](daemon/). It refuses to start until you give it a Firebase Admin service account.

## Step 1 — Install the service account (one time, ~2 min)

```bash
mkdir -p ~/.portio
# Visit https://console.firebase.google.com/project/portio-ea1df/settings/serviceaccounts/adminsdk
# Click "Generate new private key", download the JSON.
mv ~/Downloads/portio-ea1df-firebase-adminsdk-*.json ~/.portio/firebase-service-account.json
chmod 600 ~/.portio/firebase-service-account.json
```

See [daemon/README.md](daemon/README.md) for details.

## Step 2 — Start the daemon

```bash
cd ~/Projects/portio
pm2 start daemon/index.js --name portio-daemon
pm2 logs portio-daemon --lines 30 --nostream
```

You should see lines like:

```
[firestore] connected to project portio-ea1df
[projects] starting rescan
[projects] wrote N projects + system docs
[ports] polling every 10000ms
[pm2] polling every 5000ms
[git] polling every 30000ms
[commands] listening (hostname: ...)
[daemon] ready
```

## Step 3 — Verify the SvelteKit UI

Open `http://localhost:3852` (the side-by-side instance).

- The dashboard table should populate within ~10 seconds.
- The PM2 column should show your live processes within ~5 seconds.
- Click **Rescan** in the header — the row should briefly show the in-flight state and refresh.
- Click **Kill** on a port that's running, **Restart** on a PM2 process, **Open Finder** on a project. Each should complete via Firestore round-trip in roughly 0.5–2 s.
- `/help` should render the markdown.
- `/export` should show the summary, projects, duplicates, by-type tabs.

If something doesn't work, the failed command doc lives at `commands/<id>` in Firestore with `status: error` and an `error` message.

## Step 4 — Flip ports (cutover)

When you're confident the SvelteKit UI is doing everything the React UI did:

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

Bookmark `http://localhost:3850` continues to work, now showing the SvelteKit UI.

## Step 5 — (After a week of stability) Cleanup

Per the original plan, only delete the old code once you're sure you don't need to roll back. See **Phase 6** in [the plan](.cursor/plans/real-time_firestore_daemon_+_sveltekit_508f3df9.plan.md).

The cleanup will delete:

- `server.js`, `src/`, `public/`, `project-icons/`
- root `package.json` deps: `react`, `react-dom`, `react-router-dom`, `react-icons`, `react-scripts`, `axios`, `firebase`, `cors`, `express`, `sass`
- `IMPLEMENTATION_SUMMARY.md` (already gone), any other React-era docs
- and update [AGENTS.md](AGENTS.md) + [README.md](README.md) for the new architecture.

## Rolling back (any point before Step 5)

```bash
pm2 delete portio-frontend portio-frontend-svelte portio-daemon 2>/dev/null
pm2 start "npm --prefix /Users/markgrenville/Projects/portio run server" --name portio-backend
pm2 start "npm --prefix /Users/markgrenville/Projects/portio start"      --name portio-frontend
```

The old code is untouched on disk; both stacks coexist until Step 5.
