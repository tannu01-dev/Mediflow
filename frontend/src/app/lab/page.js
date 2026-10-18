
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

const STATUSES = [
  "REQUESTED",
  "SAMPLE_COLLECTED",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

const priorityClass = (priority) =>
  priority === "STAT"
    ? "critical"
    : priority === "URGENT"
      ? "urgent"
      : "routine";

const pretty = (value = "") =>
  String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function LaboratoryPage() {
  const router = useRouter();

  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const [result, setResult] = useState({
    value: "",
    units: "",
    referenceRange: "",
    interpretation: "NORMAL",
    remarks: "",
  });

  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback(async () => {
    const data = await apiRequest("/api/lab?limit=100");
    setRequests(data.labRequests || []);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    async function initialize() {
      try {
        await loadRequests();
      } catch (e) {
        setError(e.message || "Unable to load laboratory queue.");
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [router, loadRequests]);

  const filtered = useMemo(
    () =>
      requests.filter((item) => {
        const statusOk = filter === "ALL" || item.status === filter;
        const q = search.trim().toLowerCase();
        const patient = item.patientId || {};

        const text = [
          item.requestNumber,
          item.testName,
          patient.mrn,
          patient.firstName,
          patient.lastName,
          item.encounterId?.encounterNumber,
        ]
          .join(" ")
          .toLowerCase();

        return statusOk && (!q || text.includes(q));
      }),
    [requests, filter, search]
  );

  const counts = useMemo(
    () => ({
      pending: requests.filter((r) =>
        ["REQUESTED", "SAMPLE_COLLECTED", "PROCESSING"].includes(r.status)
      ).length,

      urgent: requests.filter(
        (r) =>
          ["STAT", "URGENT"].includes(r.priority) &&
          !["COMPLETED", "CANCELLED"].includes(r.status)
      ).length,

      completed: requests.filter((r) => r.status === "COMPLETED").length,
    }),
    [requests]
  );

  async function changeStatus(item, status) {
    setError("");
    setSuccess("");
    setBusyId(item._id);

    try {
      const response = await apiRequest(
        `/api/lab/${item._id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, note }),
        }
      );

      setSuccess(response.message || "Lab request updated.");
      setNote("");

      await loadRequests();

      if (selected?._id === item._id) {
        setSelected(response.labRequest || item);
      }
    } catch (e) {
      setError(e.message || "Could not update status.");
    } finally {
      setBusyId("");
    }
  }

  async function saveResult(event) {
    event.preventDefault();

    if (!selected) return;

    setError("");
    setSuccess("");
    setBusyId(selected._id);

    try {
      await apiRequest(
        `/api/lab/${selected._id}/results`,
        {
          method: "POST",
          body: JSON.stringify(result),
        }
      );

      setSuccess(
        "Result saved. Review the result and then mark the request completed."
      );

      await loadRequests();

      const refreshed = await apiRequest(`/api/lab/${selected._id}`);

      setSelected(refreshed.labRequest || selected);
    } catch (e) {
      setError(e.message || "Could not save result.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <main className="mf-module-page">
        <div className="mf-loading-card">
          Opening laboratory workspace…
        </div>
      </main>
    );
  }

  const role = user?.role || "LAB_STAFF";
  const canProcess = ["LAB_STAFF", "HOSPITAL_ADMIN"].includes(role);
  const name = user?.name || "Hospital User";

  return (
    <main className="mf-module-page">
      <aside className="mf-module-sidebar">
        <Link href="/" className="mf-brand">
          <span className="mf-brand-mark">M+</span>

          <span>
            <span className="mf-brand-name">MediFlow</span>
            <span className="mf-brand-sub">Hospital operations</span>
          </span>
        </Link>

        <div className="mf-nav-caption">YOUR WORKSPACE</div>

        <nav className="mf-nav-list">
          <Link href="/" className="mf-nav-link">
            <span className="mf-nav-icon">▦</span>
            Overview
          </Link>

          <Link href="/patients" className="mf-nav-link">
            <span className="mf-nav-icon">♧</span>
            Patient records
          </Link>

          <Link href="/emergency" className="mf-nav-link">
            <span className="mf-nav-icon">✚</span>
            Emergency queue
          </Link>

          <Link href="/lab" className="mf-nav-link active">
            <span className="mf-nav-icon">⚗</span>
            Laboratory
          </Link>

          <Link href="/beds" className="mf-nav-link">
            <span className="mf-nav-icon">▤</span>
            Beds & wards
          </Link>
        </nav>

        <div className="mf-sidebar-bottom">
          <div className="mf-sidebar-user">
            <div className="mf-avatar">
              {name.charAt(0).toUpperCase()}
            </div>

            <div>
              <strong>{name}</strong>
              <span>{pretty(role)}</span>
            </div>
          </div>

          <button className="mf-sidebar-logout" onClick={logout}>
            ↗ &nbsp; Sign out of MediFlow
          </button>
        </div>
      </aside>

      <section className="mf-main">
        <header className="mf-topbar">
          <div>
            <p className="mf-page-kicker">
              Diagnostics / Laboratory
            </p>
            <h1>Laboratory operations</h1>
          </div>

          <div className="mf-topbar-right">
            <span className="mf-hospital-label">
              {pretty(role)} workspace
            </span>

            <button
              className="mf-secondary-button"
              onClick={() =>
                loadRequests().catch((e) => setError(e.message))
              }
            >
              ↻ Refresh queue
            </button>
          </div>
        </header>

        <div className="mf-module-content">
          <section className="mf-welcome-panel">
            <div>
              <span className="mf-eyebrow">
                DIAGNOSTICS COMMAND DESK
              </span>

              <h2>Every sample, clearly tracked.</h2>

              <p>
                Process requests in priority order, capture laboratory
                results and make completed results available to the
                clinical team.
              </p>
            </div>

            <div className="mf-welcome-mark">⚗</div>
          </section>

          {error && (
            <div className="mf-alert error" role="alert">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}

          {success && (
            <div className="mf-alert success" role="status">
              {success}
              <button onClick={() => setSuccess("")}>×</button>
            </div>
          )}

          <div className="mf-emergency-stats mf-lab-stats">
            <article className="mf-em-stat">
              <span className="mf-em-icon coral">◷</span>

              <div>
                <small>Active requests</small>
                <strong>{counts.pending}</strong>
                <span>Awaiting processing</span>
              </div>
            </article>

            <article className="mf-em-stat">
              <span className="mf-em-icon amber">!</span>

              <div>
                <small>Urgent / STAT</small>
                <strong>{counts.urgent}</strong>
                <span>Prioritize these first</span>
              </div>
            </article>

            <article className="mf-em-stat">
              <span className="mf-em-icon plum">✓</span>

              <div>
                <small>Completed</small>
                <strong>{counts.completed}</strong>
                <span>Results entered</span>
              </div>
            </article>
          </div>

          <section className="mf-panel mf-lab-queue-panel">
            <div className="mf-panel-head">
              <div>
                <h3>Laboratory queue</h3>
                <p>
                  {filtered.length} request
                  {filtered.length === 1 ? "" : "s"} match the current
                  view.
                </p>
              </div>

              <span className="mf-pill">Live data</span>
            </div>

            <div className="mf-toolbar">
              <input
                aria-label="Search lab requests"
                placeholder="Search test, patient or request ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                aria-label="Filter by status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="ALL">All statuses</option>

                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {pretty(status)}
                  </option>
                ))}
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="mf-empty-state">
                <span>⚗</span>
                <h3>No lab requests found</h3>
                <p>
                  New investigations requested by a doctor will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="mf-lab-list">
                {filtered.map((item) => {
                  const patient = item.patientId || {};
                  const encounter = item.encounterId || {};

                  const nextStatus =
                    item.status === "REQUESTED"
                      ? "SAMPLE_COLLECTED"
                      : item.status === "SAMPLE_COLLECTED"
                        ? "PROCESSING"
                        : null;

                  return (
                    <article
                      className={`mf-lab-card ${
                        selected?._id === item._id ? "selected" : ""
                      }`}
                      key={item._id}
                    >
                      <div className="mf-lab-card-top">
                        <div className="mf-lab-test-icon">⚗</div>

                        <div className="mf-lab-card-title">
                          <div>
                            <strong>{item.testName}</strong>

                            <span
                              className={`mf-lab-priority ${priorityClass(
                                item.priority
                              )}`}
                            >
                              {item.priority}
                            </span>
                          </div>

                          <small>
                            {item.requestNumber} ·{" "}
                            {item.category || "OTHER"}
                          </small>
                        </div>

                        <span
                          className={`mf-status-pill ${item.status.toLowerCase()}`}
                        >
                          {pretty(item.status)}
                        </span>
                      </div>

                      <div className="mf-lab-patient">
                        <div>
                          <small>PATIENT</small>

                          <strong>
                            {patient.firstName || "Patient"}{" "}
                            {patient.lastName || ""}
                          </strong>

                          <span>
                            {patient.mrn || "MRN unavailable"} ·{" "}
                            {encounter.encounterNumber || "Encounter"}
                          </span>
                        </div>

                        <div>
                          <small>SPECIMEN</small>

                          <strong>
                            {item.specimenType || "Not specified"}
                          </strong>

                          <span>
                            {item.clinicalIndication ||
                              "No clinical indication provided"}
                          </span>
                        </div>
                      </div>

                      {item.result?.value && (
                        <div className="mf-lab-result-preview">
                          <span>RESULT</span>

                          <strong>
                            {item.result.value} {item.result.units}
                          </strong>

                          <em>
                            {pretty(item.result.interpretation)}
                          </em>
                        </div>
                      )}

                      {canProcess && (
                        <div className="mf-lab-actions">
                          {nextStatus && (
                            <button
                              className="mf-primary-button"
                              disabled={busyId === item._id}
                              onClick={() =>
                                changeStatus(item, nextStatus)
                              }
                            >
                              {busyId === item._id
                                ? "Saving…"
                                : nextStatus === "SAMPLE_COLLECTED"
                                  ? "✓ Sample collected"
                                  : "Start processing →"}
                            </button>
                          )}

                          {item.status === "PROCESSING" && (
                            <button
                              className="mf-primary-button"
                              onClick={() => {
                                setSelected(item);

                                setResult({
                                  value: item.result?.value || "",
                                  units: item.result?.units || "",
                                  referenceRange:
                                    item.result?.referenceRange || "",
                                  interpretation:
                                    item.result?.interpretation &&
                                    item.result.interpretation !==
                                      "NOT_REVIEWED"
                                      ? item.result.interpretation
                                      : "NORMAL",
                                  remarks: item.result?.remarks || "",
                                });
                              }}
                            >
                              Enter result
                            </button>
                          )}

                          {!["COMPLETED", "CANCELLED"].includes(
                            item.status
                          ) && (
                            <button
                              className="mf-quiet-button"
                              disabled={busyId === item._id}
                              onClick={() =>
                                changeStatus(item, "CANCELLED")
                              }
                            >
                              Cancel request
                            </button>
                          )}

                          {item.status === "PROCESSING" &&
                            item.result?.value &&
                            item.result?.interpretation !==
                              "NOT_REVIEWED" && (
                              <button
                                className="mf-quiet-button"
                                disabled={busyId === item._id}
                                onClick={() =>
                                  changeStatus(item, "COMPLETED")
                                }
                              >
                                Mark completed
                              </button>
                            )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {selected && canProcess && (
            <section className="mf-panel mf-result-panel">
              <div className="mf-panel-head">
                <div>
                  <h3>Enter laboratory result</h3>
                  <p>
                    {selected.testName} · {selected.requestNumber}
                  </p>
                </div>

                <button
                  className="mf-quiet-button"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>

              <form className="mf-phase-form" onSubmit={saveResult}>
                <label>
                  Result value *
                  <input
                    required
                    maxLength={2000}
                    value={result.value}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        value: e.target.value,
                      })
                    }
                    placeholder="Enter measured result"
                  />
                </label>

                <label>
                  Units
                  <input
                    maxLength={50}
                    value={result.units}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        units: e.target.value,
                      })
                    }
                    placeholder="e.g. mg/dL"
                  />
                </label>

                <label>
                  Reference range
                  <input
                    maxLength={200}
                    value={result.referenceRange}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        referenceRange: e.target.value,
                      })
                    }
                    placeholder="As supplied by the lab"
                  />
                </label>

                <label>
                  Interpretation
                  <select
                    value={result.interpretation}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        interpretation: e.target.value,
                      })
                    }
                  >
                    <option value="NOT_REVIEWED">Not reviewed</option>
                    <option value="NORMAL">Normal</option>
                    <option value="ABNORMAL">Abnormal</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="INCONCLUSIVE">
                      Inconclusive
                    </option>
                  </select>
                </label>

                <label className="mf-phase-wide">
                  Remarks
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={result.remarks}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        remarks: e.target.value,
                      })
                    }
                    placeholder="Optional technical notes"
                  />
                </label>

                <div className="mf-phase-wide mf-form-actions">
                  <p>
                    Enter only verified laboratory findings. Clinical
                    interpretation and treatment decisions remain with
                    the treating clinician.
                  </p>

                  <button
                    className="mf-primary-button"
                    disabled={busyId === selected._id}
                  >
                    {busyId === selected._id
                      ? "Saving result…"
                      : "Save result"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
