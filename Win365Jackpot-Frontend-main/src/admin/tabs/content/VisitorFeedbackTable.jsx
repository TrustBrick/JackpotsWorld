import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Star, Award, X } from "lucide-react";
import { Btn, Card, Table, Pagination, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "resolved", label: "Resolved" },
];

const CATEGORY_OPTIONS = [
  { value: "suggestion", label: "Suggestion" },
  { value: "problem", label: "Problem or bug" },
  { value: "compliment", label: "Compliment" },
  { value: "other", label: "Other" },
];

// What prompted the feedback — mirrors TRIGGER_CHOICES in the backend model.
const TRIGGER_OPTIONS = [
  { value: "manual", label: "Opened by visitor" },
  { value: "experience_enquiry", label: "After an experience enquiry" },
  { value: "whatsapp_enquiry", label: "After the WhatsApp form" },
  { value: "registration", label: "After a game or event registration" },
  { value: "signup", label: "After signing up" },
  { value: "page_helpful", label: "Was this page helpful?" },
];
const TRIGGER_LABEL = Object.fromEntries(TRIGGER_OPTIONS.map(o => [o.value, o.label]));

const GOLD = "#D4AF37";

function Stars({ value, size = 13 }) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} color={GOLD} fill={n <= value ? GOLD : "transparent"} strokeWidth={1.6} />
      ))}
    </span>
  );
}

/**
 * VISITOR-FEEDBACK: ratings and comments left through the public "Feedback"
 * side tab and footer link.
 *
 * Status and the internal note are the only things an admin changes; what
 * the visitor wrote is a record. Good feedback can be published to the
 * site's Testimonials — the only way any of it ever appears publicly.
 */
export default function VisitorFeedbackTable({ onToast }) {
  const { C } = useAdminTheme();
  const selectStyle = {
    padding: "5px 8px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none",
  };
  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 13,
    background: C.inputBg, border: `1px solid ${C.border}`, color: C.text,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [trigger, setTrigger] = useState("");
  const [rating, setRating] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);     // row open in the detail panel
  const [publishing, setPublishing] = useState(null); // { id, name, city, text }

  const loadSummary = useCallback(() => {
    adminFetch(`${API}/api/admin-panel/visitor-feedback/summary/`)
      .then(r => r?.json()).then(j => j && setSummary(j)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (trigger) params.set("trigger", trigger);
    if (rating) params.set("rating", rating);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", page);
    adminFetch(`${API}/api/admin-panel/visitor-feedback/?${params}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        const rows = Array.isArray(j) ? j : (j.results || []);
        setItems(rows);
        setTotal(Array.isArray(j) ? rows.length : (j.count ?? rows.length));
      })
      .finally(() => setLoading(false));
  }, [status, category, trigger, rating, from, to, query, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(1); }, [status, category, trigger, rating, from, to, query]);

  const refresh = () => { load(); loadSummary(); };

  const patch = async (id, body) => {
    const r = await adminFetch(`${API}/api/admin-panel/visitor-feedback/${id}/`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    if (r.ok) {
      const updated = await r.json();
      onToast?.("Feedback updated", true);
      setViewing(v => (v && v.id === id ? updated : v));
      refresh();
    } else onToast?.("Failed to update", false);
  };

  const publish = async () => {
    const { id, name, city, text } = publishing;
    const r = await adminFetch(`${API}/api/admin-panel/visitor-feedback/${id}/publish/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, city, text }),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      onToast?.("Published to Testimonials", true);
      setPublishing(null);
      setViewing(v => (v && v.id === id ? j.feedback : v));
      refresh();
    } else onToast?.(j.error || "Failed to publish", false);
  };

  const startPublish = item => setPublishing({
    id: item.id, name: item.name || "", city: "", text: item.message,
  });

  const opt = (o) => (
    <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>{o.label}</option>
  );

  const statBox = (label, value, sub) => (
    <Card style={{ padding: "14px 16px", flex: "1 1 160px" }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ marginTop: 4 }}>{sub}</div>}
    </Card>
  );

  const spreadMax = summary ? Math.max(1, ...Object.values(summary.by_rating || {})) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {summary && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {statBox("Total feedback", summary.total)}
          {statBox("Average rating",
            summary.average_rating != null ? summary.average_rating.toFixed(2) : "—",
            summary.average_rating != null && <Stars value={Math.round(summary.average_rating)} />)}
          {statBox("New (unread)", summary.new)}
          {(() => {
            const { yes = 0, no = 0 } = summary.page_helpful || {};
            const n = yes + no;
            return statBox("Page helpful", n ? `${Math.round((yes / n) * 100)}%` : "—",
              <span style={{ fontSize: 11, color: C.muted }}>👍 {yes} · 👎 {no}</span>);
          })()}
          <Card style={{ padding: "12px 16px", flex: "2 1 240px" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Ratings
            </div>
            {[5, 4, 3, 2, 1].map(n => {
              const count = summary.by_rating?.[n] || 0;
              return (
                <button key={n} type="button" onClick={() => setRating(rating === String(n) ? "" : String(n))}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "1px 0", cursor: "pointer", color: C.text }}
                  title={`Show ${n}-star feedback`}>
                  <span style={{ fontSize: 11, width: 22, textAlign: "right", fontWeight: rating === String(n) ? 800 : 500 }}>{n}★</span>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${(count / spreadMax) * 100}%`, background: GOLD }} />
                  </span>
                  <span style={{ fontSize: 11, width: 28, color: C.muted }}>{count}</span>
                </button>
              );
            })}
          </Card>
          {Object.keys(summary.by_trigger || {}).length > 0 && (
            <Card style={{ padding: "12px 16px", flex: "2 1 260px" }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Average by moment
              </div>
              {Object.entries(summary.by_trigger).sort((a, b) => b[1].count - a[1].count).map(([key, v]) => (
                <button key={key} type="button" onClick={() => setTrigger(trigger === key ? "" : key)}
                  title="Show only this feedback"
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "2px 0", cursor: "pointer", color: C.text, fontSize: 12, fontWeight: trigger === key ? 800 : 500 }}>
                  <span style={{ flex: 1, textAlign: "left" }}>{TRIGGER_LABEL[key] || key}</span>
                  <Stars value={Math.round(v.average)} size={11} />
                  <span style={{ width: 54, textAlign: "right", color: C.muted }}>{v.average.toFixed(1)} · {v.count}</span>
                </button>
              ))}
            </Card>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            type="search" aria-label="Search feedback" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search message, name, email or page…"
            style={{ ...inputStyle, padding: "8px 12px 8px 33px" }}
          />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle} aria-label="Filter by type">
          <option value="" style={{ background: C.surface, color: C.text }}>All types</option>
          {CATEGORY_OPTIONS.map(opt)}
        </select>
        <select value={trigger} onChange={e => setTrigger(e.target.value)} style={selectStyle} aria-label="Filter by what prompted it">
          <option value="" style={{ background: C.surface, color: C.text }}>All moments</option>
          {TRIGGER_OPTIONS.map(opt)}
        </select>
        <select value={rating} onChange={e => setRating(e.target.value)} style={selectStyle} aria-label="Filter by rating">
          <option value="" style={{ background: C.surface, color: C.text }}>All ratings</option>
          {[5, 4, 3, 2, 1].map(n => opt({ value: String(n), label: `${n} star${n > 1 ? "s" : ""}` }))}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle} aria-label="Filter by status">
          <option value="" style={{ background: C.surface, color: C.text }}>All statuses</option>
          {STATUS_OPTIONS.map(opt)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" style={{ ...selectStyle, minWidth: 128 }} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To date" style={{ ...selectStyle, minWidth: 128 }} />
        <div style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>{total} item{total === 1 ? "" : "s"}</div>
        <Btn outline small onClick={refresh}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={["Received", "Rating", "Prompted by", "Type", "Feedback", "From", "Page", "Status", "Notes", ""]}
        loading={loading} colSpan={10} emptyText="No feedback yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
              {item.trigger === "page_helpful"
                ? <span style={{ fontSize: 13 }}>{item.rating >= 4 ? "👍 Helpful" : "👎 Not helpful"}</span>
                : <Stars value={item.rating} />}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.sub }}>{item.trigger_label || TRIGGER_LABEL[item.trigger] || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.category_label}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, minWidth: 220, maxWidth: 320 }}>
              <button type="button" onClick={() => setViewing(item)}
                style={{ background: "none", border: "none", padding: 0, color: C.text, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12.5 }}
                title="Open full feedback">
                {!item.message
                  ? <span style={{ color: C.muted, fontStyle: "italic" }}>rating only</span>
                  : item.message.length > 120 ? `${item.message.slice(0, 120)}…` : item.message}
              </button>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.name || <span style={{ color: C.muted }}>anonymous</span>}
              {(item.email || item.user_email) && (
                <div style={{ fontSize: 11, color: C.muted }}>
                  {item.user_email ? `member · ${item.user_email}` : item.email}
                </div>
              )}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.muted, maxWidth: 160 }}>
              {item.page_path || "—"}
              {(item.language || item.country_code) && (
                <div style={{ fontSize: 11 }}>{[item.country_code, item.language].filter(Boolean).join(" · ")}</div>
              )}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <select value={item.status} onChange={e => patch(item.id, { status: e.target.value })} style={selectStyle} aria-label="Status">
                {STATUS_OPTIONS.map(opt)}
              </select>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <input
                defaultValue={item.admin_note} placeholder="Add note…"
                style={{ ...selectStyle, width: "100%", minWidth: 150, fontWeight: 400, boxSizing: "border-box" }}
                onBlur={e => { if (e.target.value !== (item.admin_note || "")) patch(item.id, { admin_note: e.target.value }); }}
              />
            </td>
            <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
              {item.testimonial
                ? <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>✓ Testimonial</span>
                : item.trigger !== "page_helpful" && <Btn outline small onClick={() => startPublish(item)}><Award size={12} /> Publish</Btn>}
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} onChange={setPage} />

      {/* Full feedback */}
      {viewing && !publishing && (
        <Overlay onClose={() => setViewing(null)} C={C} title="Feedback">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Stars value={viewing.rating} size={16} />
            <span style={{ fontSize: 12, color: C.muted }}>{viewing.category_label} · {viewing.trigger_label}</span>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>
              {new Date(viewing.created_at).toLocaleString()}
            </span>
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, color: C.text, padding: 12, borderRadius: 10, background: C.inputBg, border: `1px solid ${C.border}` }}>
            {viewing.message || <span style={{ color: C.muted, fontStyle: "italic" }}>No comment — rating only.</span>}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.7 }}>
            <div><b>From:</b> {viewing.name || "anonymous"}{viewing.email ? ` · ${viewing.email}` : ""}{viewing.user_email ? ` (member ${viewing.user_email})` : ""}</div>
            <div><b>Page:</b> {viewing.page_path || "—"} · <b>Language:</b> {viewing.language || "—"} · <b>Country:</b> {viewing.country_code || "—"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
            <select value={viewing.status} onChange={e => patch(viewing.id, { status: e.target.value })} style={selectStyle} aria-label="Status">
              {STATUS_OPTIONS.map(opt)}
            </select>
            {viewing.email && (
              <a href={`mailto:${viewing.email}?subject=${encodeURIComponent("Your feedback to JackpotsWorld")}`}
                style={{ fontSize: 12, fontWeight: 700, color: GOLD, textDecoration: "none" }}>Reply by email</a>
            )}
            <span style={{ flex: 1 }} />
            {viewing.testimonial
              ? <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>✓ Published as testimonial</span>
              : viewing.trigger !== "page_helpful" && <Btn small onClick={() => startPublish(viewing)}><Award size={12} /> Publish as testimonial</Btn>}
          </div>
        </Overlay>
      )}

      {/* Publish as testimonial */}
      {publishing && (
        <Overlay onClose={() => setPublishing(null)} C={C} title="Publish as testimonial">
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>
            This adds the feedback to the Testimonials shown on the site straight away. You can fix typos or
            shorten the name first. It can be hidden or edited later under Landing Page → Testimonials.
          </p>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>Name shown</label>
          <input value={publishing.name} maxLength={100} placeholder="JackpotsWorld Guest"
            onChange={e => setPublishing(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, margin: "4px 0 10px" }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>City (optional)</label>
          <input value={publishing.city} maxLength={100}
            onChange={e => setPublishing(p => ({ ...p, city: e.target.value }))} style={{ ...inputStyle, margin: "4px 0 10px" }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>Testimonial text</label>
          <textarea value={publishing.text} rows={5} maxLength={2000}
            onChange={e => setPublishing(p => ({ ...p, text: e.target.value }))} style={{ ...inputStyle, margin: "4px 0 14px", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn outline small onClick={() => setPublishing(null)}>Cancel</Btn>
            <Btn small onClick={publish} disabled={!publishing.text.trim()}><Award size={12} /> Publish</Btn>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ title, onClose, children, C }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div role="dialog" aria-modal="true" aria-label={title}
        style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", background: C.panelBg || C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
