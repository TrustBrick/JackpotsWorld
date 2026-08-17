import React, { useCallback, useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, RefreshCw, ImageOff } from "lucide-react";
import { Card, Btn, Spinner, Table, Pagination, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

function fieldToFormValue(field, item) {
  if (field.type === "list") return (item?.[field.name] || []).join("\n");
  if (field.type === "gallery") return ""; // tracked separately via existingGallery, not form state
  if (field.type === "boolean") return item ? !!item[field.name] : !!field.default;
  return item?.[field.name] ?? field.default ?? "";
}

function emptyForm(fields) {
  const initial = {};
  fields.forEach(f => { initial[f.name] = f.type === "boolean" ? !!f.default : (f.default ?? ""); });
  return initial;
}

/**
 * ManageContentTab — generic list + create/edit/delete UI, config-driven so
 * the Events / Poker / Promotions admin tabs (near-identical CRUD shape)
 * don't each need their own bespoke table+form implementation.
 *
 * `onSaved` — optional, called after every successful create/update/toggle/
 * delete. The Landing Page sub-tabs (GiftItemsManageTab.jsx etc.) pass
 * invalidateLandingCache here, since their apiPath also backs a cached
 * public-site fetcher (src/services/landingService.js) that would otherwise
 * keep serving pre-edit content for up to its 60s TTL. Callers that don't
 * back a public cache (Events/Poker/Promotions/Locations) simply omit it.
 */
export default function ManageContentTab({ resourceLabel, apiPath, fields, columns, onToast, onSaved }) {
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
  // Whether this save is carrying a file, which is what makes it slow enough
  // to be worth labelling differently while it runs.
  const hasPendingUpload = Object.values(files).some(
    v => v && (Array.isArray(v) ? v.length > 0 : true)
  );
  const [asyncOptions, setAsyncOptions] = useState({});
  // Pagination — the backend already paginates list responses (DRF
  // PageNumberPagination, PAGE_SIZE=20); without tracking `total`/`page`
  // here, anything past the first 20 rows was silently unreachable with no
  // indication more existed.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Per-row in-flight guard for Active-toggle/Delete — a Set (not a single
  // boolean) so acting on one row never blocks another.
  const [busyIds, setBusyIds] = useState(() => new Set());
  // Gallery-type fields: existing already-saved images for the item being
  // edited, keyed by field name — separate from `files` (newly picked, not
  // yet uploaded) since edits append to the gallery rather than replacing it.
  const [existingGallery, setExistingGallery] = useState({});

  // Fields of type "asyncSelect" fetch their own dropdown options from a
  // separate admin-panel list endpoint (e.g. picking a specific Poker
  // Tournament / Casino Event to link a reward to) — fetched once per field.
  //
  // `optionsKey` picks a list other than `results` out of the response, for
  // endpoints that return several (the casino catalog returns both countries
  // and casinos in one payload). Defaults to the previous behaviour.
  useEffect(() => {
    fields.filter(f => f.type === "asyncSelect").forEach(f => {
      adminFetch(`${API}${f.optionsUrl}`)
        .then(r => r?.json())
        .then(j => {
          const list = Array.isArray(j) ? j : (j?.[f.optionsKey || "results"] || []);
          setAsyncOptions(prev => ({ ...prev, [f.name]: list }));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}${apiPath}?page=${page}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        if (Array.isArray(j)) { setItems(j); setTotal(j.length); }
        else { setItems(j.results || []); setTotal(j.count || 0); }
      })
      .finally(() => setLoading(false));
  }, [apiPath, page]);

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
      onSaved?.();
    } else {
      onToast?.("Failed to remove gallery image", false);
    }
  };

  const submit = async () => {
    if (submitting) return; // defense in depth — the Save button is already disabled while submitting
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
      if (f.type === "boolean") {
        fd.append(f.name, val ? "true" : "false");
        return;
      }
      if (val !== undefined && val !== null && val !== "") fd.append(f.name, val);
    });

    const url = editingId ? `${API}${apiPath}${editingId}/` : `${API}${apiPath}`;
    const method = editingId ? "PATCH" : "POST";
    try {
      const r = await adminFetch(url, { method, body: fd });
      if (!r) { onToast?.("Session expired", false); return; }
      if (r.ok) {
        onToast?.(editingId ? `${resourceLabel} updated` : `${resourceLabel} created`, true);
        setShowForm(false);
        load();
        onSaved?.();
        return;
      }
      // Real HTTP error with a parseable body -> show the actual cause.
      // Unparseable (an nginx/ALB gateway/timeout page, not JSON) -> the
      // outcome is genuinely ambiguous, so say that honestly and re-fetch
      // rather than either lying "success" or leaving a stale "Failed".
      const j = await r.json().catch(() => null);
      if (j) {
        const firstError = Object.values(j)?.[0];
        onToast?.((Array.isArray(firstError) ? firstError[0] : firstError) || `Failed (HTTP ${r.status})`, false);
      } else {
        onToast?.(`Save may have failed (HTTP ${r.status}) — refreshing to confirm…`, false);
        load();
      }
    } catch {
      // adminFetch's fetch() itself rejected (connection reset, gateway
      // timeout, offline) — the request may or may not have completed
      // server-side. Never leave the button stuck; re-sync instead of
      // guessing.
      onToast?.("Network error — refreshing to check whether it saved…", false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item) => {
    if (busyIds.has(item.id)) return; // rapid double-click guard
    setBusyIds(prev => new Set(prev).add(item.id));
    try {
      const fd = new FormData();
      fd.append("is_active", item.is_active ? "false" : "true");
      const r = await adminFetch(`${API}${apiPath}${item.id}/`, { method: "PATCH", body: fd });
      if (!r) { onToast?.("Session expired", false); return; }
      if (r.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !item.is_active } : i));
        onToast?.(item.is_active ? `${resourceLabel} disabled` : `${resourceLabel} enabled`, true);
        onSaved?.();
      } else {
        onToast?.(`Failed to update status (HTTP ${r.status})`, false);
      }
    } catch {
      onToast?.("Network error — refreshing to check current status…", false);
      load();
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const remove = async (item) => {
    if (busyIds.has(item.id)) return; // rapid double-click guard
    if (!window.confirm(`Delete "${item[columns[0].key]}"? This cannot be undone.`)) return;
    setBusyIds(prev => new Set(prev).add(item.id));
    try {
      const r = await adminFetch(`${API}${apiPath}${item.id}/`, { method: "DELETE" });
      if (!r) { onToast?.("Session expired", false); return; }
      if (r.ok) {
        onToast?.(`${resourceLabel} deleted`, true);
        load();
        onSaved?.();
      } else {
        onToast?.(`Failed to delete (HTTP ${r.status})`, false);
      }
    } catch {
      onToast?.("Network error — refreshing to check whether it was deleted…", false);
      load();
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: C.muted }}>{total} {resourceLabel.toLowerCase()}{total !== 1 ? "s" : ""} total</div>
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
                    {f.options.map(o => <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>{o.label}</option>)}
                  </select>
                ) : f.type === "asyncSelect" ? (
                  <select
                    value={form[f.name] ?? ""}
                    onChange={e => {
                      const next = e.target.value;
                      setForm(prev => {
                        const updated = { ...prev, [f.name]: next };
                        // Clear any field that filters off this one, so a
                        // stale child selection (a casino in the country the
                        // admin just switched away from) can't be submitted.
                        fields.forEach(other => {
                          if (other.dependsOn?.field === f.name) updated[other.name] = "";
                        });
                        return updated;
                      });
                    }}
                    style={inputStyle}
                  >
                    <option value="" style={{ background: C.surface, color: C.text }}>{f.placeholder || "— None —"}</option>
                    {(asyncOptions[f.name] || [])
                      // `dependsOn` narrows this dropdown to the options whose
                      // `optionKey` matches another field's current value —
                      // e.g. only casinos in the selected country. Fields
                      // without it are unfiltered, as before.
                      .filter(o => {
                        if (!f.dependsOn) return true;
                        const parent = form[f.dependsOn.field];
                        if (!parent) return true;
                        return String(o[f.dependsOn.optionKey] ?? "") === String(parent);
                      })
                      .map(o => (
                        <option
                          key={o.id}
                          value={o[f.optionValueKey || "id"]}
                          style={{ background: C.surface, color: C.text }}
                        >
                          {o[f.optionLabelKey || "name"]}
                        </option>
                      ))}
                  </select>
                ) : f.type === "boolean" ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "9px 0" }}>
                    <input
                      type="checkbox"
                      checked={!!form[f.name]}
                      onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.checked }))}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 12, color: C.muted }}>{f.checkboxLabel || "Yes"}</span>
                  </label>
                ) : f.type === "file" ? (
                  <div>
                    <input
                      type="file"
                      accept={f.accept || "image/*"}
                      onChange={e => setFiles(prev => ({ ...prev, [f.name]: e.target.files?.[0] || null }))}
                      style={{ ...inputStyle, padding: "6px 8px" }}
                    />
                    {files[f.name] && (
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                        Selected: {files[f.name].name}{" "}
                        ({(files[f.name].size / (1024 * 1024)).toFixed(1)}MB) — not uploaded until you save.
                      </div>
                    )}
                    {/* Preview of what is actually stored on the server, so an
                        admin can confirm a past upload really landed rather
                        than trusting the filename. Extension-sniffed because
                        the value here is just the saved media URL. */}
                    {!files[f.name] && typeof form[f.name] === "string" && form[f.name] && (
                      <div style={{ marginTop: 6 }}>
                        {/\.(mp4|webm|mov)(\?|$)/i.test(form[f.name]) ? (
                          <video
                            src={form[f.name]}
                            controls
                            muted
                            preload="metadata"
                            style={{ width: 200, maxWidth: "100%", borderRadius: 8, border: `1px solid ${C.border}`, display: "block", background: "#000" }}
                          />
                        ) : (
                          <img
                            src={form[f.name]}
                            alt=""
                            style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }}
                          />
                        )}
                        <a href={form[f.name]} target="_blank" rel="noreferrer" style={{ color: C.gold, fontSize: 10 }}>
                          open current file
                        </a>
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
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
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
            {submitting
              // A video upload can run for a while on a slow link; say
              // "Uploading" rather than "Saving" so a long wait reads as
              // progress rather than a hang.
              ? <><Spinner /> {hasPendingUpload ? "Uploading…" : "Saving…"}</>
              : editingId ? "Save Changes" : `Create ${resourceLabel}`}
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
              <button
                type="button"
                onClick={() => toggleActive(item)}
                disabled={busyIds.has(item.id)}
                title={item.is_active ? "Click to disable" : "Click to enable"}
                style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: item.is_active ? `${C.green}18` : `${C.red}18`, color: item.is_active ? C.green : C.red, border: "none", cursor: busyIds.has(item.id) ? "not-allowed" : "pointer", opacity: busyIds.has(item.id) ? 0.5 : 1 }}
              >
                {item.is_active ? "Active" : "Inactive"}
              </button>
            </td>
            <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
              <button onClick={() => openEdit(item)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", marginRight: 10 }}>
                <Pencil size={13} />
              </button>
              <button
                onClick={() => remove(item)}
                disabled={busyIds.has(item.id)}
                style={{ background: "none", border: "none", color: "rgba(248,113,113,0.7)", cursor: busyIds.has(item.id) ? "not-allowed" : "pointer", opacity: busyIds.has(item.id) ? 0.5 : 1 }}
              >
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} total={total} perPage={20} onChange={setPage} />
    </div>
  );
}
