
const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  getAuditLogs,
  getAuditLogById,
} = require("../controllers/auditController");

const router = express.Router();

router.use(protect);
router.use(authorize("HOSPITAL_ADMIN"));

router.get("/", getAuditLogs);
router.get("/:id", getAuditLogById);

module.exports = router;
