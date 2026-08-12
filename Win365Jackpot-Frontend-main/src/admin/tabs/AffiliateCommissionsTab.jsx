// Commission Engine (Deposit / Losing / Rolling) — new admin tab, safe to
// remove this file along with its entry in constants.js's ADMIN_TABS and its
// case in AdminPanel.jsx to remove the feature. Backend: see
// authapp/services/affiliate_commission_service.py and
// authapp/views/affiliate_views.py's "Commission Engine" section.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Plus, X, Pencil, UserCog, Eye, Banknote, Percent } from "lucide-react";
import { Card, Btn, Table, Pagination, Input, Select, Textarea, rowHover, SectionTitle } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtD } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

const TYPE_LABEL = { deposit: "Deposit", losing: "Losing", rolling: "Rolling" };
const PAGE_SIZE = 20;

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
// Assign-to-affiliate modal
// ─────────────────────────────────────────────────────────────────────────────

function AssignModal({ affiliate, plans, C, onClose, onSaved }) {
  const [planId, setPlanId] = useState(affiliate.commission_plan?.id ? String(affiliate.commission_plan.id) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!planId) { setError("Choose a plan to assign."); return; }
    setError(""); setBusy(true);
    const res = await adminFetch(`${API}/api/admin-panel/affiliates/${affiliate.user_id}/commission-assignment/`, {
      method: "POST", body: JSON.stringify({ plan_id: planId }),
    });
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) onSaved(json);
    else setError(json?.error || "Failed to assign plan.");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Assign Commission Plan</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{affiliate.name || affiliate.email}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          {affiliate.commission_plan ? (
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
              Currently on <b style={{ color: C.text }}>{affiliate.commission_plan.name}</b> ({TYPE_LABEL[affiliate.commission_plan.commission_type]}, {affiliate.commission_plan.rate}%). Changing the plan will require the affiliate to re-agree to the new terms.
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
              This affiliate is currently on the legacy flat-rate commission ({affiliate.commission_rate}%). Assigning a plan below opts them into the new Commission Engine.
            </div>
          )}

          <Select
            label="Commission Plan"
            value={planId}
            onChange={setPlanId}
            placeholder="Choose a plan…"
            options={plans.filter(p => p.is_active).map(p => ({ value: String(p.id), label: `${p.name} — ${TYPE_LABEL[p.commission_type]} (${p.rate}%)` }))}
          />

          {error && (
            <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>
          )}

          <Btn onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? "Assigning…" : "Assign Plan"}
          </Btn>
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
  const [loadingAffiliates, setLoadingAffiliates] = useState(true);
  const [affQuery, setAffQuery] = useState("");
  const [assignTarget, setAssignTarget] = useState(null);

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
    adminFetch(`${API}/api/admin-panel/affiliates/?status=active`)
      .then(r => r?.json())
      .then(j => { if (j) setAffiliates(j.results || []); })
      .finally(() => setLoadingAffiliates(false));
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

  useEffect(() => { loadPlans(); loadAffiliates(); }, [loadPlans, loadAffiliates]);
  useEffect(() => { loadReport(); }, [loadReport]);

  const filteredAffiliates = affiliates.filter(a =>
    !affQuery || a.email?.toLowerCase().includes(affQuery.toLowerCase()) || a.name?.toLowerCase().includes(affQuery.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

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

      {/* ── Affiliate Assignments ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <SectionTitle sub="Each affiliate can be assigned a different commission type. Affiliates without an assignment stay on the legacy flat-rate commission.">Affiliate Assignments</SectionTitle>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input value={affQuery} onChange={e => setAffQuery(e.target.value)} placeholder="Search affiliates…"
              style={{ padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", width: 220 }} />
          </div>
        </div>
        <Table headers={["Affiliate", "Country", "Current Commission", "Rate", ""]} loading={loadingAffiliates} colSpan={5} emptyText="No active affiliates">
          {filteredAffiliates.map(a => (
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
                <Btn small outline onClick={() => setAssignTarget(a)}><UserCog size={12} /> {a.commission_plan ? "Change" : "Assign"}</Btn>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      {/* ── Back Office Report ── */}
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

      {planModal && (
        <PlanModal
          plan={planModal.id ? planModal : null} C={C}
          onClose={() => setPlanModal(null)}
          onSaved={() => { setPlanModal(null); loadPlans(); onToast?.("Commission plan saved.", true); }}
        />
      )}

      {assignTarget && (
        <AssignModal
          affiliate={assignTarget} plans={plans} C={C}
          onClose={() => setAssignTarget(null)}
          onSaved={() => { setAssignTarget(null); loadAffiliates(); onToast?.("Commission plan assigned.", true); }}
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
