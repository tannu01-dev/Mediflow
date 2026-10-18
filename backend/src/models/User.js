const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const USER_ROLES = [
  "HOSPITAL_ADMIN",
  "EMERGENCY_STAFF",
  "NURSE",
  "DOCTOR",
  "LAB_STAFF",
  "RECEPTION",
  "TRANSFER_COORDINATOR",
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 100 },
    email: { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
    password: { type: String, required: [true, "Password is required"], minlength: 8, select: false },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
    department: { type: String, trim: true, default: "", maxlength: 100 },
    phone: { type: String, trim: true, default: "", maxlength: 30 },
    shift: { type: String, enum: ["DAY", "NIGHT", "ROTATIONAL", "NOT_ASSIGNED"], default: "NOT_ASSIGNED" },
    duty: { type: String, trim: true, default: "", maxlength: 160 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    hospitalId: this.hospitalId,
    department: this.department,
    phone: this.phone || "",
    shift: this.shift || "NOT_ASSIGNED",
    duty: this.duty || "",
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

userSchema.statics.USER_ROLES = USER_ROLES;

module.exports = mongoose.model("User", userSchema);
