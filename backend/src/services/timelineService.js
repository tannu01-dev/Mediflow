const TimelineEvent = require("../models/TimelineEvent");
const Encounter = require("../models/Encounter");
const LabRequest = require("../models/LabRequest");
const Admission = require("../models/Admission");
const TransferRequest = require("../models/TransferRequest");
const Bed = require("../models/Bed");
const { emitToHospital } = require("../config/socket");

async function resolveEntityContext(entityType, entityId, hospitalId) {
  if (!entityId || !entityType) return {};
  try {
    if (entityType === "ENCOUNTER") {
      const doc = await Encounter.findOne({ _id: entityId, hospitalId }).select("patientId _id").lean();
      return doc ? { patientId: doc.patientId, encounterId: doc._id } : {};
    }
    if (entityType === "LAB_REQUEST") {
      const doc = await LabRequest.findOne({ _id: entityId, hospitalId }).select("patientId encounterId").lean();
      return doc ? { patientId: doc.patientId, encounterId: doc.encounterId } : {};
    }
    if (entityType === "ADMISSION") {
      const doc = await Admission.findOne({ _id: entityId, hospitalId }).select("patientId encounterId").lean();
      return doc ? { patientId: doc.patientId, encounterId: doc.encounterId } : {};
    }
    if (entityType === "TRANSFER") {
      const doc = await TransferRequest.findOne({ $or: [{ sourceHospitalId: hospitalId }, { targetHospitalId: hospitalId }], _id: entityId }).select("sourcePatientId sourceEncounterId receivingPatientId receivingEncounterId").lean();
      if (!doc) return {};
      return {
        patientId: doc.receivingPatientId || doc.sourcePatientId || null,
        encounterId: doc.receivingEncounterId || doc.sourceEncounterId || null,
      };
    }
    if (entityType === "BED") {
      const doc = await Bed.findOne({ _id: entityId, hospitalId }).select("currentEncounterId").lean();
      if (doc?.currentEncounterId) {
        const encounter = await Encounter.findOne({ _id: doc.currentEncounterId, hospitalId }).select("patientId _id").lean();
        return encounter ? { patientId: encounter.patientId, encounterId: encounter._id } : {};
      }
    }
  } catch (error) {
    console.error("Timeline entity context lookup failed:", error.message);
  }
  return {};
}

async function recordTimelineEvent(input = {}) {
  try {
    const { hospitalId, title, description = "", eventType = "GENERAL", entityType = "NONE", entityId = null } = input;
    if (!hospitalId || !title) return null;
    const context = await resolveEntityContext(entityType, entityId, hospitalId);
    const event = await TimelineEvent.create({
      hospitalId,
      patientId: input.patientId || context.patientId || null,
      encounterId: input.encounterId || context.encounterId || null,
      actorUserId: input.actorUserId || null,
      eventType,
      title: String(title).slice(0, 180),
      description: String(description || "").slice(0, 1000),
      entityType,
      entityId,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    });
    const payload = {
      id: event._id.toString(),
      eventType: event.eventType,
      title: event.title,
      patientId: event.patientId ? event.patientId.toString() : null,
      encounterId: event.encounterId ? event.encounterId.toString() : null,
      entityType: event.entityType,
      entityId: event.entityId ? event.entityId.toString() : null,
      createdAt: event.createdAt,
    };
    emitToHospital(String(hospitalId), "timeline:new", payload);
    emitToHospital(String(hospitalId), "hospital:event", { kind: event.eventType, at: event.createdAt });
    emitToHospital(String(hospitalId), "dashboard:refresh", { kind: event.eventType, at: event.createdAt });
    return event;
  } catch (error) {
    // A timeline write must never break the clinical operation that triggered it.
    console.error("Timeline event could not be recorded:", error.message);
    return null;
  }
}

module.exports = { recordTimelineEvent };
