"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RealtimeNotifications from "@/components/RealtimeNotifications";
import RealtimeOperations from "@/components/RealtimeOperations";
import { apiRequest, getToken, getStoredUser, logout } from "@/lib/auth";

const roleCopy = {
  HOSPITAL_ADMIN: { title: "Hospital command centre", label: "ADMINISTRATOR WORKSPACE", text: "Oversee your hospital workspace, manage team access and prepare your teams for coordinated operations." },
  DOCTOR: { title: "Doctor workspace", label: "CLINICAL TEAM WORKSPACE", text: "Review your assigned encounters, record clinical notes and diagnoses, and send investigation requests to the lab team." },
  NURSE: { title: "Nursing workspace", label: "NURSING TEAM WORKSPACE", text: "Review active patient encounters, record observed vital signs and nursing notes, and preserve the observation history for each visit." },
  EMERGENCY_STAFF: { title: "Emergency workspace", label: "EMERGENCY OPERATIONS", text: "Coordinate emergency intake, record triage observations and manage the priority queue for your hospital." },
  LAB_STAFF: { title: "Laboratory workspace", label: "DIAGNOSTICS TEAM WORKSPACE", text: "Process investigation requests, record verified results and keep the clinical team informed." },
  RECEPTION: { title: "Reception workspace", label: "FRONT DESK WORKSPACE", text: "Register patients, find existing records and open a new encounter for each visit." },
  TRANSFER_COORDINATOR: { title: "Transfer coordination", label: "NETWORK OPERATIONS", text: "Coordinate authorized referrals and inter-hospital patient transfers." },
};

const roleTasks = {
  HOSPITAL_ADMIN: [
    { icon: "♙", title: "Manage your team", detail: "Create staff accounts, set departments and assign shifts.", href: "/staff", action: "Open staff directory" },
    { icon: "⌘", title: "Access control", detail: "Each account is restricted to its assigned role and hospital.", href: "/staff", action: "Review team access" },
    { icon: "✚", title: "Patient operations", detail: "Register patients, open visits, record triage and assign doctors.", href: "/patients", action: "Open patient operations" },
    { icon: "▤", title: "Documents & discharge", detail: "Generate clinical documents and complete authorized discharge workflows.", href: "/documents", action: "Open document studio" },
    { icon: "▥", title: "Analytics & reporting", detail: "Review patient flow, bed capacity, lab queues and hospital network indicators.", href: "/analytics", action: "Open analytics" },
    { icon: "⌕", title: "Audit log explorer", detail: "Inspect sanitized action history and security-relevant outcomes.", href: "/audit", action: "Review audit logs" },
  ],
  DOCTOR: [{ icon: "✚", title: "My assigned patients", detail: "Review only active encounters assigned to your account.", href: "/doctor", action: "Open doctor workspace" }, { icon: "⚗", title: "Clinical records & investigations", detail: "Record notes, diagnosis entries and requests to the lab team.", href: "/doctor", action: "Open clinical workspace" }, { icon: "▤", title: "Documents & discharge", detail: "Generate prescriptions, lab reports and discharge summaries.", href: "/documents", action: "Open document studio" }],
  NURSE: [{ icon: "♡", title: "Nursing observations", detail: "Record observed vital signs and nursing notes with a history per encounter.", href: "/nurse", action: "Open nurse workspace" }, { icon: "▤", title: "Active patient list", detail: "Search active encounters and review latest vitals and care-team assignment.", href: "/nurse", action: "Open patient list" }],
  EMERGENCY_STAFF: [{ icon: "✚", title: "Emergency intake", detail: "Register encounters, record triage and manage the priority queue.", href: "/emergency", action: "Open emergency queue" }, { icon: "♧", title: "Patient registry", detail: "Register new patients and search existing hospital records.", href: "/patients", action: "Open patient records" }],
  LAB_STAFF: [{ icon: "⚗", title: "Laboratory queue", detail: "Process samples, enter results and update test status.", href: "/lab", action: "Open lab queue" }, { icon: "▤", title: "Bed & ward overview", detail: "Review hospital bed availability and cleaning status.", href: "/beds", action: "Open bed overview" }, { icon: "▤", title: "Clinical documents", detail: "Review and print authorized laboratory reports and documents.", href: "/documents", action: "Open document archive" }],
  RECEPTION: [{ icon: "♙", title: "Patient registration", detail: "Register new patients and find existing records by name, ID or phone.", href: "/patients", action: "Open patient records" }, { icon: "▣", title: "Encounter desk", detail: "Create patient visits and review the active emergency queue.", href: "/emergency", action: "Open encounter desk" }],
  TRANSFER_COORDINATOR: [{ icon: "⇄", title: "Transfer coordination", detail: "Coordinate referrals and patient transfers across hospitals.", href: "/network", action: "Open network coordination" }, { icon: "▥", title: "Network analytics", detail: "Compare aggregate bed capacity and workload across connected hospitals.", href: "/analytics", action: "Open network analytics" }],
};

function roleLabel(role = "STAFF") { return role.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" "); }

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [staffCount, setStaffCount] = useState(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const savedToken = getToken();
      if (!savedToken) { router.replace("/register"); return; }
      setToken(savedToken);
      setUser(getStoredUser());
      try {
        const response = await apiRequest("/api/auth/me");
        const current = response?.user || response?.data?.user;
        if (!cancelled && current) setUser(current);
      } catch (error) {
        if (!cancelled) setPageError(error.message || "Could not load your account.");
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!token || user?.role !== "HOSPITAL_ADMIN") return;
    apiRequest("/api/staff").then((result) => setStaffCount(result.count ?? result.staff?.length ?? 0)).catch(() => setStaffCount(null));
  }, [token, user?.role]);

  const role = user?.role || "HOSPITAL_ADMIN";
  const copy = roleCopy[role] || roleCopy.HOSPITAL_ADMIN;
  const tasks = roleTasks[role] || roleTasks.HOSPITAL_ADMIN;
  const displayName = user?.name || user?.fullName || "Hospital User";
  const hospital = user?.hospitalId?.name || user?.hospital?.name || user?.hospitalName || "Hospital Workspace";
  const stats = useMemo(() => role === "HOSPITAL_ADMIN" ? [
    { label: "Staff accounts", value: staffCount === null ? "—" : staffCount, note: "Across your hospital", icon: "♙", tone: "" },
    { label: "Access control", value: "Active", note: "Role-based permissions", icon: "⌘", tone: "coral" },
    { label: "Hospital workspace", value: "Ready", note: "Registration complete", icon: "▣", tone: "amber" },
    { label: "Live notifications", value: "On", note: "Session notifications", icon: "◌", tone: "" },
  ] : [
    { label: "Account status", value: user?.isActive === false ? "Inactive" : "Active", note: "Verified at sign-in", icon: "✓", tone: "" },
    { label: "Assigned role", value: roleLabel(role), note: "Permissions are role-based", icon: "⌘", tone: "coral" },
    { label: "Department", value: user?.department || "Unassigned", note: "Ask your admin to update", icon: "▤", tone: "amber" },
    { label: "Duty shift", value: user?.shift && user.shift !== "NOT_ASSIGNED" ? user.shift : "Unassigned", note: user?.duty || "No duty note added", icon: "◷", tone: "" },
  ], [role, staffCount, user]);

  if (loading || !token) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#77717d" }}><div><div className="mf-brand-mark" style={{ margin: "0 auto 14px" }}>M+</div><p>Opening your MediFlow workspace…</p></div></main>;

  return (
    <main className="mf-app">
      {mobileMenuOpen && <button className="mf-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`mf-sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <Link href="/" className="mf-brand"><span className="mf-brand-mark">M+</span><span><span className="mf-brand-name">MediFlow</span><span className="mf-brand-sub">Hospital operations</span></span></Link>
        <div className="mf-nav-caption">YOUR WORKSPACE</div>
        <nav className="mf-nav-list">
          <Link href="/" className="mf-nav-link active" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">▦</span>Overview</Link>
          {role === "HOSPITAL_ADMIN" && <Link href="/staff" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">♙</span>Staff directory</Link>}
          {role === "DOCTOR" && <Link href="/doctor" className="mf-nav-link"><span className="mf-nav-icon">✚</span>Doctor workspace</Link>}
          {role === "NURSE" && <Link href="/nurse" className="mf-nav-link"><span className="mf-nav-icon">♡</span>Nurse workspace</Link>}
          {role !== "HOSPITAL_ADMIN" && role !== "DOCTOR" && role !== "NURSE" && <div className="mf-nav-link" aria-label="Role workspace"><span className="mf-nav-icon">✦</span>{roleLabel(role)}</div>}
          <div className="mf-nav-caption" style={{ marginTop: 19 }}>PLATFORM</div>
          {role !== "TRANSFER_COORDINATOR" && <Link href="/patients" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">♧</span>Patient records</Link>}
          {role !== "LAB_STAFF" && role !== "TRANSFER_COORDINATOR" && <Link href="/emergency" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">✚</span>Emergency queue</Link>}
          {!["TRANSFER_COORDINATOR", "RECEPTION"].includes(role) && <Link href="/lab" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">⚗</span>Laboratory</Link>}
          {!["TRANSFER_COORDINATOR", "LAB_STAFF"].includes(role) && <Link href="/beds" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">▤</span>Beds & wards</Link>}
          <Link href="/activity" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">◷</span>Activity centre</Link>{["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"].includes(role) && <Link href="/analytics" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">▥</span>Analytics</Link>}{role === "HOSPITAL_ADMIN" && <Link href="/audit" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">⌕</span>Audit logs</Link>}{["HOSPITAL_ADMIN", "DOCTOR", "EMERGENCY_STAFF", "TRANSFER_COORDINATOR"].includes(role) && <Link href="/network" className="mf-nav-link" onClick={() => setMobileMenuOpen(false)}><span className="mf-nav-icon">⇄</span>Network & transfers</Link>}
        </nav>
        <div className="mf-sidebar-bottom"><div className="mf-sidebar-user"><div className="mf-avatar">{displayName.charAt(0).toUpperCase()}</div><div><strong>{displayName}</strong><span>{roleLabel(role)}</span></div></div><button className="mf-sidebar-logout" onClick={logout}>↗ &nbsp; Sign out of MediFlow</button></div>
      </aside>

      <section className="mf-main">
        <header className="mf-topbar">
          <div className="mf-topbar-left" style={{ display: "flex", alignItems: "center", gap: 11 }}><button className="mf-mobile-menu" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation">☰</button><div><p className="mf-page-kicker">Workspace / Overview</p><h1>{copy.title}</h1></div></div>
          <div className="mf-topbar-right"><div className="mf-hospital-label"><span className="mf-status-dot" /> <span>{hospital}</span></div><button className="mf-secondary-btn" onClick={logout}>Sign out</button></div>
        </header>
        <div className="mf-page-content">
          <section className="mf-welcome-panel"><div><span className="mf-welcome-tag"><span>✦</span>{copy.label}</span><h2>Good to see you, {displayName.split(" ")[0]}.</h2><p>{copy.text}</p></div><div className="mf-welcome-art" aria-hidden="true">✚</div></section>
          {pageError && <div className="mf-form-error" role="alert" style={{ marginTop: 16 }}>{pageError}</div>}
          <div className="mf-section-heading"><div><h2>Workspace snapshot</h2><p>Your current account and operational setup.</p></div><span className="mf-pill">● Secure session</span></div>
          <section className="mf-stat-grid">{stats.map((item) => <article className="mf-stat-card" key={item.label}><div className="mf-stat-top"><span>{item.label}</span><span className={`mf-stat-icon ${item.tone}`}>{item.icon}</span></div><strong>{item.value}</strong><small>{item.note}</small></article>)}</section>
          <section className="mf-content-grid">
            <div className="mf-panel"><div className="mf-panel-head"><div><div><h3>{role === "HOSPITAL_ADMIN" ? "Admin quick actions" : "Your workspace"}</h3><p>Shortcuts and next steps for your role.</p></div></div><span className="mf-pill">Phase 2</span></div><div className="mf-task-list">{tasks.map((task) => <div className="mf-task-row" key={task.title}><div className="mf-task-symbol">{task.icon}</div><div style={{ minWidth: 0, flex: 1 }}><strong>{task.title}</strong><span>{task.detail}</span></div>{task.href ? <Link className="mf-task-arrow" href={task.href} aria-label={task.action || task.title}>→</Link> : <span className="mf-task-arrow" title="Planned for a later phase">·</span>}</div>)}</div></div>
            <div className="mf-panel"><div className="mf-panel-head"><div><div><h3>Account & access</h3><p>Details from your signed-in account.</p></div></div><span className="mf-stat-icon">⌘</span></div><div className="mf-task-list"><div className="mf-task-row"><div className="mf-task-symbol">♙</div><div><strong>{displayName}</strong><span>{user?.email || "Email unavailable"}</span></div></div><div className="mf-task-row"><div className="mf-task-symbol">▤</div><div><strong>{roleLabel(role)}</strong><span>{user?.department || "No department assigned"}</span></div></div><div className="mf-task-row"><div className="mf-task-symbol">◷</div><div><strong>{user?.shift && user.shift !== "NOT_ASSIGNED" ? `${user.shift} shift` : "Shift not assigned"}</strong><span>{user?.duty || "No duty description"}</span></div></div></div><div className="mf-role-note" style={{ marginTop: 15 }}>Access is enforced by the backend. Staff accounts can only be managed by an administrator from the same hospital.</div></div>
          </section>
          <section style={{ marginTop: 18 }}><RealtimeOperations token={token} /></section>
          <section style={{ marginTop: 18 }}><RealtimeNotifications token={token} /></section>
          <footer className="mf-footer"><span>MediFlow Hospital Operations Platform</span><span>Secure workspace · Role-based access</span></footer>
        </div>
      </section>
    </main>
  );
}
