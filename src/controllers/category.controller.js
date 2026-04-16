/**
 * @file category.controller.js
 * @description Category CRUD controller.
 * Admins manage categories dynamically — no code change needed to add new ones.
 */

const Category = require("../models/Category.model");
const Course = require("../models/Course.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");

// ─── Get All Categories (Public) ─────────────────────────────────────────────
/**
 * GET /api/categories
 * Returns all active categories sorted by sortOrder.
 */
const getAllCategories = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = {};

    // Admins can request inactive categories too
    if (!includeInactive || includeInactive !== "true") {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (err) {
    console.error("getAllCategories error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch categories." });
  }
};

// ─── Get Category By Slug ─────────────────────────────────────────────────────
/**
 * GET /api/categories/:slug
 * Returns category details + its published courses.
 */
const getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 12, level, language, sort = "newest" } = req.query;

    const category = await Category.findOne({ slug, isActive: true }).lean();
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found or is inactive.",
      });
    }

    // Build course filter
    const courseFilter = {
      category: category._id,
      isPublished: true,
      isApproved: true,
    };
    if (level) courseFilter.level = level;
    if (language) courseFilter.language = language;

    // Sort options
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      rating: { rating: -1 },
      popular: { enrolledCount: -1 },
      "price-low": { price: 1 },
      "price-high": { price: -1 },
    };
    const sortBy = sortOptions[sort] || sortOptions.newest;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCourses = await Course.countDocuments(courseFilter);

    const courses = await Course.find(courseFilter)
      .populate("instructor", "name avatar bio")
      .select("-lessons.videoUrl -ratings")
      .sort(sortBy)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      category,
      courses,
      pagination: {
        total: totalCourses,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCourses / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getCategoryBySlug error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch category." });
  }
};

// ─── Create Category (Admin) ──────────────────────────────────────────────────
/**
 * POST /api/categories
 * Admin creates a new course category.
 */
const createCategory = async (req, res) => {
  try {
    const { name, slug, icon, description, color, sortOrder, subcategories } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required." });
    }

    // Check duplicate name/slug
    const existing = await Category.findOne({
      $or: [{ name: name.trim() }, { slug: slug?.toLowerCase().trim() }],
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A category with this name or slug already exists.",
      });
    }

    let thumbnailUrl = null;
    // Handle thumbnail upload
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "lms/categories");
      thumbnailUrl = result.secure_url;
    }

    const category = await Category.create({
      name: name.trim(),
      slug: slug || undefined, // Auto-generated in pre-validate hook if not provided
      icon: icon || "📚",
      description,
      thumbnail: thumbnailUrl,
      color: color || "#2563EB",
      sortOrder: sortOrder || 0,
      subcategories: subcategories
        ? (Array.isArray(subcategories) ? subcategories : JSON.parse(subcategories))
        : [],
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully! 🎉",
      category,
    });
  } catch (err) {
    console.error("createCategory error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to create category." });
  }
};

// ─── Update Category (Admin) ──────────────────────────────────────────────────
/**
 * PUT /api/categories/:id
 * Admin updates category details.
 */
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description, color, sortOrder, subcategories } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    // Handle thumbnail update
    if (req.file) {
      if (category.thumbnail) {
        // Extract public_id from URL and delete old image
        const parts = category.thumbnail.split("/");
        const publicId = `lms/categories/${parts[parts.length - 1].split(".")[0]}`;
        await deleteFromCloudinary(publicId).catch(() => {});
      }
      const result = await uploadToCloudinary(req.file.buffer, "lms/categories");
      category.thumbnail = result.secure_url;
    }

    if (name) category.name = name.trim();
    if (icon) category.icon = icon;
    if (description !== undefined) category.description = description;
    if (color) category.color = color;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (subcategories) {
      category.subcategories = Array.isArray(subcategories)
        ? subcategories
        : JSON.parse(subcategories);
    }

    await category.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      category,
    });
  } catch (err) {
    console.error("updateCategory error:", err);
    res.status(500).json({ success: false, message: "Failed to update category." });
  }
};

// ─── Delete Category (Admin) ──────────────────────────────────────────────────
/**
 * DELETE /api/categories/:id
 * Admin deletes a category (only if no courses linked).
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    // Check if any courses exist in this category
    const courseCount = await Course.countDocuments({ category: id });
    if (courseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${courseCount} course(s). Move or delete courses first.`,
      });
    }

    // Delete thumbnail from Cloudinary
    if (category.thumbnail) {
      const parts = category.thumbnail.split("/");
      const publicId = `lms/categories/${parts[parts.length - 1].split(".")[0]}`;
      await deleteFromCloudinary(publicId).catch(() => {});
    }

    await Category.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully.",
    });
  } catch (err) {
    console.error("deleteCategory error:", err);
    res.status(500).json({ success: false, message: "Failed to delete category." });
  }
};

// ─── Toggle Category Active (Admin) ──────────────────────────────────────────
/**
 * PATCH /api/categories/:id/toggle
 * Admin enables or disables a category.
 */
const toggleCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    category.isActive = !category.isActive;
    await category.save();

    res.status(200).json({
      success: true,
      message: `Category ${category.isActive ? "activated" : "deactivated"} successfully.`,
      isActive: category.isActive,
      category,
    });
  } catch (err) {
    console.error("toggleCategory error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle category." });
  }
};

module.exports = {
  getAllCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategory,
};
