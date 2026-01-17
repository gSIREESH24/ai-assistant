// server/ai.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// -----------------------------------------
// 1. LOAD GEMINI API
// -----------------------------------------
let model;

try {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // Use 2.0 Flash if available, otherwise fallback
  const modelName =
    process.env.GEMINI_MODEL ||
    "gemini-2.0-flash"; // fallback safe default

  model = genAI.getGenerativeModel({ model: modelName });

  console.log("✓ Gemini Model Loaded:", modelName);
} catch (err) {
  console.error("✗ Failed to initialize Gemini:", err.message);
}

// -----------------------------------------
// 2. CLEAN & SANITIZE INPUT
// -----------------------------------------
function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 50000); // 50k chars safe
}

// -----------------------------------------
// 3. UNIVERSAL AI REQUEST HANDLER
// -----------------------------------------
async function generateAIResponse(prompt) {
  if (!model || !model.generateContent) {
    return "AI model not initialized. Check API key.";
  }

  prompt = sanitizeText(prompt);

  try {
    const result = await model.generateContent(prompt);

    // Gemini sometimes returns nested text
    if (
      result &&
      result.response &&
      typeof result.response.text === "function"
    ) {
      return result.response.text();
    }

    // If result.text exists
    if (typeof result.text === "function") return result.text();

    // If raw content block exists
    if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return result.candidates[0].content.parts[0].text;
    }

    return String(result);
  } catch (err) {
    console.error("✗ Gemini API Error:", err.message);

    // Handle rate-limits gracefully
    if (err.message.includes("429")) {
      return JSON.stringify({
        ai_error: true,
        message: "Rate limit — try again in a moment.",
      });
    }

    return JSON.stringify({
      ai_error: true,
      message: err.message,
    });
  }
}

// -----------------------------------------
// 4. EXPORT
// -----------------------------------------
module.exports = generateAIResponse;
