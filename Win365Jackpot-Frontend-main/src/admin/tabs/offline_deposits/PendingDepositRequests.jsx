/**
 * PendingDepositRequests — the selected player's open Deposit Requests, shown
 * as cards right under the player in Offline Transactions, so the admin never
 * has to remember (or go and look up) what the player asked for.
 *
 * "Complete Deposit" is the same action as in the Deposit Requests tab: it
 * credits the player's Cash wallet, writes the ledger row tagged with the
 * requested casino ("[CASINO:Ballys Casino] [C] DAC $1000 | …"), and moves the
 * request straight from Pending to Completed. There is no manual status step.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ArrowDownCircle, Check, Building2, CreditCard, Clock } from "lucide-react";
import { adminFetch, API, fmt, fmtDT } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

export default function PendingDepositRequests({ userId, onToast, onCompleted }) {
  const { C } = useAdminTheme();
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!userId) { setItems([]); return; }
    const params = new URLSearchParams({ user_id: userId, status: "pending" });
    adminFetch(`${API}/api/admin-panel/deposit-requests/?${params}`)
      .then(r => r?.json())
      .then(j => setItems(j?.results || []))
      .catch(() => setItems([]));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const complete = async (row) => {
    setBusyId(row.id);
    const r = await adminFetch(`${API}/api/admin-panel/deposit-requests/${row.id}/approve/`, {
      method: "POST", body: JSON.stringify({}),
    });
    const j = await r?.json().catch(() => ({}));
    setBusyId(null);
    if (r?.ok) {
      onToast?.(`Deposit ${row.request_reference} completed`, true);
      load();
      onCompleted?.();
    } else {
      onToast?.(j?.error || "Could not complete the deposit", false);
    }
  };

  if (!items.length) return null;

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
        <ArrowDownCircle size={13} /> Pending deposit request{items.length === 1 ? "" : "s"} ({items.length})
      </div>
      {items.map(row => (
        <div key={row.id} style={{
          padding: "12px 14px", borderRadius: 10,
          background: `${C.orange}0d`, border: `1px solid ${C.orange}40`,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: C.gold }}>{fmt(row.amount)}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: C.muted }}>{row.request_reference}</span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.text }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Building2 size={12} style={{ color: C.muted }} /> {row.casino_name || "No casino chosen"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <CreditCard size={12} style={{ color: C.muted }} /> {row.method_label || "—"}
                {row.payment_reference ? <span style={{ color: C.muted }}>· {row.payment_reference}</span> : null}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.muted }}>
                <Clock size={12} /> {fmtDT(row.requested_at)}
              </span>
            </div>
            {row.notes && <div style={{ fontSize: 11.5, color: C.muted }}>“{row.notes}”</div>}
          </div>
          <button
            onClick={() => complete(row)}
            disabled={busyId === row.id}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
              border: "none", background: C.green, color: "#000", fontWeight: 800, fontSize: 12,
              cursor: busyId === row.id ? "not-allowed" : "pointer", opacity: busyId === row.id ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            <Check size={13} /> {busyId === row.id ? "Completing…" : "Complete Deposit"}
          </button>
        </div>
      ))}
    </div>
  );
}
