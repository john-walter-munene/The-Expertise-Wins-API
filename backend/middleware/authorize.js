// backend/middleware/authorize.js
//
// Role based access control for the API. `authenticate` is the guaranteed
// entry guard for a protected router: it runs passport, and if passport ever
// lets a request through without a resolved user it fails the request itself
// (401) instead of handing an undefined `req.user` to the route.

const { authenticateJWT } = require("./authentication");

// Roles recognised by prisma/schema.prisma (UserRole)
const ROLE_NAMES = ["USER", "ADMIN", "TIPSTER", "EDITOR"];

const getRequestUserId = (req) => (req.user && typeof req.user === "object" ? req.user.id : undefined);

const authenticate = (req, res, next) =>
  authenticateJWT(req, res, (error) => {
    if (error) return next(error);
    // Guarantee an authenticated principal: every downstream handler and the
    // usage tracker can rely on req.user being present.
    if (!req.user || !getRequestUserId(req)) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (req.user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "Active account required." });
    }
    return next();
  });

// Generic role gate: `requireRole("admin")` or `requireRole("ADMIN", "EDITOR")`
const requireRole = (...roles) => {
  const allowed = roles
    .flat()
    .map((role) => String(role || "").trim().toUpperCase())
    .filter(Boolean);

  if (allowed.length === 0 || allowed.some((role) => !ROLE_NAMES.includes(role))) {
    throw new TypeError(`requireRole() received an unknown role. Use one of: ${ROLE_NAMES.join(", ")}.`);
  }

  return (req, res, next) => {
    if (!req.user || !getRequestUserId(req)) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (req.user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "Active account required." });
    }
    if (!allowed.includes(String(req.user.role || "").toUpperCase())) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    next();
  };
};

// Backwards compatible admin guard used by the existing routers
const authorizeAdmin = requireRole("admin");

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.requireRole = requireRole;
module.exports.authorizeAdmin = authorizeAdmin;
