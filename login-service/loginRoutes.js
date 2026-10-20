const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./models/User");

const router = express.Router();

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

router.post("/login", async (req, res) => {
    try {
        const {
            email,
            password,
            role
        } = req.body;

        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        // Compare against a dummy hash for unknown emails so timing doesn't reveal them
        const passwordMatch = await bcrypt.compare(
            password,
            user ? user.password : DUMMY_HASH
        );

        // Same 401 for unknown email, wrong password or mismatched role (LOG-3).
        // The role is optional and, if sent, must match the stored one.
        if (!user || !passwordMatch || (role && user.role !== role)) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Generate JWT
        const token = jwt.sign(
            {
                id: user._id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        res.status(200).json({
            message: "Login successful",
            token
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

module.exports = router;