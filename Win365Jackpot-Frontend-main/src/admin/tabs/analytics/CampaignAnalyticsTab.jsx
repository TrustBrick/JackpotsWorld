// src/admin/tabs/analytics/CampaignAnalyticsTab.jsx
// ANALYTICS: create/manage generic UTM campaigns and see their real
// performance. Separate from affiliate campaigns (unchanged).
import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Link2 } from "lucide-react";
import { adminFetch, API, fmtN } from "../../helpers";
import { Table, Spinner, Input, Select, Btn } from "../../components/SharedUI";
import { C } from "../../constants";
import { RangeSelector, Panel, EmptyState, fmtPct } from "./AnalyticsShared";

const td = { padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap" };
const BLANK = { name: "", utm_source: "", utm_medium: "", utm_campaign: "", destination_url: "", status: "active" };

export default function CampaignAnalyticsTab({ onToast }) {
  const [range, setRange] = useState("30d");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/campaigns/?range=${range}`);
      setRows(r?.ok ? await r.json() : []);
    } catch { onToast?.("Failed to load campaigns", false); }
    setLoading(false);
  }, [range, onToast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { onToast?.("Campaign name is required", false); return; }
    setSaving(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/campaign-manage/`, {
        method: "POST", body: JSON.stringify(form),
      });
      if (r?.ok) { onToast?.("Campaign created", true); setForm(BLANK); setShowForm(false); load(); }
      else onToast?.("Failed to create campaign", false);
    } catch { onToast?.("Network error", false); }
    setSaving(false);
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete campaign "${row.name}"? Its recorded events stay, but it will no longer be listed.`)) return;
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/campaign-manage/${row.id}/`, { method: "DELETE" });
      if (r?.ok) { onToast?.("Campaign deleted", true); load(); }
      else onToast?.("Failed to delete", false);
    } catch { onToast?.("Network error", false); }
  };

  const linkFor = (tid) => `${window.location.origin}/api/analytics/click/${tid}/`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Campaign Analytics</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <RangeSelector value={range} onChange={setRange} />
          <Btn small color={showForm ? C.red : C.gold} onClick={() => setShowForm(v => !v)}>
            {showForm ? "Cancel" : <><Plus size={12} /> New Campaign</>}
          </Btn>
        </div>
      </div>

      {showForm && (
        <Panel title="New Campaign">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Input label="Campaign Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="August Promo" />
            <Input label="UTM Source" value={form.utm_source} onChange={v => setForm(f => ({ ...f, utm_source: v }))} placeholder="partner-site" />
            <Input label="UTM Medium" value={form.utm_medium} onChange={v => setForm(f => ({ ...f, utm_medium: v }))} placeholder="banner" />
            <Input label="UTM Campaign" value={form.utm_campaign} onChange={v => setForm(f => ({ ...f, utm_campaign: v }))} placeholder="august_2026" />
            <Input label="Destination URL" value={form.destination_url} onChange={v => setForm(f => ({ ...f, destination_url: v }))} placeholder="https://jackpotsworld.vip/promotions" />
            <Select label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))}
                    options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "ended", label: "Ended" }]} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn onClick={create} disabled={saving}>{saving ? "Creating…" : "Create Campaign"}</Btn>
          </div>
        </Panel>
      )}

      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="No campaigns yet — create one above" /> : (
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Campaign", "UTM", "Status", "Clicks", "Unique Visitors", "Page Views", "Video Views", "Registrations", "Conv. Rate", "Trackable Link", ""]}
            loading={false} colSpan={11} emptyText="No campaigns yet"
          >
            {rows.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 700, color: "white" }}>{c.name}</td>
                <td style={td}>{c.utm_source || "—"}{c.utm_campaign ? ` / ${c.utm_campaign}` : ""}</td>
                <td style={{ ...td, color: c.status === "active" ? C.green : "rgba(255,255,255,0.5)" }}>{c.status}</td>
                <td style={{ ...td, color: C.blue, fontWeight: 700 }}>{fmtN(c.clicks)}</td>
                <td style={td}>{fmtN(c.unique_visitors)}</td>
                <td style={td}>{fmtN(c.page_views)}</td>
                <td style={td}>{fmtN(c.video_views)}</td>
                <td style={{ ...td, color: C.green, fontWeight: 700 }}>{fmtN(c.registrations)}</td>
                <td style={td}>{fmtPct(c.conversion_rate)}</td>
                <td style={td}>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(linkFor(c.tracking_id)); onToast?.("Trackable link copied", true); }}
                    title={linkFor(c.tracking_id)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}
                  >
                    <Link2 size={12} /> Copy
                  </button>
                </td>
                <td style={td}>
                  <button onClick={() => remove(c)} title="Delete campaign" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", display: "flex" }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
