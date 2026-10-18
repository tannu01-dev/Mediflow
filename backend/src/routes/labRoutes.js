
const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const { auditAction } = require("../middleware/auditMiddleware");

const {
  createLabRequest,
  getLabRequests,
  getLabRequestById,
  updateLabStatus,
  enterLabResult,
} = require("../controllers/labController");

const router = express.Router();

// All lab routes require authentication.
router.use(protect);

// Create a diagnostic/lab request.
router.post(
  "/encounters/:encounterId",
  authorize("HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF"),
  auditAction({
    action: "LAB_REQUEST_CREATED",
    entityType: "LAB_REQUEST",
    description: "Lab request creation attempted",
  }),
  createLabRequest
);

// List lab requests for the authenticated user's hospital.
router.get(
  "/",
  authorize("HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF", "LAB_STAFF"),
  getLabRequests
);

// Get a specific lab request.
router.get(
  "/:id",
  authorize("HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF", "LAB_STAFF"),
  getLabRequestById
);

// Update lab workflow status.
router.patch(
  "/:id/status",
  authorize("HOSPITAL_ADMIN", "LAB_STAFF"),
  auditAction({
    action: "LAB_STATUS_UPDATED",
    entityType: "LAB_REQUEST",
    description: "Lab status update attempted",
    getEntityId: (req) => req.params.id,
  }),
  updateLabStatus
);

// Enter a lab result.
router.post(
  "/:id/results",
  authorize("HOSPITAL_ADMIN", "LAB_STAFF"),
  auditAction({
    action: "LAB_RESULT_ENTERED",
    entityType: "LAB_REQUEST",
    description: "Lab result entry attempted",
    getEntityId: (req) => req.params.id,
  }),
  enterLabResult
);

module.exports = router;
