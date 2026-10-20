const mongoose = require("mongoose");

const progressSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    courseId: { type: String, required: true },
    lessonId: { type: String, required: true },
    completed: { type: Boolean, default: true },
    completedAt: { type: Date, default: Date.now }
});

// NFR-8: one completion record per student and lesson
progressSchema.index({ studentId: 1, lessonId: 1 }, { unique: true });
progressSchema.index({ studentId: 1, courseId: 1 });

module.exports = mongoose.model("Progress", progressSchema);
