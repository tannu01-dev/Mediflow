
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getToken, getStoredUser, logout } from "@/lib/auth";

const levels = [
  {
    value: "RESUSCITATION",
    label: "Resuscitation",
    color: "critical",
    hint: "Immediate response",
  },
  {
    value: "EMERGENCY",
    label: "Emergency",
    color: "high",
    hint: "Very high priority",
  },
  {
    value: "URGENT",
    label: "Urgent",
    color: "urgent",
    hint: "High priority",
  },
  {
    value: "LESS_URGENT",
    label: "Less urgent",
    color: "medium",
    hint: "Needs assessment",
  },
  {
    value: "NON_URGENT",
    label: "Non-urgent",
    color: "low",
    hint: "Lower priority",
  },
  {
    value: "UNTRIAGED",
    label: "Not triaged",
    color: "neutral",
    hint: "Assessment pending",
  },
];

const roles = [
  "HOSPITAL_ADMIN",
  "EMERGENCY_STAFF",
  "NURSE",
  "DOCTOR",
  "RECEPTION",
];

const blankEncounter = {
  patientId: "",
  type: "EMERGENCY",
  chiefComplaint: "",
  triageNotes: "",
  temperatureC: "",
  pulseBpm: "",
  respiratoryRate: "",
  systolicBP: "",
  diastolicBP: "",
  oxygenSaturation: "",
};

const blankTriage = {
  triageLevel: "URGENT",
  triageNotes: "",
  temperatureC: "",
  pulseBpm: "",
  respiratoryRate: "",
  systolicBP: "",
  diastolicBP: "",
  oxygenSaturation: "",
};

function initials(name = "P") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

function formatTime(value) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function labelFor(value) {
  return (
    levels.find((item) => item.value === value)?.label ||
    value ||
    "Not triaged"
  );
}

export default function EmergencyPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [queue, setQueue] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState(blankEncounter);
  const [triageTarget, setTriageTarget] = useState(null);
  const [triageForm, setTriageForm] = useState(blankTriage);
  const [assignTarget, setAssignTarget] = useState(null);
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    const stored = getStoredUser();

    // Intentional: hydrate the authenticated account from browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(stored);

    if (stored?.role && !roles.includes(stored.role)) {
      router.replace("/");
    }
  }, [router]);

  const loadAll = useCallback(async (quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [queueResult, patientResult, doctorResult] =
        await Promise.all([
          apiRequest(
            "/api/encounters?status=WAITING,IN_TRIAGE,WAITING_FOR_DOCTOR,IN_TREATMENT,ADMITTED"
          ),
          apiRequest("/api/patients?page=1&limit=100"),
          apiRequest("/api/encounters/doctors"),
        ]);

      setQueue(queueResult.encounters || []);
      setPatients(patientResult.patients || []);
      setDoctors(doctorResult.doctors || []);
    } catch (e) {
      setError(e.message || "Could not load emergency operations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && roles.includes(user.role)) {
      // Loading is initiated after client-side auth hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadAll();
    }
  }, [user, loadAll]);

  useEffect(() => {
    if (!notice.text) return;

    const timer = setTimeout(
      () => setNotice({ type: "", text: "" }),
      5500
    );

    return () => clearTimeout(timer);
  }, [notice]);

  const canRegister = [
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "RECEPTION",
  ].includes(user?.role);

  const canTriage = [
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "NURSE",
  ].includes(user?.role);

  const canAssign = [
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
  ].includes(user?.role);

  const filtered = useMemo(
    () =>
      queue.filter((encounter) => {
        const patient = encounter.patientId || "";

        const text = `${patient.firstName || ""} ${
          patient.lastName || ""
        } ${patient.mrn || ""} ${patient.phone || ""} ${
          encounter.encounterNumber || ""
        }`.toLowerCase();

        if (
          query.trim() &&
          !text.includes(query.trim().toLowerCase())
        ) {
          return false;
        }

        if (
          priorityFilter !== "ALL" &&
          encounter.triageLevel !== priorityFilter
        ) {
          return false;
        }

        if (
          statusFilter === "NEEDS_DOCTOR" &&
          ![
            "WAITING",
            "IN_TRIAGE",
            "WAITING_FOR_DOCTOR",
          ].includes(encounter.status)
        ) {
          return false;
        }

        if (
          statusFilter === "IN_TREATMENT" &&
          encounter.status !== "IN_TREATMENT"
        ) {
          return false;
        }

        return true;
      }),
    [queue, query, priorityFilter, statusFilter]
  );

  const stats = useMemo(
    () => ({
      waiting: queue.filter((x) =>
        [
          "WAITING",
          "IN_TRIAGE",
          "WAITING_FOR_DOCTOR",
        ].includes(x.status)
      ).length,

      critical: queue.filter((x) =>
        ["RESUSCITATION", "EMERGENCY"].includes(x.triageLevel)
      ).length,

      untriaged: queue.filter(
        (x) => x.triageLevel === "UNTRIAGED"
      ).length,

      assigned: queue.filter(
        (x) => x.status === "IN_TREATMENT"
      ).length,
    }),
    [queue]
  );

  function setEncounterField(key, value) {
    setRegisterForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function setTriageField(key, value) {
    setTriageForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function makeVitals(source) {
    const result = {};

    [
      "temperatureC",
      "pulseBpm",
      "respiratoryRate",
      "systolicBP",
      "diastolicBP",
      "oxygenSaturation",
    ].forEach((key) => {
      if (
        source[key] !== "" &&
        source[key] !== undefined &&
        source[key] !== null
      ) {
        result[key] = Number(source[key]);
      }
    });

    return result;
  }

  async function createEncounter(event) {
    event.preventDefault();

    setSaving(true);
    setNotice({ type: "", text: "" });

    try {
      const result = await apiRequest("/api/encounters", {
        method: "POST",
        body: JSON.stringify({
          patientId: registerForm.patientId,
          type: registerForm.type,
          chiefComplaint: registerForm.chiefComplaint.trim(),
          triageNotes: registerForm.triageNotes.trim(),
          vitals: makeVitals(registerForm),
        }),
      });

      setNotice({
        type: "success",
        text: `Encounter ${
          result.encounter?.encounterNumber || "created"
        } added to the priority queue.`,
      });

      setRegisterForm(blankEncounter);
      setShowRegister(false);

      await loadAll(true);
    } catch (e) {
      setNotice({
        type: "error",
        text: e.message || "Could not register encounter.",
      });
    } finally {
      setSaving(false);
    }
  }

  function openTriage(encounter) {
    setTriageTarget(encounter);

    setTriageForm({
      triageLevel:
        encounter.triageLevel === "UNTRIAGED"
          ? "URGENT"
          : encounter.triageLevel,
      triageNotes: encounter.triageNotes || "",
      temperatureC: encounter.vitals?.temperatureC ?? "",
      pulseBpm: encounter.vitals?.pulseBpm ?? "",
      respiratoryRate: encounter.vitals?.respiratoryRate ?? "",
      systolicBP: encounter.vitals?.systolicBP ?? "",
      diastolicBP: encounter.vitals?.diastolicBP ?? "",
      oxygenSaturation:
        encounter.vitals?.oxygenSaturation ?? "",
    });
  }

  async function saveTriage(event) {
    event.preventDefault();

    if (!triageTarget) return;

    setSaving(true);

    try {
      await apiRequest(
        `/api/encounters/${triageTarget._id}/triage`,
        {
          method: "PATCH",
          body: JSON.stringify({
            triageLevel: triageForm.triageLevel,
            triageNotes: triageForm.triageNotes.trim(),
            vitals: makeVitals(triageForm),
          }),
        }
      );

      setNotice({
        type: "success",
        text: "Triage and vital observations saved.",
      });

      setTriageTarget(null);

      await loadAll(true);
    } catch (e) {
      setNotice({
        type: "error",
        text: e.message || "Could not save triage.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveDoctorAssignment(event) {
    event.preventDefault();

    if (!assignTarget || !doctorId) return;

    setSaving(true);

    try {
      await apiRequest(
        `/api/encounters/${assignTarget._id}/assign-doctor`,
        {
          method: "PATCH",
          body: JSON.stringify({ doctorId }),
        }
      );

      const doctor = doctors.find((d) => d._id === doctorId);

      setNotice({
        type: "success",
        text: `Encounter assigned to ${doctor?.name || "doctor"}.`,
      });

      setAssignTarget(null);
      setDoctorId("");

      await loadAll(true);
    } catch (e) {
      setNotice({
        type: "error",
        text: e.message || "Could not assign doctor.",
      });
    } finally {
      setSaving(false);
    }
  }

  const hospital =
    user?.hospitalId?.name ||
    user?.hospital?.name ||
    "Hospital workspace";

  return (
    <main className="mf-app mf-module-page">
      <aside className="mf-sidebar mf-module-sidebar">
        <Link href="/" className="mf-brand">
          <span className="mf-brand-mark">M+</span>

          <span>
            <span className="mf-brand-name">MediFlow</span>
            <span className="mf-brand-sub">
              Hospital operations
            </span>
          </span>
        </Link>

        <div className="mf-nav-caption">YOUR WORKSPACE</div>

        <nav className="mf-nav-list">
          <Link href="/" className="mf-nav-link">
            <span className="mf-nav-icon">▦</span>
            Overview
          </Link>

          {user?.role === "HOSPITAL_ADMIN" && (
            <Link href="/staff" className="mf-nav-link">
              <span className="mf-nav-icon">♙</span>
              Staff directory
            </Link>
          )}

          <Link href="/patients" className="mf-nav-link">
            <span className="mf-nav-icon">♧</span>
            Patient records
          </Link>

          <Link
            href="/emergency"
            className="mf-nav-link active"
          >
            <span className="mf-nav-icon">✚</span>
            Emergency queue
          </Link>
        </nav>

        <div className="mf-sidebar-bottom">
          <div className="mf-sidebar-user">
            <div className="mf-avatar">
              {initials(user?.name || "U")}
            </div>

            <div>
              <strong>{user?.name || "Hospital user"}</strong>
              <span>
                {(user?.role || "STAFF").replaceAll("_", " ")}
              </span>
            </div>
          </div>

          <button
            className="mf-sidebar-logout"
            onClick={logout}
          >
            ↗ &nbsp; Sign out of MediFlow
          </button>
        </div>
      </aside>

      <section className="mf-main">
        <header className="mf-topbar">
          <div className="mf-topbar-left">
            <p className="mf-page-kicker">
              Patient operations / Emergency
            </p>
            <h1>Emergency command queue</h1>
          </div>

          <div className="mf-topbar-right">
            <div className="mf-hospital-label">
              <span className="mf-status-dot" />
              <span>{hospital}</span>
            </div>

            <button
              className="mf-secondary-btn"
              onClick={() => loadAll(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </header>

        <div className="mf-page-content">
          <section className="mf-welcome-panel mf-module-hero">
            <div>
              <span className="mf-welcome-tag">
                ✦ EMERGENCY OPERATIONS
              </span>

              <h2>Right patient. Right priority. Right team.</h2>

              <p>
                Register a visit, capture triage observations, keep
                the queue ordered by clinical priority and assign
                an available doctor. Triage labels support workflow
                only and do not replace clinical judgement.
              </p>
            </div>

            <div className="mf-welcome-art" aria-hidden="true">
              ✚
            </div>
          </section>

          {notice.text && (
            <div
              className={`mf-notice ${notice.type}`}
              role="status"
            >
              {notice.text}
            </div>
          )}

          {error && (
            <div className="mf-form-error" role="alert">
              {error}
            </div>
          )}

          <div className="mf-emergency-stats">
            <div className="mf-em-stat">
              <span className="mf-em-icon coral">✚</span>
              <div>
                <span>Awaiting care</span>
                <strong>{stats.waiting}</strong>
                <small>Waiting, triage or doctor queue</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon red">!</span>
              <div>
                <span>High priority</span>
                <strong>{stats.critical}</strong>
                <small>Resuscitation or emergency</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon amber">◷</span>
              <div>
                <span>Awaiting triage</span>
                <strong>{stats.untriaged}</strong>
                <small>Priority not yet recorded</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon plum">✓</span>
              <div>
                <span>In treatment</span>
                <strong>{stats.assigned}</strong>
                <small>Doctor assigned</small>
              </div>
            </div>
          </div>

          <div className="mf-module-toolbar">
            <div className="mf-module-search">
              <span>⌕</span>

              <input
                aria-label="Search emergency queue"
                placeholder="Search patient, ID or encounter…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mf-toolbar-actions">
              <select
                className="mf-filter"
                aria-label="Filter by triage priority"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value)
                }
              >
                <option value="ALL">All priorities</option>

                {levels.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>

              <select
                className="mf-filter"
                aria-label="Filter by queue status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ACTIVE">All active</option>
                <option value="NEEDS_DOCTOR">Needs doctor</option>
                <option value="IN_TREATMENT">In treatment</option>
              </select>

              {canRegister && (
                <button
                  className="mf-primary-btn"
                  onClick={() => {
                    setShowRegister((v) => !v);
                    setNotice({ type: "", text: "" });
                  }}
                >
                  ＋ New encounter
                </button>
              )}
            </div>
          </div>

          {showRegister && canRegister && (
            <section className="mf-panel mf-patient-form-panel">
              <div className="mf-panel-head">
                <div>
                  <h3>Register a patient visit</h3>
                  <p>
                    Select an existing patient record, then
                    document the reason for this visit.
                  </p>
                </div>

                <button
                  className="mf-close-btn"
                  onClick={() => setShowRegister(false)}
                  aria-label="Close form"
                >
                  ×
                </button>
              </div>

              <form
                onSubmit={createEncounter}
                className="mf-module-form"
              >
                <div className="mf-module-form-grid">
                  <label className="mf-field mf-field-wide">
                    <span>Patient *</span>

                    <select
                      required
                      value={registerForm.patientId}
                      onChange={(e) =>
                        setEncounterField(
                          "patientId",
                          e.target.value
                        )
                      }
                    >
                      <option value="">
                        Choose registered patient
                      </option>

                      {patients.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.firstName} {p.lastName} — {p.mrn} ·{" "}
                          {p.phone}
                        </option>
                      ))}
                    </select>

                    <small>
                      Patient missing?{" "}
                      <Link
                        className="mf-inline-link"
                        href="/patients"
                      >
                        Register a patient first
                      </Link>
                      .
                    </small>
                  </label>

                  <label className="mf-field">
                    <span>Encounter type *</span>

                    <select
                      value={registerForm.type}
                      onChange={(e) =>
                        setEncounterField("type", e.target.value)
                      }
                    >
                      <option value="EMERGENCY">Emergency</option>
                      <option value="OUTPATIENT">Outpatient</option>
                      <option value="INPATIENT">Inpatient</option>
                    </select>
                  </label>

                  <label className="mf-field mf-field-wide">
                    <span>
                      Chief complaint / reason for visit *
                    </span>

                    <textarea
                      required
                      maxLength={2000}
                      rows={3}
                      value={registerForm.chiefComplaint}
                      onChange={(e) =>
                        setEncounterField(
                          "chiefComplaint",
                          e.target.value
                        )
                      }
                      placeholder="Record the patient's stated reason for seeking care"
                    />
                  </label>

                  <label className="mf-field mf-field-wide">
                    <span>Initial notes</span>

                    <textarea
                      rows={2}
                      maxLength={3000}
                      value={registerForm.triageNotes}
                      onChange={(e) =>
                        setEncounterField(
                          "triageNotes",
                          e.target.value
                        )
                      }
                      placeholder="Optional initial observations (not a diagnosis)"
                    />
                  </label>
                </div>

                <div className="mf-form-section-label">
                  INITIAL VITALS{" "}
                  <span>OPTIONAL · RECORD OBSERVED VALUES</span>
                </div>

                <div className="mf-vitals-grid">
                  {[
                    {
                      key: "temperatureC",
                      label: "Temperature",
                      unit: "°C",
                      min: 25,
                      max: 45,
                      step: "0.1",
                    },
                    {
                      key: "pulseBpm",
                      label: "Pulse",
                      unit: "bpm",
                      min: 0,
                      max: 300,
                    },
                    {
                      key: "respiratoryRate",
                      label: "Respiratory rate",
                      unit: "/min",
                      min: 0,
                      max: 100,
                    },
                    {
                      key: "systolicBP",
                      label: "Systolic BP",
                      unit: "mmHg",
                      min: 0,
                      max: 350,
                    },
                    {
                      key: "diastolicBP",
                      label: "Diastolic BP",
                      unit: "mmHg",
                      min: 0,
                      max: 250,
                    },
                    {
                      key: "oxygenSaturation",
                      label: "Oxygen saturation",
                      unit: "%",
                      min: 0,
                      max: 100,
                    },
                  ].map((v) => (
                    <label className="mf-field" key={v.key}>
                      <span>
                        {v.label} <em>{v.unit}</em>
                      </span>

                      <input
                        type="number"
                        min={v.min}
                        max={v.max}
                        step={v.step || 1}
                        value={registerForm[v.key]}
                        onChange={(e) =>
                          setEncounterField(v.key, e.target.value)
                        }
                        placeholder="—"
                      />
                    </label>
                  ))}
                </div>

                <div className="mf-module-form-actions">
                  <button
                    type="button"
                    className="mf-secondary-btn"
                    onClick={() => setShowRegister(false)}
                  >
                    Cancel
                  </button>

                  <button
                    className="mf-primary-btn"
                    type="submit"
                    disabled={saving || !patients.length}
                  >
                    {saving
                      ? "Saving encounter…"
                      : "Add to emergency queue →"}
                  </button>
                </div>

                {!patients.length && (
                  <p className="mf-form-help">
                    No patient records found.{" "}
                    <Link
                      className="mf-inline-link"
                      href="/patients"
                    >
                      Register a patient
                    </Link>{" "}
                    to continue.
                  </p>
                )}
              </form>
            </section>
          )}

          <section className="mf-panel mf-queue-panel">
            <div className="mf-panel-head">
              <div>
                <h3>Priority queue</h3>
                <p>
                  {filtered.length} of {queue.length} active
                  encounters · priority order first, then arrival
                  time
                </p>
              </div>

              <span className="mf-pill">● Live data on refresh</span>
            </div>

            {loading ? (
              <div className="mf-empty-state">
                <div className="mf-loading-orbit" />
                Loading emergency queue…
              </div>
            ) : filtered.length === 0 ? (
              <div className="mf-empty-state">
                <div className="mf-empty-icon">✚</div>

                <strong>
                  {query ||
                  priorityFilter !== "ALL" ||
                  statusFilter !== "ACTIVE"
                    ? "No encounters match these filters"
                    : "Emergency queue is clear"}
                </strong>

                <p>
                  {query ||
                  priorityFilter !== "ALL" ||
                  statusFilter !== "ACTIVE"
                    ? "Try another search or clear the filters."
                    : "New patient visits will appear here after encounter registration."}
                </p>

                {canRegister && (
                  <button
                    className="mf-primary-btn"
                    onClick={() => setShowRegister(true)}
                  >
                    ＋ Register encounter
                  </button>
                )}
              </div>
            ) : (
              <div className="mf-queue-list">
                {filtered.map((encounter) => {
                  const patient = encounter.patientId || {};

                  const level =
                    levels.find(
                      (x) => x.value === encounter.triageLevel
                    ) || levels[5];

                  const isWaiting = [
                    "WAITING",
                    "IN_TRIAGE",
                    "WAITING_FOR_DOCTOR",
                  ].includes(encounter.status);

                  return (
                    <article
                      className="mf-queue-card"
                      key={encounter._id}
                    >
                      <div
                        className={`mf-priority-rail ${level.color}`}
                      />

                      <div className="mf-queue-card-main">
                        <div className="mf-queue-card-head">
                          <div className="mf-patient-identity">
                            <div className="mf-staff-initial">
                              {initials(
                                `${patient.firstName || "P"} ${
                                  patient.lastName || ""
                                }`
                              )}
                            </div>

                            <div>
                              <h4>
                                {patient.firstName || "Unknown patient"}{" "}
                                {patient.lastName || ""}
                              </h4>

                              <p>
                                {patient.mrn ||
                                  "Patient ID unavailable"}{" "}
                                <span>·</span>{" "}
                                {patient.sex || "Unknown"}{" "}
                                <span>·</span>{" "}
                                {patient.phone || "No phone"}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`mf-priority-badge ${level.color}`}
                          >
                            {level.label}
                          </span>
                        </div>

                        <div className="mf-queue-meta">
                          <span>
                            <b>Encounter</b>{" "}
                            {encounter.encounterNumber}
                          </span>

                          <span>
                            <b>Arrived</b>{" "}
                            {formatTime(encounter.createdAt)}
                          </span>

                          <span>
                            <b>Type</b> {encounter.type}
                          </span>
                        </div>

                        <div className="mf-chief-complaint">
                          <span>REASON FOR VISIT</span>
                          <p>{encounter.chiefComplaint}</p>
                        </div>

                        {encounter.vitals &&
                          Object.keys(encounter.vitals).some(
                            (k) =>
                              encounter.vitals[k] !== undefined &&
                              encounter.vitals[k] !== null
                          ) && (
                            <div className="mf-vitals-strip">
                              {[
                                {
                                  key: "temperatureC",
                                  label: "Temp",
                                  unit: "°C",
                                },
                                {
                                  key: "pulseBpm",
                                  label: "Pulse",
                                  unit: " bpm",
                                },
                                {
                                  key: "respiratoryRate",
                                  label: "Resp",
                                  unit: "/min",
                                },
                                {
                                  key: "systolicBP",
                                  label: "BP",
                                  unit: " mmHg",
                                },
                                {
                                  key: "oxygenSaturation",
                                  label: "SpO₂",
                                  unit: "%",
                                },
                              ]
                                .filter(
                                  (v) =>
                                    encounter.vitals[v.key] !==
                                      undefined &&
                                    encounter.vitals[v.key] !== null
                                )
                                .map((v) => (
                                  <span key={v.key}>
                                    <small>{v.label}</small>
                                    <strong>
                                      {encounter.vitals[v.key]}
                                      {v.unit}
                                    </strong>
                                  </span>
                                ))}
                            </div>
                          )}

                        <div className="mf-queue-card-foot">
                          <div className="mf-assigned-doctor">
                            {encounter.assignedDoctorId ? (
                              <>
                                <span className="mf-doctor-avatar">
                                  ✚
                                </span>

                                <span>
                                  <b>
                                    {encounter.assignedDoctorId.name}
                                  </b>
                                  <small>
                                    {encounter.assignedDoctorId
                                      .department || "Doctor"}
                                  </small>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="mf-unassigned-icon">
                                  ◷
                                </span>

                                <span>
                                  <b>Doctor not assigned</b>
                                  <small>
                                    {isWaiting
                                      ? "Awaiting assignment"
                                      : encounter.status}
                                  </small>
                                </span>
                              </>
                            )}
                          </div>

                          <div className="mf-queue-actions">
                            {canTriage && isWaiting && (
                              <button
                                className="mf-secondary-btn"
                                onClick={() => openTriage(encounter)}
                              >
                                {encounter.triageLevel === "UNTRIAGED"
                                  ? "Record triage"
                                  : "Update triage"}
                              </button>
                            )}

                            {canAssign && isWaiting && (
                              <button
                                className="mf-primary-btn"
                                onClick={() => {
                                  setAssignTarget(encounter);
                                  setDoctorId(
                                    encounter.assignedDoctorId?._id ||
                                      ""
                                  );
                                }}
                              >
                                {encounter.assignedDoctorId
                                  ? "Reassign doctor"
                                  : "Assign doctor"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="mf-module-footnote">
            Priority order is a workflow aid, not an automated
            clinical recommendation. Staff must follow local
            emergency protocols and professional judgement.
          </div>
        </div>
      </section>

      {triageTarget && (
        <div
          className="mf-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setTriageTarget(null);
            }
          }}
        >
          <section
            className="mf-modal mf-wide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="triage-title"
          >
            <div className="mf-modal-head">
              <div>
                <span className="mf-welcome-tag">
                  TRIAGE & OBSERVATIONS
                </span>

                <h2 id="triage-title">Record triage</h2>

                <p>
                  {triageTarget.patientId?.firstName}{" "}
                  {triageTarget.patientId?.lastName} ·{" "}
                  {triageTarget.encounterNumber}
                </p>
              </div>

              <button
                className="mf-close-btn"
                onClick={() => setTriageTarget(null)}
                aria-label="Close triage"
              >
                ×
              </button>
            </div>

            <form
              className="mf-module-form"
              onSubmit={saveTriage}
            >
              <label className="mf-field">
                <span>Priority category *</span>

                <select
                  value={triageForm.triageLevel}
                  onChange={(e) =>
                    setTriageField("triageLevel", e.target.value)
                  }
                  required
                >
                  {levels
                    .filter((x) => x.value !== "UNTRIAGED")
                    .map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label} — {x.hint}
                      </option>
                    ))}
                </select>

                <small>
                  Choose according to your institution&apos;s triage
                  protocol.
                </small>
              </label>

              <div className="mf-form-section-label">
                VITAL SIGNS
              </div>

              <div className="mf-vitals-grid">
                {[
                  {
                    key: "temperatureC",
                    label: "Temperature",
                    unit: "°C",
                    min: 25,
                    max: 45,
                    step: "0.1",
                  },
                  {
                    key: "pulseBpm",
                    label: "Pulse",
                    unit: "bpm",
                    min: 0,
                    max: 300,
                  },
                  {
                    key: "respiratoryRate",
                    label: "Respiratory rate",
                    unit: "/min",
                    min: 0,
                    max: 100,
                  },
                  {
                    key: "systolicBP",
                    label: "Systolic BP",
                    unit: "mmHg",
                    min: 0,
                    max: 350,
                  },
                  {
                    key: "diastolicBP",
                    label: "Diastolic BP",
                    unit: "mmHg",
                    min: 0,
                    max: 250,
                  },
                  {
                    key: "oxygenSaturation",
                    label: "Oxygen saturation",
                    unit: "%",
                    min: 0,
                    max: 100,
                  },
                ].map((v) => (
                  <label className="mf-field" key={v.key}>
                    <span>
                      {v.label} <em>{v.unit}</em>
                    </span>

                    <input
                      type="number"
                      min={v.min}
                      max={v.max}
                      step={v.step || 1}
                      value={triageForm[v.key]}
                      onChange={(e) =>
                        setTriageField(v.key, e.target.value)
                      }
                      placeholder="—"
                    />
                  </label>
                ))}
              </div>

              <label className="mf-field">
                <span>Triage notes</span>

                <textarea
                  rows={3}
                  maxLength={3000}
                  value={triageForm.triageNotes}
                  onChange={(e) =>
                    setTriageField("triageNotes", e.target.value)
                  }
                  placeholder="Record observations and context; do not use this field to auto-generate a diagnosis."
                />
              </label>

              <div className="mf-module-form-actions">
                <button
                  type="button"
                  className="mf-secondary-btn"
                  onClick={() => setTriageTarget(null)}
                >
                  Cancel
                </button>

                <button
                  className="mf-primary-btn"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save triage →"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {assignTarget && (
        <div
          className="mf-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAssignTarget(null);
            }
          }}
        >
          <section
            className="mf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-title"
          >
            <div className="mf-modal-head">
              <div>
                <span className="mf-welcome-tag">CARE TEAM</span>

                <h2 id="assign-title">Assign doctor</h2>

                <p>
                  {assignTarget.patientId?.firstName}{" "}
                  {assignTarget.patientId?.lastName} ·{" "}
                  {assignTarget.encounterNumber}
                </p>
              </div>

              <button
                className="mf-close-btn"
                onClick={() => setAssignTarget(null)}
                aria-label="Close assignment"
              >
                ×
              </button>
            </div>

            <form
              className="mf-module-form"
              onSubmit={saveDoctorAssignment}
            >
              <label className="mf-field">
                <span>Active doctor *</span>

                <select
                  required
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                >
                  <option value="">Choose a doctor</option>

                  {doctors.map((doctor) => (
                    <option key={doctor._id} value={doctor._id}>
                      {doctor.name}
                      {doctor.department
                        ? ` · ${doctor.department}`
                        : ""}
                      {doctor.shift ? ` · ${doctor.shift}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {doctors.length === 0 && (
                <div className="mf-inline-warning">
                  No active doctors are configured for this
                  hospital. Ask the hospital administrator to add a
                  doctor account.
                </div>
              )}

              <div className="mf-module-form-actions">
                <button
                  type="button"
                  className="mf-secondary-btn"
                  onClick={() => setAssignTarget(null)}
                >
                  Cancel
                </button>

                <button
                  className="mf-primary-btn"
                  type="submit"
                  disabled={saving || !doctors.length}
                >
                  {saving
                    ? "Assigning…"
                    : "Confirm assignment →"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
