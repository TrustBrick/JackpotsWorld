import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, Btn, Table, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
];

/**
 * Back Office lead list for "Register Interest / Get Ticket" clicks on
 * Casino Events — nested inside EventsManageTab as a view toggle rather
 * than a separate top-level admin tab.
 */
export default function EventTicketsTable({ onToast }) {
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/events/tickets/`)
      .then(r => r?.json())
      .then(j => { if (j) setItems(Array.isArray(j) ? j : (j.results || [])); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (id, body) => {
    const r = await adminFetch(`${API}/api/admin-panel/events/tickets/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    if (r.ok) { onToast?.("Ticket request updated", true); load(); }
    else onToast?.("Failed to update", false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          {items.length} ticket request{items.length !== 1 ? "s" : ""} total
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={["User", "UID", "Event", "Venue", "Event Date", "Phone", "Email", "Registered", "Status", "Note"]}
        loading={loading}
        colSpan={10}
        emptyText="No event ticket requests yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.user_name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{item.user_uid}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.event_name}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.venue || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>{item.event_date}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.phone || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.email}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <select
                value={item.status}
                onChange={e => patch(item.id, { status: e.target.value })}
                style={selectStyle}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>{o.label}</option>)}
              </select>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <input
                defaultValue={item.admin_note}
                placeholder="Add note…"
                style={noteInputStyle}
                onBlur={e => {
                  if (e.target.value !== (item.admin_note || "")) patch(item.id, { admin_note: e.target.value });
                }}
              />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
