const mongoose = require("mongoose");
const ClinicalDocument = require("../models/ClinicalDocument");
const Encounter = require("../models/Encounter");
const Patient = require("../models/Patient");
const ClinicalRecord = require("../models/ClinicalRecord");
const LabRequest = require("../models/LabRequest");
const Referral = require("../models/Referral");
const TransferRequest = require("../models/TransferRequest");
const Admission = require("../models/Admission");
const Hospital = require("../models/Hospital");
const asyncHandler = require("../utils/asyncHandler");
const { recordTimelineEvent } = require("../services/timelineService");

const TYPES = ["PRESCRIPTION", "LAB_REPORT", "REFERRAL_LETTER", "TRANSFER_SUMMARY", "DISCHARGE_SUMMARY"];
const makeNumber = () => `DOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const clean = (value) => (value === undefined || value === null || value === "" ? "Not recorded" : value);

// GET /api/documents?encounterId=...
const listDocuments = asyncHandler(async (req, res) => {
  const filter = { hospitalId: req.user.hospitalId, status: "FINAL" };
  if (req.query.encounterId) {
    if (!mongoose.isValidObjectId(req.query.encounterId)) return res.status(400).json({ success: false, message: "Invalid encounter ID" });
    const encounter = await Encounter.findOne({ _id: req.query.encounterId, hospitalId: req.user.hospitalId }).select("_id assignedDoctorId");
    if (!encounter) return res.status(404).json({ success: false, message: "Encounter not found in your hospital" });
    if (req.user.role === "DOCTOR" && String(encounter.assignedDoctorId || "") !== req.user.id) return res.status(403).json({ success: false, message: "You are not assigned to this encounter" });
    filter.encounterId = encounter._id;
  } else if (req.user.role === "DOCTOR") {
    const assigned = await Encounter.find({ hospitalId: req.user.hospitalId, assignedDoctorId: req.user.id }).select("_id").lean();
    filter.encounterId = { $in: assigned.map((item) => item._id) };
  }
  const documents = await ClinicalDocument.find(filter).populate("patientId", "mrn firstName lastName").populate("encounterId", "encounterNumber status").populate("generatedBy", "name role").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, count: documents.length, documents });
});

// POST /api/documents/generate
const generateDocument = asyncHandler(async (req, res) => {
  const { encounterId, documentType, referralId, transferId } = req.body;
  if (!mongoose.isValidObjectId(encounterId)) return res.status(400).json({ success: false, message: "A valid encounterId is required" });
  if (!TYPES.includes(documentType)) return res.status(400).json({ success: false, message: "Unsupported document type" });
  if (["PRESCRIPTION", "REFERRAL_LETTER", "TRANSFER_SUMMARY", "DISCHARGE_SUMMARY"].includes(documentType) && !["DOCTOR", "HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Your role cannot generate this document" });
  if (documentType === "LAB_REPORT" && !["DOCTOR", "HOSPITAL_ADMIN", "LAB_STAFF", "EMERGENCY_STAFF"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Your role cannot generate lab reports" });

  const encounter = await Encounter.findOne({ _id: encounterId, hospitalId: req.user.hospitalId });
  if (!encounter) return res.status(404).json({ success: false, message: "Encounter not found in your hospital" });
  if (req.user.role === "DOCTOR" && String(encounter.assignedDoctorId || "") !== req.user.id) return res.status(403).json({ success: false, message: "You are not assigned to this encounter" });
  const [patient, hospital, record] = await Promise.all([
    Patient.findOne({ _id: encounter.patientId, hospitalId: req.user.hospitalId }).lean(),
    Hospital.findById(req.user.hospitalId).select("name code address").lean(),
    ClinicalRecord.findOne({ encounterId: encounter._id, hospitalId: req.user.hospitalId }).populate("prescriptions.prescribedBy", "name").lean(),
  ]);
  if (!patient) return res.status(404).json({ success: false, message: "Patient record not found" });
  const patientName = `${patient.firstName} ${patient.lastName || ""}`.trim();
  let title = "Clinical document";
  const content = { hospital: hospital?.name || "MediFlow Hospital", hospitalCode: hospital?.code || "", hospitalAddress: hospital?.address || "", patientName, mrn: patient.mrn, dateOfBirth: patient.dateOfBirth, sex: patient.sex, bloodGroup: patient.bloodGroup, allergies: patient.allergies || [], encounterNumber: encounter.encounterNumber, encounterType: encounter.type, encounterStatus: encounter.status, chiefComplaint: encounter.chiefComplaint, triageLevel: encounter.triageLevel, vitals: encounter.vitals || {}, generatedAt: new Date().toISOString(), generatedBy: req.user.name, sections: [] };

  if (documentType === "PRESCRIPTION") {
    title = "Prescription";
    const active = (record?.prescriptions || []).filter((p) => p.status === "ACTIVE");
    if (!active.length) return res.status(409).json({ success: false, message: "No active doctor-entered prescription exists for this encounter" });
    content.sections.push({ heading: "Prescriptions", items: active.map((p) => ({ date: p.prescribedAt, prescribedBy: p.prescribedBy?.name || "Treating doctor", notes: p.notes || "", medicines: (p.items || []).map((m) => ({ medicineName: m.medicineName, strength: m.strength, dose: m.dose, route: m.route, frequency: m.frequency, duration: m.duration, quantity: m.quantity, instructions: m.instructions })) })) });
  } else if (documentType === "LAB_REPORT") {
    title = "Laboratory report";
    const tests = await LabRequest.find({ hospitalId: req.user.hospitalId, encounterId: encounter._id, status: "COMPLETED" }).sort({ completedAt: 1 }).lean();
    if (!tests.length) return res.status(409).json({ success: false, message: "No completed lab results exist for this encounter" });
    content.sections.push({ heading: "Completed investigations", items: tests.map((t) => ({ testName: t.testName, requestNumber: t.requestNumber, category: t.category, result: t.result, completedAt: t.completedAt })) });
  } else if (documentType === "REFERRAL_LETTER") {
    title = "Referral letter";
    if (!mongoose.isValidObjectId(referralId)) return res.status(400).json({ success: false, message: "Select a valid referral" });
    const referral = await Referral.findOne({ _id: referralId, sourceHospitalId: req.user.hospitalId, sourceEncounterId: encounter._id }).populate("targetHospitalId", "name address code").lean();
    if (!referral) return res.status(404).json({ success: false, message: "Referral not found for this encounter" });
    content.sections.push({ heading: "Referral details", items: [{ referralNumber: referral.referralNumber, receivingHospital: referral.targetHospitalId?.name, specialty: referral.specialty, urgency: referral.urgency, reason: referral.reason, clinicalSummary: referral.clinicalSummary, status: referral.status }] });
  } else if (documentType === "TRANSFER_SUMMARY") {
    title = "Inter-hospital transfer summary";
    if (!mongoose.isValidObjectId(transferId)) return res.status(400).json({ success: false, message: "Select a valid transfer" });
    const transfer = await TransferRequest.findOne({ _id: transferId, sourceHospitalId: req.user.hospitalId, sourceEncounterId: encounter._id }).populate("targetHospitalId", "name address code").lean();
    if (!transfer) return res.status(404).json({ success: false, message: "Transfer not found for this encounter" });
    content.sections.push({ heading: "Transfer details", items: [{ requestNumber: transfer.requestNumber, receivingHospital: transfer.targetHospitalId?.name, urgency: transfer.urgency, reason: transfer.reason, clinicalSummary: transfer.clinicalSummary, diagnosesSummary: transfer.diagnosesSummary, medicationsSummary: transfer.medicationsSummary, labSummary: transfer.labSummary, workflowStatus: transfer.workflowStatus }] });
  } else if (documentType === "DISCHARGE_SUMMARY") {
    title = "Discharge summary";
    if (encounter.status !== "DISCHARGED" && encounter.status !== "TRANSFERRED") return res.status(409).json({ success: false, message: "Discharge summary can only be generated after the encounter is discharged or transferred" });
    const admission = await Admission.findOne({ hospitalId: req.user.hospitalId, encounterId: encounter._id }).sort({ updatedAt: -1 }).lean();
    if (!admission?.discharge) return res.status(409).json({ success: false, message: "No finalized discharge details found for this encounter" });
    content.sections.push({ heading: "Discharge details", items: [{ diagnosis: admission.discharge.diagnosis, summary: admission.discharge.summary, instructions: admission.discharge.instructions, destination: admission.discharge.destination, dischargedAt: admission.discharge.dischargedAt, dischargedBy: req.user.name }] });
    content.sections.push({ heading: "Recorded diagnoses", items: (record?.diagnoses || []).map((d) => ({ name: d.name, code: d.code, type: d.type, notes: d.notes })) });
    content.sections.push({ heading: "Prescription history", items: (record?.prescriptions || []).filter((p) => p.status === "ACTIVE").map((p) => ({ prescribedAt: p.prescribedAt, medicines: (p.items || []).map((m) => ({ medicineName: m.medicineName, strength: m.strength, dose: m.dose, route: m.route, frequency: m.frequency, duration: m.duration, instructions: m.instructions })) })) });
  }
  const doc = await ClinicalDocument.create({ hospitalId: req.user.hospitalId, documentNumber: makeNumber(), documentType, patientId: patient._id, encounterId: encounter._id, title, content, generatedBy: req.user.id, sourceEntityId: referralId || transferId || null });
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, patientId: patient._id, encounterId: encounter._id, actorUserId: req.user.id, eventType: "CLINICAL_DOCUMENT_GENERATED", title: `${title} generated`, description: `Document ${doc.documentNumber} was generated.`, entityType: "ENCOUNTER", entityId: encounter._id });
  res.status(201).json({ success: true, message: `${title} generated`, document: doc });
});

module.exports = { listDocuments, generateDocument };
