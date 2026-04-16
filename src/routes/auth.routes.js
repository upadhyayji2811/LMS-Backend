/**
 * @file auth.routes.js
 * @description Authentication routes.
 */

const express = require("express");
const router = express.Router();

const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout,
} = require("../controllers/auth.controller");

const { protectRoute } = require("../middleware/auth.middleware");
const { uploadMemory, handleUploadError } = require("../middleware/upload.middleware");

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.get("/me", protectRoute, getMe);
router.post("/logout", protectRoute, logout);
router.put(
  "/profile",
  protectRoute,
  uploadMemory.single("avatar"),
  handleUploadError,
  updateProfile
);
router.put("/change-password", protectRoute, changePassword);

module.exports = router;
