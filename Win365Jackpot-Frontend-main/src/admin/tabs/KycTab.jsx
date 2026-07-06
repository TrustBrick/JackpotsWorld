import { useState, useEffect } from "react";
import React from "react";

// ─── Config ────────────────────────────────────────────────────────────────────
// Change this to your actual API base URL
const API = import.meta.env.VITE_API_URL; // ← change to your backend URL

// ─── Admin fetch helper (attaches auth token from localStorage) ───────────────
async function adminFetch(url, options = {}) {
  const token = localStorage.getItem("adminToken") || localStorage.getItem("token") || "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const KYC_TABS = [
  { key: "pending",  label: "📋 Pending" },
  { key: "approved", label: "✅ Approved" },
  { key: "rejected", label: "❌ Rejected" },
  { key: "banned",   label: "🚫 Banned" },
];

const STATUS_COLORS = {
  pending:  { bg: "#fff8e1", color: "#f59e0b" },
  approved: { bg: "#e8f5e9", color: "#22c55e" },
  rejected: { bg: "#fdecea", color: "#ef4444" },
  banned:   { bg: "#f3e8ff", color: "#a855f7" },
};

function genCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// ─── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 48 }}>
      <div style={{
        width: 36,
        height: 36,
        border: "3px solid #e5e7eb",
        borderTop: "3px solid #3b82f6",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

function KycTab({ onToast }) {
  const [tab, setTab] = useState("pending");
  const [users,        setUsers]        = React.useState([]);
  const [loading,      setLoading]      = React.useState(true);
  const [selected,     setSelected]     = React.useState(null);
  const [rejectTarget, setRejectTarget] = React.useState(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [banTarget,    setBanTarget]    = React.useState(null);
  const [unbanTarget,  setUnbanTarget]  = React.useState(null);
  const [confirmCode,  setConfirmCode]  = React.useState("");
  const [typedCode,    setTypedCode]    = React.useState("");

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/admin-panel/kyc/?status=${tab}`);
      const j = await r.json();
      setUsers(Array.isArray(j) ? j : []);
    } catch {
      if (onToast) onToast("Failed to load KYC records", false);
    }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, [tab]);

  // ── Action helper ──────────────────────────────────────────────────────────

  const doAction = async (kyc_id, action, reason = "") => {
    try {
      const r = await adminFetch(`${API}/admin-panel/kyc/${kyc_id}/update/`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      const j = await r.json();
      if (onToast) onToast(j.message || j.error, r.ok);
    } catch {
      if (onToast) onToast("Action failed", false);
    }
    load();
    setSelected(null);
  };

  // ── Approve ────────────────────────────────────────────────────────────────

  const approve = (u) => doAction(u.id, "approve");

  // ── Reject flow ────────────────────────────────────────────────────────────

  const openReject = (u) => { setRejectTarget(u); setRejectReason(""); };

  const confirmReject = () => {
    if (!rejectReason.trim()) { if (onToast) onToast("Please enter a reject reason", false); return; }
    doAction(rejectTarget.id, "reject", rejectReason);
    setRejectTarget(null);
  };

  // ── Ban flow ───────────────────────────────────────────────────────────────

  const openBan = (u) => {
    setBanTarget(u);
    setConfirmCode(genCode());
    setTypedCode("");
  };

  const confirmBan = () => {
    doAction(banTarget.id, "ban", "Admin action");
    setBanTarget(null);
  };

  // ── Unban flow ─────────────────────────────────────────────────────────────

  const openUnban = (u) => {
    setUnbanTarget(u);
    setConfirmCode(genCode());
    setTypedCode("");
  };

  const confirmUnban = () => {
    doAction(unbanTarget.id, "unban");
    setUnbanTarget(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "sans-serif" }}>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {KYC_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: tab === t.key ? "bold" : "normal",
              background: tab === t.key ? "#3b82f6" : "#e5e7eb",
              color: tab === t.key ? "#fff" : "#374151",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? <Spinner /> : (
        <Card>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  {["UID","Email","Name","Phone","Submitted","IP Address","Geo","Status","Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>
                      No records found
                    </td>
                  </tr>
                )}
                {users.map(u => {
                  const sc = STATUS_COLORS[u.kyc_status] || STATUS_COLORS.pending;
                  return (
                    <tr
                      key={u.id}
                      style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}
                    >
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>
                        <code style={{ fontSize: 11 }}>{u.user_uid}</code>
                      </td>
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>{u.email}</td>
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>{u.name || "—"}</td>
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>{u.phone || "—"}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                          onClick={() => setSelected(u)}>
                        {u.submitted_at ? new Date(u.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>
                        <code style={{ fontSize: 11 }}>{u.ip_address || "—"}</code>
                      </td>
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>
                        {u.geo_country
                          ? `${u.geo_city || ""}, ${u.geo_country}`
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}
                          onClick={() => setSelected(u)}>
                        <span style={{
                          background: sc.bg, color: sc.color,
                          padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        }}>
                          {u.is_banned ? "Banned" : u.kyc_status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {tab === "pending" && (
                            <>
                              <ActionBtn color="#22c55e" onClick={() => approve(u)}>✅ Approve</ActionBtn>
                              <ActionBtn color="#ef4444" onClick={() => openReject(u)}>❌ Reject</ActionBtn>
                            </>
                          )}
                          {tab === "approved" && (
                            <ActionBtn color="#a855f7" onClick={() => openBan(u)}>🚫 Ban</ActionBtn>
                          )}
                          {tab === "rejected" && (
                            <>
                              <ActionBtn color="#22c55e" onClick={() => approve(u)}>✅ Approve</ActionBtn>
                              <ActionBtn color="#a855f7" onClick={() => openBan(u)}>🚫 Ban</ActionBtn>
                            </>
                          )}
                          {tab === "banned" && (
                            <ActionBtn color="#3b82f6" onClick={() => openUnban(u)}>🔓 Unban</ActionBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Detail Side Panel ── */}
      {selected && (
        <KYCDetailPanel
          u={selected}
          onClose={() => setSelected(null)}
          onApprove={() => { approve(selected); setSelected(null); }}
          onReject={() => { openReject(selected); setSelected(null); }}
          onBan={() => { openBan(selected); setSelected(null); }}
          onUnban={() => { openUnban(selected); setSelected(null); }}
        />
      )}

      {/* ── Reject Modal ── */}
      {rejectTarget && (
        <Overlay>
          <ModalBox>
            <h3 style={{ margin: "0 0 8px" }}>Reject KYC</h3>
            <p style={{ color: "#6b7280", marginBottom: 12 }}>
              Rejecting: <strong>{rejectTarget.email}</strong>
            </p>
            <textarea
              rows={4}
              placeholder="Enter reason for rejection (shown to user)..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <ActionBtn color="#ef4444" onClick={confirmReject}>Confirm Reject</ActionBtn>
              <ActionBtn color="#6b7280" onClick={() => setRejectTarget(null)}>Cancel</ActionBtn>
            </div>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Ban Overlay ── */}
      {banTarget && (
        <ConfirmCodeOverlay
          title="Confirm User Ban"
          targetEmail={banTarget.email}
          code={confirmCode}
          typed={typedCode}
          onType={setTypedCode}
          onConfirm={confirmBan}
          onCancel={() => setBanTarget(null)}
          confirmLabel="🚫 Confirm Ban"
          confirmColor="#ef4444"
          warningText="This will immediately deactivate the user's account."
        />
      )}

      {/* ── Unban Overlay ── */}
      {unbanTarget && (
        <ConfirmCodeOverlay
          title="Confirm User Unban"
          targetEmail={unbanTarget.email}
          code={confirmCode}
          typed={typedCode}
          onType={setTypedCode}
          onConfirm={confirmUnban}
          onCancel={() => setUnbanTarget(null)}
          confirmLabel="🔓 Confirm Unban"
          confirmColor="#22c55e"
          warningText="This will restore the user's account access."
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActionBtn({ color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color, color: "#fff", border: "none",
        padding: "5px 12px", borderRadius: 6, cursor: "pointer",
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

const SIDEBAR_W = 220; // must match AdminPanel sidebar width

function Overlay({ children }) {
  return (
    <div style={{
      position: "fixed",
      top: 0, bottom: 0,
      left: SIDEBAR_W, right: 0,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      {children}
    </div>
  );
}

function ModalBox({ children }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12,
      padding: 28, width: 420, maxWidth: "90vw",
      boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    }}>
      {children}
    </div>
  );
}

// ── Reusable typed-code confirmation overlay ───────────────────────────────────

function ConfirmCodeOverlay({
  title, targetEmail, code, typed, onType,
  onConfirm, onCancel, confirmLabel, confirmColor, warningText,
}) {
  return (
    <Overlay>
      <ModalBox>
        <h3 style={{ margin: "0 0 6px", color: "#111" }}>{title}</h3>
        <p style={{ color: "#6b7280", margin: "0 0 4px", fontSize: 13 }}>
          Target: <strong>{targetEmail}</strong>
        </p>
        <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 20px" }}>
          ⚠️ {warningText}
        </p>

        <p style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
          Type this code exactly to confirm:
        </p>

        <div style={{
          fontSize: 30, letterSpacing: 10, fontWeight: 700,
          fontFamily: "monospace", textAlign: "center",
          padding: "14px 0", background: "#f3f4f6",
          borderRadius: 8, marginBottom: 16,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}>
          {code}
        </div>

        <input
          value={typed}
          onChange={e => onType(e.target.value)}
          onPaste={e => e.preventDefault()}
          onCopy={e => e.preventDefault()}
          onCut={e => e.preventDefault()}
          placeholder="Type the code above..."
          style={{
            width: "100%", padding: "10px 14px",
            borderRadius: 8, fontSize: 16, textAlign: "center",
            letterSpacing: 6, fontFamily: "monospace",
            border: `2px solid ${typed === code ? "#22c55e" : "#d1d5db"}`,
            outline: "none", boxSizing: "border-box",
          }}
        />

        {typed.length > 0 && typed !== code && (
          <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>
            Code doesn't match. Keep typing.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={onConfirm}
            disabled={typed !== code}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
              background: typed === code ? confirmColor : "#d1d5db",
              color: "#fff", fontWeight: 700, cursor: typed === code ? "pointer" : "not-allowed",
              fontSize: 14,
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
              background: "#e5e7eb", color: "#374151",
              fontWeight: 600, cursor: "pointer", fontSize: 14,
            }}
          >
            Cancel
          </button>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── KYC Detail Side Panel ──────────────────────────────────────────────────────

function KYCDetailPanel({ u, onClose, onApprove, onReject, onBan, onUnban }) {
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 480, maxWidth: "calc(100vw - 220px)",
      background: "#fff", boxShadow: "-4px 0 30px rgba(0,0,0,0.15)",
      zIndex: 900, overflowY: "auto", padding: 28,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>KYC Detail</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>

      {/* Identity */}
      <Section title="Identity">
        <Row label="UID"       value={u.user_uid} mono />
        <Row label="Email"     value={u.email} />
        <Row label="Name"      value={u.name || "—"} />
        <Row label="Phone"     value={u.phone || "—"} />
        <Row label="Full Name" value={u.full_name || "—"} />
        <Row label="DOB"       value={u.date_of_birth || "—"} />
        <Row label="Doc Type"  value={u.document_type || "—"} />
        <Row label="Doc No."   value={u.document_number || "—"} mono />
      </Section>

      {/* Network */}
      <Section title="Network & Geo">
        <Row label="IP Address" value={u.ip_address || "—"} mono />
        <Row label="ISP"        value={u.geo_isp || "—"} />
        <Row label="Country"    value={u.geo_country || "—"} />
        <Row label="Region"     value={u.geo_region || "—"} />
        <Row label="City"       value={u.geo_city || "—"} />
        {u.geo_lat && u.geo_lon && (
          <div style={{ marginTop: 6 }}>
            <a
              href={`https://www.google.com/maps?q=${u.geo_lat},${u.geo_lon}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: "#3b82f6" }}
            >
              📍 View on Google Maps ({u.geo_lat?.toFixed(4)}, {u.geo_lon?.toFixed(4)})
            </a>
          </div>
        )}
        <Row label="User Agent" value={u.user_agent || "—"} small />
      </Section>

      {/* Timestamps */}
      <Section title="Timestamps">
        <Row label="Joined"      value={u.date_joined ? new Date(u.date_joined).toLocaleString() : "—"} />
        <Row label="Submitted"   value={u.submitted_at ? new Date(u.submitted_at).toLocaleString() : "—"} />
        <Row label="Reviewed At" value={u.reviewed_at ? new Date(u.reviewed_at).toLocaleString() : "—"} />
        <Row label="Reviewed By" value={u.reviewed_by || "—"} />
        {u.is_banned && (
          <>
            <Row label="Banned At"  value={u.banned_at ? new Date(u.banned_at).toLocaleString() : "—"} />
            <Row label="Ban Reason" value={u.ban_reason || "—"} />
          </>
        )}
        {u.reject_reason && (
          <Row label="Reject Reason" value={u.reject_reason} />
        )}
      </Section>

      {/* Documents */}
      <Section title="Documents">
        <DocImage label="Front"  url={u.doc_front_url} />
        <DocImage label="Back"   url={u.doc_back_url} />
        <DocImage label="Selfie" url={u.selfie_url} />
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!u.is_banned && u.kyc_status !== "approved" && (
            <ActionBtn color="#22c55e" onClick={onApprove}>✅ Approve</ActionBtn>
          )}
          {!u.is_banned && u.kyc_status !== "rejected" && (
            <ActionBtn color="#ef4444" onClick={onReject}>❌ Reject</ActionBtn>
          )}
          {!u.is_banned && (
            <ActionBtn color="#a855f7" onClick={onBan}>🚫 Ban User</ActionBtn>
          )}
          {u.is_banned && (
            <ActionBtn color="#3b82f6" onClick={onUnban}>🔓 Unban User</ActionBtn>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Tiny helpers ───────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, mono, small }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7, gap: 10 }}>
      <span style={{ color: "#6b7280", fontSize: 12, whiteSpace: "nowrap", minWidth: 90 }}>{label}</span>
      <span style={{
        fontSize: small ? 10 : 12,
        fontFamily: mono ? "monospace" : "inherit",
        color: "#111", textAlign: "right", wordBreak: "break-all",
      }}>
        {value}
      </span>
    </div>
  );
}

function DocImage({ label, url }) {
  if (!url) return (
    <div style={{ marginBottom: 10, fontSize: 12, color: "#9ca3af" }}>
      {label}: Not uploaded
    </div>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <img
        src={url}
        alt={label}
        style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb", maxHeight: 200, objectFit: "cover", cursor: "pointer" }}
        onClick={() => window.open(url, "_blank")}
      />
    </div>
  );
}

export default KycTab;