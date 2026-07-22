// AFFILIATE-WITHDRAWALS: new admin tab — safe to delete this file (and its
// entry in constants.js's ADMIN_TABS + the case in AdminPanel.jsx) to remove
// the feature.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Eye, X, Check, Clock, Ban, Banknote, AlertCircle } from "lucide-react";
import { Card, Btn, Table, Pagination, Textarea, rowHover } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtD, fmtDT, fmtN } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

const STATUS_TABS = [
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "processing", label: "Processing" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

function StatusPill({ status, C }) {
  const cfg = {
    pending:    { color: C.orange, label: "Pending" },
    processing: { color: C.blue,   label: "Processing" },
    approved:   { color: "#A78BFA", label: "Approved" },
    paid:       { color: C.green,  label: "Paid" },
    rejected:   { color: C.red,    label: "Rejected" },
    cancelled:  { color: C.muted,  label: "Cancelled" },
  }[status] || { color: C.muted, label: status || "—" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function AffiliateWithdrawalsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const loadSummary = useCallback(() => {
    adminFetch(`${API}/api/admin-panel/affiliate-withdrawals/summary/`)
      .then(r => r?.json())
      .then(j => { if (j) setSummary(j); });
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, status: tab, q });
    adminFetch(`${API}/api/admin-panel/affiliate-withdrawals/?${params}`)
      .then(r => r?.json())
      .then(j => { if (j) { setItems(j.results || []); setCount(j.count || 0); } })
      .finally(() => setLoading(false));
  }, [page, tab, q]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [loadList]);

  const refreshAll = () => { loadSummary(); loadList(); };

  const SUMMARY_CARDS = [
    { key: "pending", label: "Pending", icon: Clock, color: C.orange },
    { key: "processing", label: "Processing", icon: RefreshCw, color: C.blue },
    { key: "approved", label: "Approved", icon: Check, color: "#A78BFA" },
    { key: "paid", label: "Paid", icon: Banknote, color: C.green },
    { key: "rejected", label: "Rejected", icon: X, color: C.red },
    { key: "cancelled", label: "Cancelled", icon: Ban, color: C.muted },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {SUMMARY_CARDS.map(s => (
          <Card key={s.key} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <s.icon size={13} style={{ color: s.color }} />
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.text, fontFamily: "monospace" }}>
              {summary ? fmt(summary[s.key]?.total) : "—"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {summary ? `${fmtN(summary[s.key]?.count)} request${summary[s.key]?.count === 1 ? "" : "s"}` : ""}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setPage(1); }}
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
                border: tab === t.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
                background: tab === t.id ? `${C.gold}15` : "transparent",
                color: tab === t.id ? C.gold : C.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search reference, affiliate, txn hash…"
              style={{ padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", width: 240 }}
            />
          </div>
          <Btn outline small onClick={refreshAll}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table
        headers={["Reference", "Affiliate", "Method", "Amount", "Status", "Requested", "Reviewed By", ""]}
        loading={loading}
        colSpan={8}
        emptyText="No withdrawal requests in this view"
      >
        {items.map(row => (
          <tr key={row.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 11.5 }}>{row.request_reference}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              <div style={{ fontWeight: 700 }}>{row.affiliate_name || row.affiliate_email}</div>
              <div style={{ fontSize: 10.5, color: C.muted }}>{row.affiliate_email}</div>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{row.method_label}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace", fontWeight: 700, color: C.gold }}>{fmt(row.amount)}</td>
            <td style={{ padding: "11px 14px" }}><StatusPill status={row.status} C={C} /></td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtD(row.requested_at)}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{row.reviewed_by_name || "—"}</td>
            <td style={{ padding: "11px 14px" }}>
              <Btn small outline onClick={() => setDetailId(row.id)}><Eye size={12} /> Review</Btn>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} total={count} perPage={PAGE_SIZE} onChange={setPage} />

      {detailId && (
        <WithdrawalDetailModal
          id={detailId}
          C={C}
          onClose={() => setDetailId(null)}
          onDone={(msg, ok) => { onToast?.(msg, ok); if (ok) { setDetailId(null); refreshAll(); } }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail / review modal
// ─────────────────────────────────────────────────────────────────────────────

function WithdrawalDetailModal({ id, C, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null | "reject" | "mark-paid"
  const [reason, setReason] = useState("");
  const [txnHash, setTxnHash] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/affiliate-withdrawals/${id}/`)
      .then(r => r?.json())
      .then(j => { if (j && !j.error) setData(j); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (action, body = {}) => {
    setBusy(true);
    const r = await adminFetch(`${API}/api/admin-panel/affiliate-withdrawals/${id}/${action}/`, {
      method: "POST", body: JSON.stringify(body),
    });
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) onDone(j.message || "Done.", true);
    else onDone(j?.error || "Action failed.", false);
  };

  const status = data?.status;
  const canApprove = status === "pending";
  const canProcessing = status === "pending" || status === "approved";
  const canMarkPaid = status === "processing" || status === "approved";
  const canReject = status === "pending" || status === "processing" || status === "approved";
  const canCancel = status === "pending" || status === "processing" || status === "approved";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Withdrawal Review</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: 18 }}>
            {loading || !data ? (
              <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: C.text, fontWeight: 700 }}>{data.request_reference}</div>
                  <StatusPill status={data.status} C={C} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <DetailField C={C} label="Affiliate" value={`${data.affiliate_name || ""} (${data.affiliate_email})`} />
                  <DetailField C={C} label="UID" value={data.affiliate_uid} />
                  <DetailField C={C} label="Amount" value={fmt(data.amount)} highlight />
                  <DetailField C={C} label="Method" value={data.method_label} />
                  <DetailField C={C} label="Requested" value={fmtDT(data.requested_at)} />
                  <DetailField C={C} label="Last Updated" value={fmtDT(data.updated_at)} />
                  {data.txn_hash && <DetailField C={C} label="Txn Hash" value={data.txn_hash} />}
                  {data.payment_date && <DetailField C={C} label="Paid On" value={fmtDT(data.payment_date)} />}
                  {data.rejection_reason && <DetailField C={C} label="Rejection Reason" value={data.rejection_reason} full />}
                </div>

                {data.payment_detail?.details && (
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Payment Details</div>
                    <Card style={{ padding: 12, background: C.hoverBg }}>
                      {Object.entries(data.payment_detail.details).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
                          <span style={{ color: C.muted, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
                          <span style={{ color: C.text, fontFamily: "monospace", wordBreak: "break-all", textAlign: "right", marginLeft: 12 }}>{v}</span>
                        </div>
                      ))}
                    </Card>
                  </div>
                )}

                {data.status_history?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Status Timeline</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {data.status_history.map((h, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, fontSize: 12 }}>
                          <div style={{ color: C.muted, whiteSpace: "nowrap" }}>{fmtDT(h.created_at)}</div>
                          <div style={{ color: C.text }}>
                            {h.from_status ? `${h.from_status} → ` : ""}<b>{h.to_status}</b>
                            {h.changed_by_name && <span style={{ color: C.muted }}> by {h.changed_by_name}</span>}
                            {h.note && <div style={{ color: C.muted, fontSize: 11 }}>{h.note}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mode === "reject" && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    <Textarea label="Rejection Reason (required)" value={reason} onChange={setReason} placeholder="Explain why this request is being rejected…" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn small outline onClick={() => setMode(null)}>Cancel</Btn>
                      <Btn small color={C.red} disabled={!reason.trim() || busy} onClick={() => act("reject", { reason })}>
                        {busy ? "Submitting…" : "Confirm Reject"}
                      </Btn>
                    </div>
                  </div>
                )}

                {mode === "mark-paid" && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Transaction Hash (required)</label>
                    <input value={txnHash} onChange={e => setTxnHash(e.target.value)} placeholder="0x…"
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
                    <Textarea label="Note (optional)" value={note} onChange={setNote} placeholder="Internal note…" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn small outline onClick={() => setMode(null)}>Cancel</Btn>
                      <Btn small color={C.green} disabled={!txnHash.trim() || busy} onClick={() => act("mark-paid", { txn_hash: txnHash, note })}>
                        {busy ? "Submitting…" : "Confirm Paid"}
                      </Btn>
                    </div>
                  </div>
                )}

                {!mode && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    {canApprove && <Btn small color={C.green} disabled={busy} onClick={() => act("approve")}><Check size={12} /> Approve</Btn>}
                    {canProcessing && <Btn small color={C.blue} disabled={busy} onClick={() => act("processing")}><RefreshCw size={12} /> Move to Processing</Btn>}
                    {canMarkPaid && <Btn small color={C.green} disabled={busy} onClick={() => setMode("mark-paid")}><Banknote size={12} /> Mark Paid</Btn>}
                    {canReject && <Btn small outline color={C.red} disabled={busy} onClick={() => setMode("reject")}><X size={12} /> Reject</Btn>}
                    {canCancel && <Btn small outline color={C.muted} disabled={busy} onClick={() => act("cancel")}><Ban size={12} /> Cancel</Btn>}
                    {!canApprove && !canProcessing && !canMarkPaid && !canReject && (
                      <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                        <AlertCircle size={13} /> This request is in a final state — no further actions available.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DetailField({ C, label, value, highlight, full }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: highlight ? C.gold : C.text, fontWeight: highlight ? 800 : 500, fontFamily: highlight ? "monospace" : "inherit", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
