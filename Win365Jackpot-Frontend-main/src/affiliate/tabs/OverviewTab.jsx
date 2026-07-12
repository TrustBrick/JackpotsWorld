import React, { useState, useEffect, useCallback } from "react";
import { Users, Wallet, TrendingUp, CheckCircle2, Copy, Check, Link2, MousePointerClick, Banknote, Star, PiggyBank, Award } from "lucide-react";
import { API, affiliateFetch, fmt } from "../helpers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

// Kept in sync with admin/tabs/UsersTab.jsx's LEVEL_NAMES — affiliate and
// admin panels intentionally don't share components, so this is a local copy.
const LEVEL_NAMES = [
  "", "VIP", "VIP Bronze", "Silver", "Gold",
  "Jackpot I", "Jackpot II", "Jackpot III",
  "Jackpot Platinum", "Jackpot Diamond", "Master",
];

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export default function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/dashboard/`);
    if (res?.ok) setStats(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const referralLink = stats?.referral_code
    ? `${window.location.origin}?ref=${stats.referral_code}`
    : "";

  const copy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 640 }}>
        Earn recurring commission on every player you refer to Jackpots World's network of partner casinos.
      </p>

      {/* Affiliate Link widget */}
      <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Link2 size={14} style={{ color: C.gold }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "white" }}>Your Affiliate Link</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{
            flex: 1, minWidth: 240, padding: "11px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
            fontFamily: "monospace", fontSize: 13, color: "rgba(255,255,255,0.8)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {referralLink || "Loading…"}
          </div>
          <button
            onClick={copy}
            disabled={!referralLink}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "11px 18px", borderRadius: 10,
              background: copied ? `${C.green}18` : `${C.gold}18`,
              border: `1px solid ${copied ? C.green : C.gold}40`,
              color: copied ? C.green : C.gold, fontSize: 12, fontWeight: 700,
              cursor: referralLink ? "pointer" : "not-allowed",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          Share this link — every signup and deposit through it is tracked automatically.
        </div>
      </Card>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Total Clicks", value: stats?.stats?.total_clicks ?? "—", icon: MousePointerClick, color: C.blue },
          { label: "Total Players", value: stats?.stats?.total_referred ?? "—", icon: Users, color: C.blue },
          { label: "Active Players", value: stats?.stats?.active_referred ?? "—", icon: CheckCircle2, color: C.green },
          { label: "Total Qualified Players", value: stats?.stats?.total_qualified_players ?? "—", icon: Star, color: "#A78BFA" },
          { label: "Total Deposits", value: stats ? fmt(stats.stats.total_deposits) : "—", icon: Banknote, color: C.gold },
          { label: "Commission Earned", value: stats ? fmt(stats.stats.commission_earned) : "—", icon: TrendingUp, color: C.gold },
          { label: "Commission Pending", value: stats ? fmt(stats.stats.commission_pending) : "—", icon: Wallet, color: "#FB923C" },
          { label: "Commission Paid", value: stats ? fmt(stats.stats.commission_paid) : "—", icon: Wallet, color: C.green },
          { label: "Available Balance", value: stats ? fmt(stats.stats.available_balance) : "—", icon: PiggyBank, color: C.green },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <s.icon size={14} style={{ color: s.color }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}

        {/* Player Level — most common VIP level among this affiliate's referred players */}
        <Card>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <Award size={14} style={{ color: C.gold }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white", fontFamily: "monospace" }}>
            {stats?.player_level ? (LEVEL_NAMES[stats.player_level.most_common_level] || `Level ${stats.player_level.most_common_level}`) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            Player Level
            {stats?.player_level && (
              <> · Most common among {stats.player_level.total_leveled_players} referred player{stats.player_level.total_leveled_players === 1 ? "" : "s"}</>
            )}
          </div>
        </Card>
      </div>

      {/* Monthly earnings */}
      {stats?.monthly_earnings?.length > 0 && (
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 12 }}>Monthly Earnings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.monthly_earnings.map(m => (
              <div key={m.month} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{m.month}</span>
                <span style={{ fontFamily: "monospace", color: C.gold, fontWeight: 700 }}>{fmt(m.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stats?.affiliate_profile && (
        <Card style={{ background: `${C.gold}06`, border: `1px solid ${C.gold}25` }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            Your commission rate: <b style={{ color: C.gold }}>{stats.affiliate_profile.commission_rate}%</b> of every referred player's cash deposit.
          </div>
        </Card>
      )}
    </div>
  );
}
