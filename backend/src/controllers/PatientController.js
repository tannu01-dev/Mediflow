
const crypto = require("crypto");
const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const Hospital = require("../models/Hospital");
const asyncHandler = require("../utils/asyncHandler");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function generateMRN(hospitalCode) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `${hospitalCode}-${date}-${suffix}`;
}

// POST /api/patients
const createPatient = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    dateOfBirth,
    sex,
    phone,
    email,
    address,
    bloodGroup,
    allergies,
    emergencyContact,
  } = req.body;

  if (
    typeof firstName !== "string" ||
    !firstName.trim() ||
    typeof dateOfBirth !== "string" ||
    typeof phone !== "string" ||
    !phone.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "First name, date of birth and phone are required",
    });
  }

  const dob = new Date(dateOfBirth);

  if (
    Number.isNaN(dob.getTime()) ||
    dob.toISOString().slice(0, 10) !== dateOfBirth ||
    dob > new Date()
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid date of birth in YYYY-MM-DD format",
    });
  }

  if (email && (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address",
    });
  }

  if (allergies !== undefined && (
    !Array.isArray(allergies) ||
    allergies.length > 50 ||
    allergies.some((item) => typeof item !== "string" || item.length > 100)
  )) {
    return res.status(400).json({
      success: false,
      message: "Allergies must be a list of up to 50 text values",
    });
  }

  const hospital = await Hospital.findById(req.user.hospitalId)
    .select("code status")
    .lean();

  if (!hospital || hospital.status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "Your hospital is not active",
    });
  }

  try {
    const patient = await Patient.create({
      mrn: generateMRN(hospital.code),
      hospitalId: req.user.hospitalId,
      firstName: firstName.trim(),
      lastName: typeof lastName === "string" ? lastName.trim() : "",
      dateOfBirth: dob,
      sex: sex || "UNKNOWN",
      phone: phone.trim(),
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      address: typeof address === "string" ? address.trim() : "",
      bloodGroup: bloodGroup || "UNKNOWN",
      allergies: allergies || [],
      emergencyContact: emergencyContact || {},
      createdBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully",
      patient,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "MRN conflict. Please try registering again.",
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    throw error;
  }
});

// GET /api/patients?page=1&limit=20&search=...
const getPatients = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );

  const filter = {
    hospitalId: req.user.hospitalId,
  };

  if (req.query.search) {
    const search = String(req.query.search).trim().slice(0, 100);
    const pattern = escapeRegex(search);

    if (pattern) {
      filter.$or = [
        { mrn: { $regex: pattern, $options: "i" } },
        { firstName: { $regex: pattern, $options: "i" } },
        { lastName: { $regex: pattern, $options: "i" } },
        { phone: { $regex: pattern, $options: "i" } },
      ];
    }
  }

  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .select("-__v")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Patient.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    patients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/patients/:id
const getPatientById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid patient ID",
    });
  }

  // Hospital scope is mandatory: never query by patient ID alone.
  const patient = await Patient.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  })
    .select("-__v")
    .lean();

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Patient not found in your hospital",
    });
  }

  return res.status(200).json({
    success: true,
    patient,
  });
});

module.exports = {
  createPatient,
  getPatients,
  getPatientById,
};
