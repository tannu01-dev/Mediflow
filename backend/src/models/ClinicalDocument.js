const mongoose = require("mongoose");

const clinicalDocumentSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  documentNumber: { type: String, required: true, trim: true, unique: true },
  documentType: { type: String, required: true, enum: ["PRESCRIPTION", "LAB_REPORT", "REFERRAL_LETTER", "TRANSFER_SUMMARY", "DISCHARGE_SUMMARY"] },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  encounterId: { type: mongoose.Schema.Types.ObjectId, ref: "Encounter", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sourceEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ["FINAL", "VOID"], default: "FINAL" },
}, { timestamps: true });
clinicalDocumentSchema.index({ hospitalId: 1, encounterId: 1, createdAt: -1 });
module.exports = mongoose.model("ClinicalDocument", clinicalDocumentSchema);
