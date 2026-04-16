/**
 * @file course.controller.js
 * @description Course CRUD controller with search, filter, and sort support.
 */

const Course = require("../models/Course.model");
const Category = require("../models/Category.model");
const Enrollment = require("../models/Enrollment.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary");
const { isOwnerOrAdmin } = require("../middleware/role.middleware");

// ─── Get All Courses (Public) ─────────────────────────────────────────────────
/**
 * GET /api/courses
 * Public endpoint — returns published, approved courses.
 * Supports: search, category, level, language, minPrice, maxPrice, sort, page, limit
 */
const getAllCourses = async (req, res) => {
  try {
    const {
      search,
      category,
      level,
      language,
      minPrice,
      maxPrice,
      sort = "newest",
      page = 1,
      limit = 12,
    } = req.query;

    const filter = { isPublished: true, isApproved: true };

    // Search by text
    if (search) {
      filter.$text = { $search: search };
    }

    // Filter by category slug or ID
    if (category) {
      const cat = await Category.findOne({
        $or: [{ slug: category }, { _id: category.match(/^[0-9a-fA-F]{24}$/) ? category : null }],
      });
      if (cat) filter.category = cat._id;
    }

    if (level) filter.level = level;
    if (language) filter.language = language;

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      rating: { rating: -1 },
      popular: { enrolledCount: -1 },
      "price-low": { price: 1 },
      "price-high": { price: -1 },
      title: { title: 1 },
    };
    const sortBy = sortOptions[sort] || sortOptions.newest;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Course.countDocuments(filter);

    const courses = await Course.find(filter)
      .populate("instructor", "name avatar bio")
      .populate("category", "name slug icon color")
      .select("-lessons.videoUrl -ratings")
      .sort(sortBy)
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
        hasNext: skip + courses.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (err) {
    console.error("getAllCourses error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch courses." });
  }
};

// ─── Get Course By ID (Public/Private) ───────────────────────────────────────
/**
 * GET /api/courses/:id
 * Returns full course details.
 * Lesson video URLs are hidden for non-enrolled students (except free lessons).
 */
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate("instructor", "name avatar bio enrolledCourses")
      .populate("category", "name slug icon color")
      .lean();

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    // Check enrollment if user is logged in
    let isEnrolled = false;
    let enrollment = null;

    if (req.user) {
      enrollment = await Enrollment.findOne({
        user: req.user._id,
        course: course._id,
        paymentStatus: "completed",
      }).lean();
      isEnrolled = !!enrollment;
    }

    // Lock video URLs for non-enrolled students (unless free lesson or admin/instructor)
    const isInstructorOrAdmin =
      req.user &&
      (req.user.role === "admin" ||
        (req.user.role === "instructor" &&
          course.instructor._id.toString() === req.user._id.toString()));

    if (!isEnrolled && !isInstructorOrAdmin) {
      course.lessons = course.lessons.map((lesson) => ({
        ...lesson,
        videoUrl: lesson.isFree ? lesson.videoUrl : null, // Only expose free lesson URLs
      }));
    }

    // Add enrollment details
    course.isEnrolled = isEnrolled;
    course.enrollment = enrollment
      ? {
        progress: enrollment.progress,
        completedLessons: enrollment.completedLessons,
        currentLessonId: enrollment.currentLessonId,
        isCompleted: enrollment.isCompleted,
      }
      : null;

    // Calculate instructor course count
    const instructorCourseCount = await Course.countDocuments({
      instructor: course.instructor._id,
      isPublished: true,
    });
    course.instructor.courseCount = instructorCourseCount;

    res.status(200).json({ success: true, course });
  } catch (err) {
    console.error("getCourseById error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch course." });
  }
};

// ─── Create Course (Instructor) ───────────────────────────────────────────────
/**
 * POST /api/courses
 * Instructor creates a new course (starts as draft).
 */
const createCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      shortDescription,
      price,
      originalPrice,
      categoryId,
      subcategory,
      level,
      language,
      tags,
      requirements,
      whatYouLearn,
    } = req.body;

    if (!title || !description || price === undefined || !categoryId) {
      return res.status(400).json({
        success: false,
        message: "Title, description, price, and category are required.",
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    let thumbnailUrl = null;
    let thumbnailPublicId = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "lms/thumbnails");
      thumbnailUrl = result.secure_url;
      thumbnailPublicId = result.public_id;
    }

    const parseArray = (field) => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      try {
        return JSON.parse(field);
      } catch {
        return [field];
      }
    };

    const course = await Course.create({
      title: title.trim(),
      description,
      shortDescription,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : null,
      thumbnail: thumbnailUrl,
      thumbnailPublicId,
      category: categoryId,
      subcategory,
      level: level || "beginner",
      language: language || "Hinglish",
      instructor: req.user._id,
      tags: parseArray(tags),
      requirements: parseArray(requirements),
      whatYouLearn: parseArray(whatYouLearn),
    });

    // Increment category course count (only when published/approved — track separately)
    res.status(201).json({
      success: true,
      message: "Course created successfully! Add lessons and publish when ready.",
      course,
    });
  } catch (err) {
    console.error("createCourse error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to create course." });
  }
};

// ─── Update Course (Instructor/Admin) ─────────────────────────────────────────
/**
 * PUT /api/courses/:id
 * Instructor updates their own course; admin can update any.
 */
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own courses.",
      });
    }

    const fields = [
      "title",
      "description",
      "shortDescription",
      "price",
      "originalPrice",
      "subcategory",
      "level",
      "language",
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        course[field] = req.body[field];
      }
    });

    // Update category
    if (req.body.categoryId) {
      const cat = await Category.findById(req.body.categoryId);
      if (!cat) return res.status(404).json({ success: false, message: "Category not found." });
      course.category = req.body.categoryId;
    }

    // Update arrays
    const parseArray = (field) => {
      if (!field) return undefined;
      if (Array.isArray(field)) return field;
      try { return JSON.parse(field); } catch { return [field]; }
    };

    if (req.body.tags !== undefined) course.tags = parseArray(req.body.tags);
    if (req.body.requirements !== undefined) course.requirements = parseArray(req.body.requirements);
    if (req.body.whatYouLearn !== undefined) course.whatYouLearn = parseArray(req.body.whatYouLearn);

    // Handle thumbnail update
    if (req.file) {
      if (course.thumbnailPublicId) {
        await deleteFromCloudinary(course.thumbnailPublicId).catch(() => { });
      }
      const result = await uploadToCloudinary(req.file.buffer, "lms/thumbnails");
      course.thumbnail = result.secure_url;
      course.thumbnailPublicId = result.public_id;
    }

    // Reset approval if instructor edits a published course
    if (
      req.user.role === "instructor" &&
      course.isPublished &&
      course.isApproved
    ) {
      course.isApproved = false;
      course.isPublished = false;
    }

    await course.save();

    res.status(200).json({
      success: true,
      message: "Course updated successfully.",
      course,
    });
  } catch (err) {
    console.error("updateCourse error:", err);
    res.status(500).json({ success: false, message: "Failed to update course." });
  }
};

// ─── Delete Course (Instructor/Admin) ─────────────────────────────────────────
/**
 * DELETE /api/courses/:id
 * Deletes a course and its Cloudinary assets.
 */
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete your own courses.",
      });
    }

    // Delete thumbnail from Cloudinary
    if (course.thumbnailPublicId) {
      await deleteFromCloudinary(course.thumbnailPublicId).catch(() => { });
    }

    // Delete all lesson videos from Cloudinary
    for (const lesson of course.lessons) {
      if (lesson.videoPublicId) {
        await deleteFromCloudinary(lesson.videoPublicId, "video").catch(() => { });
      }
    }

    // Delete enrollments for this course
    await Enrollment.deleteMany({ course: course._id });

    // Update category course count
    await Category.findByIdAndUpdate(course.category, {
      $inc: { courseCount: -1 },
    });

    await Course.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Course deleted successfully.",
    });
  } catch (err) {
    console.error("deleteCourse error:", err);
    res.status(500).json({ success: false, message: "Failed to delete course." });
  }
};

// ─── Publish/Unpublish Course (Instructor) ────────────────────────────────────
/**
 * PATCH /api/courses/:id/publish
 * Toggles course publish state. Must be approved by admin first.
 */
const publishCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (!course.isApproved && !course.isPublished) {
      return res.status(400).json({
        success: false,
        message: "Course must be approved by admin before publishing.",
      });
    }

    if (course.lessons.length === 0 && !course.isPublished) {
      return res.status(400).json({
        success: false,
        message: "Cannot publish a course with no lessons.",
      });
    }

    course.isPublished = !course.isPublished;
    await course.save();

    // Update category course count
    await Category.findByIdAndUpdate(course.category, {
      $inc: { courseCount: course.isPublished ? 1 : -1 },
    });

    res.status(200).json({
      success: true,
      message: `Course ${course.isPublished ? "published" : "unpublished"} successfully.`,
      isPublished: course.isPublished,
    });
  } catch (err) {
    console.error("publishCourse error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle publish state." });
  }
};

// ─── Get Instructor's Courses ─────────────────────────────────────────────────
/**
 * GET /api/courses/instructor/my-courses
 * Returns the logged-in instructor's courses (all, including drafts).
 */
const getInstructorCourses = async (req, res) => {
  try {
    const { status } = req.query; // "published", "draft", "all"

    const filter = { instructor: req.user._id };
    if (status === "published") {
      filter.isPublished = true;
    } else if (status === "draft") {
      filter.isPublished = false;
    }

    const courses = await Course.find(filter)
      .populate("category", "name slug icon")
      .sort({ createdAt: -1 })
      .lean();

    // Add enrollment count per course
    const coursesWithStats = await Promise.all(
      courses.map(async (course) => {
        const enrollmentCount = await Enrollment.countDocuments({
          course: course._id,
          paymentStatus: "completed",
        });
        return { ...course, enrollmentCount };
      })
    );

    res.status(200).json({
      success: true,
      count: courses.length,
      courses: coursesWithStats,
    });
  } catch (err) {
    console.error("getInstructorCourses error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch instructor courses." });
  }
};

// ─── Rate Course ───────────────────────────────────────────────────────────────
/**
 * POST /api/courses/:id/rate
 * Enrolled students can rate and review a course.
 */
const rateCourse = async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    // Verify enrollment
    const enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: course._id,
      paymentStatus: "completed",
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in this course to rate it.",
      });
    }

    // Check for existing rating
    const existingRatingIndex = course.ratings.findIndex(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (existingRatingIndex !== -1) {
      // Update existing rating
      course.ratings[existingRatingIndex].rating = rating;
      course.ratings[existingRatingIndex].review = review || "";
    } else {
      // Add new rating
      course.ratings.push({ user: req.user._id, rating, review: review || "" });
    }

    await course.save(); // Pre-save hook recalculates average rating

    res.status(200).json({
      success: true,
      message: "Rating submitted successfully.",
      rating: course.rating,
      totalRatings: course.totalRatings,
    });
  } catch (err) {
    console.error("rateCourse error:", err);
    res.status(500).json({ success: false, message: "Failed to submit rating." });
  }
};

module.exports = {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  getInstructorCourses,
  rateCourse,
};
