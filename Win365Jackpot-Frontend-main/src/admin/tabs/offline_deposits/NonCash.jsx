/**
 * NonCash.jsx
 * Non-Cash Wallet tab — sends a pending gift bonus to user
 * User must claim the gift; it then credits their NC wallet.
 * Backend: POST /api/admin/wallet/bonus/
 */

import React, { useState } from "react";
import {
  Gift, DollarSign, Tag, FileText, Clock,
  CheckCircle, AlertTriangle, Send, Info,
} from "lucide-react";
import { adminFetch, API, fmt } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const COLOR = "#60a5fa";

const GIFT_TYPES = [
  { code:"manual",        label:"Manual Gift" },
  { code:"bonus",         label:"Bonus" },
  { code:"cashback",      label:"Cashback" },
  { code:"referral",      label:"Referral Bonus" },
  { code:"vip_upgrade",   label:"Level Up Bonus" },
  { code:"tournament",    label:"Event Reward" },
  { code:"welcome",       label:"Welcome Bonus" },
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

export default function NonCash({ userInfo, submitting, setSubmitting, onToast, refreshUser, adminWallet }){
  const { C } = useAdminTheme();
  const [amount,      setAmount]      = useState("");
  const [giftType,    setGiftType]    = useState("manual_gift");
  const [description, setDescription] = useState("");
  const [note,        setNote]        = useState("");
  const [expiryDate,  setExpiryDate]  = useState("");
  const [expiryTime,  setExpiryTime]  = useState("23:59");
  const [lastGift,    setLastGift]    = useState(null);

  const amountNum = parseFloat(amount) || 0;
  const adminBalance = Number(adminWallet?.non_cash_balance || 0);

const isValid =
  amountNum > 0 &&
  !!userInfo &&
  !submitting &&
  adminBalance >= amountNum;

  const handleSubmit = async () => {
    if (!userInfo)     return onToast("Select a user first", false);
    if (amountNum <= 0) return onToast("Enter a valid bonus amount", false);

    let expires_at = null;
    if (expiryDate) {
      expires_at = `${expiryDate}T${expiryTime || "23:59"}:00`;
    }

    setSubmitting(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/wallet/bonus/`, {
        method:"POST",
        body: JSON.stringify({
          user_id:     userInfo.id,
          amount:      amountNum,
          gift_type:   giftType,
          description: description.trim() || `${GIFT_TYPES.find(g=>g.code===giftType)?.label || "Bonus"} for ${userInfo.name||userInfo.email}`,
          note:        note.trim() || undefined,
          expires_at,
        }),
      });
      const j = await r.json();
      const formatError = (err) => {
  if (typeof err === "string") return err;
  if (typeof err === "object") return Object.values(err).flat().join(", ");
  return "Something went wrong";
};

onToast(j.message || formatError(j.error), r.ok);
      if (r.ok) {
        setLastGift({ amount:amountNum, giftType, description, user: userInfo.name||userInfo.email });
        setAmount(""); setDescription(""); setNote(""); setExpiryDate(""); setExpiryTime("23:59");
        await refreshUser();
      }
    } catch { onToast("Submission failed", false); }
    setSubmitting(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* How it works banner */}
      <div style={{ padding:"14px 16px", borderRadius:12, background:"rgba(96,165,250,0.05)", border:"1px solid rgba(96,165,250,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <Info size={14} style={{ color:COLOR }}/>
          <span style={{ fontSize:12, fontWeight:700, color:COLOR }}>How Non-Cash Bonus Works</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {[
            { step:"1", title:"Admin Sends Gift", desc:"Creates a pending gift record for the user", color:"#60a5fa" },
            { step:"2", title:"User Claims It",   desc:"User sees the gift and taps Claim in their app", color:"#a78bfa" },
            { step:"3", title:"NC Wallet Credited", desc:"Non-Cash balance is instantly added on claim", color:"#34d399" },
          ].map(({ step, title, desc, color }) => (
            <div key={step} style={{ padding:"10px 12px", borderRadius:9, background:`${color}08`, border:`1px solid ${color}20`, textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:900, fontFamily:"monospace", color, lineHeight:1, marginBottom:4 }}>{step}</div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:10, color:C.muted }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>


      {/* Admin Wallet Balance */}
{adminWallet && (
  <div style={{
    padding:"12px 14px",
    borderRadius:10,
    background:"rgba(96,165,250,0.08)",
    border:"1px solid rgba(96,165,250,0.25)",
    display:"flex",
    justifyContent:"space-between",
    alignItems:"center"
  }}>
    <div>
      <div style={{ fontSize:10, color:C.muted }}>
        ADMIN BONUS WALLET (NON-CASH)
      </div>
      <div style={{
        fontSize:16,
        fontWeight:900,
        fontFamily:"monospace",
        color:"#60a5fa"
      }}>
        ${Number(adminWallet.non_cash_balance || 0).toLocaleString("en-IN")}
      </div>
    </div>

    {Number(adminWallet.non_cash_balance || 0) <= 0 && (
      <div style={{
        fontSize:10,
        color:"#f87171",
        fontWeight:700
      }}>
        LOW BALANCE ⚠️
      </div>
    )}
  </div>
)}

      {/* Last gift sent */}
      {lastGift && (
        <div style={{ padding:"12px 14px", borderRadius:10, background:"rgba(52,211,153,0.07)", border:"1px solid rgba(52,211,153,0.25)", display:"flex", alignItems:"center", gap:10 }}>
          <CheckCircle size={16} style={{ color:"#34d399", flexShrink:0 }}/>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"#34d399" }}>Gift Sent Successfully</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
              ${lastGift.amount} · {GIFT_TYPES.find(g=>g.code===lastGift.giftType)?.label} → {lastGift.user}
            </div>
          </div>
        </div>
      )}

      

      {/* Form */}
      <div style={{ padding:"16px", borderRadius:12, background:"rgba(96,165,250,0.04)", border:"1px solid rgba(96,165,250,0.18)" }}>
        {/* Header */}
        <div style={{ marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:700, color:C.text, marginBottom:4 }}>
            <Gift size={13} style={{ color:COLOR }}/> Send Bonus (Non-Cash)
          </div>
          <div style={{ fontSize:11, color:C.muted }}>Creates a pending gift. The user must claim it before it's credited to their Non-Cash wallet.</div>
        </div>

        {/* Amount + Gift Type */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <label style={lbl(C)}><DollarSign size={9} style={{ display:"inline", marginRight:3 }}/>Bonus Amount ($) *</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="e.g. 500" style={inp(COLOR, undefined, C)}/>
            {amountNum > 0 && (
              <div style={{ fontSize:10, color:COLOR, marginTop:4, fontWeight:600, fontFamily:"monospace" }}>
                ${amountNum.toLocaleString("en-IN")} Non-Cash bonus
              </div>
            )}
          </div>
          <div>
            <label style={lbl(C)}><Tag size={9} style={{ display:"inline", marginRight:3 }}/>Bonus Type</label>
            <select value={giftType} onChange={e => setGiftType(e.target.value)} style={sel(COLOR, C)}>
              {GIFT_TYPES.map(g => <option key={g.code} value={g.code} style={{ background: C.panelBg, color: C.text }}>{g.label}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl(C)}><FileText size={9} style={{ display:"inline", marginRight:3 }}/>Description (shown to user)</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            placeholder={`e.g. Welcome bonus for new member`}
            style={inp(COLOR, undefined, C)}/>
        </div>

        {/* Expiry */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl(C)}><Clock size={9} style={{ display:"inline", marginRight:3 }}/>Expiry (optional)</label>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:8 }}>
            <input value={expiryDate} onChange={e => setExpiryDate(e.target.value)} type="date" style={inp("#f59e0b", undefined, C)}/>
            <input value={expiryTime} onChange={e => setExpiryTime(e.target.value)} type="time" style={inp("#f59e0b", undefined, C)}/>
          </div>
          {!expiryDate && (
            <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>No expiry — gift remains claimable indefinitely</div>
          )}
        </div>

        {/* Internal Note */}
        <div style={{ marginBottom:14 }}>
          <label style={lbl(C)}>Internal Note (not shown to user)</label>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Internal reference note"
            style={inp(undefined, undefined, C)}/>
        </div>

        {/* Preview */}
        {amountNum > 0 && userInfo && (
          <div style={{ padding:"11px 13px", borderRadius:9, marginBottom:14, background:"rgba(96,165,250,0.05)", border:"1px solid rgba(96,165,250,0.2)" }}>
            <div style={{ fontSize:9, color:COLOR, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Gift Preview</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              <div>
                <div style={{ fontSize:9, color:C.muted, marginBottom:2 }}>Recipient</div>
                <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{userInfo.name||userInfo.email}</div>
              </div>
              <div>
                <div style={{ fontSize:9, color:C.muted, marginBottom:2 }}>Amount</div>
                <div style={{ fontSize:16, fontWeight:900, fontFamily:"monospace", color:COLOR }}>${amountNum.toLocaleString("en-IN")}</div>
              </div>
              <div>
                <div style={{ fontSize:9, color:C.muted, marginBottom:2 }}>Type</div>
                <div style={{ fontSize:12, fontWeight:700, color:"#a78bfa" }}>{GIFT_TYPES.find(g=>g.code===giftType)?.label}</div>
              </div>
            </div>
          </div>
        )}

        <button onClick={handleSubmit} disabled={!isValid} style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"center",
          gap:8, padding:"12px 0", borderRadius:9, border:"none",
          background: isValid ? COLOR : C.hoverBg,
          color: isValid ? "#000" : C.dim,
          fontWeight:700, fontSize:13, cursor:isValid?"pointer":"not-allowed",
          transition:"opacity 0.15s",
        }}>
          <Send size={13}/>
          {submitting ? "Sending Gift…" : "Send Bonus Gift"}
        </button>
      </div>
    </div>
  );
}