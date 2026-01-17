const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const whois = require("whois-json");


require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const generateAIResponse = require("./ai");
const TrackingSession = require("./models/TrackingSession");

const app = express();

// Allow large JSON payloads
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// -------------------- DB CONNECTION --------------------
console.log("Loaded MONGODB_URL:", process.env.MONGODB_URL);

mongoose
  .connect(process.env.MONGODB_URL)  // ⬅ NO EXTRA OPTIONS
  .then(() => console.log("✓ MongoDB connected successfully"))
  .catch((err) => console.error("✗ MongoDB connection error:", err));

  async function checkSafeBrowsing(url) {
      const body = {
        client: { clientId: "your-app", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }]
        }
      };

      const res = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.Gemini_Api_key}`,
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );

      const data = await res.json();
      return !!data.matches;
    }

      async function checkDomainAge(url) {
        try {
          const domain = new URL(url).hostname;
          const info = await whois(domain);

          if (!info.creationDate) return "unknown";

          const created = new Date(info.creationDate);
          const now = new Date();
          const diffDays = (now - created) / (1000 * 60 * 60 * 24);

          return diffDays; // days old
        }
        catch {
          return "unknown";
        }
      }

      function keywordRiskScan(text) {
          const scamWords = [
            "verify your account",
            "your payment is pending",
            "urgent",
            "reset immediately",
            "click to claim",
            "free iphone",
            "bank verification",
            "congratulations you won",
            "login error",
            "paypal problem"
          ];

          const lower = text.toLowerCase();
          return scamWords.filter(word => lower.includes(word));
        }

        function isHttp(url) {
          return !url.startsWith("https://");
        }

        function calculateRisk({
          googleFlag,
          domainAge,
          keywordHits,
          httpFlag
        }) {
          let score = 0;

          if (googleFlag) score += 80;
          if (httpFlag) score += 40;

          if (domainAge !== "unknown" && domainAge < 30) score += 30;

          score += keywordHits.length * 10;

          return Math.min(score, 100);
        }






// -------------------- BASE ROUTE --------------------
app.get("/", (req, res) => {
  res.send("FutureSafe AI Backend Running");
});

// ------------------------------------------------------
//                    1. CHAT (Gemini)
// ------------------------------------------------------
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ reply: "No message provided" });
    }

    const aiReply = await generateAIResponse(message);
    res.json({ reply: aiReply });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ reply: "Server error: " + err.message });
  }
});

// ------------------------------------------------------
//            2. T&C + Cookie Risk Analyzer
// ------------------------------------------------------
app.post("/api/scan", async (req, res) => {
  const { url, tAndCText } = req.body;

  const googleFlag = await checkSafeBrowsing(url);
  const domainAge = await checkDomainAge(url);
  const keywordHits = keywordRiskScan(tAndCText || "");
  const httpFlag = isHttp(url);

  const riskScore = calculateRisk({
    googleFlag,
    domainAge,
    keywordHits,
    httpFlag
  });

  console.log("==== DEBUG OUTPUT ====");
  console.log("RECEIVED URL:", url);
  console.log("RECEIVED TEXT LENGTH:", (tAndCText || "").length);
  console.log("googleFlag =", googleFlag);
  console.log("domainAge =", domainAge);
  console.log("keywordHits =", keywordHits);
  console.log("httpFlag =", httpFlag);
  console.log("riskScore =", riskScore);
  console.log("======================");

  res.json({
    url,
    riskScore,
    googleFlag,
    domainAge,
    keywordHits,
    httpFlag,
    verdict: riskScore >= 45 ? "DANGEROUS" : "SAFE"
  });
});



// ------------------------------------------------------
//            3. Save Tracking Session
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

// -------------------- START SERVER --------------------
app.listen(5000, () => {
  console.log("✓ Backend running on http://localhost:5000");
});
