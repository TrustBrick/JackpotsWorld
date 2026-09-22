import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Btn, Table, Pagination, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

// Only the two a host may legitimately assert. "Clicked" and "New" record
// what the VISITOR did and are written by the endpoint; the server rejects an
// attempt to set either by hand, and offering them here would be offering
// something that fails.
const STATUS_OPTIONS = [
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
];

// How each state reads in the table. Kept separate from the editable list
// above precisely because more states can be displayed than can be set.
const STATUS_LABEL = {
  clicked: "Clicked",
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
  message_received: "Message received",
};

const WHO_OPTIONS = [
  { value: "guest", label: "Guests only" },
  { value: "member", label: "Members only" },
];

/**
 * WHATSAPP-LEADS: every press of a WhatsApp enquiry button.
 *
 * Read-only apart from status and the host's note, for the same reason the
 * Experience enquiries table is: a lead is a record of a real person asking
 * for something, so working it means moving it to contacted or closed rather
 * than erasing it. There is deliberately no Create and no Delete.
 *
 * TWO KINDS OF ROW LIVE HERE, and the difference matters when working the
 * list:
 *
 *   "Clicked"  — they pressed the button and gave no details. There is no
 *                name or number to reply to; what it tells you is which
 *                button, from which page, on which campaign.
 *   "New"      — they filled the form. There is somebody to contact.
 *
 * Nothing in this table means a WhatsApp message was sent or received. That
 * cannot be known without Meta's Cloud API, which this platform does not use,
 * so no status here claims it.
 */
export default function WhatsAppEnquiriesTable({ onToast }) {
  const { C } = useAdminTheme();
  const selectStyle = {
    padding: "5px 8px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, outline: "none",
  };
  const noteInputStyle = {
    width: "100%", minWidth: 160, padding: "5px 8px", borderRadius: 7, fontSize: 12,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, outline: "none", boxSizing: "border-box",
  };

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [who, setWho] = useState("");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  // Populated from whatever the rows actually contain, rather than a hardcoded
  // list: buttons are Back Office data, so a filter hardcoded here would go
  // stale the first time somebody adds one.
  const [buttons, setButtons] = useState([]);

  // Filtering happens SERVER-side, so a long lead list stays one page of rows
  // rather than everything shipped to the browser and hidden with CSS.
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (who) params.set("who", who);
    if (source) params.set("source", source);
    if (campaign.trim()) params.set("campaign", campaign.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", page);
    adminFetch(`${API}/api/admin-panel/whatsapp-enquiries/?${params}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        const rows = Array.isArray(j) ? j : (j.results || []);
        setItems(rows);
        setTotal(Array.isArray(j) ? rows.length : (j.count ?? rows.length));
        setButtons(prev => {
          const seen = new Map(prev.map(b => [b.value, b]));
          rows.forEach(r => {
            if (r.source && !seen.has(r.source)) {
              seen.set(r.source, { value: r.source, label: r.button_label || r.source });
            }
          });
          return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
        });
      })
      .finally(() => setLoading(false));
  }, [status, who, source, campaign, from, to, query, page]);

  useEffect(() => {
    // Debounced, so typing a name is not a request per keystroke.
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // A narrowed filter usually has fewer pages than the one being viewed, so
  // page 4 of "all" must not survive into a search with one page of results.
  useEffect(() => { setPage(1); }, [status, who, source, campaign, from, to, query]);

  const patch = async (id, body) => {
    const r = await adminFetch(`${API}/api/admin-panel/whatsapp-enquiries/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    if (r.ok) { onToast?.("Enquiry updated", true); load(); }
    else onToast?.("Failed to update", false);
  };

  const dateStyle = { ...selectStyle, minWidth: 128 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }}
          />
          <input
            type="search"
            aria-label="Search WhatsApp enquiries"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, number, message, button or member…"
            style={{
              width: "100%", padding: "8px 12px 8px 33px", borderRadius: 8,
              background: C.inputBg, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <select value={source} onChange={e => setSource(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: C.surface, color: C.text }}>All buttons</option>
          {buttons.map(o => (
            <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
              {o.label}
            </option>
          ))}
        </select>

        <select value={who} onChange={e => setWho(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: C.surface, color: C.text }}>Everyone</option>
          {WHO_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
              {o.label}
            </option>
          ))}
        </select>

        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: C.surface, color: C.text }}>All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value} style={{ background: C.surface, color: C.text }}>
              {label}
            </option>
          ))}
        </select>

        <input
          type="text" value={campaign} onChange={e => setCampaign(e.target.value)}
          placeholder="Campaign…" aria-label="Filter by campaign" style={dateStyle}
        />
        <input
          type="date" value={from} onChange={e => setFrom(e.target.value)}
          aria-label="From date" style={dateStyle}
        />
        <input
          type="date" value={to} onChange={e => setTo(e.target.value)}
          aria-label="To date" style={dateStyle}
        />

        <div style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>
          {total} enquir{total === 1 ? "y" : "ies"}
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={[
          "Received", "Name", "WhatsApp", "Button", "Section",
          "Page", "Campaign", "Presses", "Message", "Status", "Host Notes",
        ]}
        loading={loading}
        colSpan={11}
        emptyText="No WhatsApp enquiries yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.name || <span style={{ color: C.muted }}>no details given</span>}
              {item.user_email && (
                <div style={{ fontSize: 11, color: C.muted }}>member · {item.user_email}</div>
              )}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {item.whatsapp_number || "—"}
              {/* Optional everywhere — from the account for a member, from the
                  form when a guest volunteers it, absent otherwise. */}
              {item.email && (
                <div style={{ fontSize: 11, color: C.muted }}>{item.email}</div>
              )}
            </td>
            {/* The button's Back Office label when it has one, the raw slug
                when it does not — a button can ship before its row exists. */}
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.button_label || item.source || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.muted }}>
              {item.section || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.muted, maxWidth: 180 }}>
              {item.page_path || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>
              {item.utm_campaign || "—"}
              {item.utm_source && (
                <div style={{ fontSize: 11, color: C.muted }}>{item.utm_source}</div>
              )}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "center" }}>
              {item.click_count ?? 1}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, maxWidth: 240 }}>
              {item.message || "—"}
            </td>
            <td style={{ padding: "11px 14px" }}>
              {/* An un-worked row shows what it is as plain text, because
                  "Clicked"/"New" are not a host's to assert. Once there is
                  something to say about it, the two settable states appear. */}
              <select
                value={STATUS_OPTIONS.some(o => o.value === item.status) ? item.status : ""}
                onChange={e => e.target.value && patch(item.id, { status: e.target.value })}
                style={selectStyle}
              >
                <option value="" style={{ background: C.surface, color: C.text }}>
                  {STATUS_LABEL[item.status] || item.status}
                </option>
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
                    {o.label}
                  </option>
                ))}
              </select>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <input
                // Uncontrolled + onBlur, like the other lead tables: a PATCH
                // per keystroke would be a request per letter typed.
                defaultValue={item.admin_note}
                placeholder="Add note…"
                style={noteInputStyle}
                onBlur={e => {
                  if (e.target.value !== (item.admin_note || "")) {
                    patch(item.id, { admin_note: e.target.value });
                  }
                }}
              />
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}
