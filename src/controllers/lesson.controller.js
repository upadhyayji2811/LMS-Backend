/**
 * @file lesson.controller.js
 * @description Lesson management controller — add, edit, delete lessons within a course.
 */

const Course = require("../models/Course.model");
const Enrollment = require("../models/Enrollment.model");
// OLD: Cloudinary upload — commented out (ab YouTube use ho raha hai)
// const { uploadVideoToCloudinary, deleteFromCloudinary, uploadToCloudinary } = require("../utils/cloudinary");
const { uploadToCloudinary } = require("../utils/cloudinary"); // resources ke liye ab bhi cloudinary use hogi
const { isOwnerOrAdmin } = require("../middleware/role.middleware");

// ─── NEW: YouTube Video ID Extractor ──────────────────────────────────────────────
/**
 * YouTube ke kisi bhi URL format se video ID nikalta hai.
 * Supported formats:
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   https://youtu.be/dQw4w9WgXcQ
 *   https://www.youtube.com/embed/dQw4w9WgXcQ
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID ya null agar invalid URL
 */
const extractYoutubeId = (url) => {
  if (!url) return null;
  // Regex — teen formats handle karta hai
  const regex =
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// ─── Add Lesson ───────────────────────────────────────────────────────────────
/**
 * POST /api/lessons/:courseId/add
 * Instructor adds a new lesson with an optional video upload.
 */
const addLesson = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, isFree, order, resources, youtubeUrl, duration } = req.body;

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

    // ─── OLD: Cloudinary video upload ──────────────────────────────────────────────
    // let videoUrl = null;
    // let videoPublicId = null;
    // let cloudinayDuration = 0;
    // if (req.file) {
    //   console.log(`⬆️ Uploading video for lesson: ${title}`);
    //   const result = await uploadVideoToCloudinary(req.file.buffer, "lms/videos");
    //   videoUrl = result.secure_url;
    //   videoPublicId = result.public_id;
    //   cloudinayDuration = result.duration || 0;
    // }
    // ─────────────────────────────────────────────────────────────────────

    // ─── NEW: YouTube URL se Video ID extract karo ───────────────────────────
    const extractedId = extractYoutubeId(youtubeUrl);
    if (youtubeUrl && !extractedId) {
      return res.status(400).json({
        success: false,
        message: "Invalid YouTube URL. Please use a valid YouTube video link.",
      });
    }
    // ─────────────────────────────────────────────────────────────────────

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
    const lessonOrder = order !== undefined ? Number(order) : course.lessons.length;

    course.lessons.push({
      title: title.trim(),
      description: description || "",
      // OLD: videoUrl, videoPublicId, (Cloudinary) — removed
      youtubeUrl: youtubeUrl || null,       // NEW: Full YouTube URL store karo
      youtubeVideoId: extractedId || null,  // NEW: Extracted ID store karo
      duration: duration ? Number(duration) : 0, // Manual duration (seconds)
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
    const { title, description, isFree, order, youtubeUrl, duration } = req.body;

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

    // ─── OLD: Cloudinary video replace ──────────────────────────────────────────
    // if (req.file) {
    //   if (lesson.videoPublicId) {
    //     await deleteFromCloudinary(lesson.videoPublicId, "video").catch(() => {});
    //   }
    //   const result = await uploadVideoToCloudinary(req.file.buffer, "lms/videos");
    //   lesson.videoUrl = result.secure_url;
    //   lesson.videoPublicId = result.public_id;
    //   lesson.duration = result.duration || lesson.duration;
    // }
    // ────────────────────────────────────────────────────────────────────

    // ─── NEW: YouTube URL update karo agar diya gaya ──────────────────────────
    if (youtubeUrl !== undefined) {
      if (youtubeUrl === '' || youtubeUrl === null) {
        // Clear YouTube video
        lesson.youtubeUrl = null;
        lesson.youtubeVideoId = null;
      } else {
        const extractedId = extractYoutubeId(youtubeUrl);
        if (!extractedId) {
          return res.status(400).json({
            success: false,
            message: "Invalid YouTube URL. Please use a valid YouTube video link.",
          });
        }
        lesson.youtubeUrl = youtubeUrl;
        lesson.youtubeVideoId = extractedId;
      }
    }
    // ────────────────────────────────────────────────────────────────────

    if (title) lesson.title = title.trim();
    if (description !== undefined) lesson.description = description;
    if (isFree !== undefined) lesson.isFree = isFree === "true" || isFree === true;
    if (order !== undefined) lesson.order = Number(order);
    if (duration !== undefined) lesson.duration = Number(duration);

    course.lessons.sort((a, b) => a.order - b.order);
    await course.save();

    res.status(200).json({ success: true, message: "Lesson updated successfully.", lesson });
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

    // OLD: Cloudinary video delete — commented out (YouTube mein delete ki zaroorat nahi)
    // if (lesson.videoPublicId) {
    //   await deleteFromCloudinary(lesson.videoPublicId, "video").catch((err) =>
    //     console.warn("Failed to delete Cloudinary video:", err.message)
    //   );
    // }
    // YouTube ka sirf DB record hata do, koi file delete nahi hoti

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

    // NEW: Expiry check — 6 months ke baad access band ho jaata hai
    if (enrollment.expiresAt && new Date() > enrollment.expiresAt) {
      return res.status(403).json({
        success: false,
        message: "Your access to this course has expired. Please contact admin to renew.",
        isExpired: true,
        expiresAt: enrollment.expiresAt,
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

// ─── Secure Video Stream Endpoint ─────────────────────────────────────────────────────
/**
 * GET /api/lessons/:courseId/lessons/:lessonId/stream
 * Returns a short-lived embed token for the lesson video.
 * Only enrolled students (or free lesson viewers) can access.
 * The response never mentions the underlying media platform.
 */
const getVideoStream = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    const course = await Course.findById(courseId).lean();
    if (!course) {
      return res.status(404).json({ success: false, message: "Content not found." });
    }

    const lesson = course.lessons.find((l) => l._id.toString() === lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: "Lesson not found." });
    }

    // Access control: must be enrolled OR lesson is free
    if (!lesson.isFree) {
      if (!req.user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
      }

      const enrollment = await Enrollment.findOne({
        user: req.user._id,
        course: courseId,
        paymentStatus: "completed",
      });

      if (!enrollment) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }

      // Expiry check
      if (enrollment.expiresAt && new Date() > new Date(enrollment.expiresAt)) {
        return res.status(403).json({
          success: false,
          message: "Your access to this content has expired.",
          isExpired: true,
        });
      }
    }

    // Build embed parameters — use privacy-enhanced domain, no referrer leaks
    const mid = lesson.youtubeVideoId;
    if (!mid) {
      return res.status(404).json({ success: false, message: "No video available for this lesson." });
    }

    // Params: disable related videos, hide branding, no annotations
    const params = [
      "rel=0",
      "modestbranding=1",
      "showinfo=0",
      "iv_load_policy=3",
      "fs=1",
      "disablekb=0",
      "color=white",
    ].join("&");

    // Use privacy-enhanced domain (does not set cookies, less traceable)
    const streamUrl = `https://www.youtube-nocookie.com/embed/${mid}?${params}`;

    // Return as a neutral field name — no "youtube" word in response
    res.status(200).json({
      success: true,
      embedUrl: streamUrl,   // Client calls it "embedUrl" — platform is hidden
      hasVideo: true,
    });
  } catch (err) {
    console.error("getVideoStream error:", err);
    res.status(500).json({ success: false, message: "Failed to load video." });
  }
};

module.exports = {
  addLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
  reorderLessons,
  addResource,
  getVideoStream,  // NEW: secure stream endpoint
};
