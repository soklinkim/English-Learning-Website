const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./models/User");

const router = express.Router();

const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS || 5);
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 15);

const DUMMY_HASH =bcrypt.hashSync("not-a-real-password", 10);

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

        // Temporary lock after repeated failures (HRD-4)
        if (user && user.lockUntil && user.lockUntil > new Date()) {
            return res.status(429).json({
                message: "Too many failed attempts. Try again later."
            });
        }

        // Compare against a dummy hash for unknown emails so timing doesn't reveal them
        const passwordMatch = await bcrypt.compare(
            password,
            user ? user.password : DUMMY_HASH
        );

        // Same 401 for unknown email, wrong password or mismatched role (LOG-3).
        // The role is optional and, if sent, must match the stored one.
        if (!user || !passwordMatch || (role && user.role !== role)) {
            if (user) {
                const updated = await User.findByIdAndUpdate(
                    user._id,
                    { $inc: { failedLoginAttempts: 1 } },
                    { new: true }
                );

                if (updated.failedLoginAttempts >= MAX_FAILED_LOGINS) {
                    await User.updateOne(
                        { _id: user._id },
                        {
                            $set: {
                                failedLoginAttempts: 0,
                                lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
                            }
                        }
                    );
                }
            }

            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        if (user.failedLoginAttempts || user.lockUntil) {
            await User.updateOne(
                { _id: user._id },
                { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: "" } }
            );
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