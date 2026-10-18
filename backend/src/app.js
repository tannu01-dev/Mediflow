
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { getAllowedOrigins, isOriginAllowed } = require("./utils/securityConfig");
const crypto = require("crypto");

const staffRoutes = require("./routes/staffRoutes");
const patientRoutes = require("./routes/patientRoutes");
const encounterRoutes = require("./routes/encounterRoutes");
const clinicalRecordRoutes = require("./routes/clinicalRecordRoutes");
const labRoutes = require("./routes/labRoutes");
const admissionRoutes = require("./routes/admissionRoutes");
const transferRoutes = require("./routes/transferRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const auditRoutes = require("./routes/auditRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const bedRoutes = require("./routes/bedRoutes");
const timelineRoutes = require("./routes/timelineRoutes");
const alertRoutes = require("./routes/alertRoutes");
const networkRoutes = require("./routes/networkRoutes");
const referralRoutes = require("./routes/referralRoutes");
const documentRoutes = require("./routes/documentRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

const app = express();

app.disable("x-powered-by");

app.use(helmet());

const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  })
);

app.use((req, res, next) => {
  const supplied = req.get("x-request-id");
  req.requestId = supplied && /^[a-zA-Z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many authentication attempts. Try again later." },
  })
);

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to MediFlow API",
    health: "/api/health",
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/encounters", encounterRoutes);
app.use("/api/clinical-records", clinicalRecordRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/beds", bedRoutes);
app.use("/api/timeline", timelineRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/network", networkRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
