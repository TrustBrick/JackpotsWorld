import React, { useCallback, useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Card, Btn, Spinner, Table, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { C } from "../../constants";

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
  color: "white", fontSize: 13, outline: "none", boxSizing: "border-box",
};

function fieldToFormValue(field, item) {
  if (field.type === "list") return (item?.[field.name] || []).join("\n");
  return item?.[field.name] ?? field.default ?? "";
}

function emptyForm(fields) {
  const initial = {};
  fields.forEach(f => { initial[f.name] = f.default ?? ""; });
  return initial;
}

/**
 * ManageContentTab — generic list + create/edit/delete UI, config-driven so
 * the Events / Poker / Promotions admin tabs (near-identical CRUD shape)
 * don't each need their own bespoke table+form implementation.
 */
export default function ManageContentTab({ resourceLabel, apiPath, fields, columns, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}${apiPath}`)
      .then(r => r?.json())
      .then(j => { if (j) setItems(Array.isArray(j) ? j : (j.results || [])); })
      .finally(() => setLoading(false));
  }, [apiPath]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(emptyForm(fields));
    setFiles({});
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    const initial = {};
    fields.forEach(f => { initial[f.name] = fieldToFormValue(f, item); });
    setForm(initial);
    setFiles({});
    setEditingId(item.id);
    setShowForm(true);
  };

  const submit = async () => {
    setSubmitting(true);
    const fd = new FormData();
    fields.forEach(f => {
      if (f.type === "file") {
        if (files[f.name]) fd.append(f.name, files[f.name]);
        return;
      }
      let val = form[f.name];
      if (f.type === "list") {
        val = JSON.stringify(String(val || "").split("\n").map(s => s.trim()).filter(Boolean));
      }
      if (val !== undefined && val !== null && val !== "") fd.append(f.name, val);
    });

    const url = editingId ? `${API}${apiPath}${editingId}/` : `${API}${apiPath}`;
    const method = editingId ? "PATCH" : "POST";
    const r = await adminFetch(url, { method, body: fd });
    if (!r) { onToast?.("Session expired", false); setSubmitting(false); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      onToast?.(editingId ? `${resourceLabel} updated` : `${resourceLabel} created`, true);
      setShowForm(false);
      load();
    } else {
      const firstError = Object.values(j)?.[0];
      onToast?.((Array.isArray(firstError) ? firstError[0] : firstError) || "Failed", false);
    }
    setSubmitting(false);
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item[columns[0].key]}"? This cannot be undone.`)) return;
    const r = await adminFetch(`${API}${apiPath}${item.id}/`, { method: "DELETE" });
    if (!r) { onToast?.("Session expired", false); return; }
    onToast?.(r.ok ? `${resourceLabel} deleted` : "Failed to delete", r.ok);
    if (r.ok) load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{items.length} {resourceLabel.toLowerCase()}{items.length !== 1 ? "s" : ""} total</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
          <Btn small onClick={() => (showForm ? setShowForm(false) : openCreate())} color={showForm ? C.red : C.gold}>
            {showForm ? <><X size={12} /> Cancel</> : <><Plus size={12} /> New {resourceLabel}</>}
          </Btn>
        </div>
      </div>

      {showForm && (
        <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            {editingId ? `Edit ${resourceLabel}` : `New ${resourceLabel}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {fields.map(f => (
              <div key={f.name} style={f.wide ? { gridColumn: "1 / -1" } : undefined}>
                <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                  {f.label}
                </label>
                {f.type === "textarea" || f.type === "list" ? (
                  <textarea
                    rows={f.type === "list" ? 3 : 3}
                    value={form[f.name] ?? ""}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                ) : f.type === "select" ? (
                  <select
                    value={form[f.name] ?? ""}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                    style={inputStyle}
                  >
                    {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "file" ? (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setFiles(prev => ({ ...prev, [f.name]: e.target.files?.[0] || null }))}
                    style={{ ...inputStyle, padding: "6px 8px" }}
                  />
                ) : (
                  <input
                    type={f.type || "text"}
                    value={form[f.name] ?? ""}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
          <Btn onClick={submit} disabled={submitting} style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>
            {submitting ? <><Spinner /> Saving…</> : editingId ? "Save Changes" : `Create ${resourceLabel}`}
          </Btn>
        </Card>
      )}

      <Table headers={[...columns.map(c => c.label), "Active", ""]} loading={loading} colSpan={columns.length + 2} emptyText={`No ${resourceLabel.toLowerCase()}s yet`}>
        {items.map(item => (
          <tr key={item.id} {...rowHover} style={{ borderBottom: `1px solid ${C.border}` }}>
            {columns.map(c => (
              <td key={c.key} style={{ padding: "11px 14px", fontSize: 12.5 }}>
                {c.render ? c.render(item) : (item[c.key] ?? "—")}
              </td>
            ))}
            <td style={{ padding: "11px 14px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: item.is_active ? `${C.green}18` : `${C.red}18`, color: item.is_active ? C.green : C.red }}>
                {item.is_active ? "Active" : "Inactive"}
              </span>
            </td>
            <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
              <button onClick={() => openEdit(item)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", marginRight: 10 }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => remove(item)} style={{ background: "none", border: "none", color: "rgba(248,113,113,0.7)", cursor: "pointer" }}>
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
