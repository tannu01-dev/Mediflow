const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { getOperationalAlerts } = require("../controllers/alertController");
const router = express.Router();
router.use(protect, authorize("HOSPITAL_ADMIN", "DOCTOR", "NURSE", "EMERGENCY_STAFF", "LAB_STAFF", "RECEPTION", "TRANSFER_COORDINATOR"));
router.get("/", getOperationalAlerts);
module.exports = router;
