const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");
const Bed = require("../models/Bed");
const Ward = require("../models/Ward");
const HospitalConnection = require("../models/HospitalConnection");
const { notifyUsers } = require("../services/notificationService");
const asyncHandler = require("../utils/asyncHandler");

const getNetworkHospitals = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 100);
  const filter = { status: "ACTIVE", _id: { $ne: req.user.hospitalId } };
  if (search) filter.$or = [
    { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { code: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    { address: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
  ];
  const hospitals = await Hospital.find(filter).select("name code address status").sort({ name: 1 }).limit(100).lean();
  const hospitalIds = hospitals.map((hospital) => hospital._id);
  const connections = await HospitalConnection.find({
    status: { $in: ["PENDING", "CONNECTED"] },
    $or: [{ sourceHospitalId: req.user.hospitalId }, { targetHospitalId: req.user.hospitalId }],
  }).select("sourceHospitalId targetHospitalId status").lean();
  const connectionState = new Map();
  const connectionIdMap = new Map();
  for (const connection of connections) {
    const source = String(connection.sourceHospitalId);
    const target = String(connection.targetHospitalId);
    const otherId = source === String(req.user.hospitalId) ? target : source;
    const state = connection.status === "CONNECTED" ? "CONNECTED" : (source === String(req.user.hospitalId) ? "OUTGOING_REQUEST" : "INCOMING_REQUEST");
    connectionState.set(otherId, state);
    connectionIdMap.set(otherId, String(connection._id));
  }
  const connectedIds = hospitalIds.filter((id) => connectionState.get(String(id)) === "CONNECTED");
  const [bedCounts, wardCounts] = await Promise.all([
    Bed.aggregate([
      { $match: { hospitalId: { $in: connectedIds } } },
      { $group: { _id: { hospitalId: "$hospitalId", status: "$status" }, count: { $sum: 1 } } },
    ]),
    Ward.aggregate([
      { $match: { hospitalId: { $in: connectedIds }, status: "ACTIVE" } },
      { $group: { _id: "$hospitalId", count: { $sum: 1 } } },
    ]),
  ]);
  const capacity = new Map();
  for (const item of bedCounts) {
    const id = String(item._id.hospitalId);
    const row = capacity.get(id) || { totalBeds: 0, availableBeds: 0, occupiedBeds: 0, cleaningBeds: 0, maintenanceBeds: 0 };
    row.totalBeds += item.count;
    if (item._id.status === "AVAILABLE") row.availableBeds += item.count;
    if (item._id.status === "OCCUPIED") row.occupiedBeds += item.count;
    if (item._id.status === "CLEANING") row.cleaningBeds += item.count;
    if (item._id.status === "MAINTENANCE") row.maintenanceBeds += item.count;
    capacity.set(id, row);
  }
  const wards = new Map(wardCounts.map((item) => [String(item._id), item.count]));
  return res.json({ success: true, hospitals: hospitals.map((hospital) => ({
    ...hospital,
    connectionStatus: connectionState.get(String(hospital._id)) || "AVAILABLE",
    connectionId: connectionIdMap.get(String(hospital._id)) || null,
    capacity: connectionState.get(String(hospital._id)) === "CONNECTED" ? (capacity.get(String(hospital._id)) || { totalBeds: 0, availableBeds: 0, occupiedBeds: 0, cleaningBeds: 0, maintenanceBeds: 0 }) : null,
    activeWards: connectionState.get(String(hospital._id)) === "CONNECTED" ? (wards.get(String(hospital._id)) || 0) : null,
  })) });
});

const getConnections = asyncHandler(async (req, res) => {
  const connections = await HospitalConnection.find({ $or: [{ sourceHospitalId: req.user.hospitalId }, { targetHospitalId: req.user.hospitalId }] })
    .populate("sourceHospitalId", "name code address")
    .populate("targetHospitalId", "name code address")
    .populate("requestedBy", "name role")
    .populate("decidedBy", "name role")
    .sort({ updatedAt: -1 }).limit(100).lean();
  return res.json({ success: true, count: connections.length, connections });
});

const requestConnection = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.targetHospitalId)) return res.status(400).json({ success: false, message: "A valid targetHospitalId is required." });
  if (String(req.body.targetHospitalId) === String(req.user.hospitalId)) return res.status(400).json({ success: false, message: "You cannot connect a hospital to itself." });
  const target = await Hospital.findOne({ _id: req.body.targetHospitalId, status: "ACTIVE" }).select("_id name");
  if (!target) return res.status(404).json({ success: false, message: "Active hospital not found." });
  const existingConnection = await HospitalConnection.findOne({ status: { $in: ["PENDING", "CONNECTED"] }, $or: [
    { sourceHospitalId: req.user.hospitalId, targetHospitalId: target._id },
    { sourceHospitalId: target._id, targetHospitalId: req.user.hospitalId },
  ] });
  if (existingConnection) return res.status(409).json({ success: false, message: existingConnection.status === "CONNECTED" ? "These hospitals are already connected." : "A connection request between these hospitals is already pending." });
  let connection;
  try {
    connection = await HospitalConnection.create({ sourceHospitalId: req.user.hospitalId, targetHospitalId: target._id, requestedBy: req.user.id, status: "PENDING" });
  } catch (error) {
    if (error.code !== 11000) throw error;
    connection = await HospitalConnection.findOne({ sourceHospitalId: req.user.hospitalId, targetHospitalId: target._id });
    if (connection?.status === "REJECTED" || connection?.status === "REVOKED") {
      connection.status = "PENDING"; connection.requestedBy = req.user.id; connection.decidedBy = null; connection.decidedAt = null; await connection.save();
    } else return res.status(409).json({ success: false, message: "A connection request already exists or the hospitals are connected." });
  }
  try { await notifyUsers({ hospitalId: target._id, roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"], type: "GENERAL", title: "Hospital connection request", message: `A hospital network connection request was received from your network partner.`, entityType: "NONE" }); } catch (error) { console.error("Connection notification failed:", error.message); }
  return res.status(201).json({ success: true, message: `Connection request sent to ${target.name}.`, connection });
});

const decideConnection = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid connection ID." });
  const { decision } = req.body;
  if (!["ACCEPT", "REJECT"].includes(decision)) return res.status(400).json({ success: false, message: "Decision must be ACCEPT or REJECT." });
  const connection = await HospitalConnection.findOneAndUpdate(
    { _id: req.params.id, targetHospitalId: req.user.hospitalId, status: "PENDING" },
    { $set: { status: decision === "ACCEPT" ? "CONNECTED" : "REJECTED", decidedBy: req.user.id, decidedAt: new Date() } },
    { new: true, runValidators: true }
  ).populate("sourceHospitalId", "name code").populate("targetHospitalId", "name code");
  if (!connection) return res.status(404).json({ success: false, message: "Incoming pending connection request not found." });
  try { await notifyUsers({ hospitalId: connection.sourceHospitalId._id, roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"], type: "GENERAL", title: `Hospital connection ${decision.toLowerCase()}ed`, message: `Your hospital connection request was ${decision.toLowerCase()}ed.`, entityType: "NONE" }); } catch (error) { console.error("Connection notification failed:", error.message); }
  return res.json({ success: true, message: `Hospital connection ${decision.toLowerCase()}ed.`, connection });
});

module.exports = { getNetworkHospitals, getConnections, requestConnection, decideConnection };
