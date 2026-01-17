
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


  const isIndianContext = url.endsWith(".in") || textLower.includes("rupee") || textLower.includes("india") || textLower.includes("delhi") || textLower.includes("mumbai") || textLower.includes("bangalore");
  const hasPrivacy = textLower.includes("privacy policy") || textLower.includes("privacy notice");
  const hasTerms = textLower.includes("terms of use") || textLower.includes("terms of service") || textLower.includes("terms & conditions");
  const hasContact = textLower.includes("contact us") || textLower.includes("support") || textLower.includes("about us") || textLower.includes("help");

  if (!hasPrivacy) {
    violations.push({
      act: "Global Data Protection Principles",
      reason: "Missing 'Privacy Policy'. This is a critical transparency failure for any legitimate site.",
      severity: "High"
    });
    scoreImpact += 20;
  }

  if (!hasTerms) {
    violations.push({
      act: "Consumer Transparency",
      reason: "Missing 'Terms of Service/Use'. Users cannot know their rights.",
      severity: "Medium"
    });
    scoreImpact += 10;
  }

  if (!hasContact) {
    violations.push({
      act: "Trust & Credibility",
      reason: "No obvious 'Contact' or 'Support' section found.",
      severity: "Low"
    });
    scoreImpact += 10;
  }

  if (isIndianContext) {

    const hasGrievance = textLower.includes("grievance") || textLower.includes("nodal officer") || textLower.includes("compliance officer");
    if (!hasGrievance) {
      violations.push({
        act: "IT Rules, 2021 (India)",
        reason: "Mandatory 'Grievance Officer' details are missing.",
        severity: "High"
      });
      scoreImpact += 25;
    }


    const hasAddress = textLower.includes("registered address") || textLower.includes("corporate office") || textLower.includes("building") || textLower.includes("floor");
    if (!hasAddress && !hasContact) {
      violations.push({
        act: "Consumer Protection Rules, 2020",
        reason: "No physical contact address or clear contact mechanism found.",
        severity: "Medium"
      });
      scoreImpact += 20;
    }
  }

  return { violations, scoreImpact };
}


async function analyzeLegalComplianceAI(text, url = "") {
  if (!text || text.trim().length === 0) {
    return { score: 10, violations: [], summary: "Insufficient content to fully verify, but no obvious threats found." };
  }

  const cleanText = text.slice(0, 15000);

  const prompt = `
You are a Senior Cyber-Security and Legal Compliance Auditor.
Your goal is to accurately assess the RISK LEVEL of a website based on its content.

CONTEXT:
URL: "${url}" (Infer jurisdiction from TLD if possible, e.g., .in = India, .eu = Europe)

EVALUATION CRITERIA:
1. **Universal Trust Indicators**:
   - Presence of "Privacy Policy", "Terms of Service", and "Contact Us" (Physical address/Email).
   - Professional language vs. Poor grammar/typos.
2. **Key Legal Compliance** (Strictly enforce based on inferred region):
   - **India**: IT Rules 2021 (Grievance Officer), DPDP Act (Consent Managers), E-Commerce Rules (Country of Origin).
   - **EU/US**: GDPR/CCPA (Cookie Consent, Data Rights).
3. **Dark Patterns & Risk Flags**:
   - False Urgency ("Only 2 minutes left!"), Forced Action, Hidden Costs.
   - High-yield financial promises (Scam indicators).

INPUT TEXT FROM WEBSITE:
"${cleanText}"

TASK:
Return a JSON object analyzing the risk.
Risk Score Scale:
0-20: Safe (Legitimate business/site)
21-49: Moderate (Missing some non-critical disclosures)
50-79: Risky (Major compliance failures, suspicious elements)
80-100: Dangerous (Scam, Phishing, Illegal)

OUTPUT FORMAT (JSON ONLY):
{
  "riskScore": number,
  "summary": "Brief, professional assessment of safety and compliance.",
  "violations": [
    {
      "act": "Act Name or Standard (e.g., 'Global Trust Standards' or 'IT Rules 2021')",
      "reason": "Specific observed failure.",
      "severity": "High" | "Medium" | "Low"
    }
  ]
}
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


  score = (aiResult.score * 0.6) + (heuristicResult.scoreImpact * 0.4);

  score = Math.max(score, heuristicResult.scoreImpact);
  if (aiResult.score > 80) score = Math.max(score, aiResult.score);


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
      analyzeLegalComplianceAI(tAndCText, url)
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
