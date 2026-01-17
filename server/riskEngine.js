
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const whois = require("whois-json");
const generateAIResponse = require("./ai");


const INDIAN_ACTS = [
  "IT Act, 2000 (Section 43A, 72A)",
  "Digital Personal Data Protection (DPDP) Act, 2023",
  "IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021",
  "Consumer Protection (E-Commerce) Rules, 2020",
  "Aadhaar Act, 2016",
  "National Cyber Security Policy, 2013"
];

const EU_ACTS = [
  "EU AI Act",
  "GDPR (General Data Protection Regulation)",
  "Digital Services Act (DSA)"
];

const MANDATORY_PATTERNS = {
  INDIAN_COMMERCE_RULES: {
    rule: "Consumer Protection (E-Commerce) Rules, 2020",
    required: ["grievance officer", "nodal officer", "country of origin", "return policy"],
    violationMsg: "Missing mandatory disclosure of Grievance Officer or Nodal Contact details."
  },
  IT_RULES_2021: {
    rule: "IT Rules, 2021 (Intermediary Guidelines)",
    required: ["grievance officer", "compliance officer", "contact mechanism"],
    violationMsg: "Intermediaries and E-commerce entities must appoint and display a Grievance Officer."
  },
  DPDP_ACT_2023: {
    rule: "DPDP Act, 2023",
    required: ["consent manager", "purpose of collection", "withdraw consent", "privacy policy"],
    violationMsg: "Lack of clear Consent Mechanisms or Purpose Limitation disclosures."
  }
};


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


function heuristicComplianceScan(text, url) {
  const textLower = text.toLowerCase();
  const violations = [];
  let scoreImpact = 0;


  const isIndianContext = url.endsWith(".in") || textLower.includes("rupee") || textLower.includes("india");

  if (isIndianContext) {

    const hasGrievance = textLower.includes("grievance") || textLower.includes("nodal officer");
    if (!hasGrievance) {
      violations.push({
        act: "IT Rules, 2021 & E-Commerce Rules",
        reason: "Mandatory 'Grievance Officer' details are missing from the page.",
        severity: "High"
      });
      scoreImpact += 25;
    }


    const hasAddress = textLower.includes("registered address") || textLower.includes("corporate office");
    if (!hasAddress) {
      violations.push({
        act: "Consumer Protection Rules, 2020",
        reason: "Physical contact address must be clearly displayed.",
        severity: "Medium"
      });
      scoreImpact += 15;
    }
  }


  if (!textLower.includes("privacy policy")) {
    violations.push({
      act: "DPDP Act, 2023 / IT Act, 2000",
      reason: "No 'Privacy Policy' link or section found.",
      severity: "High"
    });
    scoreImpact += 20;
  }

  return { violations, scoreImpact };
}


async function analyzeLegalComplianceAI(text) {
  if (!text || text.trim().length === 0) {
    return { score: 0, violations: [], summary: "Insufficient content for legal audit." };
  }

  const cleanText = text.slice(0, 15000);

  const prompt = `
You are a Senior Legal Compliance Auditor for Digital Governance.
Your task: Audit this specific website text for violations of Indian and EU Digital Laws.

STRICT LAWS TO ENFORCE:
1. **IT Rules, 2021 (India)**: Requires 'Grievance Officer' details, 'Physical Contact Address'.
2. **DPDP Act, 2023 (India)**: Requires 'Consent Manager', 'Purpose Limitation', 'Right to Withdraw Consent'.
3. **E-Commerce Rules, 2020 (India)**: Requires 'Country of Origin', 'Return Policy', 'Seller Details'.
4. **GDPR (EU)**: Requires 'Cookie Consent', 'Data Controller Info'.
5. **Dark Patterns**: Check for 'False Urgency' (e.g. "Only 2 left!"), 'Forced Action', 'Subscription Traps'.

INPUT TEXT:
"${cleanText}"

OUTPUT FORMAT (JSON ONLY):
{
  "riskScore": number (0-100),
  "summary": "Professional legal summary of the site's compliance status.",
  "violations": [
    {
      "act": "Exact Act/Rule Name",
      "reason": "Specific observed failure (e.g. 'Site uses false urgency countdown timer' or 'No Grievance Officer listed').",
      "severity": "High" | "Medium" | "Low"
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Be strict. If a "Grievance Officer" is missing for an Indian site, that is a HIGH violation.
- If "Dark Patterns" (like fake urgency) are found, flag them under "Consumer Protection Act".
- Return ONLY valid JSON.
  `;

  try {
    const aiRaw = await generateAIResponse(prompt);


    const jsonMatch = aiRaw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : aiRaw;

    const result = JSON.parse(jsonStr);

    return {
      score: result.riskScore || 0,
      violations: Array.isArray(result.violations) ? result.violations : [],
      summary: result.summary || "Legal scan completed."
    };
  } catch (err) {
    console.error("AI Legal Audit Failed:", err.message);
    return { score: 0, violations: [], summary: "Automated legal audit unavailable." };
  }
}


function calculateFinalVerdict({
  phishingFlag,
  domainAge,
  httpFlag,
  heuristicResult,
  aiResult,
  url
}) {
  let score = aiResult.score;
  let issues = [];



  const allViolations = [...heuristicResult.violations, ...aiResult.violations];
  score = Math.max(score, heuristicResult.scoreImpact);


  if (phishingFlag) {
    score = 100;
    allViolations.unshift({
      act: "IT Act, 2000 (Section 66D)",
      reason: "Detected in global phishing database (Cheating by personation).",
      severity: "Critical"
    });
  }


  if (httpFlag) {
    score += 15;
    issues.push("Unsecured HTTP connection (Data privacy risk)");
  }


  if (domainAge !== "unknown" && domainAge < 30) {
    score += 20;
    issues.push(`Newly registered domain (${Math.floor(domainAge)} days old). High scam potential.`);
  }


  const uniqueViolations = allViolations.filter((v, i, self) =>
    i === self.findIndex((t) => (t.act === v.act && t.reason === v.reason))
  );


  let verdict = "SAFE";
  if (score >= 80) verdict = "DANGEROUS";
  else if (score >= 50) verdict = "RISKY";
  else if (score >= 20) verdict = "MODERATE";

  return {
    score: Math.min(score, 100),
    verdict,
    violations: uniqueViolations,
    summary: aiResult.summary || "Scan complete.",
    issues
  };
}


async function analyzeWebsiteRisk(url, tAndCText = "") {
  try {

    const [phishingFlag, domainAge, aiResult] = await Promise.all([
      checkPhishing(url),
      checkDomainAge(url),
      analyzeLegalComplianceAI(tAndCText)
    ]);

    const httpFlag = !url.startsWith("https://");
    const heuristicResult = heuristicComplianceScan(tAndCText, url);

    const finalResult = calculateFinalVerdict({
      phishingFlag,
      domainAge,
      httpFlag,
      heuristicResult,
      aiResult,
      url
    });

    return {
      url,
      riskScore: finalResult.score,
      verdict: finalResult.verdict,
      violations: finalResult.violations,
      summary: finalResult.summary,
      issues: finalResult.violations.map(v => `${v.act}: ${v.reason}`),
      details: {
        phishing: phishingFlag,
        domainAge,
        aiScore: aiResult.score
      }
    };

  } catch (err) {
    console.error("Risk Engine Failure:", err);
    return {
      url,
      riskScore: 0,
      verdict: "SAFE",
      violations: [],
      summary: "System error during analysis. Proceed with caution.",
      issues: ["Scan failed"]
    };
  }
}

module.exports = analyzeWebsiteRisk;
