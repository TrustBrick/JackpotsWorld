// WALLET-REQUESTS: new component — safe to delete this file (and its
// import/usage in tabs/stats/WalletTab.jsx) to remove the feature.
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import { C } from "./constants";
import { authFetch, API, fmt } from "./helpers";

const inputStyle = (hasError) => ({
  width: "100%", padding: "11px 13px", borderRadius: 9,
  background: C.surface2, border: `1px solid ${hasError ? C.red : C.border}`,
  color: "white", fontSize: 14, outline: "none", boxSizing: "border-box",
});
const labelStyle = {
  display: "block", fontSize: 10, color: "rgba(255,255,255,0.38)",
  textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6,
};

export default function DepositRequestModal({ onClose, onSuccess, onError }) {
  const [methods, setMethods] = useState([]);
  const [casinos, setCasinos] = useState([]);
  const [methodCode, setMethodCode] = useState("");
  const [amount, setAmount] = useState("");
  const [country, setCountry] = useState("");
  const [casinoId, setCasinoId] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mRes, cRes] = await Promise.all([
        authFetch(`${API}/api/wallet/deposit-requests/methods/`),
        authFetch(`${API}/api/wallet/deposit-requests/casinos/`),
      ]);
      if (cancelled) return;
      if (mRes.ok) {
        const j = await mRes.json();
        setMethods(j.results || []);
        if (j.results?.length) setMethodCode(j.results[0].code);
      }
      if (cRes.ok) {
        const j = await cRes.json();
        setCasinos(j.results || []);
      }
      setLoadingOptions(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const countries = [...new Set(casinos.map(c => c.country))].sort();
  const casinosInCountry = country ? casinos.filter(c => c.country === country) : [];

  const amountNum = Number(amount);
  const amountError =
    amount === "" ? "" :
    Number.isNaN(amountNum) ? "Enter a valid amount." :
    amountNum <= 0 ? "Amount must be greater than zero." :
    "";

  const canContinue = amount !== "" && !amountError && methodCode;

  const method = methods.find(m => m.code === methodCode);
  const casino = casinos.find(c => String(c.id) === String(casinoId));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch(`${API}/api/wallet/deposit-requests/create/`, {
        method: "POST",
        body: JSON.stringify({
          amount, method_code: methodCode,
          casino_id: casinoId || null,
          notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        onSuccess(json.message || "Deposit request submitted.");
      } else {
        setError(json?.error || "Failed to submit deposit request.");
        setStep("form");
      }
    } catch {
      setError("Network error. Please try again.");
      setStep("form");
    }
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto",
          background: "linear-gradient(160deg, #14161f, #0a0b10)",
          border: `1px solid ${C.gold}35`, borderRadius: 20, padding: "24px 24px 28px",
          display: "flex", flexDirection: "column", gap: 16,
          position: "relative", boxShadow: "0 0 60px rgba(212,175,55,0.12), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: 8,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
            color: "rgba(255,255,255,0.4)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={14} />
        </button>

        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <Wallet size={16} style={{ color: C.gold }} />
            <span style={{ fontSize: 16, fontWeight: 900, color: C.gold }}>
              {step === "confirm" ? "Confirm Deposit" : "Request Deposit"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Credited to your Cash Wallet once approved</div>
        </div>

        {loadingOptions ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Loading…</div>
        ) : step === "confirm" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ConfirmRow label="Amount" value={fmt(amount)} highlight />
              <ConfirmRow label="Payment Method" value={method?.label || methodCode} />
              {casino && <ConfirmRow label="Casino" value={`${casino.name} (${casino.country})`} />}
            </div>
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("form")} disabled={submitting}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 10, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, border: "none", color: "#06080E", fontSize: 13, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "Submitting…" : <><CheckCircle2 size={14} /> Confirm & Submit</>}
              </button>
            </div>
          </>
        ) : methods.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
            No deposit methods are currently available. Please contact support.
          </div>
        ) : (
          <>
            <div>
              <label style={labelStyle}>Amount</label>
              <input
                type="number" min="0" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                style={inputStyle(!!amountError)}
              />
              {amountError && <div style={{ fontSize: 11, color: C.red, marginTop: 5 }}>{amountError}</div>}
            </div>

            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={methodCode} onChange={e => setMethodCode(e.target.value)} style={{ ...inputStyle(false), cursor: "pointer" }}>
                {methods.map(m => (
                  <option key={m.code} value={m.code} style={{ background: "#14161f" }}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Country (if applicable)</label>
              <select
                value={country}
                onChange={e => { setCountry(e.target.value); setCasinoId(""); }}
                style={{ ...inputStyle(false), cursor: "pointer" }}
              >
                <option value="" style={{ background: "#14161f" }}>Not applicable</option>
                {countries.map(c => (
                  <option key={c} value={c} style={{ background: "#14161f" }}>{c}</option>
                ))}
              </select>
            </div>

            {country && (
              <div>
                <label style={labelStyle}>Casino</label>
                <select value={casinoId} onChange={e => setCasinoId(e.target.value)} style={{ ...inputStyle(false), cursor: "pointer" }}>
                  <option value="" style={{ background: "#14161f" }}>Select a casino</option>
                  {casinosInCountry.map(c => (
                    <option key={c.id} value={c.id} style={{ background: "#14161f" }}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Anything we should know…"
                style={{ ...inputStyle(false), resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <button
              onClick={() => setStep("confirm")}
              disabled={!canContinue}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 13, fontWeight: 800,
                background: canContinue ? `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)` : "rgba(255,255,255,0.06)",
                color: canContinue ? "#06080E" : "rgba(255,255,255,0.3)",
                border: "none", cursor: canContinue ? "pointer" : "not-allowed",
              }}
            >
              Submit
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function ConfirmRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: highlight ? C.gold : "white", fontFamily: highlight ? "monospace" : "inherit", wordBreak: "break-all", textAlign: "right" }}>{value}</span>
    </div>
  );
}
