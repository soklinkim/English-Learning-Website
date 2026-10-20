require("dotenv").config();

const express = require("express");
const connectDB = require("./dbconnect");
const loginRoutes = require("./loginRoutes");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ service: "login-service", status: "ok" });
});

app.use("/auth", loginRoutes);

async function start() {
    await connectDB();

    const port = process.env.PORT || 3002;
    app.listen(port, () => {
        console.log(`Login Service running on port ${port}`);
    });
}

start().catch((error) => {
    console.error("Failed to start login service:", error);
    process.exitCode = 1;
});
