import React, { useCallback, useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, Copy, RefreshCw, X, Layers, ListChecks,
  Percent, Users, DollarSign, CheckCircle2, Clock, Ban, Wallet, Search,
} from "lucide-react";
import { Card, Btn, Table, Spinner, Pagination, rowHover } from "../components/SharedUI";
import { adminFetch, API } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";
import CommissionLedgerTable from "./CommissionLedgerTable";

const BASE = "/api/admin-panel/commissions";

const COMMISSION_TYPES = [
  { value: "rolling", label: "Rolling Commission" },
  { value: "deposit", label: "Deposit Commission" },
  { value: "losing", label: "Losing Commission" },
];

const RATE_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed amount" },
  { value: "tiered", label: "Tiered" },
];

// Mirrors METRICS in commission_rule_models.py.
const METRICS = [
  { value: "referred_players", label: "Referred players" },
  { value: "qualified_players", label: "Qualified players" },
  { value: "active_players", label: "Active players" },
  { value: "deposit_total", label: "Total deposits" },
  { value: "deposit_per_player", label: "Deposit per player" },
  { value: "betting_amount", label: "Total betting amount" },
  { value: "rolling_points", label: "Rolling points" },
  { value: "player_loss", label: "Player loss" },
  { value: "active_days", label: "Days player active" },
];

const OPERATORS = [
  { value: "gte", label: "≥" }, { value: "gt", label: ">" },
  { value: "lte", label: "≤" }, { value: "lt", label: "<" },
  { value: "eq", label: "=" },
];

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "rules", label: "Commission Rules" },
  { id: "ledger", label: "Commission Ledger" },
];

const EMPTY_RULE = {
  name: "", affiliate: "", country: "", casino: "",
  commission_type: "rolling", rate_type: "percentage",
  rate: "", fixed_amount: "", currency: "USD",
  min_qualifying_amount: "", max_commission: "",
  start_date: "", end_date: "", is_active: true, priority: 0, notes: "",
};

function money(amount, currency = "USD") {
  return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }) {
  const { C } = useAdminTheme();
  return (
    <Card style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${color}18`, border: `1px solid ${color}40`,
        }}
      >
        <Icon size={17} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{value ?? "—"}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: C.sub }}>{sub}</div>}
      </div>
    </Card>
  );
}

function CommissionDashboard({ refreshKey }) {
  const { C } = useAdminTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminFetch(`${API}${BASE}/dashboard/`)
      .then(r => r?.json())
      .then(j => { if (j) setData(j); })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading && !data) return <div style={{ padding: 20 }}><Spinner /></div>;
  if (!data) return null;

  const s = data.statuses || {};
  const n = (k) => s[k]?.count ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))" }}>
        <StatCard label="Total Affiliates" value={data.affiliates?.total} icon={Users} color={C.blue}
                  sub={`${data.affiliates?.active ?? 0} active`} />
        <StatCard label="Commission Rules" value={data.rules?.total} icon={Percent} color={C.gold}
                  sub={`${data.rules?.active ?? 0} active`} />
        <StatCard label="Pending" value={n("pending") + n("qualifying")} icon={Clock} color={C.orange} />
        <StatCard label="Qualified" value={n("qualified")} icon={CheckCircle2} color={C.teal} />
        <StatCard label="Approved" value={n("approved")} icon={CheckCircle2} color={C.purple} />
        <StatCard label="Payable" value={n("payable")} icon={Wallet} color={C.blue} />
        <StatCard label="Paid" value={n("paid")} icon={DollarSign} color={C.green} />
        <StatCard label="Rejected" value={n("rejected") + n("cancelled")} icon={Ban} color={C.red} />
        <StatCard label="Total Commission" value={money(data.total_commission_amount)} icon={DollarSign} color={C.gold} />
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Card style={{ padding: 16 }}>
          <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: C.gold, marginBottom: 12 }}>
            Country Breakdown
          </h4>
          {(data.country_breakdown || []).length === 0
            ? <p style={{ fontSize: 12, color: C.sub }}>No commissions recorded yet.</p>
            : (data.country_breakdown || []).map(row => (
                <div key={row.country} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{row.country}</span>
                  <span style={{ color: C.muted }}>
                    {row.count} · <b style={{ color: C.gold }}>{money(row.amount)}</b>
                  </span>
                </div>
              ))}
        </Card>

        <Card style={{ padding: 16 }}>
          <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: C.gold, marginBottom: 12 }}>
            Casino Breakdown
          </h4>
          {(data.casino_breakdown || []).length === 0
            ? <p style={{ fontSize: 12, color: C.sub }}>No commissions recorded yet.</p>
            : (data.casino_breakdown || []).map(row => (
                <div key={`${row.country}-${row.casino}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{row.casino} <span style={{ color: C.sub }}>({row.country})</span></span>
                  <span style={{ color: C.muted }}>
                    {row.count} · <b style={{ color: C.gold }}>{money(row.amount)}</b>
                  </span>
                </div>
              ))}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier + condition editors — shown inside the rule form once a rule exists,
// since both are child rows that need a rule id to attach to.
// ─────────────────────────────────────────────────────────────────────────────

function TierEditor({ rule, onToast, onChanged }) {
  const { C } = useAdminTheme();
  const [tiers, setTiers] = useState([]);
  const [draft, setDraft] = useState({ name: "", metric: "qualified_players", min_value: "", max_value: "", rate: "", order: 0 });

  const load = useCallback(() => {
    adminFetch(`${API}${BASE}/tiers/?rule=${rule.id}`)
      .then(r => r?.json())
      .then(j => { if (j) setTiers(Array.isArray(j) ? j : (j.results || [])); });
  }, [rule.id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!draft.rate && !draft.fixed_amount) { onToast?.("A tier needs a rate", false); return; }
    const r = await adminFetch(`${API}${BASE}/tiers/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rule: rule.id, name: draft.name, metric: draft.metric,
        min_value: draft.min_value || 0,
        max_value: draft.max_value === "" ? null : draft.max_value,
        rate: draft.rate || 0, order: Number(draft.order) || tiers.length,
      }),
    });
    if (r?.ok) {
      onToast?.("Tier added", true);
      setDraft({ name: "", metric: draft.metric, min_value: "", max_value: "", rate: "", order: tiers.length + 1 });
      load(); onChanged?.();
    } else {
      const body = await r?.json().catch(() => ({}));
      onToast?.(Object.values(body || {})[0]?.[0] || "Failed to add tier", false);
    }
  };

  const remove = async (id) => {
    const r = await adminFetch(`${API}${BASE}/tiers/${id}/`, { method: "DELETE" });
    if (r?.ok) { onToast?.("Tier removed", true); load(); onChanged?.(); }
  };

  const toggle = async (tier) => {
    const r = await adminFetch(`${API}${BASE}/tiers/${tier.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !tier.is_active }),
    });
    if (r?.ok) { load(); onChanged?.(); }
  };

  const move = async (tier, delta) => {
    const r = await adminFetch(`${API}${BASE}/tiers/${tier.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: Math.max(0, (tier.order || 0) + delta) }),
    });
    if (r?.ok) { load(); onChanged?.(); }
  };

  const input = {
    padding: "6px 8px", borderRadius: 7, fontSize: 12, background: C.inputBg,
    border: `1px solid ${C.border}`, color: C.text, outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Layers size={14} style={{ color: C.gold }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Tiers</span>
        <span style={{ fontSize: 11, color: C.sub }}>
          — used when the rate type is “Tiered”. First matching band wins.
        </span>
      </div>

      {tiers.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {tiers.map(t => (
            <div
              key={t.id}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                fontSize: 12, opacity: t.is_active ? 1 : 0.5,
              }}
            >
              <span style={{ color: C.gold, fontWeight: 700, minWidth: 22 }}>#{t.order}</span>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 70 }}>{t.name || "Tier"}</span>
              <span style={{ color: C.muted, flex: 1 }}>
                {METRICS.find(m => m.value === t.metric)?.label || t.metric}: {t.min_value}
                {t.max_value == null ? "+" : `–${t.max_value}`} → <b style={{ color: C.gold }}>{t.rate}%</b>
              </span>
              <button onClick={() => move(t, -1)} title="Move up" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13 }}>▲</button>
              <button onClick={() => move(t, 1)} title="Move down" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13 }}>▼</button>
              <button onClick={() => toggle(t)} style={{ background: "none", border: "none", cursor: "pointer", color: t.is_active ? C.green : C.muted, fontSize: 11, fontWeight: 700 }}>
                {t.is_active ? "Active" : "Off"}
              </button>
              <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, display: "flex" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr 0.8fr 0.8fr 0.8fr auto", gap: 6, alignItems: "center" }}>
        <input placeholder="Tier name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={input} />
        <select value={draft.metric} onChange={e => setDraft(d => ({ ...d, metric: e.target.value }))} style={input}>
          {METRICS.map(m => <option key={m.value} value={m.value} style={{ background: C.surface, color: C.text }}>{m.label}</option>)}
        </select>
        <input placeholder="Min" type="number" value={draft.min_value} onChange={e => setDraft(d => ({ ...d, min_value: e.target.value }))} style={input} />
        <input placeholder="Max (∞)" type="number" value={draft.max_value} onChange={e => setDraft(d => ({ ...d, max_value: e.target.value }))} style={input} />
        <input placeholder="Rate %" type="number" step="0.001" value={draft.rate} onChange={e => setDraft(d => ({ ...d, rate: e.target.value }))} style={input} />
        <Btn small onClick={add}><Plus size={12} /> Add</Btn>
      </div>
    </div>
  );
}

function ConditionEditor({ rule, onToast, onChanged }) {
  const { C } = useAdminTheme();
  const [conditions, setConditions] = useState([]);
  const [draft, setDraft] = useState({ metric: "referred_players", operator: "gte", value: "", description: "" });

  const load = useCallback(() => {
    adminFetch(`${API}${BASE}/conditions/?rule=${rule.id}`)
      .then(r => r?.json())
      .then(j => { if (j) setConditions(Array.isArray(j) ? j : (j.results || [])); });
  }, [rule.id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (draft.value === "") { onToast?.("A condition needs a value", false); return; }
    const r = await adminFetch(`${API}${BASE}/conditions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: rule.id, ...draft }),
    });
    if (r?.ok) {
      onToast?.("Condition added", true);
      setDraft({ metric: draft.metric, operator: "gte", value: "", description: "" });
      load(); onChanged?.();
    } else onToast?.("Failed to add condition", false);
  };

  const remove = async (id) => {
    const r = await adminFetch(`${API}${BASE}/conditions/${id}/`, { method: "DELETE" });
    if (r?.ok) { onToast?.("Condition removed", true); load(); onChanged?.(); }
  };

  const input = {
    padding: "6px 8px", borderRadius: 7, fontSize: 12, background: C.inputBg,
    border: `1px solid ${C.border}`, color: C.text, outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <ListChecks size={14} style={{ color: C.gold }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Qualification Conditions</span>
        <span style={{ fontSize: 11, color: C.sub }}>— all must pass before commission is awarded.</span>
      </div>

      {conditions.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {conditions.map(c => (
            <div
              key={c.id}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, fontSize: 12,
              }}
            >
              <span style={{ color: C.muted, flex: 1 }}>{c.label}</span>
              <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, display: "flex" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.8fr 1.5fr auto", gap: 6, alignItems: "center" }}>
        <select value={draft.metric} onChange={e => setDraft(d => ({ ...d, metric: e.target.value }))} style={input}>
          {METRICS.map(m => <option key={m.value} value={m.value} style={{ background: C.surface, color: C.text }}>{m.label}</option>)}
        </select>
        <select value={draft.operator} onChange={e => setDraft(d => ({ ...d, operator: e.target.value }))} style={input}>
          {OPERATORS.map(o => <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>{o.label}</option>)}
        </select>
        <input placeholder="Value" type="number" value={draft.value} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))} style={input} />
        <input placeholder="Description (optional)" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} style={input} />
        <Btn small onClick={add}><Plus size={12} /> Add</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RuleForm({ rule, catalog, affiliates, onClose, onToast, onSaved }) {
  const { C } = useAdminTheme();
  const [form, setForm] = useState(() => (rule ? { ...EMPTY_RULE, ...rule, affiliate: rule.affiliate || "", casino: rule.casino || "" } : EMPTY_RULE));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(rule || null);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const casinos = (catalog.results || []).filter(
    c => !form.country || c.country?.toLowerCase() === String(form.country).toLowerCase()
  );

  const input = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: C.inputBg,
    border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 11, color: C.muted, marginBottom: 5 };

  const save = async () => {
    setSaving(true);
    const payload = { ...form };
    // Blank optional FKs/dates must go over as null, not "" — DRF rejects an
    // empty string for a FK or date field.
    ["affiliate", "casino", "start_date", "end_date", "max_commission"].forEach(k => {
      if (payload[k] === "") payload[k] = null;
    });
    ["rate", "fixed_amount", "min_qualifying_amount"].forEach(k => {
      if (payload[k] === "") payload[k] = 0;
    });
    delete payload.tiers; delete payload.conditions; delete payload.usage_count;
    delete payload.scope_label; delete payload.specificity;
    delete payload.casino_name; delete payload.affiliate_email; delete payload.affiliate_uid;

    const isEdit = !!saved?.id;
    const r = await adminFetch(`${API}${BASE}/rules/${isEdit ? `${saved.id}/` : ""}`, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const body = await r?.json().catch(() => ({}));
    if (r?.ok) {
      onToast?.(isEdit ? "Rule updated" : "Rule created", true);
      setSaved(body);
      setForm(f => ({ ...f, ...body }));
      onSaved?.();
    } else {
      const first = body && Object.entries(body)[0];
      onToast?.(first ? `${first[0]}: ${[].concat(first[1]).join(" ")}` : "Save failed", false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "40px 16px" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 760, maxWidth: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            {saved?.id ? "Edit Commission Rule" : "New Commission Rule"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={18} />
          </button>
        </div>

        {saved?.scope_label && (
          <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 16, background: `${C.gold}12`, border: `1px solid ${C.gold}33`, fontSize: 12, color: C.muted }}>
            Scope: <b style={{ color: C.gold }}>{saved.scope_label}</b> · specificity {saved.specificity}
            <span style={{ color: C.sub }}> — higher specificity always wins over a broader rule.</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Rule Name</label>
            <input value={form.name} onChange={e => set({ name: e.target.value })} style={input} placeholder="Sri Lanka — Bellagio VIP" />
          </div>

          <div>
            <label style={labelStyle}>Affiliate (blank = all)</label>
            <select value={form.affiliate || ""} onChange={e => set({ affiliate: e.target.value })} style={input}>
              <option value="" style={{ background: C.surface, color: C.text }}>— All affiliates —</option>
              {affiliates.map(a => (
                <option key={a.id} value={a.id} style={{ background: C.surface, color: C.text }}>
                  {a.name || a.email} ({a.user_uid})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Country (blank = all)</label>
            <select value={form.country || ""} onChange={e => set({ country: e.target.value, casino: "" })} style={input}>
              <option value="" style={{ background: C.surface, color: C.text }}>— All countries —</option>
              {(catalog.countries || []).map(c => (
                <option key={c.id} value={c.id} style={{ background: C.surface, color: C.text }}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Casino (blank = all)</label>
            <select value={form.casino || ""} onChange={e => set({ casino: e.target.value })} style={input}>
              <option value="" style={{ background: C.surface, color: C.text }}>— All casinos —</option>
              {casinos.map(c => (
                <option key={c.id} value={c.id} style={{ background: C.surface, color: C.text }}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Commission Type</label>
            <select value={form.commission_type} onChange={e => set({ commission_type: e.target.value })} style={input}>
              {COMMISSION_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: C.surface, color: C.text }}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Rate Type</label>
            <select value={form.rate_type} onChange={e => set({ rate_type: e.target.value })} style={input}>
              {RATE_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: C.surface, color: C.text }}>{t.label}</option>)}
            </select>
          </div>

          {form.rate_type === "percentage" && (
            <div>
              <label style={labelStyle}>Rate (%)</label>
              <input type="number" step="0.001" value={form.rate} onChange={e => set({ rate: e.target.value })} style={input} placeholder="10" />
            </div>
          )}
          {form.rate_type === "fixed" && (
            <div>
              <label style={labelStyle}>Fixed Amount</label>
              <input type="number" step="0.01" value={form.fixed_amount} onChange={e => set({ fixed_amount: e.target.value })} style={input} placeholder="50" />
            </div>
          )}

          <div>
            <label style={labelStyle}>Currency</label>
            <input value={form.currency} onChange={e => set({ currency: e.target.value })} style={input} />
          </div>
          <div>
            <label style={labelStyle}>Min Qualifying Amount</label>
            <input type="number" step="0.01" value={form.min_qualifying_amount} onChange={e => set({ min_qualifying_amount: e.target.value })} style={input} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Max Commission (blank = uncapped)</label>
            <input type="number" step="0.01" value={form.max_commission ?? ""} onChange={e => set({ max_commission: e.target.value })} style={input} />
          </div>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={form.start_date || ""} onChange={e => set({ start_date: e.target.value })} style={input} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={form.end_date || ""} onChange={e => set({ end_date: e.target.value })} style={input} />
          </div>
          <div>
            <label style={labelStyle}>Priority (ties only)</label>
            <input type="number" value={form.priority} onChange={e => set({ priority: e.target.value })} style={input} />
          </div>
          <div>
            <label style={labelStyle}>Active</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "9px 0" }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => set({ is_active: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span style={{ fontSize: 12, color: C.muted }}>Rule is live</span>
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set({ notes: e.target.value })} style={{ ...input, resize: "vertical" }} />
          </div>
        </div>

        {saved?.id ? (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <TierEditor rule={saved} onToast={onToast} onChanged={onSaved} />
            <ConditionEditor rule={saved} onToast={onToast} onChanged={onSaved} />
          </div>
        ) : (
          <p style={{ marginTop: 16, fontSize: 11.5, color: C.sub }}>
            Save the rule first to add tiers and qualification conditions.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <Btn outline onClick={onClose}>Close</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : saved?.id ? "Save Changes" : "Create Rule"}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function RulesList({ onToast, onChanged, refreshKey }) {
  const { C } = useAdminTheme();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [catalog, setCatalog] = useState({ countries: [], results: [] });
  const [affiliates, setAffiliates] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (search.trim()) qs.set("search", search.trim());
    adminFetch(`${API}${BASE}/rules/?${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) { setRules(j.results || []); setTotal(j.count || 0); } })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load, refreshKey]);

  useEffect(() => {
    adminFetch(`${API}/api/admin-panel/casino-catalog/`).then(r => r?.json()).then(j => { if (j) setCatalog(j); }).catch(() => {});
    adminFetch(`${API}/api/admin-panel/affiliates/`).then(r => r?.json()).then(j => {
      if (!j) return;
      const list = Array.isArray(j) ? j : (j.results || []);
      setAffiliates(list.map(a => ({
        id: a.user_id ?? a.id, name: a.name, email: a.email, user_uid: a.user_uid,
      })).filter(a => a.id));
    }).catch(() => {});
  }, []);

  const duplicate = async (rule) => {
    const r = await adminFetch(`${API}${BASE}/rules/${rule.id}/duplicate/`, { method: "POST" });
    if (r?.ok) { onToast?.("Rule duplicated (inactive)", true); load(); onChanged?.(); }
    else onToast?.("Duplicate failed", false);
  };

  const remove = async (rule) => {
    if (!window.confirm(`Delete "${rule.name}"? Past commission history is preserved.`)) return;
    const r = await adminFetch(`${API}${BASE}/rules/${rule.id}/`, { method: "DELETE" });
    if (r?.ok) { onToast?.("Rule deleted", true); load(); onChanged?.(); }
    else onToast?.("Delete failed", false);
  };

  const toggle = async (rule) => {
    const r = await adminFetch(`${API}${BASE}/rules/${rule.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    if (r?.ok) { load(); onChanged?.(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showForm && (
        <RuleForm
          rule={editing}
          catalog={catalog}
          affiliates={affiliates}
          onClose={() => { setShowForm(false); setEditing(null); load(); }}
          onToast={onToast}
          onSaved={() => { load(); onChanged?.(); }}
        />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={13} style={{ position: "absolute", left: 10, color: C.muted, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search rules…"
            style={{ width: 220, padding: "7px 10px 7px 30px", borderRadius: 8, fontSize: 12.5, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none" }}
          />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>{total} rules</span>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
          <Btn small onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={13} /> New Rule</Btn>
        </div>
      </div>

      <Table
        headers={["Name", "Scope", "Type", "Rate", "Tiers", "Conditions", "Priority", "Usage", "Active", ""]}
        loading={loading}
        colSpan={10}
        emptyText="No commission rules yet — affiliates stay on their existing plan or flat rate."
      >
        {rules.map(rule => (
          <tr key={rule.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.text }}>{rule.name}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>
              {rule.scope_label}
              <div style={{ fontSize: 10.5, color: C.sub }}>specificity {rule.specificity}</div>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, textTransform: "capitalize" }}>{rule.commission_type}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, color: C.gold, fontWeight: 700, whiteSpace: "nowrap" }}>
              {rule.rate_type === "fixed"
                ? money(rule.fixed_amount, rule.currency)
                : rule.rate_type === "tiered" ? "Tiered" : `${rule.rate}%`}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{(rule.tiers || []).length}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{(rule.conditions || []).length}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{rule.priority}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{rule.usage_count ?? 0}</td>
            <td style={{ padding: "11px 14px" }}>
              <button
                onClick={() => toggle(rule)}
                style={{
                  background: "none", border: `1px solid ${rule.is_active ? C.green : C.border}`,
                  borderRadius: 20, padding: "2px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  color: rule.is_active ? C.green : C.muted,
                }}
              >
                {rule.is_active ? "Active" : "Off"}
              </button>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditing(rule); setShowForm(true); }} title="Edit"
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.muted, display: "flex" }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => duplicate(rule)} title="Duplicate"
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.muted, display: "flex" }}>
                  <Copy size={13} />
                </button>
                <button onClick={() => remove(rule)} title="Delete"
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.red, display: "flex" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}

/**
 * CommissionRulesTab — Back Office home for the Country+Casino+Tier engine
 * (Parts 38–39). Three views: dashboard tiles with country/casino breakdowns,
 * the rule list with its tier/condition editors, and the ledger with the
 * approval workflow.
 */
export default function CommissionRulesTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey(k => k + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
              border: view === v.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: view === v.id ? `${C.gold}15` : "transparent",
              color: view === v.id ? C.gold : C.muted,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "dashboard" && <CommissionDashboard refreshKey={refreshKey} />}
      {view === "rules" && <RulesList onToast={onToast} onChanged={bump} refreshKey={refreshKey} />}
      {view === "ledger" && <CommissionLedgerTable onToast={onToast} onChanged={bump} />}
    </div>
  );
}
