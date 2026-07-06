/**
 * OtpWallet.jsx
 * OTP Wallet tab — direct credit to user's OTP wallet (no claim required)
 * Backend: POST /api/admin/wallet/otp/
 * Deducted from Admin OTP balance.
 */

import React, { useState } from "react";
import {
  Zap, DollarSign, FileText, CheckCircle,
  ShieldAlert, Wallet,
} from "lucide-react";
import { adminFetch, API, fmt } from "../../helpers";

const COLOR = "#a78bfa";

const OTP_TYPES = [
  { code:"OTP_CREDIT",    label:"OTP Credit" },
  { code:"OTP_BONUS",     label:"OTP Bonus" },
  { code:"OTP_REWARD",    label:"OTP Reward" },
  { code:"OTP_CASHBACK",  label:"OTP Cashback" },
  { code:"OTP_LEVELUP",   label:"OTP Level Up" },
  { code:"OTP_EVENT",     label:"OTP Event" },
  { code:"OTP_REFUND",    label:"OTP Refund" },
];

const inp = (accent, err) => ({
  background:"rgba(255,255,255,0.04)",
  border:`1px solid ${err?"#f8717155":accent?accent+"44":"rgba(255,255,255,0.1)"}`,
  color:"white", borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box",
});
const sel = (accent) => ({
  background:"rgba(12,14,22,0.95)",
  border:`1px solid ${accent?accent+"44":"rgba(255,255,255,0.12)"}`,
  color:"white", borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box", cursor:"pointer",
});
const lbl = {
  display:"block", fontSize:10, fontWeight:700,
  color:"rgba(255,255,255,0.4)", marginBottom:5,
  letterSpacing:"0.06em", textTransform:"uppercase",
};

export default function OtpWallet({ userInfo, accounts, submitting, setSubmitting, onToast, refreshUser, adminWallet, loadAdminWallet }) {
  const adminBal    = adminWallet ? Number(adminWallet["otp_balance"] || 0) : 0;
  const userOtpAcct = accounts?.find(a => a.wallet_type === "O");
  const userOtpBal  = Number(userOtpAcct?.balance || 0);

  const [amount,    setAmount]    = useState("");
  const [otpType,   setOtpType]   = useState("OTP_CREDIT");
  const [note,      setNote]      = useState("");
  const [lastTxn,   setLastTxn]   = useState(null);

  const amountNum = parseFloat(amount) || 0;
  const insufficient = amountNum > adminBal;
  const isValid   = amountNum > 0 && !!userInfo && !submitting && !insufficient;

  const handleSubmit = async () => {
    if (!userInfo)     return onToast("Select a user first", false);
    if (amountNum <= 0) return onToast("Enter a valid amount", false);
    if (insufficient)  return onToast(`Insufficient Admin OTP balance. Available: ${fmt(adminBal)}`, false);

    setSubmitting(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/wallet/otp/`, {
        method:"POST",
        body: JSON.stringify({
          user_id:  userInfo.id,
          amount:   amountNum,
          otp_type: otpType,
          note:     note.trim() || `OTP reward ${new Date().toLocaleDateString("en-IN")}`,
        }),
      });
      const j = await r.json();
      onToast(j.message||j.error, r.ok);
      if (r.ok) {
        setLastTxn({ amount:amountNum, otpType, user: userInfo.name||userInfo.email, newBal: j.otp_balance });
        setAmount(""); setNote("");
        await refreshUser();
        loadAdminWallet();
      }
    } catch { onToast("Submission failed", false); }
    setSubmitting(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* Admin + User Balance Header */}
      <div style={{ padding:"16px 18px", borderRadius:12, background:`${COLOR}06`, border:`1px solid ${COLOR}25` }}>
        <div style={{ fontSize:9, fontWeight:700, color:COLOR, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>
          ⚡ Admin Wallet — OTP Balance
        </div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:32, fontWeight:900, fontFamily:"monospace", color:"white", lineHeight:1 }}>{fmt(adminBal)}</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>Available to distribute</div>
          </div>
          {userInfo && (
            <div style={{ marginLeft:"auto" }}>
              <div style={{ padding:"10px 16px", borderRadius:10, background:`${COLOR}10`, border:`1px solid ${COLOR}30`, textAlign:"center", minWidth:140 }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", marginBottom:4 }}>
                  <Wallet size={9} style={{ display:"inline", marginRight:3 }}/> User OTP Balance
                </div>
                <div style={{ fontSize:22, fontWeight:900, fontFamily:"monospace", color:COLOR }}>{fmt(userOtpBal)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Direct credit notice */}
      <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(167,139,250,0.06)", border:"1px solid rgba(167,139,250,0.2)", fontSize:11, color:COLOR, fontWeight:500, display:"flex", alignItems:"center", gap:8 }}>
        <Zap size={13} style={{ flexShrink:0 }}/>
        Instantly credits the OTP wallet. <b>No claim required</b> by the user. Deducted from Admin OTP balance.
      </div>

      {/* Last transaction */}
      {lastTxn && (
        <div style={{ padding:"12px 14px", borderRadius:10, background:"rgba(52,211,153,0.07)", border:"1px solid rgba(52,211,153,0.25)", display:"flex", alignItems:"center", gap:10 }}>
          <CheckCircle size={16} style={{ color:"#34d399", flexShrink:0 }}/>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"#34d399" }}>OTP Credited Successfully</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
              ${lastTxn.amount} · {OTP_TYPES.find(o=>o.code===lastTxn.otpType)?.label} → {lastTxn.user}
              {lastTxn.newBal !== undefined && ` · New OTP Balance: ${fmt(lastTxn.newBal)}`}
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div style={{ padding:"16px", borderRadius:12, background:`${COLOR}04`, border:`1px solid ${COLOR}18` }}>
        {/* Header */}
        <div style={{ marginBottom:14, paddingBottom:12, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:700, color:"white", marginBottom:4 }}>
            <Zap size={13} style={{ color:COLOR }}/> OTP Wallet — Direct Credit
          </div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>
            Instantly credits the OTP wallet. No claim required by the user.
          </div>
        </div>

        {/* Amount + OTP Type + Note */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:12, marginBottom:14 }}>
          <div>
            <label style={lbl}><DollarSign size={9} style={{ display:"inline", marginRight:3 }}/>OTP Amount ($) *</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="e.g. 250"
              style={inp(insufficient?"#f87171":COLOR, insufficient)}/>
            {amountNum > 0 && !insufficient && (
              <div style={{ fontSize:10, color:COLOR, marginTop:4, fontWeight:600, fontFamily:"monospace" }}>
                Admin OTP: {fmt(adminBal)} → {fmt(Math.max(adminBal-amountNum,0))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>OTP Type</label>
            <select value={otpType} onChange={e => setOtpType(e.target.value)} style={sel(COLOR)}>
              {OTP_TYPES.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}><FileText size={9} style={{ display:"inline", marginRight:3 }}/>Note</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder={`e.g. OTP reward ${new Date().toLocaleDateString("en-IN")}`}
              style={inp()}/>
          </div>
        </div>

        {/* Insufficient Warning */}
        {insufficient && amountNum > 0 && (
          <div style={{ marginBottom:12, padding:"10px 12px", borderRadius:8, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.3)", fontSize:12, color:"#f87171", display:"flex", gap:8, alignItems:"flex-start" }}>
            <ShieldAlert size={14} style={{ flexShrink:0, marginTop:1 }}/>
            <div>
              <b>Insufficient Admin OTP balance.</b> Need {fmt(amountNum)} but only {fmt(adminBal)} available.
              <br/><span style={{ fontSize:10, opacity:0.7 }}>Ask Super Admin to top up the OTP wallet.</span>
            </div>
          </div>
        )}

        {/* Preview */}
        {amountNum > 0 && userInfo && !insufficient && (
          <div style={{ padding:"11px 13px", borderRadius:9, marginBottom:14, background:`${COLOR}06`, border:`1px solid ${COLOR}20` }}>
            <div style={{ fontSize:9, color:COLOR, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Transaction Preview</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
              {[
                ["Recipient",    userInfo.name||userInfo.email, "white"],
                ["Amount",       fmt(amountNum),                COLOR],
                ["Type",         OTP_TYPES.find(o=>o.code===otpType)?.label, "#a78bfa"],
                ["User OTP After", fmt(userOtpBal+amountNum),   "#34d399"],
              ].map(([l,v,c]) => (
                <div key={l}>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", marginBottom:2 }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:c, fontFamily:"monospace", wordBreak:"break-all" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSubmit} disabled={!isValid} style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"center",
          gap:8, padding:"12px 0", borderRadius:9, border:"none",
          background: isValid ? COLOR : "rgba(255,255,255,0.06)",
          color: isValid ? "#000" : "rgba(255,255,255,0.2)",
          fontWeight:700, fontSize:13, cursor:isValid?"pointer":"not-allowed",
          transition:"opacity 0.15s",
        }}>
          <Zap size={13}/>
          {submitting ? "Processing…" : "Add OTP Points"}
        </button>
      </div>
    </div>
  );
}