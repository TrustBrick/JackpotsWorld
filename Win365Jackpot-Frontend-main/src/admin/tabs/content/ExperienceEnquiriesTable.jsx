import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Btn, Table, Pagination, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
];

const CATEGORY_OPTIONS = [
  // "overview" is absent on purpose: those cards are signposts with no enquiry
  // button, so no enquiry can ever carry that category and offering it as a
  // filter would only ever return nothing.
  { value: "luxury_travel", label: "Luxury Travel" },
  { value: "stay", label: "Hotels & Resorts" },
  { value: "dining", label: "Dining & Entertainment" },
  { value: "concierge", label: "VIP Concierge" },
];

/**
 * Leads from the "Enquire Now" forms on the public destination pillars.
 *
 * A dedicated read-only table, deliberately NOT the shared ManageContentTab:
 * that component offers Create and Delete, and neither belongs here. An
 * enquiry is created by a VISITOR, and the backend detail route is
 * RetrieveUpdate only — an enquiry is a record of a real person asking for
 * something, so working it means moving it to contacted or closed rather than
 * erasing it. The Poker and Andhar Bahar registration tables exist for the
 * same reason, which is why this follows them.
 *
 * Only status and the host's note are editable. What somebody asked for is a
 * fact, and the serializer marks the rest read-only server-side too.
 */
export default function ExperienceEnquiriesTable({ onToast }) {
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
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  // Filtering happens SERVER-side (the endpoint takes category, status and q),
  // so a long lead list stays one page of rows rather than everything shipped
  // to the browser and hidden with CSS.
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", page);
    adminFetch(`${API}/api/admin-panel/experience-enquiries/?${params}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        const rows = Array.isArray(j) ? j : (j.results || []);
        setItems(rows);
        setTotal(Array.isArray(j) ? rows.length : (j.count ?? rows.length));
      })
      .finally(() => setLoading(false));
  }, [status, category, query, page]);

  useEffect(() => {
    // Debounced, so typing a name is not a request per keystroke.
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // A narrowed filter usually has fewer pages than the one being viewed, so
  // page 4 of "all" must not survive into a search with one page of results.
  useEffect(() => { setPage(1); }, [status, category, query]);

  const patch = async (id, body) => {
    const r = await adminFetch(`${API}/api/admin-panel/experience-enquiries/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    if (r.ok) { onToast?.("Enquiry updated", true); load(); }
    else onToast?.("Failed to update", false);
  };

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
            aria-label="Search experience enquiries"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, email, phone, destination or service…"
            style={{
              width: "100%", padding: "8px 12px 8px 33px", borderRadius: 8,
              background: C.inputBg, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: C.surface, color: C.text }}>All pillars</option>
          {CATEGORY_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: C.surface, color: C.text }}>All statuses</option>
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
              {o.label}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>
          {total} enquir{total === 1 ? "y" : "ies"}
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={[
          "Received", "Name", "Contact", "Service", "Pillar",
          "Destination", "Date", "Guests", "Details", "Status", "Host Notes",
        ]}
        loading={loading}
        colSpan={11}
        emptyText="No enquiries yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.name}
              {/* Says at a glance whether this came from a signed-in member or
                  an anonymous visitor — both are legitimate, and the follow-up
                  differs. */}
              {item.user_email && (
                <div style={{ fontSize: 11, color: C.muted }}>member · {item.user_email}</div>
              )}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.email && <div>{item.email}</div>}
              {item.phone && <div style={{ color: C.muted }}>{item.phone}</div>}
              {!item.email && !item.phone && "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.experience_title || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.category_label}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.destination || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {item.travel_date || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.party_size ?? "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, maxWidth: 240 }}>
              {item.requirements && <div>{item.requirements}</div>}
              {item.message && <div style={{ color: C.muted }}>{item.message}</div>}
              {!item.requirements && !item.message && "—"}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <select
                value={item.status}
                onChange={e => patch(item.id, { status: e.target.value })}
                style={selectStyle}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
                    {o.label}
                  </option>
                ))}
              </select>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <input
                // Uncontrolled + onBlur, like the registration tables: a PATCH
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

      <Pagination page={page} total={total} perPage={20} onChange={setPage} />
    </div>
  );
}
