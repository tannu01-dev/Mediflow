
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/", (req, res) => {
  const databaseStates = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const databaseStatus =
    databaseStates[mongoose.connection.readyState] || "unknown";

  res.status(200).json({
    success: true,
    message: "MediFlow API is running",
    service: "MediFlow Backend",
    status: "healthy",
    database: databaseStatus,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
