
const AuditLog = require("../models/AuditLog");

const ALLOWED_ENTITY_TYPES = [
  "USER",
  "PATIENT",
  "ENCOUNTER",
  "CLINICAL_RECORD",
  "LAB_REQUEST",
  "ADMISSION",
  "BED",
  "TRANSFER",
  "NOTIFICATION",
  "HOSPITAL",
  "OTHER",
];

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "secret",
  "jwt",
  "medicalrecord",
  "clinicalnotes",
  "diagnosis",
  "prescription",
  "allergies",
  "dateofbirth",
  "phone",
  "email",
  "address",
]);

function sanitizeMetadata(value, depth = 0) {
  if (depth > 4 || value == null) return undefined;

  if (typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 200);
    if (typeof value === "number" || typeof value === "boolean") return value;
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeMetadata(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  const result = {};

  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""))) {
      continue;
    }

    const sanitized = sanitizeMetadata(item, depth + 1);

    if (sanitized !== undefined) {
      result[key.slice(0, 100)] = sanitized;
    }
  }

  return result;
}

async function writeAuditLog({
  hospitalId,
  actorUserId = null,
  actorRole = "SYSTEM",
  action,
  entityType = "OTHER",
  entityId = null,
  description = "",
  metadata = {},
  requestId = "",
  ipAddress = "",
  userAgent = "",
  outcome = "SUCCESS",
}) {
  if (!hospitalId || !action) {
    throw new Error("hospitalId and action are required for an audit log");
  }

  if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
    throw new Error("Invalid audit entity type");
  }

  if (!["SUCCESS", "FAILURE"].includes(outcome)) {
    throw new Error("Invalid audit outcome");
  }

  return AuditLog.create({
    hospitalId,
    actorUserId,
    actorRole,
    action: String(action).trim().slice(0, 100),
    entityType,
    entityId: entityId || null,
    description: String(description).slice(0, 1000),
    metadata: sanitizeMetadata(metadata) || {},
    requestId: String(requestId).slice(0, 100),
    ipAddress: String(ipAddress).slice(0, 100),
    userAgent: String(userAgent).slice(0, 500),
    outcome,
  });
}

async function auditRequest(req, details) {
  if (!req.user?.hospitalId) return null;

  return writeAuditLog({
    hospitalId: req.user.hospitalId,
    actorUserId: req.user.id,
    actorRole: req.user.role,
    requestId: req.headers["x-request-id"] || "",
    ipAddress: req.ip || "",
    userAgent: req.get("user-agent") || "",
    ...details,
  });
}

module.exports = {
  writeAuditLog,
  auditRequest,
  sanitizeMetadata,
};
