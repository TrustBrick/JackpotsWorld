import React, { useEffect, useState, useCallback } from "react";
import { adminFetch, API, fmt } from "../helpers";
import {
  Search, RefreshCw, ChevronDown, ChevronUp,
  User, Shield, X, Activity,
} from "lucide-react";

/* ─── Action metadata ─────────────────────────────────────────────────────── */
const ACTION_META = {
  // User actions
  login:              { label: "Login",            color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  logout:             { label: "Logout",           color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  register:           { label: "Register",         color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  password_change:    { label: "Password Changed", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  otp_sent:           { label: "OTP Sent",         color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  otp_verified:       { label: "OTP Verified",     color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  profile_updated:    { label: "Profile Updated",  color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  avatar_changed:     { label: "Avatar Changed",   color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  kyc_submitted:      { label: "KYC Submitted",    color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  // Admin actions
  wallet_credit:      { label: "Wallet Credit",    color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  wallet_debit:       { label: "Wallet Debit",     color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  wallet_adjusted:    { label: "Wallet Adjusted",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  deposit_created:    { label: "Deposit",          color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  withdrawal_created: { label: "Withdrawal",       color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  casino_visit_recorded:{ label: "Casino Visit",   color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  bonus_added:        { label: "Bonus Added",      color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  reward_created:     { label: "Reward Created",   color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  reward_claimed:     { label: "Reward Claimed",   color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  vip_upgraded:       { label: "VIP Upgraded",     color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  vip_downgraded:     { label: "VIP Downgraded",   color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  kyc_approved:       { label: "KYC Approved",     color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  kyc_rejected:       { label: "KYC Rejected",     color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  user_banned:        { label: "User Banned",      color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  user_unbanned:      { label: "User Unbanned",    color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  admin_login:        { label: "Admin Login",      color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  staff_created:      { label: "Staff Created",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  rolling_points_added:{ label: "RP Added",        color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
};

function getActionMeta(action) {
  return ACTION_META[action] || { label: action, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };
}

function fmtDT(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const S = {
  // Layout
  root: {
    fontFamily: "'Space Grotesk', sans-serif",
    color: "rgba(255,255,255,0.85)",
    minHeight: "100vh",
  },

  // Tab bar
  tabBar: {
    display: "flex", gap: 2, marginBottom: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: 4, width: "fit-content",
  },
  tabBtn: (active, color) => ({
    display: "flex", alignItems: "center", gap: 7,
    padding: "8px 18px", borderRadius: 7, border: "none",
    background: active ? (color + "18") : "transparent",
    color: active ? color : "rgba(255,255,255,0.4)",
    cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400,
    transition: "all 0.15s",
    outline: active ? `1px solid ${color}30` : "none",
  }),

  // Toolbar
  toolbar: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 16, flexWrap: "wrap",
  },
  searchWrap: {
    position: "relative", flex: 1, minWidth: 200, maxWidth: 340,
  },
  searchInput: {
    width: "100%", padding: "9px 12px 9px 36px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "white", fontSize: 12,
    outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  },
  searchIcon: {
    position: "absolute", left: 11, top: "50%",
    transform: "translateY(-50%)",
    color: "rgba(255,255,255,0.3)", pointerEvents: "none",
  },
  refreshBtn: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "9px 14px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.6)", cursor: "pointer",
    fontSize: 12, fontFamily: "inherit",
  },
  countBadge: {
    marginLeft: "auto", fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "5px 12px", borderRadius: 6,
  },

  // Table card
  tableCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    padding: "11px 14px", textAlign: "left",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
    background: "rgba(255,255,255,0.025)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    fontFamily: "inherit",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    verticalAlign: "middle",
  },

  // Pagination
  pagination: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    fontSize: 11, color: "rgba(255,255,255,0.4)",
  },
  pgBtn: (disabled) => ({
    padding: "6px 14px", borderRadius: 6, fontSize: 11,
    background: disabled ? "transparent" : "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  }),

  // Modal
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    width: 520, maxWidth: "95vw", maxHeight: "85vh",
    background: "#0d1117",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14, overflow: "hidden",
    display: "flex", flexDirection: "column",
    fontFamily: "'Space Grotesk', sans-serif",
  },
  modalHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "rgba(255,255,255,0.02)",
  },
  modalBody: { padding: 20, overflowY: "auto", flex: 1 },
  modalField: {
    display: "flex", flexDirection: "column", gap: 3, marginBottom: 14,
  },
  modalLabel: {
    fontSize: 9, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)",
  },
  modalValue: {
    fontSize: 12, color: "rgba(255,255,255,0.85)",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 6, padding: "8px 10px",
    wordBreak: "break-all",
  },
  divider: {
    height: 1, background: "rgba(255,255,255,0.07)", margin: "16px 0",
  },
};

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function ActionBadge({ action }) {
  const meta = getActionMeta(action);
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 9px", borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.03em",
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.color}30`,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function ModalField({ label, value, mono, color }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={S.modalField}>
      <div style={S.modalLabel}>{label}</div>
      <div style={{
        ...S.modalValue,
        fontFamily: mono ? "inherit" : "system-ui",
        color: color || "rgba(255,255,255,0.85)",
      }}>
        {String(value)}
      </div>
    </div>
  );
}

function LogModal({ log, onClose }) {
  if (!log) return null;
  const meta = getActionMeta(log.action);
  const isFinancial = log.amount || log.before_balance !== null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: meta.color, flexShrink: 0,
            }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Log Details</span>
            <ActionBadge action={log.action} />
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none",
              color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={S.modalBody}>

          {/* Core */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ModalField label="Log ID"    value={log.id}         mono />
            <ModalField label="Timestamp" value={fmtDT(log.created_at)} />
          </div>

          {log.description && (
            <ModalField label="Description" value={log.description} />
          )}

          <div style={S.divider} />

          {/* Users */}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
            Parties
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ModalField label="Target User"  value={log.target_user_email} />
            <ModalField label="User UID"     value={log.target_user_uid}   mono />
            <ModalField label="Actor (Admin/System)" value={log.actor_email} />
            <ModalField label="Actor UID"    value={log.actor_uid}         mono />
          </div>

          {log.ip_address && (
            <ModalField label="IP Address" value={log.ip_address} mono />
          )}

          {/* Financial */}
          {isFinancial && (
            <>
              <div style={S.divider} />
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
                Financial
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {log.amount && (
                  <ModalField
                    label={`Amount (${log.cr_dr || "—"})`}
                    value={`$${Number(log.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                    color={log.cr_dr === "CR" ? "#34d399" : "#f87171"}
                    mono
                  />
                )}
                <ModalField label="Wallet Type"     value={log.wallet_type} />
                <ModalField label="Casino"          value={log.casino_name} />
                <ModalField label="Balance Before"  value={log.before_balance != null ? `$${Number(log.before_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : null} mono />
                <ModalField label="Balance After"   value={log.after_balance  != null ? `$${Number(log.after_balance).toLocaleString("en-IN",  { minimumFractionDigits: 2 })}` : null}  mono />
              </div>
            </>
          )}

          {/* Reference */}
          {log.reference_id && (
            <>
              <div style={S.divider} />
              <ModalField label="Reference ID" value={log.reference_id} mono />
            </>
          )}

          {/* Meta */}
          {log.meta && Object.keys(log.meta).length > 0 && (
            <>
              <div style={S.divider} />
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
                Meta
              </div>
              <div style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 8,
                padding: "12px", fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {JSON.stringify(log.meta, null, 2)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════════════════════════ */
const PAGE_SIZE = 50;

export default function LogsTab({ onToast }) {
  const [activeTab, setActiveTab]   = useState("user");   // "user" | "admin"
  const [logs,      setLogs]        = useState([]);
  const [total,     setTotal]       = useState(0);
  const [loading,   setLoading]     = useState(true);
  const [refreshing,setRefreshing]  = useState(false);
  const [page,      setPage]        = useState(1);
  const [search,    setSearch]      = useState("");
  const [searchVal, setSearchVal]   = useState("");
  const [selected,  setSelected]    = useState(null);
  const [expanded,  setExpanded]    = useState(null);

  const load = useCallback(async (pg = 1, q = search, tab = activeTab, silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const params = new URLSearchParams({
        type: tab, page: pg, page_size: PAGE_SIZE,
      });
      if (q) params.set("q", q);

      const res  = await adminFetch(`${API}/api/admin-panel/activity-logs/?${params}`);
      const data = await res.json();
      setLogs(data.results  || []);
      setTotal(data.count   || 0);
      setPage(pg);
    } catch {
      onToast?.("Failed to load logs", false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, activeTab, onToast]);

  useEffect(() => { load(1, "", activeTab); setSearch(""); setSearchVal(""); setPage(1); }, [activeTab]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchVal);
    load(1, searchVal, activeTab);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const TABS = [
    { key: "user",  label: "User Logs",  Icon: User,   color: "#60a5fa" },
    { key: "admin", label: "Admin Logs", Icon: Shield, color: "#f59e0b" },
  ];

  return (
    <div style={S.root}>

      {/* ── Tab Bar ── */}
      <div style={S.tabBar}>
        {TABS.map(({ key, label, Icon, color }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={S.tabBtn(activeTab === key, color)}
          >
            <Icon size={13} />
            {label}
            {activeTab === key && total > 0 && (
              <span style={{
                background: color + "25", color,
                fontSize: 10, fontWeight: 700,
                padding: "1px 7px", borderRadius: 20,
                border: `1px solid ${color}30`,
              }}>
                {total.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={S.toolbar}>
        <form onSubmit={handleSearch} style={S.searchWrap}>
          <Search size={13} style={S.searchIcon} />
          <input
            style={S.searchInput}
            placeholder="Search email, action, description…"
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
          />
        </form>

        <button
          onClick={() => load(page, search, activeTab, true)}
          disabled={refreshing}
          style={S.refreshBtn}
        >
          <RefreshCw size={12} style={{ animation: refreshing ? "spin 0.7s linear infinite" : "none" }} />
          Refresh
        </button>

        <div style={S.countBadge}>
          {total.toLocaleString()} entries
        </div>
      </div>

      {/* ── Table ── */}
      <div style={S.tableCard}>
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            Loading logs…
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {["Timestamp", "Action", activeTab === "user" ? "User" : "Target User", activeTab === "admin" ? "Actor" : "IP", "Amount", "Details"].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "48px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                      <Activity size={24} style={{ display: "block", margin: "0 auto 8px", opacity: 0.3 }} />
                      No logs found
                    </td>
                  </tr>
                ) : logs.map((log, i) => {
                  const isFinancial = !!log.amount;
                  const isOpen      = expanded === log.id;
                  const rowBg       = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)";

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        style={{ background: rowBg, cursor: "pointer" }}
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                      >
                        {/* Timestamp */}
                        <td style={{ ...S.td, whiteSpace: "nowrap", color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
                          {fmtDT(log.created_at)}
                        </td>

                        {/* Action */}
                        <td style={S.td}>
                          <ActionBadge action={log.action} />
                        </td>

                        {/* Target User */}
                        <td style={S.td}>
                          <div style={{ fontSize: 12, color: "white", fontWeight: 500 }}>
                            {log.target_user_email || "—"}
                          </div>
                          {log.target_user_uid && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                              {log.target_user_uid}
                            </div>
                          )}
                        </td>

                        {/* Actor / IP */}
                        <td style={{ ...S.td, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {activeTab === "admin"
                            ? (log.actor_email || "System")
                            : (log.ip_address  || "—")}
                        </td>

                        {/* Amount */}
                        <td style={S.td}>
                          {isFinancial ? (
                            <div>
                              <span style={{
                                fontWeight: 700, fontSize: 12,
                                color: log.cr_dr === "CR" ? "#34d399" : "#f87171",
                              }}>
                                {log.cr_dr === "CR" ? "+" : "−"}
                                ${Number(log.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              {log.wallet_type && (
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2, textTransform: "uppercase" }}>
                                  {log.wallet_type}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
                          )}
                        </td>

                        {/* Expand toggle + view button */}
                        <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={e => { e.stopPropagation(); setSelected(log); }}
                              style={{
                                padding: "4px 10px", borderRadius: 6, fontSize: 10,
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "rgba(255,255,255,0.7)", cursor: "pointer",
                                fontFamily: "inherit", fontWeight: 600,
                              }}
                            >
                              View
                            </button>
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>
                              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Inline expand row */}
                      {isOpen && (
                        <tr style={{ background: "rgba(255,255,255,0.015)" }}>
                          <td colSpan={6} style={{ padding: "12px 16px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                              {log.description && (
                                <div style={{ gridColumn: "span 2" }}>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Description</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{log.description}</div>
                                </div>
                              )}
                              {log.casino_name && (
                                <div>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Casino</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{log.casino_name}</div>
                                </div>
                              )}
                              {log.before_balance != null && (
                                <div>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Before → After</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                                    ${Number(log.before_balance).toLocaleString("en-IN")} → ${Number(log.after_balance).toLocaleString("en-IN")}
                                  </div>
                                </div>
                              )}
                              {log.actor_email && (
                                <div>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Actor</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{log.actor_email}</div>
                                </div>
                              )}
                              {log.ip_address && (
                                <div>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>IP Address</div>
                                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.7)" }}>{log.ip_address}</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={S.pagination}>
            <span>
              Page {page} of {totalPages} · {total.toLocaleString()} total
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                disabled={page <= 1}
                onClick={() => { load(page - 1, search, activeTab); }}
                style={S.pgBtn(page <= 1)}
              >
                ← Prev
              </button>
              {/* Page numbers — show up to 5 */}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                if (pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => load(pg, search, activeTab)}
                    style={{
                      ...S.pgBtn(false),
                      background: pg === page ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
                      color: pg === page ? "#60a5fa" : "rgba(255,255,255,0.5)",
                      border: pg === page ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(255,255,255,0.08)",
                      minWidth: 34, textAlign: "center",
                    }}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => load(page + 1, search, activeTab)}
                style={S.pgBtn(page >= totalPages)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <LogModal log={selected} onClose={() => setSelected(null)} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}