import React, { useState, useEffect, useCallback } from "react";
import {
  Users, TrendingUp, Gift, Clock, Activity, Building2,
  AlertCircle, RefreshCw, DollarSign, CreditCard, Zap,
  ArrowDownLeft, ArrowUpRight, Shield, UserCheck, UserX,
  BarChart2, Wallet, Star, Hash,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, Spinner } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtN } from "../helpers";
import { VIP_COLOR } from "../constants";
import { useAdminTheme } from "../context/AdminThemeContext";

/* ─── DESIGN TOKENS ──────────────────────────────────────────── */
// This tab uses its own accent palette (T) layered on top of the shared
// admin theme tokens (C) — neutrals (surface/border/text/muted/dim) are
// derived from C so they flip correctly between dark/light, while the
// semantic accent colors (green/red/blue/amber/purple/teal/orange) stay
// fixed, same as VIP_COLOR / WALLET_CFG accents elsewhere in the admin panel.
function buildT(C) {
  return {
    surface:     C.surface,
    surfaceHigh: C.hoverBg,
    border:      C.border,
    borderHover: C.border2,
    text:        C.text,
    textMuted:   C.sub,
    textDim:     C.muted,
    green:  "#1db96a", greenMuted:  "rgba(29,185,106,0.12)",
    red:    "#e5534b", redMuted:    "rgba(229,83,75,0.12)",
    blue:   "#388bfd", blueMuted:   "rgba(56,139,253,0.12)",
    amber:  "#d29922", amberMuted:  "rgba(210,153,34,0.12)",
    purple: "#8957e5", purpleMuted: "rgba(137,87,229,0.12)",
    teal:   "#2ea8a8", tealMuted:   "rgba(46,168,168,0.12)",
    orange: "#db6d28", orangeMuted: "rgba(219,109,40,0.12)",
  };
}

/* ─── VIP CONFIG ──────────────────────────────────────────────── */
const VIP_META = [
  { lvl: 1, label: "Bronze"   },
  { lvl: 2, label: "Silver"   },
  { lvl: 3, label: "Gold"     },
  { lvl: 4, label: "Jack I"   },
  { lvl: 5, label: "Jack II"  },
  { lvl: 6, label: "Jack III" },
  { lvl: 7, label: "Platinum" },
  { lvl: 8, label: "Diamond"  },
];
const VIP_COLORS = [
  "#cd7f32","#94a3b8","#f5c842","#a78bfa",
  "#34d399","#f472b6","#22d3ee","#6366f1",
];

/* ─── HELPERS ─────────────────────────────────────────────────── */
const pill = (color, text) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    padding: "2px 7px", borderRadius: 4,
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    background: `${color}18`, color,
    border: `1px solid ${color}28`,
  }}>{text}</span>
);

const sectionLabel = (text, T) => (
  <div style={{
    fontSize: 10, fontWeight: 700, color: T.textDim,
    textTransform: "uppercase", letterSpacing: "0.09em",
    marginBottom: 10,
  }}>{text}</div>
);

/* ─── STAT CARD ───────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color, format = "number" }) {
  const { C } = useAdminTheme();
  const T = buildT(C);
  const display = format === "currency" ? fmt(value) : fmtN(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: "16px", borderRadius: 8,
        background: T.surface,
        border: `1px solid ${T.border}`,
        transition: "border-color 0.15s",
      }}
      whileHover={{ borderColor: T.borderHover }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 7,
          background: `${color}15`, border: `1px solid ${color}25`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={14} style={{ color }} />
        </div>
        {sub !== undefined && (
          <span style={{ fontSize: 10, color: T.textMuted }}>{sub}</span>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: "monospace", lineHeight: 1 }}>
        {display}
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>{label}</div>
    </motion.div>
  );
}

/* ─── SECTION WRAPPER ─────────────────────────────────────────── */
function Section({ title, icon: Icon, children, style = {} }) {
  const { C } = useAdminTheme();
  const T = buildT(C);
  return (
    <div style={{
      background: T.surface, borderRadius: 8,
      border: `1px solid ${T.border}`,
      overflow: "hidden", ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "13px 18px", borderBottom: `1px solid ${T.border}`,
      }}>
        <Icon size={13} style={{ color: T.textMuted }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{title}</span>
      </div>
      <div style={{ padding: "14px 18px" }}>{children}</div>
    </div>
  );
}

/* ─── FINANCE ROW ─────────────────────────────────────────────── */
function FinRow({ label, value, color, icon: Icon, format = "currency" }) {
  const { C } = useAdminTheme();
  const T = buildT(C);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 0",
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 5,
          background: `${color}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={11} style={{ color }} />
        </div>
        <span style={{ fontSize: 12, color: T.textMuted }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>
        {format === "currency" ? fmt(value) : fmtN(value)}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function AdminOverviewTab({ onToast }) {
  const { C } = useAdminTheme();
  const T = buildT(C);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err,        setErr]        = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else        setLoading(true);
    setErr(false);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/stats/`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      setStats(j);
    } catch {
      setErr(true);
      onToast?.("Failed to load stats", false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
      <Spinner />
    </div>
  );

  if (err) return (
    <div style={{ padding: 60, textAlign: "center", color: T.red }}>
      <AlertCircle size={32} style={{ marginBottom: 12, opacity: 0.6 }} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>Could not load dashboard stats</div>
      <button
        onClick={() => load()}
        style={{
          marginTop: 16, padding: "8px 18px", borderRadius: 6, fontSize: 12,
          background: T.blueMuted, border: `1px solid ${T.blue}40`,
          color: T.blue, cursor: "pointer", fontWeight: 600,
        }}
      >
        Retry
      </button>
    </div>
  );

  const {
    users = {}, finance = {}, wallet_balances = {},
    transactions = {}, vip_distribution = {}, casinos = {},
  } = stats;

  // VIP totals for bar chart
  const maxVip = Math.max(...Object.values(vip_distribution), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Admin Dashboard</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: "transparent", border: `1px solid ${T.border}`,
            color: T.textMuted, cursor: "pointer",
          }}
        >
          <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* ── ROW 1: USER STATS ────────────────────────────────────── */}
      {sectionLabel("User Accounts", T)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        <StatCard label="Total Users"     value={users.total}        icon={Users}     color={T.blue}   />
        <StatCard label="Active Now"      value={users.active_now}   icon={Activity}  color={T.green}  sub="within 1hr" />
        <StatCard label="New (7 days)"    value={users.new_7d}       icon={TrendingUp} color={T.teal}  />
        <StatCard label="New (30 days)"   value={users.new_30d}      icon={TrendingUp} color={T.teal}  />
        <StatCard label="KYC Pending"     value={users.pending_kyc}  icon={Clock}     color={T.amber}  />
        <StatCard label="KYC Verified"    value={users.verified_kyc} icon={UserCheck} color={T.green}  />
        <StatCard label="Banned"          value={users.banned}       icon={UserX}     color={T.red}    />
      </div>

      {/* ── ROW 2: FINANCE + WALLET BALANCES ─────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* Finance flows */}
        <Section title="Money Flows (All Time)" icon={BarChart2}>
          <FinRow label="Total Deposited"    value={finance.total_deposited}   color={T.green}  icon={ArrowDownLeft} />
          <FinRow label="Total Winnings"     value={finance.total_won}         color={T.green}  icon={ArrowDownLeft} />
          <FinRow label="Total Withdrawn"    value={finance.total_withdrawn}   color={T.red}    icon={ArrowUpRight}  />
          <FinRow label="Total Lost at Casino" value={finance.total_lost}      color={T.orange} icon={ArrowUpRight}  />
          <FinRow label="Total Transferred"  value={finance.total_transferred} color={T.purple} icon={ArrowUpRight}  />
          <div style={{ marginTop: 2 }} />
          <FinRow label="Bonuses Issued"     value={finance.total_bonus}       color={T.blue}   icon={Gift}          />
          <FinRow label="OTP Issued"         value={finance.total_otp}         color={T.purple} icon={Zap}           />
          <FinRow label="Rolling Points"     value={finance.total_rolling_pts} color={T.amber}  icon={Star} format="number" />
        </Section>

        {/* Current wallet balances */}
        <Section title="Current Wallet Balances (All Users)" icon={Wallet}>
          {[
            { label: "Cash Wallet",    value: wallet_balances.cash,           color: T.green,  icon: DollarSign },
            { label: "Non-Cash (NC)",  value: wallet_balances.non_cash,       color: T.blue,   icon: CreditCard },
            { label: "OTP Credits",    value: wallet_balances.otp,            color: T.purple, icon: Zap        },
            { label: "Rolling Points", value: wallet_balances.rolling_points, color: T.amber,  icon: Star, format: "number" },
          ].map(({ label, value, color, icon: Icon, format }) => (
            <div
              key={label}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 14px", borderRadius: 7, marginBottom: 8,
                background: `${color}08`, border: `1px solid ${color}20`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon size={13} style={{ color }} />
                <span style={{ fontSize: 12, color: T.textMuted }}>{label}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "monospace" }}>
                {format === "number" ? fmtN(value) : fmt(value)}
              </span>
            </div>
          ))}
          <div style={{
            marginTop: 4, padding: "10px 14px", borderRadius: 7,
            background: T.surfaceHigh, border: `1px solid ${T.border}`,
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 11, color: T.textMuted }}>Total Cash + NC + OTP</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>
              {fmt((wallet_balances.cash || 0) + (wallet_balances.non_cash || 0) + (wallet_balances.otp || 0))}
            </span>
          </div>
        </Section>

        {/* Transaction counters */}
        <Section title="Transaction Activity" icon={Activity}>
          {[
            { label: "Total Transactions",    value: transactions.total,    color: T.blue   },
            { label: "Today",                 value: transactions.today,    color: T.green  },
            { label: "Last 30 Days",          value: transactions.last_30d, color: T.teal   },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Hash size={11} style={{ color }} />
                <span style={{ fontSize: 12, color: T.textMuted }}>{label}</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "monospace" }}>
                {fmtN(value)}
              </span>
            </div>
          ))}

          <div style={{ marginTop: 16 }}>
            {sectionLabel("Quick Stats", T)}
            {[
              { label: "Unique Casinos",    value: fmtN(casinos.unique_casinos),  color: T.teal   },
              { label: "Total Casino Visits", value: fmtN(casinos.total_visits),  color: T.blue   },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: `1px solid ${T.border}`,
              }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── ROW 3: VIP DISTRIBUTION + CASINO BREAKDOWN ───────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* VIP distribution */}
        <Section title="VIP Level Distribution" icon={Shield}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {VIP_META.map(({ lvl, label }) => {
              const count = vip_distribution[`vip_${lvl}`] || 0;
              const color = VIP_COLORS[lvl - 1];
              const pct   = Math.min((count / maxVip) * 100, 100);
              const total = users.total || 1;
              const share = ((count / total) * 100).toFixed(1);

              return (
                <div key={lvl}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {pill(color, `VIP ${lvl}`)}
                      <span style={{ fontSize: 11, color: T.textMuted }}>{label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 10, color: T.textDim }}>{share}%</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace", minWidth: 30, textAlign: "right" }}>
                        {fmtN(count)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: C.hoverBg, overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: lvl * 0.05 }}
                      style={{ height: "100%", background: color, borderRadius: 2 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Casino breakdown */}
        <Section title="Top Casinos by Deposit Volume" icon={Building2}>
          {(casinos.breakdown || []).length === 0 ? (
            <div style={{ textAlign: "center", color: T.textDim, fontSize: 12, padding: "20px 0" }}>
              No casino data yet
            </div>
          ) : (
            <div>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 60px 100px",
                fontSize: 9, fontWeight: 700, color: T.textDim,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 8, paddingBottom: 6,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <span>Casino</span>
                <span style={{ textAlign: "center" }}>Visits</span>
                <span style={{ textAlign: "right" }}>Total Deposits</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {(casinos.breakdown || []).map((c, i) => (
                  <div
                    key={c.name}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 60px 100px",
                      alignItems: "center",
                      padding: "8px 6px", borderRadius: 5,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surfaceHigh}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        background: `${T.blue}15`,
                        fontSize: 9, fontWeight: 800, color: T.blue,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: 12, color: T.textMuted, textAlign: "center", fontFamily: "monospace" }}>
                      {fmtN(c.visits)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.green, textAlign: "right", fontFamily: "monospace" }}>
                      {fmt(c.total_dep)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}