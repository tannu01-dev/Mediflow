
const mongoose = require("mongoose");

const wardSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    wardType: {
      type: String,
      enum: [
        "GENERAL",
        "EMERGENCY",
        "ICU",
        "MATERNITY",
        "PEDIATRIC",
        "SURGICAL",
        "PRIVATE",
        "OTHER",
      ],
      default: "GENERAL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

wardSchema.index(
  { hospitalId: 1, code: 1 },
  { unique: true }
);

module.exports = mongoose.model("Ward", wardSchema);
