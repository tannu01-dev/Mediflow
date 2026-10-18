
const mongoose = require("mongoose");

const bedSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    wardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ward",
      required: true,
      index: true,
    },
    bedNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    bedType: {
      type: String,
      enum: ["STANDARD", "ICU", "ISOLATION", "PRIVATE", "PEDIATRIC"],
      default: "STANDARD",
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "OCCUPIED", "CLEANING", "MAINTENANCE"],
      default: "AVAILABLE",
      index: true,
    },
    currentEncounterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Encounter",
      default: null,
    },
    statusNote: { type: String, trim: true, maxlength: 500, default: "" },
    statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    statusUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bedSchema.index(
  { hospitalId: 1, wardId: 1, bedNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model("Bed", bedSchema);
