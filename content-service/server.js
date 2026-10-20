require("dotenv").config();

const express = require("express");
const connectDB = require("./dbconnect");
const courseRoutes = require("./routes/courses");
const lessonRoutes = require("./routes/lessons");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ service: "content-service", status: "ok" });
});

app.use("/api/courses", courseRoutes);
app.use("/api/lessons", lessonRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Invalid JSON body" });
    }
    if (err.name === "ValidationError") {
        return res.status(400).json({ message: err.message });
    }
    if (err.status === 503) {
        return res.status(503).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
});

async function start() {
    await connectDB();

    const port = process.env.PORT || 3003;
    app.listen(port, () => {
        console.log(`Content Service running on port ${port}`);
    });
}

start().catch((error) => {
    console.error("Failed to start content service:", error);
    process.exitCode = 1;
});
