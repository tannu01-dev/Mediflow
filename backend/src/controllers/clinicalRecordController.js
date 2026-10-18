
const mongoose = require("mongoose");
const ClinicalRecord = require("../models/ClinicalRecord");
const Encounter = require("../models/Encounter");
const asyncHandler = require("../utils/asyncHandler");
const { recordTimelineEvent } = require("../services/timelineService");

const validId = (id) => mongoose.isValidObjectId(id);

async function findAuthorizedEncounter(req, res, writeAccess = false) {
  const { encounterId } = req.params;

  if (!validId(encounterId)) {
    res.status(400).json({
      success: false,
      message: "Invalid encounter ID",
    });
    return null;
  }

  const encounter = await Encounter.findOne({
    _id: encounterId,
    hospitalId: req.user.hospitalId,
  });

  if (!encounter) {
    res.status(404).json({
      success: false,
      message: "Encounter not found in your hospital",
    });
    return null;
  }

  if (writeAccess) {
    if (req.user.role !== "DOCTOR") {
      res.status(403).json({
        success: false,
        message: "Only doctors can modify clinical records",
      });
      return null;
    }

    if (
      !encounter.assignedDoctorId ||
      encounter.assignedDoctorId.toString() !== req.user.id
    ) {
      res.status(403).json({
        success: false,
        message: "You are not the doctor assigned to this encounter",
      });
      return null;
    }

    if (["TRANSFERRED", "DISCHARGED"].includes(encounter.status)) {
      res.status(400).json({
        success: false,
        message: "This encounter is closed for clinical updates",
      });
      return null;
    }
  } else if (
    req.user.role === "DOCTOR" &&
    (!encounter.assignedDoctorId ||
      encounter.assignedDoctorId.toString() !== req.user.id)
  ) {
    res.status(403).json({
      success: false,
      message: "You are not assigned to this encounter",
    });
    return null;
  }

  return encounter;
}

async function getOrCreateRecord(encounter, userId) {
  let record = await ClinicalRecord.findOne({
    encounterId: encounter._id,
    hospitalId: encounter.hospitalId,
  });

  if (!record) {
    record = await ClinicalRecord.create({
      hospitalId: encounter.hospitalId,
      encounterId: encounter._id,
      patientId: encounter.patientId,
      lastUpdatedBy: userId,
    });
  }

  return record;
}

// GET /api/clinical-records/:encounterId
const getClinicalRecord = asyncHandler(async (req, res) => {
  const encounter = await findAuthorizedEncounter(req, res);

  if (!encounter) return;

  let record = await ClinicalRecord.findOne({
    encounterId: encounter._id,
    hospitalId: req.user.hospitalId,
  })
    .populate("notes.createdBy", "name role")
    .populate("diagnoses.recordedBy", "name role")
    .populate("prescriptions.prescribedBy", "name role")
    .populate("lastUpdatedBy", "name role");

  if (!record) {
    return res.json({
      success: true,
      record: {
        encounterId: encounter._id,
        patientId: encounter.patientId,
        notes: [],
        diagnoses: [],
        prescriptions: [],
      },
    });
  }

  res.json({ success: true, record });
});

// POST /api/clinical-records/:encounterId/notes
const addClinicalNote = asyncHandler(async (req, res) => {
  const encounter = await findAuthorizedEncounter(req, res, true);

  if (!encounter) return;

  const {
    subjective = "",
    objective = "",
    assessment = "",
    plan = "",
    generalNotes = "",
  } = req.body;

  const values = {
    subjective,
    objective,
    assessment,
    plan,
    generalNotes,
  };

  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string") {
      return res.status(400).json({
        success: false,
        message: `${key} must be text`,
      });
    }
  }

  if (!Object.values(values).some((value) => value.trim())) {
    return res.status(400).json({
      success: false,
      message: "Enter at least one clinical note field",
    });
  }

  const record = await getOrCreateRecord(encounter, req.user.id);

  record.notes.push({
    ...values,
    createdBy: req.user.id,
    createdAt: new Date(),
  });
  record.lastUpdatedBy = req.user.id;

  await record.save();
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: encounter.patientId, encounterId: encounter._id, actorUserId: req.user.id, eventType: "CLINICAL_NOTE_ADDED", title: "Clinical note recorded", description: "A doctor added a clinical note to the encounter.", entityType: "ENCOUNTER", entityId: encounter._id });

  res.status(201).json({
    success: true,
    message: "Clinical note saved",
    note: record.notes[record.notes.length - 1],
  });
});

// POST /api/clinical-records/:encounterId/diagnoses
const addDiagnosis = asyncHandler(async (req, res) => {
  const encounter = await findAuthorizedEncounter(req, res, true);

  if (!encounter) return;

  const {
    name,
    code = "",
    type = "PROVISIONAL",
    notes = "",
  } = req.body;

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Diagnosis name is required",
    });
  }

  if (
    name.length > 200 ||
    typeof code !== "string" ||
    code.length > 30 ||
    typeof notes !== "string" ||
    notes.length > 2000
  ) {
    return res.status(400).json({
      success: false,
      message: "Diagnosis fields exceed allowed limits",
    });
  }

  if (!["PROVISIONAL", "CONFIRMED", "DIFFERENTIAL"].includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid diagnosis type",
    });
  }

  const record = await getOrCreateRecord(encounter, req.user.id);

  record.diagnoses.push({
    name: name.trim(),
    code: code.trim(),
    type,
    notes: notes.trim(),
    recordedBy: req.user.id,
    recordedAt: new Date(),
  });

  record.lastUpdatedBy = req.user.id;
  await record.save();
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: encounter.patientId, encounterId: encounter._id, actorUserId: req.user.id, eventType: "DIAGNOSIS_RECORDED", title: "Diagnosis record updated", description: "A doctor added a diagnosis entry.", entityType: "ENCOUNTER", entityId: encounter._id });

  res.status(201).json({
    success: true,
    message: "Diagnosis added",
    diagnosis: record.diagnoses[record.diagnoses.length - 1],
  });
});

// POST /api/clinical-records/:encounterId/prescriptions
const addPrescription = asyncHandler(async (req, res) => {
  const encounter = await findAuthorizedEncounter(req, res, true);

  if (!encounter) return;

  const { items, notes = "" } = req.body;

  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 50
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide between 1 and 50 prescription items",
    });
  }

  if (typeof notes !== "string" || notes.length > 3000) {
    return res.status(400).json({
      success: false,
      message: "Prescription notes must be text of at most 3000 characters",
    });
  }

  const allowedRoutes = [
    "ORAL",
    "IV",
    "IM",
    "SUBCUTANEOUS",
    "TOPICAL",
    "INHALATION",
    "OPHTHALMIC",
    "OTIC",
    "RECTAL",
    "OTHER",
  ];

  const cleanedItems = [];

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return res.status(400).json({
        success: false,
        message: "Each prescription item must be an object",
      });
    }

    const {
      medicineName,
      strength = "",
      dose,
      route = "ORAL",
      frequency,
      duration,
      quantity = "",
      instructions = "",
    } = item;

    if (
      typeof medicineName !== "string" ||
      !medicineName.trim() ||
      typeof dose !== "string" ||
      !dose.trim() ||
      typeof frequency !== "string" ||
      !frequency.trim() ||
      typeof duration !== "string" ||
      !duration.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Each medicine needs a name, dose, frequency, and duration",
      });
    }

    if (
      !allowedRoutes.includes(route) ||
      typeof strength !== "string" ||
      typeof quantity !== "string" ||
      typeof instructions !== "string" ||
      medicineName.length > 200 ||
      strength.length > 100 ||
      dose.length > 100 ||
      frequency.length > 100 ||
      duration.length > 100 ||
      quantity.length > 100 ||
      instructions.length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid prescription fields",
      });
    }

    cleanedItems.push({
      medicineName: medicineName.trim(),
      strength: strength.trim(),
      dose: dose.trim(),
      route,
      frequency: frequency.trim(),
      duration: duration.trim(),
      quantity: quantity.trim(),
      instructions: instructions.trim(),
    });
  }

  const record = await getOrCreateRecord(encounter, req.user.id);

  record.prescriptions.push({
    items: cleanedItems,
    notes: notes.trim(),
    prescribedBy: req.user.id,
    prescribedAt: new Date(),
    status: "ACTIVE",
  });

  record.lastUpdatedBy = req.user.id;
  await record.save();
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: encounter.patientId, encounterId: encounter._id, actorUserId: req.user.id, eventType: "PRESCRIPTION_RECORDED", title: "Prescription recorded", description: "A doctor saved a prescription for the encounter.", entityType: "ENCOUNTER", entityId: encounter._id });

  res.status(201).json({
    success: true,
    message: "Prescription saved",
    prescription:
      record.prescriptions[record.prescriptions.length - 1],
  });
});

module.exports = {
  getClinicalRecord,
  addClinicalNote,
  addDiagnosis,
  addPrescription,
};
