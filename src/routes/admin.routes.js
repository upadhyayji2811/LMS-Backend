/**
 * @file admin.routes.js
 * @description Admin-only management routes.
 */

const express = require("express");
const router = express.Router();

const {
  getPlatformStats,
  getAllUsers,
  createUser,        // NEW
  deleteUser,        // NEW
  changeUserRole,
  toggleUserActive,
  getAllCourses,
  approveCourse,
  getRevenue,
  getRecentSignups,
} = require("../controllers/admin.controller");

const { protectRoute } = require("../middleware/auth.middleware");
const { isAdmin } = require("../middleware/role.middleware");

// All admin routes require authentication and admin role
router.use(protectRoute, isAdmin);

// Stats & Dashboard
router.get("/stats", getPlatformStats);
router.get("/recent-signups", getRecentSignups);

// User management
router.get("/users", getAllUsers);
router.post("/users/create", createUser);          // NEW: Admin user banayega
router.delete("/users/:userId", deleteUser);       // NEW: Admin user delete karega
router.patch("/users/:userId/role", changeUserRole);
router.patch("/users/:userId/toggle-active", toggleUserActive);

// Course management
router.get("/courses", getAllCourses);
router.patch("/courses/:courseId/approve", approveCourse);

// Revenue
router.get("/revenue", getRevenue);

module.exports = router;
