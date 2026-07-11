/**
 * RollingPoints.jsx
 * Rolling Points entry tab — extracted from OfflineDepositTab
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  TrendingUp, Hash, Calendar, AlertTriangle,
  Info, ChevronDown, ChevronUp, ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { adminFetch, API, fmt } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

// ─── VIP CONFIG ───────────────────────────────────────────────────────────────
const VIP_LEVELS = [
  { lvl:1, label:"VIP",              rp_rate:1.00, rolling_pct:1.00, min_rp:0,         lu_points:5_000        },
  { lvl:2, label:"VIP Bronze",       rp_rate:1.05, rolling_pct:0.95, min_rp:5_000,     lu_points:15_000       },
  { lvl:3, label:"Silver",           rp_rate:1.11, rolling_pct:0.90, min_rp:15_000,    lu_points:30_000       },
  { lvl:4, label:"Gold",             rp_rate:1.18, rolling_pct:0.85, min_rp:30_000,    lu_points:75_000       },
  { lvl:5, label:"Jackpot I",        rp_rate:1.25, rolling_pct:0.80, min_rp:75_000,    lu_points:150_000      },
  { lvl:6, label:"Jackpot II",       rp_rate:1.33, rolling_pct:0.75, min_rp:150_000,   lu_points:350_000      },
  { lvl:7, label:"Jackpot III",      rp_rate:1.43, rolling_pct:0.70, min_rp:350_000,   lu_points:750_000      },
  { lvl:8, label:"Jackpot Platinum", rp_rate:1.50, rolling_pct:0.60, min_rp:750_000,   lu_points:1_500_000    },
  { lvl:9, label:"Jackpot Diamond",  rp_rate:1.50, rolling_pct:0.60, min_rp:1_500_000, lu_points:9_999_999_999},
];
const VIP_BY_LVL = Object.fromEntries(VIP_LEVELS.map(v => [v.lvl, v]));
const VIP_COLORS = ["#f59e0b","#cd7f32","#94a3b8","#fbbf24","#a78bfa","#34d399","#22d3ee","#6366f1","#e879f9"];
const MAX_VIP    = 9;
const COLOR      = "#a78bfa";

const TODAY = new Date().toISOString().split("T")[0];

function getVipFromRP(rp) {
  let v = VIP_LEVELS[0];
  for (const x of VIP_LEVELS) { if (rp >= x.min_rp) v = x; else break; }
  return v;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
// These take the current theme's C object since they're plain functions,
// not components, and can't call hooks themselves. Usage: inp(accent, err, C)
const inp = (accent, err, C) => ({
  background:C.inputBg, border:`1px solid ${err?"#f8717155":accent?accent+"44":C.border}`,
  color:C.text, borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box",
});
const sel = (accent, C) => ({
  background:C.panelBg, border:`1px solid ${accent?accent+"44":C.border2}`,
  color:C.text, borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box", cursor:"pointer",
});
const lbl = (C) => ({
  display:"block", fontSize:10, fontWeight:700,
  color:C.muted, marginBottom:5,
  letterSpacing:"0.06em", textTransform:"uppercase",
});

// ─── SUBCOMPONENTS ────────────────────────────────────────────────────────────
function StatBox({ label, value, color, sub }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ padding:"11px 13px", borderRadius:10, background:`${color}07`, border:`1px solid ${color}18` }}>
      <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:900, color, fontFamily:"monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:9, color:C.dim, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function RefTable() {
  const { C } = useAdminTheme();
  return (
    <div style={{ borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:4 }}>
      <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}`, fontSize:11, fontWeight:700, color:C.text, background:C.hoverBg }}>
        VIP Reference — RP = Game Level Points (unified) · Formula: $Bet Amount ÷ 100
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
        <thead>
          <tr style={{ background:C.hoverBg }}>
            {["Level","Min RP","Rolling %","RP Rate","Level-Up RP"].map(h => (
              <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:9, color:C.muted, fontWeight:700, textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VIP_LEVELS.map((v,i) => (
            <tr key={v.lvl} style={{ borderBottom:`1px solid ${C.border}` }}
              onMouseEnter={e => e.currentTarget.style.background=C.hoverBg}
              onMouseLeave={e => e.currentTarget.style.background=""}>
              <td style={{ padding:"8px 12px", fontWeight:700, color:VIP_COLORS[i] }}>{v.label}</td>
              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:C.muted }}>{v.min_rp.toLocaleString("en-IN")}</td>
              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:"#fb923c" }}>{(v.rolling_pct*100).toFixed(0)}%</td>
              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:"#a78bfa", fontWeight:700 }}>×{v.rp_rate.toFixed(2)}</td>
              <td style={{ padding:"8px 12px", fontFamily:"monospace", color:VIP_COLORS[i], fontWeight:700 }}>{v.lu_points.toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function RollingPoints({ userInfo, accounts, submitting, setSubmitting, onToast, refreshUser }) {
  const { C, theme } = useAdminTheme();
  const [showRef,       setShowRef]       = useState(false);
  const [rCasino,       setRCasino]       = useState("");
  const [country,       setCountry]       = useState("");
  const [rSlipNumber,   setRSlipNumber]   = useState("");
  const [rSlipError,    setRSlipError]    = useState("");
  const [rSlipChecking, setRSlipChecking] = useState(false);
  const [rBettingDate,  setRBettingDate]  = useState("");
  const [rTotalBets,    setRTotalBets]    = useState("");
  const [rTotalBetAmt,  setRTotalBetAmt]  = useState("");
  const [rRpOverride,   setRRpOverride]   = useState("");
  const [rNote,         setRNote]         = useState("");

  // Player-scoped casino list — ONLY casinos where this player has an
  // active, funded Cash wallet (i.e. has actually deposited/played there).
  // Never the global casino reference list.
  const [playerCasinos,        setPlayerCasinos]        = useState({});
  const [loadingPlayerCasinos, setLoadingPlayerCasinos]  = useState(false);

  useEffect(() => {
    setCountry(""); setRCasino("");
    if (!userInfo) { setPlayerCasinos({}); return; }
    setLoadingPlayerCasinos(true);
    adminFetch(`${API}/api/admin-panel/deposits/casinos/?user_id=${userInfo.id}`)
      .then(r => r.json())
      .then(j => setPlayerCasinos(j.casinos || {}))
      .catch(() => setPlayerCasinos({}))
      .finally(() => setLoadingPlayerCasinos(false));
  }, [userInfo]);

  const hasNoCasinoAccounts = !loadingPlayerCasinos && !!userInfo && Object.keys(playerCasinos).length === 0;

  const checkSlipUnique = useCallback(async (slip) => {
    if (!slip.trim()) { setRSlipError(""); return; }
    setRSlipChecking(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/deposits/check-slip/?slip_number=${encodeURIComponent(slip.trim())}`);
      const j = await r.json();
      setRSlipError(j.exists ? "⚠ Slip number already exists" : "");
    } catch { setRSlipError(""); }
    setRSlipChecking(false);
  }, []);

  const vipLvl     = userInfo?.vip_level || 1;
  const currentVip = VIP_BY_LVL[vipLvl] || VIP_LEVELS[0];
  const nextVip    = vipLvl < MAX_VIP ? VIP_BY_LVL[vipLvl+1] : null;
  const vipColor   = VIP_COLORS[vipLvl-1] || VIP_COLORS[0];
  const currentRP  = Number(userInfo?.rolling_points_total || 0);
  const casinosForCountry = playerCasinos[country] || [];

  const betAmt      = parseFloat(rTotalBetAmt) || 0;
  const numBets     = parseInt(rTotalBets) || 0;
  const rpAutoCalc  = betAmt > 0 ? +(betAmt/100).toFixed(2) : 0;
  const rpAdded     = rRpOverride !== "" ? (parseFloat(rRpOverride)||0) : rpAutoCalc;
  const projRPTotal = currentRP + rpAdded;
  const projVip     = getVipFromRP(projRPTotal);
  const willVipLU   = projVip.lvl > currentVip.lvl;

  const submitRP = async () => {
    if (!userInfo)           return onToast("Select a user first", false);
    if (hasNoCasinoAccounts) return onToast("No active casino accounts found.", false);
    if (!country)            return onToast("Select a country", false);
    if (!rCasino)            return onToast("Select a casino", false);
    if (!rSlipNumber.trim()) return onToast("Enter slip number", false);
    if (rSlipError)          return onToast(rSlipError, false);
    if (!rBettingDate)       return onToast("Select betting date", false);
    if (rBettingDate !== TODAY) return onToast("Only today's date is allowed for betting entries", false);
    if (betAmt <= 0)         return onToast("Enter total bet amount", false);
    if (rpAdded <= 0)        return onToast("Rolling points must be > 0", false);

    setSubmitting(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/deposits/offline/`, {
        method:"POST",
        body: JSON.stringify({
          user_id: userInfo.id, type:"rolling_points",
          vip_level: vipLvl, casino_name: rCasino, country,
          slip_number: rSlipNumber.trim(), betting_date: rBettingDate,
          total_bets: numBets, total_bet_amount: betAmt,
          rolling_points_manual: rRpOverride !== "" ? rpAdded : null,
          note: rNote,
        }),
      });
      const j = await r.json();
      onToast(j.message||j.error, r.ok);
      if (r.ok) {
        setRSlipNumber(""); setRBettingDate(""); setRTotalBets("");
        setRTotalBetAmt(""); setRRpOverride(""); setRNote(""); setRCasino(""); setCountry("");
        setRSlipError("");
        await refreshUser();
      }
    } catch { onToast("Submission failed", false); }
    setSubmitting(false);
  };

  const isValid = !hasNoCasinoAccounts && !!country && !!rCasino &&
    rSlipNumber.trim() && !rSlipError && rBettingDate === TODAY && betAmt > 0 && rpAdded > 0 && !submitting;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Reference toggle */}
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button onClick={() => setShowRef(v => !v)} style={{
          display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:7,
          fontSize:11, fontWeight:600, cursor:"pointer",
          background:showRef?"rgba(96,165,250,0.1)":"transparent",
          border:`1px solid ${showRef?"rgba(96,165,250,0.4)":C.border}`,
          color:showRef?"#60a5fa":C.muted,
        }}>
          <Info size={11}/> {showRef?"Hide":"Show"} VIP Reference
          {showRef ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
        </button>
      </div>

      <AnimatePresence>
        {showRef && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }} style={{ overflow:"hidden" }}>
            <RefTable/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIP stat row */}
      {userInfo && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          <StatBox label="Current VIP" value={currentVip.label} color={vipColor} sub={`${currentRP.toLocaleString("en-IN")} RP accumulated`}/>
          <StatBox label="RP to Next Level" value={nextVip ? Math.max(nextVip.min_rp - currentRP, 0).toLocaleString("en-IN")+" RP" : "Max Level"} color={nextVip?"#f59e0b":"#34d399"} sub={nextVip?`Next: ${nextVip.label}`:"Jackpot Diamond"}/>
          <StatBox label="Rolling %" value={`${(currentVip.rolling_pct*100).toFixed(0)}%`} color="#a78bfa" sub={`RP Rate ×${currentVip.rp_rate.toFixed(2)}`}/>
        </div>
      )}

      {/* No active casino accounts — blocks the whole form */}
      {userInfo && loadingPlayerCasinos && (
        <div style={{ padding:"12px 14px", borderRadius:10, background:C.hoverBg, border:`1px solid ${C.border}`, fontSize:12, color:C.muted }}>
          Loading this player's casino accounts…
        </div>
      )}
      {hasNoCasinoAccounts && (
        <div style={{ padding:"12px 14px", borderRadius:10, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.3)", fontSize:12, color:"#f87171", display:"flex", gap:8, alignItems:"flex-start", fontWeight:600 }}>
          <ShieldAlert size={14} style={{ flexShrink:0, marginTop:1 }}/>
          No active casino accounts found. This player has no recorded cash deposit at any casino — record a Cash Wallet deposit first before adding rolling points.
        </div>
      )}

      {/* Form Card */}
      <div style={{ padding:"16px", borderRadius:12, background:"rgba(167,139,250,0.04)", border:"1px solid rgba(167,139,250,0.18)", opacity: hasNoCasinoAccounts ? 0.45 : 1, pointerEvents: hasNoCasinoAccounts ? "none" : "auto" }}>

        {/* Header */}
        <div style={{ marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", fontSize:13, fontWeight:700, color:C.text }}>
            <TrendingUp size={13} style={{ color:COLOR, marginRight:8 }}/> Rolling Points Entry
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
            RP = Total Bet Amount ÷ 100. Same value as game level points.
          </div>
        </div>

        {/* Row 1 — Slip, Date, Country */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>

          {/* Slip Number */}
          <div>
            <label style={lbl(C)}><Hash size={9} style={{ display:"inline", marginRight:3 }}/>Slip Number *</label>
            <input
              value={rSlipNumber}
              onChange={e => { setRSlipNumber(e.target.value); setRSlipError(""); }}
              onBlur={e => checkSlipUnique(e.target.value)}
              placeholder="e.g. SLP-20260420-001"
              style={inp("#a78bfa", !!rSlipError, C)}
            />
            {rSlipChecking && <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Checking…</div>}
            {rSlipError && !rSlipChecking && (
              <div style={{ fontSize:10, color:"#f87171", marginTop:4, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                <AlertTriangle size={9}/>{rSlipError}
              </div>
            )}
            {rSlipNumber && !rSlipError && !rSlipChecking && (
              <div style={{ fontSize:10, color:"#34d399", marginTop:4, fontWeight:600 }}>✓ Available</div>
            )}
          </div>

          {/* Betting Date — only today's date is allowed (no past, no future) */}
          <div>
            <label style={lbl(C)}><Calendar size={9} style={{ display:"inline", marginRight:3 }}/>Betting Date *</label>
            <input
              value={rBettingDate}
              onChange={e => setRBettingDate(e.target.value)}
              type="date"
              min={TODAY}
              max={TODAY}
              style={{
                ...inp(rBettingDate && rBettingDate !== TODAY ? "#f87171" : "#60a5fa", rBettingDate && rBettingDate !== TODAY, C),
                colorScheme: theme === "dark" ? "dark" : "light",
              }}
            />
            {rBettingDate && rBettingDate !== TODAY && (
              <div style={{ fontSize:10, color:"#f87171", marginTop:4, fontWeight:600 }}>
                Only today's date is allowed for betting entries
              </div>
            )}
          </div>

          {/* Country — only countries where this player has actually deposited */}
          <div>
            <label style={lbl(C)}>Country *</label>
            <select value={country} onChange={e => { setCountry(e.target.value); setRCasino(""); }} style={sel("#60a5fa", C)}>
              <option value="">— Country —</option>
              {Object.keys(playerCasinos).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Casino — only casinos where this player has an active funded Cash wallet */}
        {country && casinosForCountry.length === 0 && (
          <div style={{ marginBottom:12, padding:"8px 12px", borderRadius:8, background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.2)", fontSize:11, color:"#fbbf24", display:"flex", gap:7, alignItems:"center" }}>
            <AlertTriangle size={12}/> No casino found for this player.
          </div>
        )}

        {/* Casino */}
        {country && (
          <div style={{ marginBottom:12 }}>
            <label style={lbl(C)}>Casino Name *</label>
            <select value={rCasino} onChange={e => setRCasino(e.target.value)} style={sel("#60a5fa", C)}>
              <option value="">— Select casino —</option>
              {casinosForCountry.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Row 2 — Bets, Bet Amount, Rolling %, RP Override */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:14 }}>

          <div>
            <label style={lbl(C)}>Total Bets (info)</label>
            <input
              value={rTotalBets}
              onChange={e => setRTotalBets(e.target.value)}
              type="number"
              placeholder="e.g. 500"
              style={inp("#a78bfa", undefined, C)}
            />
          </div>

          <div>
            <label style={lbl(C)}>
              Total Bet Amount ($) * <span style={{ color:"#a78bfa", fontWeight:400 }}>÷100=RP</span>
            </label>
            <input
              value={rTotalBetAmt}
              onChange={e => { setRTotalBetAmt(e.target.value); setRRpOverride(""); }}
              type="number"
              placeholder="e.g. 50000"
              style={inp("#f59e0b", undefined, C)}
            />
            {betAmt > 0 && (
              <div style={{ fontSize:10, color:"#f59e0b", marginTop:4, fontWeight:600 }}>
                Auto RP = {rpAutoCalc.toFixed(2)}
              </div>
            )}
          </div>

          <div>
            <label style={lbl(C)}>Rolling % (auto)</label>
            <div style={{
              padding:"9px 12px", borderRadius:8,
              background:"rgba(251,146,60,0.08)", border:"1px solid rgba(251,146,60,0.25)",
              fontSize:15, fontWeight:900, color:"#fb923c", fontFamily:"monospace",
              display:"flex", alignItems:"center", justifyContent:"space-between",
            }}>
              <span>{(currentVip.rolling_pct*100).toFixed(0)}%</span>
              <span style={{ fontSize:9, color:vipColor, fontWeight:700 }}>{currentVip.label}</span>
            </div>
          </div>

          <div>
            <label style={lbl(C)}>
              Rolling Points <span style={{ color:C.muted, fontWeight:400 }}>(override)</span>
            </label>
            <input
              value={rRpOverride !== "" ? rRpOverride : (betAmt > 0 ? rpAutoCalc.toFixed(2) : "")}
              onChange={e => setRRpOverride(e.target.value)}
              onFocus={() => { if (rRpOverride === "" && betAmt > 0) setRRpOverride(rpAutoCalc.toFixed(2)); }}
              type="number"
              placeholder={betAmt > 0 ? rpAutoCalc.toFixed(2) : "Enter bet amount first"}
              style={inp(rRpOverride !== "" ? "#34d399" : "#a78bfa", undefined, C)}
            />
            {rRpOverride !== "" && (
              <div style={{ fontSize:10, color:"#34d399", marginTop:4, fontWeight:600 }}>
                ✎ Manual override{" "}
                <button onClick={() => setRRpOverride("")} style={{ marginLeft:4, fontSize:9, color:"#f87171", background:"none", border:"none", cursor:"pointer" }}>
                  [reset]
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Session Preview */}
        {rpAdded > 0 && (
          <div style={{ padding:"12px 14px", borderRadius:10, marginBottom:14, background:"rgba(167,139,250,0.04)", border:"1px solid rgba(167,139,250,0.2)" }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#a78bfa", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>
              Session Preview
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                ["Bet Amount", `$${betAmt.toLocaleString("en-IN")}`,                                         "#f59e0b"],
                ["RP Earned",  `+${rpAdded.toFixed(2)}`,                                                     "#a78bfa"],
                ["New Total",  projRPTotal.toLocaleString("en-IN",{maximumFractionDigits:0}),                willVipLU?"#34d399":C.text],
                ["VIP After",  projVip.label,                                                                 willVipLU?"#34d399":VIP_COLORS[projVip.lvl-1]],
              ].map(([l,v,c]) => (
                <div key={l}>
                  <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:c, fontFamily:"monospace" }}>
                    {v}{l === "VIP After" && willVipLU ? " 🎉" : ""}
                  </div>
                </div>
              ))}
            </div>
            {willVipLU && (
              <div style={{ marginTop:10, padding:"7px 10px", borderRadius:7, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.25)", fontSize:11, color:"#34d399", fontWeight:600 }}>
                🎉 User will reach <b>{projVip.label}</b> after this session.
              </div>
            )}
          </div>
        )}

        {/* Note */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl(C)}>Session Note</label>
          <input
            value={rNote}
            onChange={e => setRNote(e.target.value)}
            placeholder="e.g. Saturday night session, Table 4"
            style={inp(undefined, undefined, C)}
          />
        </div>

        {/* Submit */}
        <button onClick={submitRP} disabled={!isValid} style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"center",
          gap:8, padding:"12px 0", borderRadius:9, border:"none",
          background: isValid ? "#7c3aed" : C.hoverBg,
          color: isValid ? "white" : C.dim,
          fontWeight:700, fontSize:13,
          cursor: isValid ? "pointer" : "not-allowed",
          transition: "background 0.2s",
        }}>
          <TrendingUp size={13}/> {submitting ? "Processing…" : "Save Rolling Points Entry"}
        </button>
      </div>
    </div>
  );
}