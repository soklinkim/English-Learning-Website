// Creates (or promotes) the first admin account.
// Usage (from registration-service):
//   $env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="admin12345"; node seedAdmin.js
require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("./dbconnect");
const User = require("./models/User");

async function seed() {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "";

    if (!email || password.length < 6) {
        throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 6 characters)");
    }

    await connectDB();

    const existing = await User.findOne({ email });
    if (existing) {
        existing.role = "admin";
        await existing.save();
        console.log(`Existing user ${email} is now an admin (password unchanged)`);
    } else {
        await User.create({
            name: process.env.ADMIN_NAME || "Admin",
            email,
            password: await bcrypt.hash(password, 10),
            role: "admin",
            phone: process.env.ADMIN_PHONE || "0000000000"
        });
        console.log(`Admin ${email} created`);
    }

    await mongoose.disconnect();
}

seed().catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
});
