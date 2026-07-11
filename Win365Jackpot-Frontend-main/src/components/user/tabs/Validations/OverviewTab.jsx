import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Gift, Wallet, Building2, Crown, ArrowDownLeft, ArrowUpRight,
  DollarSign, CreditCard, Zap, TrendingUp, ChevronRight, RefreshCw,
  Users, Activity, BarChart2, Shield, Clock, AlertCircle
} from "lucide-react";

import { C, WALLET_CFG } from "../../constants";
import { authFetch, API, fmt, fmtN, fmtD } from "../../helpers";
import { Card, Spinner } from "../../components/SharedUI";


/* ─── DESIGN TOKENS ─────────────────────────────────────────── */
const T = {
  bg:          C.bg,
  surface:     C.surface2,
  surfaceHigh: "rgba(255,255,255,0.08)",
  border:      C.border,
  borderHover: C.border2,
  text:        "#e8ecf0",
  textMuted:   "rgba(232,236,240,0.45)",
  textDim:     "rgba(232,236,240,0.25)",
  green:       C.green,
  greenMuted:  "rgba(52,211,153,0.12)",
  red:         C.red,
  redMuted:    "rgba(248,113,113,0.12)",
  blue:        C.blue,
  blueMuted:   "rgba(96,165,250,0.12)",
  amber:       C.gold,
  amberMuted:  "rgba(212,175,55,0.12)",
  purple:      C.purple,
  purpleMuted: "rgba(167,139,250,0.12)",
  teal:        C.teal,
  tealMuted:   "rgba(45,212,191,0.12)",
};

/* ─── VIP CONFIG ──────────────────────────────────────────────── */
const VIP_LEVELS = [
  { lvl: 1, i18nKey: "vip.vip",              min_pts: 0         },
  { lvl: 2, i18nKey: "vip.vipBronze",       min_pts: 5000      },
  { lvl: 3, i18nKey: "vip.silver",           min_pts: 15000     },
  { lvl: 4, i18nKey: "vip.gold",             min_pts: 30000     },
  { lvl: 5, i18nKey: "vip.jackpot1",        min_pts: 75000     },
  { lvl: 6, i18nKey: "vip.jackpot2",       min_pts: 150000    },
  { lvl: 7, i18nKey: "vip.jackpot3",      min_pts: 350000    },
  { lvl: 8, i18nKey: "vip.jackpotPlatinum", min_pts: 750000    },
  { lvl: 9, i18nKey: "vip.jackpotDiamond",  min_pts: 1500000   },
];

const LEVEL_COLORS = [
  "#9CA3AF", "#34D399", "#60A5FA", "#A78BFA",
  "#D4AF37", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6",
];

function getVipInfo(pts = 0) {
  const idx     = [...VIP_LEVELS].reduce((found, v, i) => pts >= v.min_pts ? i : found, 0);
  const current = VIP_LEVELS[idx];
  const next    = VIP_LEVELS[idx + 1] || null;
  let progress  = 100;
  if (next) {
    const range         = next.min_pts - current.min_pts;
    const earnedInRange = pts - current.min_pts;
    progress = Math.min(Math.max((earnedInRange / range) * 100, 0), 100);
  }
  return { current, next, progress, color: LEVEL_COLORS[idx] };
}

/* ─── TX TYPE CONFIG ──────────────────────────────────────────── */
const DEBIT_TYPES = new Set(["WAC", "TAC", "LAS"]);

const TX_LABEL_KEYS = {
  DAC: "dashboard.txDAC", WAC: "dashboard.txWAC", TAC: "dashboard.txTAC", LAS: "dashboard.txLAS",
  WIN: "dashboard.txWIN", LUB: "dashboard.txLUB", WBA: "dashboard.txWBA", MBA: "dashboard.txMBA",
  RMB: "dashboard.txRMB", GBE: "dashboard.txGBE", CBG: "dashboard.txCBG", CBGNC: "dashboard.txCBGNC",
  LUBNC: "dashboard.txLUBNC", CBGOT: "dashboard.txCBGOT", LUBOT: "dashboard.txLUBOT",
  ROP: "dashboard.txROP", MAN: "dashboard.txMAN",
};

/* ─── WALLET META ──────────────────────────────────────────────── */
const WALLET_ICONS = {
  cash: DollarSign, non_cash: CreditCard, otp: Zap, rolling_points: TrendingUp,
};

const WALLET_META = {
  cash:           { labelKey: "walletMeta.cashLabel",    abbr: "CASH", color: T.green,  descKey: "walletMeta.cashDesc" },
  non_cash:       { labelKey: "walletMeta.nonCashLabel", abbr: "NC",   color: T.blue,   descKey: "walletMeta.nonCashDesc" },
  otp:            { labelKey: "walletMeta.otpLabel",     abbr: "OTP",  color: T.purple, descKey: "walletMeta.otpDesc" },
  rolling_points: { labelKey: "walletMeta.rpLabel",      abbr: "RP",   color: T.amber,  descKey: "walletMeta.rpDesc" },
};

/* ─── SHARED STYLE HELPERS ─────────────────────────────────────── */
const pill = (color) => ({
  display: "inline-flex", alignItems: "center",
  padding: "2px 8px", borderRadius: 4,
  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
  background: `${color}18`, color,
  border: `1px solid ${color}30`,
});

const sectionTitle = {
  fontSize: 11, fontWeight: 700, color: T.textMuted,
  textTransform: "uppercase", letterSpacing: "0.08em",
  marginBottom: 12,
};

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT  —  MOBILE-FIRST RESPONSIVE
═══════════════════════════════════════════════════════════════ */
export default function OverviewTab({ profile, onTabChange, onToast }) {
  const { t } = useTranslation();
  const [loading,    setLoading]    = useState(true);
  const [accounts,   setAccounts]   = useState([]);
  const [levelData,  setLevelData]  = useState(null);
  const [recentTx,   setRecentTx]   = useState([]);
  const [txSummary,  setTxSummary]  = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [walletRes, levelRes, txRes, allTxRes] = await Promise.all([
        authFetch(`${API}/api/wallet/balances/`),
        authFetch(`${API}/api/level/`),
        authFetch(`${API}/api/wallet/transactions/?page_size=6`),
        authFetch(`${API}/api/wallet/transactions/?page_size=500`),
      ]);

      if (walletRes.ok) { const j = await walletRes.json(); setAccounts(j.accounts || []); }
      if (levelRes.ok)  { const j = await levelRes.json();  setLevelData(j); }
      if (txRes.ok)     { const j = await txRes.json();     setRecentTx(j.results || []); }

      if (allTxRes.ok) {
        const j = await allTxRes.json();
        const summary = {};
        (j.results || []).forEach(tx => {
          const wtype = tx.wallet_type || "cash";
          const txType = (tx.transaction_type || "").toUpperCase();
          const isDebit = DEBIT_TYPES.has(txType);
          if (!isDebit) {
            summary[wtype] = (summary[wtype] || 0) + Math.abs(Number(tx.amount));
          }
        });
        setTxSummary(summary);
      }
    } catch (e) {
      console.error("Dashboard load error:", e);
      onToast?.(t("dashboard.failedToRefresh"), "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const pts = levelData?.points || 0;
  const vip = useMemo(() => getVipInfo(pts), [pts]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <Spinner />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="overview-root"
    >
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div className="overview-topbar">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="overview-greeting">
            {t("dashboard.greeting", { name: profile?.name?.split(" ")[0] || profile?.email?.split("@")[0] || "Player" })}
          </div>
          <div className="overview-subgreeting">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
            <span style={{ opacity: 0.5 }}> · {t("dashboard.uid", { uid: profile?.user_uid || "—" })}</span>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="overview-refresh-btn"
        >
          <RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          <span>{refreshing ? t("dashboard.refreshing") : t("common.refresh")}</span>
        </button>
      </div>

      {/* ── VIP STATUS BANNER ───────────────────────────────────── */}
      <div className="vip-banner" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${vip.color}, transparent)` }} />
        <div className="vip-banner-inner">
          <div className="vip-icon-wrap" style={{ background: `${vip.color}18`, border: `1px solid ${vip.color}40` }}>
            <Crown size={22} color={vip.color} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="vip-info-row">
              <span className="vip-label" style={{ color: T.text }}>{t(vip.current.i18nKey)}</span>

              {vip.next ? (
                <span className="vip-next" style={{ color: T.textMuted }}>
                  {t("dashboard.ptsTo", { points: (vip.next.min_pts - pts).toLocaleString("en-IN"), level: t(vip.next.i18nKey) })}
                </span>
              ) : (
                <span style={pill(vip.color)}>{t("dashboard.maxRank")}</span>
              )}
            </div>
            <div style={{
              marginTop: 8, height: 5, borderRadius: 3,
              background: "rgba(255,255,255,0.05)", overflow: "hidden",
            }}>
              <div style={{
                width: `${vip.progress}%`, height: "100%",
                background: vip.color, transition: "width 0.4s",
              }} />
            </div>
          </div>

          <div className="vip-points">
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t("wallet.filterRollingPoints")}
            </div>
            <div style={{ fontSize: "clamp(18px, 4vw, 22px)", fontWeight: 700, color: T.text, marginTop: 2 }}>
              {pts.toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      </div>

      {/* ── WALLET CARDS ───────────────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
        <h3 style={sectionTitle}>{t("dashboard.walletBalances")}</h3>
        <div className="wallet-grid">
          {accounts.map(w => {
            const meta = WALLET_META[w.wallet_type] || { labelKey: null, abbr: "?", color: "#888", descKey: null };
            const metaLabel = meta.labelKey ? t(meta.labelKey) : w.wallet_type;
            const Icon = WALLET_ICONS[w.wallet_type] || DollarSign;
            const isRP = w.wallet_type === "rolling_points";
            return (
              <div
                key={w.wallet_type}
                className="wallet-card"
                style={{ background: T.surface, border: `1px solid ${T.border}` }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.borderHover}
                onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: `${meta.color}18`, border: `1px solid ${meta.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={16} color={meta.color} />
                  </div>
                  <span style={pill(meta.color)}>{meta.abbr}</span>
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>{metaLabel}</div>
                <div style={{ fontSize: "clamp(18px, 4.5vw, 22px)", fontWeight: 700, color: T.text, wordBreak: "break-all" }}>
                  {isRP
                    ? `${Number(w.balance).toLocaleString("en-IN")} RP`
                    : fmt(w.balance)
                  }
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("dashboard.totalCreditedLifetime")}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginTop: 2, wordBreak: "break-all" }}>
                    {isRP
                      ? `${(txSummary[w.wallet_type] || 0).toLocaleString("en-IN")} RP`
                      : fmt(txSummary[w.wallet_type] || 0)
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BOTTOM GRID: Recent Activity + Account Summary ────────── */}
      <div className="bottom-grid">
        {/* Recent Activity */}
        <div className="panel" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={14} color={T.blue} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{t("dashboard.recentActivity")}</span>
            </div>
            <button
              onClick={() => onTabChange("wallet")}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "transparent", border: "none",
                fontSize: 12, fontWeight: 600, color: T.blue, cursor: "pointer", padding: 4,
              }}
            >
              {t("dashboard.viewAll")} <ChevronRight size={12} />
            </button>
          </div>

          <div>
            {recentTx.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <AlertCircle size={24} color={T.textDim} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: T.textMuted }}>{t("dashboard.noTransactionsYet")}</div>
              </div>
            ) : recentTx.map((tx, i) => {
              const txType = (tx.transaction_type || "").toUpperCase();
              const isDr   = DEBIT_TYPES.has(txType);
              const color  = isDr ? T.red : T.green;
              const wMeta  = WALLET_META[tx.wallet_type] || { abbr: tx.wallet_type, color: "#888" };
              const label  = TX_LABEL_KEYS[txType] ? t(TX_LABEL_KEYS[txType]) : txType;
              const isRP   = tx.wallet_type === "rolling_points";

              return (
                <div
                  key={i}
                  className="tx-row"
                  onMouseEnter={e => e.currentTarget.style.background = T.surfaceHigh}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                    background: isDr ? T.redMuted : T.greenMuted,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isDr
                      ? <ArrowUpRight size={14} color={color} />
                      : <ArrowDownLeft size={14} color={color} />
                    }
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      <span style={pill(wMeta.color)}>{wMeta.abbr}</span>
                      <span style={{ fontSize: 11, color: T.textMuted, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Clock size={10} />
                        {fmtD(tx.created_at)}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color, whiteSpace: "nowrap" }}>
                      {isRP
                        ? Math.abs(Number(tx.amount)).toLocaleString("en-IN")
                        : `${isDr ? "−" : "+"}${fmt(Math.abs(Number(tx.amount)))}`
                      }
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, marginTop: 2 }}>
                      {isDr ? "DR" : "CR"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Account Summary */}
        <div className="panel" style={{ background: T.surface, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Lifetime Credits */}
          <div>
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <BarChart2 size={14} color={T.amber} />
    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{t("dashboard.rollingPointsProgress")}</span>
  </div>

  {/* RP Progress only */}
  {accounts.filter(w => w.wallet_type === "rolling_points").map(w => {
    const total = txSummary[w.wallet_type] || 0;
    const maxW  = Math.max(total, 1);
    const barW  = 100; // RP is always full — it's cumulative lifetime

    return (
      <div key={w.wallet_type} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: T.textMuted }}>{t("dashboard.lifetimeRollingPoints")}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>
            {total.toLocaleString("en-IN")} RP
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ width: `${barW}%`, height: "100%", background: T.amber, transition: "width 0.4s" }} />
        </div>
      </div>
    );
  })}

  {/* Weekly & Monthly Bonus — no progress bar, just display */}
  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
    {[
      { label: t("dashboard.weeklyBonus"),  key: "non_cash", icon: "📅" },
      { label: t("dashboard.monthlyBonus"), key: "non_cash",  icon: "🗓️" },
    ].map(({ label, icon }) => (
      <div key={label} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {icon} {label}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
          {/* Added by team */}
        </span>
      </div>
    ))}
  </div>
</div>

          {/* Account Overview */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Shield size={14} color={T.purple} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{t("wallet.accountOverview")}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { icon: Gift,       label: t("dashboard.totalBonusesEarned"), value: fmt(profile?.total_bonus_earned || 0), color: T.purple },
                { icon: Building2,  label: t("dashboard.casinosExplored"),     value: fmtN(profile?.casinos_visited  || 0),  color: T.blue   },
                { icon: Users,      label: t("dashboard.referralNetwork"),     value: fmtN(profile?.referral_count   || 0),  color: T.teal   },
                { icon: DollarSign, label: t("dashboard.partnerEarnings"),     value: fmt(profile?.referral_earnings || 0),  color: T.green  },
              ].map(({ icon: Icon, label, value, color }) => (
                <div
                  key={label}
                  className="overview-stat-row"
                  onMouseEnter={e => e.currentTarget.style.background = T.surfaceHigh}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", flexShrink: 0 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Member since / Status */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 12,
            paddingTop: 14, borderTop: `1px solid ${T.border}`,
          }}>
            <div style={{ flex: "1 1 120px" }}>
              <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("profile.memberSince")}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginTop: 2 }}>
                {profile?.date_joined
                  ? new Date(profile.date_joined).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                  : "—"}
              </div>
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("dashboard.status")}</div>
              <span style={{ ...pill(T.green), marginTop: 4 }}>{t("dashboard.active")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RESPONSIVE STYLES (mobile-first) ─────────────────────── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* ─── BASE: MOBILE FIRST (< 480px) ─── */
        .overview-root {
          padding: 12px;
          color: ${T.text};
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }

        .overview-topbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .overview-greeting {
          font-size: clamp(18px, 5vw, 22px);
          font-weight: 700;
          color: ${T.text};
          line-height: 1.2;
        }
        .overview-subgreeting {
          font-size: 12px;
          color: ${T.textMuted};
          margin-top: 4px;
          word-break: break-word;
        }
        .overview-refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          background: transparent;
          border: 1px solid ${T.border};
          color: ${T.textMuted};
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .overview-refresh-btn:hover:not(:disabled) {
          border-color: ${T.borderHover};
          color: ${T.text};
        }

        /* VIP banner — stacks on mobile */
        .vip-banner {
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .vip-banner-inner {
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .vip-icon-wrap {
          width: 44px; height: 44px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .vip-info-row {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .vip-label {
          font-size: clamp(14px, 3.8vw, 16px);
          font-weight: 700;
        }
        .vip-next {
          font-size: 11px;
        }
        .vip-points {
          text-align: right;
          flex-shrink: 0;
          margin-left: auto;
        }

        /* Wallet grid — 1 col on tiny, 2 on small, 4 on desktop */
        .wallet-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }
        .wallet-card {
          padding: 14px;
          border-radius: 8px;
          transition: border-color 0.15s;
          min-width: 0;
        }

        /* Bottom grid — stacks on mobile, 2-col on desktop */
        .bottom-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .panel {
          padding: 16px;
          border-radius: 10px;
          min-width: 0;
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tx-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 8px;
          border-radius: 6px;
          transition: background 0.12s;
          min-width: 0;
        }
        .overview-stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 6px;
          transition: background 0.12s;
        }

        /* ─── SMALL TABLET (≥ 600px) ─── */
        @media (min-width: 600px) {
          .overview-root { padding: 18px; }
          .wallet-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
        }

        /* ─── TABLET (≥ 820px) ─── */
        @media (min-width: 820px) {
          .overview-root { padding: 22px; }
          .wallet-grid { grid-template-columns: repeat(4, 1fr); }
          .bottom-grid {
            grid-template-columns: 1.4fr 1fr;
            gap: 20px;
          }
          .panel { padding: 20px; }
        }

        /* ─── DESKTOP (≥ 1100px) ─── */
        @media (min-width: 1100px) {
          .overview-root { padding: 28px; }
          .bottom-grid { grid-template-columns: 1.5fr 1fr; gap: 24px; }
        }

        /* ─── EXTRA SMALL: tighten down further ─── */
        @media (max-width: 360px) {
          .wallet-grid { grid-template-columns: 1fr; }
          .vip-points { text-align: left; margin-left: 0; }
        }
      `}</style>
    </motion.div>
  );
}
