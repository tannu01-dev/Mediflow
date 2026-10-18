
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "EMERGENCY",
        "LAB_RESULT",
        "TRANSFER",
        "ADMISSION",
        "BED_UPDATE",
        "GENERAL",
      ],
      default: "GENERAL",
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    entityType: {
      type: String,
      enum: ["ENCOUNTER", "LAB_REQUEST", "TRANSFER", "ADMISSION", "BED", "NONE"],
      default: "NONE",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({
  hospitalId: 1,
  recipientUserId: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Notification", notificationSchema);
