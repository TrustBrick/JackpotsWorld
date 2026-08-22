import React, { useCallback, useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, Copy, RefreshCw, X, Layers, ListChecks,
  Percent, Users, DollarSign, CheckCircle2, Clock, Ban, Wallet, Search,
} from "lucide-react";
import { Card, Btn, Table, Spinner, Pagination, rowHover } from "../components/SharedUI";
import { adminFetch, API } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";
import CommissionLedgerTable from "./CommissionLedgerTable";
// Shared with AffiliateCommissionsTab, which is now the primary place these
// are used. See CommissionShared.jsx for why they are not duplicated.
import {
  BASE, COMMISSION_TYPES, RATE_TYPES, METRICS, OPERATORS, EMPTY_RULE,
  money, CommissionDashboard, TierEditor, ConditionEditor,
} from "./CommissionShared";

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "rules", label: "Commission Rules" },
  { id: "ledger", label: "Commission Ledger" },
];

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
