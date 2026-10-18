const Encounter = require("../models/Encounter");
const LabRequest = require("../models/LabRequest");
const Bed = require("../models/Bed");
const TransferRequest = require("../models/TransferRequest");
const asyncHandler = require("../utils/asyncHandler");

const getOperationalAlerts = asyncHandler(async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const activeStatuses = ["WAITING", "IN_TRIAGE", "WAITING_FOR_DOCTOR", "IN_TREATMENT", "ADMITTED"];
  const [criticalEncounters, statLabs, cleaningBeds, maintenanceBeds, pendingTransfers, availableBeds] = await Promise.all([
    Encounter.find({ hospitalId, status: { $in: activeStatuses }, triageLevel: { $in: ["RESUSCITATION", "EMERGENCY"] } })
      .select("_id encounterNumber triageLevel status createdAt patientId").populate("patientId", "mrn firstName lastName").sort({ createdAt: 1 }).limit(30).lean(),
    LabRequest.find({ hospitalId, priority: "STAT", status: { $in: ["REQUESTED", "SAMPLE_COLLECTED", "PROCESSING"] } })
      .select("_id requestNumber testName status createdAt encounterId patientId").populate("patientId", "mrn firstName lastName").sort({ createdAt: 1 }).limit(30).lean(),
    Bed.find({ hospitalId, status: "CLEANING" }).select("_id bedNumber wardId statusUpdatedAt").populate("wardId", "name code").limit(30).lean(),
    Bed.find({ hospitalId, status: "MAINTENANCE" }).select("_id bedNumber wardId statusNote").populate("wardId", "name code").limit(30).lean(),
    TransferRequest.find({ $or: [{ sourceHospitalId: hospitalId }, { targetHospitalId: hospitalId }], status: { $in: ["PENDING", "PROCESSING"] } })
      .select("_id requestNumber urgency status sourceHospitalId targetHospitalId createdAt").sort({ createdAt: 1 }).limit(30).lean(),
    Bed.countDocuments({ hospitalId, status: "AVAILABLE" }),
  ]);

  const alerts = [];
  for (const item of criticalEncounters) alerts.push({ id: `enc-${item._id}`, severity: item.triageLevel === "RESUSCITATION" ? "CRITICAL" : "HIGH", category: "EMERGENCY", title: item.triageLevel === "RESUSCITATION" ? "Resuscitation priority encounter" : "Emergency priority encounter", message: `${item.patientId?.firstName || "Patient"} ${item.patientId?.lastName || ""} · ${item.encounterNumber} · ${item.status.replaceAll("_", " ")}`, createdAt: item.createdAt, entityType: "ENCOUNTER", entityId: item._id.toString(), href: "/emergency" });
  for (const item of statLabs) alerts.push({ id: `lab-${item._id}`, severity: "HIGH", category: "LAB", title: "STAT investigation pending", message: `${item.testName} · ${item.patientId?.firstName || "Patient"} ${item.patientId?.lastName || ""} · ${item.status.replaceAll("_", " ")}`, createdAt: item.createdAt, entityType: "LAB_REQUEST", entityId: item._id.toString(), href: "/lab" });
  for (const item of cleaningBeds) alerts.push({ id: `clean-${item._id}`, severity: "MEDIUM", category: "BED", title: "Bed awaiting cleaning", message: `${item.wardId?.name || "Ward"} · Bed ${item.bedNumber}`, createdAt: item.statusUpdatedAt, entityType: "BED", entityId: item._id.toString(), href: "/beds" });
  for (const item of maintenanceBeds) alerts.push({ id: `maint-${item._id}`, severity: "MEDIUM", category: "BED", title: "Bed under maintenance", message: `${item.wardId?.name || "Ward"} · Bed ${item.bedNumber}${item.statusNote ? ` · ${item.statusNote}` : ""}`, createdAt: item.updatedAt, entityType: "BED", entityId: item._id.toString(), href: "/beds" });
  for (const item of pendingTransfers) alerts.push({ id: `transfer-${item._id}`, severity: item.urgency === "EMERGENCY" ? "HIGH" : "MEDIUM", category: "TRANSFER", title: "Transfer needs review", message: `${item.requestNumber} · ${item.urgency} · ${item.status}`, createdAt: item.createdAt, entityType: "TRANSFER", entityId: item._id.toString(), href: "/activity" });
  if (availableBeds === 0) alerts.push({ id: "capacity-no-beds", severity: "HIGH", category: "CAPACITY", title: "No available beds", message: "All beds are occupied or unavailable. Review capacity and bed status.", createdAt: new Date(), entityType: "BED", entityId: null, href: "/beds" });

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  alerts.sort((a, b) => (rank[a.severity] - rank[b.severity]) || (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)));
  res.json({ success: true, count: alerts.length, criticalCount: alerts.filter((a) => a.severity === "CRITICAL").length, highCount: alerts.filter((a) => a.severity === "HIGH").length, availableBeds, alerts: alerts.slice(0, 100), generatedAt: new Date().toISOString() });
});

module.exports = { getOperationalAlerts };
