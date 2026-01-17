const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const activeWin = require("active-win");
const fs = require("fs");


const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));


const { getActiveChromeURL } = require("./utils/chromeDebug");
const { scrapeWebsite: scanWebsite } = require("./utils/scraper");

let win;


let usage = {};
let lastApp = null;
let lastTimestamp = Date.now();

let trackingActive = false;
let sessionStart = null;
let sessionEnd = null;
let timeline = [];
let segmentApp = null;
let segmentStart = null;
let lastScannedUrl = null;

const USAGE_FILE = path.join(app.getPath("userData"), "usage.json");

function loadUsageData() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      usage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error loading usage:", err);
  }
}

function saveUsageData() {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (err) {
    console.error("Error saving usage:", err);
  }
}

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


async function trackActiveWindow() {
  try {
    const info = await activeWin();
    const now = Date.now();

    const appName = info?.owner?.name || info?.title || "Unknown App";
    console.log("Active window:", appName);


    if (lastApp) {
      const diff = Math.floor((now - lastTimestamp) / 1000);
      if (diff > 0) {
        usage[lastApp] = (usage[lastApp] || 0) + diff;
      }
    }

    lastApp = appName;
    lastTimestamp = now;


    if (trackingActive) {
      if (!segmentApp) {
        segmentApp = appName;
        segmentStart = now;
      } else if (segmentApp !== appName) {
        closeCurrentSegment(now);
        segmentApp = appName;
        segmentStart = now;
      }
    }


    win?.webContents?.send("usage-update", {
      current: appName,
      usage,
    });


    if (appName.toLowerCase().includes("chrome")) {
      console.log("🟨 Chrome active, fetching URL...");

      const url = await getActiveChromeURL();
      console.log("🌐 Chrome URL:", url);

      if (url && url !== lastScannedUrl) {
        lastScannedUrl = url;
        win.webContents.send("active-url", { url });

        console.log("🟧 Scraping:", url);
        const scraped = await scanWebsite(url);

        console.log("🟥 Scraped text length:", (scraped?.combinedText || "").length);


        console.log("🟪 Sending text to backend…");

        const aiResponse = await fetch("http://localhost:5000/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            tAndCText: scraped.text,
            cookies: scraped.cookies || []
          }),
        }).then(r => r.json());

        console.log("🟩 Backend Risk Result:", aiResponse);


        win.webContents.send("scan-result", aiResponse);
      }
    }
  } catch (err) {
    console.error("🚨 Error tracking window:", err);
  }
}


function createWindow() {
  win = new BrowserWindow({
    width: 450,
    height: 800,
    x: 50,
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:5173");


  win.once("ready-to-show", () => {
    win.show();
  });



  ipcMain.on("enable-clicks", () => {
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
  });

  ipcMain.on("disable-clicks", () => {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setFocusable(false);
  });


  ipcMain.on("move-window-by", (_evt, { dx, dy }) => {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  });


  ipcMain.on("request-usage-snapshot", (event) => {
    event.sender.send("usage-snapshot", {
      current: lastApp,
      usage,
    });
  });


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
    closeCurrentSegment(now);
    sessionEnd = now;

    event.sender.send("tracking-data", {
      trackingActive,
      sessionStart,
      sessionEnd,
      timeline,
    });
  });

  ipcMain.on("request-tracking-data", (event) => {
    event.sender.send("tracking-data", {
      trackingActive,
      sessionStart,
      sessionEnd,
      timeline,
    });
  });


  ipcMain.on("scan-url", async (_event, { url }) => {
    try {
      const scraped = await scanWebsite(url);

      const aiResponse = await fetch("http://localhost:5000/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          tAndCText: scraped.text,
          cookies: scraped.cookies || []
        }),
      }).then(r => r.json());

      win.webContents.send("scan-result", aiResponse);
    } catch (e) {
      win.webContents.send("scan-result", { error: true, message: e.message });
    }
  });
}


app.whenReady().then(() => {
  loadUsageData();
  createWindow();

  setInterval(trackActiveWindow, 1000);
  setInterval(saveUsageData, 60000);

  app.on("before-quit", saveUsageData);
});
