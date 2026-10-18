const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { auditAction } = require("../middleware/auditMiddleware");
const { getDoctorWorkspace, getNurseWorkspace, addNursingObservation } = require("../controllers/workspaceController");

const router = express.Router();
router.use(protect);
router.get("/doctor", authorize("DOCTOR"), getDoctorWorkspace);
router.get("/nurse", authorize("NURSE", "EMERGENCY_STAFF", "HOSPITAL_ADMIN"), getNurseWorkspace);
router.post("/encounters/:id/nursing-observations", authorize("NURSE", "EMERGENCY_STAFF"), auditAction({ action: "NURSING_OBSERVATION_ADDED", entityType: "ENCOUNTER", description: "Nursing observation recorded", getEntityId: (req) => req.params.id }), addNursingObservation);
module.exports = router;
