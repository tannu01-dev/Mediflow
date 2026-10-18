const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { auditAction } = require("../middleware/auditMiddleware");
const { updateBedStatus, getBedSummary } = require("../controllers/bedController");

const router = express.Router();
router.use(protect);
router.get("/summary", authorize("HOSPITAL_ADMIN", "DOCTOR", "NURSE", "EMERGENCY_STAFF", "RECEPTION", "TRANSFER_COORDINATOR"), getBedSummary);
router.patch("/:id/status", authorize("HOSPITAL_ADMIN", "NURSE", "EMERGENCY_STAFF"), auditAction({ action: "BED_STATUS_UPDATED", entityType: "BED", description: "Bed status changed", getEntityId: (req) => req.params.id }), updateBedStatus);
module.exports = router;
