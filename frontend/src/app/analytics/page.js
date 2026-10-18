"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getToken, getStoredUser, logout } from "@/lib/auth";

const number = (value) => Number(value || 0).toLocaleString();
const pct = (part, total) => total ? Math.round((part / total) * 100) : 0;
const statusLabel = (value) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

function Metric({ label, value, note, tone = "" }) {
  return <article className={`mf8-metric ${tone}`}><span>{label}</span><strong>{number(value)}</strong><small>{note}</small></article>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [roleReady, setRoleReady] = useState(false);
  const [hospitalData, setHospitalData] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const role = user?.role || "";
  const isAdmin = role === "HOSPITAL_ADMIN";
  const canSeeNetwork = ["HOSPITAL_ADMIN", "TRANSFER_COORDINATOR"].includes(role);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const tasks = [];
    if (isAdmin) tasks.push(apiRequest("/api/analytics/hospital").then(setHospitalData));
    if (canSeeNetwork) tasks.push(apiRequest("/api/analytics/network").then(setNetworkData));
    const results = await Promise.allSettled(tasks);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) setError(failed.reason?.message || "Some analytics could not be loaded.");
    setUpdatedAt(new Date().toISOString());
    setLoading(false);
  }, [isAdmin, canSeeNetwork]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    const currentUser = getStoredUser();
    // Hydrate the authenticated browser session after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(currentUser);
    setRoleReady(true);
  }, [router]);

  useEffect(() => {
    if (!roleReady) return;
    if (!isAdmin && !canSeeNetwork) { router.replace("/"); return; }
    refresh();
  }, [roleReady, isAdmin, canSeeNetwork, refresh, router]);

  const metrics = hospitalData?.metrics;
  const daily = hospitalData?.dailyEncounters || [];
  const maxDaily = Math.max(1, ...daily.map((item) => item.count));
  const bedUtilization = metrics ? pct(metrics.beds.occupied, metrics.beds.total) : 0;

  if (!roleReady) return <main className="mf8-loading">Preparing analytics workspace…</main>;

  return <main className="mf-app mf8-app">
    <aside className="mf-sidebar"><Link href="/" className="mf-brand">
    <span className="mf-brand-mark">M+</span>
    <span><span className="mf-brand-name">MediFlow</span>
    <span className="mf-brand-sub">Hospital operations</span></span>
    </Link><div className="mf-nav-caption">OPERATIONS</div><nav className="mf-nav-list"><Link href="/" className="mf-nav-link"><span className="mf-nav-icon">▦</span>Overview</Link><Link href="/patients" className="mf-nav-link"><span className="mf-nav-icon">♧</span>Patient records</Link><Link href="/beds" className="mf-nav-link"><span className="mf-nav-icon">▤</span>Beds & wards</Link><Link href="/activity" className="mf-nav-link"><span className="mf-nav-icon">◷</span>Activity centre</Link><Link href="/analytics" className="mf-nav-link active"><span className="mf-nav-icon">▥</span>Analytics</Link>{isAdmin && <Link href="/audit" className="mf-nav-link"><span className="mf-nav-icon">⌕</span>Audit logs</Link>}</nav><div className="mf-sidebar-bottom"><div className="mf-sidebar-user"><div className="mf-avatar">{(user?.name || "U").charAt(0).toUpperCase()}</div><div><strong>{user?.name || "Hospital User"}</strong><span>{statusLabel(role)}</span></div></div><button className="mf-sidebar-logout" onClick={logout}>↗ &nbsp; Sign out of MediFlow</button></div></aside>
    <section className="mf-main"><header className="mf-topbar"><div><p className="mf-page-kicker">Insights / Analytics</p><h1>Performance & capacity</h1></div><div className="mf-topbar-right"><span className="mf8-private-note">Hospital-scoped reporting</span><button className="mf-secondary-btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button></div></header>
      <div className="mf-page-content mf8-content"><section className="mf8-hero"><div><span className="mf-welcome-tag">✦ OPERATIONAL INTELLIGENCE</span><h2>Clear signals for better operations.</h2><p>Live roll-ups from patient flow, bed capacity, laboratory work and hospital network coordination. Metrics are operational summaries, not clinical recommendations.</p></div><div className="mf8-hero-mark">▥</div></section>
        {error && <div className="mf-form-error" role="alert">{error}</div>}
        {isAdmin && metrics && <><div className="mf8-section-head"><div><h2>Hospital snapshot</h2><p>Your hospital only · all-time totals unless noted</p></div><span className="mf-pill">{loading ? "Updating" : "Latest data"}</span></div><section className="mf8-metric-grid"><Metric label="Registered patients" value={metrics.patients.total} note={`${number(metrics.patients.active)} active records`} /><Metric label="Active encounters" value={metrics.encounters.active} note={`${number(metrics.encounters.today)} opened today`} tone="coral"/><Metric label="Occupied beds" value={metrics.beds.occupied} note={`${bedUtilization}% of ${number(metrics.beds.total)} total beds`} tone="amber"/><Metric label="Active admissions" value={metrics.admissions.active} note="Currently admitted"/><Metric label="Open lab requests" value={metrics.laboratory.open} note={`${number(metrics.laboratory.completed)} completed`} tone="coral"/><Metric label="Active staff" value={metrics.staff.active} note={`${number(metrics.staff.total)} accounts total`}/></section>
          <section className="mf8-grid-two"><article className="mf-panel mf8-panel"><div className="mf-panel-head"><div><h3>Encounter activity</h3><p>New encounters per day · last 7 days</p></div><span className="mf-stat-icon">◷</span></div><div className="mf8-chart" role="img" aria-label="Bar chart of encounters created per day">{daily.map((day) => <div className="mf8-bar-column" key={day.date}><strong>{day.count}</strong><div className="mf8-bar-track"><span style={{ height: `${Math.max(day.count ? 8 : 2, (day.count / maxDaily) * 100)}%` }} /></div><small>{day.label}</small></div>)}</div></article>
            <article className="mf-panel mf8-panel"><div className="mf-panel-head"><div><h3>Bed capacity</h3><p>Current status breakdown</p></div><span className="mf-stat-icon amber">▤</span></div><div className="mf8-capacity"><div className="mf8-capacity-ring" style={{ "--mf8-pct": `${bedUtilization}%` }}><div><strong>{bedUtilization}%</strong><span>occupied</span></div></div><div className="mf8-legend"><div><i className="plum"/><span>Occupied</span><strong>{number(metrics.beds.occupied)}</strong></div><div><i className="coral"/><span>Available</span><strong>{number(metrics.beds.available)}</strong></div><div><i className="amber"/><span>Cleaning</span><strong>{number(metrics.beds.cleaning)}</strong></div><div><i className="muted"/><span>Maintenance</span><strong>{number(metrics.beds.maintenance)}</strong></div></div></div></article>
          </section>
          <section className="mf8-grid-two"><article className="mf-panel mf8-panel"><div className="mf-panel-head"><div><h3>Encounter status</h3><p>Current distribution across visits</p></div></div><div className="mf8-status-list">{Object.entries(metrics.encounters.byStatus || {}).length ? Object.entries(metrics.encounters.byStatus).sort((a,b) => b[1]-a[1]).map(([label, value]) => <div className="mf8-status-row" key={label}><span>{statusLabel(label)}</span><div className="mf8-status-track"><i style={{ width: `${pct(value, metrics.encounters.total)}%` }}/></div><strong>{number(value)}</strong></div>) : <p className="mf8-empty">No encounters recorded yet.</p>}</div></article>
            <article className="mf-panel mf8-panel"><div className="mf-panel-head"><div><h3>Work queue pulse</h3><p>Outstanding coordination items</p></div></div><div className="mf8-queue-list"><div><span className="mf8-queue-icon coral">⚗</span><span><strong>Laboratory</strong><small>Requests awaiting completion</small></span><b>{number(metrics.laboratory.open)}</b></div><div><span className="mf8-queue-icon amber">⇄</span><span><strong>Referrals</strong><small>Pending decisions</small></span><b>{number(metrics.referrals.pending)}</b></div><div><span className="mf8-queue-icon plum">↗</span><span><strong>Transfers</strong><small>Pending / processing</small></span><b>{number(metrics.transfers.pending)}</b></div><div><span className="mf8-queue-icon">⌕</span><span><strong>Audit activity</strong><small>Entries logged today</small></span><b>{number(metrics.audit.today)}</b></div></div></article></section>
        </>}
        {canSeeNetwork && networkData && <><div className="mf8-section-head mf8-network-head"><div><h2>Connected hospital network</h2><p>Aggregate operational counts for connected partners only; no patient-identifying records are exposed here.</p></div><span className="mf-pill">{number(networkData.connectedHospitals)} partners</span></div><section className="mf8-metric-grid mf8-network-metrics"><Metric label="Connected hospitals" value={networkData.summary.hospitals} note="Including your hospital"/><Metric label="Total beds" value={networkData.summary.beds} note={`${number(networkData.summary.availableBeds)} available`} tone="coral"/><Metric label="Active encounters" value={networkData.summary.activeEncounters} note="Across connected hospitals" tone="amber"/><Metric label="Open lab requests" value={networkData.summary.openLabRequests} note="Across connected hospitals"/><Metric label="Pending referrals" value={networkData.summary.pendingReferrals} note="Network-wide queue" tone="coral"/><Metric label="Pending transfers" value={networkData.summary.pendingTransfers} note="Network-wide queue"/></section><section className="mf-panel mf8-panel mf8-network-table"><div className="mf-panel-head"><div><h3>Hospital comparison</h3><p>Capacity and workload at a glance</p></div><Link href="/network" className="mf8-inline-link">Manage connections →</Link></div><div className="mf8-table-wrap"><table className="mf8-table"><thead><tr><th>Hospital</th><th>Bed capacity</th><th>Active encounters</th><th>Admissions</th><th>Open labs</th></tr></thead><tbody>{networkData.hospitals.map((hospital) => <tr key={hospital.id}><td><strong>{hospital.name}</strong><small>{hospital.code || "Hospital"}{hospital.isCurrent ? " · Your hospital" : ""}</small></td><td><strong>{number(hospital.availableBeds)}</strong><small>available of {number(hospital.totalBeds)}</small></td><td>{number(hospital.activeEncounters)}</td><td>{number(hospital.activeAdmissions)}</td><td>{number(hospital.openLabRequests)}</td></tr>)}</tbody></table></div></section></>}
        {!loading && !metrics && !networkData && !error && <div className="mf-liveops-empty">No analytics are available for this account.</div>}
        <footer className="mf-footer"><span>MediFlow · Analytics & reporting</span><span>Updated {updatedAt ? new Date(updatedAt).toLocaleString() : "—"}</span></footer>
      </div>
    </section>
  </main>;
}
