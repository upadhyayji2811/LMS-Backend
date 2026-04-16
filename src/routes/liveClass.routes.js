/**
 * @file liveClass.routes.js
 * @description Live class scheduling and viewing routes.
 */

const express = require("express");
const router = express.Router();

const {
  getUpcomingClasses,
  getThisWeekClasses,
  getNextWeekClasses,
  getClassesByCourse,
  scheduleClass,
  updateClass,
  deleteClass,
  getInstructorClasses,
} = require("../controllers/liveClass.controller");

const { protectRoute } = require("../middleware/auth.middleware");
const { isInstructorOrAdmin } = require("../middleware/role.middleware");

// Public
router.get("/upcoming", getUpcomingClasses);
router.get("/this-week", getThisWeekClasses);
router.get("/next-week", getNextWeekClasses);
router.get("/course/:courseId", getClassesByCourse);

// Protected
router.get("/instructor/my-classes", protectRoute, isInstructorOrAdmin, getInstructorClasses);
router.post("/", protectRoute, isInstructorOrAdmin, scheduleClass);
router.put("/:id", protectRoute, isInstructorOrAdmin, updateClass);
router.delete("/:id", protectRoute, isInstructorOrAdmin, deleteClass);

module.exports = router;
