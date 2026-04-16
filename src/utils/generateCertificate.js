/**
 * @file generateCertificate.js
 * @description PDF certificate generation using PDFKit.
 * Creates a styled certificate with student name, course, instructor, date, and unique ID.
 * The PDF is uploaded to Cloudinary and its URL is returned.
 */

const PDFDocument = require("pdfkit");
const streamifier = require("streamifier");
const { uploadToCloudinary } = require("./cloudinary");

/**
 * Draws a decorative border on the certificate.
 * @param {PDFDocument} doc - PDFKit document instance
 */
const drawBorder = (doc) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 20;

  // Outer border
  doc
    .rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2)
    .lineWidth(6)
    .stroke("#2563EB");

  // Inner border
  doc
    .rect(
      margin + 10,
      margin + 10,
      pageWidth - (margin + 10) * 2,
      pageHeight - (margin + 10) * 2
    )
    .lineWidth(2)
    .stroke("#06B6D4");
};

/**
 * Generates a PDF certificate and uploads it to Cloudinary.
 *
 * @param {Object} options - Certificate data
 * @param {string} options.studentName - Full name of the student
 * @param {string} options.courseName - Name of the completed course
 * @param {string} options.instructorName - Name of the instructor
 * @param {string} options.certificateId - Unique certificate ID (e.g., LMS-20240101-ABCD1234)
 * @param {string} [options.categoryName] - Category name (e.g., Game Development)
 * @param {Date} [options.issuedAt] - Date of issuance
 * @returns {Promise<{pdfUrl: string, publicId: string}>} Cloudinary URL and public_id of the PDF
 */
const generateCertificate = async ({
  studentName,
  courseName,
  instructorName,
  certificateId,
  categoryName = "Game Development",
  issuedAt = new Date(),
}) => {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document (A4 landscape)
      const doc = new PDFDocument({
        layout: "landscape",
        size: "A4",
        margin: 0,
        info: {
          Title: `Certificate of Completion — ${courseName}`,
          Author: "LMS Platform",
          Subject: `Certificate for ${studentName}`,
        },
      });

      const buffers = [];

      // Collect PDF chunks in memory
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("error", reject);
      doc.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);

          // Upload to Cloudinary
          const result = await uploadToCloudinary(
            pdfBuffer,
            "lms/certificates",
            {
              resource_type: "raw",
              format: "pdf",
              public_id: `certificate-${certificateId}`,
            }
          );

          resolve({
            pdfUrl: result.secure_url,
            publicId: result.public_id,
          });
        } catch (uploadErr) {
          reject(uploadErr);
        }
      });

      // ─── Background ─────────────────────────────────────────────────────────
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Dark background
      doc.rect(0, 0, pageWidth, pageHeight).fill("#0C0F1A");

      // Top gradient band
      doc.rect(0, 0, pageWidth, 8).fill("#2563EB");
      doc.rect(0, 8, pageWidth, 4).fill("#06B6D4");

      // Bottom gradient band
      doc.rect(0, pageHeight - 8, pageWidth, 8).fill("#2563EB");
      doc.rect(0, pageHeight - 12, pageWidth, 4).fill("#06B6D4");

      // ─── Decorative borders ──────────────────────────────────────────────────
      drawBorder(doc);

      // ─── Corner decorations ──────────────────────────────────────────────────
      const cornerSize = 30;
      const corners = [
        [40, 40], // top-left
        [pageWidth - 40 - cornerSize, 40], // top-right
        [40, pageHeight - 40 - cornerSize], // bottom-left
        [pageWidth - 40 - cornerSize, pageHeight - 40 - cornerSize], // bottom-right
      ];

      corners.forEach(([x, y]) => {
        doc.rect(x, y, cornerSize, cornerSize).fill("#2563EB");
        doc.rect(x + 4, y + 4, cornerSize - 8, cornerSize - 8).fill("#0C0F1A");
      });

      // ─── Header ─────────────────────────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#06B6D4")
        .text("🎮  LMS PLATFORM  🎮", 0, 55, { align: "center" });

      doc
        .moveDown(0.3)
        .fontSize(11)
        .fillColor("#64748B")
        .text("India's Premier Game Development Learning Platform", { align: "center" });

      // Divider line
      doc
        .moveTo(100, doc.y + 12)
        .lineTo(pageWidth - 100, doc.y + 12)
        .lineWidth(1)
        .stroke("#1E2A45");

      // ─── Certificate Title ───────────────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(38)
        .fillColor("#FFFFFF")
        .text("CERTIFICATE OF COMPLETION", 0, doc.y + 24, { align: "center" });

      // ─── Subtitle ────────────────────────────────────────────────────────────
      doc
        .font("Helvetica")
        .fontSize(14)
        .fillColor("#94A3B8")
        .text("This is to proudly certify that", 0, doc.y + 12, {
          align: "center",
        });

      // ─── Student Name ─────────────────────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(44)
        .fillColor("#2563EB")
        .text(studentName, 0, doc.y + 16, { align: "center" });

      // Underline for name
      const nameWidth = doc.widthOfString(studentName, { fontSize: 44 });
      const nameX = (pageWidth - nameWidth) / 2;
      const nameY = doc.y + 2;
      doc
        .moveTo(nameX, nameY)
        .lineTo(nameX + nameWidth, nameY)
        .lineWidth(2)
        .stroke("#06B6D4");

      // ─── Body Text ────────────────────────────────────────────────────────────
      doc
        .font("Helvetica")
        .fontSize(14)
        .fillColor("#94A3B8")
        .text("has successfully completed the course", 0, doc.y + 18, {
          align: "center",
        });

      // ─── Course Name ──────────────────────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor("#FFFFFF")
        .text(`"${courseName}"`, 0, doc.y + 10, { align: "center" });

      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#06B6D4")
        .text(`Category: ${categoryName}`, 0, doc.y + 8, { align: "center" });

      // ─── Bottom Section ───────────────────────────────────────────────────────
      const bottomY = pageHeight - 140;

      // Divider
      doc
        .moveTo(80, bottomY)
        .lineTo(pageWidth - 80, bottomY)
        .lineWidth(1)
        .stroke("#1E2A45");

      // Instructor Signature Column (left)
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#FFFFFF")
        .text(instructorName, 80, bottomY + 18, { width: 200, align: "center" });
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#64748B")
        .text("Course Instructor", 80, doc.y + 4, { width: 200, align: "center" });

      // Certificate ID (center)
      const certIdX = (pageWidth - 250) / 2;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#06B6D4")
        .text("CERTIFICATE ID", certIdX, bottomY + 18, { width: 250, align: "center" });
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#FFFFFF")
        .text(certificateId, certIdX, doc.y + 4, { width: 250, align: "center" });

      // Date (right)
      const issuedDateStr = new Date(issuedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#FFFFFF")
        .text(issuedDateStr, pageWidth - 280, bottomY + 18, {
          width: 200,
          align: "center",
        });
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#64748B")
        .text("Date of Issue", pageWidth - 280, doc.y + 4, {
          width: 200,
          align: "center",
        });

      // ─── Verification URL ─────────────────────────────────────────────────────
      const verifyUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/verify/${certificateId}`;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#475569")
        .text(`Verify online: ${verifyUrl}`, 0, pageHeight - 35, {
          align: "center",
        });

      // Finalize the PDF
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateCertificate };
