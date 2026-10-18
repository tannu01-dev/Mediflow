"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getToken, getStoredUser, logout } from "@/lib/auth";

const dateTime = (value) => value ? new Date(value).toLocaleString() : "—";
const label = (value) => String(value || "—").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AuditPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ action: "", entityType: "", outcome: "", from: "", to: "" });
  const [applied, setApplied] = useState({ action: "", entityType: "", outcome: "", from: "", to: "" });
  const [selected, setSelected] = useState(null);

  const loadLogs = useCallback(async (targetPage = 1, currentFilters = applied) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(targetPage), limit: "20" });
    Object.entries(currentFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const result = await apiRequest(`/api/audit-logs?${params.toString()}`);
      setLogs(Array.isArray(result.auditLogs) ? result.auditLogs : []);
      setPage(result.page || targetPage); setPages(Math.max(1, result.pages || 1)); setTotal(result.total || 0);
    } catch (err) { setError(err.message || "Audit logs could not be loaded."); setLogs([]); }
    finally { setLoading(false); }
  }, [applied]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    const currentUser = getStoredUser();
    // Hydrate the authenticated browser session after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(currentUser); setReady(true);
    if (currentUser?.role !== "HOSPITAL_ADMIN") router.replace("/");
  }, [router]);
  useEffect(() => { if (ready && user?.role === "HOSPITAL_ADMIN") loadLogs(1, applied); }, [ready, user, applied, loadLogs]);

  const applyFilters = (event) => { event.preventDefault(); setApplied({ ...filters }); };
  const resetFilters = () => { const empty = { action: "", entityType: "", outcome: "", from: "", to: "" }; setFilters(empty); setApplied(empty); };

  if (!ready || user?.role !== "HOSPITAL_ADMIN") return <main className="mf8-loading">Opening secure audit log…</main>;
  return <main className="mf-app mf8-app"><aside className="mf-sidebar"><Link href="/" className="mf-brand"><span className="mf-brand-mark">M+</span><span><span className="mf-brand-name">MediFlow</span><span className="mf-brand-sub">Hospital operations</span></span></Link><div className="mf-nav-caption">ADMINISTRATION</div><nav className="mf-nav-list"><Link href="/" className="mf-nav-link"><span className="mf-nav-icon">▦</span>Overview</Link><Link href="/staff" className="mf-nav-link"><span className="mf-nav-icon">♙</span>Staff directory</Link><Link href="/analytics" className="mf-nav-link"><span className="mf-nav-icon">▥</span>Analytics</Link><Link href="/activity" className="mf-nav-link"><span className="mf-nav-icon">◷</span>Activity centre</Link><Link href="/audit" className="mf-nav-link active"><span className="mf-nav-icon">⌕</span>Audit logs</Link></nav><div className="mf-sidebar-bottom"><div className="mf-sidebar-user"><div className="mf-avatar">{(user?.name || "A").charAt(0).toUpperCase()}</div><div><strong>{user?.name || "Administrator"}</strong><span>Hospital admin</span></div></div><button className="mf-sidebar-logout" onClick={logout}>↗ &nbsp; Sign out of MediFlow</button></div></aside>
    <section className="mf-main"><header className="mf-topbar"><div><p className="mf-page-kicker">Security / Audit trail</p><h1>Audit log explorer</h1></div><div className="mf-topbar-right"><span className="mf8-private-note">Admin-only · hospital scoped</span><button className="mf-secondary-btn" onClick={() => loadLogs(page, applied)} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button></div></header>
      <div className="mf-page-content mf8-content"><section className="mf8-hero mf8-audit-hero"><div><span className="mf-welcome-tag">✦ ACCOUNTABILITY & SECURITY</span><h2>A clear trail of important actions.</h2><p>Review recorded API activity, actor role, entity, outcome and timestamp. Sensitive clinical and authentication values are intentionally excluded from audit metadata.</p></div><div className="mf8-hero-mark">⌕</div></section>{error && <div className="mf-form-error" role="alert">{error}</div>}
        <section className="mf8-audit-summary"><div><span>Matching audit entries</span><strong>{total.toLocaleString()}</strong><small>Filtered for your hospital</small></div><div><span>Entries on this page</span><strong>{logs.length}</strong><small>Up to 20 records per page</small></div><div><span>Current page</span><strong>{page} / {pages}</strong><small>Newest activity first</small></div></section>
        <section className="mf-panel mf8-panel mf8-filter-panel"><div className="mf-panel-head"><div><h3>Filter audit trail</h3><p>Narrow the records by action, entity, outcome or date range.</p></div></div><form className="mf8-filter-form" onSubmit={applyFilters}><label>Action exact match<input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="e.g. PATIENT_CREATED" maxLength={100}/></label><label>Entity type<select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}><option value="">All entities</option>{["USER","PATIENT","ENCOUNTER","CLINICAL_RECORD","LAB_REQUEST","ADMISSION","BED","TRANSFER","NOTIFICATION","HOSPITAL","OTHER"].map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label><label>Outcome<select value={filters.outcome} onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select></label><label>From date<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}/></label><label>To date<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}/></label><div className="mf8-filter-actions"><button className="mf-primary-btn" type="submit">Apply filters</button><button className="mf-secondary-btn" type="button" onClick={resetFilters}>Reset</button></div></form></section>
        <section className="mf-panel mf8-panel mf8-audit-table-panel"><div className="mf-panel-head"><div><h3>Recorded events</h3><p>Click a row to inspect the sanitized event metadata.</p></div><span className="mf-pill">{total.toLocaleString()} records</span></div>{loading ? <div className="mf8-empty-state">Loading audit records…</div> : logs.length ? <div className="mf8-table-wrap"><table className="mf8-table mf8-audit-table"><thead><tr><th>Event</th><th>Actor</th><th>Entity</th><th>Outcome</th><th>Timestamp</th><th></th></tr></thead><tbody>{logs.map((log) => <tr key={log._id} onClick={() => setSelected(log)} className="mf8-click-row" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelected(log); }}><td><strong>{label(log.action)}</strong><small>{log.description || "No description provided"}</small></td><td><strong>{log.actorUserId?.name || "System / unknown"}</strong><small>{label(log.actorRole)}</small></td><td><strong>{label(log.entityType)}</strong><small>{log.entityId ? String(log.entityId).slice(-8) : "No entity ID"}</small></td><td><span className={`mf8-outcome ${String(log.outcome).toLowerCase()}`}>{label(log.outcome)}</span></td><td>{dateTime(log.createdAt)}</td><td>→</td></tr>)}</tbody></table></div> : <div className="mf8-empty-state"><strong>No matching audit events</strong><p>Change your filters or check again after more activity is recorded.</p></div>}
          <div className="mf8-pagination"><span>Page {page} of {pages}</span><div><button className="mf-secondary-btn" disabled={page <= 1 || loading} onClick={() => loadLogs(page - 1)}>← Previous</button><button className="mf-secondary-btn" disabled={page >= pages || loading} onClick={() => loadLogs(page + 1)}>Next →</button></div></div>
        </section><footer className="mf-footer"><span>MediFlow · Audit and accountability</span><span>Access restricted to hospital administrators</span></footer></div>
    </section>
    {selected && <div className="mf8-modal-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="mf8-audit-modal" role="dialog" aria-modal="true" aria-labelledby="mf8-audit-modal-title" onClick={(event) => event.stopPropagation()}><div className="mf-panel-head"><div><h3 id="mf8-audit-modal-title">Audit event details</h3><p>{dateTime(selected.createdAt)}</p></div><button className="mf-secondary-btn" onClick={() => setSelected(null)}>Close ×</button></div><dl className="mf8-detail-list"><div><dt>Action</dt><dd>{label(selected.action)}</dd></div><div><dt>Description</dt><dd>{selected.description || "—"}</dd></div><div><dt>Actor</dt><dd>{selected.actorUserId?.name || "System / unknown"} · {label(selected.actorRole)}</dd></div><div><dt>Entity</dt><dd>{label(selected.entityType)} · {selected.entityId || "—"}</dd></div><div><dt>Outcome</dt><dd><span className={`mf8-outcome ${String(selected.outcome).toLowerCase()}`}>{label(selected.outcome)}</span></dd></div><div><dt>Request ID</dt><dd>{selected.requestId || "—"}</dd></div><div><dt>IP address</dt><dd>{selected.ipAddress || "—"}</dd></div><div><dt>User agent</dt><dd>{selected.userAgent || "—"}</dd></div></dl><h4>Sanitized metadata</h4><pre className="mf8-json">{JSON.stringify(selected.metadata || {}, null, 2)}</pre></section></div>}
  </main>;
}
