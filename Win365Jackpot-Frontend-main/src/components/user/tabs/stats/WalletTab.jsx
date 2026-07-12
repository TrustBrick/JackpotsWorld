import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  DollarSign, CreditCard, Zap, TrendingUp, RefreshCw,
  ShieldCheck, TrendingDown, Users, Award,
} from "lucide-react";

import { C, WALLET_CFG } from "../../constants";
import { authFetch, API, fmt, fmtDT } from "../../helpers";
import { Card, Spinner, Pagination } from "../../components/SharedUI";

/* ─── CONSTANTS (outside components — defined once) ─────── */
const TX_PAGE_SIZE = 10;

// i18nKey maps onto the existing vip.* keys already used by Sidebar.jsx —
// translated at render time (t() isn't available at module scope).
const VIP_LEVELS = [
  {  i18nKey: "vip.vip",             min_pts: 0 },
  {  i18nKey: "vip.vipBronze",      min_pts: 5000 },
  {  i18nKey: "vip.silver",          min_pts: 15000 },
  { i18nKey: "vip.gold",            min_pts: 30000 },
  {  i18nKey: "vip.jackpot1",       min_pts: 75000 },
  {  i18nKey: "vip.jackpot2",      min_pts: 150000 },
  {  i18nKey: "vip.jackpot3",     min_pts: 350000 },
  {  i18nKey: "vip.jackpotPlatinum",min_pts: 750000 },
  {  i18nKey: "vip.jackpotDiamond", min_pts: 1500000 },
];

const LEVEL_COLORS = [
  "#9CA3AF", "#34D399", "#60A5FA", "#A78BFA",
  "#D4AF37", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6",
];

/* ── filter values MUST match backend wallet_type strings ── */
const WALLET_FILTERS = [
  { i18nKey: "wallet.filterAll",            value: "all" },
  { i18nKey: "wallet.filterCash",           value: "cash" },
  { i18nKey: "wallet.filterNonCash",        value: "non_cash" },
  { i18nKey: "wallet.filterOtp",            value: "otp" },
  { i18nKey: "wallet.filterRollingPoints",  value: "rolling_points" },
];

const WALLET_ICONS = {
  cash:           DollarSign,
  non_cash:       CreditCard,
  otp:            Zap,
  rolling_points: TrendingUp,
};

function getVipFromPoints(pts) {
  const idx = [...VIP_LEVELS].reduce((found, v, i) => pts >= v.min_pts ? i : found, 0);
  return { ...VIP_LEVELS[idx], lvl: idx + 1, idx };
}

/* ─── Small reusable components ────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
        {value}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 8,
      padding: "12px 14px", border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: color || "white" }}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════ */
export default function WalletTab({ profile, onToast }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("balances");
  const [accounts,   setAccounts]   = useState([]);
  const [levelData,  setLevelData]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBalances = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [walletRes, levelRes] = await Promise.all([
        authFetch(`${API}/api/wallet/balances/`),
        authFetch(`${API}/api/level/`),
      ]);
      if (walletRes.ok) { const j = await walletRes.json(); setAccounts(j.accounts || []); }
      if (levelRes.ok)  { const j = await levelRes.json();  setLevelData(j); }
    } catch {
      onToast?.("Network error loading wallet", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onToast]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const TABS = [
    { key: "balances", label: t("wallet.tabBalances") },
    { key: "history",  label: t("wallet.tabHistory") },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "8px 16px", borderRadius: 8,
                border: `1px solid ${tab === key ? C.border : "transparent"}`,
                background: tab === key ? C.surface2 : "transparent",
                color: tab === key ? "white" : "rgba(255,255,255,0.45)",
                cursor: "pointer", fontSize: 13, fontWeight: tab === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "balances" && (
          <button
            onClick={() => loadBalances(true)}
            disabled={refreshing}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: "transparent",
              color: "rgba(255,255,255,0.5)",
              cursor: refreshing ? "not-allowed" : "pointer", fontSize: 12,
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? "spin 0.7s linear infinite" : "none" }} />
            {t("common.refresh")}
          </button>
        )}
      </div>

      {tab === "balances" && (
        <WalletBalances accounts={accounts} levelData={levelData} loading={loading} profile={profile} />
      )}
      {tab === "history" && <TransactionHistory onToast={onToast} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   BALANCES PANEL
═══════════════════════════════════════════════════════ */
function WalletBalances({ accounts, levelData, loading, profile }) {
  const { t } = useTranslation();
  // ADD casino wallet state
  const [casinoData,      setCasinoData]      = useState({ casinos: [], has_casino_balances: false });
  const [selectedCasino,  setSelectedCasino]  = useState("");

  useEffect(() => {
    authFetch(`${API}/api/wallet/casino-balances/`)
      .then(r => r.json())
      .then(j => {
        setCasinoData(j);
        if (j.casinos?.length > 0) setSelectedCasino(j.casinos[0].casino_name);
      })
      .catch(() => {});
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
      <Spinner />
    </div>
  );

  const pts      = levelData?.points || 0;
  const vipCfg   = getVipFromPoints(pts);
  const vipLvl   = vipCfg.lvl; 
  const vipColor = LEVEL_COLORS[vipLvl - 1] || LEVEL_COLORS[0];
  const nextVip  = VIP_LEVELS[vipCfg.idx + 1] || null;

  let progress = 100;
  if (nextVip) {
    progress = ((pts - vipCfg.min_pts) / (nextVip.min_pts - vipCfg.min_pts)) * 100;
  }

  const sorted = [...accounts].sort((a, b) => {
    const ORDER = { cash: 0, non_cash: 1, otp: 2, rolling_points: 3 };
    return (ORDER[a.wallet_type] ?? 9) - (ORDER[b.wallet_type] ?? 9);
  });

  const totalDeposited   = profile?.total_deposited  || 0;
  const totalWithdrawn   = profile?.total_withdrawn   || 0;
  const totalWagered     = profile?.total_wagered     || 0;
  const totalWon         = profile?.total_won         || 0;
  const referralCode     = profile?.referral_code     || "—";
  const referralCount    = profile?.referral_count    || 0;
  const referralEarnings = profile?.referral_earnings || 0;
  const kycStatus        = profile?.kyc_status        || "pending";

  const KYC_COLOR = {
    approved:  C.green  || "#34d399",
    rejected:  C.red    || "#f87171",
    submitted: C.gold   || "#fbbf24",
    pending:   "rgba(255,255,255,0.4)",
  };

  // Casino wallets for the selected casino
  const selectedCasinoData = casinoData.casinos.find(c => c.casino_name === selectedCasino);

  const mainAcct = sorted.find(w => w.wallet_type === "cash");
  const mainBal  = Number(mainAcct?.balance || 0);

  const totalCasinoCash = casinoData.casinos.reduce((sum, c) => {
    const w = c.wallets?.find(w => w.wallet_type === "C" || w.label === "Cash");
    return sum + Number(w?.balance || 0);
  }, 0);

  const totalMainBalance = mainBal + totalCasinoCash;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* VIP CARD — unchanged */}
      <Card style={{
        background: `linear-gradient(135deg, ${vipColor}12, #000)`,
        border: `1px solid ${vipColor}33`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {t("wallet.membershipStatus")}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: vipColor }}>{t(vipCfg.i18nKey)}</div>
            <div style={{ fontSize: 11, opacity: 0.4 }}>{t("wallet.accumulatedPoints", { count: pts.toLocaleString() })}</div>
          </div>

        </div>
        <div style={{ height: 6, background: "#111", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(Math.max(progress, 0), 100)}%`,
            height: "100%", background: vipColor, transition: "all 0.8s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, opacity: 0.5 }}>
          <span>{pts.toLocaleString()} / {nextVip ? nextVip.min_pts.toLocaleString() : "MAX"}</span>
          <span>
            {nextVip
              ? t("wallet.pointsToNext", { points: (nextVip.min_pts - pts).toLocaleString(), level: t(nextVip.i18nKey) })
              : t("wallet.topTier")}
          </span>
        </div>
      </Card>

      {/* MAIN WALLET BALANCES */}
      <div>
        <SectionLabel>{t("wallet.accountBalances")}</SectionLabel>
        {/* Main Balance Summary */}
<div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
  <div style={{ padding:"14px 16px", borderRadius:10, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.25)" }}>
    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>
      {t("wallet.mainBalance")}
    </div>
    <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginBottom:8 }}>
      {t("wallet.mainBalanceSub")}
    </div>
    <div style={{ fontSize:26, fontWeight:900, fontFamily:"monospace", color:"#34d399" }}>
      {fmt(mainBal)}
    </div>
  </div>
  <div style={{ padding:"14px 16px", borderRadius:10, background:"rgba(96,165,250,0.06)", border:"1px solid rgba(96,165,250,0.25)" }}>
    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>
      {t("wallet.totalMainBalance")}
    </div>
    <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginBottom:8 }}>
      {t("wallet.totalMainBalanceSub")}
    </div>
    <div style={{ fontSize:26, fontWeight:900, fontFamily:"monospace", color:"#60a5fa" }}>
      {fmt(totalMainBalance)}
    </div>
  </div>
</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
          {sorted.map(w => {
            const cfg  = WALLET_CFG[w.wallet_type] || {};
            const Icon = WALLET_ICONS[w.wallet_type] || DollarSign;
            const color = cfg.color || "#999";
            return (
              <Card key={w.id} style={{ background: `${color}05`, border: `1px solid ${color}18` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <Icon size={14} style={{ color }} />
                  <span style={{
                    fontSize: 10, padding: "2px 6px",
                    background: `${color}15`, borderRadius: 6, color,
                  }}>
                    {cfg.abbr || w.wallet_type.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace" }}>
                  {w.wallet_type === "rolling_points"
                    ? `${Number(w.balance).toLocaleString()} RP`
                    : fmt(w.balance)}
                </div>
                <div style={{ fontSize: 11, opacity: 0.4 }}>{cfg.label || w.wallet_type}</div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* CASINO WALLETS — only shown if user has any balance */}
      {casinoData.casinos.length > 0 && (
        <div>
          <SectionLabel>{t("wallet.casinoWallets")}</SectionLabel>

          {/* Casino selector dropdown */}
          {casinoData.casinos.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <select
                value={selectedCasino}
                onChange={e => setSelectedCasino(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: 8, fontSize: 13,
                  background: "rgba(20,20,28,0.9)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "white", outline: "none", cursor: "pointer",
                  minWidth: 200,
                }}
              >
                {casinoData.casinos.map(c => (
                  <option key={c.casino_name} value={c.casino_name} style={{ background: "rgba(20,20,28,0.98)", color: "white" }}>
                    {c.casino_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Balances for selected casino */}
          {selectedCasinoData && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {selectedCasinoData.wallets.map(w => (
                <Card
                  key={w.wallet_type}
                  style={{ background: `${w.color}05`, border: `1px solid ${w.color}18` }}
                >
                  <div style={{ fontSize: 10, color: w.color, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                    {w.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: "white" }}>
                    {fmt(w.balance)}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.35, marginTop: 4 }}>
                    {selectedCasino}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACCOUNT STATS — unchanged */}
      <div>
        <SectionLabel>{t("wallet.accountOverview")}</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <StatCard label={t("wallet.totalDeposited")}  value={fmt(totalDeposited)}  color={C.green || "#34d399"} />
          <StatCard label={t("wallet.totalWithdrawn")}  value={fmt(totalWithdrawn)}  color={C.red   || "#f87171"} />
          <StatCard label={t("wallet.totalWagered")}    value={fmt(totalWagered)} />
          <StatCard label={t("wallet.totalWon")}        value={fmt(totalWon)}        color={C.gold  || "#fbbf24"} />
        </div>
      </div>

      {/* ACCOUNT DETAILS — unchanged */}
      <div>
        <SectionLabel>{t("wallet.accountDetails")}</SectionLabel>
        {[
          {
            Icon: ShieldCheck,
            title: t("wallet.kycStatus"),
            sub: t("wallet.kycStatusSub"),
            right: (
              <span style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${KYC_COLOR[kycStatus]}20`, color: KYC_COLOR[kycStatus],
              }}>
                {kycStatus.charAt(0).toUpperCase() + kycStatus.slice(1)}
              </span>
            ),
          },
          {
            Icon: Award,
            title: t("wallet.referralCode"),
            sub: t("wallet.referralCodeSub"),
            right: (
              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
                {referralCode}
              </span>
            ),
          },
          {
            Icon: Users,
            title: t("wallet.referredUsers"),
            sub: referralEarnings ? t("wallet.earnedAmount", { amount: fmt(referralEarnings) }) : t("wallet.noEarningsYet"),
            right: (
              <span style={{ fontSize: 14, fontWeight: 700 }}>{t("wallet.usersCount", { count: referralCount })}</span>
            ),
          },
        ].map(({ Icon, title, sub, right }) => (
          <div
            key={title}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "13px 16px", borderRadius: 10, marginBottom: 8,
              border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Icon size={15} style={{ opacity: 0.5 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 11, opacity: 0.4 }}>{sub}</div>
              </div>
            </div>
            {right}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TRANSACTION HISTORY
═══════════════════════════════════════════════════════ */
function TransactionHistory({ onToast }) {
  const { t } = useTranslation();
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [filter,   setFilter]   = useState("all");
  const [expanded, setExpanded] = useState(null);

  const WALLET_COLORS = {
    cash:           { bg: `${C.green}1E`,   color: C.green,   init: "$"  },
    non_cash:       { bg: `${C.purple}1E`,  color: C.purple,  init: "NC" },
    otp:            { bg: `${C.teal}1E`,    color: C.teal,    init: "⚡" },
    rolling_points: { bg: `${C.gold}1E`,    color: C.gold,    init: "RP" },
  };

  const loadHistory = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, page_size: TX_PAGE_SIZE });
      if (filter !== "all") params.set("wallet_type", filter);
      const res = await authFetch(`${API}/api/wallet/transactions/?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setHistory(j.results || []);
      setTotal(j.count || 0);
      setPage(pg);
    } catch (e) {
      onToast?.(`Failed to load history: ${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [filter, onToast]);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
    loadHistory(1);
  }, [filter]);

  useEffect(() => {
    loadHistory(page);
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / TX_PAGE_SIZE));
  const start = (page - 1) * TX_PAGE_SIZE;
  const showing = t("tables.showingRange", { start: total === 0 ? 0 : start + 1, end: Math.min(page * TX_PAGE_SIZE, total), total });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {WALLET_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: "5px 13px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: `1px solid ${filter === f.value ? C.gold : C.border}`,
              background: filter === f.value ? `${C.gold}15` : "transparent",
              color: filter === f.value ? C.gold : "rgba(255,255,255,0.4)",
              transition: "all 0.15s",
            }}
          >
            {t(f.i18nKey)}
          </button>
        ))}
      </div>

      {/* Mail-style list */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><Spinner /></div>
        ) : history.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            {t("wallet.noTransactionsFound")}
          </div>
        ) : (
          history.map((tx, idx) => {
            const isCredit = tx.direction === "credit";
            const isOpen   = expanded === tx.id;
            const isRP     = tx.wallet_type === "rolling_points";
            const wc       = WALLET_COLORS[tx.wallet_type] || { bg: "rgba(150,150,150,0.1)", color: "#aaa", init: "?" };
            const wLabel   = tx.wallet_type?.replace(/_/g, " ").toUpperCase();

            return (
              <React.Fragment key={tx.id}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : tx.id)}
                  style={{
                    borderBottom: idx === history.length - 1 && !isOpen ? "none" : `1px solid ${C.border}`,
                    transition: "background 0.12s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr auto",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 16px",
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: wc.bg, color: wc.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>
                      {wc.init}
                    </div>

                    {/* Body */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        {tx.note || t("wallet.transaction")}
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 10,
                          background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)",
                          fontWeight: 600, letterSpacing: "0.04em", flexShrink: 0,
                        }}>
                          {wLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, display: "flex", gap: 8 }}>
                        <span style={{ fontFamily: "monospace" }}>{tx.transaction_reference}</span>
                        <span>{fmtDT(tx.created_at)}</span>
                      </div>
                    </div>

                    {/* Right */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, fontFamily: "monospace",
                        color: isCredit ? (C.green || "#34d399") : (C.red || "#f87171"),
                      }}>
                        {isRP ? Number(tx.amount).toLocaleString() : `${isCredit ? "+" : "−"}${fmt(tx.amount)}`}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                        {isRP ? `${Number(tx.balance_after).toLocaleString()} RP` : fmt(tx.balance_after)}
                      </div>
                      <span style={{
                        fontSize: 9, display: "inline-block",
                        color: "rgba(255,255,255,0.25)",
                        transition: "transform 0.2s",
                        transform: isOpen ? "rotate(180deg)" : "none",
                        marginTop: 2,
                      }}>▼</span>
                    </div>
                  </div>
                </div>

                {/* Smooth expansion — CSS max-height transition, no layout thrash */}
                <div style={{
                  overflow: "hidden",
                  maxHeight: isOpen ? 180 : 0,
                  transition: "max-height 0.28s cubic-bezier(0.4,0,0.2,1)",
                  background: "rgba(255,255,255,0.02)",
                  borderBottom: isOpen ? `1px solid ${C.border}` : "none",
                }}>
                  <div style={{
                    padding: "14px 16px 14px 64px",
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 16px",
                    borderTop: `1px solid ${C.border}`,
                  }}>
                    <Detail label={t("wallet.balanceBefore")} value={isRP ? `${Number(tx.balance_before).toLocaleString()} RP` : fmt(tx.balance_before)} />
                    <Detail label={t("wallet.balanceAfter")}  value={isRP ? `${Number(tx.balance_after).toLocaleString()} RP`  : fmt(tx.balance_after)} />
                    <Detail label={t("tables.status")}         value={tx.status?.toUpperCase() || t("wallet.approved")} />
                    <Detail label={t("tables.direction")}      value={tx.direction?.toUpperCase()} />
                    <Detail label={t("tables.processedBy")} value={tx.performed_by_uid || t("tables.system")} />
                    <Detail label={t("tables.reference")}      value={tx.transaction_reference} />
                    <div style={{ gridColumn: "span 3" }}>
                      <Detail label={t("tables.note")} value={tx.note || t("tables.noNote")} />
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        {/* Pagination footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderTop: `1px solid ${C.border}`,
          background: "rgba(255,255,255,0.01)", fontSize: 12, color: "rgba(255,255,255,0.35)",
        }}>
          <span>{showing}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "4px 11px", borderRadius: 6, fontSize: 12,
                border: `1px solid ${C.border}`, background: "transparent",
                color: page === 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)",
                cursor: page === 1 ? "not-allowed" : "pointer",
              }}
            >{t("tables.prev")}</button>
            <span style={{ padding: "0 4px" }}>{t("tables.pageOf", { page, total: totalPages })}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
              style={{
                padding: "4px 11px", borderRadius: 6, fontSize: 12,
                border: `1px solid ${C.border}`, background: "transparent",
                color: page >= totalPages ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >{t("tables.next")}</button>
          </div>
        </div>
      </Card>
    </div>
  );
}