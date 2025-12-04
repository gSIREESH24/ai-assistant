// electron/main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const activeWin = require("active-win");
const fs = require("fs");

let win;

// ----------- USAGE TRACKING DATA (AGGREGATED) ----------------
// Example: { "Chrome": 125, "Code": 522 } – total seconds per app
let usage = {};
let lastApp = null;
let lastTimestamp = Date.now();

// ----------- SESSION / TIMELINE TRACKING (DETAILED) ----------
// A single "session" is controlled from the renderer by a button.
// We keep every interval: which app, when it started & ended, and duration.
let trackingActive = false;
let sessionStart = null;
let sessionEnd = null;
let timeline = []; // { app, start, end, durationSec }
let segmentApp = null;
let segmentStart = null;

// Save file location for aggregated usage
const USAGE_FILE = path.join(app.getPath("userData"), "usage.json");

// Load saved usage data
function loadUsageData() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      usage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error loading usage:", err);
  }
}

// Save usage every minute + on exit
function saveUsageData() {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (err) {
    console.error("Error saving usage:", err);
  }
}

// Helper to close current segment (for session timeline)
function closeCurrentSegment(endTime) {
  if (!trackingActive || !segmentApp || !segmentStart) return;

  const durationSec = Math.max(
    0,
    Math.floor((endTime - segmentStart) / 1000)
  );

  if (durationSec > 0) {
    timeline.push({
      app: segmentApp,
      start: segmentStart,
      end: endTime,
      durationSec,
    });
  }

  segmentApp = null;
  segmentStart = null;
}

// Poll active window every second
async function trackActiveWindow() {
  try {
    const info = await activeWin();
    const now = Date.now();

    // Identify app
    const appName = info?.owner?.name || info?.title || "Unknown App";

    // ---- Aggregated usage (always-on) ----
    if (lastApp) {
      const diff = Math.floor((now - lastTimestamp) / 1000);
      if (diff > 0) {
        usage[lastApp] = (usage[lastApp] || 0) + diff;
      }
    }

    lastApp = appName;
    lastTimestamp = now;

    // ---- Detailed session tracking (controlled by button) ----
    if (trackingActive) {
      // If this is the first segment of the session
      if (!segmentApp) {
        segmentApp = appName;
        segmentStart = now;
      } else if (segmentApp !== appName) {
        // App changed: close previous segment and start new one
        closeCurrentSegment(now);
        segmentApp = appName;
        segmentStart = now;
      }
    }

    // Send live update to renderer
    if (win && win.webContents) {
      win.webContents.send("usage-update", {
        current: appName,
        usage,
      });
    }
  } catch (err) {
    console.error("Error tracking window:", err);
  }
}

// -----------------------------------------------------
//                      CREATE WINDOW
// -----------------------------------------------------
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
    focusable: false, // floating window unfocusable by default
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:5173");

  win.once("ready-to-show", () => {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.show();
  });

  // ---------------- WINDOW CLICK-THROUGH CONTROL ----------------

  ipcMain.on("enable-clicks", () => {
    if (!win) return;
    win.setIgnoreMouseEvents(false); // allow clicking
    win.setFocusable(true);
  });

  ipcMain.on("disable-clicks", () => {
    if (!win) return;
    win.setIgnoreMouseEvents(true, { forward: true }); // window becomes click-through
    win.setFocusable(false);
  });

  // ---------------- DRAG FLOATING WINDOW ----------------
  ipcMain.on("move-window-by", (_evt, { dx, dy }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  });

  // ---------------- REQUEST CURRENT USAGE SNAPSHOT ----------------
  ipcMain.on("request-usage-snapshot", (event) => {
    event.sender.send("usage-snapshot", {
      current: lastApp,
      usage,
    });
  });

  // ---------------- SESSION TRACKING CONTROL ----------------
  ipcMain.on("start-tracking-session", () => {
    trackingActive = true;
    sessionStart = Date.now();
    sessionEnd = null;
    timeline = [];
    segmentApp = null;
    segmentStart = null;
  });

  ipcMain.on("stop-tracking-session", (event) => {
    if (!trackingActive) return;

    const now = Date.now();
    trackingActive = false;
    // Close any open segment and mark session end
    closeCurrentSegment(now);
    sessionEnd = now;

    // Send final data back to renderer that requested the stop
    if (event && event.sender) {
      event.sender.send("tracking-data", {
        trackingActive,
        sessionStart,
        sessionEnd,
        timeline,
      });
    }
  });

  ipcMain.on("request-tracking-data", (event) => {
    event.sender.send("tracking-data", {
      trackingActive,
      sessionStart,
      sessionEnd,
      timeline,
    });
  });
}

// -----------------------------------------------------
//                 APP LIFECYCLE
// -----------------------------------------------------
app.whenReady().then(() => {
  loadUsageData();               // Load usage on startup
  createWindow();                // Launch floating cat

  setInterval(trackActiveWindow, 1000);  // Track app every second
  setInterval(saveUsageData, 60000);     // Save every minute

  app.on("before-quit", saveUsageData);  // Save on exit
});
