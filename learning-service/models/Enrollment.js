const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    courseId: { type: String, required: true },
    enrolledAt: { type: Date, default: Date.now }
});

// NFR-8: one enrollment per student and course
enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

enrollmentSchema.index({ courseId: 1 });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
