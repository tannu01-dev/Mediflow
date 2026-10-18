
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { apiRequest, getToken, API_URL } from "@/lib/auth";

function getPayload(result) {
  return result?.data ?? result;
}

function getNotificationList(result) {
  const payload = getPayload(result);

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.notifications)) return payload.notifications;
  if (Array.isArray(payload?.items)) return payload.items;

  return [];
}

export default function RealtimeNotifications({ token: tokenProp }) {
  const token = tokenProp || getToken();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const notificationsRef = useRef([]);

  const loadNotifications = useCallback(async () => {
    if (!token) return;

    setLoading(true);

    try {
      setError("");

      const result = await apiRequest("/api/notifications?limit=20");
      const items = getNotificationList(result);
      const payload = getPayload(result);

      notificationsRef.current = items;
      setNotifications(items);

      const count =
        typeof payload?.unreadCount === "number"
          ? payload.unreadCount
          : items.filter((item) => !item.readAt).length;

      setUnreadCount(count);
    } catch (err) {
      setError(err.message || "Notifications load nahi ho sakin.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // Loading remote data is the intended side effect of this subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifications();
  }, [token, loadNotifications]);

  useEffect(() => {
    if (!token) return;

    const socket = io(API_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("socket:ready", () => setConnected(true));

    socket.on("connect_error", (err) => {
      setConnected(false);
      console.error("MediFlow Socket.IO connection failed:", err.message);
    });

    socket.on("notification:new", (notification) => {
      const newId = notification.id || notification._id;

      if (
        newId &&
        notificationsRef.current.some(
          (item) => (item.id || item._id) === newId
        )
      ) {
        return;
      }

      const updated = [notification, ...notificationsRef.current].slice(0, 20);
      notificationsRef.current = updated;
      setNotifications(updated);

      if (!notification.readAt) {
        setUnreadCount((count) => count + 1);
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token]);

  async function markAsRead(notification) {
    const id = notification.id || notification._id;

    if (!id || notification.readAt) return;

    setBusyId(id);
    setError("");

    try {
      await apiRequest(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });

      const updated = notificationsRef.current.map((item) =>
        (item.id || item._id) === id
          ? { ...item, readAt: new Date().toISOString() }
          : item
      );

      notificationsRef.current = updated;
      setNotifications(updated);
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err.message || "Notification read mark nahi hui.");
    } finally {
      setBusyId("");
    }
  }

  async function markAllAsRead() {
    if (unreadCount === 0) return;

    setError("");

    try {
      await apiRequest("/api/notifications/read-all", {
        method: "PATCH",
      });

      const now = new Date().toISOString();
      const updated = notificationsRef.current.map((item) => ({
        ...item,
        readAt: item.readAt || now,
      }));

      notificationsRef.current = updated;
      setNotifications(updated);
      setUnreadCount(0);
    } catch (err) {
      setError(err.message || "Notifications update nahi hui.");
    }
  }

  if (!token) {
    return (
      <section className="rt-card">
        <h2>Notifications</h2>
        <p className="rt-muted">Login ke baad notifications yahan dikhenge.</p>
      </section>
    );
  }

  return (
    <section className="rt-card">
      <header className="rt-header">
        <div>
          <h2>Notifications</h2>
          <p className="rt-muted">Latest hospital updates</p>
        </div>

        <div className="rt-header-right">
          <span className={`rt-live ${connected ? "rt-live-on" : ""}`}>
            <span className="rt-dot" />
            {connected ? "Live" : "Connecting"}
          </span>
          <span className="rt-count">{unreadCount} unread</span>
        </div>
      </header>

      {error && (
        <div className="rt-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      )}

      <div className="rt-toolbar">
        <span>Recent activity</span>
        <div>
          <button type="button" onClick={loadNotifications}>Refresh</button>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rt-empty">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="rt-empty">
          <div className="rt-empty-icon">✓</div>
          <strong>You&apos;re all caught up</strong>
          <p>New hospital updates will appear here.</p>
        </div>
      ) : (
        <div>
          {notifications.map((notification, index) => {
            const id = notification.id || notification._id || `item-${index}`;
            const unread = !notification.readAt;

            return (
              <article
                className={`rt-item ${unread ? "rt-item-unread" : ""}`}
                key={id}
              >
                <div className="rt-icon">
                  {notification.type === "EMERGENCY"
                    ? "!"
                    : notification.type === "LAB_RESULT"
                    ? "L"
                    : notification.type === "TRANSFER"
                    ? "↗"
                    : notification.type === "ADMISSION"
                    ? "+"
                    : "•"}
                </div>

                <div className="rt-content">
                  <div className="rt-title-row">
                    <h3>{notification.title || "Hospital update"}</h3>
                    {unread && <span className="rt-new-dot" />}
                  </div>

                  <p>{notification.message || "New update received."}</p>

                  <div className="rt-meta">
                    <span>{notification.type || "GENERAL"}</span>
                    <span>
                      {notification.createdAt
                        ? new Date(notification.createdAt).toLocaleString()
                        : "Just now"}
                    </span>
                  </div>
                </div>

                {unread && (
                  <button
                    className="rt-read"
                    type="button"
                    disabled={busyId === id}
                    onClick={() => markAsRead(notification)}
                  >
                    {busyId === id ? "Saving..." : "Mark read"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .rt-card {
          background: #fffdfb;
          color: #29252e;
          border: 1px solid #e9e0dc;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 5px 20px rgba(20, 42, 67, .035);
          font-family: Arial, Helvetica, sans-serif;
        }
        .rt-header {
          padding: 20px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid #eee6e2;
        }
        .rt-header h2 { margin: 0 0 6px; font-size: 18px; }
        .rt-muted { margin: 0; color: #8a808a; font-size: 12px; }
        .rt-header-right { display: flex; align-items: center; gap: 8px; }
        .rt-live, .rt-count {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 20px;
          padding: 7px 9px;
          background: #f2f4f7;
          color: #776d79;
          font-size: 11px;
          white-space: nowrap;
        }
        .rt-live-on { color: #704264; background: #f0e7f1; }
        .rt-dot, .rt-new-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #98a4b4;
          display: inline-block;
        }
        .rt-live-on .rt-dot, .rt-new-dot { background: #e77c68; }
        .rt-count { background: #fff5df; color: #80591d; }
        .rt-toolbar {
          padding: 12px 22px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          color: #776d79;
          font-size: 12px;
          border-bottom: 1px solid #eee6e2;
        }
        .rt-toolbar div { display: flex; gap: 12px; }
        .rt-toolbar button {
          background: transparent;
          border: 0;
          color: #704264;
          font-weight: 700;
          cursor: pointer;
          font-size: 11px;
        }
        .rt-toolbar button:disabled { opacity: .45; cursor: default; }
        .rt-item {
          display: flex;
          align-items: flex-start;
          gap: 13px;
          padding: 18px 22px;
          border-bottom: 1px solid #f0e8e4;
        }
        .rt-item:last-child { border-bottom: 0; }
        .rt-item-unread { background: #fcf8fb; }
        .rt-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: #fff0ec;
          color: #704264;
          font-weight: 800;
        }
        .rt-content { min-width: 0; flex: 1; }
        .rt-title-row { display: flex; align-items: center; gap: 8px; }
        .rt-item h3 { margin: 0; font-size: 13px; line-height: 1.5; }
        .rt-item p {
          margin: 6px 0 9px;
          color: #746a76;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }
        .rt-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          color: #9b909a;
          font-size: 10px;
        }
        .rt-read {
          border: 1px solid #e9e0dc;
          background: white;
          color: #704264;
          border-radius: 7px;
          padding: 7px 9px;
          cursor: pointer;
          font-size: 11px;
          white-space: nowrap;
        }
        .rt-read:disabled { opacity: .6; cursor: wait; }
        .rt-empty {
          padding: 32px 18px;
          text-align: center;
          color: #77717d;
          font-size: 13px;
        }
        .rt-empty p { font-size: 12px; }
        .rt-empty-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          margin: 0 auto 12px;
          border-radius: 50%;
          background: #f0e7f1;
          color: #704264;
          font-size: 22px;
        }
        .rt-error {
          margin: 12px 18px;
          padding: 10px 12px;
          border-radius: 8px;
          background: #fff0ec;
          color: #963b35;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
        }
        .rt-error button {
          border: 0;
          background: transparent;
          cursor: pointer;
          color: inherit;
        }
        @media (max-width: 560px) {
          .rt-header { align-items: flex-start; flex-direction: column; }
          .rt-header-right { flex-wrap: wrap; }
          .rt-item { padding: 15px; flex-wrap: wrap; }
          .rt-read { margin-left: 47px; }
          .rt-toolbar { padding: 12px 15px; }
        }
      `}</style>
    </section>
  );
}
