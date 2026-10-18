
const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const { auditAction } = require("../middleware/auditMiddleware");

const {
  createTransferRequest,
  getTransfers,
  getEligibleEncounters,
  getTransferById,
  decideTransfer,
  cancelTransfer,
  updateTransferWorkflow,
} = require("../controllers/transferController");

const router = express.Router();

// All transfer routes require authentication.
router.use(protect);

// Create a request to transfer a patient to another hospital.
router.post(
  "/",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "EMERGENCY_STAFF",
    "TRANSFER_COORDINATOR"
  ),
  auditAction({
    action: "TRANSFER_REQUEST_CREATED",
    entityType: "TRANSFER",
    description: "Transfer request creation attempted",
  }),
  createTransferRequest
);

// List transfers accessible to the authenticated hospital.
router.get(
  "/",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "EMERGENCY_STAFF",
    "TRANSFER_COORDINATOR"
  ),
  getTransfers
);

router.get(
  "/eligible-encounters",
  authorize("HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF", "TRANSFER_COORDINATOR"),
  getEligibleEncounters
);

// Get a specific transfer request.
router.get(
  "/:id",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "EMERGENCY_STAFF",
    "TRANSFER_COORDINATOR"
  ),
  getTransferById
);

// Accept or reject an incoming transfer.
router.patch(
  "/:id/decision",
  authorize("HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"),
  auditAction({
    action: "TRANSFER_DECISION_MADE",
    entityType: "TRANSFER",
    description: "Transfer decision attempted",
    getEntityId: (req) => req.params.id,
  }),
  decideTransfer
);

// Cancel an eligible transfer request.
router.patch(
  "/:id/cancel",
  authorize("HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"),
  auditAction({
    action: "TRANSFER_CANCELLED",
    entityType: "TRANSFER",
    description: "Transfer cancellation attempted",
    getEntityId: (req) => req.params.id,
  }),
  cancelTransfer
);


router.patch(
  "/:id/workflow",
  authorize("HOSPITAL_ADMIN", "TRANSFER_COORDINATOR", "EMERGENCY_STAFF"),
  auditAction({ action: "TRANSFER_WORKFLOW_UPDATED", entityType: "TRANSFER", description: "Transfer workflow update attempted", getEntityId: (req) => req.params.id }),
  updateTransferWorkflow
);

module.exports = router;
