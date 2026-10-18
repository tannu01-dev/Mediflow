const mongoose = require("mongoose");
const TimelineEvent = require("../models/TimelineEvent");
const asyncHandler = require("../utils/asyncHandler");

const getTimeline = asyncHandler(async (req, res) => {
  const filter = { hospitalId: req.user.hospitalId };
  if (req.query.patientId) {
    if (!mongoose.isValidObjectId(req.query.patientId)) return res.status(400).json({ success: false, message: "Invalid patient ID" });
    filter.patientId = req.query.patientId;
  }
  if (req.query.encounterId) {
    if (!mongoose.isValidObjectId(req.query.encounterId)) return res.status(400).json({ success: false, message: "Invalid encounter ID" });
    filter.encounterId = req.query.encounterId;
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const events = await TimelineEvent.find(filter)
    .populate("actorUserId", "name role")
    .sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, count: events.length, events });
});

module.exports = { getTimeline };
