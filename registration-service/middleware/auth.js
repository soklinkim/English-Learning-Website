const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Access denied. No token provided."
        });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json({
            message: "Invalid authorization format"
        });
    }

    const token = parts[1];

    try {

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {

        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                message: "Token has expired"
            });
        }

        return res.status(401).json({
            message: "Invalid token"
        });
    }
};

// "student" matches the stored role value "user"
const ROLE_ALIASES = { student: ["student", "user"] };

const authorizeRole = (...roles) => {
    const allowed = roles.flatMap((r) => ROLE_ALIASES[r] || [r]);

    return (req, res, next) => {

        if (!req.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        if (!allowed.includes(req.user.role)) {
            return res.status(403).json({
                message: "Access forbidden for this role"
            });
        }

        next();
    };
};

module.exports = {
    authenticateToken,
    authorizeRole
};