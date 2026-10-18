
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

const pretty = (value = "") =>
  String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const bedTypes = [
  "STANDARD",
  "ICU",
  "ISOLATION",
  "PRIVATE",
  "PEDIATRIC",
];

const wardTypes = [
  "GENERAL",
  "EMERGENCY",
  "ICU",
  "MATERNITY",
  "PEDIATRIC",
  "SURGICAL",
  "PRIVATE",
  "OTHER",
];

export default function BedsPage() {
  const router = useRouter();

  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [encounters, setEncounters] = useState([]);

  const [summary, setSummary] = useState({
    totalBeds: 0,
    available: 0,
    occupied: 0,
    cleaning: 0,
    maintenance: 0,
    activeWards: 0,
    activeAdmissions: 0,
  });

  const [tab, setTab] = useState("beds");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [wardForm, setWardForm] = useState({
    name: "",
    code: "",
    department: "",
    wardType: "GENERAL",
  });

  const [bedForm, setBedForm] = useState({
    wardId: "",
    bedNumber: "",
    bedType: "STANDARD",
  });

  const [admitForm, setAdmitForm] = useState({
    encounterId: "",
    bedId: "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadAll = useCallback(async () => {
    const [
      wardData,
      bedData,
      admissionData,
      encounterData,
      summaryData,
    ] = await Promise.all([
      apiRequest("/api/admissions/wards"),
      apiRequest("/api/admissions/beds"),
      apiRequest("/api/admissions?status=ADMITTED"),
      apiRequest("/api/encounters"),
      apiRequest("/api/beds/summary"),
    ]);

    setWards(wardData.wards || []);
    setBeds(bedData.beds || []);
    setAdmissions(admissionData.admissions || []);

    setEncounters(
      (
        encounterData.encounters ||
        encounterData.queue ||
        []
      ).filter(
        (encounter) =>
          ![
            "ADMITTED",
            "TRANSFERRED",
            "DISCHARGED",
          ].includes(encounter.status)
      )
    );

    if (summaryData.summary) {
      setSummary(summaryData.summary);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    async function initialize() {
      try {
        await loadAll();
      } catch (e) {
        setError(
          e.message || "Unable to load bed management data."
        );
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [router, loadAll]);

  const visibleBeds = useMemo(() => {
    return beds.filter((bed) => {
      const statusOk =
        filter === "ALL" || bed.status === filter;

      const query = search.trim().toLowerCase();

      const text = [
        bed.bedNumber,
        bed.bedType,
        bed.wardId?.name,
        bed.wardId?.code,
        bed.currentEncounterId?.encounterNumber,
      ]
        .join(" ")
        .toLowerCase();

      return statusOk && (!query || text.includes(query));
    });
  }, [beds, filter, search]);

  async function submitForm(
    event,
    path,
    body,
    message,
    reset
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setBusy(true);

    try {
      const response = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(body),
      });

      setSuccess(response.message || message);
      reset();

      await loadAll();
    } catch (e) {
      setError(e.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(bed, status) {
    setError("");
    setSuccess("");
    setBusy(true);

    try {
      const response = await apiRequest(
        `/api/beds/${bed._id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            note:
              status === "AVAILABLE"
                ? "Cleaning complete; bed ready"
                : "Bed marked for maintenance",
          }),
        }
      );

      setSuccess(
        response.message || "Bed status updated."
      );

      await loadAll();
    } catch (e) {
      setError(
        e.message || "Unable to update bed status."
      );
    } finally {
      setBusy(false);
    }
  }

  async function admitPatient(event) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setBusy(true);

    try {
      const response = await apiRequest(
        "/api/admissions",
        {
          method: "POST",
          body: JSON.stringify(admitForm),
        }
      );

      setSuccess(
        response.message ||
          "Patient admitted successfully."
      );

      setAdmitForm({
        encounterId: "",
        bedId: "",
      });

      await loadAll();
    } catch (e) {
      setError(
        e.message || "Unable to admit patient."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mf-module-page">
        <div className="mf-loading-card">
          Opening bed management…
        </div>
      </main>
    );
  }

  const role = user?.role || "HOSPITAL_ADMIN";
  const name = user?.name || "Hospital User";

  const canConfigure = role === "HOSPITAL_ADMIN";

  const canAdmit = [
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "RECEPTION",
  ].includes(role);

  const canClean = [
    "HOSPITAL_ADMIN",
    "NURSE",
    "EMERGENCY_STAFF",
  ].includes(role);

  return (
    <main className="mf-module-page">
      <aside className="mf-module-sidebar">
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
            <span className="mf-nav-icon">✚</span>
            Emergency queue
          </Link>

          <Link href="/lab" className="mf-nav-link">
            <span className="mf-nav-icon">⚗</span>
            Laboratory
          </Link>

          <Link
            href="/beds"
            className="mf-nav-link active"
          >
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
        </div>

        <button
          className="mf-sidebar-logout"
          onClick={logout}
        >
          ↗ &nbsp; Sign out of MediFlow
        </button>
      </aside>

      <section className="mf-main">
        <header className="mf-topbar">
          <div>
            <p className="mf-page-kicker">
              Hospital operations / Capacity
            </p>

            <h1>Beds & ward management</h1>
          </div>

          <div className="mf-topbar-right">
            <span className="mf-hospital-label">
              {pretty(role)} workspace
            </span>

            <button
              className="mf-secondary-button"
              onClick={() =>
                loadAll().catch((e) =>
                  setError(e.message)
                )
              }
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        <div className="mf-module-content">
          <section className="mf-welcome-panel">
            <div>
              <span className="mf-eyebrow">
                CAPACITY CONTROL CENTRE
              </span>

              <h2>Know every bed&apos;s status.</h2>

              <p>
                Manage ward capacity, admit patients to
                available beds, and route discharged beds
                through cleaning before they become
                available again.
              </p>
            </div>

            <div className="mf-welcome-mark">▤</div>
          </section>

          {error && (
            <div
              className="mf-alert error"
              role="alert"
            >
              {error}

              <button onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}

          {success && (
            <div
              className="mf-alert success"
              role="status"
            >
              {success}

              <button onClick={() => setSuccess("")}>
                ×
              </button>
            </div>
          )}

          <div className="mf-emergency-stats mf-bed-stats">
            <article className="mf-em-stat">
              <span className="mf-em-icon plum">
                ▤
              </span>

              <div>
                <small>Total beds</small>
                <strong>{summary.totalBeds}</strong>
                <span>
                  {summary.activeWards} active wards
                </span>
              </div>
            </article>

            <article className="mf-em-stat">
              <span className="mf-em-icon coral">
                ✓
              </span>

              <div>
                <small>Available</small>
                <strong>{summary.available}</strong>
                <span>Ready for admission</span>
              </div>
            </article>

            <article className="mf-em-stat">
              <span className="mf-em-icon amber">
                ♡
              </span>

              <div>
                <small>Occupied</small>
                <strong>{summary.occupied}</strong>
                <span>
                  {summary.activeAdmissions} active
                  admissions
                </span>
              </div>
            </article>

            <article className="mf-em-stat">
              <span className="mf-em-icon muted">
                ◷
              </span>

              <div>
                <small>Cleaning / repair</small>

                <strong>
                  {summary.cleaning +
                    summary.maintenance}
                </strong>

                <span>
                  {summary.cleaning} cleaning ·{" "}
                  {summary.maintenance} maintenance
                </span>
              </div>
            </article>
          </div>

          <div className="mf-workspace-tabs mf-beds-tabs">
            <button
              className={
                tab === "beds" ? "active" : ""
              }
              onClick={() => setTab("beds")}
            >
              Bed inventory
            </button>

            <button
              className={
                tab === "wards" ? "active" : ""
              }
              onClick={() => setTab("wards")}
            >
              Wards ({wards.length})
            </button>

            <button
              className={
                tab === "admissions" ? "active" : ""
              }
              onClick={() => setTab("admissions")}
            >
              Admissions ({admissions.length})
            </button>

            {canConfigure && (
              <button
                className={
                  tab === "configure" ? "active" : ""
                }
                onClick={() => setTab("configure")}
              >
                Configure capacity
              </button>
            )}
          </div>

          {/* BED INVENTORY */}

          {tab === "beds" && (
            <section className="mf-panel">
              <div className="mf-panel-head">
                <div>
                  <h3>Bed inventory</h3>
                  <p>
                    Current bed state for this hospital
                    only.
                  </p>
                </div>

                <span className="mf-pill">
                  {visibleBeds.length} beds
                </span>
              </div>

              <div className="mf-toolbar">
                <input
                  placeholder="Search bed, ward or type…"
                  aria-label="Search beds"
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                />

                <select
                  aria-label="Filter bed status"
                  value={filter}
                  onChange={(e) =>
                    setFilter(e.target.value)
                  }
                >
                  <option value="ALL">
                    All statuses
                  </option>

                  {[
                    "AVAILABLE",
                    "OCCUPIED",
                    "CLEANING",
                    "MAINTENANCE",
                  ].map((status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {pretty(status)}
                    </option>
                  ))}
                </select>
              </div>

              {visibleBeds.length === 0 ? (
                <div className="mf-empty-state">
                  <span>▤</span>
                  <h3>No beds in this view</h3>
                  <p>
                    Create wards and beds in Configure
                    capacity.
                  </p>
                </div>
              ) : (
                <div className="mf-bed-grid">
                  {visibleBeds.map((bed) => (
                    <article
                      className={`mf-bed-card ${bed.status.toLowerCase()}`}
                      key={bed._id}
                    >
                      <div className="mf-bed-card-top">
                        <span className="mf-bed-symbol">
                          ▤
                        </span>

                        <span
                          className={`mf-status-pill ${bed.status.toLowerCase()}`}
                        >
                          {pretty(bed.status)}
                        </span>
                      </div>

                      <h3>{bed.bedNumber}</h3>

                      <p>
                        {bed.wardId?.name || "Ward"} ·{" "}
                        {pretty(bed.bedType)}
                      </p>

                      {bed.currentEncounterId && (
                        <div className="mf-bed-encounter">
                          Encounter{" "}
                          <strong>
                            {bed.currentEncounterId
                              .encounterNumber || "Active"}
                          </strong>
                        </div>
                      )}

                      {bed.statusNote && (
                        <small className="mf-bed-note">
                          {bed.statusNote}
                        </small>
                      )}

                      {canClean && (
                        <div className="mf-bed-actions">
                          {bed.status === "CLEANING" && (
                            <button
                              className="mf-primary-button"
                              disabled={busy}
                              onClick={() =>
                                updateStatus(
                                  bed,
                                  "AVAILABLE"
                                )
                              }
                            >
                              ✓ Cleaning complete
                            </button>
                          )}

                          {[
                            "AVAILABLE",
                            "CLEANING",
                          ].includes(bed.status) && (
                            <button
                              className="mf-quiet-button"
                              disabled={busy}
                              onClick={() =>
                                updateStatus(
                                  bed,
                                  "MAINTENANCE"
                                )
                              }
                            >
                              Mark maintenance
                            </button>
                          )}

                          {bed.status ===
                            "MAINTENANCE" && (
                            <button
                              className="mf-primary-button"
                              disabled={busy}
                              onClick={() =>
                                updateStatus(
                                  bed,
                                  "AVAILABLE"
                                )
                              }
                            >
                              Return to service
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* WARD DIRECTORY */}

          {tab === "wards" && (
            <section className="mf-panel">
              <div className="mf-panel-head">
                <div>
                  <h3>Ward directory</h3>
                  <p>
                    Ward type and bed capacity overview.
                  </p>
                </div>

                <span className="mf-pill">
                  {wards.length} wards
                </span>
              </div>

              {wards.length === 0 ? (
                <div className="mf-empty-state">
                  <span>⌂</span>
                  <h3>No wards created</h3>
                  <p>
                    Hospital administrators can configure
                    wards.
                  </p>
                </div>
              ) : (
                <div className="mf-ward-grid">
                  {wards.map((ward) => (
                    <article
                      className="mf-ward-card"
                      key={ward._id}
                    >
                      <div className="mf-ward-code">
                        {ward.code}
                      </div>

                      <h3>{ward.name}</h3>

                      <p>
                        {ward.department ||
                          "General services"}{" "}
                        · {pretty(ward.wardType)}
                      </p>

                      <div className="mf-ward-capacity">
                        <span>
                          <b>
                            {ward.bedSummary?.available ||
                              0}
                          </b>{" "}
                          available
                        </span>

                        <span>
                          <b>
                            {ward.bedSummary?.occupied ||
                              0}
                          </b>{" "}
                          occupied
                        </span>

                        <span>
                          <b>
                            {ward.bedSummary?.total || 0}
                          </b>{" "}
                          total
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ACTIVE ADMISSIONS */}

          {tab === "admissions" && (
            <section className="mf-panel">
              <div className="mf-panel-head">
                <div>
                  <h3>Active admissions</h3>
                  <p>
                    Patients currently assigned to a ward
                    bed.
                  </p>
                </div>

                <span className="mf-pill">
                  {admissions.length} active
                </span>
              </div>

              {admissions.length === 0 ? (
                <div className="mf-empty-state">
                  <span>♡</span>
                  <h3>No active admissions</h3>
                  <p>
                    Admit an eligible encounter to an
                    available bed.
                  </p>
                </div>
              ) : (
                <div className="mf-admission-list">
                  {admissions.map((admission) => (
                    <article
                      className="mf-admission-row"
                      key={admission._id}
                    >
                      <div className="mf-admission-avatar">
                        {(admission.patientId?.firstName ||
                          "P").charAt(0)}
                      </div>

                      <div className="mf-admission-main">
                        <strong>
                          {admission.patientId?.firstName}{" "}
                          {admission.patientId?.lastName}
                        </strong>

                        <span>
                          {admission.patientId?.mrn ||
                            "MRN unavailable"}{" "}
                          ·{" "}
                          {admission.encounterId
                            ?.encounterNumber || "Encounter"}
                        </span>
                      </div>

                      <div className="mf-admission-bed">
                        <small>BED / WARD</small>

                        <strong>
                          {admission.bedId?.bedNumber ||
                            "—"}{" "}
                          ·{" "}
                          {admission.wardId?.name || "—"}
                        </strong>
                      </div>

                      <span className="mf-status-pill admitted">
                        Admitted
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* CONFIGURE CAPACITY */}

          {tab === "configure" && canConfigure && (
            <div className="mf-phase-two-column">
              {/* CREATE WARD */}

              <section className="mf-panel">
                <div className="mf-panel-head">
                  <div>
                    <h3>Create a ward</h3>
                    <p>
                      Set up an ICU, emergency, general or
                      specialist ward.
                    </p>
                  </div>

                  <span className="mf-pill">Admin</span>
                </div>

                <form
                  className="mf-phase-form single"
                  onSubmit={(event) =>
                    submitForm(
                      event,
                      "/api/admissions/wards",
                      wardForm,
                      "Ward created",
                      () =>
                        setWardForm({
                          name: "",
                          code: "",
                          department: "",
                          wardType: "GENERAL",
                        })
                    )
                  }
                >
                  <label>
                    Ward name *
                    <input
                      required
                      maxLength={100}
                      value={wardForm.name}
                      onChange={(e) =>
                        setWardForm({
                          ...wardForm,
                          name: e.target.value,
                        })
                      }
                      placeholder="e.g. Medical ICU"
                    />
                  </label>

                  <label>
                    Ward code *
                    <input
                      required
                      maxLength={30}
                      value={wardForm.code}
                      onChange={(e) =>
                        setWardForm({
                          ...wardForm,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="e.g. MICU-01"
                    />
                  </label>

                  <label>
                    Department
                    <input
                      maxLength={100}
                      value={wardForm.department}
                      onChange={(e) =>
                        setWardForm({
                          ...wardForm,
                          department: e.target.value,
                        })
                      }
                      placeholder="e.g. Critical care"
                    />
                  </label>

                  <label>
                    Ward type
                    <select
                      value={wardForm.wardType}
                      onChange={(e) =>
                        setWardForm({
                          ...wardForm,
                          wardType: e.target.value,
                        })
                      }
                    >
                      {wardTypes.map((type) => (
                        <option
                          key={type}
                          value={type}
                        >
                          {pretty(type)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="mf-primary-button"
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Create ward"}
                  </button>
                </form>
              </section>

              {/* ADD BED */}

              <section className="mf-panel">
                <div className="mf-panel-head">
                  <div>
                    <h3>Add a bed</h3>
                    <p>New beds start as available.</p>
                  </div>

                  <span className="mf-pill">Admin</span>
                </div>

                <form
                  className="mf-phase-form single"
                  onSubmit={(event) =>
                    submitForm(
                      event,
                      "/api/admissions/beds",
                      bedForm,
                      "Bed created",
                      () =>
                        setBedForm({
                          wardId: "",
                          bedNumber: "",
                          bedType: "STANDARD",
                        })
                    )
                  }
                >
                  <label>
                    Ward *
                    <select
                      required
                      value={bedForm.wardId}
                      onChange={(e) =>
                        setBedForm({
                          ...bedForm,
                          wardId: e.target.value,
                        })
                      }
                    >
                      <option value="">
                        Select active ward
                      </option>

                      {wards
                        .filter(
                          (ward) =>
                            ward.status === "ACTIVE"
                        )
                        .map((ward) => (
                          <option
                            key={ward._id}
                            value={ward._id}
                          >
                            {ward.name} ({ward.code})
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    Bed number *
                    <input
                      required
                      maxLength={30}
                      value={bedForm.bedNumber}
                      onChange={(e) =>
                        setBedForm({
                          ...bedForm,
                          bedNumber:
                            e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="e.g. ICU-01"
                    />
                  </label>

                  <label>
                    Bed type
                    <select
                      value={bedForm.bedType}
                      onChange={(e) =>
                        setBedForm({
                          ...bedForm,
                          bedType: e.target.value,
                        })
                      }
                    >
                      {bedTypes.map((type) => (
                        <option
                          key={type}
                          value={type}
                        >
                          {pretty(type)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="mf-primary-button"
                    disabled={
                      busy || wards.length === 0
                    }
                  >
                    {busy ? "Saving…" : "Add bed"}
                  </button>
                </form>
              </section>

              {/* ADMIT PATIENT */}

              {canAdmit && (
                <section className="mf-panel mf-admit-panel">
                  <div className="mf-panel-head">
                    <div>
                      <h3>Admit an encounter</h3>
                      <p>
                        Only active encounters and
                        available beds can be selected.
                      </p>
                    </div>

                    <span className="mf-pill">
                      Admission
                    </span>
                  </div>

                  <form
                    className="mf-phase-form"
                    onSubmit={admitPatient}
                  >
                    <label>
                      Patient encounter *
                      <select
                        required
                        value={admitForm.encounterId}
                        onChange={(e) =>
                          setAdmitForm({
                            ...admitForm,
                            encounterId: e.target.value,
                          })
                        }
                      >
                        <option value="">
                          Select encounter
                        </option>

                        {encounters.map((encounter) => (
                          <option
                            key={encounter._id}
                            value={encounter._id}
                          >
                            {encounter.encounterNumber} ·{" "}
                            {encounter.patientId?.firstName ||
                              encounter.patient?.firstName ||
                              "Patient"}{" "}
                            {encounter.patientId?.lastName ||
                              encounter.patient?.lastName ||
                              ""}{" "}
                            ·{" "}
                            {encounter.chiefComplaint ||
                              pretty(encounter.type)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Available bed *
                      <select
                        required
                        value={admitForm.bedId}
                        onChange={(e) =>
                          setAdmitForm({
                            ...admitForm,
                            bedId: e.target.value,
                          })
                        }
                      >
                        <option value="">
                          Select bed
                        </option>

                        {beds
                          .filter(
                            (bed) =>
                              bed.status === "AVAILABLE"
                          )
                          .map((bed) => (
                            <option
                              key={bed._id}
                              value={bed._id}
                            >
                              {bed.bedNumber} ·{" "}
                              {bed.wardId?.name} ·{" "}
                              {pretty(bed.bedType)}
                            </option>
                          ))}
                      </select>
                    </label>

                    <div className="mf-phase-wide mf-form-actions">
                      <p>
                        Admission marks the bed occupied
                        and updates the encounter status.
                      </p>

                      <button
                        className="mf-primary-button"
                        disabled={
                          busy ||
                          !beds.some(
                            (bed) =>
                              bed.status === "AVAILABLE"
                          )
                        }
                      >
                        {busy
                          ? "Admitting…"
                          : "Admit patient"}
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
