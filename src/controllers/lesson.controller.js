/**
 * @file lesson.controller.js
 * @description Lesson management controller — add, edit, delete lessons within a course.
 */

const Course = require("../models/Course.model");
const Enrollment = require("../models/Enrollment.model");
const { uploadVideoToCloudinary, deleteFromCloudinary, uploadToCloudinary } = require("../utils/cloudinary");
const { isOwnerOrAdmin } = require("../middleware/role.middleware");

// ─── Add Lesson ───────────────────────────────────────────────────────────────
/**
 * POST /api/lessons/:courseId/add
 * Instructor adds a new lesson with an optional video upload.
 */
const addLesson = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, isFree, order, resources } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: "Lesson title is required." });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only add lessons to your own courses.",
      });
    }

    let videoUrl = null;
    let videoPublicId = null;
    let duration = 0;

    // Upload video to Cloudinary if provided
    if (req.file) {
      console.log(`⬆️ Uploading video for lesson: ${title}`);
      const result = await uploadVideoToCloudinary(req.file.buffer, "lms/videos");
      videoUrl = result.secure_url;
      videoPublicId = result.public_id;
      duration = result.duration || 0; // Cloudinary provides video duration
    }

    // Parse resources
    let parsedResources = [];
    if (resources) {
      try {
        parsedResources = Array.isArray(resources) ? resources : JSON.parse(resources);
      } catch {
        parsedResources = [];
      }
    }

    // Determine lesson order
    const lessonOrder =
      order !== undefined ? Number(order) : course.lessons.length;

    course.lessons.push({
      title: title.trim(),
      description: description || "",
      videoUrl,
      videoPublicId,
      duration,
      order: lessonOrder,
      isFree: isFree === "true" || isFree === true,
      resources: parsedResources,
    });

    // Sort lessons by order
    course.lessons.sort((a, b) => a.order - b.order);

    await course.save();

    const addedLesson = course.lessons[course.lessons.length - 1];

    res.status(201).json({
      success: true,
      message: "Lesson added successfully!",
      lesson: addedLesson,
      totalLessons: course.totalLessons,
    });
  } catch (err) {
    console.error("addLesson error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to add lesson." });
  }
};

// ─── Update Lesson ────────────────────────────────────────────────────────────
/**
 * PUT /api/lessons/:courseId/lessons/:lessonId
 * Instructor updates lesson details or replaces the video.
 */
const updateLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { title, description, isFree, order } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: "Lesson not found." });
    }

    // Replace video if new one uploaded
    if (req.file) {
      if (lesson.videoPublicId) {
        await deleteFromCloudinary(lesson.videoPublicId, "video").catch(() => {});
      }
      const result = await uploadVideoToCloudinary(req.file.buffer, "lms/videos");
      lesson.videoUrl = result.secure_url;
      lesson.videoPublicId = result.public_id;
      lesson.duration = result.duration || lesson.duration;
    }

    if (title) lesson.title = title.trim();
    if (description !== undefined) lesson.description = description;
    if (isFree !== undefined) lesson.isFree = isFree === "true" || isFree === true;
    if (order !== undefined) lesson.order = Number(order);

    // Re-sort lessons
    course.lessons.sort((a, b) => a.order - b.order);

    await course.save();

    res.status(200).json({
      success: true,
      message: "Lesson updated successfully.",
      lesson,
    });
  } catch (err) {
    console.error("updateLesson error:", err);
    res.status(500).json({ success: false, message: "Failed to update lesson." });
  }
};

// ─── Delete Lesson ────────────────────────────────────────────────────────────
/**
 * DELETE /api/lessons/:courseId/lessons/:lessonId
 * Removes a lesson and deletes its Cloudinary video.
 */
const deleteLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: "Lesson not found." });
    }

    // Delete video from Cloudinary
    if (lesson.videoPublicId) {
      await deleteFromCloudinary(lesson.videoPublicId, "video").catch((err) =>
        console.warn("Failed to delete Cloudinary video:", err.message)
      );
    }

    // Remove lesson from course
    course.lessons.pull(lessonId);

    // Re-number remaining lessons' orders
    course.lessons.forEach((l, idx) => {
      l.order = idx;
    });

    await course.save();

    res.status(200).json({
      success: true,
      message: "Lesson deleted successfully.",
      totalLessons: course.totalLessons,
    });
  } catch (err) {
    console.error("deleteLesson error:", err);
    res.status(500).json({ success: false, message: "Failed to delete lesson." });
  }
};

// ─── Complete Lesson ──────────────────────────────────────────────────────────
/**
 * POST /api/lessons/:courseId/lessons/:lessonId/complete
 * Student marks a lesson as completed and updates their progress.
 */
const completeLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    const course = await Course.findById(courseId).lean();
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    const enrollment = await Enrollment.findOne({
      user: req.user._id,
      course: courseId,
      paymentStatus: "completed",
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this course.",
      });
    }

    // Check if lesson exists in course
    const lessonExists = course.lessons.some(
      (l) => l._id.toString() === lessonId
    );
    if (!lessonExists) {
      return res.status(404).json({ success: false, message: "Lesson not found in course." });
    }

    // Add to completed lessons if not already completed
    const alreadyCompleted = enrollment.completedLessons.some(
      (id) => id.toString() === lessonId
    );

    if (!alreadyCompleted) {
      enrollment.completedLessons.push(lessonId);
      enrollment.currentLessonId = lessonId;
      enrollment.lastAccessedAt = new Date();
      enrollment.updateProgress(course.lessons.length);
      await enrollment.save();
    }

    res.status(200).json({
      success: true,
      message: alreadyCompleted ? "Lesson already completed." : "Lesson marked as completed! 🎉",
      progress: enrollment.progress,
      isCompleted: enrollment.isCompleted,
      completedLessons: enrollment.completedLessons,
    });
  } catch (err) {
    console.error("completeLesson error:", err);
    res.status(500).json({ success: false, message: "Failed to mark lesson complete." });
  }
};

// ─── Reorder Lessons ──────────────────────────────────────────────────────────
/**
 * PATCH /api/lessons/:courseId/reorder
 * Changes order of lessons via drag-and-drop.
 * Body: { lessonOrders: [{ lessonId, order }] }
 */
const reorderLessons = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lessonOrders } = req.body;

    if (!Array.isArray(lessonOrders)) {
      return res.status(400).json({
        success: false,
        message: "lessonOrders must be an array of { lessonId, order }.",
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Update order for each lesson
    lessonOrders.forEach(({ lessonId, order }) => {
      const lesson = course.lessons.id(lessonId);
      if (lesson) {
        lesson.order = Number(order);
      }
    });

    // Sort by new order
    course.lessons.sort((a, b) => a.order - b.order);

    await course.save();

    res.status(200).json({
      success: true,
      message: "Lessons reordered successfully.",
      lessons: course.lessons,
    });
  } catch (err) {
    console.error("reorderLessons error:", err);
    res.status(500).json({ success: false, message: "Failed to reorder lessons." });
  }
};

// ─── Add Resource to Lesson ───────────────────────────────────────────────────
/**
 * POST /api/lessons/:courseId/lessons/:lessonId/resources
 * Adds a downloadable resource (PDF, zip, etc.) to a lesson.
 */
const addResource = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { name } = req.body;

    if (!name || !req.file) {
      return res.status(400).json({
        success: false,
        message: "Resource name and file are required.",
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    if (!isOwnerOrAdmin(course, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: "Lesson not found." });
    }

    // Upload resource file to Cloudinary as raw
    const result = await uploadToCloudinary(req.file.buffer, "lms/resources", {
      resource_type: "raw",
    });

    lesson.resources.push({ name: name.trim(), url: result.secure_url });
    await course.save();

    res.status(201).json({
      success: true,
      message: "Resource added successfully.",
      resources: lesson.resources,
    });
  } catch (err) {
    console.error("addResource error:", err);
    res.status(500).json({ success: false, message: "Failed to add resource." });
  }
};

module.exports = {
  addLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
  reorderLessons,
  addResource,
};
