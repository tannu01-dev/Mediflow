"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { API_URL, apiRequest, getToken } from "@/lib/auth";

export default function RealtimeOperations({ token: tokenProp }) {
  const [token, setToken] = useState(tokenProp || "");
  const [alerts, setAlerts] = useState([]);
  const [counts, setCounts] = useState({ criticalCount: 0, highCount: 0, availableBeds: null });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Resolve the token from the dashboard prop or browser session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tokenProp) setToken(tokenProp);
    else setToken(getToken());
  }, [tokenProp]);

  const loadAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const result = await apiRequest("/api/alerts");
      setAlerts(Array.isArray(result.alerts) ? result.alerts.slice(0, 4) : []);
      setCounts({ criticalCount: result.criticalCount || 0, highCount: result.highCount || 0, availableBeds: result.availableBeds ?? null });
      setError("");
    } catch (err) {
      setError(err.message || "Alerts could not be loaded.");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    // Fetch the initial snapshot before waiting for socket updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAlerts();
    const socket = io(API_URL, { auth: { token }, transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: 5 });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("socket:ready", () => setConnected(true));
    socket.on("dashboard:refresh", loadAlerts);
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [token, loadAlerts]);

  return (
    <section className="mf-liveops-panel">
      <div className="mf-liveops-head">
        <div>
          <span className="mf-liveops-kicker">REAL-TIME OPERATIONS</span>
          <h3>Alerts & live activity</h3>
          <p>Operational signals refresh when the hospital workflow changes.</p>
        </div>
        <span className={`mf-liveops-status ${connected ? "is-live" : ""}`}><i />{connected ? "Live" : "Reconnecting"}</span>
      </div>
      <div className="mf-liveops-metrics">
        <div><span>Critical</span><strong>{counts.criticalCount}</strong></div>
        <div><span>High priority</span><strong>{counts.highCount}</strong></div>
        <div><span>Available beds</span><strong>{counts.availableBeds === null ? "—" : counts.availableBeds}</strong></div>
      </div>
      {error ? <p className="mf-liveops-error">{error}</p> : alerts.length ? <div className="mf-liveops-alert-list">{alerts.map((alert) => <div className="mf-liveops-alert" key={alert.id}><span className={`mf-liveops-severity ${String(alert.severity).toLowerCase()}`} /> <div><strong>{alert.title}</strong><p>{alert.message}</p></div></div>)}</div> : <div className="mf-liveops-empty">No active operational alerts at this time.</div>}
      <div className="mf-liveops-foot">
        <span>Alerts are informational; clinical decisions remain with the care team.</span>
        <Link href="/activity">Open activity centre →</Link>
      </div>
    </section>
  );
}
