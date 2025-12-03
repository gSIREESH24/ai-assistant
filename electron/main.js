// electron/main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 300,
    x: 50,
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:5173");

  win.once("ready-to-show", () => {
    // Window should be click-through by default
    win.setIgnoreMouseEvents(true, { forward: true });
    win.show();
  });

  // Enable clicking (called when mouse enters cat/chat)
  ipcMain.on("enable-clicks", () => {
    if (!win) return;
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
  });

  // Disable clicking (window becomes click-through again)
  ipcMain.on("disable-clicks", () => {
    if (!win) return;
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setFocusable(false);
  });

  // Drag transparent window by moving mouse
  ipcMain.on("move-window-by", (_evt, { dx, dy }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  });
}

app.whenReady().then(createWindow);
