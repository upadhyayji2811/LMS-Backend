/**
 * @file category.routes.js
 * @description Category CRUD routes.
 */

const express = require("express");
const router = express.Router();

const {
  getAllCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategory,
} = require("../controllers/category.controller");

const { protectRoute } = require("../middleware/auth.middleware");
const { isAdmin } = require("../middleware/role.middleware");
const { uploadMemory, handleUploadError } = require("../middleware/upload.middleware");

// Public
router.get("/", getAllCategories);
router.get("/:slug", getCategoryBySlug);

// Admin only
router.post(
  "/",
  protectRoute,
  isAdmin,
  uploadMemory.single("thumbnail"),
  handleUploadError,
  createCategory
);
router.put(
  "/:id",
  protectRoute,
  isAdmin,
  uploadMemory.single("thumbnail"),
  handleUploadError,
  updateCategory
);
router.delete("/:id", protectRoute, isAdmin, deleteCategory);
router.patch("/:id/toggle", protectRoute, isAdmin, toggleCategory);

module.exports = router;
