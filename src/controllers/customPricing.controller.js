/**
 * @file customPricing.controller.js
 * @description Controller for admin-managed custom pricing per student.
 *
 * Admin kisi bhi student ke liye kisi bhi course ki fees custom set kar sakta hai.
 * Yeh price sirf us student ko dikhti hai jab woh us course ko visit kare.
 *
 * Available endpoints:
 *   POST   /api/custom-pricing              → Set custom price (admin only)
 *   DELETE /api/custom-pricing/:id          → Remove custom price (admin only)
 *   GET    /api/custom-pricing/check/:courseId → Student: check if custom price exists
 *   GET    /api/custom-pricing/all          → Admin: sabhi custom prices
 *   PATCH  /api/custom-pricing/:id/toggle  → Admin: enable/disable
 */

const CustomPricing = require("../models/CustomPricing.model");
const Course = require("../models/Course.model");
const User = require("../models/User.model");

// ─── Set Custom Price (Admin Only) ───────────────────────────────────────────
/**
 * POST /api/custom-pricing
 * Admin kisi student ke liye kisi course ka custom price set karta hai.
 *
 * Body: { studentId, courseId, customPrice, reason?, expiresAt? }
 */
const setCustomPrice = async (req, res) => {
  try {
    const { studentId, courseId, customPrice, reason, expiresAt } = req.body;

    if (!studentId || !courseId || customPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "studentId, courseId, and customPrice are required.",
      });
    }

    if (customPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Custom price cannot be negative.",
      });
    }

    // Student exist karta hai?
    const student = await User.findById(studentId).select("name email role");
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }
    if (student.role !== "student") {
      return res.status(400).json({ success: false, message: "Custom pricing can only be set for students." });
    }

    // Course exist karta hai?
    const course = await Course.findById(courseId).select("title price");
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    // Agar pehle se active custom pricing hai toh use deactivate karo
    await CustomPricing.updateMany(
      { student: studentId, course: courseId, isActive: true },
      { isActive: false }
    );

    // Nayi custom pricing create karo
    const customPricing = await CustomPricing.create({
      student: studentId,
      course: courseId,
      customPrice,
      originalPrice: course.price,
      reason: reason || "",
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      createdBy: req.user._id,
    });

    await customPricing.populate("student", "name email");
    await customPricing.populate("course", "title price");
    await customPricing.populate("createdBy", "name");

    res.status(201).json({
      success: true,
      message: `Custom price ₹${customPrice} set for ${student.name} on "${course.title}".`,
      customPricing,
    });
  } catch (err) {
    console.error("setCustomPrice error:", err);
    res.status(500).json({ success: false, message: "Failed to set custom price." });
  }
};

// ─── Remove / Deactivate Custom Price (Admin Only) ────────────────────────────
/**
 * DELETE /api/custom-pricing/:id
 * Custom pricing ko deactivate karta hai (soft delete).
 */
const removeCustomPrice = async (req, res) => {
  try {
    const customPricing = await CustomPricing.findById(req.params.id);
    if (!customPricing) {
      return res.status(404).json({ success: false, message: "Custom pricing not found." });
    }

    customPricing.isActive = false;
    await customPricing.save();

    res.status(200).json({
      success: true,
      message: "Custom pricing has been deactivated.",
    });
  } catch (err) {
    console.error("removeCustomPrice error:", err);
    res.status(500).json({ success: false, message: "Failed to remove custom pricing." });
  }
};

// ─── Check Custom Price (Student) ────────────────────────────────────────────
/**
 * GET /api/custom-pricing/check/:courseId
 * Authenticated student ke liye check karta hai ki us course ka custom price hai ya nahi.
 * Course detail page pe call hoti hai.
 *
 * Returns: { hasCustomPrice: bool, customPrice?, originalPrice?, saving? }
 */
const checkCustomPrice = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user._id;
    const now = new Date();

    const customPricing = await CustomPricing.findOne({
      student: studentId,
      course: courseId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean();

    if (!customPricing) {
      return res.status(200).json({ success: true, hasCustomPrice: false });
    }

    const saving = customPricing.originalPrice - customPricing.customPrice;
    const savingPercent = Math.round((saving / customPricing.originalPrice) * 100);

    res.status(200).json({
      success: true,
      hasCustomPrice: true,
      customPrice: customPricing.customPrice,
      originalPrice: customPricing.originalPrice,
      reason: customPricing.reason,
      saving,
      savingPercent,
      expiresAt: customPricing.expiresAt,
    });
  } catch (err) {
    console.error("checkCustomPrice error:", err);
    res.status(500).json({ success: false, message: "Failed to check custom pricing." });
  }
};

// ─── Get All Custom Prices (Admin) ───────────────────────────────────────────
/**
 * GET /api/custom-pricing/all
 * Admin sabhi custom pricing records dekh sakta hai.
 * Query params: isActive, page, limit, studentId
 */
const getAllCustomPrices = async (req, res) => {
  try {
    const { isActive, page = 1, limit = 20, studentId } = req.query;
    const filter = {};

    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (studentId) filter.student = studentId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await CustomPricing.countDocuments(filter);

    const records = await CustomPricing.find(filter)
      .populate("student", "name email avatar")
      .populate("course", "title thumbnail price")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: records.length,
      total,
      records,
    });
  } catch (err) {
    console.error("getAllCustomPrices error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch custom prices." });
  }
};

// ─── Toggle Custom Price Active/Inactive (Admin) ──────────────────────────────
/**
 * PATCH /api/custom-pricing/:id/toggle
 * Custom pricing ko active ya inactive toggle karta hai.
 */
const toggleCustomPrice = async (req, res) => {
  try {
    const customPricing = await CustomPricing.findById(req.params.id);
    if (!customPricing) {
      return res.status(404).json({ success: false, message: "Custom pricing not found." });
    }

    customPricing.isActive = !customPricing.isActive;
    await customPricing.save();

    res.status(200).json({
      success: true,
      isActive: customPricing.isActive,
      message: `Custom pricing is now ${customPricing.isActive ? "active" : "inactive"}.`,
    });
  } catch (err) {
    console.error("toggleCustomPrice error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle custom pricing." });
  }
};

module.exports = {
  setCustomPrice,
  removeCustomPrice,
  checkCustomPrice,
  getAllCustomPrices,
  toggleCustomPrice,
};
