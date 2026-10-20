const express = require("express");
const bcrypt = require("bcryptjs");

const User = require("./models/User");

const router = express.Router();

router.post("/userregister", async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone
        } = req.body;

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

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
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
            role: "user",
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
});

module.exports = router;