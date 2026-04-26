/**
 * @file InstallmentPlan.model.js
 * @description Mongoose schema for student course installment payment plans.
 *
 * Jab koi student ek course ko 3 installments mein pay karna chahta hai,
 * toh ek InstallmentPlan create hota hai. Pehli payment ke turant baad
 * student ko course access mil jaata hai. Baaki 2 payments baad mein.
 *
 * Fields:
 *   - student: Student ka ObjectId
 *   - course: Course ka ObjectId
 *   - totalAmount: Total fees (custom price ya normal price)
 *   - installments: Array of 3 installment objects (amount, dueDate, status)
 *   - status: Plan ka overall status (active/completed/defaulted)
 *   - enrollmentGranted: Kya student ko course access de diya gaya
 *   - createdByAdmin: Agar admin ne yeh plan banaya toh true
 */

const mongoose = require("mongoose");

// Sub-schema for each individual installment (1st, 2nd, 3rd)
const installmentDetailSchema = new mongoose.Schema(
  {
    installmentNumber: {
      type: Number,
      required: true,
      enum: [1, 2, 3], // Sirf 3 installments allowed
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "overdue"],
      default: "pending",
    },
    // Razorpay details jab payment ho jaaye
    razorpayOrderId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

// Main InstallmentPlan schema
const installmentPlanSchema = new mongoose.Schema(
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
    // Total amount divided into 3 equal parts
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [1, "Total amount must be greater than 0"],
    },
    installments: [installmentDetailSchema],
    status: {
      type: String,
      enum: ["active", "completed", "defaulted"],
      default: "active",
    },
    // True jaise hi pehli installment pay ho jaati hai aur enrollment ban jaata hai
    enrollmentGranted: {
      type: Boolean,
      default: false,
    },
    // Agar admin ne is student ke liye yeh plan specifically banaya
    createdByAdmin: {
      type: Boolean,
      default: false,
    },
    // Admin ka ObjectId agar unhone banaya
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick lookup by student + course kombination
installmentPlanSchema.index({ student: 1, course: 1 });
installmentPlanSchema.index({ status: 1 });

const InstallmentPlan = mongoose.model("InstallmentPlan", installmentPlanSchema);

module.exports = InstallmentPlan;
