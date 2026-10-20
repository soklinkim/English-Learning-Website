const express = require("express");
const mongoose = require("mongoose");

const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const { isEnrolled } = require("../learningClient");

const router = express.Router();

router.use(authenticateToken);

function validId(req, res, name) {
    if (!mongoose.isValidObjectId(req.params[name])) {
        res.status(400).json({ message: `Invalid ${name}` });
        return false;
    }
    return true;
}

function validateLessonBody(body, partial) {
    const { title, content, order } = body;

    if (!partial && (typeof title !== "string" || !title.trim())) {
        return "Title is required";
    }
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        return "Title must be a non-empty string";
    }
    if (content !== undefined && typeof content !== "string") {
        return "Content must be a string";
    }
    if (!partial && order === undefined) {
        return "Order is required";
    }
    if (order !== undefined && (!Number.isInteger(order) || order < 0)) {
        return "Order must be a non-negative integer";
    }
    return null;
}

// CON-3, CON-4
router.post("/", authorizeRole("admin"), async (req, res) => {
    const body = req.body || {};

    if (!mongoose.isValidObjectId(body.courseId)) {
        return res.status(400).json({ message: "A valid courseId is required" });
    }

    const problem = validateLessonBody(body, false);
    if (problem) {
        return res.status(400).json({ message: problem });
    }

    if (!(await Course.exists({ _id: body.courseId }))) {
        return res.status(404).json({ message: "Course not found" });
    }

    const { courseId, title, content, order } = body;
    const lesson = await Lesson.create({ courseId, title, content, order });
    res.status(201).json(lesson);
});

// CON-7
router.get("/:id", authorizeRole("student", "admin"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
    }

    if (req.user.role !== "admin") {
        const enrolled = await isEnrolled(String(lesson.courseId), req.headers.authorization);
        if (!enrolled) {
            return res.status(403).json({ message: "Enroll in this course to read its lessons" });
        }
    }

    res.json(lesson);
});

router.put("/:id", authorizeRole("admin"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const body = req.body || {};
    const problem = validateLessonBody(body, true);
    if (problem) {
        return res.status(400).json({ message: problem });
    }

    const updates = {};
    for (const field of ["title", "content", "order"]) {
        if (body[field] !== undefined) updates[field] = body[field];
    }

    const lesson = await Lesson.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    });
    if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
    }
    res.json(lesson);
});

router.delete("/:id", authorizeRole("admin"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const lesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
    }
    res.json({ message: "Lesson deleted" });
});

module.exports = router;
