/**
 * @file Course.model.js
 * @description Mongoose schema for LMS courses.
 * Courses belong to a dynamic category, support multiple languages, and contain lessons.
 */

const mongoose = require("mongoose");

// ─── Lesson Sub-schema ────────────────────────────────────────────────────────
const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
  },
  { _id: true }
);

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Lesson title is required"],
      trim: true,
      maxlength: [200, "Lesson title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      default: "",
    },

    // ─── OLD: Cloudinary video upload ─────────────────────────────────────────
    // (Commented out — kyunki ab YouTube unlisted videos use ho rahe hain)
    // videoUrl: {
    //   type: String,
    //   default: null, // Cloudinary secure URL
    // },
    // videoPublicId: {
    //   type: String,
    //   default: null, // Cloudinary public_id for deletion
    // },
    // ──────────────────────────────────────────────────────────────────────

    // ─── NEW: YouTube Unlisted Video ───────────────────────────────────────
    // Instructor YouTube URL paste karega, hum sirf videoId save karenge
    youtubeUrl: {
      type: String,
      default: null, // Full YouTube URL (e.g. https://youtu.be/xxx or https://youtube.com/watch?v=xxx)
    },
    youtubeVideoId: {
      type: String,
      default: null, // Extracted video ID (e.g. "dQw4w9WgXcQ") — iframe mein use hoga
    },
    // ──────────────────────────────────────────────────────────────────────

    duration: {
      type: Number,
      default: 0, // seconds mein (manual entry ya future auto-detect)
      min: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    resources: [resourceSchema],
    hasQuiz: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

// ─── Rating Sub-schema ────────────────────────────────────────────────────────
const ratingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    review: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// ─── Main Course Schema ────────────────────────────────────────────────────────
const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
      maxlength: [200, "Course title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Course description is required"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    shortDescription: {
      type: String,
      maxlength: [300, "Short description cannot exceed 300 characters"],
      default: "",
    },
    price: {
      type: Number,
      required: [true, "Course price is required"],
      min: [0, "Price cannot be negative"],
    },
    originalPrice: {
      type: Number,
      default: null, // Strikethrough price for discount display
    },
    thumbnail: {
      type: String,
      default: null, // Cloudinary URL
    },
    thumbnailPublicId: {
      type: String,
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },
    subcategory: {
      type: String,
      default: "",
    },
    level: {
      type: String,
      enum: {
        values: ["beginner", "intermediate", "advanced"],
        message: "Level must be beginner, intermediate, or advanced",
      },
      default: "beginner",
    },
    language: {
      type: String,
      enum: {
        values: ["Hinglish", "Hindi", "English"],
        message: "Language must be Hinglish, Hindi, or English",
      },
      default: "Hinglish",
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Instructor is required"],
    },
    lessons: [lessonSchema],
    ratings: [ratingSchema],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRatings: {
      type: Number,
      default: 0,
      min: 0,
    },
    enrolledCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false, // Admin must approve before publishing
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    requirements: [
      {
        type: String,
        trim: true,
      },
    ],
    whatYouLearn: [
      {
        type: String,
        trim: true,
      },
    ],
    totalDuration: {
      type: Number,
      default: 0, // total seconds, computed from lessons
    },
    totalLessons: {
      type: Number,
      default: 0,
    },
    promoVideoUrl: {
      type: String,
      default: null, // Short intro video
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
courseSchema.index({ category: 1, isPublished: 1 });
courseSchema.index({ instructor: 1 });
courseSchema.index({ price: 1 });
courseSchema.index({ rating: -1 });
courseSchema.index({ enrolledCount: -1 });
courseSchema.index({ createdAt: -1 });
courseSchema.index({ title: "text", description: "text", tags: "text" });

// ─── Pre-save: Recalculate totals ─────────────────────────────────────────────
courseSchema.pre("save", function (next) {
  if (this.isModified("lessons")) {
    this.totalLessons = this.lessons.length;
    this.totalDuration = this.lessons.reduce(
      (sum, lesson) => sum + (lesson.duration || 0),
      0
    );
  }

  if (this.isModified("ratings")) {
    this.totalRatings = this.ratings.length;
    if (this.ratings.length > 0) {
      const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
      this.rating = Math.round((sum / this.ratings.length) * 10) / 10;
    } else {
      this.rating = 0;
    }
  }

  next();
});

// ─── Virtual: Free course check ───────────────────────────────────────────────
courseSchema.virtual("isFree").get(function () {
  return this.price === 0;
});

const Course = mongoose.model("Course", courseSchema);

module.exports = Course;
