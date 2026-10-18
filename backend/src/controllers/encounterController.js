
const mongoose = require("mongoose");
const Encounter = require("../models/Encounter");
const Patient = require("../models/Patient");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const asyncHandler = require("../utils/asyncHandler");
const { notifyUsers } = require("../services/notificationService");

const TRIAGE_PRIORITY = {
  RESUSCITATION: 1,
  EMERGENCY: 2,
  URGENT: 3,
  LESS_URGENT: 4,
  NON_URGENT: 5,
  UNTRIAGED: 6,
};

const ACTIVE_STATUSES = [
  "WAITING",
  "IN_TRIAGE",
  "WAITING_FOR_DOCTOR",
  "IN_TREATMENT",
  "ADMITTED",
];

async function safeNotify(options) {
  try {
    await notifyUsers(options);
  } catch (error) {
    // A notification failure must not fail the clinical operation.
    console.error("Encounter notification failed:", error.message);
  }
}

function makeEncounterNumber(hospitalCode) {
  const date = new Date();
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");

  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${hospitalCode}-ENC-${datePart}-${randomPart}`;
}

function validateVitals(vitals) {
  if (!vitals || typeof vitals !== "object") {
    return "Vitals must be an object";
  }

  const limits = {
    temperatureC: [25, 45],
    pulseBpm: [0, 300],
    respiratoryRate: [0, 100],
    systolicBP: [0, 350],
    diastolicBP: [0, 250],
    oxygenSaturation: [0, 100],
    weightKg: [0, 500],
    heightCm: [0, 300],
  };

  for (const [field, value] of Object.entries(vitals)) {
    if (value === undefined || value === null || value === "") continue;

    if (!Object.prototype.hasOwnProperty.call(limits, field)) {
      return `Unknown vital sign field: ${field}`;
    }

    const number = Number(value);
    const [min, max] = limits[field];

    if (!Number.isFinite(number) || number < min || number > max) {
      return `Invalid value for ${field}`;
    }
  }

  return null;
}

function buildVitals(vitals = {}) {
  const allowedFields = [
    "temperatureC",
    "pulseBpm",
    "respiratoryRate",
    "systolicBP",
    "diastolicBP",
    "oxygenSaturation",
    "weightKg",
    "heightCm",
  ];

  const result = {};

  for (const field of allowedFields) {
    if (vitals[field] !== undefined && vitals[field] !== null && vitals[field] !== "") {
      result[field] = Number(vitals[field]);
    }
  }

  return result;
}


const getAvailableDoctors = asyncHandler(async (req, res) => {
  const doctors = await User.find({
    hospitalId: req.user.hospitalId,
    role: "DOCTOR",
    isActive: true,
  }).select("_id name email department shift").sort({ name: 1 }).lean();

  return res.json({ success: true, count: doctors.length, doctors });
});

const createEncounter = asyncHandler(async (req, res) => {
  const { patientId, chiefComplaint, type, triageNotes, vitals } = req.body;

  if (!patientId || !mongoose.isValidObjectId(patientId)) {
    return res.status(400).json({
      success: false,
      message: "A valid patientId is required",
    });
  }

  if (!chiefComplaint || !chiefComplaint.trim()) {
    return res.status(400).json({
      success: false,
      message: "Chief complaint is required",
    });
  }

  if (chiefComplaint.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Chief complaint cannot exceed 2000 characters",
    });
  }

  const allowedTypes = ["EMERGENCY", "OUTPATIENT", "INPATIENT"];

  if (type && !allowedTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid encounter type",
    });
  }

  const vitalsError = validateVitals(vitals || {});
  if (vitalsError) {
    return res.status(400).json({
      success: false,
      message: vitalsError,
    });
  }

  const [patient, hospital] = await Promise.all([
    Patient.findOne({
      _id: patientId,
      hospitalId: req.user.hospitalId,
      status: { $ne: "INACTIVE" },
    }),
    Hospital.findById(req.user.hospitalId).select("code status"),
  ]);

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Patient not found in your hospital",
    });
  }

  if (!hospital || hospital.status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "Hospital is inactive",
    });
  }

  let encounter;
  let lastError;

  // Retry if the generated encounter number collides with an existing one.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      encounter = await Encounter.create({
        hospitalId: req.user.hospitalId,
        patientId: patient._id,
        encounterNumber: makeEncounterNumber(hospital.code),
        type: type || "EMERGENCY",
        chiefComplaint: chiefComplaint.trim(),
        triageNotes: typeof triageNotes === "string" ? triageNotes.trim() : "",
        vitals: buildVitals(vitals),
        status: "WAITING",
        triageLevel: "UNTRIAGED",
        createdBy: req.user.id,
      });
      break;
    } catch (error) {
      lastError = error;

      if (!(error.code === 11000 && attempt < 2)) {
        throw error;
      }
    }
  }

  if (!encounter) throw lastError;

  await safeNotify({
    hospitalId: req.user.hospitalId,
    roles: ["HOSPITAL_ADMIN", "EMERGENCY_STAFF"],
    type: "EMERGENCY",
    title: "New encounter registered",
    message: `A new ${encounter.type.toLowerCase()} encounter has been registered for ${patient.firstName} ${patient.lastName}.`,
    entityType: "ENCOUNTER",
    entityId: encounter._id,
  });

  return res.status(201).json({
    success: true,
    message: "Encounter created successfully",
    encounter,
  });
});

const getEncounterQueue = asyncHandler(async (req, res) => {
  const filter = { hospitalId: req.user.hospitalId };

  if (req.query.status) {
    const requestedStatuses = String(req.query.status)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const allowedStatuses = [
      "WAITING",
      "IN_TRIAGE",
      "WAITING_FOR_DOCTOR",
      "IN_TREATMENT",
      "ADMITTED",
      "TRANSFERRED",
      "DISCHARGED",
    ];

    if (requestedStatuses.some((status) => !allowedStatuses.includes(status))) {
      return res.status(400).json({
        success: false,
        message: "Invalid encounter status filter",
      });
    }

    filter.status =
      requestedStatuses.length === 1
        ? requestedStatuses[0]
        : { $in: requestedStatuses };
  } else {
    filter.status = { $in: ACTIVE_STATUSES };
  }

  if (req.query.triageLevel) {
    const levels = String(req.query.triageLevel)
      .split(",")
      .map((value) => value.trim());

    if (levels.some((level) => !Object.prototype.hasOwnProperty.call(TRIAGE_PRIORITY, level))) {
      return res.status(400).json({
        success: false,
        message: "Invalid triage level filter",
      });
    }

    filter.triageLevel = levels.length === 1 ? levels[0] : { $in: levels };
  }

  const encounters = await Encounter.find(filter)
    .populate("patientId", "mrn firstName lastName dateOfBirth sex phone bloodGroup allergies")
    .populate("assignedDoctorId", "name email department")
    .populate("createdBy", "name role")
    .sort({ createdAt: 1 })
    .lean();

  encounters.sort((a, b) => {
    const aPriority = TRIAGE_PRIORITY[a.triageLevel] || 99;
    const bPriority = TRIAGE_PRIORITY[b.triageLevel] || 99;

    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  return res.json({
    success: true,
    count: encounters.length,
    encounters,
  });
});

const getEncounterById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid encounter ID",
    });
  }

  const encounter = await Encounter.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  })
    .populate("patientId", "mrn firstName lastName dateOfBirth sex phone email bloodGroup allergies emergencyContact")
    .populate("assignedDoctorId", "name email department")
    .populate("createdBy", "name role")
    .populate("triagedBy", "name role");

  if (!encounter) {
    return res.status(404).json({
      success: false,
      message: "Encounter not found in your hospital",
    });
  }

  return res.json({ success: true, encounter });
});

const updateTriage = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid encounter ID" });
  }
  const { triageLevel, triageNotes, vitals } = req.body;

  const allowedLevels = [
    "RESUSCITATION",
    "EMERGENCY",
    "URGENT",
    "LESS_URGENT",
    "NON_URGENT",
    "UNTRIAGED",
  ];

  if (!allowedLevels.includes(triageLevel)) {
    return res.status(400).json({
      success: false,
      message: "A valid triageLevel is required",
    });
  }

  if (vitals !== undefined) {
    const vitalsError = validateVitals(vitals);
    if (vitalsError) {
      return res.status(400).json({
        success: false,
        message: vitalsError,
      });
    }
  }

  const encounter = await Encounter.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  });

  if (!encounter) {
    return res.status(404).json({
      success: false,
      message: "Encounter not found",
    });
  }

  if (
    !["WAITING", "IN_TRIAGE", "WAITING_FOR_DOCTOR"].includes(encounter.status)
  ) {
    return res.status(409).json({
      success: false,
      message: "Triage cannot be updated for this encounter status",
    });
  }

  encounter.triageLevel = triageLevel;

  if (triageNotes !== undefined) {
    encounter.triageNotes =
      typeof triageNotes === "string" ? triageNotes.trim() : "";
  }

  if (vitals !== undefined) {
    encounter.vitals = buildVitals(vitals);
  }

  encounter.triagedBy = req.user.id;
  encounter.triagedAt = new Date();
  encounter.status = "WAITING_FOR_DOCTOR";

  await encounter.save();

  await safeNotify({
    hospitalId: req.user.hospitalId,
    roles: ["HOSPITAL_ADMIN", "DOCTOR"],
    type: "EMERGENCY",
    title: "Triage updated",
    message: `Encounter ${encounter.encounterNumber} triage priority is now ${triageLevel}.`,
    entityType: "ENCOUNTER",
    entityId: encounter._id,
  });

  return res.json({
    success: true,
    message: "Triage updated successfully",
    encounter,
  });
});

const assignDoctor = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid encounter ID" });
  }
  const { doctorId } = req.body;

  if (!doctorId || !mongoose.isValidObjectId(doctorId)) {
    return res.status(400).json({
      success: false,
      message: "A valid doctorId is required",
    });
  }

  const [doctor, encounter] = await Promise.all([
    User.findOne({
      _id: doctorId,
      hospitalId: req.user.hospitalId,
      role: "DOCTOR",
      isActive: true,
    }).select("_id name"),
    Encounter.findOne({
      _id: req.params.id,
      hospitalId: req.user.hospitalId,
    }),
  ]);

  if (!doctor) {
    return res.status(404).json({
      success: false,
      message: "Active doctor not found in your hospital",
    });
  }

  if (!encounter) {
    return res.status(404).json({
      success: false,
      message: "Encounter not found",
    });
  }

  if (!["WAITING", "IN_TRIAGE", "WAITING_FOR_DOCTOR"].includes(encounter.status)) {
    return res.status(409).json({
      success: false,
      message: "Doctor cannot be assigned to this encounter status",
    });
  }

  encounter.assignedDoctorId = doctor._id;
  encounter.doctorAssignedAt = new Date();
  encounter.status = "IN_TREATMENT";

  await encounter.save();

  await safeNotify({
    hospitalId: req.user.hospitalId,
    recipientUserIds: [doctor._id.toString()],
    type: "EMERGENCY",
    title: "Patient assigned to you",
    message: `Encounter ${encounter.encounterNumber} has been assigned to you.`,
    entityType: "ENCOUNTER",
    entityId: encounter._id,
  });

  return res.json({
    success: true,
    message: "Doctor assigned successfully",
    encounter,
  });
});

module.exports = {
  createEncounter,
  getEncounterQueue,
  getAvailableDoctors,
  getEncounterById,
  updateTriage,
  assignDoctor,
};
