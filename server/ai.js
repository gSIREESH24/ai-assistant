const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const path = require("path");
// Try to load .env from project root so the key is available when running from `server`
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// Note: keep this initialization minimal so file is valid CommonJS.
// If the Google library's constructor or methods differ, adapt accordingly.
let genAI, model;
try {
  genAI = new GoogleGenerativeAI(process.env.Gemini_Api_key);
  model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
} catch (e) {
  console.warn("Generative AI client not initialized:", e && e.message ? e.message : e);
}

async function generateAIResponse(prompt) {
  if (!model || !model.generateContent) {
    // Fallback: return a simple echo when the model isn't available.
    return `Fallback reply: ${prompt}`;
  }

  const result = await model.generateContent(prompt);
  // Guard access to nested properties
  if (result && result.response && typeof result.response.text === "function") {
    return result.response.text();
  }
  if (result && result.response && typeof result.response === "string") {
    return result.response;
  }
  return String(result);
}

module.exports = generateAIResponse;
