# PortIO Swift - Native macOS App

A native Swift macOS application that replaces the React + Express + Electron stack with a single Swift app.

## Features

- **Project scanning**: Scans `~/Projects` for `wf-ports.json` files
- **Firestore sync**: Saves/loads projects from Firebase Firestore (same `projects` collection as web app)
- **Port status**: Checks port status via `lsof`, kills ports with SIGTERM/SIGKILL
- **Process management**: Replaces PM2 with native `Process`-based process management
- **Quick actions**: Open in Finder, Cursor, Firebase Console, Google Cloud Console
- **Git status**: Branch and uncommitted changes indicator
- **VS Code tasks**: Execute tasks from `.vscode/tasks.json`

## Requirements

- macOS 14.0+
- Xcode 15+
- Firebase project `portio-ea1df` with Firestore

## Setup

1. **Firebase**: Add a macOS app to your Firebase project at [Firebase Console](https://console.firebase.google.com) to get a proper `GoogleService-Info.plist`. Replace `PortIO/Resources/GoogleService-Info.plist` with the downloaded file. The current plist uses web app credentials which may work for Firestore but a proper macOS app config is recommended.

2. **Build**: Open `PortIO.xcodeproj` in Xcode and build (⌘B), or run:
   ```bash
   xcodegen generate  # if you modify project.yml
   xcodebuild -scheme PortIO -configuration Debug build
   ```

3. **Run**: The app runs without App Sandbox to allow file system access, process management, and port scanning.

## Project Structure

- `App/` - App entry, AppState, AppDelegate
- `Models/` - Project, Service, PortStatus, ManagedProcess, GitInfo, FirebaseInfo, VSCodeTask
- `Services/` - FirestoreService, PortScanner, ProcessManager, ProjectScanner, GitService, FirebaseDetector
- `Views/` - MainWindowView, ProjectTableView, port/process badges, detail sheet
- `Utilities/` - ShellExecutor, URLOpener, WindowManager

## Data Compatibility

The app reads and writes the same Firestore `projects` collection as the web app. Project data format is identical. Local `wf-ports.json` files remain the source of truth for rescanning.
