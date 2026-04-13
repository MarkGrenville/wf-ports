const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAppPath: () => ipcRenderer.invoke("get-app-path"),

  // Dialog methods
  showErrorDialog: (title, content) =>
    ipcRenderer.invoke("show-error-dialog", title, content),
  showInfoDialog: (title, content) =>
    ipcRenderer.invoke("show-info-dialog", title, content),

  // Platform info
  platform: process.platform,

  // Node.js version info
  versions: process.versions,

  // Check if we're in Electron
  isElectron: true,
});

// Log that preload script has loaded
console.log("Preload script loaded successfully");
