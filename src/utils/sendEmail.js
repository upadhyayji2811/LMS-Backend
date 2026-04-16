/**
 * @file sendEmail.js
 * @description Nodemailer email utility with Gmail SMTP.
 * Sends welcome, enrollment confirmation, and live class reminder emails.
 */

const nodemailer = require("nodemailer");

// ─── Transporter Setup ────────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465", // true for port 465 (SSL)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password (not regular password)
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
};

// ─── Base Email Template ───────────────────────────────────────────────────────
const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LMS Platform</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0C0F1A; color: #94A3B8; }
    .container { max-width: 600px; margin: 0 auto; background: #111428; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #2563EB, #06B6D4); padding: 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .header span { color: rgba(255,255,255,0.8); font-size: 14px; }
    .content { padding: 32px; }
    .content h2 { color: #fff; font-size: 22px; margin-bottom: 16px; }
    .content p { color: #94A3B8; line-height: 1.6; margin-bottom: 12px; }
    .btn { display: inline-block; background: #2563EB; color: #fff !important; padding: 14px 28px;
           border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .btn:hover { background: #1d4ed8; }
    .info-box { background: #1E2A45; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .info-box p { color: #CBD5E1; margin: 4px 0; font-size: 14px; }
    .info-box strong { color: #fff; }
    .footer { background: #0C0F1A; padding: 24px; text-align: center; border-top: 1px solid #1E2A45; }
    .footer p { color: #64748B; font-size: 12px; }
    .badge { display: inline-block; background: #06B6D4; color: #fff; padding: 4px 12px;
             border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div style="padding: 20px;">
    <div class="container">
      <div class="header">
        <h1>🎮 LMS Platform</h1>
        <span>India's Premier Game Dev Learning Platform</span>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} LMS Platform. All rights reserved.</p>
        <p style="margin-top: 8px;">India's #1 Game Development Learning Platform in Hinglish 🇮🇳</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ─── Email Sender Function ────────────────────────────────────────────────────
/**
 * Core send email function.
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML body
 * @returns {Promise<Object>} Nodemailer send result
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = createTransporter();

    // Verify transporter connection in development
    if (process.env.NODE_ENV === "development") {
      await transporter.verify();
    }

    const mailOptions = {
      from: `"LMS Platform 🎮" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error(`❌ Email send error to ${to}:`, error.message);
    // Don't throw — email failure shouldn't break main flow
    return null;
  }
};

// ─── Email Templates ──────────────────────────────────────────────────────────

/**
 * Send welcome email to new user after registration.
 * @param {Object} user - User object { name, email, role }
 */
const sendWelcomeEmail = async (user) => {
  const dashboardUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/dashboard`;

  const html = baseTemplate(`
    <div class="badge">Welcome to LMS! 🎉</div>
    <h2>Namaste, ${user.name}! 👋</h2>
    <p>LMS Platform pe aapka swagat hai! India ka #1 Game Development learning platform.</p>
    <p>Aapka account successfully create ho gaya hai. Ab aap apni learning journey shuru kar sakte hain!</p>
    
    <div class="info-box">
      <p><strong>Account Details:</strong></p>
      <p>📧 Email: <strong>${user.email}</strong></p>
      <p>👤 Role: <strong>${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</strong></p>
      <p>📅 Joined: <strong>${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</strong></p>
    </div>

    <p>Kya aap shuru karen? Humare Game Development courses dekhen — Unity se Unreal Engine tak, sab kuch Hinglish mein!</p>
    
    <a href="${dashboardUrl}" class="btn">Dashboard Kholein 🚀</a>
    
    <p style="margin-top: 24px; font-size: 13px;">Koi sawaal ho toh reply karein. Hum aapke saath hain! 💙</p>
  `);

  await sendEmail({
    to: user.email,
    subject: "🎮 LMS Platform pe Swagat Hai! | Welcome to LMS",
    html,
  });
};

/**
 * Send enrollment confirmation email to student.
 * @param {Object} user - User object { name, email }
 * @param {Object} course - Course object { title, instructor: { name }, price }
 */
const sendEnrollmentConfirmation = async (user, course) => {
  const courseUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/courses/learn/${course._id}`;
  const instructorName =
    course.instructor?.name || "LMS Instructor";

  const html = baseTemplate(`
    <div class="badge">Enrollment Confirmed ✅</div>
    <h2>Badhai Ho! Aap Enroll Ho Gaye! 🎓</h2>
    <p>Congratulations, <strong style="color: #fff;">${user.name}</strong>! Aapne successfully course purchase kar liya hai.</p>

    <div class="info-box">
      <p><strong>Course Details:</strong></p>
      <p>📚 Course: <strong>${course.title}</strong></p>
      <p>👨‍🏫 Instructor: <strong>${instructorName}</strong></p>
      <p>💰 Amount Paid: <strong>₹${course.price}</strong></p>
      <p>📅 Enrolled On: <strong>${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</strong></p>
      <p>🔤 Language: <strong>${course.language || "Hinglish"}</strong></p>
    </div>

    <p>Ab aap iss course ke saare lessons access kar sakte hain. Apni learning streak maintain karein aur certificate haasil karein!</p>
    
    <a href="${courseUrl}" class="btn">Course Shuru Karein ▶️</a>
    
    <p style="margin-top: 24px; font-size: 13px; color: #64748B;">
      💡 Tip: Roz thoda thoda padhein. Consistency is the key to success!
    </p>
  `);

  await sendEmail({
    to: user.email,
    subject: `✅ Course Enrollment Confirmed: ${course.title}`,
    html,
  });
};

/**
 * Send live class reminder email to a student.
 * @param {Object} user - User object { name, email }
 * @param {Object} liveClass - LiveClass { title, topic, scheduledAt, duration, meetLink, instructor }
 */
const sendLiveClassReminder = async (user, liveClass) => {
  const scheduledDate = new Date(liveClass.scheduledAt);
  const dateStr = scheduledDate.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = scheduledDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  const instructorName =
    liveClass.instructor?.name || "LMS Instructor";

  const html = baseTemplate(`
    <div class="badge">🔴 Live Class Reminder</div>
    <h2>Aaj Live Class Hai! ${liveClass.title}</h2>
    <p>Namaste <strong style="color: #fff;">${user.name}</strong>! Aapki live class 30 minute mein shuru hone wali hai. Taiyaar ho jaiye!</p>

    <div class="info-box">
      <p><strong>Class Details:</strong></p>
      <p>📌 Topic: <strong>${liveClass.topic}</strong></p>
      <p>👨‍🏫 Instructor: <strong>${instructorName}</strong></p>
      <p>📅 Date: <strong>${dateStr}</strong></p>
      <p>⏰ Time: <strong>${timeStr} IST</strong></p>
      <p>⏱ Duration: <strong>${liveClass.duration} minutes</strong></p>
    </div>

    <p>YouTube Live pe join karein:</p>
    <a href="${liveClass.meetLink}" class="btn" style="background: #EF4444;">🔴 Live Class Join Karein</a>
    
    <p style="margin-top: 24px; font-size: 13px; color: #64748B;">
      ⚡ 5-10 minutes pehle join karein taaki connection check ho sake.<br/>
      📝 Notebook aur pen ready rakhein!
    </p>
  `);

  await sendEmail({
    to: user.email,
    subject: `🔴 Live Class Reminder: ${liveClass.title} — Aaj ${timeStr} IST`,
    html,
  });
};

/**
 * Send certificate issued email.
 * @param {Object} user - User object { name, email }
 * @param {Object} certificate - Certificate { certificateId, courseName, pdfUrl }
 */
const sendCertificateEmail = async (user, certificate) => {
  const verifyUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/verify/${certificate.certificateId}`;

  const html = baseTemplate(`
    <div class="badge">🏆 Certificate Issued!</div>
    <h2>Mubarak Ho! Aapka Certificate Taiyaar Hai! 🎉</h2>
    <p>Namaste <strong style="color: #fff;">${user.name}</strong>! Aapne course successfully complete kar liya. Bahut badhiya!</p>

    <div class="info-box">
      <p><strong>Certificate Details:</strong></p>
      <p>📚 Course: <strong>${certificate.courseName}</strong></p>
      <p>🆔 Certificate ID: <strong>${certificate.certificateId}</strong></p>
      <p>📅 Issued On: <strong>${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</strong></p>
    </div>

    <p>Apna certificate download karein aur apne LinkedIn profile pe share karein!</p>
    
    ${certificate.pdfUrl ? `<a href="${certificate.pdfUrl}" class="btn">📥 Certificate Download Karein</a>` : ""}
    <a href="${verifyUrl}" class="btn" style="background: #22C55E; margin-left: 12px;">✅ Verify Certificate</a>
    
    <p style="margin-top: 24px; font-size: 13px; color: #64748B;">
      🌟 Apni achievement celebrate karein! Next course ke liye ready ho jayein!
    </p>
  `);

  await sendEmail({
    to: user.email,
    subject: `🏆 Certificate Issued: ${certificate.courseName}`,
    html,
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendEnrollmentConfirmation,
  sendLiveClassReminder,
  sendCertificateEmail,
};
