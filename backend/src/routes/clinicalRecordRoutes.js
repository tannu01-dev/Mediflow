
const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");

const {
  getClinicalRecord,
  addClinicalNote,
  addDiagnosis,
  addPrescription,
} = require("../controllers/clinicalRecordController");

const { auditAction } = require("../middleware/auditMiddleware");

const router = express.Router();

router.use(protect);

router.get(
  "/:encounterId",
  authorize("HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF"),
  getClinicalRecord
);

router.post(
  "/:encounterId/notes",
  authorize("DOCTOR"),
  auditAction({ action: "CLINICAL_NOTE_ADDED", entityType: "CLINICAL_RECORD", description: "Clinical note addition attempted", getEntityId: (req) => req.params.encounterId }),
  addClinicalNote
);

router.post(
  "/:encounterId/diagnoses",
  authorize("DOCTOR"),
  auditAction({ action: "DIAGNOSIS_RECORDED", entityType: "CLINICAL_RECORD", description: "Diagnosis entry attempted", getEntityId: (req) => req.params.encounterId }),
  addDiagnosis
);

router.post(
  "/:encounterId/prescriptions",
  authorize("DOCTOR"),
  auditAction({ action: "PRESCRIPTION_CREATED", entityType: "CLINICAL_RECORD", description: "Prescription creation attempted", getEntityId: (req) => req.params.encounterId }),
  addPrescription
);

module.exports = router;
