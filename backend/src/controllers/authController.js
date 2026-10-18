
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Hospital = require("../models/Hospital");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      sub: user._id.toString(),
      hospitalId: user.hospitalId.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

function sendAuthResponse(res, user, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    token: createToken(user),
    user: user.toSafeObject(),
  });
}

// POST /api/auth/register
// Creates a hospital and its first Hospital Admin.

const registerHospitalAdmin = asyncHandler(async (req, res) => {

  // JWT secret configuration check
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "JWT_SECRET is not configured",
    });
  }

  const { hospitalName, hospitalCode, address, name, email, password } =
    req.body;


  if (
    !hospitalName ||
    !hospitalCode ||
    !name ||
    !email ||
    !password
  ) {
    return res.status(400).json({
      success: false,
      message:
        "hospitalName, hospitalCode, name, email and password are required",
    });
  }

  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters long",
    });
  }

  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = String(hospitalCode).trim().toUpperCase();

  const [existingUser, existingHospital] = await Promise.all([
    User.findOne({ email: normalizedEmail }).lean(),
    Hospital.findOne({ code: normalizedCode }).lean(),
  ]);

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "An account with this email already exists",
    });
  }

  if (existingHospital) {
    return res.status(409).json({
      success: false,
      message: "This hospital code is already registered",
    });
  }

  // If user creation fails, remove the hospital created in this request.
  // This avoids leaving an empty hospital for common registration failures.
  let hospital;

  try {
    hospital = await Hospital.create({
      name: hospitalName.trim(),
      code: normalizedCode,
      address: typeof address === "string" ? address.trim() : "",
    });

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: "HOSPITAL_ADMIN",
      hospitalId: hospital._id,
    });

    return sendAuthResponse(res, user, 201);
  } catch (error) {
    if (hospital?._id) {
      await Hospital.deleteOne({ _id: hospital._id }).catch(() => {});
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email or hospital code is already registered",
      });
    }

    throw error;
  }
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const user = await User.findOne({
    email: email.trim().toLowerCase(),
  }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: "This account has been deactivated",
    });
  }

  const hospital = await Hospital.findById(user.hospitalId).select("status");

  if (!hospital || hospital.status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "This hospital account is not active",
    });
  }

  return sendAuthResponse(res, user);
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .select("-password")
    .populate("hospitalId", "name code status");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User account not found",
    });
  }

  return res.status(200).json({
    success: true,
    user,
  });
});

module.exports = {
  registerHospitalAdmin,
  login,
  getMe,
};
