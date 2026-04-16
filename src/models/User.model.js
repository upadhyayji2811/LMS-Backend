/**
 * @file User.model.js
 * @description Mongoose schema for LMS users (students, instructors, admins).
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Never return password in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ["student", "instructor", "admin"],
        message: "Role must be student, instructor, or admin",
      },
      default: "student",
    },
    avatar: {
      type: String,
      default: null, // Cloudinary URL
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      default: "",
    },
    enrolledCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// ─── Pre-save Hook: Hash password before saving ───────────────────────────────
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Compare plain-text password with hashed password in DB.
 * @param {string} enteredPassword - Plain-text password from login form
 * @returns {Promise<boolean>} True if passwords match
 */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Return user object without sensitive fields.
 * @returns {Object} Safe user object
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  return obj;
};

// ─── Virtual: Full avatar URL fallback ────────────────────────────────────────
userSchema.virtual("avatarUrl").get(function () {
  return this.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name)}&background=2563EB&color=fff`;
});

const User = mongoose.model("User", userSchema);

module.exports = User;
