const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  referralNumber: { type: String, required: true, unique: true, index: true },
  sourceHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  targetHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  sourcePatientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
  sourceEncounterId: { type: mongoose.Schema.Types.ObjectId, ref: "Encounter", required: true },
  patientSummary: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: "", trim: true },
    dateOfBirth: { type: Date, required: true },
    sex: { type: String, default: "" },
    bloodGroup: { type: String, default: "" },
    allergies: { type: [String], default: [] },
  },
  specialty: { type: String, required: true, trim: true, maxlength: 100 },
  reason: { type: String, required: true, trim: true, maxlength: 2500 },
  urgency: { type: String, enum: ["ROUTINE", "URGENT", "EMERGENCY"], default: "ROUTINE" },
  clinicalSummary: { type: String, trim: true, maxlength: 8000, default: "" },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
  decisionNote: { type: String, trim: true, maxlength: 2000, default: "" },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });

referralSchema.index({ sourceHospitalId: 1, status: 1, createdAt: -1 });
referralSchema.index({ targetHospitalId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model("Referral", referralSchema);
