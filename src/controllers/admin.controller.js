/**
 * @file admin.controller.js
 * @description Admin-only controller for platform management, analytics, and revenue.
 */

const User = require("../models/User.model");
const Course = require("../models/Course.model");
const Category = require("../models/Category.model");
const Enrollment = require("../models/Enrollment.model");
const Certificate = require("../models/Certificate.model");
const LiveClass = require("../models/LiveClass.model");

// ─── Platform Stats ───────────────────────────────────────────────────────────
/**
 * GET /api/admin/stats
 * Returns high-level platform statistics.
 */
const getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalStudents,
      totalInstructors,
      totalCourses,
      publishedCourses,
      totalEnrollments,
      totalCategories,
      totalCertificates,
      totalLiveClasses,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "instructor" }),
      Course.countDocuments(),
      Course.countDocuments({ isPublished: true }),
      Enrollment.countDocuments({ paymentStatus: "completed" }),
      Category.countDocuments({ isActive: true }),
      Certificate.countDocuments({ isValid: true }),
      LiveClass.countDocuments({ isCancelled: false }),
    ]);

    // Total revenue
    const revenueResult = await Enrollment.aggregate([
      { $match: { paymentStatus: "completed", amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // New users this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: startOfMonth },
    });

    // New enrollments this month
    const newEnrollmentsThisMonth = await Enrollment.countDocuments({
      purchasedAt: { $gte: startOfMonth },
      paymentStatus: "completed",
    });

    // Revenue this month
    const revenueThisMonth = await Enrollment.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          amount: { $gt: 0 },
          purchasedAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          students: totalStudents,
          instructors: totalInstructors,
          newThisMonth: newUsersThisMonth,
        },
        courses: {
          total: totalCourses,
          published: publishedCourses,
          draft: totalCourses - publishedCourses,
        },
        enrollments: {
          total: totalEnrollments,
          newThisMonth: newEnrollmentsThisMonth,
        },
        revenue: {
          total: totalRevenue,
          thisMonth: revenueThisMonth[0]?.total || 0,
        },
        categories: totalCategories,
        certificates: totalCertificates,
        liveClasses: totalLiveClasses,
      },
    });
  } catch (err) {
    console.error("getPlatformStats error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch platform stats." });
  }
};

// ─── Get All Users ─────────────────────────────────────────────────────────────
/**
 * GET /api/admin/users
 * Paginated, searchable user list.
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, sort = "newest" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (role && ["student", "instructor", "admin"].includes(role)) {
      filter.role = role;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { name: 1 },
    };

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("-password -resetPasswordToken -resetPasswordExpire")
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Add enrollment count for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const enrollmentCount = await Enrollment.countDocuments({
          user: user._id,
          paymentStatus: "completed",
        });
        return { ...user, enrollmentCount };
      })
    );

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getAllUsers error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
};

// ─── Change User Role ─────────────────────────────────────────────────────────
/**
 * PATCH /api/admin/users/:userId/role
 * Admin changes a user's role.
 */
const changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["student", "instructor", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be student, instructor, or admin.",
      });
    }

    // Prevent admin from demoting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role.",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.status(200).json({
      success: true,
      message: `User role changed to "${role}" successfully.`,
      user,
    });
  } catch (err) {
    console.error("changeUserRole error:", err);
    res.status(500).json({ success: false, message: "Failed to change user role." });
  }
};

// ─── Toggle User Active ───────────────────────────────────────────────────────
/**
 * PATCH /api/admin/users/:userId/toggle-active
 * Admin activates or deactivates a user account.
 */
const toggleUserActive = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User account ${user.isActive ? "activated" : "deactivated"} successfully.`,
      isActive: user.isActive,
    });
  } catch (err) {
    console.error("toggleUserActive error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle user status." });
  }
};

// ─── Get All Courses (Admin) ──────────────────────────────────────────────────
/**
 * GET /api/admin/courses
 * Returns all courses including unpublished drafts.
 */
const getAllCoursesAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, published, approved } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (published !== undefined) filter.isPublished = published === "true";
    if (approved !== undefined) filter.isApproved = approved === "true";
    if (search) {
      filter.$text = { $search: search };
    }

    const total = await Course.countDocuments(filter);
    const courses = await Course.find(filter)
      .populate("instructor", "name email avatar")
      .populate("category", "name slug")
      .select("-lessons.videoUrl -ratings")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: courses.length,
      total,
      courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getAllCoursesAdmin error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch courses." });
  }
};

// ─── Approve/Reject Course ────────────────────────────────────────────────────
/**
 * PATCH /api/admin/courses/:courseId/approve
 * Admin approves or rejects a course for publishing.
 */
const approveCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { isApproved, rejectionReason } = req.body;

    const course = await Course.findById(courseId)
      .populate("instructor", "name email");

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    course.isApproved = isApproved;

    if (!isApproved) {
      // Unpublish if rejected
      course.isPublished = false;
    }

    await course.save();

    res.status(200).json({
      success: true,
      message: `Course ${isApproved ? "approved" : "rejected"} successfully.`,
      course: {
        _id: course._id,
        title: course.title,
        isApproved: course.isApproved,
        isPublished: course.isPublished,
      },
    });
  } catch (err) {
    console.error("approveCourse error:", err);
    res.status(500).json({ success: false, message: "Failed to update course approval." });
  }
};

// ─── Get Revenue Stats ────────────────────────────────────────────────────────
/**
 * GET /api/admin/revenue
 * Monthly revenue breakdown and per-course revenue.
 */
const getRevenue = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    // Monthly revenue for the requested year
    const monthlyRevenue = await Enrollment.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          amount: { $gt: 0 },
          purchasedAt: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31`),
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$purchasedAt" } },
          revenue: { $sum: "$amount" },
          enrollments: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    // Format monthly data (fill 0 for months with no revenue)
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthlyData = months.map((month, idx) => {
      const found = monthlyRevenue.find((r) => r._id.month === idx + 1);
      return {
        month,
        revenue: found?.revenue || 0,
        enrollments: found?.enrollments || 0,
      };
    });

    // Per-course revenue (top 10)
    const courseRevenue = await Enrollment.aggregate([
      { $match: { paymentStatus: "completed", amount: { $gt: 0 } } },
      {
        $group: {
          _id: "$course",
          revenue: { $sum: "$amount" },
          enrollments: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmpty: true } },
      {
        $project: {
          courseId: "$_id",
          title: "$course.title",
          thumbnail: "$course.thumbnail",
          revenue: 1,
          enrollments: 1,
        },
      },
    ]);

    // Total revenue
    const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);
    const totalEnrollments = monthlyData.reduce((sum, m) => sum + m.enrollments, 0);

    res.status(200).json({
      success: true,
      year: parseInt(year),
      totalRevenue,
      totalEnrollments,
      monthlyData,
      courseRevenue,
    });
  } catch (err) {
    console.error("getRevenue error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch revenue data." });
  }
};

// ─── Get Recent Signups ───────────────────────────────────────────────────────
/**
 * GET /api/admin/recent-signups
 * Returns the 10 most recently registered users.
 */
const getRecentSignups = async (req, res) => {
  try {
    const users = await User.find()
      .select("name email role avatar createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch recent signups." });
  }
};

module.exports = {
  getPlatformStats,
  getAllUsers,
  changeUserRole,
  toggleUserActive,
  getAllCourses: getAllCoursesAdmin,
  approveCourse,
  getRevenue,
  getRecentSignups,
};
