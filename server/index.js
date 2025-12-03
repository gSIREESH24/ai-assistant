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

// Start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const reply = await generateAIResponse(userMessage);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ reply: "Error: " + err.message });
  }
});
