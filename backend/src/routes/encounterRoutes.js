const express = require("express");
const {
  createEncounter,
  getEncounterQueue,
  getAvailableDoctors,
  getEncounterById,
  updateTriage,
  assignDoctor,
} = require("../controllers/encounterController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { auditAction } = require("../middleware/auditMiddleware");

const router = express.Router();
router.use(protect);

router.get(
  "/doctors",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "DOCTOR", "NURSE", "RECEPTION"),
  getAvailableDoctors
);

router.post(
  "/",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "RECEPTION"),
  auditAction({
    action: "ENCOUNTER_CREATED",
    entityType: "ENCOUNTER",
    description: "Encounter registered",
  }),
  createEncounter
);

router.get(
  "/",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "DOCTOR", "NURSE", "RECEPTION"),
  getEncounterQueue
);

router.patch(
  "/:id/triage",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "NURSE"),
  auditAction({
    action: "ENCOUNTER_TRIAGE_UPDATED",
    entityType: "ENCOUNTER",
    description: "Encounter triage updated",
    getEntityId: (req) => req.params.id,
  }),
  updateTriage
);

router.patch(
  "/:id/assign-doctor",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF"),
  auditAction({
    action: "DOCTOR_ASSIGNED",
    entityType: "ENCOUNTER",
    description: "Doctor assigned to encounter",
    getEntityId: (req) => req.params.id,
  }),
  assignDoctor
);

router.get(
  "/:id",
  authorize("HOSPITAL_ADMIN", "EMERGENCY_STAFF", "DOCTOR", "NURSE", "RECEPTION"),
  getEncounterById
);

module.exports = router;
