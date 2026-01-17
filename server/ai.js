// server/ai.js
const Groq = require("groq-sdk");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// -----------------------------------------
// 1. LOAD GROQ API
// -----------------------------------------
let groq;
let modelName;

try {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Default Groq model
  modelName =
    process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  console.log("✓ Groq Model Loaded:", modelName);
} catch (err) {
  console.error("✗ Failed to initialize Groq:", err.message);
}

// -----------------------------------------
// 2. SANITIZE INPUT
// -----------------------------------------
function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 50000);
}

// -----------------------------------------
// 3. UNIVERSAL AI REQUEST HANDLER
// -----------------------------------------
async function generateAIResponse(prompt) {
  if (!groq) return "AI model not initialized. Check API key.";

  prompt = sanitizeText(prompt);

  try {
    const response = await groq.chat.completions.create({
      model: modelName,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    const message = response.choices?.[0]?.message?.content;
    return message || "No response from AI.";
  } catch (err) {
    console.error("✗ Groq API Error:", err.message);

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
