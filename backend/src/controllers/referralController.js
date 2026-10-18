const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");
const Patient = require("../models/Patient");
const Encounter = require("../models/Encounter");
const Referral = require("../models/Referral");
const HospitalConnection = require("../models/HospitalConnection");
const asyncHandler = require("../utils/asyncHandler");
const { notifyUsers } = require("../services/notificationService");
const { recordTimelineEvent } = require("../services/timelineService");

const allowedUrgencies = ["ROUTINE", "URGENT", "EMERGENCY"];
const safeText = (value, max = 2000) => String(value || "").trim().slice(0, max);
const referralNumber = () => `RF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
async function safeNotify(options) { try { await notifyUsers(options); } catch (error) { console.error("Referral notification failed:", error.message); } }

const createReferral = asyncHandler(async (req, res) => {
  const { targetHospitalId, encounterId, specialty, reason, urgency = "ROUTINE", clinicalSummary = "" } = req.body;
  if (!mongoose.isValidObjectId(targetHospitalId) || !mongoose.isValidObjectId(encounterId)) return res.status(400).json({ success: false, message: "Valid target hospital and encounter are required." });
  if (!safeText(specialty, 100) || !safeText(reason, 2500)) return res.status(400).json({ success: false, message: "Specialty and referral reason are required." });
  if (!allowedUrgencies.includes(urgency)) return res.status(400).json({ success: false, message: "Invalid urgency." });
  if (String(targetHospitalId) === String(req.user.hospitalId)) return res.status(400).json({ success: false, message: "Choose a different receiving hospital." });
  const [target, encounter] = await Promise.all([
    Hospital.findOne({ _id: targetHospitalId, status: "ACTIVE" }).select("_id name code"),
    Encounter.findOne({ _id: encounterId, hospitalId: req.user.hospitalId }),
  ]);
  if (!target) return res.status(404).json({ success: false, message: "Active receiving hospital not found." });
  const connected = await HospitalConnection.exists({ status: "CONNECTED", $or: [
    { sourceHospitalId: req.user.hospitalId, targetHospitalId: target._id },
    { sourceHospitalId: target._id, targetHospitalId: req.user.hospitalId },
  ] });
  if (!connected) return res.status(403).json({ success: false, message: "Connect with the receiving hospital before sending a referral." });
  if (!encounter || ["DISCHARGED", "TRANSFERRED"].includes(encounter.status)) return res.status(404).json({ success: false, message: "Active encounter not found in your hospital." });
  if (req.user.role === "DOCTOR" && String(encounter.assignedDoctorId || "") !== String(req.user.id)) return res.status(403).json({ success: false, message: "Doctors may refer only encounters assigned to them." });
  const patient = await Patient.findOne({ _id: encounter.patientId, hospitalId: req.user.hospitalId });
  if (!patient) return res.status(404).json({ success: false, message: "Patient record not found." });
  const referral = await Referral.create({
    referralNumber: referralNumber(), sourceHospitalId: req.user.hospitalId, targetHospitalId: target._id,
    sourcePatientId: patient._id, sourceEncounterId: encounter._id,
    patientSummary: { firstName: patient.firstName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth, sex: patient.sex, bloodGroup: patient.bloodGroup, allergies: patient.allergies || [] },
    specialty: safeText(specialty, 100), reason: safeText(reason, 2500), urgency,
    clinicalSummary: safeText(clinicalSummary, 8000), requestedBy: req.user.id, status: "PENDING",
  });
  await safeNotify({ hospitalId: target._id, roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR", "DOCTOR"], type: "TRANSFER", title: "New referral received", message: `Referral ${referral.referralNumber} requires review (${urgency.toLowerCase()}).`, entityType: "TRANSFER", entityId: referral._id });
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, actorUserId: req.user.id, eventType: "REFERRAL_CREATED", title: "Inter-hospital referral created", description: `Referral ${referral.referralNumber} sent to ${target.name}.`, entityType: "TRANSFER", entityId: referral._id, patientId: patient._id, encounterId: encounter._id });
  return res.status(201).json({ success: true, message: "Referral sent to the receiving hospital.", referral });
});

const listReferrals = asyncHandler(async (req, res) => {
  const direction = ["incoming", "outgoing", "all"].includes(req.query.direction) ? req.query.direction : "all";
  const filter = direction === "incoming" ? { targetHospitalId: req.user.hospitalId } : direction === "outgoing" ? { sourceHospitalId: req.user.hospitalId } : { $or: [{ sourceHospitalId: req.user.hospitalId }, { targetHospitalId: req.user.hospitalId }] };
  if (req.query.status) {
    const statuses = String(req.query.status).split(",").map((value) => value.trim());
    if (statuses.some((value) => !["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"].includes(value))) return res.status(400).json({ success: false, message: "Invalid referral status filter." });
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const referrals = await Referral.find(filter).populate("sourceHospitalId", "name code").populate("targetHospitalId", "name code").populate("requestedBy", "name role").populate("decidedBy", "name role").sort({ createdAt: -1 }).limit(limit).lean();
  return res.json({ success: true, count: referrals.length, referrals });
});

const decideReferral = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid referral ID." });
  const { decision, decisionNote = "" } = req.body;
  if (!["ACCEPT", "REJECT"].includes(decision)) return res.status(400).json({ success: false, message: "Decision must be ACCEPT or REJECT." });
  const status = decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
  const referral = await Referral.findOneAndUpdate(
    { _id: req.params.id, targetHospitalId: req.user.hospitalId, status: "PENDING" },
    { $set: { status, decisionNote: safeText(decisionNote, 2000), decidedBy: req.user.id, decidedAt: new Date() } },
    { new: true, runValidators: true }
  ).populate("sourceHospitalId", "name code").populate("targetHospitalId", "name code");
  if (!referral) return res.status(404).json({ success: false, message: "Pending incoming referral not found; it may already have been processed." });
  await safeNotify({ hospitalId: referral.sourceHospitalId._id, roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR", "DOCTOR"], type: "TRANSFER", title: `Referral ${status.toLowerCase()}`, message: `Referral ${referral.referralNumber} was ${status.toLowerCase()} by the receiving hospital.`, entityType: "TRANSFER", entityId: referral._id });
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, actorUserId: req.user.id, eventType: `REFERRAL_${status}`, title: `Referral ${status.toLowerCase()}`, description: `Referral ${referral.referralNumber} was ${status.toLowerCase()}.`, entityType: "TRANSFER", entityId: referral._id });
  return res.json({ success: true, message: `Referral ${status.toLowerCase()}.`, referral });
});

const cancelReferral = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid referral ID." });
  const referral = await Referral.findOneAndUpdate({ _id: req.params.id, sourceHospitalId: req.user.hospitalId, status: "PENDING" }, { $set: { status: "CANCELLED", decisionNote: "Cancelled by source hospital.", decidedBy: req.user.id, decidedAt: new Date() } }, { new: true, runValidators: true });
  if (!referral) return res.status(404).json({ success: false, message: "Pending outgoing referral not found." });
  return res.json({ success: true, message: "Referral cancelled.", referral });
});

module.exports = { createReferral, listReferrals, decideReferral, cancelReferral };
