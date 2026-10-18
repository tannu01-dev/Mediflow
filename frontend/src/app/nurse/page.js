
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiRequest,
  getToken,
  getStoredUser,
  logout,
} from "@/lib/auth";

const vitalFields = [
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
  {
    key: "weightKg",
    label: "Weight",
    unit: "kg",
    min: 0,
    max: 500,
    step: "0.1",
  },
  {
    key: "heightCm",
    label: "Height",
    unit: "cm",
    min: 0,
    max: 300,
    step: "0.1",
  },
];

const blankVitals = Object.fromEntries(
  vitalFields.map((field) => [field.key, ""])
);

function initials(name = "N") {
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
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

export default function NurseWorkspacePage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [selected, setSelected] = useState(null);
  const [vitals, setVitals] = useState(blankVitals);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState({
    type: "",
    text: "",
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    const stored = getStoredUser();

    // Intentional client hydration of the signed-in user.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(stored);

    if (
      stored?.role &&
      ![
        "NURSE",
        "EMERGENCY_STAFF",
        "HOSPITAL_ADMIN",
      ].includes(stored.role)
    ) {
      router.replace("/");
    }
  }, [router]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest("/api/workspaces/nurse");

      setEncounters(result.encounters || []);
    } catch (e) {
      setError(
        e.message || "Unable to load active patient encounters."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch the role-scoped list after client auth hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (
      user &&
      [
        "NURSE",
        "EMERGENCY_STAFF",
        "HOSPITAL_ADMIN",
      ].includes(user.role)
    ) {
      loadWorkspace();
    }
  }, [user, loadWorkspace]);

  const filtered = useMemo(
    () =>
      encounters.filter((enc) => {
        const patient = enc.patientId || {};

        const haystack = `
          ${patient.firstName || ""}
          ${patient.lastName || ""}
          ${patient.mrn || ""}
          ${patient.phone || ""}
          ${enc.encounterNumber || ""}
        `
          .toLowerCase();

        const statusMatches =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE"
            ? !["DISCHARGED", "TRANSFERRED"].includes(
                enc.status
              )
            : enc.status === statusFilter);

        return (
          statusMatches &&
          haystack.includes(query.toLowerCase().trim())
        );
      }),
    [encounters, query, statusFilter]
  );

  function openObservation(encounter) {
    setSelected(encounter);
    setVitals({
      ...blankVitals,
      ...(encounter.vitals || {}),
    });
    setNote("");
    setNotice({
      type: "",
      text: "",
    });
  }

  function setVital(key, value) {
    setVitals((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveObservation(event) {
    event.preventDefault();

    if (!selected) return;

    setSaving(true);
    setNotice({
      type: "",
      text: "",
    });

    const cleanVitals = Object.fromEntries(
      Object.entries(vitals).filter(
        ([, value]) =>
          value !== "" &&
          value !== null &&
          value !== undefined
      )
    );

    try {
      const result = await apiRequest(
        `/api/workspaces/encounters/${selected._id}/nursing-observations`,
        {
          method: "POST",
          body: JSON.stringify({
            vitals: cleanVitals,
            note,
          }),
        }
      );

      setNotice({
        type: "success",
        text: result.message || "Observation saved.",
      });

      setSelected(null);

      await loadWorkspace();
    } catch (e) {
      setNotice({
        type: "error",
        text: e.message || "Unable to save observation.",
      });
    } finally {
      setSaving(false);
    }
  }

  const hospital =
    user?.hospital?.name ||
    user?.hospitalId?.name ||
    "Hospital workspace";

  const criticalCount = encounters.filter((x) =>
    ["RESUSCITATION", "EMERGENCY"].includes(x.triageLevel)
  ).length;

  const unassignedCount = encounters.filter(
    (x) => !x.assignedDoctorId
  ).length;

  return (
    <main className="mf-app mf-module-page mf-workspace-page">
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

        <div className="mf-nav-caption">
          YOUR WORKSPACE
        </div>

        <nav className="mf-nav-list">
          <Link href="/" className="mf-nav-link">
            <span className="mf-nav-icon">▦</span>
            Overview
          </Link>

          <Link
            href="/nurse"
            className="mf-nav-link active"
          >
            <span className="mf-nav-icon">♡</span>
            Nurse workspace
          </Link>

          <Link href="/patients" className="mf-nav-link">
            <span className="mf-nav-icon">♧</span>
            Patient records
          </Link>

          <Link href="/emergency" className="mf-nav-link">
            <span className="mf-nav-icon">◷</span>
            Emergency queue
          </Link>
        </nav>

        <div className="mf-sidebar-bottom">
          <div className="mf-sidebar-user">
            <div className="mf-avatar">
              {initials(user?.name)}
            </div>

            <div>
              <strong>{user?.name || "Nurse"}</strong>
              <span>
                {(user?.role || "NURSE").replaceAll("_", " ")}
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
              Clinical care / Nursing
            </p>
            <h1>Nurse workspace</h1>
          </div>

          <div className="mf-topbar-right">
            <div className="mf-hospital-label">
              <span className="mf-status-dot" />
              <span>{hospital}</span>
            </div>

            <button
              className="mf-secondary-btn"
              onClick={loadWorkspace}
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        <div className="mf-page-content">
          <section className="mf-welcome-panel mf-module-hero">
            <div>
              <span className="mf-welcome-tag">
                ✦ NURSING & OBSERVATIONS
              </span>

              <h2>
                Keep every observation in the patient story.
              </h2>

              <p>
                Review active encounters, record observed
                vital signs and nursing notes, and preserve
                an observation history for each visit.
              </p>
            </div>

            <div
              className="mf-welcome-art"
              aria-hidden="true"
            >
              ♡
            </div>
          </section>

          <div className="mf-emergency-stats">
            <div className="mf-em-stat">
              <span className="mf-em-icon plum">♧</span>

              <div>
                <span>Active encounters</span>
                <strong>{encounters.length}</strong>
                <small>Current hospital queue</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon coral">!</span>

              <div>
                <span>High-priority triage</span>
                <strong>{criticalCount}</strong>
                <small>Resuscitation or emergency</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon amber">◷</span>

              <div>
                <span>Awaiting doctor</span>
                <strong>{unassignedCount}</strong>
                <small>Not yet assigned</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon plum">⌁</span>

              <div>
                <span>Observation history</span>
                <strong>
                  {encounters.reduce(
                    (n, x) =>
                      n + (x.nursingObservations?.length || 0),
                    0
                  )}
                </strong>
                <small>Recorded observations</small>
              </div>
            </div>
          </div>

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

          <section className="mf-panel mf-queue-panel">
            <div className="mf-panel-head">
              <div>
                <h3>Active patient list</h3>
                <p>
                  {filtered.length} patients match your search
                  and filters.
                </p>
              </div>

              <span className="mf-count-pill">
                {encounters.length} total
              </span>
            </div>

            <div className="mf-module-toolbar">
              <div className="mf-module-search">
                <span>⌕</span>

                <input
                  aria-label="Search active patients"
                  placeholder="Search name, patient ID, encounter or phone…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="mf-toolbar-actions">
                <select
                  className="mf-count-pill"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value)
                  }
                  aria-label="Filter encounter status"
                >
                  <option value="ACTIVE">Active only</option>
                  <option value="ALL">All loaded</option>
                  <option value="IN_TREATMENT">
                    In treatment
                  </option>
                  <option value="WAITING_FOR_DOCTOR">
                    Waiting for doctor
                  </option>
                  <option value="ADMITTED">Admitted</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="mf-empty-state">
                <div className="mf-loading-orbit" />
                Loading active patients…
              </div>
            ) : filtered.length === 0 ? (
              <div className="mf-empty-state">
                <div className="mf-empty-icon">♡</div>

                <strong>No patients match this view</strong>

                <p>
                  Try clearing your search or refresh the
                  workspace.
                </p>
              </div>
            ) : (
              <div className="mf-queue-list">
                {filtered.map((enc) => {
                  const patient = enc.patientId || {};
                  const obs = enc.nursingObservations || [];

                  return (
                    <article
                      className="mf-queue-card"
                      key={enc._id}
                    >
                      <div
                        className={`mf-priority-rail ${
                          ["RESUSCITATION"].includes(
                            enc.triageLevel
                          )
                            ? "critical"
                            : ["EMERGENCY"].includes(
                                  enc.triageLevel
                                )
                              ? "high"
                              : ["URGENT"].includes(
                                    enc.triageLevel
                                  )
                                ? "urgent"
                                : "medium"
                        }`}
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
                                {patient.firstName}{" "}
                                {patient.lastName}
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
                            className={`mf-priority-badge ${
                              [
                                "RESUSCITATION",
                                "EMERGENCY",
                              ].includes(enc.triageLevel)
                                ? "high"
                                : "medium"
                            }`}
                          >
                            {enc.triageLevel?.replaceAll(
                              "_",
                              " "
                            ) || "UNTRIAGED"}
                          </span>
                        </div>

                        <div className="mf-queue-meta">
                          <span>
                            <b>Encounter</b>{" "}
                            {enc.encounterNumber}
                          </span>

                          <span>
                            <b>Type</b> {enc.type}
                          </span>

                          <span>
                            <b>Status</b>{" "}
                            {enc.status.replaceAll("_", " ")}
                          </span>

                          <span>
                            <b>Last update</b>{" "}
                            {formatTime(enc.updatedAt)}
                          </span>
                        </div>

                        <div className="mf-vitals-strip">
                          {vitalFields
                            .slice(0, 6)
                            .filter(
                              (v) =>
                                enc.vitals?.[v.key] !==
                                  undefined &&
                                enc.vitals?.[v.key] !== null
                            )
                            .map((v) => (
                              <span key={v.key}>
                                <small>{v.label}</small>

                                <strong>
                                  {enc.vitals[v.key]}
                                  {v.unit}
                                </strong>
                              </span>
                            ))}

                          {!vitalFields.some(
                            (v) =>
                              enc.vitals?.[v.key] !==
                                undefined &&
                              enc.vitals?.[v.key] !== null
                          ) && (
                            <span>
                              <small>Vitals</small>
                              <strong>Not recorded</strong>
                            </span>
                          )}
                        </div>

                        <div className="mf-nurse-card-bottom">
                          <div>
                            <strong>
                              {obs.length} nursing observation
                              {obs.length === 1 ? "" : "s"}
                            </strong>

                            <small>
                              Doctor:{" "}
                              {enc.assignedDoctorId?.name ||
                                "Not assigned"}
                            </small>
                          </div>

                          <button
                            className="mf-primary-btn"
                            onClick={() =>
                              openObservation(enc)
                            }
                          >
                            ＋ Record observations
                          </button>
                        </div>

                        {obs.length > 0 && (
                          <div className="mf-last-observation">
                            <span>
                              Latest note ·{" "}
                              {formatTime(
                                obs[obs.length - 1].recordedAt
                              )}
                            </span>

                            <p>
                              {obs[obs.length - 1].note ||
                                "Vital signs recorded without a note."}
                            </p>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <p className="mf-module-footnote">
            Record observed measurements only. These forms do
            not provide automated diagnosis or treatment
            recommendations; follow local nursing and escalation
            protocols.
          </p>
        </div>
      </section>

      {selected && (
        <div
          className="mf-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <section
            className="mf-modal mf-wide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nurse-observation-title"
          >
            <div className="mf-modal-head">
              <div>
                <span className="mf-welcome-tag">
                  NURSING RECORD
                </span>

                <h2 id="nurse-observation-title">
                  Record observations
                </h2>

                <p>
                  {selected.patientId?.firstName}{" "}
                  {selected.patientId?.lastName} ·{" "}
                  {selected.encounterNumber}
                </p>
              </div>

              <button
                className="mf-close-btn"
                onClick={() => setSelected(null)}
                aria-label="Close observations"
              >
                ×
              </button>
            </div>

            <form
              className="mf-module-form"
              onSubmit={saveObservation}
            >
              <div className="mf-form-section-label">
                OBSERVED VITAL SIGNS
                <span>OPTIONAL · ENTER KNOWN VALUES</span>
              </div>

              <div className="mf-vitals-grid">
                {vitalFields.map((field) => (
                  <label
                    className="mf-field"
                    key={field.key}
                  >
                    <span>
                      {field.label} <em>{field.unit}</em>
                    </span>

                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step || 1}
                      value={vitals[field.key] ?? ""}
                      onChange={(e) =>
                        setVital(field.key, e.target.value)
                      }
                      placeholder="—"
                    />
                  </label>
                ))}
              </div>

              <label className="mf-field">
                <span>Nursing note</span>

                <textarea
                  rows={4}
                  maxLength={3000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Record observed symptoms, patient response, care provided or handover notes…"
                />
              </label>

              <p className="mf-form-help">
                Saving appends to the encounter&apos;s observation
                history and updates the latest vitals panel.
              </p>

              <div className="mf-module-form-actions">
                <button
                  type="button"
                  className="mf-secondary-btn"
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>

                <button
                  className="mf-primary-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : "Save observation →"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
