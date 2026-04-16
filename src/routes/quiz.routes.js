/**
 * @file quiz.routes.js
 * @description Quiz creation and submission routes.
 */

const express = require("express");
const router = express.Router();

const {
  getQuiz,
  submitQuiz,
  getMyResult,
  createQuiz,
  updateQuiz,
} = require("../controllers/quiz.controller");

const { protectRoute } = require("../middleware/auth.middleware");
const { isInstructorOrAdmin } = require("../middleware/role.middleware");

// All require authentication
router.use(protectRoute);

// Student & Instructor: get quiz by lesson
router.get("/lesson/:lessonId", getQuiz);

// Student: submit quiz
router.post("/:quizId/submit", submitQuiz);

// Student: get my result
router.get("/:quizId/my-result", getMyResult);

// Instructor: create quiz
router.post("/", isInstructorOrAdmin, createQuiz);

// Instructor: update quiz
router.put("/:quizId", isInstructorOrAdmin, updateQuiz);

module.exports = router;
