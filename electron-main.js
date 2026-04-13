const {
  app,
  BrowserWindow,
  Menu,
  shell,
  dialog,
  ipcMain,
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const { spawn } = require("child_process");
const express = require("express");
const fs = require("fs");

let mainWindow;
let serverProcess;
let expressApp;

// Express server (embedded)
const startExpressServer = () => {
  return new Promise((resolve, reject) => {
    try {
      // Import the server logic from server.js
      const serverPath = path.join(__dirname, "server.js");
      delete require.cache[require.resolve(serverPath)];

      // Start the Express server
      const { app: expressApp, startServer } = require("./server.js");
      const server = startServer();
      console.log("Express server started within Electron");
      resolve(server);
    } catch (error) {
      console.error("Failed to start Express server:", error);
      reject(error);
    }
  });
};

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "public/favicon.ico"),
    titleBarStyle: "hiddenInset",
    show: false,
  });

  // Load the app
  const startUrl = isDev
    ? "http://localhost:3850"
    : `file://${path.join(__dirname, "../build/index.html")}`;

  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    // Focus on the window
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// Application event handlers
app.whenReady().then(async () => {
  try {
    // Start the Express server first
    await startExpressServer();
    console.log("Express server is running on port 3851");

    // Create the main window
    createWindow();

    // Set up application menu
    createMenu();

    // Wait a bit for server to be fully ready
    setTimeout(() => {
      console.log("Port Monitor Electron app is ready!");
    }, 2000);
  } catch (error) {
    console.error("Failed to start the application:", error);
    dialog.showErrorBox(
      "Startup Error",
      "Failed to start the Port Monitor application. Please try again."
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle app termination
app.on("before-quit", () => {
  // Clean up server process if it exists
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: app.getName(),
      submenu: [
        {
          label: "About " + app.getName(),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About Port Monitor",
              message: "Port Monitor",
              detail:
                "A local development tool to monitor and manage ports for your projects.\n\nVersion: " +
                app.getVersion(),
            });
          },
        },
        { type: "separator" },
        {
          label: "Preferences...",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            // Open preferences (can be implemented later)
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectall" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Learn More",
          click: () => {
            shell.openExternal("https://github.com/");
          },
        },
        {
          label: "Documentation",
          click: () => {
            // Open documentation (can be implemented later)
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers for communication with renderer process
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("get-app-path", () => {
  return app.getAppPath();
});

ipcMain.handle("show-error-dialog", (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.handle("show-info-dialog", async (event, title, content) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: title,
    message: content,
    buttons: ["OK"],
  });
  return result.response;
});

// Export for testing
module.exports = { app, createWindow };
