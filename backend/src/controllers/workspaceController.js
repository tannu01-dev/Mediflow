const mongoose = require("mongoose");
const Encounter = require("../models/Encounter");
const ClinicalRecord = require("../models/ClinicalRecord");
const asyncHandler = require("../utils/asyncHandler");
const { recordTimelineEvent } = require("../services/timelineService");

const ACTIVE_STATUSES = ["WAITING", "IN_TRIAGE", "WAITING_FOR_DOCTOR", "IN_TREATMENT", "ADMITTED"];
const VITAL_LIMITS = {
  temperatureC: [25, 45], pulseBpm: [0, 300], respiratoryRate: [0, 100],
  systolicBP: [0, 350], diastolicBP: [0, 250], oxygenSaturation: [0, 100],
  weightKg: [0, 500], heightCm: [0, 300],
};

function validateVitals(vitals = {}) {
  if (!vitals || typeof vitals !== "object" || Array.isArray(vitals)) return "Vitals must be an object";
  for (const [key, raw] of Object.entries(vitals)) {
    if (!Object.prototype.hasOwnProperty.call(VITAL_LIMITS, key)) return `Unknown vital field: ${key}`;
    if (raw === "" || raw === null || raw === undefined) continue;
    const value = Number(raw); const [min, max] = VITAL_LIMITS[key];
    if (!Number.isFinite(value) || value < min || value > max) return `Invalid value for ${key}`;
  }
  return null;
}
function cleanVitals(vitals = {}) {
  const output = {};
  for (const key of Object.keys(VITAL_LIMITS)) {
    if (vitals[key] !== undefined && vitals[key] !== null && vitals[key] !== "") output[key] = Number(vitals[key]);
  }
  return output;
}

const getDoctorWorkspace = asyncHandler(async (req, res) => {
  const encounters = await Encounter.find({
    hospitalId: req.user.hospitalId,
    assignedDoctorId: req.user.id,
    status: { $in: ACTIVE_STATUSES },
  })
    .populate("patientId", "mrn firstName lastName dateOfBirth sex phone bloodGroup allergies")
    .populate("assignedDoctorId", "name department")
    .sort({ createdAt: -1 }).lean();

  const ids = encounters.map((item) => item._id);
  const records = await ClinicalRecord.find({ hospitalId: req.user.hospitalId, encounterId: { $in: ids } })
    .select("encounterId notes diagnoses prescriptions updatedAt").lean();
  const byEncounter = new Map(records.map((record) => [String(record.encounterId), record]));
  res.json({ success: true, count: encounters.length, encounters: encounters.map((item) => ({ ...item, clinicalRecord: byEncounter.get(String(item._id)) || null })) });
});

const getNurseWorkspace = asyncHandler(async (req, res) => {
  const encounters = await Encounter.find({
    hospitalId: req.user.hospitalId,
    status: { $in: ACTIVE_STATUSES },
  })
    .populate("patientId", "mrn firstName lastName dateOfBirth sex phone bloodGroup allergies")
    .populate("assignedDoctorId", "name department")
    .populate("nursingObservations.recordedBy", "name role")
    .sort({ updatedAt: -1 }).limit(150).lean();
  res.json({ success: true, count: encounters.length, encounters });
});

const addNursingObservation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid encounter ID" });
  const { vitals = {}, note = "" } = req.body;
  const vitalsError = validateVitals(vitals);
  if (vitalsError) return res.status(400).json({ success: false, message: vitalsError });
  if (typeof note !== "string" || note.length > 3000) return res.status(400).json({ success: false, message: "Nursing note must be text up to 3000 characters" });
  if (!Object.keys(cleanVitals(vitals)).length && !note.trim()) return res.status(400).json({ success: false, message: "Enter at least one vital sign or nursing note" });

  const encounter = await Encounter.findOne({ _id: id, hospitalId: req.user.hospitalId, status: { $in: ACTIVE_STATUSES } });
  if (!encounter) return res.status(404).json({ success: false, message: "Active encounter not found in your hospital" });
  const observation = { vitals: cleanVitals(vitals), note: note.trim(), recordedBy: req.user.id, recordedAt: new Date() };
  encounter.nursingObservations.push(observation);
  // Keep the latest observation reflected in the current vitals panel while preserving history.
  encounter.vitals = { ...(encounter.vitals?.toObject?.() || encounter.vitals || {}), ...observation.vitals };
  await encounter.save();
  await encounter.populate("nursingObservations.recordedBy", "name role");
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: encounter.patientId, encounterId: encounter._id, actorUserId: req.user.id, eventType: "NURSING_OBSERVATION_RECORDED", title: "Nursing observation recorded", description: "Vitals or a nursing note was added to the encounter.", entityType: "ENCOUNTER", entityId: encounter._id });
  res.status(201).json({ success: true, message: "Nursing observation saved", observation: encounter.nursingObservations[encounter.nursingObservations.length - 1], encounterId: encounter._id });
});

module.exports = { getDoctorWorkspace, getNurseWorkspace, addNursingObservation };
