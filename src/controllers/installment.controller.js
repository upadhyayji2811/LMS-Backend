/**
 * @file installment.controller.js
 * @description Controller for installment payment plans.
 *
 * Available endpoints:
 *   POST /api/installments/create-plan   → Naya 3-installment plan banao
 *   POST /api/installments/:planId/create-order → Next installment ka Razorpay order
 *   POST /api/installments/:planId/verify       → Razorpay payment verify karo
 *   GET  /api/installments/my-plans             → Student ke saare plans
 *   GET  /api/installments/all                  → Admin: sabhi students ke plans
 *   GET  /api/installments/:planId              → Ek plan ki detail
 */

const Razorpay = require("razorpay");
const crypto = require("crypto");
const InstallmentPlan = require("../models/InstallmentPlan.model");
const CustomPricing = require("../models/CustomPricing.model");
const Course = require("../models/Course.model");
const Enrollment = require("../models/Enrollment.model");
const User = require("../models/User.model");

// ─── Razorpay Instance Helper ─────────────────────────────────────────────────
// Same helper jaise payment.controller.js mein hai
const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// ─── Helper: Calculate installment amounts ────────────────────────────────────
/**
 * Total amount ko 3 equal parts mein divide karta hai.
 * Rounding ki wajah se koi paise zyada ho jaaye toh pehle installment mein add
 * @param {number} totalAmount - Total fees amount in rupees
 * @returns {[number, number, number]} Array of 3 amounts
 */
const splitInto3 = (totalAmount) => {
  const base = Math.floor(totalAmount / 3);
  const remainder = totalAmount - base * 3;
  // Remainder pehle installment mein add kar do
  return [base + remainder, base, base];
};

// ─── Create Installment Plan ──────────────────────────────────────────────────
/**
 * POST /api/installments/create-plan
 * Naya installment plan banata hai aur pehle installment ka Razorpay order return karta hai.
 * Student pehli payment karta hai → course access milta hai.
 *
 * Body: { courseId }
 */
const createInstallmentPlan = async (req, res) => {
  try {
    const { courseId } = req.body;
    const studentId = req.user._id;

    if (!courseId) {
      return res.status(400).json({ success: false, message: "Course ID is required." });
    }

    // Course check karo
    const course = await Course.findById(courseId).populate("instructor", "name").lean();
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }
    if (!course.isPublished || !course.isApproved) {
      return res.status(400).json({ success: false, message: "Course is not available for purchase." });
    }
    if (course.price === 0) {
      return res.status(400).json({ success: false, message: "Free courses don't need installments." });
    }

    // Check: Kya student already enrolled hai?
    const existingEnrollment = await Enrollment.findOne({
      user: studentId,
      course: courseId,
      paymentStatus: "completed",
    });
    if (existingEnrollment) {
      return res.status(400).json({ success: false, message: "You are already enrolled in this course." });
    }

    // Check: Kya pehle se koi active installment plan hai?
    const existingPlan = await InstallmentPlan.findOne({
      student: studentId,
      course: courseId,
      status: "active",
    });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: "You already have an active installment plan for this course.",
        planId: existingPlan._id,
      });
    }

    // Admin custom price check karo
    const now = new Date();
    const customPricing = await CustomPricing.findOne({
      student: studentId,
      course: courseId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });

    // Final amount: custom price hai toh woh, warna normal course price
    const finalAmount = customPricing ? customPricing.customPrice : course.price;

    // 3 installments mein split karo
    const [amt1, amt2, amt3] = splitInto3(finalAmount);

    // Due dates: aaj, 30 din baad, 60 din baad
    const today = new Date();
    const date2 = new Date(today);
    date2.setDate(date2.getDate() + 30);
    const date3 = new Date(today);
    date3.setDate(date3.getDate() + 60);

    // InstallmentPlan document banao
    const plan = await InstallmentPlan.create({
      student: studentId,
      course: courseId,
      totalAmount: finalAmount,
      installments: [
        { installmentNumber: 1, amount: amt1, dueDate: today, status: "pending" },
        { installmentNumber: 2, amount: amt2, dueDate: date2, status: "pending" },
        { installmentNumber: 3, amount: amt3, dueDate: date3, status: "pending" },
      ],
      status: "active",
      enrollmentGranted: false,
    });

    // Pehle installment ka Razorpay order banao
    const razorpay = getRazorpay();
    const amountInPaise = Math.round(amt1 * 100);
    const receipt = `inst1_${studentId.toString().slice(-6)}_${Date.now().toString().slice(-8)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        planId: plan._id.toString(),
        installmentNumber: "1",
        courseId: courseId.toString(),
        studentId: studentId.toString(),
        courseName: course.title,
      },
    });

    // Pehle installment mein order id save karo
    plan.installments[0].razorpayOrderId = order.id;
    await plan.save();

    res.status(201).json({
      success: true,
      message: "Installment plan created. Pay the first installment to get course access.",
      plan: {
        _id: plan._id,
        totalAmount: finalAmount,
        installments: plan.installments,
      },
      // Pehle installment ka Razorpay order
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      course: {
        _id: course._id,
        title: course.title,
        thumbnail: course.thumbnail,
      },
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("createInstallmentPlan error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to create installment plan." });
  }
};

// ─── Create Order for Next Installment ───────────────────────────────────────
/**
 * POST /api/installments/:planId/create-order
 * Agla pending installment ka Razorpay order banata hai (2nd ya 3rd).
 */
const createNextInstallmentOrder = async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await InstallmentPlan.findById(planId).populate("course", "title thumbnail price");
    if (!plan) {
      return res.status(404).json({ success: false, message: "Installment plan not found." });
    }

    // Sirf plan ka owner ya admin access kar sake
    if (plan.student.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (plan.status === "completed") {
      return res.status(400).json({ success: false, message: "This installment plan is already completed." });
    }

    // Agla pending installment dhundo
    const nextInstallment = plan.installments.find((inst) => inst.status === "pending");
    if (!nextInstallment) {
      return res.status(400).json({ success: false, message: "No pending installments found." });
    }

    const razorpay = getRazorpay();
    const amountInPaise = Math.round(nextInstallment.amount * 100);
    const receipt = `inst${nextInstallment.installmentNumber}_${plan.student.toString().slice(-6)}_${Date.now().toString().slice(-8)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        planId: plan._id.toString(),
        installmentNumber: nextInstallment.installmentNumber.toString(),
        courseId: plan.course._id.toString(),
      },
    });

    // Order id save karo
    nextInstallment.razorpayOrderId = order.id;
    await plan.save();

    res.status(200).json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      installmentNumber: nextInstallment.installmentNumber,
      course: plan.course,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("createNextInstallmentOrder error:", err);
    res.status(500).json({ success: false, message: "Failed to create installment order." });
  }
};

// ─── Verify Installment Payment ───────────────────────────────────────────────
/**
 * POST /api/installments/:planId/verify
 * Razorpay payment verify karta hai aur installment ko "paid" mark karta hai.
 * Agar yeh pehli installment hai → Enrollment create karo (course access do).
 * Agar teesri installment hai → Plan complete karo.
 *
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, installmentNumber }
 */
const verifyInstallmentPayment = async (req, res) => {
  try {
    const { planId } = req.params;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      installmentNumber,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment verification parameters." });
    }

    // Razorpay signature verify karo
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed. Invalid signature." });
    }

    const plan = await InstallmentPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Installment plan not found." });
    }

    // Installment dhundo aur update karo
    const instIndex = installmentNumber - 1;
    const installment = plan.installments[instIndex];
    if (!installment) {
      return res.status(400).json({ success: false, message: "Invalid installment number." });
    }

    installment.status = "paid";
    installment.razorpayPaymentId = razorpay_payment_id;
    installment.paidAt = new Date();

    // Agar pehli installment pay hui → Enrollment banao
    if (installmentNumber === 1 && !plan.enrollmentGranted) {
      // Enrollment create karo (pehli installment amount se)
      await Enrollment.create({
        user: plan.student,
        course: plan.course,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        // Pehli installment ka amount
        amount: installment.amount,
        currency: "INR",
        paymentStatus: "completed",
        purchasedAt: new Date(),
      });

      // Course enrolledCount badhaao
      await Course.findByIdAndUpdate(plan.course, { $inc: { enrolledCount: 1 } });

      // User ke enrolled courses mein add karo
      await User.findByIdAndUpdate(plan.student, {
        $addToSet: { enrolledCourses: plan.course },
      });

      plan.enrollmentGranted = true;
    }

    // Agar teesri installment pay ho gayi → Plan complete karo
    const allPaid = plan.installments.every((inst) => inst.status === "paid");
    if (allPaid) {
      plan.status = "completed";
    }

    await plan.save();

    res.status(200).json({
      success: true,
      message:
        installmentNumber === 1
          ? "First installment paid! You now have full course access. 🎉"
          : `Installment ${installmentNumber} paid successfully!`,
      enrollmentGranted: plan.enrollmentGranted,
      planCompleted: plan.status === "completed",
      installmentNumber,
    });
  } catch (err) {
    console.error("verifyInstallmentPayment error:", err);
    res.status(500).json({ success: false, message: "Payment verification failed." });
  }
};

// ─── Get My Installment Plans (Student) ──────────────────────────────────────
/**
 * GET /api/installments/my-plans
 * Student ke saare installment plans return karta hai.
 */
const getMyInstallmentPlans = async (req, res) => {
  try {
    const plans = await InstallmentPlan.find({
      student: req.user._id,
    })
      .populate("course", "title thumbnail category instructor")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: plans.length,
      plans,
    });
  } catch (err) {
    console.error("getMyInstallmentPlans error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch installment plans." });
  }
};

// ─── Get All Plans (Admin) ────────────────────────────────────────────────────
/**
 * GET /api/installments/all
 * Admin ke liye sabhi students ke installment plans.
 * Query params: status, page, limit
 */
const getAllInstallmentPlans = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await InstallmentPlan.countDocuments(filter);

    const plans = await InstallmentPlan.find(filter)
      .populate("student", "name email avatar")
      .populate("course", "title thumbnail price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: plans.length,
      total,
      plans,
    });
  } catch (err) {
    console.error("getAllInstallmentPlans error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch installment plans." });
  }
};

// ─── Get Single Plan Detail ───────────────────────────────────────────────────
/**
 * GET /api/installments/:planId
 * Ek specific plan ki puri detail.
 */
const getInstallmentPlanDetail = async (req, res) => {
  try {
    const plan = await InstallmentPlan.findById(req.params.planId)
      .populate("student", "name email avatar")
      .populate("course", "title thumbnail price")
      .lean();

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }

    // Student sirf apna plan dekh sake, admin sab dekh sake
    if (
      plan.student._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    res.status(200).json({ success: true, plan });
  } catch (err) {
    console.error("getInstallmentPlanDetail error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch plan." });
  }
};

module.exports = {
  createInstallmentPlan,
  createNextInstallmentOrder,
  verifyInstallmentPayment,
  getMyInstallmentPlans,
  getAllInstallmentPlans,
  getInstallmentPlanDetail,
};
