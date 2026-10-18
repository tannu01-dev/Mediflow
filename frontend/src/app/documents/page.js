
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getToken, getStoredUser, logout } from "@/lib/auth";

const TYPES = [
  {
    value: "PRESCRIPTION",
    label: "Prescription",
    description: "Doctor-entered active medication orders",
  },
  {
    value: "LAB_REPORT",
    label: "Laboratory report",
    description: "Completed investigation results",
  },
  {
    value: "REFERRAL_LETTER",
    label: "Referral letter",
    description: "Authorized referral details",
  },
  {
    value: "TRANSFER_SUMMARY",
    label: "Transfer summary",
    description: "Inter-hospital transfer handover",
  },
  {
    value: "DISCHARGE_SUMMARY",
    label: "Discharge summary",
    description: "Finalized discharge information",
  },
];

const label = (s = "") =>
  String(s)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());

const date = (s) => (s ? new Date(s).toLocaleString() : "—");

export default function DocumentsPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [encounterId, setEncounterId] = useState("");
  const [documentType, setDocumentType] = useState("PRESCRIPTION");
  const [referralId, setReferralId] = useState("");
  const [transferId, setTransferId] = useState("");
  const [admissionId, setAdmissionId] = useState("");

  const [discharge, setDischarge] = useState({
    diagnosis: "",
    summary: "",
    instructions: "",
    destination: "HOME",
  });

  const [selectedDocument, setSelectedDocument] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canDischarge = ["DOCTOR", "HOSPITAL_ADMIN"].includes(user?.role);

  const canCreate = [
    "DOCTOR",
    "HOSPITAL_ADMIN",
    "EMERGENCY_STAFF",
    "LAB_STAFF",
    "TRANSFER_COORDINATOR",
  ].includes(user?.role);

  const selectedEncounter = useMemo(
    () => encounters.find((e) => String(e._id) === encounterId),
    [encounters, encounterId]
  );

  const loadData = useCallback(async () => {
    setError("");

    try {
      const role = getStoredUser()?.role;

      const primaryRequest =
        role === "LAB_STAFF"
          ? apiRequest("/api/lab")
          : apiRequest("/api/encounters");

      const results = await Promise.allSettled([
        primaryRequest,
        apiRequest("/api/documents"),

        [
          "DOCTOR",
          "HOSPITAL_ADMIN",
          "RECEPTION",
          "EMERGENCY_STAFF",
          "TRANSFER_COORDINATOR",
        ].includes(role)
          ? apiRequest("/api/admissions")
          : Promise.resolve({ admissions: [] }),

        [
          "DOCTOR",
          "HOSPITAL_ADMIN",
          "TRANSFER_COORDINATOR",
          "EMERGENCY_STAFF",
        ].includes(role)
          ? apiRequest("/api/referrals")
          : Promise.resolve({ referrals: [] }),

        [
          "DOCTOR",
          "HOSPITAL_ADMIN",
          "TRANSFER_COORDINATOR",
          "EMERGENCY_STAFF",
        ].includes(role)
          ? apiRequest("/api/transfers")
          : Promise.resolve({ transfers: [] }),
      ]);

      const get = (i, key) =>
        results[i].status === "fulfilled"
          ? results[i].value[key] || []
          : [];

      if (role === "LAB_STAFF") {
        const seen = new Map();

        get(0, "labRequests").forEach((r) => {
          const e = r.encounterId;
          const id = String(e?._id || e || "");

          if (id && !seen.has(id)) {
            seen.set(id, {
              _id: id,
              encounterNumber: e?.encounterNumber || "Encounter",
              status: e?.status || "ACTIVE",
              patientId: r.patientId || {},
            });
          }
        });

        setEncounters(Array.from(seen.values()));
      } else {
        setEncounters(get(0, "encounters"));
      }

      setDocuments(get(1, "documents"));
      setAdmissions(get(2, "admissions"));
      setReferrals(get(3, "referrals"));
      setTransfers(get(4, "transfers"));

      const failed = results.find((r) => r.status === "rejected");

      if (failed) {
        setError(
          failed.reason?.message ||
            "Some document data could not be loaded. Check your role permissions."
        );
      }
    } catch (e) {
      setError(e.message || "Could not load documents workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    Promise.resolve().then(() => {
      setUser(getStoredUser());
      return loadData();
    });
  }, [router, loadData]);

  function handleEncounterChange(nextId) {
    setEncounterId(nextId);

    setReferralId(
      String(
        referrals.find(
          (r) =>
            String(r.sourceEncounterId?._id || r.sourceEncounterId) ===
            nextId
        )?._id || ""
      )
    );

    setTransferId(
      String(
        transfers.find(
          (t) =>
            String(t.sourceEncounterId?._id || t.sourceEncounterId) ===
            nextId
        )?._id || ""
      )
    );

    const a = admissions.find(
      (x) =>
        String(x.encounterId?._id || x.encounterId) === nextId &&
        x.status === "ADMITTED"
    );

    setAdmissionId(a ? String(a._id) : "");
  }

  async function generate() {
    if (!encounterId) {
      return setError("Please select a patient encounter first.");
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const payload = { encounterId, documentType };

      if (documentType === "REFERRAL_LETTER") {
        payload.referralId = referralId;
      }

      if (documentType === "TRANSFER_SUMMARY") {
        payload.transferId = transferId;
      }

      const result = await apiRequest("/api/documents/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSelectedDocument(result.document);
      setSuccess(result.message || "Document generated.");

      await loadData();
    } catch (e) {
      setError(e.message || "Document could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeDischarge() {
    if (!admissionId) {
      return setError("Select an active admission before discharging.");
    }

    if (!discharge.summary.trim()) {
      return setError("Enter the doctor-authored discharge summary.");
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admissions/${admissionId}/discharge`,
        {
          method: "PATCH",
          body: JSON.stringify(discharge),
        }
      );

      setSuccess(
        result.message || "Discharge recorded; bed moved to cleaning."
      );

      await loadData();
    } catch (e) {
      setError(e.message || "Discharge could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function printDocument(doc) {
    if (!doc) return;

    const c = doc.content || {};

    const esc = (v) =>
      String(v ?? "—").replace(
        /[&<>"']/g,
        (ch) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[ch]
      );

    const sectionHtml = (c.sections || [])
      .map(
        (s) => `
          <section>
            <h2>${esc(s.heading)}</h2>
            ${(s.items || [])
              .map(
                (item) => `
                  <div class="item">
                    ${Object.entries(item)
                      .map(
                        ([k, v]) => `
                          <p>
                            <b>${esc(label(k))}:</b>
                            ${esc(
                              Array.isArray(v)
                                ? v.join(", ")
                                : typeof v === "object" && v !== null
                                  ? JSON.stringify(v)
                                  : v
                            )}
                          </p>
                        `
                      )
                      .join("")}
                  </div>
                `
              )
              .join("")}
          </section>
        `
      )
      .join("");

    const w = window.open("", "_blank", "width=900,height=720");

    if (!w) {
      setError(
        "Your browser blocked the print window. Allow pop-ups for this site and try again."
      );
      return;
    }

    w.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${esc(doc.title)}</title>
          <style>
            body {
              font: 14px Arial, sans-serif;
              color: #29252e;
              padding: 34px;
              max-width: 850px;
              margin: auto;
            }

            header {
              border-bottom: 3px solid #704264;
              padding-bottom: 16px;
              margin-bottom: 22px;
            }

            h1 {
              font-size: 25px;
              margin: 4px 0;
            }

            h2 {
              font-size: 16px;
              color: #704264;
              border-bottom: 1px solid #e9e0dc;
              padding-bottom: 7px;
              margin-top: 26px;
            }

            .meta {
              color: #77717d;
              font-size: 12px;
            }

            .item {
              padding: 8px 14px;
              margin: 10px 0;
              border: 1px solid #e9e0dc;
              border-radius: 8px;
              break-inside: avoid;
            }

            .item p {
              margin: 6px 0;
              line-height: 1.5;
            }

            footer {
              margin-top: 35px;
              border-top: 1px solid #ddd;
              padding-top: 12px;
              color: #777;
              font-size: 11px;
            }

            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>

        <body>
          <header>
            <div class="meta">
              ${esc(c.hospital)} · ${esc(c.hospitalCode)}
            </div>

            <h1>${esc(doc.title)}</h1>

            <div class="meta">
              Document ${esc(doc.documentNumber)} · Generated
              ${esc(date(doc.createdAt || c.generatedAt))}
            </div>
          </header>

          <section>
            <h2>Patient & encounter</h2>

            <div class="item">
              <p><b>Patient:</b> ${esc(c.patientName)}</p>
              <p><b>MRN:</b> ${esc(c.mrn)}</p>
              <p><b>Date of birth:</b> ${esc(date(c.dateOfBirth))}</p>
              <p>
                <b>Encounter:</b>
                ${esc(c.encounterNumber)} (${esc(label(c.encounterType))})
              </p>
              <p><b>Chief complaint:</b> ${esc(c.chiefComplaint)}</p>
              <p>
                <b>Known allergies:</b>
                ${esc((c.allergies || []).join(", ") || "None recorded")}
              </p>
            </div>
          </section>

          ${sectionHtml}

          <footer>
            Generated by ${esc(c.generatedBy)} in MediFlow.
            This document reflects information entered into the system;
            verify clinical details before use.
          </footer>

          <script>
            window.onload = () => window.print();
          <\/script>
        </body>
      </html>
    `);

    w.document.close();
  }

  if (loading) {
    return (
      <main className="mf-page-wrap">
        <div className="mf-panel">
          Loading clinical documents workspace…
        </div>
      </main>
    );
  }

  return (
    <main className="mf-page-wrap">
      <header className="mf-page-header">
        <div>
          <div className="mf-kicker">CLINICAL RECORDS</div>
          <h1>Documents & discharge</h1>
          <p>
            Generate printable clinical documents and complete
            doctor-authorized discharge workflows.
          </p>
        </div>

        <div className="mf-header-actions">
          <Link className="mf-secondary-btn" href="/">
            ← Dashboard
          </Link>

          <button className="mf-secondary-btn" onClick={loadData}>
            ↻ Refresh
          </button>

          <button className="mf-secondary-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="mf-form-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="mf-form-success" role="status">
          {success}
        </div>
      )}

      <div className="mf-doc-grid">
        <section className="mf-panel">
          <div className="mf-panel-heading">
            <div>
              <div className="mf-kicker">DOCUMENT STUDIO</div>
              <h2>Generate a document</h2>
              <p>
                Select an encounter and create a snapshot from recorded
                clinical information.
              </p>
            </div>

            <span className="mf-doc-icon">▤</span>
          </div>

          <div className="mf-field">
            <label>Patient encounter</label>

            <select
              value={encounterId}
              onChange={(e) => handleEncounterChange(e.target.value)}
            >
              <option value="">Choose patient / encounter…</option>

              {encounters.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.patientId?.firstName} {e.patientId?.lastName} ·{" "}
                  {e.encounterNumber} · {label(e.status)}
                </option>
              ))}
            </select>
          </div>

          <div className="mf-field">
            <label>Document type</label>

            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <small>
              {TYPES.find((t) => t.value === documentType)?.description}
            </small>
          </div>

          {documentType === "REFERRAL_LETTER" && (
            <div className="mf-field">
              <label>Source referral</label>

              <select
                value={referralId}
                onChange={(e) => setReferralId(e.target.value)}
              >
                <option value="">Select referral…</option>

                {referrals
                  .filter(
                    (r) =>
                      String(
                        r.sourceEncounterId?._id || r.sourceEncounterId
                      ) === encounterId
                  )
                  .map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.referralNumber} · {r.specialty}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {documentType === "TRANSFER_SUMMARY" && (
            <div className="mf-field">
              <label>Transfer request</label>

              <select
                value={transferId}
                onChange={(e) => setTransferId(e.target.value)}
              >
                <option value="">Select transfer…</option>

                {transfers
                  .filter(
                    (t) =>
                      String(
                        t.sourceEncounterId?._id || t.sourceEncounterId
                      ) === encounterId
                  )
                  .map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.requestNumber} ·{" "}
                      {label(t.workflowStatus || t.status)}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <button
            className="mf-primary-btn"
            disabled={busy || !canCreate}
            onClick={generate}
          >
            {busy ? "Working…" : "Generate document →"}
          </button>

          {!canCreate && (
            <p className="mf-muted-note">
              Your role has read-only access to generated documents.
            </p>
          )}

          {selectedEncounter && (
            <div className="mf-context-card">
              <strong>
                {selectedEncounter.patientId?.firstName}{" "}
                {selectedEncounter.patientId?.lastName}
              </strong>

              <span>
                MRN {selectedEncounter.patientId?.mrn || "—"} ·{" "}
                {selectedEncounter.encounterNumber}
              </span>

              <span>
                Encounter status: {label(selectedEncounter.status)}
              </span>
            </div>
          )}
        </section>

        <section className="mf-panel">
          <div className="mf-panel-heading">
            <div>
              <div className="mf-kicker">DISCHARGE DESK</div>
              <h2>Finalize a discharge</h2>
              <p>
                Only authorized doctor/admin accounts can complete discharge.
                The bed moves to cleaning automatically.
              </p>
            </div>

            <span className="mf-doc-icon coral">↗</span>
          </div>

          <div className="mf-field">
            <label>Active admission</label>

            <select
              value={admissionId}
              onChange={(e) => {
                setAdmissionId(e.target.value);

                const a = admissions.find(
                  (x) => String(x._id) === e.target.value
                );

                if (a) {
                  setEncounterId(
                    String(a.encounterId?._id || a.encounterId)
                  );
                }
              }}
            >
              <option value="">Choose an active admission…</option>

              {admissions
                .filter((a) => a.status === "ADMITTED")
                .map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.patientId?.firstName} {a.patientId?.lastName} ·{" "}
                    {a.encounterId?.encounterNumber || "Encounter"} · Bed{" "}
                    {a.bedId?.bedNumber || "—"}
                  </option>
                ))}
            </select>
          </div>

          <div className="mf-field">
            <label>Discharge diagnosis (doctor-entered)</label>

            <input
              value={discharge.diagnosis}
              maxLength={2000}
              onChange={(e) =>
                setDischarge({
                  ...discharge,
                  diagnosis: e.target.value,
                })
              }
              placeholder="Record the clinician-entered diagnosis"
            />
          </div>

          <div className="mf-field">
            <label>Clinical discharge summary *</label>

            <textarea
              rows={3}
              value={discharge.summary}
              maxLength={10000}
              onChange={(e) =>
                setDischarge({
                  ...discharge,
                  summary: e.target.value,
                })
              }
              placeholder="Clinical course, status at discharge and relevant notes"
            />
          </div>

          <div className="mf-field">
            <label>Follow-up & instructions</label>

            <textarea
              rows={2}
              value={discharge.instructions}
              maxLength={5000}
              onChange={(e) =>
                setDischarge({
                  ...discharge,
                  instructions: e.target.value,
                })
              }
              placeholder="Doctor-entered follow-up and instructions"
            />
          </div>

          <div className="mf-field">
            <label>Destination</label>

            <select
              value={discharge.destination}
              onChange={(e) =>
                setDischarge({
                  ...discharge,
                  destination: e.target.value,
                })
              }
            >
              <option value="HOME">Home</option>
              <option value="TRANSFER">Transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <button
            className="mf-primary-btn"
            disabled={busy || !canDischarge}
            onClick={finalizeDischarge}
          >
            {busy ? "Saving…" : "Authorize & complete discharge"}
          </button>

          {!canDischarge && (
            <p className="mf-muted-note">
              Only a doctor or hospital administrator can finalize discharge.
            </p>
          )}
        </section>
      </div>

      {selectedDocument && (
        <section className="mf-panel mf-document-preview">
          <div className="mf-panel-heading">
            <div>
              <div className="mf-kicker">GENERATED SNAPSHOT</div>
              <h2>{selectedDocument.title}</h2>
              <p>
                {selectedDocument.documentNumber} · Created{" "}
                {date(selectedDocument.createdAt)}
              </p>
            </div>

            <button
              className="mf-primary-btn mf-print-btn"
              onClick={() => printDocument(selectedDocument)}
            >
              Print / Save PDF ↗
            </button>
          </div>

          <div className="mf-doc-preview-body">
            <div className="mf-preview-patient">
              <strong>{selectedDocument.content?.patientName}</strong>
              <span>MRN {selectedDocument.content?.mrn}</span>
              <span>{selectedDocument.content?.encounterNumber}</span>
            </div>

            {(selectedDocument.content?.sections || []).map(
              (section, i) => (
                <div key={i} className="mf-preview-section">
                  <h3>{section.heading}</h3>

                  {section.items?.map((item, j) => (
                    <div key={j} className="mf-preview-item">
                      {Object.entries(item).map(([k, v]) => (
                        <p key={k}>
                          <b>{label(k)}:</b>{" "}
                          {typeof v === "object" && v !== null
                            ? JSON.stringify(v)
                            : String(v ?? "—")}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </section>
      )}

      <section className="mf-panel">
        <div className="mf-panel-heading">
          <div>
            <div className="mf-kicker">DOCUMENT ARCHIVE</div>
            <h2>Recently generated</h2>
            <p>
              {documents.length} saved document snapshot(s) available for
              this hospital.
            </p>
          </div>
        </div>

        <div className="mf-table-wrap">
          <table className="mf-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Patient</th>
                <th>Encounter</th>
                <th>Generated by</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {documents.map((d) => (
                <tr key={d._id}>
                  <td>
                    <strong>{d.title}</strong>
                    <small>
                      {d.documentNumber} · {label(d.documentType)}
                    </small>
                  </td>

                  <td>
                    {d.patientId?.firstName} {d.patientId?.lastName}
                    <small>{d.patientId?.mrn}</small>
                  </td>

                  <td>
                    {d.encounterId?.encounterNumber}
                    <small>{label(d.encounterId?.status)}</small>
                  </td>

                  <td>{d.generatedBy?.name || "—"}</td>
                  <td>{date(d.createdAt)}</td>

                  <td>
                    <button
                      className="mf-secondary-btn mf-small-btn"
                      onClick={() => setSelectedDocument(d)}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}

              {!documents.length && (
                <tr>
                  <td colSpan="6" className="mf-empty-cell">
                    No documents generated yet. Choose an encounter above
                    to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mf-muted-note">
        MediFlow stores a point-in-time snapshot. Verify patient identity and
        clinical details before printing or sharing. Printing uses your
        browser&apos;s Print dialog, where you can choose Save as PDF.
      </p>
    </main>
  );
}
