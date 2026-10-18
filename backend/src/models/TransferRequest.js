
const mongoose = require("mongoose");

const transferRequestSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    targetHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    sourceEncounterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Encounter",
      required: true,
    },
    sourcePatientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    // Minimum patient details authorized for transfer.
    patientSummary: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, trim: true, default: "" },
      dateOfBirth: { type: Date, required: true },
      sex: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      bloodGroup: { type: String, trim: true, default: "" },
      allergies: { type: [String], default: [] },
    },

    chiefComplaint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    urgency: {
      type: String,
      enum: ["ROUTINE", "URGENT", "EMERGENCY"],
      default: "URGENT",
      index: true,
    },
    clinicalSummary: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: "",
    },
    diagnosesSummary: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    medicationsSummary: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    labSummary: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    vitals: {
      temperatureC: { type: Number, default: null },
      pulseBpm: { type: Number, default: null },
      respiratoryRate: { type: Number, default: null },
      systolicBP: { type: Number, default: null },
      diastolicBP: { type: Number, default: null },
      oxygenSaturation: { type: Number, default: null },
      weightKg: { type: Number, default: null },
      heightCm: { type: Number, default: null },
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "ACCEPTED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    workflowStatus: {
      type: String,
      enum: ["REQUESTED", "SENT", "REVIEWED", "ACCEPTED", "REJECTED", "TRANSPORT_ARRANGED", "IN_TRANSIT", "ARRIVED", "RECEIVED", "COMPLETED", "CANCELLED"],
      default: "REQUESTED",
      index: true,
    },
    workflowHistory: [{
      status: { type: String, required: true },
      note: { type: String, trim: true, maxlength: 1000, default: "" },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      changedAt: { type: Date, default: Date.now },
    }],
    decisionNote: { type: String, trim: true, maxlength: 3000, default: "" },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    decidedAt: { type: Date, default: null },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acceptedAt: { type: Date, default: null },

    // Created inside the receiving hospital when accepted.
    receivingPatientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },
    receivingEncounterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Encounter",
      default: null,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

transferRequestSchema.index({ sourceHospitalId: 1, status: 1, createdAt: -1 });
transferRequestSchema.index({ targetHospitalId: 1, status: 1, createdAt: -1 });
transferRequestSchema.index({ sourceHospitalId: 1, sourceEncounterId: 1 });

module.exports = mongoose.model("TransferRequest", transferRequestSchema);
