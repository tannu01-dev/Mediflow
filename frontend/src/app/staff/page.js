
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

const roleOptions = [
  { value: "DOCTOR", label: "Doctor" },
  { value: "NURSE", label: "Nurse" },
  { value: "EMERGENCY_STAFF", label: "Emergency staff" },
  { value: "LAB_STAFF", label: "Laboratory staff" },
  { value: "RECEPTION", label: "Receptionist" },
  { value: "TRANSFER_COORDINATOR", label: "Transfer coordinator" },
];

const shiftOptions = [
  { value: "NOT_ASSIGNED", label: "Not assigned" },
  { value: "DAY", label: "Day shift" },
  { value: "NIGHT", label: "Night shift" },
  { value: "ROTATIONAL", label: "Rotational" },
];

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "DOCTOR",
  department: "",
  phone: "",
  shift: "NOT_ASSIGNED",
  duty: "",
};

const labelForRole = (role) =>
  roleOptions.find((item) => item.value === role)?.label ||
  role?.replaceAll("_", " ") ||
  "Staff";

export default function StaffPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStaff = useCallback(async () => {
    const result = await apiRequest("/api/staff");

    setStaff(Array.isArray(result.staff) ? result.staff : []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const savedToken = getToken();

      if (!savedToken) {
        router.replace("/login");
        return;
      }

      setToken(savedToken);
      setUser(getStoredUser());

      try {
        const result = await apiRequest("/api/auth/me");
        const current = result?.user || result?.data?.user;

        if (!cancelled && current) {
          setUser(current);

          if (current.role !== "HOSPITAL_ADMIN") {
            router.replace("/");
          }
        }

        if (
          !cancelled &&
          current?.role === "HOSPITAL_ADMIN"
        ) {
          await loadStaff();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Unable to load staff directory."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [router, loadStaff]);

  const filteredStaff = useMemo(
    () =>
      staff.filter((person) => {
        const query = search.trim().toLowerCase();

        const matchesSearch =
          !query ||
          [
            person.name,
            person.email,
            person.department,
            person.duty,
            person.phone,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query)
          );

        const matchesRole =
          roleFilter === "ALL" ||
          person.role === roleFilter;

        return matchesSearch && matchesRole;
      }),
    [staff, search, roleFilter]
  );

  const counts = useMemo(
    () => ({
      total: staff.length,

      active: staff.filter(
        (person) => person.isActive
      ).length,

      doctors: staff.filter(
        (person) => person.role === "DOCTOR"
      ).length,

      nursing: staff.filter(
        (person) =>
          person.role === "NURSE" ||
          person.role === "EMERGENCY_STAFF"
      ).length,
    }),
    [staff]
  );

  function updateForm(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function openCreateModal() {
    setError("");
    setNotice("");
    setForm(emptyForm);
    setShowPassword(false);
    setModalOpen(true);
  }

  async function handleCreate(event) {
    event.preventDefault();

    setError("");
    setNotice("");

    if (form.password.length < 8) {
      setError(
        "Staff password must contain at least 8 characters."
      );
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest("/api/staff", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          department: form.department.trim(),
          phone: form.phone.trim(),
          duty: form.duty.trim(),
        }),
      });

      setNotice(
        `${result.user?.name || form.name} account created successfully.`
      );

      setModalOpen(false);
      setForm(emptyForm);

      await loadStaff();
    } catch (err) {
      setError(
        err.message || "Could not create staff account."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(person) {
    const action = person.isActive
      ? "deactivate"
      : "activate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${person.name}'s account?`
      )
    ) {
      return;
    }

    setError("");
    setNotice("");

    const id = person._id || person.id;

    setChangingId(String(id));

    try {
      const result = await apiRequest(
        `/api/staff/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            isActive: !person.isActive,
          }),
        }
      );

      setNotice(result.message || `Account ${action}d.`);

      await loadStaff();
    } catch (err) {
      setError(
        err.message || `Could not ${action} staff account.`
      );
    } finally {
      setChangingId("");
    }
  }

  if (loading || !token) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#77717d",
        }}
      >
        Loading staff directory…
      </main>
    );
  }

  if (user && user.role !== "HOSPITAL_ADMIN") {
    return null;
  }

  const hospital =
    user?.hospitalId?.name ||
    user?.hospital?.name ||
    user?.hospitalName ||
    "Hospital Workspace";

  return (
    <main className="mf-app">
      {mobileMenuOpen && (
        <button
          className="mf-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`mf-sidebar ${
          mobileMenuOpen ? "open" : ""
        }`}
      >
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
          <Link
            href="/"
            className="mf-nav-link"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mf-nav-icon">▦</span>
            Overview
          </Link>

          <Link
            href="/staff"
            className="mf-nav-link active"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mf-nav-icon">♙</span>
            Staff directory
          </Link>

          <div
            className="mf-nav-caption"
            style={{ marginTop: 19 }}
          >
            PLATFORM
          </div>

          <div className="mf-nav-link">
            <span className="mf-nav-icon">✚</span>
            Patient operations
          </div>

          <div className="mf-nav-link">
            <span className="mf-nav-icon">⚗</span>
            Diagnostics
          </div>

          <div className="mf-nav-link">
            <span className="mf-nav-icon">⇄</span>
            Network & transfers
          </div>
        </nav>

        <div className="mf-sidebar-bottom">
          <div className="mf-sidebar-user">
            <div className="mf-avatar">
              {(user?.name || "A")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <strong>
                {user?.name || "Administrator"}
              </strong>

              <span>Hospital administrator</span>
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
            <button
              className="mf-mobile-menu"
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              ☰
            </button>

            <div>
              <p className="mf-page-kicker">
                Workspace / Team management
              </p>

              <h1>Staff directory</h1>
            </div>
          </div>

          <div className="mf-topbar-right">
            <div className="mf-hospital-label">
              <span className="mf-status-dot" />
              <span>{hospital}</span>
            </div>

            <Link
              className="mf-secondary-btn"
              href="/"
            >
              ← Dashboard
            </Link>
          </div>
        </header>

        <div className="mf-page-content">
          <section className="mf-welcome-panel">
            <div>
              <span className="mf-welcome-tag">
                ✦ HOSPITAL ADMINISTRATION
              </span>

              <h2>Your team, organised.</h2>

              <p>
                Create individual staff accounts, assign
                departments and duties, set shifts, and
                activate or deactivate access when
                responsibilities change.
              </p>
            </div>

            <div
              className="mf-welcome-art"
              aria-hidden="true"
            >
              ♙
            </div>
          </section>

          {error && !modalOpen && (
            <div
              className="mf-form-error"
              role="alert"
              style={{ marginTop: 16 }}
            >
              {error}
            </div>
          )}

          {notice && !modalOpen && (
            <div
              className="mf-form-success"
              role="status"
              style={{ marginTop: 16 }}
            >
              {notice}
            </div>
          )}

          <div className="mf-section-heading">
            <div>
              <h2>Team overview</h2>
              <p>
                Staff accounts belonging to this hospital
                only.
              </p>
            </div>

            <button
              className="mf-primary-btn"
              style={{ width: "auto" }}
              onClick={openCreateModal}
            >
              ＋ Add staff member
            </button>
          </div>

          <section className="mf-staff-summary">
            <div className="mf-mini-stat">
              <span>Total staff</span>
              <strong>{counts.total}</strong>
            </div>

            <div className="mf-mini-stat">
              <span>Active accounts</span>
              <strong>{counts.active}</strong>
            </div>

            <div className="mf-mini-stat">
              <span>Doctors</span>
              <strong>{counts.doctors}</strong>
            </div>

            <div className="mf-mini-stat">
              <span>Nursing & emergency</span>
              <strong>{counts.nursing}</strong>
            </div>
          </section>

          <div className="mf-staff-toolbar">
            <input
              className="mf-search"
              type="search"
              placeholder="Search name, email, department or duty…"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              aria-label="Search staff"
            />

            <select
              className="mf-filter"
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value)
              }
              aria-label="Filter by role"
            >
              <option value="ALL">All roles</option>

              {roleOptions.map((option) => (
                <option
                  value={option.value}
                  key={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mf-staff-table-wrap">
            <table className="mf-staff-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role</th>
                  <th>Department & duty</th>
                  <th>Shift</th>
                  <th>Account</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredStaff.map((person) => {
                  const id = String(
                    person._id || person.id
                  );

                  return (
                    <tr key={id}>
                      <td>
                        <div className="mf-staff-name">
                          <div className="mf-staff-initial">
                            {(person.name || "S")
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>{person.name}</strong>
                            <span>{person.email}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="mf-role-badge">
                          {labelForRole(person.role)}
                        </span>
                      </td>

                      <td>
                        <strong
                          style={{ fontSize: 11 }}
                        >
                          {person.department || "Unassigned"}
                        </strong>

                        <div
                          style={{
                            marginTop: 4,
                            color: "var(--muted)",
                            fontSize: 10,
                          }}
                        >
                          {person.duty || "No duty note"}

                          {person.phone
                            ? ` · ${person.phone}`
                            : ""}
                        </div>
                      </td>

                      <td>
                        {shiftOptions.find(
                          (item) =>
                            item.value === person.shift
                        )?.label || "Not assigned"}
                      </td>

                      <td>
                        <span
                          className={`mf-status-badge ${
                            person.isActive ? "active" : ""
                          }`}
                        >
                          {person.isActive
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <button
                          className={
                            person.isActive
                              ? "mf-danger-btn"
                              : "mf-secondary-btn"
                          }
                          disabled={changingId === id}
                          onClick={() =>
                            toggleStatus(person)
                          }
                        >
                          {changingId === id
                            ? "Saving…"
                            : person.isActive
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredStaff.length === 0 && (
              <div className="mf-empty-state">
                <div className="mf-empty-icon">♙</div>

                <strong>No staff members found</strong>

                <div>
                  {staff.length
                    ? "Try changing your search or role filter."
                    : "Create the first staff account to get your team started."}
                </div>

                {!staff.length && (
                  <button
                    className="mf-primary-btn"
                    style={{
                      width: "auto",
                      marginTop: 13,
                    }}
                    onClick={openCreateModal}
                  >
                    ＋ Add first staff member
                  </button>
                )}
              </div>
            )}
          </div>

          <div
            className="mf-role-note"
            style={{ marginTop: 17 }}
          >
            Security note: passwords are hashed by the
            backend. Staff records and status changes are
            scoped to the signed-in administrator&apos;s
            hospital; staff management endpoints are not
            available to other roles.
          </div>

          <footer className="mf-footer">
            <span>
              MediFlow Hospital Operations Platform
            </span>

            <span>Staff management · Phase 1</span>
          </footer>
        </div>
      </section>

      {modalOpen && (
        <div
          className="mf-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              setModalOpen(false);
            }
          }}
        >
          <section
            className="mf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-staff-title"
          >
            <div className="mf-modal-head">
              <div>
                <div className="mf-kicker">
                  Team management
                </div>

                <h2 id="create-staff-title">
                  Add staff member
                </h2>

                <p>
                  Each team member receives their own
                  email and password login.
                </p>
              </div>

              <button
                className="mf-close-btn"
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            {error && (
              <div
                className="mf-form-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div className="mf-form-grid">
                <div className="mf-field">
                  <label htmlFor="staff-name">
                    Full name *
                  </label>

                  <input
                    id="staff-name"
                    name="name"
                    value={form.name}
                    onChange={updateForm}
                    placeholder="Staff member name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>

                <div className="mf-field">
                  <label htmlFor="staff-role">
                    Role *
                  </label>

                  <select
                    id="staff-role"
                    name="role"
                    value={form.role}
                    onChange={updateForm}
                    required
                  >
                    {roleOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mf-field full">
                  <label htmlFor="staff-email">
                    Work email / login ID *
                  </label>

                  <input
                    id="staff-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={updateForm}
                    placeholder="name@hospital.com"
                    required
                    maxLength={254}
                  />
                </div>

                <div className="mf-field">
                  <label htmlFor="staff-password">
                    Temporary password *
                  </label>

                  <div className="mf-input-wrap">
                    <input
                      id="staff-password"
                      name="password"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={form.password}
                      onChange={updateForm}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                    />

                    <button
                      className="mf-show-password"
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (value) => !value
                        )
                      }
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="mf-field">
                  <label htmlFor="staff-department">
                    Department
                  </label>

                  <input
                    id="staff-department"
                    name="department"
                    value={form.department}
                    onChange={updateForm}
                    placeholder="e.g. Emergency, ICU"
                    maxLength={100}
                  />
                </div>

                <div className="mf-field">
                  <label htmlFor="staff-shift">
                    Duty shift
                  </label>

                  <select
                    id="staff-shift"
                    name="shift"
                    value={form.shift}
                    onChange={updateForm}
                  >
                    {shiftOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mf-field">
                  <label htmlFor="staff-phone">
                    Contact number
                  </label>

                  <input
                    id="staff-phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={updateForm}
                    placeholder="Optional contact"
                    maxLength={30}
                  />
                </div>

                <div className="mf-field full">
                  <label htmlFor="staff-duty">
                    Duty / responsibility
                  </label>

                  <input
                    id="staff-duty"
                    name="duty"
                    value={form.duty}
                    onChange={updateForm}
                    placeholder="e.g. Emergency triage, morning OPD"
                    maxLength={160}
                  />
                </div>
              </div>

              <div className="mf-modal-actions">
                <button
                  className="mf-secondary-btn"
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  className="mf-primary-btn"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Creating account…"
                    : "Create staff account →"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
