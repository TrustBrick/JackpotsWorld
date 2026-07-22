// AFFILIATE-WITHDRAWALS: new tab — safe to delete this file (and its entry
// in AffiliatePanel.jsx's TABS array / import line) to remove the feature.
import React, { useState, useEffect, useCallback } from "react";
import {
  Wallet, PiggyBank, Lock, TrendingUp, Banknote, Clock,
  ChevronLeft, ChevronRight, X, AlertCircle, CheckCircle2, Info,
} from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

const STATUS_STYLE = {
  pending:    { color: "#FB923C", bg: "rgba(251,146,60,0.15)", label: "Pending" },
  processing: { color: C.blue,    bg: `${C.blue}15`,           label: "Processing" },
  approved:   { color: "#A78BFA", bg: "rgba(167,139,250,0.15)", label: "Approved" },
  paid:       { color: C.green,   bg: `${C.green}15`,          label: "Paid" },
  rejected:   { color: C.red,     bg: `${C.red}15`,             label: "Rejected" },
  cancelled:  { color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.06)", label: "Cancelled" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

const PAGE_SIZE = 20;

export default function WalletTab({ onToast }) {
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [cancelling, setCancelling] = useState(null);

  const loadSummary = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/wallet/`);
    if (res?.ok) setSummary(await res.json());
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, status: statusFilter });
    const res = await affiliateFetch(`${API}/api/affiliate/wallet/withdrawals/?${params}`);
    if (res?.ok) {
      const json = await res.json();
      setRequests(json.results || []);
      setCount(json.count || 0);
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRequests(); }, [loadRequests]);

  const refreshAll = () => { loadSummary(); loadRequests(); };

  const handleCancel = async (id) => {
    setCancelling(id);
    const res = await affiliateFetch(`${API}/api/affiliate/wallet/withdrawals/${id}/cancel/`, { method: "POST" });
    const json = await res?.json().catch(() => ({}));
    if (res?.ok) {
      onToast?.(json.message || "Withdrawal request cancelled.", true);
      refreshAll();
    } else {
      onToast?.(json?.error || "Failed to cancel request.", false);
    }
    setCancelling(null);
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const canRequest = summary && summary.is_withdrawal_enabled && Number(summary.available_balance) >= Number(summary.minimum_withdrawal_amount);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Available Balance", value: summary ? fmt(summary.available_balance) : "—", icon: PiggyBank, color: C.green },
          { label: "Locked (In Review)", value: summary ? fmt(summary.locked_for_withdrawal) : "—", icon: Lock, color: "#FB923C" },
          { label: "Lifetime Earned", value: summary ? fmt(summary.lifetime_earned) : "—", icon: TrendingUp, color: C.gold },
          { label: "Lifetime Paid Out", value: summary ? fmt(summary.lifetime_paid) : "—", icon: Banknote, color: C.blue },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <s.icon size={14} style={{ color: s.color }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Request withdrawal panel */}
      <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Wallet size={14} style={{ color: C.gold }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Request a Withdrawal</div>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              {summary ? (
                <>Minimum withdrawal amount is <b style={{ color: C.gold }}>{fmt(summary.minimum_withdrawal_amount)}</b>
                  {summary.estimated_processing_time_text && <> · Typically processed in {summary.estimated_processing_time_text}</>}
                </>
              ) : "Loading…"}
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={!canRequest}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 10,
              background: canRequest ? `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)` : "rgba(255,255,255,0.06)",
              color: canRequest ? "#07080F" : "rgba(255,255,255,0.3)",
              border: "none", fontSize: 13, fontWeight: 800,
              cursor: canRequest ? "pointer" : "not-allowed",
            }}
          >
            <Wallet size={14} /> Request Withdrawal
          </button>
        </div>
        {summary && !summary.is_withdrawal_enabled && (
          <div style={{ marginTop: 12, fontSize: 12, color: C.red }}>Withdrawals are temporarily disabled. Please check back later.</div>
        )}
        {summary && summary.is_withdrawal_enabled && !canRequest && Number(summary.available_balance) < Number(summary.minimum_withdrawal_amount) && (
          <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            You need at least {fmt(summary.minimum_withdrawal_amount)} available to request a withdrawal.
          </div>
        )}
      </Card>

      {/* History */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Withdrawal History</div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(12,14,22,0.95)", border: `1px solid ${C.border}`, color: "white", fontSize: 12, outline: "none" }}>
            <option value="" style={{ background: "rgba(12,14,22,0.95)" }}>All Statuses</option>
            {Object.entries(STATUS_STYLE).map(([k, v]) => (
              <option key={k} value={k} style={{ background: "rgba(12,14,22,0.95)" }}>{v.label}</option>
            ))}
          </select>
        </div>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Reference", "Method", "Amount", "Status", "Requested", "Txn Hash", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 800, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, textShadow: "0 0 8px rgba(212,175,55,0.25)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading…</td></tr>
                ) : requests.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>No withdrawal requests yet.</td></tr>
                ) : requests.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{r.request_reference}</td>
                    <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.7)" }}>{r.method_label}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.gold, fontWeight: 700 }}>{fmt(r.amount)}</td>
                    <td style={{ padding: "11px 14px" }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.5)" }}>{fmtD(r.requested_at)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.txn_hash || "—"}</td>
                    <td style={{ padding: "11px 14px" }}>
                      {r.status === "pending" && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          disabled={cancelling === r.id}
                          style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.red}40`, background: `${C.red}12`, color: C.red, fontSize: 11, fontWeight: 700, cursor: cancelling === r.id ? "not-allowed" : "pointer" }}
                        >
                          {cancelling === r.id ? "Cancelling…" : "Cancel"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Page {page} of {totalPages} · {count} total</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  style={{ width: 28, height: 28, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: page <= 1 ? "rgba(255,255,255,0.15)" : "white", cursor: page <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  style={{ width: 28, height: 28, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: page >= totalPages ? "rgba(255,255,255,0.15)" : "white", cursor: page >= totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {showModal && summary && (
        <WithdrawalRequestModal
          summary={summary}
          onClose={() => setShowModal(false)}
          onSuccess={(msg) => { setShowModal(false); onToast?.(msg, true); refreshAll(); }}
          onError={(msg) => onToast?.(msg, false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Request modal — method select → amount + method-specific fields → confirm
// ─────────────────────────────────────────────────────────────────────────────

function WithdrawalRequestModal({ summary, onClose, onSuccess, onError }) {
  const methods = summary.enabled_methods || [];
  const [methodCode, setMethodCode] = useState(methods[0]?.code || "");
  const [amount, setAmount] = useState("");
  const [fields, setFields] = useState({});
  const [step, setStep] = useState("form"); // form | confirm
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const method = methods.find(m => m.code === methodCode) || methods[0];
  const available = Number(summary.available_balance);
  const minimum = Number(summary.minimum_withdrawal_amount);
  const amountNum = Number(amount);

  const amountError =
    amount === "" ? "" :
    Number.isNaN(amountNum) ? "Enter a valid amount." :
    amountNum <= 0 ? "Amount must be greater than zero." :
    amountNum < minimum ? `Minimum withdrawal is ${fmt(minimum)}.` :
    amountNum > available ? `Amount exceeds your available balance of ${fmt(available)}.` :
    "";

  const fieldsValid = (method?.field_schema || []).every(f => (fields[f] || "").trim().length > 0);
  const canContinue = method && amount !== "" && !amountError && fieldsValid;

  const fieldLabels = {
    network: "Network (e.g. TRC20, ERC20, BEP20)",
    wallet_address: "Wallet Address",
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    const res = await affiliateFetch(`${API}/api/affiliate/wallet/withdrawals/create/`, {
      method: "POST",
      body: JSON.stringify({ amount, method_code: methodCode, payment_details: fields }),
    });
    const json = await res?.json().catch(() => ({}));
    if (res?.ok) {
      onSuccess(json.message || "Withdrawal request submitted.");
    } else {
      setError(json?.error || "Failed to submit withdrawal request.");
      setStep("form");
    }
    setSubmitting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 460 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
              {step === "confirm" ? "Confirm Withdrawal" : "Request Withdrawal"}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {methods.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "20px 0" }}>
                No withdrawal methods are currently available. Please contact support.
              </div>
            ) : step === "confirm" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(96,165,250,0.1)", border: `1px solid ${C.blue}30` }}>
                  <Info size={14} style={{ color: C.blue, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
                    Double-check the details below — payments sent to an incorrect wallet address cannot be recovered.
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <ConfirmRow label="Method" value={method.label} />
                  <ConfirmRow label="Amount" value={fmt(amount)} highlight />
                  {(method.field_schema || []).map(f => (
                    <ConfirmRow key={f} label={fieldLabels[f] || f} value={fields[f]} />
                  ))}
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
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 10, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, border: "none", color: "#07080F", fontSize: 13, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer" }}>
                    {submitting ? "Submitting…" : <><CheckCircle2 size={14} /> Confirm & Submit</>}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  Available balance: <b style={{ color: C.green }}>{fmt(available)}</b> · Minimum: {fmt(minimum)}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Method</label>
                  <select value={methodCode} onChange={e => { setMethodCode(e.target.value); setFields({}); }}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                    {methods.map(m => (
                      <option key={m.code} value={m.code} style={{ background: "rgba(12,14,22,0.95)" }}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Amount</label>
                  <input
                    type="number" min="0" step="0.01" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={`Min. ${minimum}`}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${amountError ? C.red : C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                  {amountError && <div style={{ fontSize: 11, color: C.red, marginTop: 5 }}>{amountError}</div>}
                </div>

                {(method?.field_schema || []).map(f => (
                  <div key={f}>
                    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                      {fieldLabels[f] || f}
                    </label>
                    <input
                      type="text" value={fields[f] || ""}
                      onChange={e => setFields(prev => ({ ...prev, [f]: e.target.value }))}
                      placeholder={f === "network" ? "e.g. TRC20" : "Paste your address"}
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                ))}

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
                    color: canContinue ? "#07080F" : "rgba(255,255,255,0.3)",
                    border: "none", cursor: canContinue ? "pointer" : "not-allowed",
                  }}
                >
                  Continue
                </button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
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
