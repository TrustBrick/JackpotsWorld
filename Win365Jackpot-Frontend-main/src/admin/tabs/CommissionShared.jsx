/**
 * admin/tabs/CommissionShared.jsx
 * ---------------------------------------------------------------------------
 * The commission configuration pieces that both Back Office destinations need.
 *
 * These used to live inside CommissionRulesTab.jsx, which was the only place
 * that rendered them. Affiliate Commissions is now the single destination for
 * configuring an affiliate's commission, so it needs the same tier editor,
 * condition editor and dashboard. They are extracted here rather than copied
 * so there is exactly one implementation of each: a rule's tiers and
 * conditions are financial configuration, and two drifting editors for them is
 * how a rule ends up meaning different things depending on which screen last
 * touched it.
 *
 * Every one of these still talks to the same endpoints under
 * /api/admin-panel/commissions/ that they always did. Nothing here calculates
 * commission -- the arithmetic stays in the backend engine
 * (services/commission_engine_service.py), and these only read and write
 * configuration.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, X, Layers, ListChecks,
  Percent, Users, DollarSign, CheckCircle2, Clock, Wallet, Ban,
} from "lucide-react";
import { Btn, Card, Spinner } from "../components/SharedUI";
import { adminFetch, API } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

export const BASE = "/api/admin-panel/commissions";

export const COMMISSION_TYPES = [
  { value: "rolling", label: "Rolling Commission" },
  { value: "deposit", label: "Deposit Commission" },
  { value: "losing", label: "Losing Commission" },
];

export const RATE_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed amount" },
  { value: "tiered", label: "Tiered" },
];

// Mirrors METRICS in commission_rule_models.py.

export const METRICS = [
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

export const OPERATORS = [
  { value: "gte", label: "≥" }, { value: "gt", label: ">" },
  { value: "lte", label: "≤" }, { value: "lt", label: "<" },
  { value: "eq", label: "=" },
];

export const EMPTY_RULE = {
  name: "", affiliate: "", country: "", casino: "",
  commission_type: "rolling", rate_type: "percentage",
  rate: "", fixed_amount: "", currency: "USD",
  min_qualifying_amount: "", max_commission: "",
  start_date: "", end_date: "", is_active: true, priority: 0, notes: "",
};

export function money(amount, currency = "USD") {
  return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export function StatCard({ label, value, icon: Icon, color, sub }) {
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

export function CommissionDashboard({ refreshKey }) {
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

export function TierEditor({ rule, onToast, onChanged }) {
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

export function ConditionEditor({ rule, onToast, onChanged }) {
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
