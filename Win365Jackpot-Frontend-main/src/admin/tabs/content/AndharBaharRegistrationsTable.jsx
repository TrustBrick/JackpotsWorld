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

/**
 * Back Office lead list for "Register Interest" on Andhar Bahar events.
 *
 * A near-twin of PokerRegistrationsTable, and deliberately NOT the shared
 * ManageContentTab. That component offers Create and Delete, and neither
 * belongs here: a registration is created by the MEMBER, and the backend detail
 * route is RetrieveUpdate only — so those buttons would render fine and then
 * 405. Poker's table exists for the same reason, which is why this follows it
 * rather than inventing a third shape.
 *
 * Only status and the host's note are editable. Who registered for what is a
 * fact, and the serializer marks it read-only server-side too.
 */
export default function AndharBaharRegistrationsTable({ onToast }) {
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
  const [query, setQuery] = useState("");

  // Filtering happens SERVER-side (the endpoint takes `status` and `q`), so a
  // long lead list stays one page of rows rather than everything shipped to
  // the browser and hidden with CSS.
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", page);
    adminFetch(`${API}/api/admin-panel/andhar-bahar/registrations/?${params}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        // DRF paginates this endpoint at 20 a page. Reading `count` rather
        // than the row count is what lets the pager exist at all — without it
        // a host with more than one page of leads would see the first 20 and
        // have no way to know the rest were there.
        const rows = Array.isArray(j) ? j : (j.results || []);
        setItems(rows);
        setTotal(Array.isArray(j) ? rows.length : (j.count ?? rows.length));
      })
      .finally(() => setLoading(false));
  }, [status, query, page]);

  useEffect(() => {
    // Debounced, so typing a name is not a request per keystroke.
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // A narrowed filter usually has fewer pages than the one being viewed, so
  // page 4 of "all" must not survive into a search with one page of results.
  useEffect(() => { setPage(1); }, [status, query]);

  const patch = async (id, body) => {
    const r = await adminFetch(`${API}/api/admin-panel/andhar-bahar/registrations/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    if (r.ok) { onToast?.("Registration updated", true); load(); }
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
            // type=search gives the native clear affordance; the label is what
            // a screen reader announces, since the magnifier icon is decorative.
            type="search"
            aria-label="Search Andhar Bahar registrations"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search member name, email, UID or event…"
            style={{
              width: "100%", padding: "8px 12px 8px 33px", borderRadius: 8,
              background: C.inputBg, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: C.surface, color: C.text }}>All statuses</option>
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>
              {o.label}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>
          {total} registration{total !== 1 ? "s" : ""}
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={["Member", "UID", "Email", "Event", "Country", "Event Date", "Registered", "Status", "Host Notes"]}
        loading={loading}
        colSpan={9}
        emptyText="No Andhar Bahar registrations yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.user_name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{item.user_uid || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.user_email}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.event_name}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              {item.casino_name ? `${item.casino_name} · ${item.event_country}` : item.event_country || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {item.event_start_date || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
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
                // Uncontrolled + onBlur, like the Poker table: a PATCH per
                // keystroke would be a request per letter typed.
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
