
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

const stages = {
  ACCEPTED: "TRANSPORT_ARRANGED",
  TRANSPORT_ARRANGED: "IN_TRANSIT",
  IN_TRANSIT: "ARRIVED",
  ARRIVED: "RECEIVED",
  RECEIVED: "COMPLETED",
};

const label = (value = "") =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const hospitalName = (value) =>
  value?.name || value?.code || "Hospital";

const dateLabel = (value) =>
  value ? new Date(value).toLocaleString() : "—";

export default function NetworkPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("hospitals");
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");

  const [hospitals, setHospitals] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [encounters, setEncounters] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [referral, setReferral] = useState({
    targetHospitalId: "",
    encounterId: "",
    specialty: "Cardiology",
    reason: "",
    urgency: "ROUTINE",
    clinicalSummary: "",
  });

  const [transfer, setTransfer] = useState({
    targetHospitalId: "",
    encounterId: "",
    reason: "",
    urgency: "URGENT",
    clinicalSummary: "",
    diagnosesSummary: "",
    medicationsSummary: "",
    labSummary: "",
  });

  useEffect(() => {
    const saved = getToken();

    if (!saved) {
      router.replace("/login");
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(saved);
    setUser(getStoredUser());
  }, [router]);

  const refresh = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      const [h, r, t, e] = await Promise.all([
        apiRequest(
          `/api/network/hospitals${
            search.trim()
              ? `?search=${encodeURIComponent(search.trim())}`
              : ""
          }`
        ),
        apiRequest(
          `/api/referrals?direction=${direction}&limit=60`
        ),
        apiRequest(
          `/api/transfers?direction=${direction}&limit=60`
        ),
        apiRequest("/api/transfers/eligible-encounters"),
      ]);

      setHospitals(h.hospitals || []);
      setReferrals(r.referrals || []);
      setTransfers(t.transfers || []);

      setEncounters(
        (e.encounters || []).filter(
          (item) =>
            !["DISCHARGED", "TRANSFERRED"].includes(item.status)
        )
      );
    } catch (err) {
      setError(err.message || "Could not load network data.");
    } finally {
      setLoading(false);
    }
  }, [token, search, direction, user?.role]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  const hospitalId = String(
    user?.hospitalId?._id || user?.hospitalId || ""
  );

  const canCoordinate = [
    "HOSPITAL_ADMIN",
    "DOCTOR",
    "EMERGENCY_STAFF",
    "TRANSFER_COORDINATOR",
  ].includes(user?.role);

  const canDecide = [
    "HOSPITAL_ADMIN",
    "TRANSFER_COORDINATOR",
  ].includes(user?.role);

  const callAction = async (path, body, successText) => {
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      setNotice(result.message || successText);
      await refresh();
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  };

  const submitForm = async (event, kind) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(
        kind === "referral"
          ? "/api/referrals"
          : "/api/transfers",
        {
          method: "POST",
          body: JSON.stringify(
            kind === "referral" ? referral : transfer
          ),
        }
      );

      setNotice(result.message || "Request created.");

      if (kind === "referral") {
        setReferral((old) => ({
          ...old,
          reason: "",
          clinicalSummary: "",
        }));

        setTab("referrals");
      } else {
        setTransfer((old) => ({
          ...old,
          reason: "",
          clinicalSummary: "",
          diagnosesSummary: "",
          medicationsSummary: "",
          labSummary: "",
        }));

        setTab("transfers");
      }

      await refresh();
    } catch (err) {
      setError(err.message || "Could not create request.");
    } finally {
      setSaving(false);
    }
  };

  const promptAction = async (path, body, promptText) => {
    const note = window.prompt(promptText) || "";

    await callAction(
      path,
      { ...body, decisionNote: note },
      "Updated successfully."
    );
  };

  const canManageConnections = [
    "HOSPITAL_ADMIN",
    "TRANSFER_COORDINATOR",
  ].includes(user?.role);

  const requestConnection = async (targetHospitalId) => {
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(
        "/api/network/connections",
        {
          method: "POST",
          body: JSON.stringify({ targetHospitalId }),
        }
      );

      setNotice(result.message || "Connection request sent.");
      await refresh();
    } catch (err) {
      setError(err.message || "Could not send connection request.");
    }
  };

  const decideConnection = async (connectionId, decision) => {
    await callAction(
      `/api/network/connections/${connectionId}/decision`,
      { decision },
      `Connection ${decision.toLowerCase()}ed.`
    );
  };

  if (!token || (loading && !user)) {
    return (
      <main className="mf-activity-loading">
        Opening hospital network…
      </main>
    );
  }

  const incomingTransfers = transfers.filter(
    (item) =>
      item.status === "PENDING" &&
      String(
        item.targetHospitalId?._id || item.targetHospitalId
      ) === hospitalId
  ).length;

  const incomingReferrals = referrals.filter(
    (item) =>
      item.status === "PENDING" &&
      String(
        item.targetHospitalId?._id || item.targetHospitalId
      ) === hospitalId
  ).length;

  const activeTransfers = transfers.filter(
    (item) =>
      String(
        item.sourceHospitalId?._id || item.sourceHospitalId
      ) === hospitalId &&
      !["COMPLETED", "REJECTED", "CANCELLED"].includes(
        item.workflowStatus
      )
  ).length;

  const encounterLabel = (item) =>
    `${item.encounterNumber} · ${
      item.patientId?.firstName || "Patient"
    } ${item.patientId?.lastName || ""}`;

  return (
    <main className="mf-app">
      <aside className="mf-sidebar">
        <Link href="/" className="mf-brand">
          <span className="mf-brand-mark">M+</span>

          <span>
            <span className="mf-brand-name">MediFlow</span>
            <span className="mf-brand-sub">
              Hospital operations
            </span>
          </span>
        </Link>

        <div className="mf-nav-caption">YOUR WORKSPACE</div>

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

          <Link href="/patients" className="mf-nav-link">
            <span className="mf-nav-icon">♧</span>
            Patient records
          </Link>

          <Link href="/emergency" className="mf-nav-link">
            <span className="mf-nav-icon">✚</span>
            Emergency queue
          </Link>

          <Link href="/beds" className="mf-nav-link">
            <span className="mf-nav-icon">▤</span>
            Beds & wards
          </Link>

          <Link href="/activity" className="mf-nav-link">
            <span className="mf-nav-icon">◷</span>
            Activity centre
          </Link>

          {[
            "HOSPITAL_ADMIN",
            "DOCTOR",
            "EMERGENCY_STAFF",
            "TRANSFER_COORDINATOR",
          ].includes(user?.role) && (
            <Link
              href="/network"
              className="mf-nav-link active"
            >
              <span className="mf-nav-icon">⇄</span>
              Network & transfers
            </Link>
          )}
        </nav>

        <div className="mf-sidebar-bottom">
          <div className="mf-sidebar-user">
            <div className="mf-avatar">
              {(user?.name || "U").charAt(0).toUpperCase()}
            </div>

            <div>
              <strong>{user?.name || "Hospital User"}</strong>
              <span>{label(user?.role || "STAFF")}</span>
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
          <div>
            <p className="mf-page-kicker">
              Platform / Hospital network
            </p>
            <h1>Network & transfers</h1>
          </div>

          <div className="mf-topbar-right">
            <div className="mf-hospital-label">
              <span className="mf-status-dot" />
              {user?.hospitalId?.name ||
                user?.hospital?.name ||
                "Your hospital"}
            </div>

            <button
              className="mf-secondary-btn"
              onClick={refresh}
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        <div className="mf-page-content mf-network-content">
          <section className="mf-network-hero">
            <div>
              <span className="mf-welcome-tag">
                ✦ CONNECTED CARE NETWORK
              </span>

              <h2>Care coordination beyond one hospital.</h2>

              <p>
                Discover active hospitals, refer patients for
                specialist review and coordinate formal transfers.
                Only authorized summary information is exchanged
                between facilities.
              </p>
            </div>

            <div
              className="mf-network-hero-art"
              aria-hidden="true"
            >
              ⇄
            </div>
          </section>

          {error && (
            <div className="mf-form-error" role="alert">
              {error}
            </div>
          )}

          {notice && (
            <div className="mf-network-success" role="status">
              {notice}
            </div>
          )}

          <section className="mf-network-stats">
            <article>
              <span>Network hospitals</span>
              <strong>{hospitals.length}</strong>
              <small>Active facilities, excluding yours</small>
            </article>

            <article>
              <span>Incoming referrals</span>
              <strong>{incomingReferrals}</strong>
              <small>Awaiting review</small>
            </article>

            <article>
              <span>Incoming transfers</span>
              <strong>{incomingTransfers}</strong>
              <small>Awaiting acceptance</small>
            </article>

            <article>
              <span>Outgoing active transfers</span>
              <strong>{activeTransfers}</strong>
              <small>Across workflow stages</small>
            </article>
          </section>

          <div
            className="mf-network-tabs"
            role="tablist"
            aria-label="Network sections"
          >
            {[
              {
                id: "hospitals",
                label: "Hospital network",
                icon: "⌘",
              },
              {
                id: "referrals",
                label: "Referrals",
                icon: "↗",
              },
              {
                id: "transfers",
                label: "Patient transfers",
                icon: "⇄",
              },
            ].map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setTab(item.id)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {tab === "hospitals" && (
            <>
              <section className="mf-network-toolbar">
                <div>
                  <h3>Participating hospitals</h3>
                  <p>
                    Only aggregate bed capacity is shown here, not
                    patient-level information.
                  </p>
                </div>

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search hospital name, code or address…"
                  aria-label="Search hospitals"
                />
              </section>

              {loading ? (
                <div className="mf-network-empty">
                  Loading network…
                </div>
              ) : hospitals.length === 0 ? (
                <div className="mf-network-empty">
                  <strong>No hospitals found</strong>
                  <span>
                    Try another search or add another active hospital
                    to the network.
                  </span>
                </div>
              ) : (
                <section className="mf-hospital-grid">
                  {hospitals.map((item) => (
                    <article
                      className="mf-hospital-card"
                      key={item._id}
                    >
                      <div className="mf-hospital-card-head">
                        <div className="mf-hospital-monogram">
                          {(item.name || "H")
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>

                        <span className="mf-network-active">
                          <i /> Active
                        </span>
                      </div>

                      <h3>{item.name}</h3>

                      <p className="mf-hospital-code">
                        {item.code}
                      </p>

                      <p className="mf-hospital-address">
                        {item.address || "Address not provided"}
                      </p>

                      {item.connectionStatus === "CONNECTED" ? (
                        <>
                          <div className="mf-hospital-capacity">
                            <div>
                              <span>Available</span>
                              <strong>
                                {item.capacity?.availableBeds ?? 0}
                              </strong>
                            </div>

                            <div>
                              <span>Occupied</span>
                              <strong>
                                {item.capacity?.occupiedBeds ?? 0}
                              </strong>
                            </div>

                            <div>
                              <span>Total beds</span>
                              <strong>
                                {item.capacity?.totalBeds ?? 0}
                              </strong>
                            </div>
                          </div>

                          <div className="mf-hospital-card-foot">
                            <span>
                              {item.activeWards || 0} active wards
                            </span>

                            <button
                              onClick={() => {
                                setReferral((old) => ({
                                  ...old,
                                  targetHospitalId: item._id,
                                }));

                                setTransfer((old) => ({
                                  ...old,
                                  targetHospitalId: item._id,
                                }));

                                setTab("referrals");
                              }}
                            >
                              Start referral ↗
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mf-network-private-capacity">
                            {item.connectionStatus ===
                            "INCOMING_REQUEST"
                              ? "This hospital has requested to connect. Accept to share aggregate bed capacity."
                              : item.connectionStatus ===
                                  "OUTGOING_REQUEST"
                                ? "Connection request sent. Capacity becomes visible after approval."
                                : "Aggregate bed capacity is shared only after both hospitals connect."}
                          </div>

                          <div className="mf-hospital-card-foot">
                            <span>
                              {label(item.connectionStatus)}
                            </span>

                            {canManageConnections &&
                              item.connectionStatus ===
                                "AVAILABLE" && (
                                <button
                                  onClick={() =>
                                    requestConnection(item._id)
                                  }
                                >
                                  Request connection ↗
                                </button>
                              )}

                            {canManageConnections &&
                              item.connectionStatus ===
                                "INCOMING_REQUEST" && (
                                <span className="mf-network-connection-actions">
                                  <button
                                    onClick={() =>
                                      decideConnection(
                                        item.connectionId,
                                        "ACCEPT"
                                      )
                                    }
                                  >
                                    Accept
                                  </button>

                                  <button
                                    className="reject"
                                    onClick={() =>
                                      decideConnection(
                                        item.connectionId,
                                        "REJECT"
                                      )
                                    }
                                  >
                                    Decline
                                  </button>
                                </span>
                              )}
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                </section>
              )}
            </>
          )}

          {tab === "referrals" && (
            <div className="mf-network-columns">
              {canCoordinate && (
                <form
                  className="mf-network-panel"
                  onSubmit={(event) =>
                    submitForm(event, "referral")
                  }
                >
                  <div className="mf-network-panel-head">
                    <span className="mf-network-icon">↗</span>

                    <div>
                      <h3>Create specialist referral</h3>
                      <p>
                        Send a clinician-entered summary to a
                        receiving hospital.
                      </p>
                    </div>
                  </div>

                  <label>
                    Receiving hospital
                    <select
                      required
                      value={referral.targetHospitalId}
                      onChange={(event) =>
                        setReferral({
                          ...referral,
                          targetHospitalId: event.target.value,
                        })
                      }
                    >
                      <option value="">
                        Choose connected hospital
                      </option>

                      {hospitals
                        .filter(
                          (item) =>
                            item.connectionStatus === "CONNECTED"
                        )
                        .map((item) => (
                          <option
                            key={item._id}
                            value={item._id}
                          >
                            {item.name} · {item.code}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    Active patient encounter
                    <select
                      required
                      value={referral.encounterId}
                      onChange={(event) =>
                        setReferral({
                          ...referral,
                          encounterId: event.target.value,
                        })
                      }
                    >
                      <option value="">Choose encounter</option>

                      {encounters.map((item) => (
                        <option key={item._id} value={item._id}>
                          {encounterLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Requested specialty
                    <input
                      required
                      maxLength={100}
                      value={referral.specialty}
                      onChange={(event) =>
                        setReferral({
                          ...referral,
                          specialty: event.target.value,
                        })
                      }
                      placeholder="e.g. Cardiology"
                    />
                  </label>

                  <label>
                    Urgency
                    <select
                      value={referral.urgency}
                      onChange={(event) =>
                        setReferral({
                          ...referral,
                          urgency: event.target.value,
                        })
                      }
                    >
                      <option value="ROUTINE">Routine</option>
                      <option value="URGENT">Urgent</option>
                      <option value="EMERGENCY">Emergency</option>
                    </select>
                  </label>

                  <label>
                    Reason for referral
                    <textarea
                      required
                      rows={3}
                      maxLength={2500}
                      value={referral.reason}
                      onChange={(event) =>
                        setReferral({
                          ...referral,
                          reason: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Clinical summary
                    <textarea
                      rows={3}
                      maxLength={8000}
                      value={referral.clinicalSummary}
                      onChange={(event) =>
                        setReferral({
                          ...referral,
                          clinicalSummary: event.target.value,
                        })
                      }
                      placeholder="Optional, clinician-entered summary"
                    />
                  </label>

                  <button
                    className="mf-network-primary"
                    disabled={saving}
                  >
                    {saving ? "Sending…" : "Send referral →"}
                  </button>
                </form>
              )}

              <section className="mf-network-panel">
                <div className="mf-network-panel-head">
                  <span className="mf-network-icon coral">↗</span>

                  <div>
                    <h3>Referral inbox & history</h3>
                    <p>
                      Review incoming requests or track outgoing
                      referrals.
                    </p>
                  </div>
                </div>

                <div className="mf-network-filter">
                  <label>
                    Direction
                    <select
                      value={direction}
                      onChange={(event) =>
                        setDirection(event.target.value)
                      }
                    >
                      <option value="all">All referrals</option>
                      <option value="incoming">Incoming</option>
                      <option value="outgoing">Outgoing</option>
                    </select>
                  </label>
                </div>

                <div className="mf-network-list">
                  {referrals.length === 0 ? (
                    <div className="mf-network-empty">
                      No referrals yet.
                    </div>
                  ) : (
                    referrals.map((item) => {
                      const incoming =
                        String(
                          item.targetHospitalId?._id ||
                            item.targetHospitalId
                        ) === hospitalId;

                      return (
                        <article
                          className="mf-network-record"
                          key={item._id}
                        >
                          <div className="mf-network-record-top">
                            <strong>{item.referralNumber}</strong>

                            <span
                              className={`mf-network-status ${item.status.toLowerCase()}`}
                            >
                              {item.status}
                            </span>
                          </div>

                          <p>
                            <b>{item.specialty}</b> · {item.urgency}
                          </p>

                          <p>
                            {incoming
                              ? `From ${hospitalName(item.sourceHospitalId)}`
                              : `To ${hospitalName(item.targetHospitalId)}`}
                          </p>

                          <p className="mf-network-record-reason">
                            {item.reason}
                          </p>

                          <small>{dateLabel(item.createdAt)}</small>

                          {incoming &&
                            item.status === "PENDING" &&
                            canDecide && (
                              <div className="mf-network-record-actions">
                                <button
                                  onClick={() =>
                                    promptAction(
                                      `/api/referrals/${item._id}/decision`,
                                      { decision: "ACCEPT" },
                                      "Optional receiving team note:"
                                    )
                                  }
                                >
                                  Accept referral
                                </button>

                                <button
                                  className="subtle"
                                  onClick={() =>
                                    promptAction(
                                      `/api/referrals/${item._id}/decision`,
                                      { decision: "REJECT" },
                                      "Reason for rejection (optional):"
                                    )
                                  }
                                >
                                  Decline
                                </button>
                              </div>
                            )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === "transfers" && (
            <div className="mf-network-columns">
              {canCoordinate && (
                <form
                  className="mf-network-panel"
                  onSubmit={(event) =>
                    submitForm(event, "transfer")
                  }
                >
                  <div className="mf-network-panel-head">
                    <span className="mf-network-icon coral">⇄</span>

                    <div>
                      <h3>Request patient transfer</h3>
                      <p>
                        Acceptance creates a new encounter in the
                        receiving hospital.
                      </p>
                    </div>
                  </div>

                  <label>
                    Receiving hospital
                    <select
                      required
                      value={transfer.targetHospitalId}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          targetHospitalId: event.target.value,
                        })
                      }
                    >
                      <option value="">
                        Choose connected hospital
                      </option>

                      {hospitals
                        .filter(
                          (item) =>
                            item.connectionStatus === "CONNECTED"
                        )
                        .map((item) => (
                          <option
                            key={item._id}
                            value={item._id}
                          >
                            {item.name} · {item.code}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    Active patient encounter
                    <select
                      required
                      value={transfer.encounterId}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          encounterId: event.target.value,
                        })
                      }
                    >
                      <option value="">Choose encounter</option>

                      {encounters.map((item) => (
                        <option key={item._id} value={item._id}>
                          {encounterLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Urgency
                    <select
                      value={transfer.urgency}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          urgency: event.target.value,
                        })
                      }
                    >
                      <option value="ROUTINE">Routine</option>
                      <option value="URGENT">Urgent</option>
                      <option value="EMERGENCY">Emergency</option>
                    </select>
                  </label>

                  <label>
                    Transfer reason
                    <textarea
                      required
                      rows={3}
                      maxLength={2000}
                      value={transfer.reason}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          reason: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Clinical summary
                    <textarea
                      rows={2}
                      maxLength={10000}
                      value={transfer.clinicalSummary}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          clinicalSummary: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Diagnosis summary
                    <textarea
                      rows={2}
                      maxLength={5000}
                      value={transfer.diagnosesSummary}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          diagnosesSummary: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Medication summary
                    <textarea
                      rows={2}
                      maxLength={5000}
                      value={transfer.medicationsSummary}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          medicationsSummary: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Lab summary
                    <textarea
                      rows={2}
                      maxLength={5000}
                      value={transfer.labSummary}
                      onChange={(event) =>
                        setTransfer({
                          ...transfer,
                          labSummary: event.target.value,
                        })
                      }
                    />
                  </label>

                  <button
                    className="mf-network-primary"
                    disabled={saving}
                  >
                    {saving
                      ? "Submitting…"
                      : "Create transfer request →"}
                  </button>
                </form>
              )}

              <section className="mf-network-panel">
                <div className="mf-network-panel-head">
                  <span className="mf-network-icon">⇄</span>

                  <div>
                    <h3>Transfer tracking</h3>
                    <p>
                      Follow acceptance, transport, transit, arrival
                      and completion.
                    </p>
                  </div>
                </div>

                <div className="mf-network-filter">
                  <label>
                    Direction
                    <select
                      value={direction}
                      onChange={(event) =>
                        setDirection(event.target.value)
                      }
                    >
                      <option value="all">All transfers</option>
                      <option value="incoming">Incoming</option>
                      <option value="outgoing">Outgoing</option>
                    </select>
                  </label>
                </div>

                <div className="mf-network-list">
                  {transfers.length === 0 ? (
                    <div className="mf-network-empty">
                      No transfers yet.
                    </div>
                  ) : (
                    transfers.map((item) => {
                      const incoming =
                        String(
                          item.targetHospitalId?._id ||
                            item.targetHospitalId
                        ) === hospitalId;

                      const next = stages[item.workflowStatus];

                      const sourceCan =
                        !incoming &&
                        ["TRANSPORT_ARRANGED", "IN_TRANSIT"].includes(
                          next
                        );

                      const targetCan =
                        incoming &&
                        ["ARRIVED", "RECEIVED", "COMPLETED"].includes(
                          next
                        );

                      return (
                        <article
                          className="mf-network-record"
                          key={item._id}
                        >
                          <div className="mf-network-record-top">
                            <strong>{item.requestNumber}</strong>

                            <span
                              className={`mf-network-status ${(item.workflowStatus || item.status).toLowerCase()}`}
                            >
                              {label(
                                item.workflowStatus || item.status
                              )}
                            </span>
                          </div>

                          <p>
                            {incoming
                              ? `From ${hospitalName(item.sourceHospitalId)}`
                              : `To ${hospitalName(item.targetHospitalId)}`}
                          </p>

                          <p>
                            <b>{item.urgency}</b> · {item.reason}
                          </p>

                          <div className="mf-transfer-steps">
                            {[
                              "REQUESTED",
                              "SENT",
                              "REVIEWED",
                              "ACCEPTED",
                              "TRANSPORT_ARRANGED",
                              "IN_TRANSIT",
                              "ARRIVED",
                              "RECEIVED",
                              "COMPLETED",
                            ].map((step) => (
                              <span
                                key={step}
                                className={
                                  (item.workflowHistory || []).some(
                                    (entry) => entry.status === step
                                  ) ||
                                  item.workflowStatus === step
                                    ? "done"
                                    : ""
                                }
                              >
                                {label(step)}
                              </span>
                            ))}
                          </div>

                          <small>
                            Requested {dateLabel(item.createdAt)}
                          </small>

                          {incoming &&
                            item.status === "PENDING" &&
                            canDecide &&
                            item.workflowStatus === "SENT" && (
                              <div className="mf-network-record-actions">
                                <button
                                  className="subtle"
                                  onClick={() =>
                                    callAction(
                                      `/api/transfers/${item._id}/workflow`,
                                      {
                                        status: "REVIEWED",
                                        note: "Reviewed by receiving hospital",
                                      },
                                      "Transfer marked as reviewed."
                                    )
                                  }
                                >
                                  Mark reviewed
                                </button>
                              </div>
                            )}

                          {incoming &&
                            item.status === "PENDING" &&
                            canDecide && (
                              <div className="mf-network-record-actions">
                                <button
                                  onClick={() =>
                                    promptAction(
                                      `/api/transfers/${item._id}/decision`,
                                      { decision: "ACCEPT" },
                                      "Receiving hospital note (optional):"
                                    )
                                  }
                                >
                                  Accept & create encounter
                                </button>

                                <button
                                  className="subtle"
                                  onClick={() =>
                                    promptAction(
                                      `/api/transfers/${item._id}/decision`,
                                      { decision: "REJECT" },
                                      "Reason for rejection (optional):"
                                    )
                                  }
                                >
                                  Decline
                                </button>
                              </div>
                            )}

                          {item.status === "ACCEPTED" &&
                            next &&
                            (sourceCan || targetCan) && (
                              <div className="mf-network-record-actions">
                                <button
                                  onClick={async () => {
                                    const note =
                                      window.prompt(
                                        `Optional note for ${label(next)}:`
                                      ) || "";

                                    await callAction(
                                      `/api/transfers/${item._id}/workflow`,
                                      {
                                        status: next,
                                        note,
                                      },
                                      "Transfer stage updated."
                                    );
                                  }}
                                >
                                  Mark {label(next)} →
                                </button>
                              </div>
                            )}

                          {item.receivingEncounterId && (
                            <p className="mf-network-linked">
                              Receiving encounter:{" "}
                              {item.receivingEncounterId.encounterNumber ||
                                "Created"}
                            </p>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}

          <footer className="mf-footer">
            <span>
              MediFlow Hospital Operations Platform
            </span>

            <span>
              Authorized network exchange · Hospital-scoped access
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
