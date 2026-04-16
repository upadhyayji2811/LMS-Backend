/**
 * @file Category.model.js
 * @description Mongoose schema for LMS course categories.
 * Categories are dynamic — admins add new ones from the admin panel without code changes.
 */

const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Category slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase letters, numbers, and hyphens only",
      ],
    },
    icon: {
      type: String,
      default: "📚", // Emoji or icon class
    },
    description: {
      type: String,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: "",
    },
    thumbnail: {
      type: String,
      default: null, // Cloudinary URL
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    courseCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sortOrder: {
      type: Number,
      default: 0, // Lower number = appears first
    },
    color: {
      type: String,
      default: "#2563EB", // Accent color for category card
    },
    subcategories: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
categorySchema.index({ slug: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ sortOrder: 1 });
categorySchema.index({ name: "text", description: "text" });

// ─── Virtual: Active courses count label ──────────────────────────────────────
categorySchema.virtual("courseCountLabel").get(function () {
  return `${this.courseCount} ${this.courseCount === 1 ? "Course" : "Courses"}`;
});

// ─── Pre-save: Auto-generate slug from name if not provided ───────────────────
categorySchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }
  next();
});

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
