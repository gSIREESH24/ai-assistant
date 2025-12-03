const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {

  moveWindowBy: (dx, dy) => {
    ipcRenderer.send("move-window-by", { dx, dy });
  },

  enableClicks: () => {
    ipcRenderer.send("enable-clicks");
  },

  disableClicks: () => {
    ipcRenderer.send("disable-clicks");
  }
});
