// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ---- Dragging the floating window ----
  moveWindowBy: (dx, dy) => {
    ipcRenderer.send("move-window-by", { dx, dy });
  },

  // ---- Click-through control ----
  enableClicks: () => {
    ipcRenderer.send("enable-clicks");
  },

  disableClicks: () => {
    ipcRenderer.send("disable-clicks");
  },

  // ---- Productivity Tracking: live app usage ----
  onUsageUpdate: (callback) => {
    ipcRenderer.on("usage-update", (_event, data) => callback(data));
  },

  // ---- Request full usage snapshot ----
  requestUsageSnapshot: () => {
    ipcRenderer.send("request-usage-snapshot");
  },

  // ---- Receive usage snapshot ----
  onUsageSnapshot: (callback) => {
    ipcRenderer.on("usage-snapshot", (_event, data) => callback(data));
  },

  // ---- Session tracking (start / stop / data) ----
  startTrackingSession: () => {
    ipcRenderer.send("start-tracking-session");
  },

  stopTrackingSession: () => {
    ipcRenderer.send("stop-tracking-session");
  },

  requestTrackingData: () => {
    ipcRenderer.send("request-tracking-data");
  },

  onTrackingData: (callback) => {
    ipcRenderer.on("tracking-data", (_event, data) => callback(data));
  },
});
