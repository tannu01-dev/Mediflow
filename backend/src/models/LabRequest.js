
const mongoose = require("mongoose");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "SAMPLE_COLLECTED",
        "PROCESSING",
        "COMPLETED",
        "CANCELLED",
      ],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 1000, default: "" },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const labRequestSchema = new mongoose.Schema(
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
    encounterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Encounter",
      required: true,
      index: true,
    },
    requestNumber: {
      type: String,
      required: true,
      trim: true,
    },
    testName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    testCode: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "",
    },
    category: {
      type: String,
      enum: [
        "HEMATOLOGY",
        "BIOCHEMISTRY",
        "MICROBIOLOGY",
        "IMMUNOLOGY",
        "URINALYSIS",
        "IMAGING",
        "OTHER",
      ],
      default: "OTHER",
    },
    priority: {
      type: String,
      enum: ["ROUTINE", "URGENT", "STAT"],
      default: "ROUTINE",
    },
    clinicalIndication: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    specimenType: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "SAMPLE_COLLECTED",
        "PROCESSING",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },
    sampleCollectedAt: { type: Date, default: null },
    sampleCollectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    result: {
      value: { type: String, trim: true, maxlength: 5000, default: "" },
      units: { type: String, trim: true, maxlength: 100, default: "" },
      referenceRange: {
        type: String,
        trim: true,
        maxlength: 300,
        default: "",
      },
      interpretation: {
        type: String,
        enum: ["NOT_REVIEWED", "NORMAL", "ABNORMAL", "CRITICAL", "INCONCLUSIVE"],
        default: "NOT_REVIEWED",
      },
      remarks: { type: String, trim: true, maxlength: 3000, default: "" },
      enteredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      enteredAt: { type: Date, default: null },
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

labRequestSchema.index(
  { hospitalId: 1, requestNumber: 1 },
  { unique: true }
);

labRequestSchema.index({
  hospitalId: 1,
  status: 1,
  priority: 1,
  createdAt: 1,
});

module.exports = mongoose.model("LabRequest", labRequestSchema);
