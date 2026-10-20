require("dotenv").config();

const os = require("os");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const {
    authenticateToken,
    authorizeRole
} = require("./middleware/authMiddleware");

const app = express();

// Number of reverse proxies in front of the gateway (Nginx = 1), so the real client IP is used
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));

// Security headers (HRD-10)
app.use(helmet());

// Shows which gateway copy answered, so load balancing can be seen in a response header
app.use((req, res, next) => {
    res.setHeader("X-Served-By", os.hostname());
    next();
});

// Structured request logs, one JSON line per request (NFR-12, HRD-9)
app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
        console.log(JSON.stringify({
            time: new Date().toISOString(),
            service: "api-gateway",
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            ms: Number(process.hrtime.bigint() - start) / 1e6,
            ip: req.ip
        }));
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
    res.json({ message: "API Gateway is working", servedBy: os.hostname() });
});

app.get("/health", (req, res) => {
    res.json({ service: "api-gateway", status: "ok" });
});

// Rate limits per client IP (HRD-3). Counters are kept per gateway copy.
function limiter(windowMinutes, max, message) {
    return rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit: max,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { message }
    });
}

const loginLimit = limiter(
    15,
    Number(process.env.RATE_LIMIT_LOGIN || 20),
    "Too many login attempts. Try again later."
);
const registerLimit = limiter(
    60,
    Number(process.env.RATE_LIMIT_REGISTER || 10),
    "Too many registration attempts. Try again later."
);

app.post("/auth/login", loginLimit);
app.post("/register/userregister", registerLimit);

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

// Public routes (GW-4), except admin creation which needs an admin token (HRD-2)
mountProxy("/register/adminregister", "REGISTRATION_SERVICE", [
    authenticateToken,
    authorizeRole("admin")
]);
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
