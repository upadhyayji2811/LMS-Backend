/**
 * @file enrollment.routes.js
 * @description Enrollment management routes.
 */

const express = require("express");
const router = express.Router();

const {
  enrollInCourse,
  getMyEnrollments,
  getCourseProgress,
  getEnrollmentDetail,
  updateNotes,
} = require("../controllers/enrollment.controller");

const { protectRoute } = require("../middleware/auth.middleware");

// All routes require authentication
router.use(protectRoute);

router.get("/my-enrollments", getMyEnrollments);
router.post("/:courseId/enroll", enrollInCourse);
router.get("/:courseId/progress", getCourseProgress);
router.get("/:courseId/detail", getEnrollmentDetail);
router.patch("/:courseId/notes", updateNotes);

module.exports = router;
