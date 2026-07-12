import React, { useState, useEffect, useCallback } from "react";
import { API, adminFetch, fmtDT } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "pending",  label: "📋 Pending" },
  { key: "approved", label: "✅ Approved" },
  { key: "rejected", label: "❌ Rejected" },
  { key: "banned",   label: "🚫 Banned" },
];

const TYPE_TABS = [
  { key: "all",       label: "All" },
  { key: "player",    label: "Player" },
  { key: "affiliate", label: "Affiliate" },
];

function genCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

const SIDEBAR_W = 228; // must match AdminPanel.jsx's <aside> width

// ─── Main Component ────────────────────────────────────────────────────────────

export default function KycTab({ onToast }) {
  const { C } = useAdminTheme();
  const [statusTab, setStatusTab] = useState("pending");
  const [typeTab,   setTypeTab]   = useState("all");
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [banTarget,    setBanTarget]    = useState(null);
  const [unbanTarget,  setUnbanTarget]  = useState(null);
  const [confirmCode,  setConfirmCode]  = useState("");
  const [typedCode,    setTypedCode]    = useState("");

  const statusColors = {
    pending:  { bg: `${C.gold}18`,  color: C.gold },
    approved: { bg: `${C.green}18`, color: C.green },
    rejected: { bg: `${C.red}18`,   color: C.red },
    banned:   { bg: `${C.purple}18`,color: C.purple },
  };

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/kyc/?status=${statusTab}&type=${typeTab}`);
      const j = await r?.json();
      setUsers(Array.isArray(j) ? j : []);
    } catch {
      onToast?.("Failed to load KYC records", false);
    }
    setLoading(false);
  }, [statusTab, typeTab]);

  useEffect(() => { load(); }, [load]);

  // ── Action helper ──────────────────────────────────────────────────────────

  const doAction = async (kyc_id, action, reason = "") => {
    try {
      const r = await adminFetch(`${API}/api/admin-panel/kyc/${kyc_id}/update/`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      const j = await r?.json();
      onToast?.(j?.message || j?.error, r?.ok);
    } catch {
      onToast?.("Action failed", false);
    }
    load();
    setSelected(null);
  };

  const approve = (u) => doAction(u.id, "approve");
  const openReject = (u) => { setRejectTarget(u); setRejectReason(""); };
  const confirmReject = () => {
    if (!rejectReason.trim()) { onToast?.("Please enter a reject reason", false); return; }
    doAction(rejectTarget.id, "reject", rejectReason);
    setRejectTarget(null);
  };

  const openBan = (u) => { setBanTarget(u); setConfirmCode(genCode()); setTypedCode(""); };
  const confirmBan = () => { doAction(banTarget.id, "ban", "Admin action"); setBanTarget(null); };

  const openUnban = (u) => { setUnbanTarget(u); setConfirmCode(genCode()); setTypedCode(""); };
  const confirmUnban = () => { doAction(unbanTarget.id, "unban"); setUnbanTarget(null); };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: statusTab === t.key ? 700 : 500, fontSize: 12.5,
              background: statusTab === t.key ? C.gold : C.surface,
              color: statusTab === t.key ? "#07080F" : C.sub,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TYPE_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTypeTab(t.key)}
            style={{
              padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontSize: 11.5,
              fontWeight: typeTab === t.key ? 700 : 500,
              border: `1px solid ${typeTab === t.key ? C.gold : C.border}`,
              background: typeTab === t.key ? `${C.gold}14` : "transparent",
              color: typeTab === t.key ? C.gold : C.muted,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? <Spinner C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.hoverBg, textAlign: "left" }}>
                  {["UID","Email","Name","Phone","Type","Submitted","IP Address","Geo","Status","Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", color: C.sub, fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", textShadow: "0 0 8px rgba(212,175,55,0.25)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: 30, color: C.muted }}>
                      No records found
                    </td>
                  </tr>
                )}
                {users.map(u => {
                  const sc = statusColors[u.is_banned ? "banned" : u.kyc_status] || statusColors.pending;
                  return (
                    <tr
                      key={u.id}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                      onMouseLeave={e => e.currentTarget.style.background = ""}
                    >
                      <td style={{ padding: "10px 12px", color: C.text }} onClick={() => setSelected(u)}>
                        <code style={{ fontSize: 11 }}>{u.user_uid}</code>
                      </td>
                      <td style={{ padding: "10px 12px", color: C.text }} onClick={() => setSelected(u)}>{u.email}</td>
                      <td style={{ padding: "10px 12px", color: C.text }} onClick={() => setSelected(u)}>{u.name || "—"}</td>
                      <td style={{ padding: "10px 12px", color: C.text }} onClick={() => setSelected(u)}>{u.phone || "—"}</td>
                      <td style={{ padding: "10px 12px" }} onClick={() => setSelected(u)}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: u.kyc_type === "affiliate" ? `${C.blue}18` : `${C.teal}18`,
                          color: u.kyc_type === "affiliate" ? C.blue : C.teal,
                        }}>
                          {u.kyc_type === "affiliate" ? "Affiliate" : "Player"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: C.sub }} onClick={() => setSelected(u)}>
                        {u.submitted_at ? fmtDT(u.submitted_at) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: C.sub }} onClick={() => setSelected(u)}>
                        <code style={{ fontSize: 11 }}>{u.ip_address || "—"}</code>
                      </td>
                      <td style={{ padding: "10px 12px", color: C.sub }} onClick={() => setSelected(u)}>
                        {u.geo_country ? `${u.geo_city || ""}, ${u.geo_country}` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }} onClick={() => setSelected(u)}>
                        <span style={{ background: sc.bg, color: sc.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                          {u.is_banned ? "Banned" : u.kyc_status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {statusTab === "pending" && (
                            <>
                              <ActionBtn color={C.green} onClick={() => approve(u)}>✅ Approve</ActionBtn>
                              <ActionBtn color={C.red} onClick={() => openReject(u)}>❌ Reject</ActionBtn>
                            </>
                          )}
                          {statusTab === "approved" && (
                            <ActionBtn color={C.purple} onClick={() => openBan(u)}>🚫 Ban</ActionBtn>
                          )}
                          {statusTab === "rejected" && (
                            <>
                              <ActionBtn color={C.green} onClick={() => approve(u)}>✅ Approve</ActionBtn>
                              <ActionBtn color={C.purple} onClick={() => openBan(u)}>🚫 Ban</ActionBtn>
                            </>
                          )}
                          {statusTab === "banned" && (
                            <ActionBtn color={C.blue} onClick={() => openUnban(u)}>🔓 Unban</ActionBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail Side Panel ── */}
      {selected && (
        <KYCDetailPanel
          C={C}
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
          <ModalBox C={C}>
            <h3 style={{ margin: "0 0 8px", color: C.text }}>Reject KYC</h3>
            <p style={{ color: C.muted, marginBottom: 12, fontSize: 13 }}>
              Rejecting: <strong style={{ color: C.text }}>{rejectTarget.email}</strong>
            </p>
            <textarea
              rows={4}
              placeholder="Enter reason for rejection (shown to user)..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, resize: "vertical", boxSizing: "border-box", background: C.inputBg, color: C.text }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <ActionBtn color={C.red} onClick={confirmReject}>Confirm Reject</ActionBtn>
              <ActionBtn color={C.muted} onClick={() => setRejectTarget(null)}>Cancel</ActionBtn>
            </div>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Ban Overlay ── */}
      {banTarget && (
        <ConfirmCodeOverlay
          C={C}
          title="Confirm User Ban"
          targetEmail={banTarget.email}
          code={confirmCode}
          typed={typedCode}
          onType={setTypedCode}
          onConfirm={confirmBan}
          onCancel={() => setBanTarget(null)}
          confirmLabel="🚫 Confirm Ban"
          confirmColor={C.red}
          warningText="This will immediately deactivate the user's account."
        />
      )}

      {/* ── Unban Overlay ── */}
      {unbanTarget && (
        <ConfirmCodeOverlay
          C={C}
          title="Confirm User Unban"
          targetEmail={unbanTarget.email}
          code={confirmCode}
          typed={typedCode}
          onType={setTypedCode}
          onConfirm={confirmUnban}
          onCancel={() => setUnbanTarget(null)}
          confirmLabel="🔓 Confirm Unban"
          confirmColor={C.green}
          warningText="This will restore the user's account access."
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ C }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 48 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.gold}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ActionBtn({ color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color, color: "#07080F", border: "none",
        padding: "5px 12px", borderRadius: 6, cursor: "pointer",
        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Overlay({ children }) {
  return (
    <div style={{
      position: "fixed", top: 0, bottom: 0, left: SIDEBAR_W, right: 0,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      {children}
    </div>
  );
}

function ModalBox({ C, children }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 28, width: 420, maxWidth: "90vw",
      boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    }}>
      {children}
    </div>
  );
}

// ── Reusable typed-code confirmation overlay ───────────────────────────────────

function ConfirmCodeOverlay({ C, title, targetEmail, code, typed, onType, onConfirm, onCancel, confirmLabel, confirmColor, warningText }) {
  return (
    <Overlay>
      <ModalBox C={C}>
        <h3 style={{ margin: "0 0 6px", color: C.text }}>{title}</h3>
        <p style={{ color: C.muted, margin: "0 0 4px", fontSize: 13 }}>
          Target: <strong style={{ color: C.text }}>{targetEmail}</strong>
        </p>
        <p style={{ color: C.red, fontSize: 12, margin: "0 0 20px" }}>⚠️ {warningText}</p>

        <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>Type this code exactly to confirm:</p>

        <div style={{
          fontSize: 30, letterSpacing: 10, fontWeight: 700,
          fontFamily: "monospace", textAlign: "center",
          padding: "14px 0", background: C.inputBg,
          borderRadius: 8, marginBottom: 16,
          color: C.text, userSelect: "none", WebkitUserSelect: "none",
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
            border: `2px solid ${typed === code ? C.green : C.border}`,
            outline: "none", boxSizing: "border-box",
            background: C.inputBg, color: C.text,
          }}
        />

        {typed.length > 0 && typed !== code && (
          <p style={{ color: C.red, fontSize: 12, marginTop: 6 }}>Code doesn't match. Keep typing.</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={onConfirm}
            disabled={typed !== code}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
              background: typed === code ? confirmColor : C.border,
              color: "#07080F", fontWeight: 700, cursor: typed === code ? "pointer" : "not-allowed",
              fontSize: 14,
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
              background: C.hoverBg, color: C.sub,
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

function KYCDetailPanel({ C, u, onClose, onApprove, onReject, onBan, onUnban }) {
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 480, maxWidth: `calc(100vw - ${SIDEBAR_W}px)`,
      background: C.surface, borderLeft: `1px solid ${C.border}`,
      boxShadow: "-4px 0 30px rgba(0,0,0,0.4)",
      zIndex: 900, overflowY: "auto", padding: 28,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, color: C.text }}>KYC Detail</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.muted }}>✕</button>
      </div>

      {/* Identity */}
      <Section C={C} title="Identity">
        <Row C={C} label="UID"       value={u.user_uid} mono />
        <Row C={C} label="Email"     value={u.email} />
        <Row C={C} label="Name"      value={u.name || "—"} />
        <Row C={C} label="Phone"     value={u.phone || "—"} />
        <Row C={C} label="Type"      value={u.kyc_type === "affiliate" ? "Affiliate" : "Player"} />
        <Row C={C} label="Full Name" value={u.full_name || "—"} />
        <Row C={C} label="DOB"       value={u.date_of_birth || "—"} />
        <Row C={C} label="Doc Type"  value={u.document_type || "—"} />
        <Row C={C} label="Doc No."   value={u.document_number || "—"} mono />
      </Section>

      {/* Network */}
      <Section C={C} title="Network & Geo">
        <Row C={C} label="IP Address" value={u.ip_address || "—"} mono />
        <Row C={C} label="ISP"        value={u.geo_isp || "—"} />
        <Row C={C} label="Country"    value={u.geo_country || "—"} />
        <Row C={C} label="Region"     value={u.geo_region || "—"} />
        <Row C={C} label="City"       value={u.geo_city || "—"} />
        {u.geo_lat && u.geo_lon && (
          <div style={{ marginTop: 6 }}>
            <a href={`https://www.google.com/maps?q=${u.geo_lat},${u.geo_lon}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.blue }}>
              📍 View on Google Maps ({u.geo_lat?.toFixed(4)}, {u.geo_lon?.toFixed(4)})
            </a>
          </div>
        )}
        <Row C={C} label="User Agent" value={u.user_agent || "—"} small />
      </Section>

      {/* Timestamps */}
      <Section C={C} title="Timestamps">
        <Row C={C} label="Joined"      value={u.date_joined ? new Date(u.date_joined).toLocaleString() : "—"} />
        <Row C={C} label="Submitted"   value={u.submitted_at ? new Date(u.submitted_at).toLocaleString() : "—"} />
        <Row C={C} label="Reviewed At" value={u.reviewed_at ? new Date(u.reviewed_at).toLocaleString() : "—"} />
        <Row C={C} label="Reviewed By" value={u.reviewed_by || "—"} />
        {u.is_banned && (
          <>
            <Row C={C} label="Banned At"  value={u.banned_at ? new Date(u.banned_at).toLocaleString() : "—"} />
            <Row C={C} label="Ban Reason" value={u.ban_reason || "—"} />
          </>
        )}
        {u.reject_reason && <Row C={C} label="Reject Reason" value={u.reject_reason} />}
      </Section>

      {/* Documents */}
      <Section C={C} title="Documents">
        <DocImage C={C} label="Front"  url={u.doc_front_url} />
        <DocImage C={C} label="Back"   url={u.doc_back_url} />
        <DocImage C={C} label="Selfie" url={u.selfie_url} />
        {u.id_proof_file_url && (
          <DocImage C={C} label={u.id_proof_type === "income_proof" ? "Income Proof" : "Address Proof"} url={u.id_proof_file_url} />
        )}
      </Section>

      {/* Actions */}
      <Section C={C} title="Actions">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!u.is_banned && u.kyc_status !== "approved" && <ActionBtn color={C.green} onClick={onApprove}>✅ Approve</ActionBtn>}
          {!u.is_banned && u.kyc_status !== "rejected" && <ActionBtn color={C.red} onClick={onReject}>❌ Reject</ActionBtn>}
          {!u.is_banned && <ActionBtn color={C.purple} onClick={onBan}>🚫 Ban User</ActionBtn>}
          {u.is_banned && <ActionBtn color={C.blue} onClick={onUnban}>🔓 Unban User</ActionBtn>}
        </div>
      </Section>
    </div>
  );
}

// ── Tiny helpers ───────────────────────────────────────────────────────────────

function Section({ C, title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ background: C.hoverBg, borderRadius: 10, padding: "12px 14px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ C, label, value, mono, small }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7, gap: 10 }}>
      <span style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap", minWidth: 90 }}>{label}</span>
      <span style={{ fontSize: small ? 10 : 12, fontFamily: mono ? "monospace" : "inherit", color: C.text, textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

function DocImage({ C, label, url }) {
  if (!url) return (
    <div style={{ marginBottom: 10, fontSize: 12, color: C.muted }}>{label}: Not uploaded</div>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <img
        src={url}
        alt={label}
        style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, maxHeight: 200, objectFit: "cover", cursor: "pointer" }}
        onClick={() => window.open(url, "_blank")}
      />
    </div>
  );
}
