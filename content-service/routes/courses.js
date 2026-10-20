const express = require("express");
const mongoose = require("mongoose");

const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const { isEnrolled } = require("../learningClient");

const router = express.Router();
const LEVELS = Course.schema.path("level").enumValues;

router.use(authenticateToken);

function validId(req, res, name) {
    if (!mongoose.isValidObjectId(req.params[name])) {
        res.status(400).json({ message: `Invalid ${name}` });
        return false;
    }
    return true;
}

function validateCourseBody(body, partial) {
    const { title, description, level } = body;

    if (!partial && (typeof title !== "string" || !title.trim())) {
        return "Title is required";
    }
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        return "Title must be a non-empty string";
    }
    if (description !== undefined && typeof description !== "string") {
        return "Description must be a string";
    }
    if (level !== undefined && !LEVELS.includes(level)) {
        return `Level must be one of: ${LEVELS.join(", ")}`;
    }
    return null;
}

// CON-2
router.get("/", authorizeRole("student", "admin"), async (req, res) => {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json(courses);
});

router.get("/:id", authorizeRole("student", "admin"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const course = await Course.findById(req.params.id);
    if (!course) {
        return res.status(404).json({ message: "Course not found" });
    }
    res.json(course);
});

// CON-1
router.post("/", authorizeRole("admin"), async (req, res) => {
    const problem = validateCourseBody(req.body || {}, false);
    if (problem) {
        return res.status(400).json({ message: problem });
    }

    const { title, description, level } = req.body;
    const course = await Course.create({
        title,
        description,
        level,
        createdBy: String(req.user.id)
    });
    res.status(201).json(course);
});

router.put("/:id", authorizeRole("admin"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const body = req.body || {};
    const problem = validateCourseBody(body, true);
    if (problem) {
        return res.status(400).json({ message: problem });
    }

    const updates = {};
    for (const field of ["title", "description", "level"]) {
        if (body[field] !== undefined) updates[field] = body[field];
    }

    const course = await Course.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    });
    if (!course) {
        return res.status(404).json({ message: "Course not found" });
    }
    res.json(course);
});

// CON-5: deleting a course deletes its lessons
router.delete("/:id", authorizeRole("admin"), async (req, res) => {
    if (!validId(req, res, "id")) return;

    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
        return res.status(404).json({ message: "Course not found" });
    }
    await Lesson.deleteMany({ courseId: course._id });
    res.json({ message: "Course and its lessons deleted" });
});

// CON-6, CON-7
router.get("/:courseId/lessons", authorizeRole("student", "admin"), async (req, res) => {
    if (!validId(req, res, "courseId")) return;

    const course = await Course.findById(req.params.courseId);
    if (!course) {
        return res.status(404).json({ message: "Course not found" });
    }

    if (req.user.role !== "admin") {
        const enrolled = await isEnrolled(req.params.courseId, req.headers.authorization);
        if (!enrolled) {
            return res.status(403).json({ message: "Enroll in this course to read its lessons" });
        }
    }

    const lessons = await Lesson.find({ courseId: course._id }).sort({ order: 1 });
    res.json(lessons);
});

module.exports = router;
