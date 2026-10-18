
const mongoose = require("mongoose");

const VITALS_SCHEMA = new mongoose.Schema(
  {
    temperatureC: { type: Number, min: 25, max: 45 },
    pulseBpm: { type: Number, min: 0, max: 300 },
    respiratoryRate: { type: Number, min: 0, max: 100 },
    systolicBP: { type: Number, min: 0, max: 350 },
    diastolicBP: { type: Number, min: 0, max: 250 },
    oxygenSaturation: { type: Number, min: 0, max: 100 },
    weightKg: { type: Number, min: 0, max: 500 },
    heightCm: { type: Number, min: 0, max: 300 },
  },
  { _id: false }
);

const nursingObservationSchema = new mongoose.Schema({
  vitals: { type: VITALS_SCHEMA, default: () => ({}) },
  note: { type: String, trim: true, maxlength: 3000, default: "" },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recordedAt: { type: Date, default: Date.now },
}, { _id: true });

const encounterSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    encounterNumber: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["EMERGENCY", "OUTPATIENT", "INPATIENT"],
      default: "EMERGENCY",
    },
    chiefComplaint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    triageLevel: {
      type: String,
      enum: [
        "RESUSCITATION",
        "EMERGENCY",
        "URGENT",
        "LESS_URGENT",
        "NON_URGENT",
        "UNTRIAGED",
      ],
      default: "UNTRIAGED",
    },
    triageNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },
    vitals: {
      type: VITALS_SCHEMA,
      default: () => ({}),
    },
    nursingObservations: { type: [nursingObservationSchema], default: [] },
    status: {
      type: String,
      enum: [
        "WAITING",
        "IN_TRIAGE",
        "WAITING_FOR_DOCTOR",
        "IN_TREATMENT",
        "ADMITTED",
        "TRANSFERRED",
        "DISCHARGED",
      ],
      default: "WAITING",
      index: true,
    },
    assignedDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    triagedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    triagedAt: {
      type: Date,
      default: null,
    },
    doctorAssignedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

encounterSchema.index(
  { hospitalId: 1, encounterNumber: 1 },
  { unique: true }
);

encounterSchema.index({
  hospitalId: 1,
  status: 1,
  triageLevel: 1,
  createdAt: 1,
});

module.exports = mongoose.model("Encounter", encounterSchema);
