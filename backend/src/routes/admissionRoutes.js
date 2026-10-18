
const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");

const {
  createWard,
  getWards,
  createBed,
  getBeds,
  admitPatient,
  getAdmissions,
  getAdmissionById,
  dischargePatient,
} = require("../controllers/admissionController");

const { auditAction } = require("../middleware/auditMiddleware");
const router = express.Router();

router.use(protect);

// Ward management
router.post(
  "/wards",
  authorize("HOSPITAL_ADMIN"),
  auditAction({ action: "WARD_CREATED", entityType: "OTHER", description: "Ward creation attempted" }),
  createWard
);

router.get(
  "/wards",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "NURSE",
    "EMERGENCY_STAFF",
    "RECEPTION",
    "TRANSFER_COORDINATOR"
  ),
  getWards
);

// Bed management
router.post(
  "/beds",
  authorize("HOSPITAL_ADMIN"),
  auditAction({ action: "BED_CREATED", entityType: "BED", description: "Bed creation attempted" }),
  createBed
);

router.get(
  "/beds",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "NURSE",
    "EMERGENCY_STAFF",
    "RECEPTION",
    "TRANSFER_COORDINATOR"
  ),
  getBeds
);

// Admissions
router.post(
  "/",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "RECEPTION"),
  auditAction({ action: "PATIENT_ADMITTED", entityType: "ADMISSION", description: "Patient admission attempted" }),
  admitPatient
);

router.get(
  "/",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "NURSE",
    "EMERGENCY_STAFF",
    "RECEPTION",
    "TRANSFER_COORDINATOR"
  ),
  getAdmissions
);

router.get(
  "/:id",
  authorize(
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "EMERGENCY_STAFF",
    "RECEPTION",
    "TRANSFER_COORDINATOR"
  ),
  getAdmissionById
);

router.patch(
  "/:id/discharge",
  authorize("HOSPITAL_ADMIN", "DOCTOR"),
  auditAction({ action: "PATIENT_DISCHARGED", entityType: "ADMISSION", description: "Patient discharge attempted", getEntityId: (req) => req.params.id }),
  dischargePatient
);

module.exports = router;
