const mongoose = require("mongoose");

const timelineEventSchema = new mongoose.Schema(
  {
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null, index: true },
    encounterId: { type: mongoose.Schema.Types.ObjectId, ref: "Encounter", default: null, index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    eventType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    entityType: { type: String, trim: true, maxlength: 50, default: "NONE" },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

timelineEventSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
timelineEventSchema.index({ hospitalId: 1, encounterId: 1, createdAt: -1 });
timelineEventSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model("TimelineEvent", timelineEventSchema);
