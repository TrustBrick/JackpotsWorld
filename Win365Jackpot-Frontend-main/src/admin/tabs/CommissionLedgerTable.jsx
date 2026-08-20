import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Search, ChevronRight, FileText, X, Plus, Gift } from "lucide-react";
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

const BASE = "/api/admin-panel/commissions";

const STATUS_FILTERS = [
  "", "pending", "qualifying", "qualified", "approved", "payable", "paid", "rejected", "cancelled",
];

// Mirrors LEDGER_COMMISSION_TYPES in commission_rule_models.py. "manual" is
// the one canonical value — the same string in the database, the API and here.
const TYPE_FILTERS = [
  { value: "", label: "All types" },
  { value: "deposit", label: "Deposit" },
  { value: "losing", label: "Losing" },
  { value: "rolling", label: "Rolling" },
  { value: "manual", label: "Manual / Bonus" },
];

const TYPE_LABEL = {
  deposit: "Deposit", losing: "Losing", rolling: "Rolling", manual: "Manual / Bonus",
};

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

/**
 * Add Manual Commission — the Back Office side of the fourth commission type.
 *
 * Every financial decision is the backend's: this form states who, how much
 * and why, and renders back exactly what the server reports it committed.
 * The success message is driven by the response body rather than assumed
 * from the click, so the admin is never told a credit failed that actually
 * landed (or vice versa).
 */
function ManualCommissionModal({ onClose, onToast, onCreated }) {
  const { C } = useAdminTheme();
  const [affiliates, setAffiliates] = useState([]);
  const [form, setForm] = useState({
    affiliate: "", amount: "", currency: "USD", reason: "", note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // One key per opened form. A double-click therefore sends the *same* key
  // twice and the backend de-duplicates on it — the disabled button below is
  // a convenience, not the guarantee.
  const idempotencyKey = useRef(
    (globalThis.crypto?.randomUUID?.() || `mc-${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 64)
  );

  useEffect(() => {
    adminFetch(`${API}/api/admin-panel/affiliates/`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        const list = Array.isArray(j) ? j : (j.results || []);
        setAffiliates(list.map(a => ({
          id: a.user_id ?? a.id, name: a.name, email: a.email, user_uid: a.user_uid,
        })).filter(a => a.id));
      })
      .catch(() => {});
  }, []);

  const set = patch => { setForm(f => ({ ...f, ...patch })); setError(""); };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    const r = await adminFetch(`${API}${BASE}/manual/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliate: Number(form.affiliate),
        amount: form.amount,
        currency: form.currency,
        commission_type: "manual",
        reason: form.reason,
        note: form.note,
        idempotency_key: idempotencyKey.current,
      }),
    });
    setSaving(false);

    if (!r) { setError("Session expired. Please sign in again."); return; }
    const body = await r.json().catch(() => ({}));

    // Trust the response, not the click. 200 is a de-duplicated repeat and is
    // just as successful as the 201 that created it.
    if (r.ok && body.success) {
      setResult(body);
      onToast?.(body.message || "Manual commission added successfully.", true);
      onCreated?.();
      return;
    }

    // Surface what the server actually objected to, field errors included,
    // rather than a generic failure.
    const detail = body.error
      || (body && Object.entries(body).filter(([k]) => k !== "success")
            .map(([k, v]) => `${k}: ${[].concat(v).join(" ")}`)[0])
      || "Could not add the commission.";
    setError(detail);
    onToast?.(detail, false);
  };

  const selected = affiliates.find(a => String(a.id) === String(form.affiliate));
  const canSubmit = form.affiliate && Number(form.amount) > 0 && form.reason.trim() && !saving;

  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 700, marginBottom: 6,
    color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em",
  };
  const input = {
    width: "100%", padding: "9px 11px", borderRadius: 8, fontSize: 13,
    background: C.inputBg, border: `1px solid ${C.border}`, color: C.text,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        overflowY: "auto", padding: "40px 16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "100%", background: C.bg,
          border: `1px solid ${C.border}`, borderRadius: 14, padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
            <Gift size={15} style={{ color: C.gold }} /> Add Manual Commission
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 18 }}>
          A discretionary credit. It needs no deposit, loss or betting activity, and is added to the
          affiliate&rsquo;s available commission immediately.
        </p>

        {result ? (
          <div style={{
            padding: 16, borderRadius: 10,
            background: `${C.green}12`, border: `1px solid ${C.green}44`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.green, marginBottom: 8 }}>
              {result.message}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, display: "grid", gap: 4 }}>
              <div>Amount credited: <b style={{ color: C.text }}>{result.currency} {result.amount}</b></div>
              <div>Affiliate&rsquo;s available commission: <b style={{ color: C.gold }}>{result.available_commission}</b></div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Btn onClick={onClose}>Done</Btn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={labelStyle}>Affiliate</label>
                <select value={form.affiliate} onChange={e => set({ affiliate: e.target.value })} style={input}>
                  <option value="" style={{ background: C.surface, color: C.text }}>Select affiliate…</option>
                  {affiliates.map(a => (
                    <option key={a.id} value={a.id} style={{ background: C.surface, color: C.text }}>
                      {a.name || a.email} ({a.user_uid})
                    </option>
                  ))}
                </select>
                {selected && (
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5 }}>{selected.email}</div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input
                    type="number" min="0.01" step="0.01" inputMode="decimal"
                    value={form.amount} onChange={e => set({ amount: e.target.value })}
                    placeholder="100.00" style={input}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Currency</label>
                  <select value={form.currency} onChange={e => set({ currency: e.target.value })} style={input}>
                    <option value="USD" style={{ background: C.surface, color: C.text }}>USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Commission Type</label>
                <input value="Manual / Bonus" disabled style={{ ...input, opacity: 0.7, cursor: "not-allowed" }} />
              </div>

              <div>
                <label style={labelStyle}>Reason <span style={{ color: C.red }}>*</span></label>
                <input
                  value={form.reason} onChange={e => set({ reason: e.target.value })}
                  placeholder="Special Promotional Reward" maxLength={255} style={input}
                />
                <div style={{ fontSize: 11, color: C.sub, marginTop: 5 }}>
                  Recorded against the ledger entry — required so every manual credit stays auditable.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Reference / Note (optional)</label>
                <textarea
                  value={form.note} onChange={e => set({ note: e.target.value })}
                  rows={2} placeholder="Campaign ref, ticket number…"
                  style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 14, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
                background: `${C.red}12`, border: `1px solid ${C.red}44`, color: C.red,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <Btn outline onClick={onClose}>Cancel</Btn>
              <Btn onClick={submit} disabled={!canSubmit}>
                {saving ? "Adding…" : "Add Commission"}
              </Btn>
            </div>
          </>
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
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [trace, setTrace] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [addingManual, setAddingManual] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (statusFilter) qs.set("status", statusFilter);
    if (typeFilter) qs.set("commission_type", typeFilter);
    if (search.trim()) qs.set("search", search.trim());
    adminFetch(`${API}/api/admin-panel/commissions/ledger/?${qs}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        setItems(j.results || []);
        setTotal(j.count || 0);
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter, typeFilter, search]);

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

        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          style={{
            padding: "7px 10px", borderRadius: 8, fontSize: 12.5,
            background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none",
          }}
        >
          {TYPE_FILTERS.map(t => (
            <option key={t.value || "all"} value={t.value} style={{ background: C.surface, color: C.text }}>
              {t.label}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>{total} entries</span>
          <Btn small onClick={() => setAddingManual(true)}><Plus size={12} /> Add Manual Commission</Btn>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      {addingManual && (
        <ManualCommissionModal
          onClose={() => setAddingManual(false)}
          onToast={onToast}
          onCreated={() => { load(); onChanged?.(); }}
        />
      )}

      <Table
        headers={["Affiliate", "Type", "Player", "Country", "Casino", "Rule / Reason", "Base", "Rate", "Commission", "Status", "Created", ""]}
        loading={loading}
        colSpan={12}
        emptyText="No commission entries yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.affiliate_name || item.affiliate_email}
              <div style={{ fontSize: 11, color: C.sub, fontFamily: "monospace" }}>{item.affiliate_uid}</div>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <span
                style={{
                  padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  color: item.is_manual ? C.gold : C.muted,
                  background: item.is_manual ? `${C.gold}18` : "transparent",
                  border: `1px solid ${item.is_manual ? `${C.gold}44` : C.border}`,
                }}
              >
                {TYPE_LABEL[item.commission_type] || item.commission_type}
              </span>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace" }}>{item.player_uid || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.country || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.casino_name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, maxWidth: 260 }}>
              {item.is_manual ? (
                <>
                  {/* A manual row has no rule to name, so this column carries
                      the thing that justifies it instead: the admin's reason,
                      and who granted it. */}
                  <div style={{ color: C.text }}>{item.qualification_reason || "—"}</div>
                  {item.reviewed_by_email && (
                    <div style={{ fontSize: 11, color: C.sub }}>by {item.reviewed_by_email}</div>
                  )}
                </>
              ) : (
                <>
                  {item.rule_name || "—"}
                  {item.tier_name && <div style={{ fontSize: 11, color: C.gold }}>{item.tier_name}</div>}
                </>
              )}
            </td>
            {/* A manual bonus multiplied nothing by nothing — printing
                "USD 0.00" and "0.000%" there reads as a broken calculation
                rather than as "no calculation took place". */}
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {item.is_manual ? "—" : money(item.base_amount, item.currency)}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.is_manual || !Number(item.commission_rate) ? "—" : `${item.commission_rate}%`}
            </td>
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
                {!item.is_manual && (NEXT_STATUS[item.status] || []).length > 0 && (
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
