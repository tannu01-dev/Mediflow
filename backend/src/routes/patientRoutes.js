
const express = require("express");
const {
  createPatient,
  getPatients,
  getPatientById,
} = require("../controllers/PatientController");
const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const { auditAction } = require("../middleware/auditMiddleware");

const router = express.Router();

router.use(protect);

// Patient registration is available to these roles.
router.post(
  "/",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "NURSE", "RECEPTION"),
  auditAction({ action: "PATIENT_REGISTERED", entityType: "PATIENT", description: "Patient registration attempted" }),
  createPatient
);

// Patient search/list access.
router.get(
  "/",
  authorize(
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "NURSE",
    "DOCTOR",
    "LAB_STAFF",
    "RECEPTION"
  ),
  getPatients
);

// Patient detail access.
router.get(
  "/:id",
  authorize(
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "NURSE",
    "DOCTOR",
    "LAB_STAFF",
    "RECEPTION"
  ),
  getPatientById
);

module.exports = router;
