/**
 * CashWallet.jsx
 * Cash Wallet operations tab — Credit / Debit / Transfer / Main Account
 */

import React, { useState, useEffect } from "react";
import {
  DollarSign, Globe, ArrowDownLeft, ArrowUpRight,
  ArrowLeftRight, Wallet, AlertTriangle, ShieldAlert,
} from "lucide-react";
import { adminFetch, API, fmt } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const COLOR       = "#34d399";
const WALLET_TYPE = "C";

const CREDIT_TYPES = [
  { code:"DAC", label:"Deposit at Casino" },
  { code:"WIN", label:"Winnings (Admin Funded)" },
];
const DEBIT_TYPES = [
  { code:"WAC", label:"Withdraw at Casino" },
  { code:"LAC", label:"Lost at Casino" },
];
const MAIN_ACCOUNT_TYPES = [
  { code:"DMA", label:"Deposit to Main Account" },
  { code:"WMA", label:"Withdraw from Main Account" },
];

// These take the current theme's C object since they're plain functions,
// not components, and can't call hooks themselves. Usage: inp(accent, err, C)
const inp = (accent, err, C) => ({
  background:C.inputBg,
  border:`1px solid ${err?"#f8717155":accent?accent+"44":C.border}`,
  color:C.text, borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box",
});
const sel = (accent, C) => ({
  background:C.panelBg,
  border:`1px solid ${accent?accent+"44":C.border2}`,
  color:C.text, borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box", cursor:"pointer",
});
const lbl = (C) => ({
  display:"block", fontSize:10, fontWeight:700,
  color:C.muted, marginBottom:5,
  letterSpacing:"0.06em", textTransform:"uppercase",
});

const OP_TABS = [
  { id:"credit",   label:"Credit User",    Icon:ArrowDownLeft,  color:"#34d399" },
  { id:"debit",    label:"Debit User",      Icon:ArrowUpRight,   color:"#f87171" },
  { id:"transfer", label:"Casino→Casino",  Icon:ArrowLeftRight, color:"#60a5fa" },
  { id:"main",     label:"Main Account",   Icon:Wallet,         color:"#f59e0b" },
];

export default function CashWallet({ userInfo, accounts, casinos, submitting, setSubmitting, onToast, refreshUser, adminWallet, loadAdminWallet, userTotalCash   }) {
  const { C } = useAdminTheme();
  const adminBal   = adminWallet ? Number(adminWallet["cash_balance"] || 0) : 0;
  const WALLET_TYPE_ALIASES = { cash: "C", non_cash: "NC", otp: "O", rolling_points: "RP" }
  const userMainAcct = accounts?.find(a => 
  a.wallet_type === WALLET_TYPE || 
  WALLET_TYPE_ALIASES[a.wallet_type] === WALLET_TYPE
);
  const userMainBal  = Number(userMainAcct?.balance || 0);

  const [opMode,        setOpMode]        = useState("credit");
  const [country,       setCountry]       = useState("");
  const [casinoName,    setCasinoName]    = useState("");
  const [toCountry,     setToCountry]     = useState("");
  const [toCasino,      setToCasino]      = useState("");
  const [txnType,       setTxnType]       = useState("DAC");
  const [amount,        setAmount]        = useState("");
  const [note,          setNote]          = useState("");
  const [casinoWallets, setCasinoWallets] = useState({});
  const [loadingCW,     setLoadingCW]     = useState(false);

  const COUNTRIES           = Object.keys(casinos);
  const casinosForCountry   = casinos[country]   || [];
  const toCasinosForCountry = casinos[toCountry] || [];
  const amountNum           = parseFloat(amount) || 0;

  const insufficientFunds = opMode === "main"
    ? amountNum > adminBal
    : amountNum > userMainBal;

  useEffect(() => { setCasinoName(""); setCasinoWallets({}); }, [country]);
  useEffect(() => {
    if (opMode==="credit")   setTxnType("DAC");
    else if (opMode==="debit")    setTxnType("WAC");
    else if (opMode==="transfer") setTxnType("TAC");
    else if (opMode==="main")     setTxnType("DMA");
  }, [opMode]);

  useEffect(() => {
    if (!casinoName || !userInfo) return;
    setLoadingCW(true);
    adminFetch(`${API}/api/admin-panel/wallet/casino-wallets/?user_id=${userInfo.id}&casino_name=${encodeURIComponent(casinoName)}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.wallets||[]).forEach(w => { map[w.wallet_type] = Number(w.balance); });
        ["C","NC","O"].forEach(t => { if (!(t in map)) map[t] = 0; });
        setCasinoWallets(map);
      })
      .catch(() => {})
      .finally(() => setLoadingCW(false));
  }, [casinoName, userInfo]);

  const reloadCasinoWallets = async () => {
    if (!casinoName || !userInfo) return;
    const wr  = await adminFetch(`${API}/api/admin-panel/wallet/casino-wallets/?user_id=${userInfo.id}&casino_name=${encodeURIComponent(casinoName)}`);
    const wj  = await wr.json();
    const map = {};
    const normalize = { cash:"C", non_cash:"NC", otp:"O", rolling_points:"RP" };
    (wj.wallets||[]).forEach(w => {
    const key = normalize[w.wallet_type] || w.wallet_type;
  map[key] = Number(w.balance);
});
    ["C","NC","O"].forEach(t => { if (!(t in map)) map[t] = 0; });
    setCasinoWallets(map);
  };

  const handleSubmit = async () => {
    if (!userInfo)     return onToast("Select a user first", false);
    if (amountNum <= 0) return onToast("Enter a valid amount", false);
    if (opMode==="transfer" && !toCasino) return onToast("Select destination casino", false);
    if (insufficientFunds) {
      return onToast(
        opMode === "main"
          ? `Insufficient Admin Wallet Cash. Available: ${fmt(adminBal)}`
          : `Insufficient User Cash. Available: ${fmt(userMainBal)}`,
        false
      );
    }

    setSubmitting(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/deposits/offline/`, {
        method:"POST",
        body: JSON.stringify({
          user_id: userInfo.id, type:"cash",
          casino_name: opMode==="main" ? null : casinoName,
          wallet_type: WALLET_TYPE,
          amount: amountNum,
          transaction_type: txnType,
          note: note||undefined,
          transfer_to_casino: opMode==="transfer" ? toCasino : undefined,
          country: opMode==="main" ? undefined : country,
          transfer_to_country: opMode==="transfer" ? toCountry : undefined,
        }),
      });
      const j = await r.json();
      onToast(j.message||j.error, r.ok);
      if (r.ok) {
        setAmount(""); setNote("");
        await refreshUser();
        loadAdminWallet();
        await reloadCasinoWallets();
      }
    } catch { onToast("Submission failed", false); }
    setSubmitting(false);
  };

  const opColor = opMode==="credit"?"#34d399":opMode==="debit"?"#f87171":opMode==="main"?"#f59e0b":"#60a5fa";
  const isValid = amountNum > 0 && !submitting && !insufficientFunds &&
    (opMode==="main" || !!casinoName) &&
    (opMode!=="transfer" || !!toCasino);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* Admin + User Balance Header */}
      <div style={{ padding:"16px 18px", borderRadius:12, background:`${COLOR}06`, border:`1px solid ${COLOR}25` }}>
        <div style={{ fontSize:9, fontWeight:700, color:COLOR, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>
          🏦 Admin Wallet — Cash Balance
        </div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:32, fontWeight:900, fontFamily:"monospace", color:C.text, lineHeight:1 }}>{fmt(adminBal)}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Available to distribute</div>
          </div>
          {userInfo && (
            <div style={{ marginLeft:"auto", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[
                { label:"User Main Balance", val:fmt(userMainBal), color:COLOR, border:C.border },
                { label:"Total Main Balance",
    val: userTotalCash != null
  ? fmt(userTotalCash)
  : fmt(userMainBal),
    color:"#60a5fa", border:"rgba(96,165,250,0.2)"
  },
                { label:`Casino ${casinoName||"(none)"}`, val:casinoName?(loadingCW?"…":fmt(casinoWallets[WALLET_TYPE]??0)):"—", color:COLOR, border:C.border },
              ].map(({label,val,color,border}) => (
                <div key={label} style={{ padding:"8px 12px", borderRadius:8, background:C.hoverBg, border:`1px solid ${border}`, textAlign:"center" }}>
                  <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:15, fontWeight:800, fontFamily:"monospace", color }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Casino Selector */}
      {opMode !== "main" && (
        <div style={{ padding:"14px 16px", borderRadius:12, background:`${COLOR}06`, border:`1px solid ${COLOR}18` }}>
          <div style={{ marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:700, color:C.text }}>
            <Globe size={12} style={{ color:COLOR }}/> Casino Selection
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={lbl(C)}>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)} style={sel(COLOR, C)}>
                <option value="" style={{ background: C.panelBg, color: C.text }}>— Select country —</option>
                {COUNTRIES.map(c => <option key={c} value={c} style={{ background: C.panelBg, color: C.text }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl(C)}>Casino</label>
              <select value={casinoName} onChange={e => setCasinoName(e.target.value)} disabled={!country} style={sel(casinoName?"#34d399":COLOR, C)}>
                <option value="" style={{ background: C.panelBg, color: C.text }}>— Select casino —</option>
                {casinosForCountry.map(c => <option key={c.name} value={c.name} style={{ background: C.panelBg, color: C.text }}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {casinoName && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:8 }}>{casinoName} — User Casino Wallets</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {[["C","Cash","#34d399"],["NC","Non-Cash","#60a5fa"],["O","OTP","#a78bfa"]].map(([wt,wlabel,wcolor]) => (
                  <div key={wt} style={{ padding:"9px 11px", borderRadius:8, background:`${wcolor}${wt===WALLET_TYPE?"12":"06"}`, border:`1px solid ${wcolor}${wt===WALLET_TYPE?"35":"18"}` }}>
                    <div style={{ fontSize:9, color:wcolor, fontWeight:700 }}>{wlabel}{wt===WALLET_TYPE?" ← active":""}</div>
                    <div style={{ fontSize:16, fontWeight:900, color:C.text }}>{loadingCW?"…":fmt(casinoWallets[wt]??0)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Operation Card */}
      <div style={{ padding:"14px 16px", borderRadius:12, background:`${COLOR}04`, border:`1px solid ${C.border}` }}>
        {/* Op tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {OP_TABS.map(({ id, label, Icon, color:oc }) => (
            <button key={id} onClick={() => setOpMode(id)} style={{
              display:"flex", alignItems:"center", gap:7,
              padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600,
              cursor:"pointer", border:"none",
              background: opMode===id ? `${oc}18` : C.hoverBg,
              outline: opMode===id ? `1px solid ${oc}50` : `1px solid ${C.border}`,
              color: opMode===id ? oc : C.muted,
            }}>
              <Icon size={13}/> {label}
            </button>
          ))}
        </div>

        {!casinoName && opMode !== "main" && (
          <div style={{ marginBottom:14, padding:"8px 12px", borderRadius:8, background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.2)", fontSize:11, color:"#fbbf24", display:"flex", gap:7, alignItems:"center" }}>
            <AlertTriangle size={12}/> Select a casino above first.
          </div>
        )}

        {/* Info banners */}
        {opMode==="credit" && <InfoBanner color="#34d399">
  DAC → User pays | WIN → Admin pays
</InfoBanner>}
        {opMode==="debit"    && <InfoBanner color="#f87171">Debits user's casino wallet AND main wallet. Funds returned to Admin Wallet.</InfoBanner>}
        {opMode==="transfer" && <InfoBanner color="#60a5fa">TAC — Transfers between casinos. Admin Wallet unchanged.</InfoBanner>}
        {opMode==="main"     && <InfoBanner color="#f59e0b">DMA credits user's main balance from Admin Wallet. WMA debits from main balance back to Admin.</InfoBanner>}

        {/* Transfer destination */}
        {opMode==="transfer" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div style={{ padding:"10px 12px", borderRadius:8, background:C.hoverBg, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:9, color:C.muted, marginBottom:3, fontWeight:700, textTransform:"uppercase" }}>From</div>
              <div style={{ fontSize:13, fontWeight:600, color:casinoName?C.text:C.muted }}>{casinoName||"— not selected —"}</div>
            </div>
            <div>
              <label style={lbl(C)}>To Country</label>
              <select value={toCountry} onChange={e => { setToCountry(e.target.value); setToCasino(""); }} style={sel("#60a5fa", C)}>
                <option value="" style={{ background: C.panelBg, color: C.text }}>— Select —</option>
                {COUNTRIES.map(c => <option key={c} value={c} style={{ background: C.panelBg, color: C.text }}>{c}</option>)}
              </select>
            </div>
            {toCountry && (
              <div style={{ gridColumn:"2/3" }}>
                <label style={lbl(C)}>To Casino</label>
                <select value={toCasino} onChange={e => setToCasino(e.target.value)} style={sel("#60a5fa", C)}>
                  <option value="" style={{ background: C.panelBg, color: C.text }}>— Select —</option>
                  {toCasinosForCountry.map(c => <option key={c.name} value={c.name} style={{ background: C.panelBg, color: C.text }}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Txn type + amount */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <label style={lbl(C)}>Transaction Type</label>
            <select value={txnType} onChange={e => setTxnType(e.target.value)} style={sel(opColor, C)} disabled={opMode==="transfer"}>
              {opMode==="credit"   && CREDIT_TYPES.map(t => <option key={t.code} value={t.code} style={{ background: C.panelBg, color: C.text }}>{t.code} — {t.label}</option>)}
              {opMode==="debit"    && DEBIT_TYPES.map(t  => <option key={t.code} value={t.code} style={{ background: C.panelBg, color: C.text }}>{t.code} — {t.label}</option>)}
              {opMode==="transfer" && <option value="TAC" style={{ background: C.panelBg, color: C.text }}>TAC — Casino Transfer</option>}
              {opMode==="main"     && MAIN_ACCOUNT_TYPES.map(t => <option key={t.code} value={t.code} style={{ background: C.panelBg, color: C.text }}>{t.code} — {t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl(C)}>Amount ($)</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
              style={inp(insufficientFunds?"#f87171":COLOR, insufficientFunds, C)}/>
            {(opMode==="credit"||opMode==="main") && adminWallet && (
              <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
                {opMode==="main"
                  ? `Admin Cash: ${fmt(adminBal)} → ${fmt(Math.max(adminBal-amountNum,0))}`
                  : `User Cash: ${fmt(userMainBal)} → ${fmt(Math.max(userMainBal-amountNum,0))}`}
              </div>
            )}
          </div>
        </div>

        {insufficientFunds && amountNum > 0 && (
          <div style={{ marginBottom:12, padding:"10px 12px", borderRadius:8, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.3)", fontSize:12, color:"#f87171", display:"flex", gap:8, alignItems:"flex-start" }}>
            <ShieldAlert size={14} style={{ flexShrink:0, marginTop:1 }}/>
            <div>
              <b>Insufficient funds.</b> Need {fmt(amountNum)} but only {fmt(opMode==="main"?adminBal:userMainBal)} available in Cash.
            </div>
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <label style={lbl(C)}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Weekend winnings" style={inp(undefined, undefined, C)}/>
        </div>

        <button onClick={handleSubmit} disabled={!isValid} style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"center",
          gap:8, padding:"12px 0", borderRadius:9, border:"none",
          background: isValid ? opColor : C.hoverBg,
          color: isValid ? (opMode==="credit"?"#000":"white") : C.dim,
          fontWeight:700, fontSize:13, cursor:isValid?"pointer":"not-allowed",
        }}>
          {opMode==="credit"   ? <ArrowDownLeft size={13}/> : opMode==="debit" ? <ArrowUpRight size={13}/> : opMode==="main" ? <Wallet size={13}/> : <ArrowLeftRight size={13}/>}
          {submitting ? "Processing…" :
            opMode==="credit"   ? `Credit Cash — ${txnType}` :
            opMode==="debit"    ? `Debit Cash — ${txnType}`  :
            opMode==="main"     ? `${txnType==="DMA"?"Deposit to":"Withdraw from"} Main Account` :
            "Transfer (TAC)"}
        </button>
      </div>
    </div>
  );
}

function InfoBanner({ color, children }) {
  return (
    <div style={{ padding:"9px 12px", borderRadius:8, marginBottom:14, background:`${color}07`, border:`1px solid ${color}20`, fontSize:11, color, fontWeight:500 }}>
      → {children}
    </div>
  );
}