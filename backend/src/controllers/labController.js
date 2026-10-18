
const mongoose = require("mongoose");
const LabRequest = require("../models/LabRequest");
const Encounter = require("../models/Encounter");
const Patient = require("../models/Patient");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { notifyUsers } = require("../services/notificationService");
const { recordTimelineEvent } = require("../services/timelineService");

const LAB_CATEGORIES = [
  "HEMATOLOGY",
  "BIOCHEMISTRY",
  "MICROBIOLOGY",
  "IMMUNOLOGY",
  "URINALYSIS",
  "IMAGING",
  "OTHER",
];

const LAB_PRIORITIES = ["ROUTINE", "URGENT", "STAT"];

const LAB_STATUSES = [
  "REQUESTED",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

async function safeNotify(options) {
  try {
    await notifyUsers(options);
  } catch (error) {
    console.error("Lab notification failed:", error.message);
  }
}

async function getAuthorizedEncounter(encounterId, user) {
  if (!mongoose.isValidObjectId(encounterId)) return null;

  const encounter = await Encounter.findOne({
    _id: encounterId,
    hospitalId: user.hospitalId,
  });

  if (!encounter) return null;

  if (
    user.role === "DOCTOR" &&
    String(encounter.assignedDoctorId || "") !== String(user.id)
  ) {
    return null;
  }

  return encounter;
}

function normalizeOptionalText(value, maxLength = 1000) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

const createLabRequest = asyncHandler(async (req, res) => {
  const { encounterId } = req.params;
  const {
    testName,
    testCode,
    category,
    priority,
    clinicalIndication,
    specimenType,
  } = req.body;

  if (!testName || !String(testName).trim()) {
    return res.status(400).json({
      success: false,
      message: "testName is required",
    });
  }

  if (String(testName).trim().length > 150) {
    return res.status(400).json({
      success: false,
      message: "testName cannot exceed 150 characters",
    });
  }

  if (category && !LAB_CATEGORIES.includes(category)) {
    return res.status(400).json({
      success: false,
      message: "Invalid lab category",
    });
  }

  if (priority && !LAB_PRIORITIES.includes(priority)) {
    return res.status(400).json({
      success: false,
      message: "Invalid lab priority",
    });
  }

  const encounter = await getAuthorizedEncounter(encounterId, req.user);

  if (!encounter) {
    return res.status(404).json({
      success: false,
      message: "Encounter not found or you are not authorized to access it",
    });
  }

  if (["TRANSFERRED", "DISCHARGED"].includes(encounter.status)) {
    return res.status(409).json({
      success: false,
      message: "Lab requests cannot be created for a closed encounter",
    });
  }

  const patient = await Patient.findOne({
    _id: encounter.patientId,
    hospitalId: req.user.hospitalId,
  }).select("_id");

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Encounter patient was not found in this hospital",
    });
  }

  let labRequest;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();

    try {
      labRequest = await LabRequest.create({
        hospitalId: req.user.hospitalId,
        patientId: patient._id,
        encounterId: encounter._id,
        requestNumber: `LAB-${datePart}-${randomPart}`,
        testName: String(testName).trim(),
        testCode: normalizeOptionalText(testCode, 50),
        category: category || "OTHER",
        priority: priority || "ROUTINE",
        clinicalIndication: normalizeOptionalText(clinicalIndication, 2000),
        specimenType: normalizeOptionalText(specimenType, 100),
        status: "REQUESTED",
        requestedBy: req.user.id,
        statusHistory: [
          {
            status: "REQUESTED",
            changedBy: req.user.id,
            changedAt: new Date(),
            note: "Lab request created",
          },
        ],
      });
      break;
    } catch (error) {
      lastError = error;
      if (!(error.code === 11000 && attempt < 2)) throw error;
    }
  }

  if (!labRequest) throw lastError;

  await safeNotify({
    hospitalId: req.user.hospitalId,
    roles: ["LAB_STAFF", "HOSPITAL_ADMIN"],
    type: "LAB_RESULT",
    title: "New lab request",
    message: `${labRequest.testName} has been requested for encounter ${encounter.encounterNumber}. Priority: ${labRequest.priority}.`,
    entityType: "LAB_REQUEST",
    entityId: labRequest._id,
  });

  return res.status(201).json({
    success: true,
    message: "Lab request created successfully",
    labRequest,
  });
});

const getLabRequests = asyncHandler(async (req, res) => {
  const filter = { hospitalId: req.user.hospitalId };

  if (req.query.status) {
    const statuses = String(req.query.status)
      .split(",")
      .map((value) => value.trim());

    if (statuses.some((status) => !LAB_STATUSES.includes(status))) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab status filter",
      });
    }

    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }

  if (req.query.priority) {
    const priorities = String(req.query.priority)
      .split(",")
      .map((value) => value.trim());

    if (priorities.some((priority) => !LAB_PRIORITIES.includes(priority))) {
      return res.status(400).json({
        success: false,
        message: "Invalid lab priority filter",
      });
    }

    filter.priority =
      priorities.length === 1 ? priorities[0] : { $in: priorities };
  }

  if (req.query.encounterId) {
    if (!mongoose.isValidObjectId(req.query.encounterId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid encounterId",
      });
    }

    filter.encounterId = req.query.encounterId;
  }

  if (req.user.role === "DOCTOR") {
    const assignedEncounters = await Encounter.find({
      hospitalId: req.user.hospitalId,
      assignedDoctorId: req.user.id,
    }).select("_id");

    filter.encounterId = {
      $in: assignedEncounters.map((encounter) => encounter._id),
    };
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );
  const skip = (page - 1) * limit;

  const [labRequests, total] = await Promise.all([
    LabRequest.find(filter)
      .populate("patientId", "mrn firstName lastName dateOfBirth sex")
      .populate("encounterId", "encounterNumber chiefComplaint status triageLevel")
      .populate("requestedBy", "name role")
      .populate("sampleCollectedBy", "name role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LabRequest.countDocuments(filter),
  ]);

  const priorityRank = { STAT: 1, URGENT: 2, ROUTINE: 3 };

  labRequests.sort((a, b) => {
    const aRank = priorityRank[a.priority] || 99;
    const bRank = priorityRank[b.priority] || 99;

    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  return res.json({
    success: true,
    count: labRequests.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    labRequests,
  });
});

const getLabRequestById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid lab request ID",
    });
  }

  const labRequest = await LabRequest.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  })
    .populate("patientId", "mrn firstName lastName dateOfBirth sex phone bloodGroup allergies")
    .populate("encounterId", "encounterNumber chiefComplaint status triageLevel assignedDoctorId")
    .populate("requestedBy", "name role")
    .populate("sampleCollectedBy", "name role")
    .populate("result.enteredBy", "name role");

  if (!labRequest) {
    return res.status(404).json({
      success: false,
      message: "Lab request not found",
    });
  }

  if (req.user.role === "DOCTOR") {
    const encounter = await Encounter.findOne({
      _id: labRequest.encounterId._id || labRequest.encounterId,
      hospitalId: req.user.hospitalId,
      assignedDoctorId: req.user.id,
    }).select("_id");

    if (!encounter) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this encounter",
      });
    }
  }

  return res.json({ success: true, labRequest });
});

const updateLabStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  if (!LAB_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "A valid status is required",
    });
  }

  const labRequest = await LabRequest.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  });

  if (!labRequest) {
    return res.status(404).json({
      success: false,
      message: "Lab request not found",
    });
  }

  const allowedTransitions = {
    REQUESTED: ["SAMPLE_COLLECTED", "CANCELLED"],
    SAMPLE_COLLECTED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  if (!allowedTransitions[labRequest.status]?.includes(status)) {
    return res.status(409).json({
      success: false,
      message: `Cannot change lab status from ${labRequest.status} to ${status}`,
    });
  }

  if (
    status === "COMPLETED" &&
    (!labRequest.result ||
      labRequest.result.interpretation === "NOT_REVIEWED")
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter and review the lab result before completing the request",
    });
  }

  const previousStatus = labRequest.status;
  labRequest.status = status;

  if (status === "SAMPLE_COLLECTED") {
    labRequest.sampleCollectedAt = new Date();
    labRequest.sampleCollectedBy = req.user.id;
  }

  if (status === "COMPLETED") {
    labRequest.completedAt = new Date();
  }

  if (status === "CANCELLED") {
    labRequest.cancelledAt = new Date();
  }

  if (!Array.isArray(labRequest.statusHistory)) {
    labRequest.statusHistory = [];
  }

  labRequest.statusHistory.push({
    status,
    changedBy: req.user.id,
    changedAt: new Date(),
    note: normalizeOptionalText(note, 500),
  });

  await labRequest.save();

  if (status === "COMPLETED") {
    const recipientIds = [String(labRequest.requestedBy)];

    const encounter = await Encounter.findOne({
      _id: labRequest.encounterId,
      hospitalId: req.user.hospitalId,
    }).select("assignedDoctorId");

    if (encounter?.assignedDoctorId) {
      recipientIds.push(String(encounter.assignedDoctorId));
    }

    await safeNotify({
      hospitalId: req.user.hospitalId,
      recipientUserIds: [...new Set(recipientIds)],
      type: "LAB_RESULT",
      title: "Lab result completed",
      message: `The result for ${labRequest.testName} (${labRequest.requestNumber}) is ready.`,
      entityType: "LAB_REQUEST",
      entityId: labRequest._id,
    });
  } else {
    await safeNotify({
      hospitalId: req.user.hospitalId,
      roles: ["HOSPITAL_ADMIN"],
      type: "LAB_RESULT",
      title: "Lab request status updated",
      message: `${labRequest.requestNumber} status changed from ${previousStatus} to ${status}.`,
      entityType: "LAB_REQUEST",
      entityId: labRequest._id,
    });
  }

  return res.json({
    success: true,
    message: "Lab status updated successfully",
    labRequest,
  });
});

const enterLabResult = asyncHandler(async (req, res) => {
  const {
    value,
    units,
    referenceRange,
    interpretation,
    remarks,
  } = req.body;

  const allowedInterpretations = [
    "NOT_REVIEWED",
    "NORMAL",
    "ABNORMAL",
    "CRITICAL",
    "INCONCLUSIVE",
  ];

  if (value === undefined || value === null || String(value).trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Result value is required",
    });
  }

  if (
    interpretation !== undefined &&
    !allowedInterpretations.includes(interpretation)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid result interpretation",
    });
  }

  const labRequest = await LabRequest.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  });

  if (!labRequest) {
    return res.status(404).json({
      success: false,
      message: "Lab request not found",
    });
  }

  if (!["SAMPLE_COLLECTED", "PROCESSING"].includes(labRequest.status)) {
    return res.status(409).json({
      success: false,
      message: "Results can only be entered after sample collection",
    });
  }

  labRequest.result = {
    value: String(value).trim().slice(0, 2000),
    units: normalizeOptionalText(units, 50),
    referenceRange: normalizeOptionalText(referenceRange, 200),
    interpretation: interpretation || "NOT_REVIEWED",
    remarks: normalizeOptionalText(remarks, 2000),
    enteredBy: req.user.id,
    enteredAt: new Date(),
  };

  if (labRequest.status === "SAMPLE_COLLECTED") {
    labRequest.status = "PROCESSING";

    if (!Array.isArray(labRequest.statusHistory)) {
      labRequest.statusHistory = [];
    }

    labRequest.statusHistory.push({
      status: "PROCESSING",
      changedBy: req.user.id,
      changedAt: new Date(),
      note: "Processing started when result was entered",
    });
  }

  await labRequest.save();
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: labRequest.patientId, encounterId: labRequest.encounterId, actorUserId: req.user.id, eventType: "LAB_RESULT_ENTERED", title: "Laboratory result entered", description: `A result was entered for ${labRequest.testName}.`, entityType: "LAB_REQUEST", entityId: labRequest._id });

  if (interpretation === "CRITICAL") {
    const encounter = await Encounter.findOne({
      _id: labRequest.encounterId,
      hospitalId: req.user.hospitalId,
    }).select("assignedDoctorId");

    const recipientIds = [String(labRequest.requestedBy)];

    if (encounter?.assignedDoctorId) {
      recipientIds.push(String(encounter.assignedDoctorId));
    }

    await safeNotify({
      hospitalId: req.user.hospitalId,
      recipientUserIds: [...new Set(recipientIds)],
      roles: ["HOSPITAL_ADMIN", "DOCTOR"],
      type: "LAB_RESULT",
      title: "Critical lab result",
      message: `Critical result entered for ${labRequest.testName} (${labRequest.requestNumber}). Review it promptly.`,
      entityType: "LAB_REQUEST",
      entityId: labRequest._id,
    });
  }

  return res.json({
    success: true,
    message: "Lab result saved successfully. Complete the request after review.",
    labRequest,
  });
});

module.exports = {
  createLabRequest,
  getLabRequests,
  getLabRequestById,
  updateLabStatus,
  enterLabResult,
};
