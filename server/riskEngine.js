// riskEngine.js

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const whois = require("whois-json");
const generateAIResponse = require("./ai"); // Multi-AI pipeline

// -----------------------------------------------------------
// 1. PHISHTANK CHECK (community phishing database)
// -----------------------------------------------------------
async function checkPhishing(url) {
  try {
    const response = await fetch("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        url,
        format: "json",
      }),
    });

    const data = await response.json();

    return (
      data?.results?.in_database === true &&
      data?.results?.verified === true
    );
  } catch (err) {
    console.error("PhishTank Error:", err.message);
    return false;
  }
}

// -----------------------------------------------------------
// 2. DOMAIN AGE CHECK (WHOIS)
// -----------------------------------------------------------
async function checkDomainAge(url) {
  try {
    const domain = new URL(url).hostname;
    const info = await whois(domain);

    if (!info.creationDate) return "unknown";

    const created = new Date(info.creationDate);
    const now = new Date();
    const diffDays = (now - created) / (1000 * 60 * 60 * 24);

    return diffDays;
  } catch (err) {
    return "unknown";
  }
}

// -----------------------------------------------------------
// 3. SCAM KEYWORD DETECTION
// -----------------------------------------------------------
function keywordRiskScan(text) {
  const scamWords = [
    "verify your account",
    "payment pending",
    "urgent",
    "reset immediately",
    "click to claim",
    "free iphone",
    "bank verification",
    "congratulations you won",
    "login error",
    "paypal problem",
    "limited time",
    "your account is locked",
    "account suspended",
    "billing issue"
  ];

  const lower = text.toLowerCase();
  return scamWords.filter((w) => lower.includes(w));
}

// -----------------------------------------------------------
// 4. HTTPS CHECK
// -----------------------------------------------------------
function isHttp(url) {
  return !url.startsWith("https://");
}

// -----------------------------------------------------------
// 5. AI-based T&C risk scoring (0–100)
// -----------------------------------------------------------
async function checkAITextRisk(text) {
  if (!text || text.trim().length === 0) return 0;

  const prompt = `
You are a cybersecurity AI. Analyze this text for:
- scam signals
- fraud language
- phishing patterns
- fear tactics
- unrealistic offers
- suspicious grammar

Return ONLY a number (0–100). No explanation.

TEXT:
${text}
  `;

  try {
    const resp = await generateAIResponse(prompt);
    const num = parseInt(resp.replace(/[^0-9]/g, ""));

    if (isNaN(num)) return 0;
    return Math.min(Math.max(num, 0), 100);
  } catch {
    return 0;
  }
}

// -----------------------------------------------------------
// 6. FINAL RISK SCORE CALCULATION
// -----------------------------------------------------------
function calculateRisk({
  phishingFlag,
  domainAge,
  keywordHits,
  httpFlag,
  url,
  aiRisk
}) {
  let score = 0;
  const issues = [];

  // 1. Confirmed phishing = super high risk
  if (phishingFlag) {
    score += 80;
    issues.push(" flagged as phishing by PhishTank");
  }

  // 2. HTTP (no SSL)
  if (httpFlag) {
    score += 30;
    issues.push("Unsecured connection (HTTP only)");
  }

  // 3. Domain age weighting
  if (domainAge === "unknown") {
    score += 25;
    issues.push("Domain registration date unknown");
  } else if (domainAge < 30) {
    score += 40;
    issues.push(`New domain detected (${Math.floor(domainAge)} days old)`);
  } else if (domainAge < 90) {
    score += 25;
    issues.push(`Recent domain (${Math.floor(domainAge)} days old)`);
  }

  // 4. Keyword-based scam detection
  if (keywordHits.length > 0) {
    score += keywordHits.length * 10;
    issues.push(`Suspicious keywords found: ${keywordHits.slice(0, 3).join(", ")}`);
  }

  // 5. Suspicious domain patterns
  const domain = new URL(url).hostname;

  if (domain.includes("-")) {
    score += 10;
    issues.push("Domain contains hyphens (common in scams)");
  }
  if (/[0-9]/.test(domain)) {
    score += 10;
    issues.push("Domain contains numbers");
  }

  // 6. Brand impersonation detection
  const brands = ["google", "amazon", "paypal", "microsoft", "apple", "bank"];

  for (let brand of brands) {
    if (domain.includes(brand)) {
      const safeDomains = [
        `${brand}.com`,
        `${brand}.co`,
        `${brand}.in`,
        `${brand}.org`
      ];

      const isOriginal = safeDomains.some((safe) => domain.endsWith(safe));

      if (!isOriginal) {
        score += 40;
        issues.push(`Potential brand impersonation: ${brand}`);
      }
    }
  }

  // 7. Add AI text risk scoring
  if (aiRisk > 70) {
    score += 40;
    issues.push("High-risk language detected by AI");
  } else if (aiRisk > 40) {
    score += 20;
    issues.push("Suspicious language patterns detected");
  } else if (aiRisk > 20) {
    score += 10;
  }

  return {
    score: Math.min(score, 100),
    issues
  };
}

// -----------------------------------------------------------
// 7. MAIN ENGINE
// -----------------------------------------------------------
async function analyzeWebsiteRisk(url, tAndCText = "") {
  try {
    const phishingFlag = await checkPhishing(url);
    const domainAge = await checkDomainAge(url);
    const keywordHits = keywordRiskScan(tAndCText);
    const httpFlag = isHttp(url);
    const aiRisk = await checkAITextRisk(tAndCText);

    const { score: riskScore, issues } = calculateRisk({
      phishingFlag,
      domainAge,
      keywordHits,
      httpFlag,
      url,
      aiRisk,
    });

    let recommendation = "Safe to browse.";
    if (riskScore >= 70) {
      recommendation = "DANGEROUS: Do not enter personal information. Close this site.";
    } else if (riskScore >= 45) {
      recommendation = "High Risk: Exercise extreme caution. Verify the URL manually.";
    } else if (riskScore >= 20) {
      recommendation = "Moderate Risk: Check the URL and content carefully.";
    }

    return {
      url,
      riskScore,
      issues,
      recommendation,
      phishingFlag,
      domainAge,
      keywordHits,
      httpFlag,
      aiRisk,
      verdict: riskScore >= 45 ? "DANGEROUS" : "SAFE",
    };
  } catch (err) {
    console.error("Analysis Error:", err);
    return {
      url,
      riskScore: 0,
      issues: ["Error performing analysis"],
      recommendation: "Analysis failed. Proceed with caution.",
      verdict: "SAFE" // default fallback
    };
  }
}

module.exports = analyzeWebsiteRisk;
