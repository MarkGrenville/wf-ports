# PortIO

A local development environment manager for macOS. PortIO gives you a single dashboard to launch, monitor, and control all the dev services running on your machine — ports, PM2 processes, VS Code tasks, and more.

It is **not** a replacement for CI/CD pipelines like GitHub Actions. PortIO is a personal productivity tool that makes juggling multiple local projects less painful.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

## What It Does

- **Port monitoring** — See every active port on your machine at a glance, and kill processes with one click.
- **PM2 process management** — Start, restart, stop, and view logs for PM2-managed services directly from the UI.
- **VS Code task runner** — Trigger VS Code tasks (including "Start All" compound tasks) without switching windows.
- **Quick links** — Jump straight to a project's GitHub repo, Firebase Console, or Google Cloud Logs.
- **Git status** — See the current branch and dirty-file state for every project.
- **Project auto-discovery** — Drop a small `wf-ports.json` config file in any project and PortIO picks it up automatically.
- **Terminal & Finder integration** — Open a terminal in the right directory, focus an existing editor window, or reveal files in Finder.

## Architecture

```
┌─────────────────────────────────────────────┐
│          Browser at localhost:3850          │
└────────────────┬────────────────────────────┘
                 │ HTTP (localhost:3851)
┌────────────────▼────────────────────────────┐
│            Express API Server                │
│  Port scanning · PM2 · Git · Terminal · OS   │
└─────────────────────────────────────────────┘
```

| Layer | Tech |
|-------|------|
| Frontend | React 19, React Router, SCSS |
| Backend | Node.js, Express |
| Data sync (optional) | Firebase / Firestore |

Both the React dev server and the Express API run as PM2-managed processes (`portio-frontend` and `portio-backend`). Open `http://localhost:3850` in your browser.

## Prerequisites

- **macOS** (uses `lsof`, AppleScript, and other macOS-specific APIs)
- **Node.js** v18 or higher
- **npm**
- **PM2** installed globally — `npm install -g pm2`

## Quick Start

```bash
# Clone the repo
git clone https://github.com/MarkGrenville/wf-ports.git
cd wf-ports

# Install dependencies
npm install

# Copy the example env file and adjust if needed
cp .env.example .env

# Start both processes via PM2
pm2 start "npm run server" --name portio-backend
pm2 start "npm start"      --name portio-frontend
```

The React UI starts on **http://localhost:3850** and the API server on **http://localhost:3851**.

## Running

| Goal | Command |
|------|---------|
| API server (foreground) | `npm run server` |
| React dev server (foreground) | `npm start` |
| Production React build | `npm run build` |

In day-to-day use both are managed by PM2 as `portio-backend` and `portio-frontend`.

## Configuring Your Projects

PortIO discovers projects by scanning a base directory for `wf-ports.json` files. Set the `PROJECTS_BASE_PATH` environment variable in your `.env` (defaults to `~/Projects`).

Create a `wf-ports.json` in any project root:

```json
{
  "id": "my-app",
  "name": "My App",
  "services": [
    {
      "name": "Frontend",
      "port": 3000,
      "url": "http://localhost:3000",
      "purpose": "React frontend"
    },
    {
      "name": "API",
      "port": 3001,
      "url": "http://localhost:3001",
      "purpose": "Express backend"
    }
  ],
  "firebaseProjectId": "my-firebase-project",
  "focusIdentifier": "my-app"
}
```

### `wf-ports.json` Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique slug (lowercase, hyphens). Used for PM2 naming and storage. |
| `name` | Yes | Display name in the dashboard. |
| `services` | Yes | Array of `{ name, port, url, purpose? }` objects. |
| `description` | No | Short project description. |
| `faviconPath` | No | Absolute path to a project icon image. |
| `focusIdentifier` | No | String to match when focusing the editor window. |
| `projectPath` | No | Absolute path to the project root (auto-detected if omitted). |
| `projectBackendPath` | No | Path to a backend sub-directory for terminal actions. |
| `firebaseProjectId` | No | Enables Firebase Console and Cloud Logs quick links. |
| `pm2Prefix` | No | Custom prefix for PM2 process matching (defaults to `id`). |

### PM2 Naming Convention

PM2 processes should be named `{id}-{task}` (e.g., `my-app-frontend`, `my-app-backend`). PortIO uses this convention to associate processes with projects.

## Firebase (Optional)

PortIO can optionally sync project configurations to Firestore so they persist across machines. To use this:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Copy `src/services/firebaseConfig.example.js` to `src/services/firebaseConfig.js` and fill in your Firebase config.
3. Set up Firestore security rules appropriate for your use case.

If you don't need cloud sync, PortIO works fine without Firebase — project data is read directly from `wf-ports.json` files on disk.

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3850` | React dev server port |
| `PROJECTS_BASE_PATH` | `~/Projects` | Directory to scan for projects |

## Project Structure

```
wf-ports/
├── server.js                 # Express API server
├── src/
│   ├── components/
│   │   ├── PortMonitor.js    # Main dashboard UI
│   │   └── ...
│   └── services/
│       ├── firebaseConfig.example.js  # Firebase setup template
│       └── ...
└── public/                   # Static assets
```

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

[MIT](LICENSE)
