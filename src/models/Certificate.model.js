/**
 * @file Certificate.model.js
 * @description Mongoose schema for course completion certificates.
 * Each certificate has a unique ID for public verification.
 */

const mongoose = require("mongoose");
const crypto = require("crypto");

const certificateSchema = new mongoose.Schema(
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
    certificateId: {
      type: String,
      unique: true,
      default: function () {
        // Generate unique certificate ID: LMS-YYYYMMDD-XXXXXXXX
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const random = crypto.randomBytes(4).toString("hex").toUpperCase();
        return `LMS-${date}-${random}`;
      },
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    pdfUrl: {
      type: String,
      default: null, // Cloudinary URL of the generated PDF
    },
    pdfPublicId: {
      type: String,
      default: null,
    },
    // Snapshot of data at time of issuance (in case names change later)
    studentName: {
      type: String,
      required: true,
    },
    courseName: {
      type: String,
      required: true,
    },
    instructorName: {
      type: String,
      required: true,
    },
    categoryName: {
      type: String,
      default: "",
    },
    // Verification status
    isValid: {
      type: Boolean,
      default: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
certificateSchema.index({ certificateId: 1 }, { unique: true });
certificateSchema.index({ user: 1, course: 1 }, { unique: true });
certificateSchema.index({ user: 1 });
certificateSchema.index({ course: 1 });
certificateSchema.index({ issuedAt: -1 });

// ─── Virtual: Public verification URL ─────────────────────────────────────────
certificateSchema.virtual("verificationUrl").get(function () {
  const baseUrl = process.env.CLIENT_URL || "http://localhost:3000";
  return `${baseUrl}/verify/${this.certificateId}`;
});

const Certificate = mongoose.model("Certificate", certificateSchema);

module.exports = Certificate;
