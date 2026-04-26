/**
 * @file auth.middleware.js
 * @description JWT authentication middleware.
 * Verifies Bearer token from Authorization header and attaches user to req.
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User.model");

/**
 * Verifies JWT token from Authorization header.
 * Attaches decoded payload to req.user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const verifyToken = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header: "Bearer <token>"
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // Also check cookie (optional, for browser-based auth)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided. Please log in.",
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB (ensures user still exists and is active)
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is no longer valid. User not found.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please log in again.",
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please log in again.",
      });
    }

    console.error("❌ Auth middleware error:", err);
    return res.status(500).json({
      success: false,
      message: "Authentication error. Please try again.",
    });
  }
};

/**
 * Alias for verifyToken — blocks unauthenticated requests.
 * Use as: router.get('/protected', protectRoute, controller)
 */
const protectRoute = verifyToken;

/**
 * Optional auth — attaches user if token present, but doesn't block if absent.
 * Useful for endpoints that behave differently for logged-in vs. guest users.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // Continue without user
    }

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch {
    // Silently fail for optional auth
    next();
  }
};

// ─── adminOnly middleware (NEW — installment + custom pricing routes ke liye) ──
/**
 * Sirf admin role wale users ko allow karta hai.
 * protectRoute ke baad use karo.
 */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin only.",
    });
  }
  next();
};

module.exports = { verifyToken, protectRoute, optionalAuth, adminOnly };

