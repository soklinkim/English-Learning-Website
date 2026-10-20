const express = require("express");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const { authenticateToken, authorizeRole } = require("./middleware/auth");

const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;

// Builds a handler that creates an account with a fixed role.
// The role is never read from the request body.
function register(role) {
    return async (req, res) => {
        try {
            const {
                name,
                email,
                password,
                phone
            } = req.body || {};

            if (
                typeof name !== "string" || typeof email !== "string" ||
                typeof password !== "string" || !name.trim() || !email || !password || !phone
            ) {
                return res.status(400).json({
                    message: "Name, email, password and phone are required"
                });
            }

            const cleanEmail = email.trim().toLowerCase();

            if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
                return res.status(400).json({
                    message: "Invalid email format"
                });
            }

            if (password.length < MIN_PASSWORD_LENGTH) {
                return res.status(400).json({
                    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
                });
            }

            const existingUser = await User.findOne({
                email: cleanEmail
            });

            if (existingUser) {
                return res.status(409).json({
                    message: "Email is already registered"
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = await User.create({
                name,
                email: cleanEmail,
                password: hashedPassword,
                role,
                phone
            });

            res.status(201).json({
                message: "User registered successfully",
                user: {
                    id: newUser._id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role,
                    phone: newUser.phone
                }
            });

        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "Email is already registered"
                });
            }

            console.error(error);

            res.status(500).json({
                message: "Server error"
            });
        }
    };
}

// Public: anyone can register, always as a student
router.post("/userregister", register("user"));

// Admin only: an existing admin creates another admin (HRD-2)
router.post("/adminregister", authenticateToken, authorizeRole("admin"), register("admin"));

module.exports = router;
