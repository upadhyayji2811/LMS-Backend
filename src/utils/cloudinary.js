/**
 * @file cloudinary.js
 * @description Cloudinary configuration and upload/delete helper functions.
 * All media (images, videos, PDFs) are stored on Cloudinary.
 */

const cloudinaryLib = require("cloudinary").v2;
const streamifier = require("streamifier");

// ─── Configure Cloudinary ─────────────────────────────────────────────────────
cloudinaryLib.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Always use HTTPS
});

/**
 * Upload a file buffer to Cloudinary using a stream.
 * @param {Buffer} fileBuffer - File buffer from multer memoryStorage
 * @param {string} folder - Cloudinary folder path (e.g., "lms/images")
 * @param {Object} [options={}] - Additional Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result { secure_url, public_id, ... }
 */
const uploadToCloudinary = (fileBuffer, folder, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryLib.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        quality: "auto",
        ...options,
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload error:", error);
          reject(new Error(error.message || "Failed to upload to Cloudinary"));
        } else {
          resolve(result);
        }
      }
    );

    // Convert buffer to readable stream and pipe to Cloudinary
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Upload a file from a local path (for use with multer diskStorage).
 * @param {string} filePath - Local file path
 * @param {string} folder - Cloudinary folder
 * @param {Object} [options={}] - Additional upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadFileFromPath = async (filePath, folder, options = {}) => {
  try {
    const result = await cloudinaryLib.uploader.upload(filePath, {
      folder,
      resource_type: "auto",
      quality: "auto",
      ...options,
    });
    return result;
  } catch (error) {
    console.error("❌ Cloudinary path upload error:", error);
    throw new Error(error.message || "Failed to upload file to Cloudinary");
  }
};

/**
 * Upload a video file with HLS streaming support.
 * @param {Buffer} fileBuffer - Video file buffer
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<Object>} Cloudinary upload result with streaming URLs
 */
const uploadVideoToCloudinary = (fileBuffer, folder = "lms/videos") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryLib.uploader.upload_stream(
      {
        folder,
        resource_type: "video",
        chunk_size: 6000000, // 6MB chunks
        eager: [
          { streaming_profile: "full_hd", format: "m3u8" },
          { streaming_profile: "hd", format: "m3u8" },
        ],
        eager_async: true,
        quality: "auto",
      },
      (error, result) => {
        if (error) {
          reject(new Error(error.message || "Video upload failed"));
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Delete a resource from Cloudinary by its public_id.
 * @param {string} publicId - Cloudinary public_id of the resource
 * @param {string} [resourceType="image"] - "image", "video", or "raw"
 * @returns {Promise<Object>} Cloudinary deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    if (!publicId) {
      console.warn("⚠️ deleteFromCloudinary: No publicId provided");
      return null;
    }

    const result = await cloudinaryLib.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    if (result.result !== "ok" && result.result !== "not found") {
      console.warn(`⚠️ Cloudinary deletion warning for ${publicId}:`, result);
    }

    return result;
  } catch (error) {
    console.error("❌ Cloudinary delete error:", error);
    throw new Error(error.message || "Failed to delete from Cloudinary");
  }
};

/**
 * Get optimized Cloudinary URL with transformations.
 * @param {string} publicId - Cloudinary public_id
 * @param {Object} [options={}] - Transformation options
 * @returns {string} Transformed Cloudinary URL
 */
const getOptimizedUrl = (publicId, options = {}) => {
  return cloudinaryLib.url(publicId, {
    quality: "auto",
    fetch_format: "auto",
    ...options,
  });
};

/**
 * Get a streaming URL for a video (HLS m3u8).
 * @param {string} publicId - Cloudinary video public_id
 * @returns {string} HLS streaming URL
 */
const getVideoStreamingUrl = (publicId) => {
  return cloudinaryLib.url(publicId, {
    resource_type: "video",
    streaming_profile: "full_hd",
    format: "m3u8",
  });
};

module.exports = {
  cloudinaryInstance: cloudinaryLib,
  uploadToCloudinary,
  uploadFileFromPath,
  uploadVideoToCloudinary,
  deleteFromCloudinary,
  getOptimizedUrl,
  getVideoStreamingUrl,
};
