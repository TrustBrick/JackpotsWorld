import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, Play, X, AlertTriangle } from "lucide-react";
import { Btn, Table, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const SOURCE_TYPES = [
  { value: "rss", label: "RSS / Atom feed" },
  { value: "json_api", label: "Public JSON API" },
  { value: "manual", label: "Manual Back Office entry" },
];

const STATUS_TONE = { never: "muted", success: "green", partial: "orange", failed: "red" };

const EMPTY = { name: "", source_type: "rss", url: "", is_enabled: true, permission_note: "", config: "{}" };

/**
 * PokerSourcesTable — Part 5's source management. `permission_note` is a
 * required-by-convention field: it records why automated access to this source
 * is permitted, so nobody adds a scraper target without stating its basis.
 */
export default function PokerSourcesTable({ onToast, onChanged }) {
  const { C } = useAdminTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/poker/sources/`)
      .then(r => r?.json())
      .then(j => { if (j) setItems(Array.isArray(j) ? j : (j.results || [])); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    let config;
    try {
      config = JSON.parse(form.config || "{}");
    } catch {
      onToast?.("Config must be valid JSON", false);
      return;
    }
    setSaving(true);
    const r = await adminFetch(`${API}/api/admin-panel/poker/sources/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, config }),
    });
    setSaving(false);
    const body = await r?.json().catch(() => ({}));
    if (r?.ok) {
      onToast?.("Source added", true);
      setShowForm(false); setForm(EMPTY); load(); onChanged?.();
    } else {
      const first = body && Object.entries(body)[0];
      onToast?.(first ? `${first[0]}: ${[].concat(first[1]).join(" ")}` : "Save failed", false);
    }
  };

  const syncOne = async (source) => {
    setBusyId(source.id);
    const r = await adminFetch(`${API}/api/admin-panel/poker/sources/${source.id}/sync/`, { method: "POST" });
    setBusyId(null);
    const body = await r?.json().catch(() => ({}));
    if (r?.ok) {
      const log = body.log || {};
      onToast?.(
        `${source.name}: ${log.status} — ${log.created_count || 0} new, ${log.duplicate_count || 0} duplicate`,
        log.status !== "failed",
      );
      load(); onChanged?.();
    } else onToast?.("Sync failed", false);
  };

  const syncAll = async () => {
    setBusyId("all");
    const r = await adminFetch(`${API}/api/admin-panel/poker/sources/sync-all/`, { method: "POST" });
    setBusyId(null);
    const body = await r?.json().catch(() => ({}));
    if (r?.ok) {
      const t = body.totals || {};
      onToast?.(
        `Synced ${t.sources || 0} source(s): ${t.created || 0} new, ${t.duplicate || 0} duplicate, ${t.sources_failed || 0} failed`,
        !t.sources_failed,
      );
      load(); onChanged?.();
    } else onToast?.("Sync failed", false);
  };

  const toggle = async (source) => {
    const r = await adminFetch(`${API}/api/admin-panel/poker/sources/${source.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !source.is_enabled }),
    });
    if (r?.ok) { load(); onChanged?.(); }
  };

  const remove = async (source) => {
    if (!window.confirm(`Delete source "${source.name}"? Events it discovered are kept.`)) return;
    const r = await adminFetch(`${API}/api/admin-panel/poker/sources/${source.id}/`, { method: "DELETE" });
    if (r?.ok) { onToast?.("Source deleted", true); load(); onChanged?.(); }
  };

  const input = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: C.inputBg,
    border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 11, color: C.muted, marginBottom: 5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "40px 16px" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 620, maxWidth: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>New Poker Source</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, marginBottom: 16,
                background: `${C.orange}12`, border: `1px solid ${C.orange}33`,
              }}
            >
              <AlertTriangle size={15} style={{ color: C.orange, flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                Only add sources that explicitly permit automated access — a published feed, a
                documented public API, or a written agreement. Record the basis below. Sources that
                forbid automated collection must not be added.
              </p>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={labelStyle}>Source Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={input} placeholder="PokerNews Tournament Feed" />
              </div>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={form.source_type} onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))} style={input}>
                  {SOURCE_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: C.surface, color: C.text }}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>URL {form.source_type === "manual" ? "(not used for manual sources)" : ""}</label>
                <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={input} placeholder="https://example.com/feed.xml" />
              </div>
              <div>
                <label style={labelStyle}>Why is automated access permitted?</label>
                <textarea rows={2} value={form.permission_note} onChange={e => setForm(f => ({ ...f, permission_note: e.target.value }))} style={{ ...input, resize: "vertical" }} placeholder="Public RSS feed published for syndication." />
              </div>
              <div>
                <label style={labelStyle}>Connector config (JSON)</label>
                <textarea rows={4} value={form.config} onChange={e => setForm(f => ({ ...f, config: e.target.value }))}
                  style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                  placeholder='{"default_country": "India", "default_series": "DPT"}' />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_enabled} onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked }))} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ fontSize: 12, color: C.muted }}>Enabled — included in scheduled syncs</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <Btn outline onClick={() => setShowForm(false)}>Cancel</Btn>
              <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Source"}</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: C.muted }}>{items.length} source(s)</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
          <Btn outline small onClick={syncAll} disabled={busyId === "all"}>
            <Play size={12} /> {busyId === "all" ? "Syncing…" : "Sync All"}
          </Btn>
          <Btn small onClick={() => setShowForm(true)}><Plus size={13} /> New Source</Btn>
        </div>
      </div>

      <Table
        headers={["Name", "Type", "URL", "Events", "Last Attempt", "Last Success", "Status", "Enabled", ""]}
        loading={loading}
        colSpan={9}
        emptyText="No sources configured — poker events are entered manually in the Events view."
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.text }}>
              {item.name}
              {item.error_message && (
                <div style={{ fontSize: 10.5, color: C.red, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                     title={item.error_message}>
                  {item.error_message}
                </div>
              )}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.source_type}</td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={item.url}>
              {item.url || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.tournament_count ?? 0}</td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, color: C.sub, whiteSpace: "nowrap" }}>
              {item.last_attempted_sync ? new Date(item.last_attempted_sync).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, color: C.sub, whiteSpace: "nowrap" }}>
              {item.last_successful_sync ? new Date(item.last_successful_sync).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <span style={{
                padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                color: C[STATUS_TONE[item.sync_status]] || C.text,
                background: `${C[STATUS_TONE[item.sync_status]] || C.text}18`,
                border: `1px solid ${C[STATUS_TONE[item.sync_status]] || C.text}44`,
              }}>
                {item.sync_status}
              </span>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <button onClick={() => toggle(item)}
                style={{
                  background: "none", border: `1px solid ${item.is_enabled ? C.green : C.border}`,
                  borderRadius: 20, padding: "2px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  color: item.is_enabled ? C.green : C.muted,
                }}>
                {item.is_enabled ? "On" : "Off"}
              </button>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => syncOne(item)} disabled={busyId === item.id} title="Sync now"
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.gold, display: "flex" }}>
                  <Play size={13} />
                </button>
                <button onClick={() => remove(item)} title="Delete"
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.red, display: "flex" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
