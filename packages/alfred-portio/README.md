# Portio Alfred Workflow

An Alfred workflow for managing your development projects through Portio.

## Features

- **Search Projects**: Quickly find and access your projects
- **Open in Cursor**: Launch any project in Cursor IDE
- **Run VS Code Tasks**: Execute tasks defined in `.vscode/tasks.json`
- **PM2 Management**: View logs, restart, or delete PM2 processes
- **Kill Ports**: Quickly kill processes running on specific ports
- **Firebase & GitHub Integration**: Quick links to Firebase Console and GitHub

## Requirements

- [Alfred](https://www.alfredapp.com/) with Powerpack
- [Portio](../..) running (Express server on port 3001)
- Node.js installed

## Installation

### Option 1: Using the installer (recommended)

```bash
cd packages/alfred-portio
npm run install-workflow
```

### Option 2: Manual installation

1. Navigate to this directory:
   ```bash
   cd packages/alfred-portio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a symlink to Alfred's workflows folder:
   ```bash
   ln -s "$(pwd)" ~/Library/Application\ Support/Alfred/Alfred.alfredpreferences/workflows/portio-workflow
   ```

### Option 3: Double-click installation

1. Create a `.alfredworkflow` file:
   ```bash
   cd packages/alfred-portio
   zip -r ../Portio.alfredworkflow . -x "node_modules/*" -x ".git/*"
   ```

2. Double-click `Portio.alfredworkflow` to install

## Usage

### Basic Usage

1. **Start Portio**: Make sure the Portio app is running
2. **Open Alfred**: Press your Alfred hotkey (default: `Cmd + Space`)
3. **Search Projects**: Type `p ` followed by your search query

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Return` | Select item / perform action |
| `Cmd + Return` | Open project in Cursor |
| `Alt + Return` | Kill all ports for project |

### PM2 Process Shortcuts

When viewing PM2 processes:

| Shortcut | Action |
|----------|--------|
| `Cmd + Return` | View logs |
| `Alt + Return` | Restart process |
| `Ctrl + Return` | Delete process |

## Available Actions

When you select a project, you can:

1. **Open in Cursor** - Launch the project in Cursor IDE
2. **Run Task...** - View and run VS Code tasks
3. **Start All Services** - Quick action to start all services (if available)
4. **PM2 Processes...** - Manage PM2 processes for this project
5. **Kill All Ports** - Kill all processes on the project's configured ports
6. **Delete All PM2 Processes** - Remove all PM2 processes for this project
7. **Open in Finder** - Open project folder in Finder
8. **Open Firebase Console** - Open Firebase Console (if Firebase project)
9. **Open GitHub** - Open GitHub repository (if available)

## Troubleshooting

### "Error connecting to Portio"

Make sure Portio is running. The Express server should be available at `http://localhost:3001`.

### "No projects found"

Run "Rescan Projects" in the Portio app to populate the project cache.

### Node.js not found

The workflow expects Node.js at `/usr/local/bin/node`. If your Node.js is installed elsewhere:

1. Open the workflow in Alfred Preferences
2. Edit each script filter
3. Update the path to your Node.js installation

Or create a symlink:
```bash
sudo ln -s $(which node) /usr/local/bin/node
```

## Development

### Testing scripts locally

```bash
# List projects
node scripts/list-projects.js "search query"

# Show project actions
node scripts/project-actions.js '{"id":"my-project","name":"My Project",...}'

# Execute an action
node scripts/execute-action.js '{"action":"open-cursor","project":{...}}'
```

### Adding icons

Place icon files in the `icons/` directory:
- `cursor.png` - Cursor IDE icon
- `task.png` - Task icon
- `pm2.png` - PM2 icon
- `play.png` - Play/start icon
- `kill.png` - Kill/stop icon
- `delete.png` - Delete icon
- `logs.png` - Logs icon
- `restart.png` - Restart icon
- `finder.png` - Finder icon
- `firebase.png` - Firebase icon
- `github.png` - GitHub icon

## License

MIT
