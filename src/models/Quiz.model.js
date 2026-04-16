/**
 * @file Quiz.model.js
 * @description Mongoose schema for lesson quizzes.
 * Tracks questions, correct answers, and student attempt history.
 */

const mongoose = require("mongoose");

// ─── Question Sub-schema ──────────────────────────────────────────────────────
const questionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
      maxlength: [1000, "Question cannot exceed 1000 characters"],
    },
    options: {
      type: [String],
      required: [true, "Options are required"],
      validate: {
        validator: function (arr) {
          return arr.length === 4;
        },
        message: "Each question must have exactly 4 options",
      },
    },
    correctAnswer: {
      type: Number,
      required: [true, "Correct answer index is required"],
      min: [0, "Correct answer index must be between 0 and 3"],
      max: [3, "Correct answer index must be between 0 and 3"],
    },
    explanation: {
      type: String,
      maxlength: [1000, "Explanation cannot exceed 1000 characters"],
      default: "", // Show after answering
    },
    points: {
      type: Number,
      default: 1, // Points per correct answer
      min: 1,
    },
  },
  { _id: true }
);

// ─── Attempt Sub-schema ────────────────────────────────────────────────────────
const attemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    answers: [
      {
        questionId: mongoose.Schema.Types.ObjectId,
        selectedOption: Number, // 0-3 index
        isCorrect: Boolean,
      },
    ],
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPoints: {
      type: Number,
      required: true,
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    passed: {
      type: Boolean,
      required: true,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
    },
    timeTaken: {
      type: Number,
      default: 0, // seconds taken to complete quiz
    },
  },
  { _id: true }
);

// ─── Main Quiz Schema ──────────────────────────────────────────────────────────
const quizSchema = new mongoose.Schema(
  {
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Lesson ID is required"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    title: {
      type: String,
      default: "Quiz",
      maxlength: 200,
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: function (arr) {
          return arr.length >= 1;
        },
        message: "Quiz must have at least 1 question",
      },
    },
    passingScore: {
      type: Number,
      required: [true, "Passing score percentage is required"],
      min: [0, "Passing score must be between 0 and 100"],
      max: [100, "Passing score must be between 0 and 100"],
      default: 60, // 60% to pass
    },
    timeLimit: {
      type: Number,
      default: 15, // minutes; 0 = no time limit
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3, // 0 = unlimited
      min: 0,
    },
    shuffleQuestions: {
      type: Boolean,
      default: false,
    },
    showExplanation: {
      type: Boolean,
      default: true, // Show explanation after submission
    },
    attempts: [attemptSchema],
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
quizSchema.index({ lesson: 1 });
quizSchema.index({ course: 1 });
quizSchema.index({ "attempts.user": 1 });

// ─── Instance Method: Get user's best attempt ─────────────────────────────────
/**
 * Get the best (highest score) attempt for a specific user.
 * @param {ObjectId} userId
 * @returns {Object|null} Best attempt or null
 */
quizSchema.methods.getBestAttempt = function (userId) {
  const userAttempts = this.attempts.filter(
    (a) => a.user.toString() === userId.toString()
  );
  if (userAttempts.length === 0) return null;
  return userAttempts.reduce((best, curr) =>
    curr.score > best.score ? curr : best
  );
};

/**
 * Get number of attempts by a specific user.
 * @param {ObjectId} userId
 * @returns {number} Attempt count
 */
quizSchema.methods.getAttemptCount = function (userId) {
  return this.attempts.filter(
    (a) => a.user.toString() === userId.toString()
  ).length;
};

const Quiz = mongoose.model("Quiz", quizSchema);

module.exports = Quiz;
