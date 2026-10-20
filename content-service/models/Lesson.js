const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema(
    {
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
        title: { type: String, required: true, trim: true },
        content: { type: String, default: "" },
        order: { type: Number, required: true, min: 0 }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Lesson", lessonSchema);
