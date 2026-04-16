/**
 * @file lesson.routes.js
 * @description Lesson management routes within courses.
 */

const express = require("express");
const router = express.Router();

const {
  addLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
  reorderLessons,
  addResource,
} = require("../controllers/lesson.controller");

const { protectRoute } = require("../middleware/auth.middleware");
const { isInstructorOrAdmin } = require("../middleware/role.middleware");
const { uploadMemory, handleUploadError } = require("../middleware/upload.middleware");

// All require auth
router.use(protectRoute);

// Instructor: add lesson with video upload
router.post(
  "/:courseId/add",
  isInstructorOrAdmin,
  uploadMemory.single("video"),
  handleUploadError,
  addLesson
);

// Instructor: update lesson (optionally replace video)
router.put(
  "/:courseId/lessons/:lessonId",
  isInstructorOrAdmin,
  uploadMemory.single("video"),
  handleUploadError,
  updateLesson
);

// Instructor: delete lesson
router.delete(
  "/:courseId/lessons/:lessonId",
  isInstructorOrAdmin,
  deleteLesson
);

// Instructor: reorder lessons
router.patch("/:courseId/reorder", isInstructorOrAdmin, reorderLessons);

// Instructor: add resource to lesson
router.post(
  "/:courseId/lessons/:lessonId/resources",
  isInstructorOrAdmin,
  uploadMemory.single("file"),
  handleUploadError,
  addResource
);

// Student: mark lesson complete
router.post("/:courseId/lessons/:lessonId/complete", completeLesson);

module.exports = router;
