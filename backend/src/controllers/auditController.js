
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");

const ALLOWED_ENTITY_TYPES = [
  "USER",
  "PATIENT",
  "ENCOUNTER",
  "CLINICAL_RECORD",
  "LAB_REQUEST",
  "ADMISSION",
  "BED",
  "TRANSFER",
  "NOTIFICATION",
  "HOSPITAL",
  "OTHER",
];

const getAuditLogs = asyncHandler(async (req, res) => {
  const filter = {
    hospitalId: req.user.hospitalId,
  };

  if (req.query.action) {
    filter.action = String(req.query.action).trim().slice(0, 100);
  }

  if (req.query.entityType) {
    if (!ALLOWED_ENTITY_TYPES.includes(req.query.entityType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entityType filter",
      });
    }

    filter.entityType = req.query.entityType;
  }

  if (req.query.outcome) {
    if (!["SUCCESS", "FAILURE"].includes(req.query.outcome)) {
      return res.status(400).json({
        success: false,
        message: "outcome must be SUCCESS or FAILURE",
      });
    }

    filter.outcome = req.query.outcome;
  }

  if (req.query.actorUserId) {
    if (!mongoose.isValidObjectId(req.query.actorUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid actorUserId",
      });
    }

    filter.actorUserId = req.query.actorUserId;
  }

  if (req.query.entityId) {
    if (!mongoose.isValidObjectId(req.query.entityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entityId",
      });
    }

    filter.entityId = req.query.entityId;
  }

  if (req.query.from || req.query.to) {
    filter.createdAt = {};

    if (req.query.from) {
      const from = new Date(req.query.from);

      if (Number.isNaN(from.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid from date",
        });
      }

      filter.createdAt.$gte = from;
    }

    if (req.query.to) {
      const to = new Date(req.query.to);

      // A date-only filter means the entire selected calendar day, not midnight.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) {
        to.setUTCHours(23, 59, 59, 999);
      }

      if (Number.isNaN(to.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid to date",
        });
      }

      filter.createdAt.$lte = to;
    }

    if (
      filter.createdAt.$gte &&
      filter.createdAt.$lte &&
      filter.createdAt.$gte > filter.createdAt.$lte
    ) {
      return res.status(400).json({
        success: false,
        message: "'from' date must be before 'to' date",
      });
    }
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("actorUserId", "name email role")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    count: logs.length,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    auditLogs: logs,
  });
});

const getAuditLogById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid audit log ID",
    });
  }

  const auditLog = await AuditLog.findOne({
    _id: req.params.id,
    hospitalId: req.user.hospitalId,
  })
    .populate("actorUserId", "name email role")
    .lean();

  if (!auditLog) {
    return res.status(404).json({
      success: false,
      message: "Audit log not found",
    });
  }

  return res.json({
    success: true,
    auditLog,
  });
});

module.exports = {
  getAuditLogs,
  getAuditLogById,
};
