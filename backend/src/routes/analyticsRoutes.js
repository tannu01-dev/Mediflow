const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { getHospitalAnalytics, getNetworkAnalytics } = require("../controllers/analyticsController");
const router = express.Router();
router.use(protect);
router.get("/hospital", authorize("HOSPITAL_ADMIN"), getHospitalAnalytics);
router.get("/network", authorize("HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"), getNetworkAnalytics);
module.exports = router;
