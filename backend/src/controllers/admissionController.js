
const mongoose = require("mongoose");
const Ward = require("../models/Ward");
const Bed = require("../models/Bed");
const Admission = require("../models/Admission");
const Patient = require("../models/Patient");
const Encounter = require("../models/Encounter");
const asyncHandler = require("../utils/asyncHandler");
const { recordTimelineEvent } = require("../services/timelineService");

const WARD_TYPES = [
  "GENERAL",
  "EMERGENCY",
  "ICU",
  "MATERNITY",
  "PEDIATRIC",
  "SURGICAL",
  "PRIVATE",
  "OTHER",
];

const BED_TYPES = [
  "STANDARD",
  "ICU",
  "ISOLATION",
  "PRIVATE",
  "PEDIATRIC",
];

// POST /api/admissions/wards
const createWard = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    department = "",
    wardType = "GENERAL",
  } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof code !== "string" ||
    !code.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Ward name and code are required",
    });
  }

  if (
    name.length > 100 ||
    code.length > 30 ||
    typeof department !== "string" ||
    department.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Ward fields exceed allowed limits",
    });
  }

  if (!WARD_TYPES.includes(wardType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid ward type",
    });
  }

  const existing = await Ward.findOne({
    hospitalId: req.user.hospitalId,
    code: code.trim().toUpperCase(),
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "A ward with this code already exists",
    });
  }

  const ward = await Ward.create({
    hospitalId: req.user.hospitalId,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    department: department.trim(),
    wardType,
  });

  res.status(201).json({
    success: true,
    message: "Ward created successfully",
    ward,
  });
});

// GET /api/admissions/wards
const getWards = asyncHandler(async (req, res) => {
  const filter = {
    hospitalId: req.user.hospitalId,
  };

  if (req.query.status) {
    if (!["ACTIVE", "INACTIVE"].includes(req.query.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ward status",
      });
    }
    filter.status = req.query.status;
  }

  const wards = await Ward.find(filter).sort({ name: 1 }).lean();

  const wardIds = wards.map((ward) => ward._id);

  const bedCounts = await Bed.aggregate([
    {
      $match: {
        hospitalId: new mongoose.Types.ObjectId(req.user.hospitalId),
        wardId: { $in: wardIds },
      },
    },
    {
      $group: {
        _id: { wardId: "$wardId", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ]);

  const countMap = {};

  for (const item of bedCounts) {
    const wardId = item._id.wardId.toString();
    if (!countMap[wardId]) {
      countMap[wardId] = {
        total: 0,
        available: 0,
        occupied: 0,
        cleaning: 0,
        maintenance: 0,
      };
    }

    countMap[wardId].total += item.count;

    if (item._id.status === "AVAILABLE") {
      countMap[wardId].available = item.count;
    } else if (item._id.status === "OCCUPIED") {
      countMap[wardId].occupied = item.count;
    } else if (item._id.status === "CLEANING") {
      countMap[wardId].cleaning = item.count;
    } else if (item._id.status === "MAINTENANCE") {
      countMap[wardId].maintenance = item.count;
    }
  }

  const results = wards.map((ward) => ({
    ...ward,
    bedSummary: countMap[ward._id.toString()] || {
      total: 0,
      available: 0,
      occupied: 0,
      cleaning: 0,
      maintenance: 0,
    },
  }));

  res.json({
    success: true,
    count: results.length,
    wards: results,
  });
});

// POST /api/admissions/beds
const createBed = asyncHandler(async (req, res) => {
  const { wardId, bedNumber, bedType = "STANDARD" } = req.body;

  if (
    !mongoose.isValidObjectId(wardId) ||
    typeof bedNumber !== "string" ||
    !bedNumber.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid wardId and bedNumber are required",
    });
  }

  if (bedNumber.length > 30 || !BED_TYPES.includes(bedType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid bed number or bed type",
    });
  }

  const ward = await Ward.findOne({
    _id: wardId,
    hospitalId: req.user.hospitalId,
    status: "ACTIVE",
  });

  if (!ward) {
    return res.status(404).json({
      success: false,
      message: "Active ward not found in your hospital",
    });
  }

  const existing = await Bed.findOne({
    hospitalId: req.user.hospitalId,
    wardId: ward._id,
    bedNumber: bedNumber.trim().toUpperCase(),
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "This bed number already exists in the ward",
    });
  }

  const bed = await Bed.create({
    hospitalId: req.user.hospitalId,
    wardId: ward._id,
    bedNumber: bedNumber.trim().toUpperCase(),
    bedType,
  });

  res.status(201).json({
    success: true,
    message: "Bed created successfully",
    bed,
  });
});

// GET /api/admissions/beds
const getBeds = asyncHandler(async (req, res) => {
  const filter = {
    hospitalId: req.user.hospitalId,
  };

  if (req.query.wardId) {
    if (!mongoose.isValidObjectId(req.query.wardId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ward ID",
      });
    }
    filter.wardId = req.query.wardId;
  }

  if (req.query.status) {
    if (!["AVAILABLE", "OCCUPIED", "CLEANING", "MAINTENANCE"].includes(req.query.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bed status",
      });
    }
    filter.status = req.query.status;
  }

  const beds = await Bed.find(filter)
    .populate("wardId", "name code wardType")
    .populate("currentEncounterId", "encounterNumber status")
    .sort({ bedNumber: 1 });

  res.json({
    success: true,
    count: beds.length,
    beds,
  });
});

// POST /api/admissions
const admitPatient = asyncHandler(async (req, res) => {
  const { encounterId, bedId } = req.body;

  if (
    !mongoose.isValidObjectId(encounterId) ||
    !mongoose.isValidObjectId(bedId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid encounterId and bedId are required",
    });
  }

  const encounter = await Encounter.findOne({
    _id: encounterId,
    hospitalId: req.user.hospitalId,
  });

  if (!encounter) {
    return res.status(404).json({
      success: false,
      message: "Encounter not found in your hospital",
    });
  }

  if (["ADMITTED", "TRANSFERRED", "DISCHARGED"].includes(encounter.status)) {
    return res.status(400).json({
      success: false,
      message: "This encounter cannot be admitted in its current status",
    });
  }

  const patient = await Patient.findOne({
    _id: encounter.patientId,
    hospitalId: req.user.hospitalId,
    status: "ACTIVE",
  });

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Active patient not found in your hospital",
    });
  }

  const existingAdmission = await Admission.findOne({
    hospitalId: req.user.hospitalId,
    encounterId: encounter._id,
  });

  if (existingAdmission) {
    return res.status(409).json({
      success: false,
      message: "An admission record already exists for this encounter",
    });
  }

  const bed = await Bed.findOne({
    _id: bedId,
    hospitalId: req.user.hospitalId,
    status: "AVAILABLE",
  });

  if (!bed) {
    return res.status(409).json({
      success: false,
      message: "Bed is unavailable or not found in your hospital",
    });
  }

  const ward = await Ward.findOne({
    _id: bed.wardId,
    hospitalId: req.user.hospitalId,
    status: "ACTIVE",
  });

  if (!ward) {
    return res.status(400).json({
      success: false,
      message: "The bed's ward is inactive",
    });
  }

  // Atomically claim the bed so two requests cannot reserve it at once.
  const claimedBed = await Bed.findOneAndUpdate(
    {
      _id: bed._id,
      hospitalId: req.user.hospitalId,
      status: "AVAILABLE",
    },
    {
      $set: {
        status: "OCCUPIED",
        currentEncounterId: encounter._id,
      },
    },
    { new: true }
  );

  if (!claimedBed) {
    return res.status(409).json({
      success: false,
      message: "This bed was just assigned to another patient",
    });
  }

  let admission;

  try {
    admission = await Admission.create({
      hospitalId: req.user.hospitalId,
      patientId: patient._id,
      encounterId: encounter._id,
      wardId: ward._id,
      bedId: claimedBed._id,
      admittedBy: req.user.id,
      status: "ADMITTED",
    });

    encounter.status = "ADMITTED";
    await encounter.save();
  } catch (error) {
    // Best-effort rollback if admission creation or encounter update fails.
    if (admission) {
      await Admission.deleteOne({ _id: admission._id }).catch(() => {});
    }

    await Bed.updateOne(
      {
        _id: claimedBed._id,
        hospitalId: req.user.hospitalId,
        currentEncounterId: encounter._id,
      },
      {
        $set: { status: "AVAILABLE", currentEncounterId: null },
      }
    ).catch(() => {});

    throw error;
  }

  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: admission.patientId, encounterId: admission.encounterId, actorUserId: req.user.id, eventType: "PATIENT_ADMITTED", title: "Patient admitted", description: "An admission was created and a bed was allocated.", entityType: "ADMISSION", entityId: admission._id });

  res.status(201).json({
    success: true,
    message: "Patient admitted successfully",
    admission,
  });
});

// GET /api/admissions
const getAdmissions = asyncHandler(async (req, res) => {
  const filter = {
    hospitalId: req.user.hospitalId,
  };

  if (req.query.status) {
    if (!["ADMITTED", "DISCHARGED"].includes(req.query.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admission status",
      });
    }
    filter.status = req.query.status;
  }

  const admissions = await Admission.find(filter)
    .populate("patientId", "mrn firstName lastName dateOfBirth sex")
    .populate("encounterId", "encounterNumber type chiefComplaint status")
    .populate("wardId", "name code wardType")
    .populate("bedId", "bedNumber bedType status")
    .populate("admittedBy", "name role")
    .populate("discharge.dischargedBy", "name role")
    .sort({ admittedAt: -1 });

  res.json({
    success: true,
    count: admissions.length,
    admissions,
  });
});

// GET /api/admissions/:id
const getAdmissionById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid admission ID",
    });
  }

  const admission = await Admission.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  })
    .populate("patientId")
    .populate("encounterId")
    .populate("wardId")
    .populate("bedId")
    .populate("admittedBy", "name role")
    .populate("discharge.dischargedBy", "name role");

  if (!admission) {
    return res.status(404).json({
      success: false,
      message: "Admission not found in your hospital",
    });
  }

  res.json({ success: true, admission });
});

// PATCH /api/admissions/:id/discharge
const dischargePatient = asyncHandler(async (req, res) => {
  const { diagnosis = "", summary = "", instructions = "", destination = "HOME" } =
    req.body;

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid admission ID",
    });
  }

  for (const [key, value] of Object.entries({
    diagnosis,
    summary,
    instructions,
  })) {
    if (typeof value !== "string") {
      return res.status(400).json({
        success: false,
        message: `${key} must be text`,
      });
    }
  }

  if (
    diagnosis.length > 2000 ||
    summary.length > 10000 ||
    instructions.length > 5000
  ) {
    return res.status(400).json({
      success: false,
      message: "Discharge fields exceed allowed limits",
    });
  }

  if (!["HOME", "TRANSFER", "OTHER"].includes(destination)) {
    return res.status(400).json({
      success: false,
      message: "Invalid discharge destination",
    });
  }

  const admission = await Admission.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  });

  if (!admission) {
    return res.status(404).json({
      success: false,
      message: "Admission not found in your hospital",
    });
  }

  if (admission.status !== "ADMITTED") {
    return res.status(400).json({
      success: false,
      message: "This admission has already been discharged",
    });
  }

  // Release only the bed occupied by this encounter.
  const releasedBed = await Bed.findOneAndUpdate(
    {
      _id: admission.bedId,
      hospitalId: req.user.hospitalId,
      status: "OCCUPIED",
      currentEncounterId: admission.encounterId,
    },
    {
      $set: {
        status: "CLEANING",
        currentEncounterId: null,
        statusNote: "Discharged patient; cleaning required",
        statusUpdatedBy: req.user.id,
        statusUpdatedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!releasedBed) {
    return res.status(409).json({
      success: false,
      message:
        "Bed assignment is inconsistent. Please verify the bed record before discharging.",
    });
  }

  try {
    admission.status = "DISCHARGED";
    admission.discharge = {
      dischargedAt: new Date(),
      dischargedBy: req.user.id,
      diagnosis: diagnosis.trim(),
      summary: summary.trim(),
      instructions: instructions.trim(),
      destination,
    };

    await admission.save();

    const encounter = await Encounter.findOne({
      _id: admission.encounterId,
      hospitalId: req.user.hospitalId,
    });

    if (encounter) {
      encounter.status = destination === "TRANSFER" ? "TRANSFERRED" : "DISCHARGED";
      encounter.closedAt = new Date();
      await encounter.save();
    }
  } catch (error) {
    // Restore the bed if the discharge update fails.
    await Bed.updateOne(
      {
        _id: admission.bedId,
        hospitalId: req.user.hospitalId,
        status: "CLEANING",
        currentEncounterId: null,
      },
      {
        $set: {
          status: "OCCUPIED",
          currentEncounterId: admission.encounterId,
        },
      }
    ).catch(() => {});

    throw error;
  }

  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: admission.patientId, encounterId: admission.encounterId, actorUserId: req.user.id, eventType: "PATIENT_DISCHARGED", title: "Patient discharged", description: "Discharge was recorded and the bed entered the cleaning workflow.", entityType: "ADMISSION", entityId: admission._id });

  res.json({
    success: true,
    message: "Patient discharged and bed released",
    admission,
  });
});

module.exports = {
  createWard,
  getWards,
  createBed,
  getBeds,
  admitPatient,
  getAdmissions,
  getAdmissionById,
  dischargePatient,
};
