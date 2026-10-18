
const mongoose = require("mongoose");
const TransferRequest = require("../models/TransferRequest");
const HospitalConnection = require("../models/HospitalConnection");
const Hospital = require("../models/Hospital");
const Patient = require("../models/Patient");
const Encounter = require("../models/Encounter");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { notifyUsers } = require("../services/notificationService");

async function safeNotify(options) {
  try {
    await notifyUsers(options);
  } catch (error) {
    console.error("Transfer notification failed:", error.message);
  }
}

function makeRequestNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TR-${datePart}-${randomPart}`;
}

function makeEncounterNumber(hospitalCode) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${hospitalCode}-ENC-${datePart}-${randomPart}`;
}

function makeMRN(hospitalCode) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${hospitalCode}-${datePart}-${randomPart}`;
}

function normalizeText(value, maxLength = 2000) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

const createTransferRequest = asyncHandler(async (req, res) => {
  const {
    targetHospitalId,
    encounterId,
    reason,
    urgency,
    clinicalSummary,
    diagnosesSummary,
    medicationsSummary,
    labSummary,
  } = req.body;

  if (
    !targetHospitalId ||
    !mongoose.isValidObjectId(targetHospitalId)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid targetHospitalId is required",
    });
  }

  if (!encounterId || !mongoose.isValidObjectId(encounterId)) {
    return res.status(400).json({
      success: false,
      message: "A valid encounterId is required",
    });
  }

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({
      success: false,
      message: "Transfer reason is required",
    });
  }

  const urgencyValue = urgency || "ROUTINE";
  const allowedUrgencies = ["ROUTINE", "URGENT", "EMERGENCY"];

  if (!allowedUrgencies.includes(urgencyValue)) {
    return res.status(400).json({
      success: false,
      message: "Invalid transfer urgency",
    });
  }

  if (String(targetHospitalId) === String(req.user.hospitalId)) {
    return res.status(400).json({
      success: false,
      message: "Source and target hospitals must be different",
    });
  }

  const [targetHospital, encounter] = await Promise.all([
    Hospital.findOne({
      _id: targetHospitalId,
      status: "ACTIVE",
    }).select("_id name code address status"),
    Encounter.findOne({
      _id: encounterId,
      hospitalId: req.user.hospitalId,
    }),
  ]);

  if (!targetHospital) {
    return res.status(404).json({
      success: false,
      message: "Active target hospital not found",
    });
  }

  const connected = await HospitalConnection.exists({ status: "CONNECTED", $or: [
    { sourceHospitalId: req.user.hospitalId, targetHospitalId: targetHospital._id },
    { sourceHospitalId: targetHospital._id, targetHospitalId: req.user.hospitalId },
  ] });
  if (!connected) {
    return res.status(403).json({ success: false, message: "Connect with the receiving hospital before requesting a transfer." });
  }

  if (!encounter) {
    return res.status(404).json({
      success: false,
      message: "Encounter not found in your hospital",
    });
  }

  if (["TRANSFERRED", "DISCHARGED"].includes(encounter.status)) {
    return res.status(409).json({
      success: false,
      message: "This encounter is already closed or transferred",
    });
  }

  if (
    req.user.role === "DOCTOR" &&
    String(encounter.assignedDoctorId || "") !== String(req.user.id)
  ) {
    return res.status(403).json({
      success: false,
      message: "You can only transfer an encounter assigned to you",
    });
  }

  const patient = await Patient.findOne({
    _id: encounter.patientId,
    hospitalId: req.user.hospitalId,
  });

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: "Patient not found in source hospital",
    });
  }

  let transfer;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      transfer = await TransferRequest.create({
        requestNumber: makeRequestNumber(),
        sourceHospitalId: req.user.hospitalId,
        targetHospitalId: targetHospital._id,
        sourceEncounterId: encounter._id,
        sourcePatientId: patient._id,
        patientSummary: {
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          sex: patient.sex,
          phone: patient.phone,
          bloodGroup: patient.bloodGroup,
          allergies: patient.allergies,
        },
        chiefComplaint: encounter.chiefComplaint,
        reason: String(reason).trim().slice(0, 2000),
        urgency: urgencyValue,
        clinicalSummary: normalizeText(clinicalSummary),
        diagnosesSummary: normalizeText(diagnosesSummary),
        medicationsSummary: normalizeText(medicationsSummary),
        labSummary: normalizeText(labSummary),
        vitals: encounter.vitals || {},
        requestedBy: req.user.id,
        status: "PENDING",
        workflowStatus: "SENT",
        workflowHistory: [
          { status: "REQUESTED", note: "Transfer request created", changedBy: req.user.id },
          { status: "SENT", note: "Request sent to receiving hospital", changedBy: req.user.id },
        ],
      });
      break;
    } catch (error) {
      lastError = error;
      if (!(error.code === 11000 && attempt < 2)) throw error;
    }
  }

  if (!transfer) throw lastError;

  await safeNotify({
    hospitalId: targetHospital._id,
    roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"],
    type: "TRANSFER",
    title: "Incoming transfer request",
    message: `Transfer ${transfer.requestNumber} has been requested. Urgency: ${transfer.urgency}.`,
    entityType: "TRANSFER",
    entityId: transfer._id,
  });

  return res.status(201).json({
    success: true,
    message: "Transfer request created successfully",
    transfer,
  });
});

const getEligibleEncounters = asyncHandler(async (req, res) => {
  const Encounter = require("../models/Encounter");
  const encounterFilter = {
    hospitalId: req.user.hospitalId,
    status: { $nin: ["DISCHARGED", "TRANSFERRED"] },
  };
  if (req.user.role === "DOCTOR") encounterFilter.assignedDoctorId = req.user.id;
  const encounters = await Encounter.find(encounterFilter)
    .select("_id encounterNumber status patientId chiefComplaint createdAt")
    .populate("patientId", "mrn firstName lastName")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return res.json({ success: true, count: encounters.length, encounters });
});

const getTransfers = asyncHandler(async (req, res) => {
  const direction = req.query.direction || "all";
  const allowedDirections = ["incoming", "outgoing", "all"];

  if (!allowedDirections.includes(direction)) {
    return res.status(400).json({
      success: false,
      message: "direction must be incoming, outgoing, or all",
    });
  }

  const hospitalId = req.user.hospitalId;
  let filter = {};

  if (direction === "incoming") {
    filter.targetHospitalId = hospitalId;
  } else if (direction === "outgoing") {
    filter.sourceHospitalId = hospitalId;
  } else {
    filter.$or = [
      { sourceHospitalId: hospitalId },
      { targetHospitalId: hospitalId },
    ];
  }

  if (req.query.status) {
    const statuses = String(req.query.status)
      .split(",")
      .map((value) => value.trim());

    const allowedStatuses = [
      "PENDING",
      "PROCESSING",
      "ACCEPTED",
      "REJECTED",
      "CANCELLED",
    ];

    if (statuses.some((status) => !allowedStatuses.includes(status))) {
      return res.status(400).json({
        success: false,
        message: "Invalid transfer status filter",
      });
    }

    filter.status =
      statuses.length === 1 ? statuses[0] : { $in: statuses };
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
  );
  const skip = (page - 1) * limit;

  const [transfers, total] = await Promise.all([
    TransferRequest.find(filter)
      .populate("sourceHospitalId", "name code")
      .populate("targetHospitalId", "name code")
      .populate("requestedBy", "name role")
      .populate("decidedBy", "name role")
      .populate("acceptedBy", "name role")
      .populate("receivingEncounterId", "encounterNumber status")
      .populate("receivingPatientId", "mrn firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TransferRequest.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    count: transfers.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    transfers,
  });
});

const getTransferById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid transfer ID",
    });
  }

  const transfer = await TransferRequest.findOne({
    _id: req.params.id,
    $or: [
      { sourceHospitalId: req.user.hospitalId },
      { targetHospitalId: req.user.hospitalId },
    ],
  })
    .populate("sourceHospitalId", "name code address")
    .populate("targetHospitalId", "name code address")
    .populate("sourceEncounterId", "encounterNumber status chiefComplaint triageLevel")
    .populate("requestedBy", "name role")
    .populate("decidedBy", "name role")
    .populate("acceptedBy", "name role")
    .populate("receivingPatientId", "mrn firstName lastName")
    .populate("receivingEncounterId", "encounterNumber status");

  if (!transfer) {
    return res.status(404).json({
      success: false,
      message: "Transfer not found or you do not have access",
    });
  }

  return res.json({ success: true, transfer });
});

const decideTransfer = asyncHandler(async (req, res) => {
  const { decision, decisionNote } = req.body;

  if (!["ACCEPT", "REJECT"].includes(decision)) {
    return res.status(400).json({
      success: false,
      message: "decision must be ACCEPT or REJECT",
    });
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid transfer ID",
    });
  }

  // The receiving hospital alone can decide an incoming transfer.
  const transfer = await TransferRequest.findOne({
    _id: req.params.id,
    targetHospitalId: req.user.hospitalId,
  });

  if (!transfer) {
    return res.status(404).json({
      success: false,
      message: "Incoming transfer request not found",
    });
  }

  if (transfer.status !== "PENDING") {
    return res.status(409).json({
      success: false,
      message: `Transfer cannot be decided while status is ${transfer.status}`,
    });
  }

  if (decision === "REJECT") {
    const rejected = await TransferRequest.findOneAndUpdate(
      {
        _id: transfer._id,
        targetHospitalId: req.user.hospitalId,
        status: "PENDING",
      },
      {
        $set: {
          status: "REJECTED",
          workflowStatus: "REJECTED",
          decisionNote: normalizeText(decisionNote, 2000),
          decidedBy: req.user.id,
          decidedAt: new Date(),
        },
        $push: { workflowHistory: { status: "REJECTED", note: normalizeText(decisionNote, 1000), changedBy: req.user.id } },
      },
      { new: true, runValidators: true }
    );

    if (!rejected) {
      return res.status(409).json({
        success: false,
        message: "Transfer was updated by another user. Refresh and try again.",
      });
    }

    await safeNotify({
      hospitalId: rejected.sourceHospitalId,
      recipientUserIds: [String(rejected.requestedBy)],
      roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"],
      type: "TRANSFER",
      title: "Transfer request rejected",
      message: `Transfer ${rejected.requestNumber} was rejected by the receiving hospital.`,
      entityType: "TRANSFER",
      entityId: rejected._id,
    });

    return res.json({
      success: true,
      message: "Transfer request rejected",
      transfer: rejected,
    });
  }

  // Claim the request first so two coordinators cannot accept it simultaneously.
  const claimed = await TransferRequest.findOneAndUpdate(
    {
      _id: transfer._id,
      targetHospitalId: req.user.hospitalId,
      status: "PENDING",
    },
    {
      $set: {
        status: "PROCESSING",
        decisionNote: normalizeText(decisionNote, 2000),
        decidedBy: req.user.id,
        decidedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  );

  if (!claimed) {
    return res.status(409).json({
      success: false,
      message: "Transfer was updated by another user. Refresh and try again.",
    });
  }

  let receivingPatient = null;
  let receivingEncounter = null;
  let sourceEncounter = null;

  try {
    const [targetHospital, sourceEncounterFound] = await Promise.all([
      Hospital.findOne({
        _id: claimed.targetHospitalId,
        status: "ACTIVE",
      }).select("name code status"),
      Encounter.findOne({
        _id: claimed.sourceEncounterId,
        hospitalId: claimed.sourceHospitalId,
      }),
    ]);

    if (!targetHospital) {
      throw new Error("Receiving hospital is no longer active");
    }

    if (
      !sourceEncounterFound ||
      ["TRANSFERRED", "DISCHARGED"].includes(sourceEncounterFound.status)
    ) {
      throw new Error("Source encounter is unavailable or already closed");
    }

    sourceEncounter = sourceEncounterFound;

    const patientData = claimed.patientSummary || {};

    if (!patientData.firstName || !patientData.dateOfBirth) {
      throw new Error("Transfer patient summary is missing required patient details");
    }

    let patientLastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        receivingPatient = await Patient.create({
          hospitalId: claimed.targetHospitalId,
          mrn: makeMRN(targetHospital.code),
          firstName: patientData.firstName,
          lastName: patientData.lastName,
          dateOfBirth: patientData.dateOfBirth,
          sex: patientData.sex,
          phone: patientData.phone || "",
          bloodGroup: patientData.bloodGroup || "",
          allergies: patientData.allergies || [],
          createdBy: req.user.id,
          status: "ACTIVE",
        });
        break;
      } catch (error) {
        patientLastError = error;
        if (!(error.code === 11000 && attempt < 2)) throw error;
      }
    }

    if (!receivingPatient) throw patientLastError;

    let encounterLastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        receivingEncounter = await Encounter.create({
          hospitalId: claimed.targetHospitalId,
          patientId: receivingPatient._id,
          encounterNumber: makeEncounterNumber(targetHospital.code),
          type: "EMERGENCY",
          chiefComplaint: claimed.chiefComplaint || sourceEncounter.chiefComplaint,
          triageLevel: sourceEncounter.triageLevel || "UNTRIAGED",
          triageNotes: `Received by inter-hospital transfer ${claimed.requestNumber}. ${normalizeText(claimed.clinicalSummary, 1000)}`,
          vitals: claimed.vitals || sourceEncounter.vitals || {},
          status: "WAITING",
          createdBy: req.user.id,
        });
        break;
      } catch (error) {
        encounterLastError = error;
        if (!(error.code === 11000 && attempt < 2)) throw error;
      }
    }

    if (!receivingEncounter) throw encounterLastError;

    // Only close the source encounter if it is still in the expected state.
    const sourceUpdated = await Encounter.findOneAndUpdate(
      {
        _id: sourceEncounter._id,
        hospitalId: claimed.sourceHospitalId,
        status: { $nin: ["TRANSFERRED", "DISCHARGED"] },
      },
      {
        $set: {
          status: "TRANSFERRED",
          closedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!sourceUpdated) {
      throw new Error("Source encounter changed while transfer was being accepted");
    }

    const accepted = await TransferRequest.findOneAndUpdate(
      {
        _id: claimed._id,
        targetHospitalId: req.user.hospitalId,
        status: "PROCESSING",
      },
      {
        $set: {
          status: "ACCEPTED",
          workflowStatus: "ACCEPTED",
          acceptedBy: req.user.id,
          acceptedAt: new Date(),
          receivingPatientId: receivingPatient._id,
          receivingEncounterId: receivingEncounter._id,
        },
        $push: { workflowHistory: { status: "ACCEPTED", note: normalizeText(decisionNote, 1000), changedBy: req.user.id } },
      },
      { new: true, runValidators: true }
    );

    if (!accepted) {
      throw new Error("Transfer state changed while acceptance was being completed");
    }

    await safeNotify({
      hospitalId: accepted.sourceHospitalId,
      recipientUserIds: [String(accepted.requestedBy)],
      roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"],
      type: "TRANSFER",
      title: "Transfer accepted",
      message: `Transfer ${accepted.requestNumber} was accepted by the receiving hospital.`,
      entityType: "TRANSFER",
      entityId: accepted._id,
    });

    await safeNotify({
      hospitalId: accepted.targetHospitalId,
      roles: ["HOSPITAL_ADMIN", "EMERGENCY_STAFF"],
      type: "TRANSFER",
      title: "Patient transfer accepted",
      message: `A receiving encounter has been created for transfer ${accepted.requestNumber}.`,
      entityType: "ENCOUNTER",
      entityId: receivingEncounter._id,
    });

    return res.json({
      success: true,
      message: "Transfer accepted. A new patient record and encounter were created in the receiving hospital.",
      transfer: accepted,
      receivingPatient,
      receivingEncounter,
    });
  } catch (error) {
    // Best-effort cleanup. A database transaction is preferable in production.
    if (receivingEncounter?._id) {
      await Encounter.deleteOne({
        _id: receivingEncounter._id,
        hospitalId: claimed.targetHospitalId,
      }).catch(() => {});
    }

    if (receivingPatient?._id) {
      await Patient.deleteOne({
        _id: receivingPatient._id,
        hospitalId: claimed.targetHospitalId,
      }).catch(() => {});
    }

    if (sourceEncounter?._id) {
      await Encounter.updateOne(
        {
          _id: sourceEncounter._id,
          hospitalId: claimed.sourceHospitalId,
          status: "TRANSFERRED",
        },
        {
          $set: { status: sourceEncounter.status },
          $unset: { closedAt: "" },
        }
      ).catch(() => {});
    }

    await TransferRequest.updateOne(
      {
        _id: claimed._id,
        targetHospitalId: req.user.hospitalId,
        status: "PROCESSING",
      },
      {
        $set: { status: "PENDING" },
        $unset: {
          decisionNote: "",
          decidedBy: "",
          decidedAt: "",
          receivingPatientId: "",
          receivingEncounterId: "",
          acceptedBy: "",
          acceptedAt: "",
        },
      }
    ).catch(() => {});

    console.error("Transfer acceptance failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to complete transfer acceptance. Please refresh and verify the transfer status before retrying.",
    });
  }
});

const cancelTransfer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid transfer ID",
    });
  }

  const cancelled = await TransferRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      sourceHospitalId: req.user.hospitalId,
      status: "PENDING",
    },
    {
      $set: {
        status: "CANCELLED",
        workflowStatus: "CANCELLED",
        cancelledBy: req.user.id,
        cancelledAt: new Date(),
      },
      $push: { workflowHistory: { status: "CANCELLED", note: "Cancelled by source hospital", changedBy: req.user.id } },
    },
    { new: true, runValidators: true }
  );

  if (!cancelled) {
    return res.status(404).json({
      success: false,
      message: "Pending outgoing transfer not found. It may already have been processed.",
    });
  }

  await safeNotify({
    hospitalId: cancelled.targetHospitalId,
    roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"],
    type: "TRANSFER",
    title: "Transfer request cancelled",
    message: `Transfer ${cancelled.requestNumber} was cancelled by the source hospital.`,
    entityType: "TRANSFER",
    entityId: cancelled._id,
  });

  return res.json({
    success: true,
    message: "Transfer request cancelled successfully",
    transfer: cancelled,
  });
});

const updateTransferWorkflow = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid transfer ID" });
  const { status: nextStatus, note = "" } = req.body;
  const transitions = {
    SENT: ["REVIEWED"],
    ACCEPTED: ["TRANSPORT_ARRANGED"],
    TRANSPORT_ARRANGED: ["IN_TRANSIT"],
    IN_TRANSIT: ["ARRIVED"],
    ARRIVED: ["RECEIVED"],
    RECEIVED: ["COMPLETED"],
  };
  const transfer = await TransferRequest.findOne({ _id: req.params.id, $or: [{ sourceHospitalId: req.user.hospitalId }, { targetHospitalId: req.user.hospitalId }] });
  if (!transfer) return res.status(404).json({ success: false, message: "Transfer not found or inaccessible" });
  if (!transitions[transfer.workflowStatus]?.includes(nextStatus)) return res.status(409).json({ success: false, message: `Invalid workflow transition from ${transfer.workflowStatus} to ${nextStatus}` });
  const sourceOnly = ["TRANSPORT_ARRANGED", "IN_TRANSIT"].includes(nextStatus);
  const targetOnly = ["REVIEWED", "ARRIVED", "RECEIVED", "COMPLETED"].includes(nextStatus);
  if (sourceOnly && String(transfer.sourceHospitalId) !== String(req.user.hospitalId)) return res.status(403).json({ success: false, message: "Only the sending hospital can update this transport stage" });
  if (targetOnly && String(transfer.targetHospitalId) !== String(req.user.hospitalId)) return res.status(403).json({ success: false, message: "Only the receiving hospital can update this stage" });
  const updated = await TransferRequest.findOneAndUpdate(
    { _id: transfer._id, workflowStatus: transfer.workflowStatus },
    { $set: { workflowStatus: nextStatus }, $push: { workflowHistory: { status: nextStatus, note: normalizeText(note, 1000), changedBy: req.user.id, changedAt: new Date() } } },
    { new: true, runValidators: true }
  );
  if (!updated) return res.status(409).json({ success: false, message: "Transfer changed concurrently. Refresh and retry." });
  await safeNotify({ hospitalId: updated.sourceHospitalId, roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"], type: "TRANSFER", title: `Transfer ${nextStatus.toLowerCase().replace(/_/g, " ")}`, message: `Transfer ${updated.requestNumber} is now ${nextStatus.toLowerCase().replace(/_/g, " ")}.`, entityType: "TRANSFER", entityId: updated._id });
  if (String(updated.targetHospitalId) !== String(updated.sourceHospitalId)) await safeNotify({ hospitalId: updated.targetHospitalId, roles: ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"], type: "TRANSFER", title: `Transfer ${nextStatus.toLowerCase().replace(/_/g, " ")}`, message: `Transfer ${updated.requestNumber} is now ${nextStatus.toLowerCase().replace(/_/g, " ")}.`, entityType: "TRANSFER", entityId: updated._id });
  return res.json({ success: true, message: `Transfer workflow updated to ${nextStatus}.`, transfer: updated });
});

module.exports = {
  createTransferRequest,
  getTransfers,
  getEligibleEncounters,
  getTransferById,
  decideTransfer,
  cancelTransfer,
  updateTransferWorkflow,
};
