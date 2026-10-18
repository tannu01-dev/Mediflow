const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const Encounter = require("../models/Encounter");
const Admission = require("../models/Admission");
const Bed = require("../models/Bed");
const LabRequest = require("../models/LabRequest");
const User = require("../models/User");
const Referral = require("../models/Referral");
const TransferRequest = require("../models/TransferRequest");
const Hospital = require("../models/Hospital");
const HospitalConnection = require("../models/HospitalConnection");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");

const asId = (value) => new mongoose.Types.ObjectId(String(value));
const countBy = (rows, key = "_id") => Object.fromEntries(rows.map((row) => [row[key], row.count]));

const getHospitalAnalytics = asyncHandler(async (req, res) => {
  const hospitalId = asId(req.user.hospitalId);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);
  const [
    patientTotal, activePatients, encounterTotal, activeEncounters, todayEncounters,
    staffTotal, activeStaff, admissionsActive, labOpen, labCompleted, referralPending,
    transferPending, auditToday, bedRows, encounterStatusRows, labStatusRows, trendRows,
    referralStatusRows, transferStatusRows,
  ] = await Promise.all([
    Patient.countDocuments({ hospitalId }),
    Patient.countDocuments({ hospitalId, status: "ACTIVE" }),
    Encounter.countDocuments({ hospitalId }),
    Encounter.countDocuments({ hospitalId, status: { $nin: ["DISCHARGED", "TRANSFERRED"] } }),
    Encounter.countDocuments({ hospitalId, createdAt: { $gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } }),
    User.countDocuments({ hospitalId }),
    User.countDocuments({ hospitalId, isActive: true }),
    Admission.countDocuments({ hospitalId, status: "ADMITTED" }),
    LabRequest.countDocuments({ hospitalId, status: { $in: ["REQUESTED", "SAMPLE_COLLECTED", "PROCESSING"] } }),
    LabRequest.countDocuments({ hospitalId, status: "COMPLETED" }),
    Referral.countDocuments({ $or: [{ sourceHospitalId: hospitalId }, { targetHospitalId: hospitalId }], status: "PENDING" }),
    TransferRequest.countDocuments({ $or: [{ sourceHospitalId: hospitalId }, { targetHospitalId: hospitalId }], status: { $in: ["PENDING", "PROCESSING"] } }),
    AuditLog.countDocuments({ hospitalId, createdAt: { $gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } }),
    Bed.aggregate([{ $match: { hospitalId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Encounter.aggregate([{ $match: { hospitalId } }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    LabRequest.aggregate([{ $match: { hospitalId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Encounter.aggregate([{ $match: { hospitalId, createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Referral.aggregate([{ $match: { $or: [{ sourceHospitalId: hospitalId }, { targetHospitalId: hospitalId }] } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    TransferRequest.aggregate([{ $match: { $or: [{ sourceHospitalId: hospitalId }, { targetHospitalId: hospitalId }] } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const bedStatus = countBy(bedRows);
  const labStatus = countBy(labStatusRows);
  const encounterStatus = countBy(encounterStatusRows);
  const trendMap = new Map(trendRows.map((row) => [row._id, row.count]));
  const dailyEncounters = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(since); date.setUTCDate(since.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, label: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }), count: trendMap.get(key) || 0 };
  });
  return res.json({ success: true, generatedAt: new Date().toISOString(), periodDays: 7, metrics: {
    patients: { total: patientTotal, active: activePatients },
    encounters: { total: encounterTotal, active: activeEncounters, today: todayEncounters, byStatus: encounterStatus },
    staff: { total: staffTotal, active: activeStaff },
    admissions: { active: admissionsActive },
    beds: { total: Object.values(bedStatus).reduce((sum, value) => sum + value, 0), available: bedStatus.AVAILABLE || 0, occupied: bedStatus.OCCUPIED || 0, cleaning: bedStatus.CLEANING || 0, maintenance: bedStatus.MAINTENANCE || 0 },
    laboratory: { open: labOpen, completed: labCompleted, byStatus: labStatus },
    referrals: { pending: referralPending, byStatus: countBy(referralStatusRows) },
    transfers: { pending: transferPending, byStatus: countBy(transferStatusRows) },
    audit: { today: auditToday },
  }, dailyEncounters });
});

const getNetworkAnalytics = asyncHandler(async (req, res) => {
  const currentId = asId(req.user.hospitalId);
  const connections = await HospitalConnection.find({ status: "CONNECTED", $or: [{ sourceHospitalId: currentId }, { targetHospitalId: currentId }] }).select("sourceHospitalId targetHospitalId").lean();
  const ids = new Set([String(currentId)]);
  for (const connection of connections) { ids.add(String(connection.sourceHospitalId)); ids.add(String(connection.targetHospitalId)); }
  const hospitalIds = [...ids].map(asId);
  const hospitals = await Hospital.find({ _id: { $in: hospitalIds }, status: "ACTIVE" }).select("name code").sort({ name: 1 }).lean();
  const [bedRows, encounterRows, admissionRows, labRows, referralRows, transferRows] = await Promise.all([
    Bed.aggregate([{ $match: { hospitalId: { $in: hospitalIds } } }, { $group: { _id: { hospitalId: "$hospitalId", status: "$status" }, count: { $sum: 1 } } }]),
    Encounter.aggregate([{ $match: { hospitalId: { $in: hospitalIds } } }, { $group: { _id: { hospitalId: "$hospitalId", status: "$status" }, count: { $sum: 1 } } }]),
    Admission.aggregate([{ $match: { hospitalId: { $in: hospitalIds }, status: "ADMITTED" } }, { $group: { _id: "$hospitalId", count: { $sum: 1 } } }]),
    LabRequest.aggregate([{ $match: { hospitalId: { $in: hospitalIds }, status: { $in: ["REQUESTED", "SAMPLE_COLLECTED", "PROCESSING"] } } }, { $group: { _id: "$hospitalId", count: { $sum: 1 } } }]),
    Referral.aggregate([{ $match: { $or: [{ sourceHospitalId: { $in: hospitalIds } }, { targetHospitalId: { $in: hospitalIds } }], status: "PENDING" } }, { $group: { _id: null, count: { $sum: 1 } } }]),
    TransferRequest.aggregate([{ $match: { $or: [{ sourceHospitalId: { $in: hospitalIds } }, { targetHospitalId: { $in: hospitalIds } }], status: { $in: ["PENDING", "PROCESSING"] } } }, { $group: { _id: null, count: { $sum: 1 } } }]),
  ]);
  const byHospital = new Map(hospitals.map((hospital) => [String(hospital._id), { id: String(hospital._id), name: hospital.name, code: hospital.code, isCurrent: String(hospital._id) === String(currentId), totalBeds: 0, availableBeds: 0, occupiedBeds: 0, activeEncounters: 0, activeAdmissions: 0, openLabRequests: 0 }]));
  for (const row of bedRows) { const item = byHospital.get(String(row._id.hospitalId)); if (!item) continue; item.totalBeds += row.count; if (row._id.status === "AVAILABLE") item.availableBeds += row.count; if (row._id.status === "OCCUPIED") item.occupiedBeds += row.count; }
  for (const row of encounterRows) { const item = byHospital.get(String(row._id.hospitalId)); if (item && !["DISCHARGED", "TRANSFERRED"].includes(row._id.status)) item.activeEncounters += row.count; }
  for (const row of admissionRows) { const item = byHospital.get(String(row._id)); if (item) item.activeAdmissions = row.count; }
  for (const row of labRows) { const item = byHospital.get(String(row._id)); if (item) item.openLabRequests = row.count; }
  const summary = [...byHospital.values()].reduce((acc, item) => { acc.hospitals += 1; acc.beds += item.totalBeds; acc.availableBeds += item.availableBeds; acc.activeEncounters += item.activeEncounters; acc.activeAdmissions += item.activeAdmissions; acc.openLabRequests += item.openLabRequests; return acc; }, { hospitals: 0, beds: 0, availableBeds: 0, activeEncounters: 0, activeAdmissions: 0, openLabRequests: 0 });
  return res.json({ success: true, generatedAt: new Date().toISOString(), connectedHospitals: Math.max(0, hospitals.length - 1), summary: { ...summary, pendingReferrals: referralRows[0]?.count || 0, pendingTransfers: transferRows[0]?.count || 0 }, hospitals: [...byHospital.values()] });
});

module.exports = { getHospitalAnalytics, getNetworkAnalytics };
