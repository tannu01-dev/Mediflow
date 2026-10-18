
const express = require("express");
const {
  createStaff,
  getStaff,
  updateStaffStatus,
} = require("../controllers/staffController");
const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const { auditAction } = require("../middleware/auditMiddleware");

const router = express.Router();

// All staff-management endpoints require authentication.
router.use(protect);

// Only a Hospital Admin can manage staff.
router.use(authorize("HOSPITAL_ADMIN"));

router.post("/", auditAction({ action: "STAFF_CREATED", entityType: "USER", description: "Staff account creation attempted" }), createStaff);
router.get("/", getStaff);
router.patch("/:id/status", auditAction({ action: "STAFF_STATUS_UPDATED", entityType: "USER", description: "Staff account status update attempted", getEntityId: (req) => req.params.id }), updateStaffStatus);

module.exports = router;
