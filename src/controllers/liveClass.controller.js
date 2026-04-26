/**
 * @file liveClass.controller.js
 * @description Live class scheduling and management controller.
 */

const LiveClass = require("../models/LiveClass.model");
const Category = require("../models/Category.model");
const Course = require("../models/Course.model");
const { isOwnerOrAdmin } = require("../middleware/role.middleware");
const { sendLiveClassReminder } = require("../utils/sendEmail");

// ─── Helper: Get start/end of week ───────────────────────────────────────────
const getWeekRange = (weeksFromNow = 0) => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + weeksFromNow * 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return { start: startOfWeek, end: endOfWeek };
};

// ─── Get Upcoming Classes (Public) ───────────────────────────────────────────
/**
 * GET /api/live-classes/upcoming
 * Returns upcoming live classes for the next 4 weeks.
 */
const getUpcomingClasses = async (req, res) => {
  try {
    const { categoryId, page = 1, limit = 20 } = req.query;
    const now = new Date();
    const fourWeeksLater = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

    const filter = {
      scheduledAt: { $gte: now, $lte: fourWeeksLater },
      isCancelled: false,
    };

    if (categoryId) filter.category = categoryId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await LiveClass.countDocuments(filter);

    const classes = await LiveClass.find(filter)
      .populate("instructor", "name avatar bio")
      .populate("course", "title thumbnail")
      .populate("category", "name slug icon")
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Add isLiveNow virtual and filter out ended classes (no recording)
    const now2 = new Date();
    const classesWithStatus = classes
      .map((cls) => {
        const start = new Date(cls.scheduledAt);
        const end = new Date(start.getTime() + cls.duration * 60 * 1000);
        const isEnded = now2 > end;
        return {
          ...cls,
          isLiveNow: now2 >= start && now2 <= end && !cls.isCompleted,
          minutesUntilStart: Math.round((start - now2) / 60000),
          _isEnded: isEnded,
        };
      })
      // Hide ended classes that have no recording
      .filter((cls) => !cls._isEnded || cls.recordingUrl)
      .map(({ _isEnded, ...cls }) => cls);

    res.status(200).json({
      success: true,
      count: classesWithStatus.length,
      total,
      classes: classesWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getUpcomingClasses error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch upcoming classes." });
  }
};

// ─── Get This Week's Classes ──────────────────────────────────────────────────
/**
 * GET /api/live-classes/this-week
 */
const getThisWeekClasses = async (req, res) => {
  try {
    const { start, end } = getWeekRange(0);
    const { categoryId } = req.query;

    const filter = {
      scheduledAt: { $gte: start, $lte: end },
      isCancelled: false,
    };
    if (categoryId) filter.category = categoryId;

    const classes = await LiveClass.find(filter)
      .populate("instructor", "name avatar")
      .populate("category", "name slug icon")
      .populate("course", "title")
      .sort({ scheduledAt: 1 })
      .lean();

    const now = new Date();
    const classesWithStatus = classes
      .map((cls) => {
        const start2 = new Date(cls.scheduledAt);
        const end2 = new Date(start2.getTime() + cls.duration * 60 * 1000);
        const isEnded = now > end2;
        return {
          ...cls,
          isLiveNow: now >= start2 && now <= end2 && !cls.isCompleted,
          minutesUntilStart: Math.round((start2 - now) / 60000),
          _isEnded: isEnded,
        };
      })
      // Hide ended classes that have no recording
      .filter((cls) => !cls._isEnded || cls.recordingUrl)
      .map(({ _isEnded, ...cls }) => cls);

    res.status(200).json({
      success: true,
      week: "current",
      weekRange: { start, end },
      count: classesWithStatus.length,
      classes: classesWithStatus,
    });
  } catch (err) {
    console.error("getThisWeekClasses error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch this week's classes." });
  }
};

// ─── Get Next Week's Classes ──────────────────────────────────────────────────
/**
 * GET /api/live-classes/next-week
 */
const getNextWeekClasses = async (req, res) => {
  try {
    const { start, end } = getWeekRange(1);
    const { categoryId } = req.query;

    const filter = {
      scheduledAt: { $gte: start, $lte: end },
      isCancelled: false,
    };
    if (categoryId) filter.category = categoryId;

    const classes = await LiveClass.find(filter)
      .populate("instructor", "name avatar")
      .populate("category", "name slug icon")
      .populate("course", "title")
      .sort({ scheduledAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      week: "next",
      weekRange: { start, end },
      count: classes.length,
      classes,
    });
  } catch (err) {
    console.error("getNextWeekClasses error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch next week's classes." });
  }
};

// ─── Get Classes by Course ────────────────────────────────────────────────────
/**
 * GET /api/live-classes/course/:courseId
 */
const getClassesByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const classes = await LiveClass.find({ course: courseId })
      .populate("instructor", "name avatar")
      .sort({ scheduledAt: 1 })
      .lean();

    res.status(200).json({ success: true, count: classes.length, classes });
  } catch (err) {
    console.error("getClassesByCourse error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch classes for course." });
  }
};

// ─── Schedule Live Class (Instructor) ────────────────────────────────────────
/**
 * POST /api/live-classes
 */
const scheduleClass = async (req, res) => {
  try {
    const {
      title,
      topic,
      description,
      categoryId,
      courseId,
      scheduledAt,
      duration,
      meetLink,
      week,
      maxAttendees,
      tags,
    } = req.body;

    if (!title || !scheduledAt || !meetLink) {
      return res.status(400).json({
        success: false,
        message: "Title, scheduledAt, and meetLink are required.",
      });
    }

    // Validate Google Meet link
    if (!meetLink.includes('meet.google.com')) {
      return res.status(400).json({
        success: false,
        message: "meetLink must be a valid Google Meet URL (meet.google.com/...).",
      });
    }

    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found." });
      }
    }

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ success: false, message: "Course not found." });
      }
    }

    const liveClass = await LiveClass.create({
      title: title.trim(),
      topic: topic ? topic.trim() : '',
      description: description || '',
      instructor: req.user._id,
      category: categoryId || null,
      course: courseId || null,
      scheduledAt: new Date(scheduledAt),
      duration: duration || 60,
      meetLink: meetLink.trim(),
      week: week || null,
      maxAttendees: maxAttendees || null,
      tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
    });

    await liveClass.populate("instructor", "name avatar");
    if (categoryId) await liveClass.populate("category", "name slug");

    res.status(201).json({
      success: true,
      message: "Live class scheduled successfully! 🎯",
      liveClass,
    });
  } catch (err) {
    console.error("scheduleClass error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to schedule class." });
  }
};

// ─── Update Class ─────────────────────────────────────────────────────────────
/**
 * PUT /api/live-classes/:id
 */
const updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const liveClass = await LiveClass.findById(id);

    if (!liveClass) {
      return res.status(404).json({ success: false, message: "Live class not found." });
    }

    if (!isOwnerOrAdmin(liveClass, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const updatableFields = [
      "title", "topic", "description", "scheduledAt", "duration",
      "meetLink", "week", "isCompleted", "recordingUrl", "maxAttendees",
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        liveClass[field] = req.body[field];
      }
    });

    await liveClass.save();

    res.status(200).json({
      success: true,
      message: "Live class updated successfully.",
      liveClass,
    });
  } catch (err) {
    console.error("updateClass error:", err);
    res.status(500).json({ success: false, message: "Failed to update class." });
  }
};

// ─── Delete/Cancel Class ──────────────────────────────────────────────────────
/**
 * DELETE /api/live-classes/:id
 */
const deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    const liveClass = await LiveClass.findById(id);

    if (!liveClass) {
      return res.status(404).json({ success: false, message: "Live class not found." });
    }

    if (!isOwnerOrAdmin(liveClass, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Soft-cancel if class is in the future (don't permanently delete)
    if (new Date(liveClass.scheduledAt) > new Date()) {
      liveClass.isCancelled = true;
      await liveClass.save();
      return res.status(200).json({
        success: true,
        message: "Live class cancelled successfully.",
      });
    }

    // Hard delete if class is already past
    await LiveClass.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Live class deleted." });
  } catch (err) {
    console.error("deleteClass error:", err);
    res.status(500).json({ success: false, message: "Failed to delete class." });
  }
};

/**
 * GET /api/live-classes/instructor/my-classes
 * Instructor's scheduled classes.
 */
const getInstructorClasses = async (req, res) => {
  try {
    const classes = await LiveClass.find({ instructor: req.user._id })
      .populate("category", "name slug")
      .populate("course", "title")
      .sort({ scheduledAt: -1 })
      .lean();

    res.status(200).json({ success: true, count: classes.length, classes });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch instructor classes." });
  }
};

module.exports = {
  getUpcomingClasses,
  getThisWeekClasses,
  getNextWeekClasses,
  getClassesByCourse,
  scheduleClass,
  updateClass,
  deleteClass,
  getInstructorClasses,
};
