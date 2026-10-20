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

// LRN-8: completed lessons and completion percentage for one course
async function courseProgress(studentId, courseId, authorization) {
    const { status, body } = await callContent(`/api/courses/${courseId}/lessons`, authorization);
    const lessonIds = status === 200 ? body.map((lesson) => String(lesson._id)) : [];

    const records = await Progress.find({ studentId, courseId, completed: true });
    const completedLessons = records
        .map((record) => record.lessonId)
        .filter((lessonId) => lessonIds.includes(lessonId));

    const totalLessons = lessonIds.length;
    return {
        courseId,
        totalLessons,
        completedCount: completedLessons.length,
        completedLessons,
        percentage: totalLessons ? Math.round((completedLessons.length / totalLessons) * 100) : 0
    };
}

async function allProgress(studentId, authorization) {
    const enrollments = await Enrollment.find({ studentId });
    return Promise.all(
        enrollments.map((enrollment) => courseProgress(studentId, enrollment.courseId, authorization))
    );
}

// LRN-6, LRN-7
router.post("/", authorizeRole("student"), async (req, res) => {
    const { courseId, lessonId } = req.body || {};

    if (!mongoose.isValidObjectId(courseId) || !mongoose.isValidObjectId(lessonId)) {
        return res.status(400).json({ message: "Valid courseId and lessonId are required" });
    }

    const studentId = String(req.user.id);

    const enrolled = await Enrollment.exists({ studentId, courseId });
    if (!enrolled) {
        return res.status(403).json({ message: "Enroll in this course first" });
    }

    const { status, body } = await callContent(`/api/lessons/${lessonId}`, req.headers.authorization);
    if (status === 404) {
        return res.status(404).json({ message: "Lesson not found" });
    }
    if (status !== 200) {
        return res.status(502).json({ message: "Could not verify the lesson" });
    }
    if (String(body.courseId) !== String(courseId)) {
        return res.status(400).json({ message: "Lesson does not belong to this course" });
    }

    // Upsert keeps repeated completions to a single record
    const record = await Progress.findOneAndUpdate(
        { studentId, lessonId },
        { $setOnInsert: { courseId, completed: true, completedAt: new Date() } },
        { upsert: true, new: true }
    );
    res.status(201).json(record);
});

router.get("/my-progress", authorizeRole("student"), async (req, res) => {
    res.json(await allProgress(String(req.user.id), req.headers.authorization));
});

router.get("/course/:courseId", authorizeRole("student"), async (req, res) => {
    if (!validId(req, res, "courseId")) return;

    const studentId = String(req.user.id);
    const enrolled = await Enrollment.exists({ studentId, courseId: req.params.courseId });
    if (!enrolled) {
        return res.status(403).json({ message: "Not enrolled in this course" });
    }

    res.json(await courseProgress(studentId, req.params.courseId, req.headers.authorization));
});

// LRN-9
router.get("/student/:studentId", authorizeRole("admin"), async (req, res) => {
    if (!validId(req, res, "studentId")) return;

    res.json(await allProgress(req.params.studentId, req.headers.authorization));
});

module.exports = router;
