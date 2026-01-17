// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {

  // ================================
  // 💠 FLOATING WINDOW DRAGGING
  // ================================
  moveWindowBy: (dx, dy) => {
    ipcRenderer.send("move-window-by", { dx, dy });
  },

  // ================================
  // 💠 CLICK-THROUGH CONTROL
  // ================================
  enableClicks: () => ipcRenderer.send("enable-clicks"),
  disableClicks: () => ipcRenderer.send("disable-clicks"),

  // ================================
  // 💠 PRODUCTIVITY USAGE TRACKING
  // ================================
  onUsageUpdate: (callback) => {
    ipcRenderer.removeAllListeners("usage-update"); // FIX
    ipcRenderer.on("usage-update", (_event, data) => callback(data));
  },

  requestUsageSnapshot: () =>
    ipcRenderer.send("request-usage-snapshot"),

  onUsageSnapshot: (callback) => {
    ipcRenderer.removeAllListeners("usage-snapshot"); // FIX
    ipcRenderer.on("usage-snapshot", (_event, data) => callback(data));
  },

  // ================================
  // 💠 SESSION TRACKING
  // ================================
  startTrackingSession: () =>
    ipcRenderer.send("start-tracking-session"),

  stopTrackingSession: () =>
    ipcRenderer.send("stop-tracking-session"),

  requestTrackingData: () =>
    ipcRenderer.send("request-tracking-data"),

  onTrackingData: (callback) => {
    ipcRenderer.removeAllListeners("tracking-data"); // FIX
    ipcRenderer.on("tracking-data", (_event, data) => callback(data));
  },

  // ======================================================
  // ⭐ WEBSITE TERMS + COOKIES + RISK SCANNER ⭐
  // ======================================================

  // 🔍 Receive active Chrome URL
  onURLUpdate: (callback) => {
    ipcRenderer.removeAllListeners("active-url"); // FIX
    ipcRenderer.on("active-url", (_event, data) => {
      console.log("💛 PRELOAD GOT active-url:", data); // debug
      callback(data);
    });
  },

  // 📡 Ask main.js to scan a given URL manually
  scanURL: (url) =>
    ipcRenderer.send("scan-url", { url }),

  // 📩 Receive AI risk result from backend
  onScanResult: (callback) => {
    ipcRenderer.removeAllListeners("scan-result"); // FIX
    ipcRenderer.on("scan-result", (_event, data) => {
      console.log("💜 PRELOAD GOT scan-result:", data); // debug
      callback(data);
    });
  },

});
