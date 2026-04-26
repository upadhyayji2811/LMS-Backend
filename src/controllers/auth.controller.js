/**
 * @file auth.controller.js
 * @description Authentication controller — register, login, profile management.
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const { sendWelcomeEmail } = require("../utils/sendEmail");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");

/**
 * Generate a signed JWT for a user.
 * @param {string} userId - MongoDB user _id
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// ─── Register ─────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/register
 * Creates a new user account and returns a JWT.
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // OLD: Only allow student or instructor roles during registration
    // OLD: const allowedRoles = ["student", "instructor"];
    // OLD: const userRole = allowedRoles.includes(role) ? role : "student";

    // NEW: Public registration sirf students ke liye hai.
    // Instructor aur Admin accounts sirf admin create karta hai.
    if (role === "instructor" || role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Instructor/Admin accounts can only be created by an administrator. Please contact your platform admin.",
      });
    }
    const userRole = "student"; // Public registration = always student

    // Create the user (password hashed in pre-save hook)
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: userRole,
    });

    // Generate JWT
    const token = generateToken(user._id);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user).catch((err) =>
      console.warn("Welcome email failed:", err.message)
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully! Welcome to LMS Platform. 🎮",
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Registration failed. Please try again.",
    });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/login
 * Verifies credentials and returns a JWT.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Find user and explicitly select password (select: false in schema)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      "+password"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Contact support.",
      });
    }

    // Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Login successful! Welcome back. 👋",
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
};

// ─── Get Me ───────────────────────────────────────────────────────────────────
/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("enrolledCourses", "title thumbnail category price")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch profile." });
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────
/**
 * PUT /api/auth/profile
 * Updates user name, bio, and optionally avatar.
 */
const updateProfile = async (req, res) => {
  try {
    const { name, bio } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Handle avatar upload
    if (req.file) {
      // Delete old avatar from Cloudinary
      if (user.avatar) {
        const publicId = user.avatar.split("/").pop().split(".")[0];
        await deleteFromCloudinary(`lms/avatars/${publicId}`).catch(() => {});
      }

      // Upload new avatar
      const result = await uploadToCloudinary(req.file.buffer, "lms/avatars", {
        transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face" }],
      });
      user.avatar = result.secure_url;
    }

    if (name) user.name = name.trim();
    if (bio !== undefined) user.bio = bio.trim();

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error("updateProfile error:", err);
    res.status(500).json({ success: false, message: "Failed to update profile." });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────
/**
 * PUT /api/auth/change-password
 * Changes user password after verifying old password.
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long.",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    user.password = newPassword; // Will be hashed in pre-save hook
    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
      token,
    });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ success: false, message: "Failed to change password." });
  }
};

// ─── Logout ────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/logout
 * Stateless logout — just clear client-side token. Returns success.
 */
const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
};

module.exports = { register, login, getMe, updateProfile, changePassword, logout };
