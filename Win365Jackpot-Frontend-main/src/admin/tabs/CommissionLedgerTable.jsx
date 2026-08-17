import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ChevronRight, FileText, X } from "lucide-react";
import { Btn, Table, Pagination, rowHover } from "../components/SharedUI";
import { adminFetch, API } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

// Mirrors ALLOWED_TRANSITIONS in commission_rule_views.py. Advisory only —
// the server re-checks every transition, so a stale tab can't skip a step.
const NEXT_STATUS = {
  pending: ["qualifying", "qualified", "rejected", "cancelled"],
  qualifying: ["qualified", "rejected", "cancelled"],
  qualified: ["approved", "rejected", "cancelled"],
  approved: ["payable", "rejected", "cancelled"],
  payable: ["paid", "rejected", "cancelled"],
  paid: [],
  rejected: [],
  cancelled: [],
};

const STATUS_TONE = {
  pending: "muted", qualifying: "orange", qualified: "blue",
  approved: "purple", payable: "teal", paid: "green",
  rejected: "red", cancelled: "muted",
};

const STATUS_FILTERS = [
  "", "pending", "qualifying", "qualified", "approved", "payable", "paid", "rejected", "cancelled",
];

function money(amount, currency) {
  return `${currency || "USD"} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * Read-only audit trail for one ledger entry — the Part 35 traceability
 * surface. Shows which rule and tier applied, every condition that was
 * evaluated, and the arithmetic that followed.
 */
function TraceDrawer({ entry, onClose }) {
  const { C } = useAdminTheme();
  if (!entry) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)",
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: "100%", height: "100%", overflowY: "auto",
          background: C.bg, borderLeft: `1px solid ${C.border}`, padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Calculation Trace</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, fontSize: 12.5, color: C.muted, marginBottom: 20 }}>
          <div><b style={{ color: C.text }}>Affiliate:</b> {entry.affiliate_email} ({entry.affiliate_uid})</div>
          <div><b style={{ color: C.text }}>Player:</b> {entry.player_uid || "—"}</div>
          <div><b style={{ color: C.text }}>Scope:</b> {entry.country || "—"} / {entry.casino_name || "—"}</div>
          <div><b style={{ color: C.text }}>Rule:</b> {entry.rule_name || "—"}{entry.tier_name ? ` → ${entry.tier_name}` : ""}</div>
          <div><b style={{ color: C.text }}>Base:</b> {money(entry.base_amount, entry.currency)}</div>
          <div><b style={{ color: C.text }}>Rate:</b> {entry.commission_rate}%</div>
          <div><b style={{ color: C.text }}>Commission:</b> {money(entry.commission_amount, entry.currency)}</div>
          {entry.reference_id && <div><b style={{ color: C.text }}>Reference:</b> {entry.reference_id}</div>}
        </div>

        {(entry.conditions_snapshot || []).length > 0 && (
          <>
            <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: C.gold, marginBottom: 8 }}>
              Conditions
            </h4>
            <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
              {entry.conditions_snapshot.map((c, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px", borderRadius: 8, fontSize: 12,
                    background: C.surface, border: `1px solid ${c.met ? `${C.green}44` : `${C.red}44`}`,
                    color: C.muted,
                  }}
                >
                  <span style={{ color: c.met ? C.green : C.red, fontWeight: 700 }}>{c.met ? "✓" : "✕"}</span>{" "}
                  {c.label} — actual: <b style={{ color: C.text }}>{c.actual ?? "n/a"}</b>
                </div>
              ))}
            </div>
          </>
        )}

        <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: C.gold, marginBottom: 8 }}>
          Trace
        </h4>
        <pre
          style={{
            whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11.5, lineHeight: 1.7,
            padding: 12, borderRadius: 8, background: C.surface,
            border: `1px solid ${C.border}`, color: C.muted, margin: 0,
          }}
        >
          {entry.calculation_trace || "No trace recorded."}
        </pre>

        {entry.qualification_reason && (
          <p style={{ fontSize: 12, color: C.muted, marginTop: 14 }}>
            <b style={{ color: C.text }}>Reason:</b> {entry.qualification_reason}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CommissionLedgerTable({ onToast, onChanged }) {
  const { C } = useAdminTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [trace, setTrace] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (statusFilter) qs.set("status", statusFilter);
    if (search.trim()) qs.set("search", search.trim());
    adminFetch(`${API}/api/admin-panel/commissions/ledger/?${qs}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        setItems(j.results || []);
        setTotal(j.count || 0);
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter, search]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const transition = async (entry, next) => {
    setBusyId(entry.id);
    const r = await adminFetch(`${API}/api/admin-panel/commissions/ledger/${entry.id}/transition/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusyId(null);
    if (!r) { onToast?.("Session expired", false); return; }
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      onToast?.(`Commission moved to ${next}`, true);
      load();
      onChanged?.();
    } else {
      onToast?.(body.error || "Transition failed", false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TraceDrawer entry={trace} onClose={() => setTrace(null)} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={13} style={{ position: "absolute", left: 10, color: C.muted, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Affiliate, UID, rule or reference…"
            style={{
              width: 260, maxWidth: "100%", padding: "7px 10px 7px 30px", borderRadius: 8,
              fontSize: 12.5, background: C.inputBg, border: `1px solid ${C.border}`,
              color: C.text, outline: "none",
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: "7px 10px", borderRadius: 8, fontSize: 12.5,
            background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none",
          }}
        >
          {STATUS_FILTERS.map(s => (
            <option key={s || "all"} value={s} style={{ background: C.surface, color: C.text }}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>{total} entries</span>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table
        headers={["Affiliate", "Player", "Country", "Casino", "Rule", "Base", "Rate", "Commission", "Status", "Created", ""]}
        loading={loading}
        colSpan={11}
        emptyText="No commission entries yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.affiliate_name || item.affiliate_email}
              <div style={{ fontSize: 11, color: C.sub, fontFamily: "monospace" }}>{item.affiliate_uid}</div>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace" }}>{item.player_uid || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.country || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.casino_name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.rule_name || "—"}
              {item.tier_name && <div style={{ fontSize: 11, color: C.gold }}>{item.tier_name}</div>}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {money(item.base_amount, item.currency)}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.commission_rate}%</td>
            <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, color: C.gold, whiteSpace: "nowrap" }}>
              {money(item.commission_amount, item.currency)}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <span
                style={{
                  padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  textTransform: "capitalize",
                  color: C[STATUS_TONE[item.status]] || C.text,
                  background: `${C[STATUS_TONE[item.status]] || C.text}18`,
                  border: `1px solid ${C[STATUS_TONE[item.status]] || C.text}44`,
                }}
              >
                {item.status}
              </span>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, color: C.sub, whiteSpace: "nowrap" }}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={() => setTrace(item)}
                  title="View calculation trace"
                  style={{
                    background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: "4px 6px", cursor: "pointer", color: C.muted, display: "flex",
                  }}
                >
                  <FileText size={13} />
                </button>
                {(NEXT_STATUS[item.status] || []).length > 0 && (
                  <select
                    value=""
                    disabled={busyId === item.id}
                    onChange={e => e.target.value && transition(item, e.target.value)}
                    style={{
                      padding: "4px 6px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                      background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none",
                    }}
                  >
                    <option value="" style={{ background: C.surface, color: C.text }}>Move to…</option>
                    {NEXT_STATUS[item.status].map(s => (
                      <option key={s} value={s} style={{ background: C.surface, color: C.text }}>
                        {s[0].toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}
