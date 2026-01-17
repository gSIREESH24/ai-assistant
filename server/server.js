const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const generateAIResponse = require("./ai");
const analyzeRisk = require("./riskEngine");
const TrackingSession = require("./models/TrackingSession");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cors());

console.log("Loaded MONGODB_URL:", process.env.MONGODB_URL);

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => console.log("✓ MongoDB connected successfully"))
  .catch((err) => console.error("✗ MongoDB connection error:", err));

app.get("/", (req, res) => {
  res.send("FutureSafe AI Backend Running");
});

app.post("/chat", async (req, res) => {
  try {
    const { message, url, tAndCText, scanResult } = req.body;

    if (!message) {
      return res.status(400).json({ reply: "No message provided" });
    }

    let finalPrompt = message;

    if (scanResult) {
      finalPrompt = `
WEBSITE SECURITY SCAN DATA:
${JSON.stringify(scanResult, null, 2)}

USER QUESTION:
${message}

Instructions:
1. Answer based on the scan data.
2. Use Markdown formatting.
3. Use ## for clear, bold headings (e.g. ## Risk Analysis).
4. Use bullet points (-) for listing issues or details.
5. Keep sections short and easy to read.
      `;
    } else if (url) {
      const scanData = await analyzeRisk(url, tAndCText || "");

      finalPrompt = `
WEBSITE SECURITY SCAN DATA:
${JSON.stringify(scanData, null, 2)}

USER QUESTION:
${message}

Instructions:
1. Answer based on the scan data.
2. Use Markdown formatting.
3. Use ## for headings.
4. Keep it concise and use bullet points.
      `;
    }

    const aiReply = await generateAIResponse(finalPrompt);
    res.json({ reply: aiReply });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ reply: "Server error: " + err.message });
  }
});

app.post("/api/scan", async (req, res) => {
  try {
    const { url, tAndCText } = req.body;

    const result = await analyzeRisk(url, tAndCText || "");
    res.json(result);

  } catch (err) {
    console.error("SCAN ERROR:", err);
    res.status(500).json({ error: "Risk scan failed" });
  }
});

// ------------------------------------------------------
// 3. Save Tracking Session
// ------------------------------------------------------
app.post("/tracking-session", async (req, res) => {
  try {
    const { sessionStart, sessionEnd, timeline } = req.body;

    if (!sessionStart || !sessionEnd) {
      return res.status(400).json({ error: "Missing session timestamps" });
    }

    const created = await TrackingSession.create({
      sessionStart: new Date(sessionStart),
      sessionEnd: new Date(sessionEnd),
      timeline,
    });

    res.json({ ok: true, id: created._id });

  } catch (err) {
    console.error("SESSION SAVE ERROR:", err);
    res.status(500).json({ error: "Failed to save session" });
  }
});

app.listen(5000, () => {
  console.log("✓ Backend running on http://localhost:5000");
});
