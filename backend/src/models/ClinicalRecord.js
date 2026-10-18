
const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    subjective: { type: String, trim: true, maxlength: 5000, default: "" },
    objective: { type: String, trim: true, maxlength: 5000, default: "" },
    assessment: { type: String, trim: true, maxlength: 5000, default: "" },
    plan: { type: String, trim: true, maxlength: 5000, default: "" },
    generalNotes: { type: String, trim: true, maxlength: 10000, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const diagnosisSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    code: { type: String, trim: true, maxlength: 30, default: "" },
    type: {
      type: String,
      enum: ["PROVISIONAL", "CONFIRMED", "DIFFERENTIAL"],
      default: "PROVISIONAL",
    },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const prescriptionItemSchema = new mongoose.Schema(
  {
    medicineName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    strength: { type: String, trim: true, maxlength: 100, default: "" },
    dose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    route: {
      type: String,
      enum: [
        "ORAL",
        "IV",
        "IM",
        "SUBCUTANEOUS",
        "TOPICAL",
        "INHALATION",
        "OPHTHALMIC",
        "OTIC",
        "RECTAL",
        "OTHER",
      ],
      default: "ORAL",
    },
    frequency: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    duration: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    quantity: { type: String, trim: true, maxlength: 100, default: "" },
    instructions: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { _id: true }
);

const prescriptionSchema = new mongoose.Schema(
  {
    items: {
      type: [prescriptionItemSchema],
      validate: {
        validator: (items) => items.length > 0 && items.length <= 50,
        message: "A prescription must contain 1 to 50 medicines",
      },
    },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    prescribedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    prescribedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { _id: true }
);

const clinicalRecordSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    encounterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Encounter",
      required: true,
      unique: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    notes: { type: [noteSchema], default: [] },
    diagnoses: { type: [diagnosisSchema], default: [] },
    prescriptions: { type: [prescriptionSchema], default: [] },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

clinicalRecordSchema.index({ hospitalId: 1, patientId: 1, updatedAt: -1 });

module.exports = mongoose.model("ClinicalRecord", clinicalRecordSchema);
