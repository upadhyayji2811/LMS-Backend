/**
 * @file enrollment.controller.js
 * @description Enrollment controller — enroll (free), track progress, get enrollments.
 */

const Enrollment = require("../models/Enrollment.model");
const Course = require("../models/Course.model");
const User = require("../models/User.model");

// ─── Enroll in Free Course ────────────────────────────────────────────────────
/**
 * POST /api/enrollments/:courseId/enroll
 * Enrolls a student in a FREE course without payment.
 */
const enrollInCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!course.isPublished || !course.isApproved) {
      return res.status(400).json({
        success: false,
        message: "This course is not available for enrollment.",
      });
    }

    if (course.price > 0) {
      return res.status(400).json({
        success: false,
        message: "This is a paid course. Please use the payment flow to enroll.",
      });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      user: req.user._id,
      course: courseId,
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: "You are already enrolled in this course.",
      });
    }

    // Create enrollment
    const enrollment = await Enrollment.create({
      user: req.user._id,
      course: courseId,
      amount: 0,
      paymentStatus: "completed",
    });

    // Update course enrolled count and user's enrolled courses
    await Course.findByIdAndUpdate(courseId, { $inc: { enrolledCount: 1 } });
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { enrolledCourses: courseId },
    });

    res.status(201).json({
      success: true,
      message: "Successfully enrolled in course! Happy learning! 🎉",
      enrollment,
    });
  } catch (err) {
    console.error("enrollInCourse error:", err);
    res.status(500).json({ success: false, message: "Enrollment failed. Please try again." });
  }
};

// ─── Get My Enrollments ───────────────────────────────────────────────────────
/**
 * GET /api/enrollments/my-enrollments
 * Returns all enrollments for the authenticated student.
 */
const getMyEnrollments = async (req, res) => {
  try {
    const { status } = req.query; // "in-progress", "completed"
    const filter = { user: req.user._id, paymentStatus: "completed" };

    if (status === "completed") filter.isCompleted = true;
    if (status === "in-progress") filter.isCompleted = false;

    const enrollments = await Enrollment.find(filter)
      .populate({
        path: "course",
        select: "title thumbnail instructor category totalLessons totalDuration language level",
        populate: [
          { path: "instructor", select: "name avatar" },
          { path: "category", select: "name slug icon" },
        ],
      })
      .sort({ lastAccessedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: enrollments.length,
      enrollments,
    });
  } catch (err) {
    console.error("getMyEnrollments error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch enrollments." });
  }
};

// ─── Get Course Progress ──────────────────────────────────────────────────────
/**
 * GET /api/enrollments/:courseId/progress
 * Returns the student's progress for a specific course.
 */
const getCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;

    const enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: courseId,
      paymentStatus: "completed",
    }).lean();

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "You are not enrolled in this course.",
      });
    }

    const course = await Course.findById(courseId)
      .select("lessons totalLessons title")
      .lean();

    res.status(200).json({
      success: true,
      progress: enrollment.progress,
      completedLessons: enrollment.completedLessons,
      totalLessons: course?.totalLessons || 0,
      currentLessonId: enrollment.currentLessonId,
      isCompleted: enrollment.isCompleted,
      completedAt: enrollment.completedAt,
      lastAccessedAt: enrollment.lastAccessedAt,
    });
  } catch (err) {
    console.error("getCourseProgress error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch progress." });
  }
};

// ─── Get Enrollment Detail ────────────────────────────────────────────────────
/**
 * GET /api/enrollments/:courseId/detail
 * Returns full enrollment with completed lessons for the learn page.
 */
const getEnrollmentDetail = async (req, res) => {
  try {
    const { courseId } = req.params;

    const enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: courseId,
      paymentStatus: "completed",
    })
      .populate({
        path: "course",
        populate: [
          { path: "instructor", select: "name avatar bio" },
          { path: "category", select: "name slug" },
        ],
      })
      .lean();

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found. Please enroll in this course first.",
      });
    }

    res.status(200).json({
      success: true,
      enrollment,
    });
  } catch (err) {
    console.error("getEnrollmentDetail error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch enrollment detail." });
  }
};

// ─── Update Notes ─────────────────────────────────────────────────────────────
/**
 * PATCH /api/enrollments/:courseId/notes
 * Student saves their notes for a course.
 */
const updateNotes = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { notes } = req.body;

    const enrollment = await Enrollment.findOneAndUpdate(
      { user: req.user._id, course: courseId, paymentStatus: "completed" },
      { notes: notes || "" },
      { new: true }
    );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notes saved successfully.",
      notes: enrollment.notes,
    });
  } catch (err) {
    console.error("updateNotes error:", err);
    res.status(500).json({ success: false, message: "Failed to save notes." });
  }
};

module.exports = {
  enrollInCourse,
  getMyEnrollments,
  getCourseProgress,
  getEnrollmentDetail,
  updateNotes,
};
