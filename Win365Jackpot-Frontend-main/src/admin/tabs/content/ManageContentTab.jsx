import React, { useCallback, useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, RefreshCw, ImageOff } from "lucide-react";
import { Card, Btn, Spinner, Table, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

function fieldToFormValue(field, item) {
  if (field.type === "list") return (item?.[field.name] || []).join("\n");
  if (field.type === "gallery") return ""; // tracked separately via existingGallery, not form state
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
  const { C } = useAdminTheme();
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState({});
  const [asyncOptions, setAsyncOptions] = useState({});
  // Gallery-type fields: existing already-saved images for the item being
  // edited, keyed by field name — separate from `files` (newly picked, not
  // yet uploaded) since edits append to the gallery rather than replacing it.
  const [existingGallery, setExistingGallery] = useState({});

  // Fields of type "asyncSelect" fetch their own dropdown options from a
  // separate admin-panel list endpoint (e.g. picking a specific Poker
  // Tournament / Casino Event to link a reward to) — fetched once per field.
  useEffect(() => {
    fields.filter(f => f.type === "asyncSelect").forEach(f => {
      adminFetch(`${API}${f.optionsUrl}`)
        .then(r => r?.json())
        .then(j => {
          const list = Array.isArray(j) ? j : (j?.results || []);
          setAsyncOptions(prev => ({ ...prev, [f.name]: list }));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setExistingGallery({});
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    const initial = {};
    fields.forEach(f => { initial[f.name] = fieldToFormValue(f, item); });
    setForm(initial);
    setFiles({});
    const gallery = {};
    fields.filter(f => f.type === "gallery").forEach(f => { gallery[f.name] = item[f.name] || []; });
    setExistingGallery(gallery);
    setEditingId(item.id);
    setShowForm(true);
  };

  const removeExistingGalleryImage = async (field, imageId) => {
    if (!editingId) return;
    const r = await adminFetch(`${API}${apiPath}${editingId}/${field.galleryEndpoint}/${imageId}/`, { method: "DELETE" });
    if (r?.ok) {
      setExistingGallery(prev => ({ ...prev, [field.name]: (prev[field.name] || []).filter(g => g.id !== imageId) }));
      onToast?.("Gallery image removed", true);
    } else {
      onToast?.("Failed to remove gallery image", false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    const fd = new FormData();
    fields.forEach(f => {
      if (f.type === "file") {
        if (files[f.name]) fd.append(f.name, files[f.name]);
        return;
      }
      if (f.type === "gallery") {
        (files[f.name] || []).forEach(file => fd.append(f.name, file));
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
        <div style={{ fontSize: 13, color: C.muted }}>{items.length} {resourceLabel.toLowerCase()}{items.length !== 1 ? "s" : ""} total</div>
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
                <label style={{ display: "block", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
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
                ) : f.type === "asyncSelect" ? (
                  <select
                    value={form[f.name] ?? ""}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">{f.placeholder || "— None —"}</option>
                    {(asyncOptions[f.name] || []).map(o => (
                      <option key={o.id} value={o.id}>{o[f.optionLabelKey || "name"]}</option>
                    ))}
                  </select>
                ) : f.type === "file" ? (
                  <div>
                    <input
                      type="file"
                      accept={f.accept || "image/*"}
                      onChange={e => setFiles(prev => ({ ...prev, [f.name]: e.target.files?.[0] || null }))}
                      style={{ ...inputStyle, padding: "6px 8px" }}
                    />
                    {!files[f.name] && typeof form[f.name] === "string" && form[f.name] && (
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                        Current: <a href={form[f.name]} target="_blank" rel="noreferrer" style={{ color: C.gold }}>view file</a>
                      </div>
                    )}
                  </div>
                ) : f.type === "gallery" ? (
                  <div>
                    <input
                      type="file"
                      accept={f.accept || "image/*"}
                      multiple
                      onChange={e => setFiles(prev => ({ ...prev, [f.name]: Array.from(e.target.files || []) }))}
                      style={{ ...inputStyle, padding: "6px 8px" }}
                    />
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                      {editingId ? "Selecting files here adds them to the existing gallery below." : "You can select multiple images at once."}
                    </div>
                    {(existingGallery[f.name] || []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        {existingGallery[f.name].map(g => (
                          <div key={g.id} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                            {g.image
                              ? <img src={g.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.hoverBg }}><ImageOff size={14} color={C.dim} /></div>}
                            <button
                              type="button"
                              onClick={() => removeExistingGalleryImage(f, g.id)}
                              title="Remove"
                              style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {(files[f.name] || []).length > 0 && (
                      <div style={{ fontSize: 11, color: C.gold, marginTop: 6 }}>
                        {files[f.name].length} new image{files[f.name].length !== 1 ? "s" : ""} selected — will be added on save
                      </div>
                    )}
                  </div>
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
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
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
              <button onClick={() => openEdit(item)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", marginRight: 10 }}>
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
