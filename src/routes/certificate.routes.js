/**
 * @file certificate.routes.js
 * @description Certificate generation and verification routes.
 */

const express = require("express");
const router = express.Router();

const {
  generateCertificate,
  getCertificate,
  getMyCertificates,
  verifyCertificate,
} = require("../controllers/certificate.controller");

const { protectRoute } = require("../middleware/auth.middleware");

// Public: verify any certificate by ID
router.get("/verify/:certificateId", verifyCertificate);

// Protected routes
router.use(protectRoute);
router.get("/my-certificates", getMyCertificates);
router.post("/:courseId/generate", generateCertificate);
router.get("/:courseId", getCertificate);

module.exports = router;
