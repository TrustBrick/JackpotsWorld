/**
 * GiftsTab.jsx — Redesigned with professional AWS-console-style layout
 * Clean, structured, data-dense dark UI with proper information hierarchy
 */

import React, { useState, useEffect, useCallback } from "react";
import { C } from "../../constants";
import {
  FiGift, FiLock, FiClock, FiCheckCircle, FiStar,
  FiZap, FiTrendingUp, FiDollarSign, FiRefreshCw,
  FiChevronRight, FiAward, FiShield, FiUsers,
  FiPackage, FiActivity, FiAlertCircle, FiInfo,
} from "react-icons/fi";
import {
  MdOutlineDiamond, MdWorkspacePremium,
} from "react-icons/md";
import {
  RiCoinLine, RiTicketLine, RiTrophyLine, RiVipCrownLine,
  RiRefundLine, RiGroupLine,
} from "react-icons/ri";
import { authFetch, API } from "../../helpers";
import { Spinner } from "../../components/SharedUI";

const VIP_NAMES = [
  "VIP", "VIP Bronze", "Silver", "Gold",
  "Jackpot I", "Jackpot II", "Jackpot III",
  "Jackpot Platinum", "Jackpot Diamond",
];

const VIP_COLORS = [
  "#9CA3AF", "#34D399", "#60A5FA", "#A78BFA",
  "#D4AF37", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6",
];

// ─── Gift type config ─────────────────────────────────────────────────────────
const GIFT_CONFIG = {
  manual:      { Icon: FiGift,      color: "#60A5FA", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)",  label: "Manual Gift",   tag: "bg" },
  bonus:       { Icon: FiDollarSign,color: "#34D399", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)",  label: "Bonus",         tag: "bonus" },
  cashback:    { Icon: RiRefundLine, color: "#FB923C", bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.2)",  label: "Cashback",      tag: "cb" },
  referral:    { Icon: RiGroupLine,  color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)", label: "Referral",      tag: "ref" },
  vip_upgrade: { Icon: RiVipCrownLine,color:"#D4AF37",bg: "rgba(212,175,55,0.08)",  border: "rgba(212,175,55,0.2)",  label: "VIP Upgrade",   tag: "vip" },
  tournament:  { Icon: RiTrophyLine, color: "#FB923C", bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.2)",  label: "Tournament",    tag: "trn" },
  welcome:     { Icon: FiStar,       color: "#34D399", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)",  label: "Welcome",       tag: "new" },
};

// ─── Wallet config ────────────────────────────────────────────────────────────
const WALLET_CONFIG = [
  { type: "cash",           label: "Cash Balance",    sublabel: "Withdrawable",    Icon: FiDollarSign,  color: "#34D399" },
  { type: "non_cash",       label: "Non-Cash",        sublabel: "Bonus Credits",   Icon: RiCoinLine,    color: "#A78BFA" },
  { type: "otp",            label: "OTP Credits",     sublabel: "Verification",    Icon: RiTicketLine,  color: "#2DD4BF" },
  { type: "rolling_points", label: "Rolling Points",  sublabel: "Reward Points",   Icon: RiTrophyLine,  color: "#D4AF37" },
];

const FILTERS = [
  { id: "all",     label: "All Gifts",   icon: FiPackage },
  { id: "pending", label: "Claimable",   icon: FiGift },
  { id: "claimed", label: "Claimed",     icon: FiCheckCircle },
  { id: "expired", label: "Expired",     icon: FiClock },
];

const fmtDate = (str) =>
  !str ? "" : new Date(str).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

const fmtAmount = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Countdown ────────────────────────────────────────────────────────────────
function CountdownTimer({ expiresAt, onExpired }) {
  const calc = useCallback(() => {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return null;
    return { h: Math.floor(diff / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000), diff };
  }, [expiresAt]);

  const [remaining, setRemaining] = useState(calc);

  useEffect(() => {
    const tick = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (!r) { clearInterval(tick); onExpired?.(); }
    }, 1000);
    return () => clearInterval(tick);
  }, [calc, onExpired]);

  if (!remaining) return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#F87171" }}>
      <FiAlertCircle size={10} /> Expired
    </span>
  );

  const { h, m, s, diff } = remaining;
  const urgent = diff < 3600000;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: urgent ? "#F87171" : "rgba(255,255,255,0.45)", fontFamily: "monospace" }}>
      <FiClock size={10} />
      {h > 0 && `${String(h).padStart(2, "0")}:`}{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function WalletCard({ type, label, sublabel, Icon, color, balance }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = `${color}40`}
    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
    >
      {/* Subtle top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}60, transparent)` }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}15`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={13} color={color} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", letterSpacing: "0.03em" }}>{label}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{sublabel}</div>
          </div>
        </div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "clamp(1.1rem,3vw,1.35rem)", fontWeight: 700, color, letterSpacing: "-0.01em" }}>
        {type === "rolling_points"
          ? `${Number(balance || 0).toLocaleString("en-IN")} RP`
          : `$${fmtAmount(balance)}`
        }
      </div>
    </div>
  );
}

// ─── Gift Card ────────────────────────────────────────────────────────────────
function GiftCard({ g, onClaim, claiming }) {
  const cfg = GIFT_CONFIG[g.gift_type] || GIFT_CONFIG.manual;
  const { Icon, color, bg, border, label } = cfg;
  const isClaimed   = g.status === "claimed";
  const isExpired   = g.status === "expired" || g.is_expired;
  const isClaimable = g.is_claimable;
  const isLoading   = claiming === g.id;

  return (
    <div style={{
      background: isClaimed ? "rgba(255,255,255,0.015)" : isExpired ? "rgba(248,113,113,0.03)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${isClaimed ? "rgba(255,255,255,0.07)" : isExpired ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10,
      overflow: "hidden",
      opacity: (isClaimed || isExpired) ? 0.75 : 1,
      transition: "all 0.15s",
      display: "flex",
      flexDirection: "column",
    }}
    onMouseEnter={e => { if (!isClaimed && !isExpired) e.currentTarget.style.borderColor = `${color}35`; }}
    onMouseLeave={e => e.currentTarget.style.borderColor = isClaimed ? "rgba(255,255,255,0.07)" : isExpired ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.08)"}
    >
      {/* Top color strip */}
      <div style={{ height: 3, background: isClaimed ? "rgba(52,211,153,0.4)" : isExpired ? "rgba(248,113,113,0.35)" : `linear-gradient(90deg, ${color}, transparent)` }} />

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={15} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
              {g.description && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.4, maxWidth: 180 }} className="line-clamp-1">
                  {g.description}
                </div>
              )}
            </div>
          </div>

          {/* Status indicator */}
          {isClaimed && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", flexShrink: 0 }}>
              <FiCheckCircle size={10} color="#34D399" />
              <span style={{ fontSize: 10, color: "#34D399", fontWeight: 600 }}>Claimed</span>
            </div>
          )}
          {isExpired && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", flexShrink: 0 }}>
              <FiLock size={10} color="#F87171" />
              <span style={{ fontSize: 10, color: "#F87171", fontWeight: 600 }}>Expired</span>
            </div>
          )}
        </div>

        {/* Amount */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>$</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 800, color: isClaimed || isExpired ? "rgba(255,255,255,0.3)" : "white", letterSpacing: "-0.02em" }}>
            {Number(g.amount || 0).toLocaleString("en-IN")}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {g.expires_at && !isClaimed && !isExpired && (
            <CountdownTimer expiresAt={g.expires_at} onExpired={() => {}} />
          )}
          {isClaimed && g.claimed_at && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
              <FiCheckCircle size={10} /> {fmtDate(g.claimed_at)}
            </span>
          )}
          {isExpired && g.expires_at && (
            <span style={{ fontSize: 11, color: "rgba(248,113,113,0.6)", display: "flex", alignItems: "center", gap: 4 }}>
              <FiClock size={10} /> Expired {fmtDate(g.expires_at)}
            </span>
          )}
          {g.created_at && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>Issued {fmtDate(g.created_at)}</span>
          )}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "auto" }}>
          {isClaimed ? (
            <div style={{ width: "100%", padding: "9px 0", borderRadius: 7, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "#34D399", fontWeight: 600 }}>
              <FiCheckCircle size={12} /> Redeemed
            </div>
          ) : isExpired ? (
            <div style={{ width: "100%", padding: "9px 0", borderRadius: 7, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "#F87171", fontWeight: 600 }}>
              <FiLock size={12} /> Unavailable
            </div>
          ) : (
            <button
              onClick={() => onClaim(g.id)}
              disabled={!isClaimable || isLoading}
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 7,
                border: "none",
                background: isClaimable
                  ? `linear-gradient(135deg, ${color}, ${color}cc)`
                  : "rgba(255,255,255,0.05)",
                color: isClaimable ? (color === "#D4AF37" ? "#000" : "#000") : "rgba(255,255,255,0.25)",
                fontSize: 12,
                fontWeight: 700,
                cursor: isClaimable ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: isLoading ? 0.7 : 1,
                transition: "opacity 0.15s, transform 0.1s",
                letterSpacing: "0.04em",
              }}
              onMouseEnter={e => { if (isClaimable) e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={e => { if (isClaimable) e.currentTarget.style.opacity = "1"; }}
            >
              {isLoading ? (
                <><span style={{ width: 12, height: 12, border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#000", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} /> Claiming…</>
              ) : isClaimable ? (
                <><FiGift size={12} /> Claim Gift</>
              ) : (
                <><FiLock size={12} /> Not Available</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GiftsTab({ onToast, onRefresh }) {
  const [gifts,     setGifts]     = useState([]);
  const [wallets,   setWallets]   = useState([]);
  const [levelData, setLevelData] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [claiming,  setClaiming]  = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [refreshing,setRefreshing]= useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [gr, wr, lr] = await Promise.all([
        authFetch(`${API}/api/gifts/`),
        authFetch(`${API}/api/wallet/balances/`),
        authFetch(`${API}/api/level/`),
      ]);
      if (gr.ok) { const j = await gr.json(); setGifts(j.results || []); }
      if (wr.ok) { const j = await wr.json(); setWallets(j.accounts || j || []); }
      if (lr.ok) { const j = await lr.json(); setLevelData(j); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const claim = async (giftId) => {
    setClaiming(giftId);
    try {
      const r = await authFetch(`${API}/api/gifts/${giftId}/claim/`, { method: "POST" });
      const j = await r.json();
      onToast?.(j.message || j.error, r.ok);
      if (r.ok) {
        setGifts(prev => prev.map(g => g.id === giftId ? { ...g, status: "claimed", claimed_at: new Date().toISOString(), is_claimable: false } : g));
        onRefresh?.();
        const wr = await authFetch(`${API}/api/wallet/balances/`);
        if (wr.ok) { const wj = await wr.json(); setWallets(wj.accounts || wj || []); }
      }
    } catch { onToast?.("Claim failed", false); }
    setClaiming(null);
  };

  const getBalance = (type) => {
    const w = wallets.find(w => w.wallet_type === type);
    return w ? parseFloat(w.balance || 0) : 0;
  };

  const filtered = filter === "all" ? gifts : gifts.filter(g => g.status === filter);
  const claimableCount = gifts.filter(g => g.is_claimable).length;
  const claimedCount   = gifts.filter(g => g.status === "claimed").length;
  const totalValue     = gifts.filter(g => g.is_claimable).reduce((s, g) => s + Number(g.amount || 0), 0);

  const curLvl    = levelData?.level || 1;
  const pts       = levelData?.points || 0;
  const nextPts   = levelData?.next_level_points;
  const ptsToNext = levelData?.points_to_next || 0;
  const progress  = levelData?.progress_pct || 0;
  const vipColor  = VIP_COLORS[(curLvl || 1) - 1] || VIP_COLORS[0];
  const vipName   = VIP_NAMES[(curLvl || 1) - 1] || "VIP";

  return (
    <div style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace", color: "rgba(255,255,255,0.85)", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .gift-filter-btn:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* ── PAGE HEADER ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FiGift size={15} color="#D4AF37" />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "white", margin: 0, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>Gifts & Rewards</h1>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
            Manage and claim your available rewards
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)", fontSize: 12, cursor: refreshing ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}
        >
          <FiRefreshCw size={13} style={{ animation: refreshing ? "spin 0.7s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* ── SUMMARY STRIP ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Claimable", value: claimableCount, icon: <FiGift size={13} />, color: "#D4AF37", sub: "Available now" },
          { label: "Claimed",   value: claimedCount,   icon: <FiCheckCircle size={13} />, color: "#34D399", sub: "Redeemed" },
          { label: "Pending Value", value: `$${Number(totalValue).toLocaleString("en-IN")}`, icon: <FiDollarSign size={13} />, color: "#60A5FA", sub: "Claimable total" },
        ].map(({ label, value, icon, color, sub }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ color }}>{icon}</span> {label}
            </div>
            <div style={{ fontSize: "clamp(1.1rem,3vw,1.4rem)", fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── WALLET BALANCES ── */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "#D4AF37" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Sans', sans-serif" }}>Wallet Balances</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {WALLET_CONFIG.map(({ type, label, sublabel, Icon, color }) => (
            <WalletCard key={type} type={type} label={label} sublabel={sublabel} Icon={Icon} color={color} balance={getBalance(type)} />
          ))}
        </div>
      </section>

      {/* ── VIP PROGRESS ── */}
      {levelData && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: vipColor }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Sans', sans-serif" }}>VIP Status</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${vipColor}22`, borderRadius: 10, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${vipColor}80, transparent)` }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${vipColor}18`, border: `1px solid ${vipColor}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RiVipCrownLine size={18} color={vipColor} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: vipColor, fontFamily: "'DM Sans', sans-serif" }}>{vipName}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}>
                    {pts.toLocaleString("en-IN")} pts accumulated
                  </div>
                </div>
              </div>
              {nextPts && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif" }}>Next level</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "white", fontFamily: "'DM Mono', monospace" }}>{nextPts.toLocaleString("en-IN")}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace" }}>{ptsToNext.toLocaleString("en-IN")} to go</div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${Math.min(progress, 100)}%`, height: "100%", background: vipColor, borderRadius: 3, boxShadow: `0 0 8px ${vipColor}60`, transition: "width 0.8s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>
              <span>Lv {curLvl} — {vipName}</span>
              <span style={{ color: vipColor, fontWeight: 600 }}>{progress.toFixed(1)}%</span>
              {nextPts && <span>Lv {curLvl + 1} — {VIP_NAMES[curLvl] || `Level ${curLvl + 1}`}</span>}
            </div>
          </div>
        </section>
      )}

      {/* ── GIFTS SECTION ── */}
      <section>
        {/* Section header + filters */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: "#60A5FA" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Sans', sans-serif" }}>Gift History</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'DM Sans', sans-serif" }}>· {filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "3px", background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
            {FILTERS.map(({ id, label, icon: Icon }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className="gift-filter-btn"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: active ? 700 : 500,
                    border: active ? "1px solid rgba(212,175,55,0.3)" : "1px solid transparent",
                    background: active ? "rgba(212,175,55,0.12)" : "transparent",
                    color: active ? "#D4AF37" : "rgba(255,255,255,0.4)",
                    cursor: "pointer", transition: "all 0.15s",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon size={11} />
                  {label}
                  {id === "pending" && claimableCount > 0 && (
                    <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: "#D4AF37", color: "#000", fontSize: 9, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                      {claimableCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "60px 0" }}>
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <FiPackage size={22} color="rgba(255,255,255,0.2)" />
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Sans', sans-serif" }}>No {filter === "all" ? "" : filter} gifts found</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>Check back later for new rewards</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {filtered.map(g => (
              <GiftCard key={g.id} g={g} onClaim={claim} claiming={claiming} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}