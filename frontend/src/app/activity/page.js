"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { API_URL, apiRequest, getToken, getStoredUser, logout } from "@/lib/auth";

const severityLabel = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const timeLabel = (value) => value ? new Date(value).toLocaleString() : "Just now";

export default function ActivityPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState(null);

  useEffect(() => {
    const saved = getToken();
    if (!saved) { router.replace("/login"); return; }
    // Read the browser session once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(saved);
    setUser(getStoredUser());
  }, [router]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [alertResult, timelineResult] = await Promise.all([
        apiRequest("/api/alerts"),
        apiRequest("/api/timeline?limit=60"),
      ]);
      setAlerts(Array.isArray(alertResult.alerts) ? alertResult.alerts : []);
      setEvents(Array.isArray(timelineResult.events) ? timelineResult.events : []);
      setGeneratedAt(alertResult.generatedAt || new Date().toISOString());
      setError("");
    } catch (err) {
      setError(err.message || "Activity data could not be loaded.");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    // Initial API synchronization for this authenticated page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const socket = io(API_URL, { auth: { token }, transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: 5 });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("socket:ready", () => setConnected(true));
    socket.on("dashboard:refresh", refresh);
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [token, refresh]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    const categoryMatches = filter === "ALL" || String(event.eventType || "").includes(filter);
    const haystack = `${event.title || ""} ${event.description || ""} ${event.eventType || ""}`.toLowerCase();
    return categoryMatches && haystack.includes(query.toLowerCase());
  }), [events, filter, query]);

  const displayName = user?.name || "Hospital User";

  if (!token) return <main className="mf-activity-loading">Opening activity centre…</main>;

  return (
    <main className="mf-app mf-activity-app">
      <aside className="mf-sidebar">
        <Link href="/" className="mf-brand">
        <span className="mf-brand-mark">M+</span>
        <span>
          <span className="mf-brand-name">MediFlow</span>
          <span className="mf-brand-sub">Hospital operations</span>
        </span></Link>
        <div className="mf-nav-caption">OPERATIONS</div>
        <nav className="mf-nav-list">
          <Link href="/" className="mf-nav-link">
          <span className="mf-nav-icon">▦</span>Overview</Link>
          <Link href="/patients" className="mf-nav-link"><span className="mf-nav-icon">♧</span>Patient records</Link><Link href="/emergency" className="mf-nav-link"><span className="mf-nav-icon">✚</span>Emergency queue</Link><Link href="/lab" className="mf-nav-link"><span className="mf-nav-icon">⚗</span>Laboratory</Link><Link href="/beds" className="mf-nav-link"><span className="mf-nav-icon">▤</span>Beds & wards</Link><Link href="/activity" className="mf-nav-link active"><span className="mf-nav-icon">◷</span>Activity centre</Link></nav>
        <div className="mf-sidebar-bottom"><div className="mf-sidebar-user"><div className="mf-avatar">{displayName.charAt(0).toUpperCase()}</div><div><strong>{displayName}</strong><span>{user?.role || "STAFF"}</span></div></div><button className="mf-sidebar-logout" onClick={logout}>↗ &nbsp; Sign out of MediFlow</button></div>
      </aside>
      <section className="mf-main">
        <header className="mf-topbar"><div><p className="mf-page-kicker">Operations / Activity centre</p><h1>Live activity & alerts</h1></div><div className="mf-topbar-right"><span className={`mf-liveops-status ${connected ? "is-live" : ""}`}><i />{connected ? "Live connection" : "Connecting"}</span><button className="mf-secondary-btn" onClick={refresh}>Refresh</button></div></header>
        <div className="mf-page-content mf-activity-content">
          <section className="mf-activity-hero"><div><span className="mf-welcome-tag">✦ HOSPITAL OPERATIONS</span><h2>Everything important, in one place.</h2><p>Live alerts and a chronological audit-friendly activity timeline for your hospital.</p></div><div className="mf-activity-orb">◷</div></section>
          {error && <div className="mf-form-error" role="alert">{error}</div>}
          <section className="mf-activity-summary"><article><span>Active alerts</span><strong>{alerts.length}</strong><small>Current operational signals</small></article><article><span>Critical alerts</span><strong>{alerts.filter((a) => a.severity === "CRITICAL").length}</strong><small>Require immediate review</small></article><article><span>High priority</span><strong>{alerts.filter((a) => a.severity === "HIGH").length}</strong><small>Review promptly</small></article><article><span>Timeline events</span><strong>{events.length}</strong><small>Latest 60 events</small></article></section>
          <div className="mf-activity-columns">
            <section className="mf-panel mf-activity-alerts"><div className="mf-panel-head"><div><h3>Operational alerts</h3><p>Derived from active emergency, lab, bed and transfer states.</p></div><span className="mf-pill">{alerts.length} active</span></div>
              {loading ? <div className="mf-liveops-empty">Loading alerts…</div> : alerts.length ? <div className="mf-activity-alert-list">{alerts.map((alert) => <article className="mf-activity-alert" key={alert.id}><span className={`mf-alert-severity ${String(alert.severity).toLowerCase()}`}>{severityLabel[alert.severity] || alert.severity}</span><div className="mf-activity-alert-copy"><strong>{alert.title}</strong><p>{alert.message}</p><small>{timeLabel(alert.createdAt)}</small></div><Link href={alert.href || "/"} aria-label={`Open ${alert.category} workspace`}>→</Link></article>)}</div> : <div className="mf-liveops-empty"><strong>All clear for now</strong><p>No active operational alerts were found.</p></div>}
            </section>
            <section className="mf-panel mf-activity-timeline"><div className="mf-panel-head"><div><h3>Patient & operations timeline</h3><p>Events recorded as teams update workflows.</p></div><span className="mf-pill">Live feed</span></div>
              <div className="mf-timeline-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity…" aria-label="Search timeline"/><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter activity type"><option value="ALL">All events</option><option value="EMERGENCY">Emergency</option><option value="LAB">Laboratory</option><option value="CLINICAL">Clinical records</option><option value="NURSING">Nursing</option><option value="BED">Bed updates</option><option value="TRANSFER">Transfers</option><option value="ADMISSION">Admissions</option></select></div>
              {loading ? <div className="mf-liveops-empty">Loading timeline…</div> : filteredEvents.length ? <div className="mf-timeline-list">{filteredEvents.map((event) => <article className="mf-timeline-item" key={event._id}><span className="mf-timeline-marker"/><div className="mf-timeline-item-head"><strong>{event.title}</strong><time>{timeLabel(event.createdAt)}</time></div><p>{event.description || "Operational activity recorded."}</p><div className="mf-timeline-meta"><span>{String(event.eventType || "GENERAL").replaceAll("_", " ")}</span>{event.actorUserId?.name && <span>by {event.actorUserId.name}</span>}</div></article>)}</div> : <div className="mf-liveops-empty"><strong>No matching activity</strong><p>Try another filter or search term.</p></div>}
            </section>
          </div>
          <footer className="mf-footer"><span>MediFlow Hospital Operations Platform</span><span>Last refreshed: {timeLabel(generatedAt)}</span></footer>
        </div>
      </section>
    </main>
  );
}
