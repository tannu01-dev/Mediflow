const mongoose = require("mongoose");
const hospitalConnectionSchema = new mongoose.Schema({
  sourceHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  targetHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  status: { type: String, enum: ["PENDING", "CONNECTED", "REJECTED", "REVOKED"], default: "PENDING", index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });
hospitalConnectionSchema.index({ sourceHospitalId: 1, targetHospitalId: 1 }, { unique: true });
module.exports = mongoose.model("HospitalConnection", hospitalConnectionSchema);
