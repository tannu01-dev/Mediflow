const User = require("../models/User");
const Hospital = require("../models/Hospital");
const asyncHandler = require("../utils/asyncHandler");

const STAFF_ROLES = [
  "EMERGENCY_STAFF",
  "NURSE",
  "DOCTOR",
  "LAB_STAFF",
  "RECEPTION",
  "TRANSFER_COORDINATOR",
];
const SHIFTS = ["DAY", "NIGHT", "ROTATIONAL", "NOT_ASSIGNED"];

const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role, department = "", phone = "", shift = "NOT_ASSIGNED", duty = "" } = req.body;

  if (![name, email, password, role].every((value) => typeof value === "string" && value.trim())) {
    return res.status(400).json({ success: false, message: "Name, email, password and role are required" });
  }
  if (name.trim().length < 2 || name.trim().length > 100) {
    return res.status(400).json({ success: false, message: "Name must be between 2 and 100 characters" });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: "Please provide a valid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
  }
  if (!STAFF_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid staff role", allowedRoles: STAFF_ROLES });
  }
  if (!SHIFTS.includes(shift)) {
    return res.status(400).json({ success: false, message: "Invalid shift selection" });
  }
  for (const [field, value, max] of [["department", department, 100], ["phone", phone, 30], ["duty", duty, 160]]) {
    if (typeof value !== "string" || value.length > max) {
      return res.status(400).json({ success: false, message: `Invalid ${field}` });
    }
  }

  const hospital = await Hospital.findById(req.user.hospitalId).select("status");
  if (!hospital || hospital.status !== "ACTIVE") {
    return res.status(403).json({ success: false, message: "Your hospital is not active" });
  }

  if (await User.exists({ email: normalizedEmail })) {
    return res.status(409).json({ success: false, message: "This email is already registered" });
  }

  try {
    const user = await User.create({
      name: name.trim(), email: normalizedEmail, password, role,
      department: department.trim(), phone: phone.trim(), shift, duty: duty.trim(),
      hospitalId: req.user.hospitalId,
    });
    return res.status(201).json({ success: true, message: "Staff account created successfully", user: user.toSafeObject() });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This email is already registered" });
    throw error;
  }
});

const getStaff = asyncHandler(async (req, res) => {
  const filter = { hospitalId: req.user.hospitalId, role: { $in: STAFF_ROLES } };
  if (req.query.role) {
    if (!STAFF_ROLES.includes(req.query.role)) return res.status(400).json({ success: false, message: "Invalid role filter" });
    filter.role = req.query.role;
  }
  if (req.query.search) {
    const search = String(req.query.search).trim().slice(0, 100);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
        { department: { $regex: escaped, $options: "i" } },
      ];
    }
  }
  const staff = await User.find(filter).select("-password").sort({ createdAt: -1 }).limit(300).lean();
  const counts = STAFF_ROLES.reduce((result, role) => {
    result[role] = staff.filter((person) => person.role === role).length;
    return result;
  }, {});
  return res.status(200).json({ success: true, count: staff.length, counts, staff });
});

const updateStaffStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be true or false" });
  const user = await User.findOne({ _id: req.params.id, hospitalId: req.user.hospitalId, role: { $in: STAFF_ROLES } });
  if (!user) return res.status(404).json({ success: false, message: "Staff member not found in your hospital" });
  user.isActive = isActive;
  await user.save();
  return res.status(200).json({ success: true, message: isActive ? "Staff account activated" : "Staff account deactivated", user: user.toSafeObject() });
});

module.exports = { createStaff, getStaff, updateStaffStatus };
