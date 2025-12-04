const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const dotenv = require("dotenv");
const path = require("path");
// Load .env from project root so running from the `server` directory still finds it
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json());

// Import the AI response generator
const generateAIResponse = require("./ai");

// Test route
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/assistantdb")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// Simple schema for tracking sessions
const trackingSessionSchema = new mongoose.Schema(
  {
    sessionStart: { type: Date, required: true },
    sessionEnd: { type: Date, required: true },
    timeline: [
      {
        app: String,
        start: Date,
        end: Date,
        durationSec: Number,
      },
    ],
  },
  { timestamps: true }
);

const TrackingSession =
  mongoose.models.TrackingSession ||
  mongoose.model("TrackingSession", trackingSessionSchema);

// Chat endpoint
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const reply = await generateAIResponse(userMessage);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ reply: "Error: " + err.message });
  }
});

// Save a tracking session
app.post("/tracking-session", async (req, res) => {
  try {
    const { sessionStart, sessionEnd, timeline } = req.body;

    if (!sessionStart || !sessionEnd) {
      return res.status(400).json({ error: "Missing sessionStart or sessionEnd" });
    }

    const created = await TrackingSession.create({
      sessionStart: new Date(sessionStart),
      sessionEnd: new Date(sessionEnd),
      timeline: (timeline || []).map((row) => ({
        app: row.app,
        start: new Date(row.start),
        end: new Date(row.end),
        durationSec: row.durationSec,
      })),
    });

    res.json({ ok: true, id: created._id });
  } catch (err) {
    console.error("Error saving tracking session:", err);
    res.status(500).json({ error: "Failed to save tracking session" });
  }
});

// Start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
