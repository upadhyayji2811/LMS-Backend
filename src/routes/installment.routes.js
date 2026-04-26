/**
 * @file installment.routes.js
 * @description Routes for installment payment plan management.
 *
 * Sab routes protected hain (JWT token required).
 * "all" route sirf admin ke liye hai (adminOnly middleware).
 */

const express = require("express");
const router = express.Router();

const {
  createInstallmentPlan,
  createNextInstallmentOrder,
  verifyInstallmentPayment,
  getMyInstallmentPlans,
  getAllInstallmentPlans,
  getInstallmentPlanDetail,
} = require("../controllers/installment.controller");

const { protectRoute, adminOnly } = require("../middleware/auth.middleware");

// Sabhi routes ke liye authentication required
router.use(protectRoute);

// Student routes
router.post("/create-plan", createInstallmentPlan);           // Naya plan banao
router.get("/my-plans", getMyInstallmentPlans);               // Mere saare plans
router.get("/:planId", getInstallmentPlanDetail);             // Ek plan ki detail
router.post("/:planId/create-order", createNextInstallmentOrder); // Next payment ka order
router.post("/:planId/verify", verifyInstallmentPayment);     // Payment verify karo

// Admin route
router.get("/admin/all", adminOnly, getAllInstallmentPlans);  // Sabhi students ke plans

module.exports = router;
