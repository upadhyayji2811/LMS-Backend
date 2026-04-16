/**
 * @file payment.routes.js
 * @description Razorpay payment routes.
 */

const express = require("express");
const router = express.Router();

const {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  handleWebhook,
} = require("../controllers/payment.controller");

const { protectRoute } = require("../middleware/auth.middleware");

// Webhook (raw body — configured in server.js before body-parser)
router.post("/webhook", handleWebhook);

// Protected routes
router.post("/create-order", protectRoute, createOrder);
router.post("/verify", protectRoute, verifyPayment);
router.get("/history", protectRoute, getPaymentHistory);

module.exports = router;
