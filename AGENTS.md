# AGENTS.md - PortIO Project

## Overview
PortIO is a React + Express app for monitoring and managing local development ports and PM2 processes. It can run as a web app or Electron app.

A native **Swift macOS app** exists at `packages/PortIO-Swift/` - a single-app replacement with native port scanning, process management (replacing PM2), and Firestore sync. Open `PortIO.xcodeproj` and build.

## Architecture
- **Frontend**: React app (`src/`) with SCSS styling, running via PM2 as `portio-frontend`
- **Backend**: Express server (`server.js`) on port 3851, running via PM2 as `portio-backend`
- **Main UI Component**: `src/components/PortMonitor.js` (~1700 lines) - renders a table of projects with their ports, PM2 processes, and actions

## Key Files
- `server.js` - Express API server with endpoints for port management, PM2 operations, terminal ops
- `src/components/PortMonitor.js` - Main dashboard component
- `src/components/PortMonitor.scss` - Dashboard styles
- `src/components/ServiceCard.js` - Individual service card component
- `src/services/` - API service modules

## Important Patterns
- Projects are displayed in a table with columns: Icon, Project, Quick Actions, Tasks, Active Ports, PM2 Processes, Stop, Git Status
- Each row has a single "Stop All" button that kills all ports AND PM2 processes for that project
- The stop button is always visible but disabled when no processes are active
- Port killing uses `lsof -ti:PORT | xargs kill -9`
- PM2 management uses the PM2 API via child_process exec
- After killing ports/processes, multiple refresh cycles run (immediate, 1s, 3s) to ensure UI updates

## PM2 Process Naming Convention
PM2 processes are named as `{project-id-slug}-{task-name}` (e.g., `portio-backend`, `crm-2024-frontend`)

## Development Notes
- The app runs via PM2 - never use `npm run dev` directly
- Use `pm2 logs <name> --lines N --nostream` to check logs
- Don't kill or restart the emulator
- Never deploy - the user deploys manually
- Don't run git commits - user does them manually
- CORS errors are often red herrings
- Use flat icons only, not 3D colourful ones
