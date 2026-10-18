
const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    mrn: {
      type: String,
      required: true,
      trim: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: [true, "Patient first name is required"],
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },
    sex: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER", "UNKNOWN"],
      default: "UNKNOWN",
    },
    phone: {
      type: String,
      required: [true, "Patient phone number is required"],
      trim: true,
      maxlength: 25,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
      maxlength: 254,
    },
    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    bloodGroup: {
      type: String,
      enum: ["UNKNOWN", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      default: "UNKNOWN",
    },
    allergies: {
      type: [String],
      default: [],
    },
    emergencyContact: {
      name: { type: String, trim: true, default: "" },
      relationship: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

// MRN must be unique within each hospital, not globally.
patientSchema.index({ hospitalId: 1, mrn: 1 }, { unique: true });

// Common hospital-scoped listing order.
patientSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model("Patient", patientSchema);
