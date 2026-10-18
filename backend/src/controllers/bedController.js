const mongoose = require("mongoose");
const Bed = require("../models/Bed");
const Ward = require("../models/Ward");
const asyncHandler = require("../utils/asyncHandler");
const { recordTimelineEvent } = require("../services/timelineService");

const updateBedStatus = asyncHandler(async (req, res) => {
  const { status, note = "" } = req.body;
  const allowedStatuses = ["AVAILABLE", "MAINTENANCE"];
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid bed ID" });
  }
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be AVAILABLE or MAINTENANCE" });
  }
  if (typeof note !== "string" || note.length > 500) {
    return res.status(400).json({ success: false, message: "Note must be text up to 500 characters" });
  }

  const bed = await Bed.findOne({ _id: req.params.id, hospitalId: req.user.hospitalId });
  if (!bed) return res.status(404).json({ success: false, message: "Bed not found in your hospital" });
  if (bed.status === "OCCUPIED") {
    return res.status(409).json({ success: false, message: "An occupied bed cannot be changed manually" });
  }
  if (bed.status === "CLEANING" && status === "MAINTENANCE") {
    bed.status = "MAINTENANCE";
  } else if (["AVAILABLE", "MAINTENANCE", "CLEANING"].includes(bed.status)) {
    bed.status = status;
  } else {
    return res.status(409).json({ success: false, message: "Invalid bed status transition" });
  }
  bed.statusNote = note.trim();
  bed.statusUpdatedBy = req.user.id;
  bed.statusUpdatedAt = new Date();
  await bed.save();
  await recordTimelineEvent({ hospitalId: req.user.hospitalId, actorUserId: req.user.id, eventType: "BED_STATUS_UPDATED", title: `Bed ${bed.bedNumber} marked ${bed.status.toLowerCase()}`, description: "Bed availability status was updated.", entityType: "BED", entityId: bed._id });
  return res.json({ success: true, message: `Bed marked ${bed.status.toLowerCase()}`, bed });
});

const getBedSummary = asyncHandler(async (req, res) => {
  const hospitalId = new mongoose.Types.ObjectId(req.user.hospitalId);
  const [beds, wards, admissions] = await Promise.all([
    Bed.aggregate([
      { $match: { hospitalId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Ward.countDocuments({ hospitalId, status: "ACTIVE" }),
    require("../models/Admission").countDocuments({ hospitalId: req.user.hospitalId, status: "ADMITTED" }),
  ]);
  const summary = { totalBeds: 0, available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
  for (const row of beds) {
    summary.totalBeds += row.count;
    if (row._id === "AVAILABLE") summary.available = row.count;
    if (row._id === "OCCUPIED") summary.occupied = row.count;
    if (row._id === "CLEANING") summary.cleaning = row.count;
    if (row._id === "MAINTENANCE") summary.maintenance = row.count;
  }
  return res.json({ success: true, summary: { ...summary, activeWards: wards, activeAdmissions: admissions } });
});

module.exports = { updateBedStatus, getBedSummary };
