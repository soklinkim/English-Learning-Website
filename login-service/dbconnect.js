const mongoose = require("mongoose");

async function connectDB() {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        throw new Error("MONGO_URI is not configured");
    }

    const options = process.env.MONGO_DB_NAME
        ? { dbName: process.env.MONGO_DB_NAME }
        : {};

    await mongoose.connect(uri, options);
    console.log("Connected to MongoDB");
}

module.exports = connectDB;
