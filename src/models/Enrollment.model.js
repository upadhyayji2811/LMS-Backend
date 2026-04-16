/**
 * @file Enrollment.model.js
 * @description Mongoose schema for student course enrollments.
 * Tracks purchase info, progress, and completed lessons.
 */

const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    completedLessons: [
      {
        type: mongoose.Schema.Types.ObjectId, // Lesson _id within course.lessons
      },
    ],
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
    paymentId: {
      type: String,
      default: null, // Razorpay payment_id
    },
    orderId: {
      type: String,
      default: null, // Razorpay order_id
    },
    amount: {
      type: Number,
      default: 0, // Amount paid in rupees
    },
    currency: {
      type: String,
      default: "INR",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    currentLessonId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // Resume from last watched lesson
    },
    notes: {
      type: String,
      maxlength: [5000, "Notes cannot exceed 5000 characters"],
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true }); // Prevent duplicate enrollments
enrollmentSchema.index({ user: 1 });
enrollmentSchema.index({ course: 1 });
enrollmentSchema.index({ purchasedAt: -1 });
enrollmentSchema.index({ paymentStatus: 1 });

// ─── Instance Method: Update progress ─────────────────────────────────────────
/**
 * Recalculates progress percentage based on completed lessons vs total lessons.
 * Marks enrollment as complete if all lessons done.
 * @param {number} totalLessons - Total number of lessons in the course
 */
enrollmentSchema.methods.updateProgress = function (totalLessons) {
  if (!totalLessons || totalLessons === 0) {
    this.progress = 0;
    return;
  }

  const completed = this.completedLessons.length;
  this.progress = Math.round((completed / totalLessons) * 100);

  if (this.progress >= 100 && !this.isCompleted) {
    this.isCompleted = true;
    this.completedAt = new Date();
  }
};

const Enrollment = mongoose.model("Enrollment", enrollmentSchema);

module.exports = Enrollment;
