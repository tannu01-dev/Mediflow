
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const asyncHandler = require("../utils/asyncHandler");
const { roleIsAllowed } = require("../utils/securityConfig");

const protect = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "Authentication is not configured",
    });
  }

  const token = authorization.slice(7).trim();

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  const user = await User.findById(decoded.sub).select(
    "name email role hospitalId department phone shift duty isActive"
  );

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      message: "User account is unavailable",
    });
  }

  // Verify the token's hospital association against the database.
  if (!user.hospitalId || typeof decoded.hospitalId !== "string" || user.hospitalId.toString() !== decoded.hospitalId) {
    return res.status(401).json({
      success: false,
      message: "Invalid hospital association in token",
    });
  }

  const hospital = await Hospital.findById(user.hospitalId).select("status");

  if (!hospital || hospital.status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "Hospital is inactive",
    });
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    hospitalId: user.hospitalId.toString(),
    department: user.department,
    phone: user.phone || "",
    shift: user.shift || "NOT_ASSIGNED",
    duty: user.duty || "",
  };

  next();
});

function authorize(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!roleIsAllowed(req.user.role, allowedRoles)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
}

module.exports = { protect, authorize };
