/**
 * @file CustomPricing.model.js
 * @description Mongoose schema for admin-set custom pricing per student per course.
 *
 * Admin kisi specific student ke liye kisi specific course ki fees
 * manually set kar sakta hai. Jab woh student course page pe jaata hai
 * toh usse custom price dikhega, normal price nahi.
 *
 * Fields:
 *   - student: Jis student ke liye custom price set ki gayi
 *   - course: Jis course ke liye custom price hai
 *   - customPrice: Admin ka set kiya hua amount (₹)
 *   - originalPrice: Course ki actual price (reference ke liye)
 *   - reason: Admin ka note (e.g., "Scholarship", "Family discount")
 *   - expiresAt: Kab tak valid hai (null = hamesha valid)
 *   - isActive: Active hai ya nahi (soft disable)
 *   - createdBy: Admin ka ObjectId jo yeh pricing set kiya
 */

const mongoose = require("mongoose");

const customPricingSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student is required"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    customPrice: {
      type: Number,
      required: [true, "Custom price is required"],
      min: [0, "Custom price cannot be negative"],
    },
    // Course ki original price save kar lo taaki comparison dikha sakein
    originalPrice: {
      type: Number,
      required: [true, "Original price is required"],
    },
    // Admin ka note (optional)
    reason: {
      type: String,
      maxlength: [500, "Reason cannot exceed 500 characters"],
      default: "",
    },
    // Kab tak valid hai (null = expiry nahi)
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Admin jo yeh set kar raha hai
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Admin reference is required"],
    },
  },
  {
    timestamps: true,
  }
);

// Ek student + course ke liye sirf ek active custom price honi chahiye
customPricingSchema.index({ student: 1, course: 1, isActive: 1 });

const CustomPricing = mongoose.model("CustomPricing", customPricingSchema);

module.exports = CustomPricing;
