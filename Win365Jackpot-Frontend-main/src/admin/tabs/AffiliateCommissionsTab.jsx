// Commission Engine (Deposit / Losing / Rolling) — new admin tab, safe to
// remove this file along with its entry in constants.js's ADMIN_TABS and its
// case in AdminPanel.jsx to remove the feature. Backend: see
// authapp/services/affiliate_commission_service.py and
// authapp/views/affiliate_views.py's "Commission Engine" section.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Plus, X, Pencil, UserCog, Eye, Banknote, Percent, Trash2 } from "lucide-react";
import { Card, Btn, Table, Pagination, Input, Select, Textarea, rowHover, SectionTitle } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtD } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";
// The commission ledger, and the Manual / Bonus action that lives inside it.
// Both used to be reachable only through the separate Commission Rules page;
// they are hosted here now so removing that page's sidebar entry does not take
// them offline with it. Neither is modified.
import CommissionLedgerTable from "./CommissionLedgerTable";
// One implementation of the tier/condition/dashboard pieces, shared with
// CommissionRulesTab rather than copied \u2014 see CommissionShared.jsx.
import {
  BASE as RULES_BASE, RATE_TYPES, EMPTY_RULE,
  CommissionDashboard, TierEditor, ConditionEditor,
} from "./CommissionShared";

const TYPE_LABEL = { deposit: "Deposit", losing: "Losing", rolling: "Rolling" };
const PAGE_SIZE = 20;

// The four things an admin comes to this page to do. Configuration is first
// because it is the reason the Commission Rules page was folded in here: rules
// and plans are two halves of "what does this affiliate earn", and splitting
// them across two sidebar entries meant the answer lived in two places.
const VIEWS = [
  { id: "configuration", label: "Configuration" },
  { id: "dashboard", label: "Dashboard" },
  { id: "ledger", label: "Commission Ledger" },
  { id: "report", label: "Commission Report" },
];

// Which of a rule's fields are meaningful for which commission type. Driven by
// the backend's own semantics, not by presentation:
//   deposit / losing \u2014 gated earnings. The gate itself (minimum deposit and
//     wagering multiplier) is a CommissionPlan attribute, so it is surfaced
//     from the selected plan rather than duplicated onto the rule.
//   rolling \u2014 ungated: CommissionPlan.min_deposit and wagering_multiplier are
//     documented as ignored for rolling plans, so showing them here would
//     describe a gate that the engine never applies.
const TYPE_FIELDS = {
  deposit: { planGate: true, gateLabel: "Deposit gate" },
  losing: { planGate: true, gateLabel: "Eligibility gate" },
  rolling: { planGate: false, gateLabel: "" },
};

function TypePill({ type, C }) {
  const color = { deposit: C.blue, losing: C.red, rolling: C.green }[type] || C.muted;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: `${color}18`, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {TYPE_LABEL[type] || type || "—"}
    </span>
  );
}

function StatusPill({ status, C }) {
  const cfg = {
    Payable:       { color: "#A78BFA" },
    Paid:          { color: C.green },
    Pending:       { color: C.muted },
    "Not Qualified": { color: C.orange },
    Rejected:      { color: C.red },
  }[status] || { color: C.muted };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color, whiteSpace: "nowrap" }}>
      {status || "—"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan create/edit modal
// ─────────────────────────────────────────────────────────────────────────────

function PlanModal({ plan, C, onClose, onSaved }) {
  const isEdit = !!plan;
  const [commissionType, setCommissionType] = useState(plan?.commission_type || "deposit");
  const [name, setName] = useState(plan?.name || "");
  const [rate, setRate] = useState(plan?.rate ?? "");
  const [minDeposit, setMinDeposit] = useState(plan?.min_deposit ?? "5000.00");
  const [multiplier, setMultiplier] = useState(plan?.wagering_multiplier ?? "7.00");
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [isDefault, setIsDefault] = useState(plan?.is_default ?? false);
  const [description, setDescription] = useState(plan?.description || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setError("Plan name is required."); return; }
    if (rate === "" || Number.isNaN(Number(rate))) { setError("A numeric rate is required."); return; }
    setError(""); setBusy(true);
    const body = {
      name: name.trim(), rate, min_deposit: minDeposit, wagering_multiplier: multiplier,
      is_active: isActive, is_default: isDefault, description,
      ...(isEdit ? {} : { commission_type: commissionType }),
    };
    const url = isEdit ? `${API}/api/admin-panel/affiliate-commissions/plans/${plan.id}/` : `${API}/api/admin-panel/affiliate-commissions/plans/`;
    const res = await adminFetch(url, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(body) });
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) onSaved(json);
    else setError(json?.error || Object.values(json || {})[0]?.[0] || "Failed to save plan.");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <Card solid style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{isEdit ? "Edit Commission Plan" : "New Commission Plan"}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: 18 }}>
            <Select
              label="Commission Type"
              value={commissionType}
              onChange={isEdit ? () => {} : setCommissionType}
              options={[
                { value: "deposit", label: "Deposit Commission" },
                { value: "losing", label: "Losing Commission" },
                { value: "rolling", label: "Rolling Commission" },
              ]}
            />
            {isEdit && (
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: -8, marginBottom: 12 }}>
                Type can't be changed once a plan exists — create a new plan instead.
              </div>
            )}
            <Input label="Plan Name" value={name} onChange={setName} placeholder="e.g. Standard Deposit Commission" />
            <Input label="Rate (%)" value={rate} onChange={setRate} type="number" placeholder="e.g. 3.000" />
            <Input label="Minimum Deposit ($)" value={minDeposit} onChange={setMinDeposit} type="number" />
            <Input label="Wagering Multiplier (x deposit)" value={multiplier} onChange={setMultiplier} type="number" />
            <Textarea label="Description (shown to the affiliate)" value={description} onChange={setDescription} rows={3} />
            <div style={{ display: "flex", gap: 18, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer" }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer" }}>
                <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Default for this type
              </label>
            </div>
            {error && (
              <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginTop: 6 }}>{error}</div>
            )}
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
            <Btn onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Plan"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate commission configuration modal
//
// One place to configure what an affiliate earns. It writes to the two
// resources that actually decide that, through the endpoints that already
// owned them:
//
//   CommissionRule   /api/admin-panel/commissions/rules/
//       the scoped rule — affiliate + country + casino + type + rate, with
//       its tiers, conditions and priority. This is the layer the engine
//       consults first.
//   AffiliateCommissionAssignment
//       /api/admin-panel/affiliates/<id>/commission-assignment/
//       the affiliate's one CommissionPlan, which the engine falls back to
//       when no rule matches.
//
// Both already existed and neither changes shape here. What changes is that an
// admin no longer has to know which of two sidebar pages owns which half.
//
// Nothing in this file computes commission. Rates, tiers and conditions are
// submitted as configuration; every figure an affiliate is actually paid is
// produced by services/commission_engine_service.py on the backend.
// ─────────────────────────────────────────────────────────────────────────────

function CommissionConfigModal({ rule, affiliate, affiliates, plans, catalog, C, onClose, onSaved, onToast }) {
  // An existing rule edits itself; otherwise start blank, pre-scoped to the
  // affiliate whose row was clicked when there was one.
  const [form, setForm] = useState(() => (
    rule
      ? { ...EMPTY_RULE, ...rule, affiliate: rule.affiliate || "", casino: rule.casino || "" }
      : { ...EMPTY_RULE, affiliate: affiliate?.user_id || "", country: affiliate?.country || "" }
  ));
  const [saved, setSaved] = useState(rule || null);
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  // Country drives casino: a rule pinned to a casino in another country can
  // never match, so offering one would only let an admin build a rule that
  // silently never fires.
  const casinos = useMemo(() => (
    (catalog.results || []).filter(
      c => !form.country || c.country?.toLowerCase() === String(form.country).toLowerCase()
    )
  ), [catalog.results, form.country]);

  // Plans are per commission type, so only the ones that match the type being
  // configured are offerable.
  const typePlans = useMemo(() => (
    plans.filter(pl => pl.is_active && pl.commission_type === form.commission_type)
  ), [plans, form.commission_type]);

  const selectedPlan = typePlans.find(pl => String(pl.id) === String(planId)) || null;
  const typeInfo = TYPE_FIELDS[form.commission_type] || TYPE_FIELDS.rolling;

  // The affiliate this configuration is for, resolved from whichever side
  // supplied it, so the plan assignment knows which user to write against.
  const targetAffiliate = useMemo(() => {
    const id = form.affiliate || affiliate?.user_id;
    if (!id) return affiliate || null;
    const found = affiliates.find(a => String(a.user_id) === String(id));
    if (found) return found;
    // Scoped to someone the list did not return. The rule itself carries
    // enough to identify them, so fall back to that rather than reporting no
    // affiliate -- which is what would let the scope be dropped on save.
    if (rule?.affiliate && String(rule.affiliate) === String(id)) {
      return { user_id: rule.affiliate, user_uid: rule.affiliate_uid, email: rule.affiliate_email,
               name: rule.affiliate_uid || rule.affiliate_email, commission_plan: null };
    }
    return affiliate || null;
  }, [form.affiliate, affiliate, affiliates, rule]);

  // The dropdown must contain an option for whoever the rule is scoped to,
  // even when the affiliate list does not. A <select> whose value matches no
  // option renders as unselected, and saving that form would post
  // affiliate: null -- turning one affiliate's rule into a global one that
  // pays every affiliate. The scope has to survive being looked at.
  const affiliateOptions = useMemo(() => {
    const list = [...affiliates];
    const id = form.affiliate;
    if (id && !list.some(a => String(a.user_id) === String(id))) {
      list.unshift({
        user_id: id,
        user_uid: rule?.affiliate_uid || "",
        email: rule?.affiliate_email || "",
        name: rule?.affiliate_uid || rule?.affiliate_email || `Affiliate #${id}`,
      });
    }
    return list;
  }, [affiliates, form.affiliate, rule]);

  // Seed the plan dropdown from whatever the affiliate is already on, so
  // opening the modal never looks like a proposal to remove their plan.
  useEffect(() => {
    const current = targetAffiliate?.commission_plan;
    setPlanId(current && current.commission_type === form.commission_type ? String(current.id) : "");
  }, [targetAffiliate, form.commission_type]);

  const input = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: C.inputBg,
    border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 11, color: C.muted, marginBottom: 5 };
  const opt = { background: C.surface, color: C.text };

  const save = async () => {
    if (!form.name?.trim()) { setError("Give this configuration a name."); return; }
    setError(""); setBusy(true);

    const payload = { ...form };
    // DRF rejects "" for a FK or a date; blank means "not scoped", i.e. null.
    ["affiliate", "casino", "start_date", "end_date", "max_commission"].forEach(k => {
      if (payload[k] === "") payload[k] = null;
    });
    ["rate", "fixed_amount", "min_qualifying_amount"].forEach(k => {
      if (payload[k] === "") payload[k] = 0;
    });
    // Read-only/derived fields the serializer will not accept back.
    ["tiers", "conditions", "usage_count", "scope_label", "specificity",
     "casino_name", "affiliate_email", "affiliate_uid", "created_at", "updated_at"].forEach(k => {
      delete payload[k];
    });

    const isEdit = !!saved?.id;
    const res = await adminFetch(`${API}${RULES_BASE}/rules/${isEdit ? `${saved.id}/` : ""}`, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res?.json().catch(() => ({}));

    if (!res?.ok) {
      setBusy(false);
      const first = body && Object.entries(body)[0];
      setError(first ? `${first[0]}: ${[].concat(first[1]).join(" ")}` : "Save failed.");
      return;
    }

    setSaved(body);
    setForm(f => ({ ...f, ...body }));

    // The plan assignment is a separate resource with its own endpoint, so it
    // is a separate call. Only made when the admin actually picked a plan and
    // it differs from what the affiliate already has — an unchanged plan must
    // not be re-posted, because re-assigning clears the affiliate's agreement
    // and makes them accept the terms again.
    const currentPlan = targetAffiliate?.commission_plan;
    const planChanged = planId && String(currentPlan?.id || "") !== String(planId);
    if (planChanged && targetAffiliate?.user_id) {
      const pr = await adminFetch(
        `${API}/api/admin-panel/affiliates/${targetAffiliate.user_id}/commission-assignment/`,
        { method: "POST", body: JSON.stringify({ plan_id: planId }) },
      );
      if (!pr?.ok) {
        const pj = await pr?.json().catch(() => ({}));
        onToast?.(pj?.error || "Rule saved, but the plan assignment failed.", false);
        setBusy(false);
        onSaved?.();
        return;
      }
    }

    setBusy(false);
    onToast?.(isEdit ? "Commission configuration updated" : "Commission configuration created", true);
    onSaved?.();
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "40px 16px" }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: 780, maxWidth: "100%" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                {saved?.id ? "Edit Affiliate Commission" : "New Affiliate Commission"}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                {targetAffiliate ? (targetAffiliate.name || targetAffiliate.email) : "Applies to every affiliate unless one is chosen"}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          {saved?.scope_label && (
            <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 16, background: `${C.gold}12`, border: `1px solid ${C.gold}33`, fontSize: 12, color: C.muted }}>
              Scope: <b style={{ color: C.gold }}>{saved.scope_label}</b> · specificity {saved.specificity}
              <span style={{ color: C.sub }}> — a more specific configuration always wins over a broader one.</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Configuration name</label>
              <input value={form.name || ""} onChange={e => set({ name: e.target.value })} style={input} placeholder="Sri Lanka — Bellagio VIP" />
            </div>

            <div>
              <label style={labelStyle}>Affiliate</label>
              <select value={form.affiliate || ""} onChange={e => set({ affiliate: e.target.value })} style={input}>
                <option value="" style={opt}>— All affiliates —</option>
                {affiliateOptions.map(a => (
                  <option key={a.user_id} value={a.user_id} style={opt}>
                    {a.name || a.email}{a.user_uid ? ` (${a.user_uid})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Commission type</label>
              <select value={form.commission_type} onChange={e => set({ commission_type: e.target.value })} style={input}>
                {Object.keys(TYPE_LABEL).map(t => (
                  <option key={t} value={t} style={opt}>{TYPE_LABEL[t]} Commission</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Country</label>
              {/* Clearing the casino alongside the country is what stops a rule
                  keeping a casino from the country the admin just left. */}
              <select value={form.country || ""} onChange={e => set({ country: e.target.value, casino: "" })} style={input}>
                <option value="" style={opt}>— All countries —</option>
                {(catalog.countries || []).map(c => (
                  <option key={c.id} value={c.id} style={opt}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Casino</label>
              <select value={form.casino || ""} onChange={e => set({ casino: e.target.value })} style={input}>
                <option value="" style={opt}>— All casinos —</option>
                {casinos.map(c => (
                  <option key={c.id} value={c.id} style={opt}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Rate type</label>
              <select value={form.rate_type} onChange={e => set({ rate_type: e.target.value })} style={input}>
                {RATE_TYPES.map(r => <option key={r.value} value={r.value} style={opt}>{r.label}</option>)}
              </select>
            </div>

            {form.rate_type === "fixed" ? (
              <div>
                <label style={labelStyle}>Fixed amount ({form.currency || "USD"})</label>
                <input type="number" step="0.01" value={form.fixed_amount ?? ""} onChange={e => set({ fixed_amount: e.target.value })} style={input} />
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Rate (%){form.rate_type === "tiered" ? " — fallback when no tier matches" : ""}</label>
                <input type="number" step="0.001" value={form.rate ?? ""} onChange={e => set({ rate: e.target.value })} style={input} />
              </div>
            )}

            <div>
              <label style={labelStyle}>Minimum qualifying amount</label>
              <input type="number" step="0.01" value={form.min_qualifying_amount ?? ""} onChange={e => set({ min_qualifying_amount: e.target.value })} style={input} placeholder="0.00" />
            </div>

            <div>
              <label style={labelStyle}>Maximum commission (blank = no cap)</label>
              <input type="number" step="0.01" value={form.max_commission ?? ""} onChange={e => set({ max_commission: e.target.value })} style={input} />
            </div>

            <div>
              <label style={labelStyle}>Priority</label>
              <input type="number" value={form.priority ?? 0} onChange={e => set({ priority: e.target.value })} style={input} />
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.is_active ? "1" : "0"} onChange={e => set({ is_active: e.target.value === "1" })} style={input}>
                <option value="1" style={opt}>Active</option>
                <option value="0" style={opt}>Inactive</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Effective from (optional)</label>
              <input type="date" value={form.start_date || ""} onChange={e => set({ start_date: e.target.value })} style={input} />
            </div>

            <div>
              <label style={labelStyle}>Effective until (optional)</label>
              <input type="date" value={form.end_date || ""} onChange={e => set({ end_date: e.target.value })} style={input} />
            </div>

            {/* ── Commission plan ────────────────────────────────────────────
                The fallback layer, and the owner of the deposit/wagering gate.
                Shown for every type so the affiliate's plan is visible from
                here, but the gate figures only for the types that use one. */}
            <div style={{ gridColumn: "1 / -1", marginTop: 4, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
              <label style={labelStyle}>
                Commission plan {targetAffiliate ? `for ${targetAffiliate.name || targetAffiliate.email}` : "(choose an affiliate to assign one)"}
              </label>
              <select
                value={planId}
                onChange={e => setPlanId(e.target.value)}
                disabled={!targetAffiliate}
                style={{ ...input, opacity: targetAffiliate ? 1 : 0.5 }}
              >
                <option value="" style={opt}>— No plan (rule only) —</option>
                {typePlans.map(pl => (
                  <option key={pl.id} value={String(pl.id)} style={opt}>
                    {pl.name} ({pl.rate}%)
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 10.5, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
                The plan is what this affiliate earns on when no rule above matches.
                {typeInfo.planGate && selectedPlan && (
                  <>
                    {" "}<b style={{ color: C.muted }}>{typeInfo.gateLabel}:</b>{" "}
                    minimum deposit {fmt(selectedPlan.min_deposit)}, wagering {selectedPlan.wagering_multiplier}× deposit.
                    These belong to the plan and are shared by every affiliate on it — edit them under Commission Plans.
                  </>
                )}
                {!typeInfo.planGate && (
                  <> Rolling commission is not gated, so a plan&apos;s minimum deposit and wagering multiplier do not apply to it.</>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, margin: "14px 0 0" }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn outline small onClick={onClose}>Cancel</Btn>
            <Btn small onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Btn>
          </div>

          {/* Tiers and conditions attach to a saved rule, so they appear once
              there is an id to attach them to. Same editors the Commission
              Rules page used — imported, not reimplemented. */}
          {saved?.id ? (
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 18 }}>
              <TierEditor rule={saved} onToast={onToast} onChanged={onSaved} />
              <ConditionEditor rule={saved} onToast={onToast} onChanged={onSaved} />
            </div>
          ) : (
            <div style={{ marginTop: 18, fontSize: 11, color: C.sub }}>
              Save first to configure tiers and conditions.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission Slip row detail / drill-down modal
// ─────────────────────────────────────────────────────────────────────────────

function CommissionDetailModal({ id, C, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/affiliate-commissions/${id}/`)
      .then(r => r?.json())
      .then(j => { if (j && !j.error) setData(j); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async () => {
    if (!data?.commission) return;
    setBusy(true);
    const res = await adminFetch(`${API}/api/admin-panel/affiliates/commissions/${data.commission}/mark-paid/`, { method: "POST" });
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) onDone(json.message || "Commission marked as paid.", true);
    else onDone(json?.error || "Failed to mark as paid.", false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 620, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <Card solid style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Commission Breakdown</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: 18 }}>
            {loading || !data ? (
              <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <TypePill type={data.commission_type} C={C} />
                  <StatusPill status={data.commission_status} C={C} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginTop: 6 }}>{data.player_name || data.player_email}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>via {data.affiliate_email} · plan: {data.plan_name}</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                  {[
                    ["Deposit Total", fmt(data.deposit_total)],
                    ["Required Wagering", fmt(data.required_wagering)],
                    ["Completed Wagering", fmt(data.completed_wagering)],
                    ["Remaining Wagering", fmt(data.remaining_wagering)],
                    ["Player Loss", fmt(data.player_loss)],
                    ["Rolling Amount", fmt(data.rolling_amount)],
                    ["Rate Applied", data.rate_applied != null ? `${data.rate_applied}%` : "—"],
                    ["Commission Amount", fmt(data.commission_amount)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: "10px 12px", borderRadius: 10, background: C.hoverBg, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "monospace" }}>{value}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {data.qualification_status !== "qualified" && data.not_qualified_reason && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: `${C.orange}12`, border: `1px solid ${C.orange}30`, color: C.orange, fontSize: 12, marginBottom: 16 }}>
                    {data.not_qualified_reason}
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                  Commission History {data.commission_history?.length > 1 && <span style={{ color: C.muted, fontWeight: 400 }}>({data.commission_history.length} entries — Losing Commission tops up incrementally rather than editing a paid record)</span>}
                </div>
                <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, background: C.panelBg }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: C.hoverBg }}>
                        {["Eligible Amount", "Rate", "Amount", "Status", "Created", "Paid"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: C.sub, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data.commission_history || []).map(row => (
                        <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: "8px 10px" }}>{fmt(row.deposit_amount)}</td>
                          <td style={{ padding: "8px 10px" }}>{row.commission_rate}%</td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, color: C.gold }}>{fmt(row.amount)}</td>
                          <td style={{ padding: "8px 10px" }}><StatusPill status={row.status === "paid" ? "Paid" : row.status === "rejected" ? "Rejected" : "Payable"} C={C} /></td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtD(row.created_at)}</td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{row.paid_at ? fmtD(row.paid_at) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {data?.commission_status === "Payable" && (
            <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
              <Btn onClick={markPaid} disabled={busy} color={C.green} style={{ width: "100%", justifyContent: "center" }}>
                <Banknote size={13} /> {busy ? "Processing…" : "Mark Latest Commission Paid"}
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tab
// ─────────────────────────────────────────────────────────────────────────────

export default function AffiliateCommissionsTab({ onToast }) {
  const { C } = useAdminTheme();

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [planModal, setPlanModal] = useState(null); // null | {} (new) | plan (edit)

  const [affiliates, setAffiliates] = useState([]);
  // Every affiliate, for the configuration modal's scope dropdown. Separate
  // from `affiliates` so the table above keeps the list it always showed.
  const [allAffiliates, setAllAffiliates] = useState([]);
  const [loadingAffiliates, setLoadingAffiliates] = useState(true);
  const [affQuery, setAffQuery] = useState("");
  // null = closed. { rule } edits an existing configuration, { affiliate }
  // starts a new one already scoped to that affiliate, {} starts a blank one.
  const [configTarget, setConfigTarget] = useState(null);

  const [view, setView] = useState("configuration");
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [ruleQuery, setRuleQuery] = useState("");
  const [catalog, setCatalog] = useState({ countries: [], results: [] });
  // Bumped whenever configuration changes, so the dashboard and ledger views
  // re-read rather than showing figures from before the edit.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey(k => k + 1), []);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [reportQ, setReportQ] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [report, setReport] = useState([]);
  const [reportCount, setReportCount] = useState(0);
  const [loadingReport, setLoadingReport] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const loadPlans = useCallback(() => {
    setLoadingPlans(true);
    adminFetch(`${API}/api/admin-panel/affiliate-commissions/plans/`)
      .then(r => r?.json())
      .then(j => { if (j) setPlans(j.results || []); })
      .finally(() => setLoadingPlans(false));
  }, []);

  const loadAffiliates = useCallback(() => {
    setLoadingAffiliates(true);
    // Unchanged: the "on plan or flat rate" table has always listed the
    // active affiliates and still should.
    adminFetch(`${API}/api/admin-panel/affiliates/?status=active`)
      .then(r => r?.json())
      .then(j => { if (j) setAffiliates(j.results || []); })
      .finally(() => setLoadingAffiliates(false));

    // ...but the scope dropdown needs every affiliate, not the active subset.
    // A rule may be scoped to any affiliate, and ?status=active is narrower
    // than "exists": on this database it returns 6 of 9, and the three it
    // leaves out include WINMH27, who has three live rules. Offering only the
    // filtered list meant opening one of those rules showed "All affiliates"
    // -- the scope silently absent from the control that owns it.
    adminFetch(`${API}/api/admin-panel/affiliates/`)
      .then(r => r?.json())
      .then(j => { if (j) setAllAffiliates(j.results || []); })
      .catch(() => {});
  }, []);

  const loadReport = useCallback(() => {
    setLoadingReport(true);
    const params = new URLSearchParams({ page: reportPage });
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (dateRange) params.set("date_range", dateRange);
    if (reportQ) params.set("q", reportQ);
    adminFetch(`${API}/api/admin-panel/affiliate-commissions/?${params}`)
      .then(r => r?.json())
      .then(j => { if (j) { setReport(j.results || []); setReportCount(j.count || 0); } })
      .finally(() => setLoadingReport(false));
  }, [reportPage, typeFilter, statusFilter, dateRange, reportQ]);

  // The scoped rules are the per-affiliate commission configuration. Fetched
  // from the same endpoint the Commission Rules page used, so this view and
  // the engine are reading one source.
  const loadRules = useCallback(() => {
    setLoadingRules(true);
    const qs = new URLSearchParams({ page: "1" });
    if (ruleQuery.trim()) qs.set("search", ruleQuery.trim());
    adminFetch(`${API}${RULES_BASE}/rules/?${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) setRules(j.results || []); })
      .finally(() => setLoadingRules(false));
  }, [ruleQuery]);

  useEffect(() => { loadPlans(); loadAffiliates(); }, [loadPlans, loadAffiliates]);
  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadRules(); }, [loadRules, refreshKey]);

  // Countries and casinos for the scope dropdowns. One request feeds both, and
  // the casino list is narrowed by country in the modal rather than refetched.
  useEffect(() => {
    adminFetch(`${API}/api/admin-panel/casino-catalog/`)
      .then(r => r?.json())
      .then(j => { if (j) setCatalog(j); })
      .catch(() => {});
  }, []);

  const deleteRule = async (row) => {
    if (!window.confirm(`Delete "${row.name}"? Ledger entries already produced under it are kept — the rule reference on them simply clears.`)) return;
    const res = await adminFetch(`${API}${RULES_BASE}/rules/${row.id}/`, { method: "DELETE" });
    if (res?.ok) { onToast?.("Configuration deleted", true); bump(); }
    else onToast?.("Delete failed", false);
  };

  const filteredAffiliates = affiliates.filter(a =>
    !affQuery || a.email?.toLowerCase().includes(affQuery.toLowerCase()) || a.name?.toLowerCase().includes(affQuery.toLowerCase())
  );

  // Affiliates already listed in the configurations table above are dropped
  // from the secondary list, so one affiliate is not presented twice as though
  // they were two different arrangements.
  const configuredIds = useMemo(
    () => new Set(rules.filter(r => r.affiliate).map(r => String(r.affiliate))),
    [rules],
  );
  const unconfiguredAffiliates = filteredAffiliates.filter(
    a => !configuredIds.has(String(a.user_id)),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* One destination, four views. The Commission Rules page used the same
          toggle shape for its own three views; keeping it means an admin who
          knew that page recognises this one. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
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
      {view === "ledger" && <CommissionLedgerTable onToast={onToast} onChanged={bump} />}

      {view === "configuration" && (
      <>
      {/* ── Commission Plans ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <SectionTitle sub="Configure the rate, minimum deposit and wagering requirement for each commission type — nothing here is hardcoded.">Commission Plans</SectionTitle>
          <Btn small onClick={() => setPlanModal({})}><Plus size={13} /> New Plan</Btn>
        </div>
        {loadingPlans ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {plans.map(p => (
              <Card key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <TypePill type={p.commission_type} C={C} />
                  <button onClick={() => setPlanModal(p)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}><Pencil size={13} /></button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{p.name}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.gold, fontFamily: "monospace", marginTop: 4 }}>{p.rate}%</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>Min. deposit: {fmt(p.min_deposit)}</span>
                  <span>Wagering required: {p.wagering_multiplier}x deposit</span>
                  <span>{p.is_active ? "Active" : "Inactive"}{p.is_default ? " · Default" : ""}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Affiliate Commission Assignments ──────────────────────────────
          One row per commission configuration, which is what a CommissionRule
          is. This replaces a table that could only show an affiliate's plan:
          the scope (country, casino), the rate actually in force, the priority
          and the active flag all lived on the separate Commission Rules page,
          so the two had to be read side by side to answer "what does this
          affiliate earn". */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <SectionTitle sub="Every automatic commission configuration: who it applies to, where, what it pays and in what order. The most specific configuration wins; affiliates with none stay on their plan, then on the legacy flat rate.">Affiliate Commission Assignments</SectionTitle>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
              <input value={ruleQuery} onChange={e => setRuleQuery(e.target.value)} placeholder="Search configurations…"
                style={{ padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", width: 220 }} />
            </div>
            <Btn small onClick={() => setConfigTarget({})}><Plus size={13} /> New Assignment</Btn>
          </div>
        </div>

        <Table
          headers={["Affiliate", "Country", "Casino", "Commission", "Rate", "Priority", "Status", ""]}
          loading={loadingRules} colSpan={8}
          emptyText="No commission configurations yet"
        >
          {rules.map(r => (
            <tr key={r.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}`, opacity: r.is_active ? 1 : 0.55 }}>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, color: C.text }}>{r.affiliate_uid || r.affiliate_email || "All affiliates"}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{r.name}</div>
              </td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{r.country || "All"}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{r.casino_name || "All"}</td>
              <td style={{ padding: "11px 14px" }}><TypePill type={r.commission_type} C={C} /></td>
              <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace", color: C.gold }}>
                {r.rate_type === "fixed"
                  ? `${r.currency} ${Number(r.fixed_amount || 0).toFixed(2)}`
                  : r.rate_type === "tiered"
                    ? `Tiered (${(r.tiers || []).length})`
                    : `${r.rate}%`}
              </td>
              <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{r.priority}</td>
              <td style={{ padding: "11px 14px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.is_active ? C.green : C.muted }}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td style={{ padding: "11px 14px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn small outline onClick={() => setConfigTarget({ rule: r })}><Pencil size={12} /> Edit</Btn>
                  <Btn small outline onClick={() => deleteRule(r)}><Trash2 size={12} /></Btn>
                </div>
              </td>
            </tr>
          ))}
        </Table>

        {/* Affiliates with no configuration of their own. They are not
            missing from the system — they earn on their plan, or on the
            legacy flat rate — but this is where an admin goes to give one a
            scoped configuration, so they have to be reachable from here. */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <SectionTitle sub="Affiliates without a scoped configuration above. They earn on their assigned plan, or on the legacy flat rate when they have no plan either.">Affiliates on plan or flat rate</SectionTitle>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
              <input value={affQuery} onChange={e => setAffQuery(e.target.value)} placeholder="Search affiliates…"
                style={{ padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", width: 220 }} />
            </div>
          </div>
          <Table headers={["Affiliate", "Country", "Current Commission", "Rate", ""]} loading={loadingAffiliates} colSpan={5} emptyText="No active affiliates">
            {unconfiguredAffiliates.map(a => (
              <tr key={a.user_id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: C.text }}>{a.name || "—"}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{a.email}</div>
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{a.country || "—"}</td>
                <td style={{ padding: "11px 14px" }}>
                  {a.commission_plan ? <TypePill type={a.commission_plan.commission_type} C={C} /> : (
                    <span style={{ fontSize: 11, color: C.muted }}>Legacy flat-rate</span>
                  )}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>
                  {a.commission_plan ? `${a.commission_plan.rate}%` : `${a.commission_rate}%`}
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <Btn small outline onClick={() => setConfigTarget({ affiliate: a })}>
                    <UserCog size={12} /> Configure
                  </Btn>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
      </>
      )}

      {view === "report" && (
      <div>
        <SectionTitle sub="Every player's commission slip, across every affiliate — the same figures the affiliate sees on their own Commission tab.">Commission Report</SectionTitle>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input value={reportQ} onChange={e => { setReportQ(e.target.value); setReportPage(1); }} placeholder="Search player name, email, UID…"
              style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ minWidth: 160 }}>
            <Select value={typeFilter} onChange={v => { setTypeFilter(v); setReportPage(1); }} placeholder="All Types"
              options={[{ value: "deposit", label: "Deposit" }, { value: "losing", label: "Losing" }, { value: "rolling", label: "Rolling" }]} />
          </div>
          <div style={{ minWidth: 160 }}>
            <Select value={statusFilter} onChange={v => { setStatusFilter(v); setReportPage(1); }} placeholder="All Statuses"
              options={[
                { value: "pending", label: "Pending" }, { value: "not_qualified", label: "Not Qualified" },
                { value: "payable", label: "Payable" }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" },
              ]} />
          </div>
          <div style={{ minWidth: 160 }}>
            <Select value={dateRange} onChange={v => { setDateRange(v); setReportPage(1); }} placeholder="All Time"
              options={[{ value: "today", label: "Today" }, { value: "week", label: "This Week" }, { value: "month", label: "This Month" }]} />
          </div>
          <Btn outline small onClick={loadReport}><RefreshCw size={12} /> Refresh</Btn>
        </div>

        <Table
          headers={["Affiliate", "Player", "Type", "Deposit", "Wagering (Done / Req)", "Loss", "Rolling", "Rate", "Amount", "Status", ""]}
          loading={loadingReport} colSpan={11} emptyText="No commission records match this filter"
        >
          {report.map(row => (
            <tr key={row.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "11px 14px", fontSize: 12 }}>{row.affiliate_email}</td>
              <td style={{ padding: "11px 14px", fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: C.text }}>{row.player_name}</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{row.player_uid}</div>
              </td>
              <td style={{ padding: "11px 14px" }}><TypePill type={row.commission_type} C={C} /></td>
              <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace" }}>{fmt(row.deposit_total)}</td>
              <td style={{ padding: "11px 14px", fontSize: 11.5, fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(row.completed_wagering)} / {fmt(row.required_wagering)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace" }}>{fmt(row.player_loss)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace" }}>{fmt(row.rolling_amount)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace" }}>{row.rate_applied != null ? `${row.rate_applied}%` : "—"}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace", fontWeight: 700, color: C.gold }}>{fmt(row.commission_amount)}</td>
              <td style={{ padding: "11px 14px" }}><StatusPill status={row.commission_status} C={C} /></td>
              <td style={{ padding: "11px 14px" }}>
                <Btn small outline onClick={() => setDetailId(row.id)}><Eye size={12} /> View</Btn>
              </td>
            </tr>
          ))}
        </Table>
        <Pagination page={reportPage} total={reportCount} perPage={PAGE_SIZE} onChange={setReportPage} />
      </div>
      )}

      {planModal && (
        <PlanModal
          plan={planModal.id ? planModal : null} C={C}
          onClose={() => setPlanModal(null)}
          onSaved={() => { setPlanModal(null); loadPlans(); onToast?.("Commission plan saved.", true); }}
        />
      )}

      {configTarget && (
        <CommissionConfigModal
          rule={configTarget.rule || null}
          affiliate={configTarget.affiliate || null}
          affiliates={allAffiliates.length ? allAffiliates : affiliates}
          plans={plans}
          catalog={catalog}
          C={C}
          onToast={onToast}
          onClose={() => setConfigTarget(null)}
          onSaved={() => { bump(); loadAffiliates(); }}
        />
      )}

      {detailId && (
        <CommissionDetailModal
          id={detailId} C={C}
          onClose={() => setDetailId(null)}
          onDone={(msg, ok) => { onToast?.(msg, ok); if (ok) { setDetailId(null); loadReport(); } }}
        />
      )}
    </div>
  );
}
