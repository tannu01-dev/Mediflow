
const mongoose = require("mongoose");

const admissionSchema = new mongoose.Schema(
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
    wardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ward",
      required: true,
    },
    bedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bed",
      required: true,
    },
    admittedAt: {
      type: Date,
      default: Date.now,
    },
    admittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["ADMITTED", "DISCHARGED"],
      default: "ADMITTED",
      index: true,
    },
    discharge: {
      dischargedAt: { type: Date, default: null },
      dischargedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      diagnosis: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: "",
      },
      summary: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: "",
      },
      instructions: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: "",
      },
      destination: {
        type: String,
        enum: ["HOME", "TRANSFER", "OTHER", ""],
        default: "",
      },
    },
  },
  { timestamps: true }
);

admissionSchema.index({ hospitalId: 1, status: 1, admittedAt: -1 });

// A given encounter can have only one admission record in this module.
admissionSchema.index(
  { hospitalId: 1, encounterId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Admission", admissionSchema);
