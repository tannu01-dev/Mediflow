const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listDocuments, generateDocument } = require("../controllers/documentController");
const { auditAction } = require("../middleware/auditMiddleware");
const router = express.Router();
router.use(protect);
router.get("/", authorize("HOSPITAL_ADMIN", "DOCTOR", "NURSE", "EMERGENCY_STAFF", "LAB_STAFF", "RECEPTION", "TRANSFER_COORDINATOR"), listDocuments);
router.post("/generate", authorize("HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF", "LAB_STAFF", "TRANSFER_COORDINATOR"), auditAction({ action: "CLINICAL_DOCUMENT_GENERATED", entityType: "OTHER", description: "Clinical document generation attempted", getEntityId: (req) => req.body.encounterId }), generateDocument);
module.exports = router;
