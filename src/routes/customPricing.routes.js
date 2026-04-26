/**
 * @file customPricing.routes.js
 * @description Routes for admin custom pricing management.
 *
 * Admin routes: POST, DELETE, GET /all  → sirf admin
 * Student route: GET /check/:courseId   → authenticated student
 */

const express = require("express");
const router = express.Router();

const {
  setCustomPrice,
  removeCustomPrice,
  checkCustomPrice,
  getAllCustomPrices,
  toggleCustomPrice,
} = require("../controllers/customPricing.controller");

const { protectRoute, adminOnly } = require("../middleware/auth.middleware");

// Authentication required for all routes
router.use(protectRoute);

// Student: course page pe check karo apna custom price
router.get("/check/:courseId", checkCustomPrice);

// Admin-only routes
router.post("/", adminOnly, setCustomPrice);                     // Naya custom price set karo
router.get("/all", adminOnly, getAllCustomPrices);               // Sab records dekho
router.delete("/:id", adminOnly, removeCustomPrice);             // Deactivate karo
router.patch("/:id/toggle", adminOnly, toggleCustomPrice);       // Toggle active/inactive

module.exports = router;
