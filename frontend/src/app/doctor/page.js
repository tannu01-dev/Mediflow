
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  apiRequest,
  getToken,
  getStoredUser,
  logout,
} from "@/lib/auth";

const blankNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  generalNotes: "",
};

const blankDiagnosis = {
  name: "",
  code: "",
  type: "PROVISIONAL",
  notes: "",
};

const blankLab = {
  testName: "",
  category: "HEMATOLOGY",
  priority: "ROUTINE",
  specimenType: "",
  clinicalIndication: "",
};

const activeStatuses = [
  "WAITING",
  "IN_TRIAGE",
  "WAITING_FOR_DOCTOR",
  "IN_TREATMENT",
  "ADMITTED",
];

function initials(name = "D") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

function dateTime(value) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

export default function DoctorWorkspacePage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [record, setRecord] = useState(null);

  const [note, setNote] = useState(blankNote);
  const [diagnosis, setDiagnosis] = useState(blankDiagnosis);
  const [lab, setLab] = useState(blankLab);

  const [activeTab, setActiveTab] = useState("overview");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [notice, setNotice] = useState({
    type: "",
    text: "",
  });

  // Authentication and role verification

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    const stored = getStoredUser();

    // Intentional client hydration of the signed-in user.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(stored);

    if (stored?.role && stored.role !== "DOCTOR") {
      router.replace("/");
    }
  }, [router]);

  // Load assigned patient encounters

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest(
        "/api/workspaces/doctor"
      );

      const list = result.encounters || [];

      setEncounters(list);

      setSelectedId((current) =>
        list.some((x) => x._id === current)
          ? current
          : list[0]?._id || ""
      );
    } catch (e) {
      setError(
        e.message ||
          "Unable to load your assigned patients."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the selected patient's clinical record

  const loadRecord = useCallback(async (id) => {
    if (!id) {
      setRecord(null);
      return;
    }

    try {
      const result = await apiRequest(
        `/api/clinical-records/${id}`
      );

      setRecord(result.record || null);
    } catch (e) {
      setError(
        e.message || "Unable to load clinical record."
      );

      setRecord(null);
    }
  }, []);

  // Fetch remote workspace data when the authenticated role becomes available.
  // eslint-disable-next-line react-hooks/set-state-in-effect

  useEffect(() => {
    if (user?.role === "DOCTOR") {
      loadWorkspace();
    }
  }, [user, loadWorkspace]);

  // eslint-disable-next-line react-hooks/set-state-in-effect

  useEffect(() => {
    if (selectedId) {
      loadRecord(selectedId);
    } else {
      setRecord(null);
    }
  }, [selectedId, loadRecord]);

  // Selected encounter

  const selected = useMemo(
    () =>
      encounters.find((x) => x._id === selectedId) ||
      null,
    [encounters, selectedId]
  );

  // Form field helpers

  function setNoteField(key, value) {
    setNote((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setDiagnosisField(key, value) {
    setDiagnosis((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setLabField(key, value) {
    setLab((current) => ({
      ...current,
      [key]: value,
    }));
  }

  // Submit clinical note

  async function submitNote(event) {
    event.preventDefault();

    if (!selectedId) return;

    setSaving(true);
    setNotice({
      type: "",
      text: "",
    });

    try {
      const result = await apiRequest(
        `/api/clinical-records/${selectedId}/notes`,
        {
          method: "POST",
          body: JSON.stringify(note),
        }
      );

      setNotice({
        type: "success",
        text: result.message || "Clinical note saved.",
      });

      setNote(blankNote);

      await loadRecord(selectedId);
      await loadWorkspace();
    } catch (e) {
      setNotice({
        type: "error",
        text: e.message || "Unable to save note.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Submit diagnosis

  async function submitDiagnosis(event) {
    event.preventDefault();

    if (!selectedId) return;

    setSaving(true);
    setNotice({
      type: "",
      text: "",
    });

    try {
      const result = await apiRequest(
        `/api/clinical-records/${selectedId}/diagnoses`,
        {
          method: "POST",
          body: JSON.stringify(diagnosis),
        }
      );

      setNotice({
        type: "success",
        text:
          result.message || "Diagnosis record added.",
      });

      setDiagnosis(blankDiagnosis);

      await loadRecord(selectedId);
      await loadWorkspace();
    } catch (e) {
      setNotice({
        type: "error",
        text:
          e.message || "Unable to save diagnosis.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Submit laboratory investigation request

  async function submitLab(event) {
    event.preventDefault();

    if (!selectedId) return;

    setSaving(true);
    setNotice({
      type: "",
      text: "",
    });

    try {
      const result = await apiRequest(
        `/api/lab/encounters/${selectedId}`,
        {
          method: "POST",
          body: JSON.stringify(lab),
        }
      );

      setNotice({
        type: "success",
        text:
          result.message ||
          "Investigation request sent to the lab queue.",
      });

      setLab(blankLab);
    } catch (e) {
      setNotice({
        type: "error",
        text:
          e.message ||
          "Unable to submit investigation request.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Derived data

  const hospital =
    user?.hospital?.name ||
    user?.hospitalId?.name ||
    "Hospital workspace";

  const patient = selected?.patientId || {};

  const notes = record?.notes || [];
  const diagnoses = record?.diagnoses || [];

  const labs = [
    {
      value: "HEMATOLOGY",
      label: "Hematology",
    },
    {
      value: "BIOCHEMISTRY",
      label: "Biochemistry",
    },
    {
      value: "MICROBIOLOGY",
      label: "Microbiology",
    },
    {
      value: "IMMUNOLOGY",
      label: "Immunology",
    },
    {
      value: "URINALYSIS",
      label: "Urinalysis",
    },
    {
      value: "IMAGING",
      label: "Imaging",
    },
    {
      value: "OTHER",
      label: "Other",
    },
  ];

  return (
    <main className="mf-app mf-module-page mf-workspace-page">
      {/* Sidebar */}

      <aside className="mf-sidebar mf-module-sidebar">
        <Link href="/" className="mf-brand">
          <span className="mf-brand-mark">M+</span>

          <span>
            <span className="mf-brand-name">
              MediFlow
            </span>

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
            href="/doctor"
            className="mf-nav-link active"
          >
            <span className="mf-nav-icon">✚</span>
            Doctor workspace
          </Link>

          <Link
            href="/patients"
            className="mf-nav-link"
          >
            <span className="mf-nav-icon">♧</span>
            Patient records
          </Link>

          <Link
            href="/emergency"
            className="mf-nav-link"
          >
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
              <strong>{user?.name || "Doctor"}</strong>
              <span>DOCTOR</span>
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

      {/* Main workspace */}

      <section className="mf-main">
        {/* Header */}

        <header className="mf-topbar">
          <div className="mf-topbar-left">
            <p className="mf-page-kicker">
              Clinical care / Doctor
            </p>

            <h1>Doctor workspace</h1>
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
          {/* Welcome panel */}

          <section className="mf-welcome-panel mf-module-hero">
            <div>
              <span className="mf-welcome-tag">
                ✦ CLINICAL WORKSPACE
              </span>

              <h2>
                Care starts with a clear patient picture.
              </h2>

              <p>
                Review your assigned encounters, record
                clinician-entered notes and diagnoses,
                and send investigation requests to the
                lab team.
              </p>
            </div>

            <div
              className="mf-welcome-art"
              aria-hidden="true"
            >
              ✚
            </div>
          </section>

          {/* Statistics */}

          <div className="mf-emergency-stats">
            <div className="mf-em-stat">
              <span className="mf-em-icon plum">✚</span>

              <div>
                <span>Assigned patients</span>
                <strong>{encounters.length}</strong>
                <small>Active encounters</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon coral">▤</span>

              <div>
                <span>Clinical notes</span>

                <strong>
                  {encounters.reduce(
                    (total, encounter) =>
                      total +
                      (encounter.clinicalRecord?.notes
                        ?.length || 0),
                    0
                  )}
                </strong>

                <small>Across your current list</small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon amber">◇</span>

              <div>
                <span>Recorded diagnoses</span>

                <strong>
                  {encounters.reduce(
                    (total, encounter) =>
                      total +
                      (encounter.clinicalRecord?.diagnoses
                        ?.length || 0),
                    0
                  )}
                </strong>

                <small>
                  Clinician-entered records
                </small>
              </div>
            </div>

            <div className="mf-em-stat">
              <span className="mf-em-icon plum">⌁</span>

              <div>
                <span>Workflow</span>
                <strong>Live</strong>
                <small>
                  Refresh to sync assignments
                </small>
              </div>
            </div>
          </div>

          {/* Notifications */}

          {notice.text && (
            <div
              className={`mf-notice ${notice.type}`}
              role="status"
            >
              {notice.text}
            </div>
          )}

          {error && (
            <div
              className="mf-form-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Assigned patients */}

          <section className="mf-panel mf-doctor-patient-panel">
            <div className="mf-panel-head">
              <div>
                <h3>My assigned patients</h3>

                <p>
                  Only active encounters assigned to your
                  account are listed.
                </p>
              </div>

              <span className="mf-count-pill">
                {encounters.length} encounters
              </span>
            </div>

            {loading ? (
              <div className="mf-empty-state">
                <div className="mf-loading-orbit" />
                Loading your patients…
              </div>
            ) : encounters.length === 0 ? (
              <div className="mf-empty-state">
                <div className="mf-empty-icon">✚</div>

                <strong>
                  No active patients assigned yet
                </strong>

                <p>
                  Once an administrator or emergency team
                  assigns an encounter to you, it will
                  appear here.
                </p>

                <Link
                  className="mf-secondary-btn"
                  href="/emergency"
                >
                  Open emergency queue
                </Link>
              </div>
            ) : (
              <div className="mf-doctor-layout">
                {/* Patient list */}

                <div className="mf-doctor-patient-list">
                  {encounters.map((encounter) => {
                    const p = encounter.patientId || {};

                    return (
                      <button
                        key={encounter._id}
                        className={`mf-doctor-patient-item ${
                          selectedId === encounter._id
                            ? "active"
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedId(encounter._id);
                          setActiveTab("overview");
                          setNotice({
                            type: "",
                            text: "",
                          });
                        }}
                      >
                        <span className="mf-doctor-patient-avatar">
                          {initials(
                            `${p.firstName || "P"} ${
                              p.lastName || ""
                            }`
                          )}
                        </span>

                        <span className="mf-doctor-patient-text">
                          <strong>
                            {p.firstName} {p.lastName}
                          </strong>

                          <small>
                            {p.mrn ||
                              encounter.encounterNumber}
                          </small>

                          <small>
                            {encounter.type} ·{" "}
                            {encounter.status.replaceAll(
                              "_",
                              " "
                            )}
                          </small>
                        </span>

                        <span className="mf-doctor-item-arrow">
                          ›
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected patient chart */}

                {selected && (
                  <div className="mf-doctor-chart">
                    <div className="mf-doctor-chart-head">
                      <div>
                        <span className="mf-welcome-tag">
                          PATIENT CHART
                        </span>

                        <h3>
                          {patient.firstName}{" "}
                          {patient.lastName}
                        </h3>

                        <p>
                          {patient.mrn} ·{" "}
                          {patient.sex ||
                            "Sex not recorded"}{" "}
                          · DOB{" "}
                          {patient.dateOfBirth
                            ? new Date(
                                patient.dateOfBirth
                              ).toLocaleDateString()
                            : "—"}
                        </p>
                      </div>

                      <span className="mf-priority-badge medium">
                        {selected.triageLevel?.replaceAll(
                          "_",
                          " "
                        ) || "UNTRIAGED"}
                      </span>
                    </div>

                    {/* Patient facts */}

                    <div className="mf-patient-facts">
                      <div>
                        <span>Encounter</span>
                        <strong>
                          {selected.encounterNumber}
                        </strong>
                      </div>

                      <div>
                        <span>Type / status</span>
                        <strong>
                          {selected.type} ·{" "}
                          {selected.status.replaceAll(
                            "_",
                            " "
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Contact</span>
                        <strong>
                          {patient.phone || "—"}
                        </strong>
                      </div>

                      <div>
                        <span>Blood group</span>
                        <strong>
                          {patient.bloodGroup || "Unknown"}
                        </strong>
                      </div>
                    </div>

                    {/* Allergy information */}

                    {patient.allergies?.length > 0 && (
                      <div className="mf-allergy-banner">
                        <strong>Known allergies</strong>
                        <span>
                          {patient.allergies.join(", ")}
                        </span>
                      </div>
                    )}

                    {/* Patient chart tabs */}

                    <div
                      className="mf-workspace-tabs"
                      role="tablist"
                    >
                      <button
                        className={
                          activeTab === "overview"
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          setActiveTab("overview")
                        }
                      >
                        Clinical history
                      </button>

                      <button
                        className={
                          activeTab === "note"
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          setActiveTab("note")
                        }
                      >
                        Add note
                      </button>

                      <button
                        className={
                          activeTab === "diagnosis"
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          setActiveTab("diagnosis")
                        }
                      >
                        Diagnosis
                      </button>

                      <button
                        className={
                          activeTab === "lab"
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          setActiveTab("lab")
                        }
                      >
                        Investigation
                      </button>
                    </div>

                    {/* Clinical history */}

                    {activeTab === "overview" && (
                      <div className="mf-history-columns">
                        <section>
                          <h4>
                            Clinical notes{" "}
                            <span>{notes.length}</span>
                          </h4>

                          {notes.length ? (
                            [...notes]
                              .reverse()
                              .map((clinicalNote) => (
                                <article
                                  className="mf-history-card"
                                  key={clinicalNote._id}
                                >
                                  <small>
                                    {dateTime(
                                      clinicalNote.createdAt
                                    )}
                                  </small>

                                  <strong>
                                    {clinicalNote.assessment ||
                                      clinicalNote.subjective ||
                                      "Clinical note"}
                                  </strong>

                                  <p>
                                    {clinicalNote.generalNotes ||
                                      clinicalNote.plan ||
                                      clinicalNote.objective ||
                                      clinicalNote.subjective ||
                                      "No additional detail"}
                                  </p>
                                </article>
                              ))
                          ) : (
                            <p className="mf-muted-copy">
                              No clinical notes recorded for
                              this encounter.
                            </p>
                          )}
                        </section>

                        <section>
                          <h4>
                            Diagnoses{" "}
                            <span>{diagnoses.length}</span>
                          </h4>

                          {diagnoses.length ? (
                            [...diagnoses]
                              .reverse()
                              .map((item) => (
                                <article
                                  className="mf-history-card"
                                  key={item._id}
                                >
                                  <small>
                                    {item.type.replaceAll(
                                      "_",
                                      " "
                                    )}{" "}
                                    ·{" "}
                                    {dateTime(
                                      item.recordedAt
                                    )}
                                  </small>

                                  <strong>{item.name}</strong>

                                  <p>
                                    {item.code
                                      ? `Code: ${item.code} · `
                                      : ""}
                                    {item.notes || "No notes"}
                                  </p>
                                </article>
                              ))
                          ) : (
                            <p className="mf-muted-copy">
                              No diagnosis records yet.
                            </p>
                          )}
                        </section>
                      </div>
                    )}

                    {/* Add clinical note */}

                    {activeTab === "note" && (
                      <form
                        className="mf-module-form mf-workspace-form"
                        onSubmit={submitNote}
                      >
                        <p className="mf-form-help">
                          Record your clinical assessment.
                          MediFlow stores clinician-entered
                          information and does not generate
                          diagnoses or treatment advice.
                        </p>

                        <div className="mf-module-form-grid">
                          {[
                            {
                              key: "subjective",
                              label: "Subjective / history",
                            },
                            {
                              key: "objective",
                              label: "Objective findings",
                            },
                            {
                              key: "assessment",
                              label: "Assessment",
                            },
                            {
                              key: "plan",
                              label: "Plan / follow-up",
                            },
                          ].map((field) => (
                            <label
                              key={field.key}
                              className="mf-field"
                            >
                              <span>{field.label}</span>

                              <textarea
                                rows={3}
                                maxLength={5000}
                                value={note[field.key]}
                                onChange={(e) =>
                                  setNoteField(
                                    field.key,
                                    e.target.value
                                  )
                                }
                                placeholder={`Enter ${field.label.toLowerCase()}…`}
                              />
                            </label>
                          ))}

                          <label className="mf-field mf-field-wide">
                            <span>Additional notes</span>

                            <textarea
                              rows={2}
                              maxLength={10000}
                              value={note.generalNotes}
                              onChange={(e) =>
                                setNoteField(
                                  "generalNotes",
                                  e.target.value
                                )
                              }
                              placeholder="Optional context or handover information"
                            />
                          </label>
                        </div>

                        <div className="mf-module-form-actions">
                          <button
                            className="mf-primary-btn"
                            disabled={saving}
                          >
                            {saving
                              ? "Saving…"
                              : "Save clinical note →"}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Add diagnosis */}

                    {activeTab === "diagnosis" && (
                      <form
                        className="mf-module-form mf-workspace-form"
                        onSubmit={submitDiagnosis}
                      >
                        <div className="mf-module-form-grid">
                          <label className="mf-field mf-field-wide">
                            <span>
                              Diagnosis / clinical impression *
                            </span>

                            <input
                              required
                              maxLength={200}
                              value={diagnosis.name}
                              onChange={(e) =>
                                setDiagnosisField(
                                  "name",
                                  e.target.value
                                )
                              }
                              placeholder="Clinician-entered diagnosis"
                            />
                          </label>

                          <label className="mf-field">
                            <span>Code (optional)</span>

                            <input
                              maxLength={30}
                              value={diagnosis.code}
                              onChange={(e) =>
                                setDiagnosisField(
                                  "code",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. local / ICD code"
                            />
                          </label>

                          <label className="mf-field">
                            <span>Classification</span>

                            <select
                              value={diagnosis.type}
                              onChange={(e) =>
                                setDiagnosisField(
                                  "type",
                                  e.target.value
                                )
                              }
                            >
                              <option value="PROVISIONAL">
                                Provisional
                              </option>

                              <option value="CONFIRMED">
                                Confirmed
                              </option>

                              <option value="DIFFERENTIAL">
                                Differential
                              </option>
                            </select>
                          </label>

                          <label className="mf-field mf-field-wide">
                            <span>Notes</span>

                            <textarea
                              rows={3}
                              maxLength={2000}
                              value={diagnosis.notes}
                              onChange={(e) =>
                                setDiagnosisField(
                                  "notes",
                                  e.target.value
                                )
                              }
                              placeholder="Optional supporting notes"
                            />
                          </label>
                        </div>

                        <div className="mf-module-form-actions">
                          <button
                            className="mf-primary-btn"
                            disabled={saving}
                          >
                            {saving
                              ? "Saving…"
                              : "Save diagnosis →"}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Laboratory investigation */}

                    {activeTab === "lab" && (
                      <form
                        className="mf-module-form mf-workspace-form"
                        onSubmit={submitLab}
                      >
                        <div className="mf-inline-warning">
                          Investigation requests are sent to
                          your hospital&apos;s lab queue.
                          Select tests according to your
                          clinical judgement and local
                          protocols.
                        </div>

                        <div className="mf-module-form-grid">
                          <label className="mf-field mf-field-wide">
                            <span>
                              Investigation / test name *
                            </span>

                            <input
                              required
                              maxLength={150}
                              value={lab.testName}
                              onChange={(e) =>
                                setLabField(
                                  "testName",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. Complete blood count"
                            />
                          </label>

                          <label className="mf-field">
                            <span>Category</span>

                            <select
                              value={lab.category}
                              onChange={(e) =>
                                setLabField(
                                  "category",
                                  e.target.value
                                )
                              }
                            >
                              {labs.map((item) => (
                                <option
                                  key={item.value}
                                  value={item.value}
                                >
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="mf-field">
                            <span>Priority</span>

                            <select
                              value={lab.priority}
                              onChange={(e) =>
                                setLabField(
                                  "priority",
                                  e.target.value
                                )
                              }
                            >
                              <option value="ROUTINE">
                                Routine
                              </option>

                              <option value="URGENT">
                                Urgent
                              </option>

                              <option value="STAT">
                                STAT
                              </option>
                            </select>
                          </label>

                          <label className="mf-field">
                            <span>Specimen type</span>

                            <input
                              maxLength={100}
                              value={lab.specimenType}
                              onChange={(e) =>
                                setLabField(
                                  "specimenType",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. Blood, urine"
                            />
                          </label>

                          <label className="mf-field mf-field-wide">
                            <span>
                              Clinical indication
                            </span>

                            <textarea
                              rows={3}
                              maxLength={2000}
                              value={lab.clinicalIndication}
                              onChange={(e) =>
                                setLabField(
                                  "clinicalIndication",
                                  e.target.value
                                )
                              }
                              placeholder="Reason for requesting this investigation"
                            />
                          </label>
                        </div>

                        <div className="mf-module-form-actions">
                          <button
                            className="mf-primary-btn"
                            disabled={saving}
                          >
                            {saving
                              ? "Sending…"
                              : "Send lab request →"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Footer note */}

          <p className="mf-module-footnote">
            Patient information is restricted to authorized
            users in the current hospital. Follow local
            clinical protocols and record only verified
            observations.
          </p>
        </div>
      </section>
    </main>
  );
}
