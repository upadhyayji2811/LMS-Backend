/**
 * @file LiveClass.model.js
 * @description Mongoose schema for scheduled live classes (YouTube Live links).
 */

const mongoose = require("mongoose");

const liveClassSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Live class title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    topic: {
      type: String,
      trim: true,
      maxlength: [300, "Topic cannot exceed 300 characters"],
      default: "",
    },
    description: {
      type: String,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
      default: "",
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Instructor is required"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null, // Optional: link to specific course
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null, // Optional: link to a category
    },
    scheduledAt: {
      type: Date,
      required: [true, "Scheduled date and time is required"],
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [15, "Minimum duration is 15 minutes"],
      max: [480, "Maximum duration is 8 hours"],
      default: 60, // in minutes
    },
    meetLink: {
      type: String,
      required: [true, "Meet link (YouTube Live URL) is required"],
      trim: true,
    },
    week: {
      type: Number,
      default: null, // Course week number (e.g., Week 1)
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
    recordingUrl: {
      type: String,
      default: null, // YouTube recording link added after class
    },
    enrolledStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    maxAttendees: {
      type: Number,
      default: null, // null = unlimited
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    agenda: [
      {
        time: String, // e.g., "10:00 AM"
        topic: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
liveClassSchema.index({ scheduledAt: 1 });
liveClassSchema.index({ instructor: 1 });
liveClassSchema.index({ course: 1 });
liveClassSchema.index({ category: 1 });
liveClassSchema.index({ isCompleted: 1 });
liveClassSchema.index({ isCancelled: 1 });

// ─── Virtual: Is live now ─────────────────────────────────────────────────────
liveClassSchema.virtual("isLiveNow").get(function () {
  const now = new Date();
  const start = new Date(this.scheduledAt);
  const end = new Date(start.getTime() + this.duration * 60 * 1000);
  return now >= start && now <= end && !this.isCompleted && !this.isCancelled;
});

// ─── Virtual: Minutes until class starts ──────────────────────────────────────
liveClassSchema.virtual("minutesUntilStart").get(function () {
  const now = new Date();
  const start = new Date(this.scheduledAt);
  return Math.round((start - now) / 60000);
});

// ─── Post-save: Auto-mark as completed ────────────────────────────────────────
liveClassSchema.post("save", async function () {
  // This can be handled by a cron job in production
});

const LiveClass = mongoose.model("LiveClass", liveClassSchema);

module.exports = LiveClass;
