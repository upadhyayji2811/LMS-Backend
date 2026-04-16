/**
 * @file payment.controller.js
 * @description Razorpay payment controller.
 * Handles order creation, payment verification, history, and webhook.
 */

const Razorpay = require("razorpay");
const crypto = require("crypto");
const Course = require("../models/Course.model");
const Enrollment = require("../models/Enrollment.model");
const User = require("../models/User.model");
const { sendEnrollmentConfirmation } = require("../utils/sendEmail");

// ─── Razorpay Instance ────────────────────────────────────────────────────────
const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// ─── Create Razorpay Order ────────────────────────────────────────────────────
/**
 * POST /api/payments/create-order
 * Creates a Razorpay order and returns the orderId to the frontend.
 * Frontend uses this to open the Razorpay checkout modal.
 */
const createOrder = async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ success: false, message: "Course ID is required." });
    }

    const course = await Course.findById(courseId)
      .populate("instructor", "name")
      .lean();

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!course.isPublished || !course.isApproved) {
      return res.status(400).json({
        success: false,
        message: "This course is not available for purchase.",
      });
    }

    if (course.price === 0) {
      return res.status(400).json({
        success: false,
        message: "This is a free course. Use the free enrollment endpoint.",
      });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      user: req.user._id,
      course: courseId,
      paymentStatus: "completed",
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: "You are already enrolled in this course.",
      });
    }

    const razorpay = getRazorpay();
    const amountInPaise = Math.round(course.price * 100);

    // Razorpay receipt max length = 40 chars
    const receipt = `lms_${req.user._id.toString().slice(-8)}_${Date.now().toString().slice(-10)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        courseId: courseId.toString(),
        userId: req.user._id.toString(),
        courseName: course.title,
        studentName: req.user.name,
      },
    });

    res.status(200).json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
      course: {
        _id: course._id,
        title: course.title,
        price: course.price,
        thumbnail: course.thumbnail,
        instructor: course.instructor?.name,
      },
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("createOrder error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create payment order.",
    });
  }
};

// ─── Verify Payment ───────────────────────────────────────────────────────────
/**
 * POST /api/payments/verify
 * Verifies Razorpay payment signature after checkout completion.
 * On success: creates enrollment, updates user and course, sends confirmation email.
 */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      courseId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification parameters.",
      });
    }

    // ─── Signature Verification ───────────────────────────────────────────────
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid signature.",
      });
    }

    // ─── Fetch Course ─────────────────────────────────────────────────────────
    const course = await Course.findById(courseId)
      .populate("instructor", "name")
      .lean();

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    // ─── Check for Duplicate Enrollment ──────────────────────────────────────
    const existingEnrollment = await Enrollment.findOne({
      user: req.user._id,
      course: courseId,
    });

    if (existingEnrollment && existingEnrollment.paymentStatus === "completed") {
      return res.status(400).json({
        success: false,
        message: "You are already enrolled in this course.",
      });
    }

    // ─── Create or Update Enrollment ─────────────────────────────────────────
    const enrollment = await Enrollment.create({
      user: req.user._id,
      course: courseId,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: course.price,
      currency: "INR",
      paymentStatus: "completed",
      purchasedAt: new Date(),
    });

    // ─── Update Course Enrolled Count ─────────────────────────────────────────
    await Course.findByIdAndUpdate(courseId, {
      $inc: { enrolledCount: 1 },
    });

    // ─── Update User's Enrolled Courses ──────────────────────────────────────
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { enrolledCourses: courseId },
    });

    // ─── Send Confirmation Email (non-blocking) ────────────────────────────────
    sendEnrollmentConfirmation(req.user, course).catch((err) =>
      console.warn("Enrollment email failed:", err.message)
    );

    res.status(200).json({
      success: true,
      message: "Payment verified! You are now enrolled. Happy learning! 🎉",
      enrollment: {
        _id: enrollment._id,
        course: courseId,
        paymentId: razorpay_payment_id,
        amount: course.price,
        purchasedAt: enrollment.purchasedAt,
      },
    });
  } catch (err) {
    console.error("verifyPayment error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Payment verification failed.",
    });
  }
};

// ─── Get Payment History ──────────────────────────────────────────────────────
/**
 * GET /api/payments/history
 * Returns all completed payments for the authenticated student.
 */
const getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const total = await Enrollment.countDocuments({
      user: req.user._id,
      paymentStatus: "completed",
      amount: { $gt: 0 },
    });

    const payments = await Enrollment.find({
      user: req.user._id,
      paymentStatus: "completed",
      amount: { $gt: 0 },
    })
      .populate("course", "title thumbnail category")
      .sort({ purchasedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: payments.length,
      total,
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getPaymentHistory error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch payment history." });
  }
};

// ─── Razorpay Webhook Handler ─────────────────────────────────────────────────
/**
 * POST /api/payments/webhook
 * Handles server-side Razorpay webhook events.
 * Note: Raw body is required (configured in server.js).
 */
const handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn("⚠️ RAZORPAY_WEBHOOK_SECRET not set — skipping webhook verification.");
      return res.status(200).json({ received: true });
    }

    // Verify webhook signature
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body; // Raw buffer (configured in server.js)

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid Razorpay webhook signature");
      return res.status(400).json({ success: false, message: "Invalid webhook signature." });
    }

    const event = JSON.parse(body.toString());
    console.log(`📩 Razorpay webhook event: ${event.event}`);

    // Handle different event types
    switch (event.event) {
      case "payment.captured": {
        const payment = event.payload.payment.entity;
        console.log(`✅ Payment captured: ${payment.id} — ₹${payment.amount / 100}`);

        // Optionally update enrollment payment status if using webhook-first flow
        const enrollment = await Enrollment.findOne({ paymentId: payment.id });
        if (enrollment) {
          enrollment.paymentStatus = "completed";
          await enrollment.save();
        }
        break;
      }

      case "payment.failed": {
        const payment = event.payload.payment.entity;
        console.error(`❌ Payment failed: ${payment.id}`);

        // Update enrollment status to failed
        const enrollment = await Enrollment.findOne({ orderId: payment.order_id });
        if (enrollment) {
          enrollment.paymentStatus = "failed";
          await enrollment.save();
        }
        break;
      }

      case "refund.created": {
        const refund = event.payload.refund.entity;
        console.log(`💸 Refund created: ${refund.id}`);

        const enrollment = await Enrollment.findOne({ paymentId: refund.payment_id });
        if (enrollment) {
          enrollment.paymentStatus = "refunded";
          await enrollment.save();
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event: ${event.event}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("handleWebhook error:", err);
    res.status(500).json({ success: false, message: "Webhook handling failed." });
  }
};

module.exports = { createOrder, verifyPayment, getPaymentHistory, handleWebhook };
