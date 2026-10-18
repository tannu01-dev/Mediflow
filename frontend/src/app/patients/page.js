
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiRequest,
  getToken,
  getStoredUser,
  logout,
} from "@/lib/auth";

const initialForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  sex: "UNKNOWN",
  phone: "",
  email: "",
  address: "",
  bloodGroup: "UNKNOWN",
  allergies: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
};

const roles = [
  "HOSPITAL_ADMIN",
  "EMERGENCY_STAFF",
  "NURSE",
  "DOCTOR",
  "LAB_STAFF",
  "RECEPTION",
];

function initials(name = "P") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}

export default function PatientsPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [notice, setNotice] = useState({
    type: "",
    text: "",
  });
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

  const loadPatients = useCallback(async (search = "") => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "100",
      });

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const result = await apiRequest(
        `/api/patients?${params.toString()}`
      );

      setRows(result.patients || []);
    } catch (e) {
      setError(e.message || "Unable to load patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const handle = setTimeout(() => {
      loadPatients(query);
    }, 280);

    return () => clearTimeout(handle);
  }, [query, user, loadPatients]);

  function setField(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function submitPatient(event) {
    event.preventDefault();

    setSaving(true);
    setNotice({
      type: "",
      text: "",
    });
    setError("");

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      sex: form.sex,
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      bloodGroup: form.bloodGroup,
      allergies: form.allergies
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      emergencyContact: {
        name: form.emergencyName.trim(),
        relationship: form.emergencyRelationship.trim(),
        phone: form.emergencyPhone.trim(),
      },
    };

    try {
      const result = await apiRequest("/api/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setNotice({
        type: "success",
        text: `Patient registered. ID: ${
          result.patient?.mrn || "created"
        }`,
      });

      setForm(initialForm);
      setShowForm(false);

      await loadPatients("");
      setQuery("");
    } catch (e) {
      setNotice({
        type: "error",
        text: e.message || "Patient registration failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  const canCreate = [
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "NURSE",
    "RECEPTION",
  ].includes(user?.role);

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

        <div className="mf-nav-caption">
          YOUR WORKSPACE
        </div>

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

          {user?.role === "DOCTOR" && (
            <Link href="/doctor" className="mf-nav-link">
              <span className="mf-nav-icon">✚</span>
              Doctor workspace
            </Link>
          )}

          {user?.role === "NURSE" && (
            <Link href="/nurse" className="mf-nav-link">
              <span className="mf-nav-icon">♡</span>
              Nurse workspace
            </Link>
          )}

          <Link
            href="/patients"
            className="mf-nav-link active"
          >
            <span className="mf-nav-icon">♧</span>
            Patient records
          </Link>

          <Link href="/emergency" className="mf-nav-link">
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
              <strong>
                {user?.name || "Hospital user"}
              </strong>

              <span>
                {(user?.role || "STAFF").replaceAll(
                  "_",
                  " "
                )}
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
              Patient operations / Records
            </p>
            <h1>Patient directory</h1>
          </div>

          <div className="mf-topbar-right">
            <div className="mf-hospital-label">
              <span className="mf-status-dot" />
              <span>{hospital}</span>
            </div>

            <button
              className="mf-secondary-btn"
              onClick={() => router.push("/")}
            >
              Overview
            </button>
          </div>
        </header>

        <div className="mf-page-content">
          <section className="mf-welcome-panel mf-module-hero">
            <div>
              <span className="mf-welcome-tag">
                ✦ PATIENT REGISTRY
              </span>

              <h2>
                Every patient, one trusted record.
              </h2>

              <p>
                Register patients once and find them quickly
                for each new hospital visit. Patient profiles
                remain separate from encounter history.
              </p>
            </div>

            <div
              className="mf-welcome-art"
              aria-hidden="true"
            >
              ♧
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

          <div className="mf-module-toolbar">
            <div className="mf-module-search">
              <span>⌕</span>

              <input
                aria-label="Search patients"
                placeholder="Search by patient name, ID or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mf-toolbar-actions">
              <span className="mf-count-pill">
                {rows.length} records
              </span>

              {canCreate && (
                <button
                  className="mf-primary-btn"
                  onClick={() => {
                    setShowForm((v) => !v);
                    setNotice({
                      type: "",
                      text: "",
                    });
                  }}
                >
                  ＋ Register patient
                </button>
              )}
            </div>
          </div>

          {showForm && canCreate && (
            <section className="mf-panel mf-patient-form-panel">
              <div className="mf-panel-head">
                <div>
                  <h3>New patient registration</h3>
                  <p>
                    Fields marked with * are required.
                    Patient ID is generated automatically.
                  </p>
                </div>

                <button
                  className="mf-close-btn"
                  onClick={() => setShowForm(false)}
                  aria-label="Close registration form"
                >
                  ×
                </button>
              </div>

              <form
                onSubmit={submitPatient}
                className="mf-module-form"
              >
                <div className="mf-form-section-label">
                  PERSONAL DETAILS
                </div>

                <div className="mf-module-form-grid">
                  <label className="mf-field">
                    <span>First name *</span>

                    <input
                      required
                      maxLength={80}
                      value={form.firstName}
                      onChange={(e) =>
                        setField("firstName", e.target.value)
                      }
                      placeholder="e.g. Aanya"
                    />
                  </label>

                  <label className="mf-field">
                    <span>Last name</span>

                    <input
                      maxLength={80}
                      value={form.lastName}
                      onChange={(e) =>
                        setField("lastName", e.target.value)
                      }
                      placeholder="e.g. Sharma"
                    />
                  </label>

                  <label className="mf-field">
                    <span>Date of birth *</span>

                    <input
                      required
                      type="date"
                      max={new Date()
                        .toISOString()
                        .slice(0, 10)}
                      value={form.dateOfBirth}
                      onChange={(e) =>
                        setField(
                          "dateOfBirth",
                          e.target.value
                        )
                      }
                    />
                  </label>

                  <label className="mf-field">
                    <span>Sex</span>

                    <select
                      value={form.sex}
                      onChange={(e) =>
                        setField("sex", e.target.value)
                      }
                    >
                      <option value="UNKNOWN">
                        Prefer not to say
                      </option>
                      <option value="FEMALE">Female</option>
                      <option value="MALE">Male</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>

                  <label className="mf-field">
                    <span>Phone number *</span>

                    <input
                      required
                      maxLength={25}
                      value={form.phone}
                      onChange={(e) =>
                        setField("phone", e.target.value)
                      }
                      placeholder="Contact number"
                    />
                  </label>

                  <label className="mf-field">
                    <span>Email</span>

                    <input
                      type="email"
                      maxLength={254}
                      value={form.email}
                      onChange={(e) =>
                        setField("email", e.target.value)
                      }
                      placeholder="name@example.com"
                    />
                  </label>

                  <label className="mf-field">
                    <span>Blood group</span>

                    <select
                      value={form.bloodGroup}
                      onChange={(e) =>
                        setField(
                          "bloodGroup",
                          e.target.value
                        )
                      }
                    >
                      {[
                        "UNKNOWN",
                        "A+",
                        "A-",
                        "B+",
                        "B-",
                        "AB+",
                        "AB-",
                        "O+",
                        "O-",
                      ].map((x) => (
                        <option key={x} value={x}>
                          {x === "UNKNOWN"
                            ? "Not recorded"
                            : x}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mf-field">
                    <span>Known allergies</span>

                    <input
                      value={form.allergies}
                      onChange={(e) =>
                        setField("allergies", e.target.value)
                      }
                      placeholder="Comma-separated, if known"
                    />
                  </label>

                  <label className="mf-field mf-field-wide">
                    <span>Address</span>

                    <textarea
                      rows={2}
                      maxLength={500}
                      value={form.address}
                      onChange={(e) =>
                        setField("address", e.target.value)
                      }
                      placeholder="Current residential address"
                    />
                  </label>
                </div>

                <div className="mf-form-section-label">
                  EMERGENCY CONTACT
                  <span>OPTIONAL</span>
                </div>

                <div className="mf-module-form-grid">
                  <label className="mf-field">
                    <span>Contact name</span>

                    <input
                      value={form.emergencyName}
                      onChange={(e) =>
                        setField(
                          "emergencyName",
                          e.target.value
                        )
                      }
                      placeholder="Full name"
                    />
                  </label>

                  <label className="mf-field">
                    <span>Relationship</span>

                    <input
                      value={form.emergencyRelationship}
                      onChange={(e) =>
                        setField(
                          "emergencyRelationship",
                          e.target.value
                        )
                      }
                      placeholder="e.g. Parent"
                    />
                  </label>

                  <label className="mf-field">
                    <span>Contact phone</span>

                    <input
                      value={form.emergencyPhone}
                      onChange={(e) =>
                        setField(
                          "emergencyPhone",
                          e.target.value
                        )
                      }
                      placeholder="Phone number"
                    />
                  </label>
                </div>

                <div className="mf-module-form-actions">
                  <button
                    type="button"
                    className="mf-secondary-btn"
                    onClick={() => {
                      setShowForm(false);
                      setForm(initialForm);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="mf-primary-btn"
                    disabled={saving}
                  >
                    {saving
                      ? "Registering…"
                      : "Register patient →"}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="mf-panel mf-patient-list-panel">
            <div className="mf-panel-head">
              <div>
                <h3>Registered patients</h3>
                <p>
                  Hospital-scoped records, sorted by latest
                  registration.
                </p>
              </div>

              <span className="mf-pill">
                ● Private to hospital
              </span>
            </div>

            {loading ? (
              <div className="mf-empty-state">
                <div className="mf-loading-orbit" />
                Loading patient records…
              </div>
            ) : rows.length === 0 ? (
              <div className="mf-empty-state">
                <div className="mf-empty-icon">♧</div>

                <strong>
                  {query
                    ? "No matching patients"
                    : "No patients registered yet"}
                </strong>

                <p>
                  {query
                    ? "Try a different name, patient ID or phone number."
                    : "Register the first patient to begin your hospital's patient registry."}
                </p>

                {canCreate && !query && (
                  <button
                    className="mf-primary-btn"
                    onClick={() => setShowForm(true)}
                  >
                    ＋ Register first patient
                  </button>
                )}
              </div>
            ) : (
              <div className="mf-staff-table-wrap">
                <table className="mf-staff-table mf-patient-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Patient ID</th>
                      <th>Date of birth</th>
                      <th>Contact</th>
                      <th>Blood group</th>
                      <th>Registered</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((patient) => (
                      <tr key={patient._id}>
                        <td>
                          <div className="mf-staff-name">
                            <div className="mf-staff-initial">
                              {initials(
                                `${patient.firstName} ${
                                  patient.lastName || ""
                                }`
                              )}
                            </div>

                            <div>
                              <strong>
                                {patient.firstName}{" "}
                                {patient.lastName}
                              </strong>

                              <span>
                                {patient.sex || "Unknown"}
                                {patient.email
                                  ? ` · ${patient.email}`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="mf-mrn">
                            {patient.mrn}
                          </span>
                        </td>

                        <td>
                          {formatDate(patient.dateOfBirth)}
                        </td>

                        <td>{patient.phone || "—"}</td>

                        <td>
                          <span className="mf-role-badge">
                            {patient.bloodGroup || "UNKNOWN"}
                          </span>
                        </td>

                        <td>
                          {formatDate(patient.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="mf-module-footnote">
            MediFlow stores patient identity separately from
            each encounter. Clinical decisions must be entered
            by authorized healthcare professionals.
          </div>
        </div>
      </section>
    </main>
  );
}
