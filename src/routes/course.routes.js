/**
 * @file course.routes.js
 * @description Course CRUD and rating routes.
 */

const express = require("express");
const router = express.Router();

const {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  getInstructorCourses,
  rateCourse,
} = require("../controllers/course.controller");

const { protectRoute, optionalAuth } = require("../middleware/auth.middleware");
const { isInstructor, isInstructorOrAdmin } = require("../middleware/role.middleware");
const { uploadMemory, handleUploadError } = require("../middleware/upload.middleware");

// Public (with optional auth for enrollment status)
router.get("/", getAllCourses);
router.get("/:id", optionalAuth, getCourseById);

// Instructor routes
router.get("/instructor/my-courses", protectRoute, isInstructorOrAdmin, getInstructorCourses);

router.post(
  "/",
  protectRoute,
  isInstructor,
  uploadMemory.single("thumbnail"),
  handleUploadError,
  createCourse
);

router.put(
  "/:id",
  protectRoute,
  isInstructorOrAdmin,
  uploadMemory.single("thumbnail"),
  handleUploadError,
  updateCourse
);

router.delete("/:id", protectRoute, isInstructorOrAdmin, deleteCourse);
router.patch("/:id/publish", protectRoute, isInstructorOrAdmin, publishCourse);

// Student - rate course
router.post("/:id/rate", protectRoute, rateCourse);

module.exports = router;
