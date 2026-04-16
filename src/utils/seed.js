/**
 * @file seed.js
 * @description One-time database seed function.
 * Creates default admin, instructor, and Game Development category on first run.
 * Safe to call every startup — checks existence before inserting.
 */

const User = require("../models/User.model");
const Category = require("../models/Category.model");

/**
 * Seeds the database with initial data if not already present.
 * Called once during server startup after MongoDB connects.
 */
const seedDatabase = async () => {
  let seeded = false;

  // ─── Seed Admin User ─────────────────────────────────────────────────────────
  const existingAdmin = await User.findOne({ email: "admin@lms.com" });
  if (!existingAdmin) {
    await User.create({
      name: "Admin",
      email: "admin@lms.com",
      password: "admin123",
      role: "admin",
      bio: "LMS Platform Administrator",
    });
    console.log("✅ Seed: Admin user created (admin@lms.com / admin123)");
    seeded = true;
  }

  // ─── Seed Demo Instructor ─────────────────────────────────────────────────────
  const existingInstructor = await User.findOne({ email: "instructor@lms.com" });
  if (!existingInstructor) {
    await User.create({
      name: "Demo Instructor",
      email: "instructor@lms.com",
      password: "inst123",
      role: "instructor",
      bio: "Game Development Expert | Unity & Unreal Engine Specialist | 5+ years experience",
    });
    console.log("✅ Seed: Demo instructor created (instructor@lms.com / inst123)");
    seeded = true;
  }

  // ─── Seed Demo Student ────────────────────────────────────────────────────────
  const existingStudent = await User.findOne({ email: "student@lms.com" });
  if (!existingStudent) {
    await User.create({
      name: "Demo Student",
      email: "student@lms.com",
      password: "student123",
      role: "student",
      bio: "Aspiring game developer from India 🎮",
    });
    console.log("✅ Seed: Demo student created (student@lms.com / student123)");
    seeded = true;
  }

  // ─── Seed Game Development Category ──────────────────────────────────────────
  const existingCategory = await Category.findOne({ slug: "game-development" });
  if (!existingCategory) {
    await Category.create({
      name: "Game Development",
      slug: "game-development",
      icon: "🎮",
      description:
        "Unity aur Unreal Engine se game banana seekhein — Hinglish mein! 2D aur 3D games, game physics, aur pro-level game design concepts sabke liye.",
      isActive: true,
      sortOrder: 1,
      color: "#2563EB",
      subcategories: [
        "Unity Development",
        "Unreal Engine",
        "2D Game Design",
        "3D Game Design",
        "Game Physics",
        "Mobile Games",
        "VR/AR Development",
      ],
    });
    console.log("✅ Seed: Game Development category created");
    seeded = true;
  }

  // ─── Seed Additional Placeholder Categories (inactive) ────────────────────────
  const additionalCategories = [
    {
      name: "Web Development",
      slug: "web-development",
      icon: "💻",
      description: "Coming Soon — Full Stack Web Development in Hinglish",
      isActive: false,
      sortOrder: 2,
      color: "#06B6D4",
    },
    {
      name: "UI/UX Design",
      slug: "ui-ux-design",
      icon: "🎨",
      description: "Coming Soon — Design for beginners in Hinglish",
      isActive: false,
      sortOrder: 3,
      color: "#22C55E",
    },
    {
      name: "Data Science",
      slug: "data-science",
      icon: "📊",
      description: "Coming Soon — Data Science & ML in Hinglish",
      isActive: false,
      sortOrder: 4,
      color: "#F59E0B",
    },
  ];

  for (const cat of additionalCategories) {
    const exists = await Category.findOne({ slug: cat.slug });
    if (!exists) {
      await Category.create(cat);
      console.log(`✅ Seed: Category "${cat.name}" created (inactive)`);
      seeded = true;
    }
  }

  if (!seeded) {
    console.log("ℹ️ Seed: All data already exists. Skipping.");
  } else {
    console.log("🌱 Database seeding complete!");
  }
};

module.exports = seedDatabase;
