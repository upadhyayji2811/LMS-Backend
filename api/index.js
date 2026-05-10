/**
 * @file api/index.js
 * @description Vercel serverless entry point.
 * Handles MongoDB connection with caching (reuses across warm invocations)
 * and delegates all requests to the Express app in server.js.
 */

const mongoose = require("mongoose");
const app = require("../server");

// ─── MongoDB Connection Cache ──────────────────────────────────────────────────
// Vercel serverless functions can be "warm" (reused container).
// We cache the connection so we don't reconnect on every request.
let isConnected = false;

async function connectDB() {
  // Already connected — reuse the existing connection
  if (isConnected && mongoose.connection.readyState === 1) return;

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Please add it in Vercel → Project Settings → Environment Variables."
    );
  }

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  isConnected = true;
  console.log("✅ MongoDB connected (Vercel serverless)");
}

// ─── Vercel Serverless Handler ─────────────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ DB Connection failed:", err.message);
    return res.status(500).json({
      success: false,
      message: "Database connection failed. Check Vercel environment variables.",
      error: err.message,
    });
  }

  // Delegate to Express app
  return app(req, res);
};