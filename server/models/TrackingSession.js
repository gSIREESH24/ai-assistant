// backend/models/TrackingSession.js
const mongoose = require("mongoose");

const trackingSessionSchema = new mongoose.Schema(
  {
    sessionStart: Date,
    sessionEnd: Date,
    timeline: [
    {
      app: String,
      start: Date,
      end: Date,
      durationSec: Number
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("TrackingSession", trackingSessionSchema);
