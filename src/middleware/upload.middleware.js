/**
 * @file upload.middleware.js
 * @description Multer + Cloudinary upload middleware.
 * Handles video and image uploads from multipart/form-data requests.
 * Files are streamed directly to Cloudinary (no local disk storage).
 */

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../utils/cloudinary");

// ─── Cloudinary Storage for Images ────────────────────────────────────────────
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary.cloudinaryInstance,
  params: async (req, file) => {
    return {
      folder: "lms/images",
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "svg"],
      transformation: [
        { width: 1280, height: 720, crop: "limit", quality: "auto:good" },
      ],
      public_id: `${Date.now()}-${file.originalname.replace(/\s/g, "_").replace(/\.[^/.]+$/, "")}`,
    };
  },
});

// ─── Cloudinary Storage for Videos ────────────────────────────────────────────
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary.cloudinaryInstance,
  params: async (req, file) => {
    return {
      folder: "lms/videos",
      resource_type: "video",
      allowed_formats: ["mp4", "mov", "avi", "mkv", "webm"],
      chunk_size: 6000000, // 6MB chunks for large video uploads
      eager: [
        { streaming_profile: "full_hd", format: "m3u8" }, // HLS streaming
      ],
      eager_async: true,
      public_id: `${Date.now()}-${file.originalname.replace(/\s/g, "_").replace(/\.[^/.]+$/, "")}`,
    };
  },
});

// ─── Cloudinary Storage for PDFs / Documents ──────────────────────────────────
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary.cloudinaryInstance,
  params: async (req, file) => {
    return {
      folder: "lms/documents",
      resource_type: "raw",
      allowed_formats: ["pdf", "docx", "pptx", "zip"],
      public_id: `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`,
    };
  },
});

// ─── File Filter Helpers ───────────────────────────────────────────────────────
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif|svg/;
  const isValidMime = allowedTypes.test(file.mimetype);
  const isValidExt = allowedTypes.test(file.originalname.toLowerCase());

  if (isValidMime && isValidExt) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only image files (jpg, png, webp, gif, svg) are allowed"
      ),
      false
    );
  }
};

const videoFileFilter = (req, file, cb) => {
  const allowedTypes = /mp4|mov|avi|mkv|webm/;
  const isValidMime = /video\//.test(file.mimetype);
  const isValidExt = allowedTypes.test(file.originalname.toLowerCase());

  if (isValidMime && isValidExt) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only video files (mp4, mov, avi, mkv, webm) are allowed"
      ),
      false
    );
  }
};

// ─── Multer Upload Instances ───────────────────────────────────────────────────

/**
 * Upload a single image file (field name: "image" or "thumbnail" or "avatar")
 */
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for images
  },
});

/**
 * Upload a single video file (field name: "video")
 */
const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max for videos
  },
});

/**
 * Upload mixed fields: thumbnail (image) + mixed files
 * Used for course creation with both thumbnail and lesson videos
 */
const uploadMixed = multer({
  storage: imageStorage, // Default to image storage; override per field
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

/**
 * Memory-only storage (for Cloudinary upload via buffer)
 * Used when we want to process the file before uploading
 */
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

// ─── Multer Error Handler Middleware ──────────────────────────────────────────
/**
 * Handles multer-specific errors gracefully.
 * Should be used after upload middleware in route handlers.
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "File is too large. Max size: 5MB for images, 500MB for videos.",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: err.field || "Unexpected file type. Please check allowed formats.",
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

module.exports = {
  uploadImage,
  uploadVideo,
  uploadMixed,
  uploadMemory,
  handleUploadError,
};
