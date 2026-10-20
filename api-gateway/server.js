require("dotenv").config();

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const {
    authenticateToken,
    authorizeRole
} = require("./middleware/authMiddleware");

const app = express();

// Request logging (NFR-12)
app.use((req, res, next) => {
    res.on("finish", () => {
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });
    next();
});

// CORS for the configured frontend origin only (GW-6)
const corsOrigin = process.env.CORS_ORIGIN;
app.use((req, res, next) => {
    if (corsOrigin && req.headers.origin === corsOrigin) {
        res.setHeader("Access-Control-Allow-Origin", corsOrigin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
});

app.get("/", (req, res) => {
    res.json({ message: "API Gateway is working" });
});

app.get("/health", (req, res) => {
    res.json({ service: "api-gateway", status: "ok" });
});

// Accepts FOO_URL (docker-compose) or FOO (older local .env files)
function serviceUrl(name) {
    return process.env[`${name}_URL`] || process.env[name];
}

function mountProxy(paths, serviceName, guards = []) {
    const target = serviceUrl(serviceName);

    if (!target) {
        app.use(paths, ...guards, (req, res) => {
            res.status(503).json({
                message: `${serviceName} is not configured`
            });
        });
        return;
    }

    app.use(
        paths,
        ...guards,
        createProxyMiddleware({
            target,
            changeOrigin: true,
            // app.use strips the mount path; restore it for the downstream service
            pathRewrite: (path, req) => req.originalUrl,
            on: {
                error: (err, req, res) => {
                    console.error(`Proxy error (${serviceName}):`, err.message);
                    if (res.headersSent || typeof res.status !== "function") {
                        return res.end();
                    }
                    res.status(502).json({
                        message: `${serviceName} is unavailable`
                    });
                }
            }
        })
    );
}

// Public routes (GW-4)
mountProxy("/register", "REGISTRATION_SERVICE");
mountProxy("/auth", "LOGIN_SERVICE");

// Protected routes: the gateway verifies the JWT; services verify it again (NFR-1)
const protectedRoute = [authenticateToken];
mountProxy(["/api/courses", "/api/lessons"], "CONTENT_SERVICE", protectedRoute);
mountProxy(["/api/enrollments", "/api/progress"], "LEARNING_SERVICE", protectedRoute);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`API Gateway running at http://localhost:${port}`);
});
