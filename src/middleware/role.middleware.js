/**
 * @file role.middleware.js
 * @description Role-based access control (RBAC) middleware.
 * Must be used AFTER verifyToken/protectRoute since it requires req.user.
 */

/**
 * Checks if the authenticated user has one of the allowed roles.
 * @param {...string} roles - Allowed role strings
 * @returns {import('express').RequestHandler}
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
};

/**
 * Allows only students.
 * @type {import('express').RequestHandler}
 */
const isStudent = requireRole("student");

/**
 * Allows only instructors.
 * @type {import('express').RequestHandler}
 */
const isInstructor = requireRole("instructor");

/**
 * Allows only admins.
 * @type {import('express').RequestHandler}
 */
const isAdmin = requireRole("admin");

/**
 * Allows both instructors and admins.
 * @type {import('express').RequestHandler}
 */
const isInstructorOrAdmin = requireRole("instructor", "admin");

/**
 * Allows students, instructors, and admins (all authenticated users).
 * @type {import('express').RequestHandler}
 */
const isAuthenticated = requireRole("student", "instructor", "admin");

/**
 * Checks ownership of a resource OR admin override.
 * Usage: Use inside a controller after fetching the resource.
 * @param {Object} resource - Mongoose document with `instructor` or `user` field
 * @param {Object} currentUser - req.user
 * @returns {boolean} True if user owns resource or is admin
 */
const isOwnerOrAdmin = (resource, currentUser) => {
  if (currentUser.role === "admin") return true;

  const ownerId =
    resource.instructor || resource.user || resource.createdBy;
  if (!ownerId) return false;

  return ownerId.toString() === currentUser._id.toString();
};

module.exports = {
  requireRole,
  isStudent,
  isInstructor,
  isAdmin,
  isInstructorOrAdmin,
  isAuthenticated,
  isOwnerOrAdmin,
};
