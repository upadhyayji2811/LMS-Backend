/**
 * @file quiz.controller.js
 * @description Quiz management and submission controller.
 */

const Quiz = require("../models/Quiz.model");
const Course = require("../models/Course.model");
const Enrollment = require("../models/Enrollment.model");
const { isOwnerOrAdmin } = require("../middleware/role.middleware");

// ─── Get Quiz for a Lesson ────────────────────────────────────────────────────
/**
 * GET /api/quiz/lesson/:lessonId
 * Returns quiz for a lesson (without correct answers for students).
 */
const getQuiz = async (req, res) => {
  try {
    const { lessonId } = req.params;

    const quiz = await Quiz.findOne({ lesson: lessonId }).lean();

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "No quiz found for this lesson.",
      });
    }

    // Verify enrollment (if not instructor/admin)
    if (req.user.role === "student") {
      const enrollment = await Enrollment.findOne({
        user: req.user._id,
        course: quiz.course,
        paymentStatus: "completed",
      });

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          message: "You must be enrolled in this course to access the quiz.",
        });
      }
    }

    // Get user's attempt count
    const attemptCount = quiz.getAttemptCount(req.user._id);
    const bestAttempt = quiz.getBestAttempt(req.user._id);

    // Hide correct answers and explanations from students
    const safeQuiz = {
      _id: quiz._id,
      title: quiz.title,
      lesson: quiz.lesson,
      course: quiz.course,
      passingScore: quiz.passingScore,
      timeLimit: quiz.timeLimit,
      maxAttempts: quiz.maxAttempts,
      shuffleQuestions: quiz.shuffleQuestions,
      questions: quiz.questions.map((q) => ({
        _id: q._id,
        question: q.question,
        options: q.options,
        points: q.points,
        // correctAnswer and explanation are excluded for students
      })),
      totalQuestions: quiz.questions.length,
      totalPoints: quiz.questions.reduce((sum, q) => sum + q.points, 0),
      attemptCount,
      canAttempt:
        quiz.maxAttempts === 0 || attemptCount < quiz.maxAttempts,
      bestAttempt: bestAttempt
        ? {
            score: bestAttempt.score,
            percentage: bestAttempt.percentage,
            passed: bestAttempt.passed,
            attemptedAt: bestAttempt.attemptedAt,
          }
        : null,
    };

    res.status(200).json({ success: true, quiz: safeQuiz });
  } catch (err) {
    console.error("getQuiz error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch quiz." });
  }
};

// ─── Submit Quiz ──────────────────────────────────────────────────────────────
/**
 * POST /api/quiz/:quizId/submit
 * Student submits quiz answers. Calculates score, records attempt.
 * Body: { answers: [{ questionId, selectedOption }], timeTaken }
 */
const submitQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers, timeTaken } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Answers must be an array.",
      });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found." });
    }

    // Verify enrollment
    if (req.user.role === "student") {
      const enrollment = await Enrollment.findOne({
        user: req.user._id,
        course: quiz.course,
        paymentStatus: "completed",
      });

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          message: "You must be enrolled to attempt this quiz.",
        });
      }
    }

    // Check attempt limit
    const attemptCount = quiz.getAttemptCount(req.user._id);
    if (quiz.maxAttempts > 0 && attemptCount >= quiz.maxAttempts) {
      return res.status(400).json({
        success: false,
        message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz.`,
      });
    }

    // ─── Score Calculation ────────────────────────────────────────────────────
    const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    let earnedPoints = 0;
    const gradedAnswers = [];

    for (const answer of answers) {
      const question = quiz.questions.id(answer.questionId);
      if (!question) continue;

      const isCorrect = question.correctAnswer === answer.selectedOption;
      if (isCorrect) earnedPoints += question.points;

      gradedAnswers.push({
        questionId: question._id,
        selectedOption: answer.selectedOption,
        isCorrect,
      });
    }

    const percentage = totalPoints > 0
      ? Math.round((earnedPoints / totalPoints) * 100)
      : 0;
    const passed = percentage >= quiz.passingScore;

    // Record attempt
    quiz.attempts.push({
      user: req.user._id,
      answers: gradedAnswers,
      score: earnedPoints,
      totalPoints,
      percentage,
      passed,
      attemptedAt: new Date(),
      timeTaken: timeTaken || 0,
    });

    await quiz.save();

    // Return graded answers with correct answers and explanations
    const detailedResults = quiz.questions.map((q) => {
      const userAnswer = gradedAnswers.find(
        (a) => a.questionId.toString() === q._id.toString()
      );
      return {
        questionId: q._id,
        question: q.question,
        options: q.options,
        selectedOption: userAnswer?.selectedOption,
        correctAnswer: q.correctAnswer,
        isCorrect: userAnswer?.isCorrect || false,
        explanation: quiz.showExplanation ? q.explanation : null,
        points: q.points,
      };
    });

    res.status(200).json({
      success: true,
      message: passed
        ? "🎉 Congratulations! You passed the quiz!"
        : `Quiz submitted. You scored ${percentage}%. Keep trying!`,
      result: {
        score: earnedPoints,
        totalPoints,
        percentage,
        passed,
        passingScore: quiz.passingScore,
        timeTaken: timeTaken || 0,
        attemptNumber: attemptCount + 1,
        questions: detailedResults,
      },
    });
  } catch (err) {
    console.error("submitQuiz error:", err);
    res.status(500).json({ success: false, message: "Failed to submit quiz." });
  }
};

// ─── Get My Quiz Result ───────────────────────────────────────────────────────
/**
 * GET /api/quiz/:quizId/my-result
 * Returns the authenticated user's best/latest attempt result.
 */
const getMyResult = async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found." });
    }

    const userAttempts = quiz.attempts
      .filter((a) => a.user.toString() === req.user._id.toString())
      .map((a) => ({
        score: a.score,
        totalPoints: a.totalPoints,
        percentage: a.percentage,
        passed: a.passed,
        attemptedAt: a.attemptedAt,
        timeTaken: a.timeTaken,
      }))
      .sort((a, b) => new Date(b.attemptedAt) - new Date(a.attemptedAt));

    if (userAttempts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No attempts found for this quiz.",
      });
    }

    const bestAttempt = [...userAttempts].sort((a, b) => b.score - a.score)[0];

    res.status(200).json({
      success: true,
      totalAttempts: userAttempts.length,
      bestAttempt,
      latestAttempt: userAttempts[0],
      allAttempts: userAttempts,
    });
  } catch (err) {
    console.error("getMyResult error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch quiz result." });
  }
};

// ─── Create Quiz (Instructor) ─────────────────────────────────────────────────
/**
 * POST /api/quiz
 * Instructor creates a quiz for a lesson.
 */
const createQuiz = async (req, res) => {
  try {
    const {
      lessonId,
      courseId,
      title,
      questions,
      passingScore,
      timeLimit,
      maxAttempts,
      shuffleQuestions,
      showExplanation,
    } = req.body;

    if (!lessonId || !courseId || !questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        message: "lessonId, courseId, and questions array are required.",
      });
    }

    // Verify course ownership
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only create quizzes for your own courses.",
      });
    }

    // Verify lesson exists in course
    const lessonExists = course.lessons.some(
      (l) => l._id.toString() === lessonId
    );
    if (!lessonExists) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found in this course.",
      });
    }

    // Check if quiz already exists for this lesson
    const existingQuiz = await Quiz.findOne({ lesson: lessonId });
    if (existingQuiz) {
      return res.status(400).json({
        success: false,
        message: "A quiz already exists for this lesson. Please update the existing quiz.",
      });
    }

    const quiz = await Quiz.create({
      lesson: lessonId,
      course: courseId,
      title: title || "Quiz",
      questions,
      passingScore: passingScore || 60,
      timeLimit: timeLimit || 15,
      maxAttempts: maxAttempts || 3,
      shuffleQuestions: shuffleQuestions || false,
      showExplanation: showExplanation !== undefined ? showExplanation : true,
    });

    // Mark lesson as having quiz
    const lesson = course.lessons.id(lessonId);
    if (lesson) {
      lesson.hasQuiz = true;
      await course.save();
    }

    res.status(201).json({
      success: true,
      message: "Quiz created successfully!",
      quiz,
    });
  } catch (err) {
    console.error("createQuiz error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to create quiz." });
  }
};

// ─── Update Quiz (Instructor) ─────────────────────────────────────────────────
/**
 * PUT /api/quiz/:quizId
 */
const updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found." });
    }

    const course = await Course.findById(quiz.course);
    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const updatableFields = [
      "title", "questions", "passingScore", "timeLimit",
      "maxAttempts", "shuffleQuestions", "showExplanation",
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        quiz[field] = req.body[field];
      }
    });

    await quiz.save();

    res.status(200).json({
      success: true,
      message: "Quiz updated successfully.",
      quiz,
    });
  } catch (err) {
    console.error("updateQuiz error:", err);
    res.status(500).json({ success: false, message: "Failed to update quiz." });
  }
};

module.exports = { getQuiz, submitQuiz, getMyResult, createQuiz, updateQuiz };
