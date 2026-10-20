require("dotenv").config();

const express = require("express");
const connectDB = require("./dbconnect");

const registerRoutes = require("./registerRoutes");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ service: "registration-service", status: "ok" });
});

app.use("/register", registerRoutes);

async function start() {
    await connectDB();

    const port = process.env.PORT || 3001;
    app.listen(port, () => {
        console.log(`Registration Service running on port ${port}`);
    });
}

start().catch((error) => {
    console.error("Failed to start registration service:", error);
    process.exitCode = 1;
});