const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {

  moveWindowBy: (dx, dy) => {
    ipcRenderer.send("move-window-by", { dx, dy });
  },

  enableClicks: () => ipcRenderer.send("enable-clicks"),
  disableClicks: () => ipcRenderer.send("disable-clicks"),

  onUsageUpdate: (callback) => {
    ipcRenderer.removeAllListeners("usage-update");
    ipcRenderer.on("usage-update", (_event, data) => callback(data));
  },

  requestUsageSnapshot: () =>
    ipcRenderer.send("request-usage-snapshot"),

  onUsageSnapshot: (callback) => {
    ipcRenderer.removeAllListeners("usage-snapshot");
    ipcRenderer.on("usage-snapshot", (_event, data) => callback(data));
  },

  startTrackingSession: () =>
    ipcRenderer.send("start-tracking-session"),

  stopTrackingSession: () =>
    ipcRenderer.send("stop-tracking-session"),

  requestTrackingData: () =>
    ipcRenderer.send("request-tracking-data"),

  onTrackingData: (callback) => {
    ipcRenderer.removeAllListeners("tracking-data");
    ipcRenderer.on("tracking-data", (_event, data) => callback(data));
  },

  onURLUpdate: (callback) => {
    ipcRenderer.removeAllListeners("active-url");
    ipcRenderer.on("active-url", (_event, data) => {
      console.log("active-url:", data);
      callback(data);
    });
  },

  scanURL: (url) =>
    ipcRenderer.send("scan-url", { url }),

  onScanResult: (callback) => {
    ipcRenderer.removeAllListeners("scan-result");
    ipcRenderer.on("scan-result", (_event, data) => {
      console.log("scan-result:", data);
      callback(data);
    });
  },

});
