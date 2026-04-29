/**
 * @file server.js
 * @description Main entry point for the LMS backend server.
 * Sets up Express, connects to MongoDB, registers all routes, and starts the server.
 */

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

// Import route files
const authRoutes = require("./src/routes/auth.routes");
const categoryRoutes = require("./src/routes/category.routes");
const courseRoutes = require("./src/routes/course.routes");
const lessonRoutes = require("./src/routes/lesson.routes");
const enrollmentRoutes = require("./src/routes/enrollment.routes");
const paymentRoutes = require("./src/routes/payment.routes");
const liveClassRoutes = require("./src/routes/liveClass.routes");
const quizRoutes = require("./src/routes/quiz.routes");
const certificateRoutes = require("./src/routes/certificate.routes");
const adminRoutes = require("./src/routes/admin.routes");
// NEW: Installment plan routes (3-part payment)
const installmentRoutes = require("./src/routes/installment.routes");
// NEW: Admin custom pricing routes
const customPricingRoutes = require("./src/routes/customPricing.routes");

// Import seed function
const seedDatabase = require("./src/utils/seed");

// Initialize Express app
const app = express();

// ─── Trust Proxy (needed for Railway / Vercel deploys) ───────────────────────
app.set("trust proxy", 1);

// ─── Security & Utility Middleware ───────────────────────────────────────────
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// HTTP request logger
app.use(morgan("dev"));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// Raw body needed for Razorpay webhook signature verification
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

// Parse JSON and URL-encoded bodies for all other routes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LMS Server is running 🚀",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/live-classes", liveClassRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/admin", adminRoutes);
// NEW: Installment payment plan routes
app.use("/api/installments", installmentRoutes);
// NEW: Admin custom pricing routes
app.use("/api/custom-pricing", customPricingRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(400).json({
      success: false,
      message: `Duplicate value entered for field: ${field}`,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token. Please log in again.",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired. Please log in again.",
    });
  }

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File too large. Maximum size is 500MB for videos, 5MB for images.",
    });
  }

  // Default server error
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});



// ─── MongoDB Connection & Server Start ────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in environment variables");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB connected successfully");

    // Run seed data on first startup
    try {
      await seedDatabase();
    } catch (seedErr) {
      console.warn("⚠️ Seed data warning:", seedErr.message);
    }

    app.listen(PORT, () => {
      console.log(`🚀 LMS Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🌐 Client URL: ${process.env.CLIENT_URL || "http://localhost:3000"}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received. Closing server gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err.message);
  process.exit(1);
});

module.exports = app;
