const express = require("express");
const mongoose = require("mongoose");

const Enrollment = require("../models/Enrollment");
const Progress = require("../models/Progress");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const { callContent } = require("../contentClient");

const router = express.Router();

router.use(authenticateToken);

function validId(req, res, name) {
    if (!mongoose.isValidObjectId(req.params[name])) {
        res.status(400).json({ message: `Invalid ${name}` });
        return false;
    }
    return true;
}

// LRN-1, LRN-2
router.post("/", authorizeRole("student"), async (req, res) => {
    const { courseId } = req.body || {};

    if (!mongoose.isValidObjectId(courseId)) {
        return res.status(400).json({ message: "A valid courseId is required" });
    }

    const { status } = await callContent(`/api/courses/${courseId}`, req.headers.authorization);
    if (status === 404) {
        return res.status(404).json({ message: "Course not found" });
    }
    if (status !== 200) {
        return res.status(502).json({ message: "Could not verify the course" });
    }

    try {
        const enrollment = await Enrollment.create({
            studentId: String(req.user.id),
            courseId: String(courseId)
        });
        res.status(201).json(enrollment);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "Already enrolled in this course" });
        }
        throw error;
    }
});

// LRN-3: enrolled courses with course details
router.get("/my-courses", authorizeRole("student"), async (req, res) => {
    const enrollments = await Enrollment.find({ studentId: String(req.user.id) }).sort({ enrolledAt: -1 });

    const result = await Promise.all(
        enrollments.map(async (enrollment) => {
            const { status, body } = await callContent(
                `/api/courses/${enrollment.courseId}`,
                req.headers.authorization
            );
            return {
                enrollmentId: enrollment._id,
                courseId: enrollment.courseId,
                enrolledAt: enrollment.enrolledAt,
                course: status === 200 ? body : null
            };
        })
    );

    res.json(result);
});

// Used by the Content Service to authorise lesson access (CON-7)
router.get("/check/:courseId", authorizeRole("student"), async (req, res) => {
    if (!validId(req, res, "courseId")) return;

    const enrolled = await Enrollment.exists({
        studentId: String(req.user.id),
        courseId: req.params.courseId
    });
    res.json({ enrolled: Boolean(enrolled) });
});

// LRN-5
router.get("/course/:courseId", authorizeRole("admin"), async (req, res) => {
    if (!validId(req, res, "courseId")) return;

    const enrollments = await Enrollment.find({ courseId: req.params.courseId }).sort({ enrolledAt: -1 });
    res.json(enrollments);
});

router.get("/", authorizeRole("admin"), async (req, res) => {
    const enrollments = await Enrollment.find().sort({ enrolledAt: -1 });
    res.json(enrollments);
});

// LRN-4: leaving a course also deletes the student's progress in it
router.delete("/:id", authorizeRole("student"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const enrollment = await Enrollment.findOneAndDelete({
        _id: req.params.id,
        studentId: String(req.user.id)
    });
    if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
    }

    await Progress.deleteMany({
        studentId: enrollment.studentId,
        courseId: enrollment.courseId
    });
    res.json({ message: "Left the course and removed its progress" });
});

module.exports = router;
