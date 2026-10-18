
const express = require("express");
const {
  registerHospitalAdmin,
  login,
  getMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerHospitalAdmin);
router.post("/login", login);
router.get("/me", protect, getMe);

module.exports = router;
