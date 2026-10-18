
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },

    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    actorRole: {
      type: String,
      default: "SYSTEM",
      maxlength: 50,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      enum: [
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
      ],
      index: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    requestId: {
      type: String,
      maxlength: 100,
      default: "",
    },

    ipAddress: {
      type: String,
      maxlength: 100,
      default: "",
    },

    userAgent: {
      type: String,
      maxlength: 500,
      default: "",
    },

    outcome: {
      type: String,
      enum: ["SUCCESS", "FAILURE"],
      default: "SUCCESS",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

auditLogSchema.index({ hospitalId: 1, createdAt: -1 });
auditLogSchema.index({ hospitalId: 1, entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ hospitalId: 1, actorUserId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
