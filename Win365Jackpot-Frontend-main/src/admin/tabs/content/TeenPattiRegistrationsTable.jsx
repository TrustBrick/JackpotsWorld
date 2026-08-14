import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Btn, Table, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "attended", label: "Attended" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLOR = {
  confirmed: "green",
  attended: "blue",
  no_show: "orange",
  cancelled: "red",
};

/**
 * Back Office registration list for Teen Patti events. Nested inside
 * TeenPattiManageTab as a view toggle, mirroring how PokerRegistrationsTable
 * sits inside PokerManageTab.
 *
 * Changing a status here re-runs the server's seat recount (see
 * AdminTeenPattiRegistrationUpdateView.perform_update), so moving someone to
 * Cancelled frees their seat immediately.
 */
export default function TeenPattiRegistrationsTable({ onToast }) {
  const { C } = useAdminTheme();
  const selectStyle = {
    padding: "5px 8px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, outline: "none",
  };
  const searchStyle = {
    width: 240, maxWidth: "100%", padding: "7px 10px 7px 30px", borderRadius: 8, fontSize: 12.5,
    background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none",
  };

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    adminFetch(`${API}/api/admin-panel/teen-patti/registrations/${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) setItems(Array.isArray(j) ? j : (j.results || [])); })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    // Debounced so typing in the search box doesn't fire a request per keystroke.
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
  }, [load]);

  const patch = async (id, body) => {
    const r = await adminFetch(`${API}/api/admin-panel/teen-patti/registrations/${id}/`, {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={13} style={{ position: "absolute", left: 10, color: C.muted, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, UID or confirmation…"
            style={searchStyle}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.muted }}>
            {items.length} registration{items.length !== 1 ? "s" : ""}
          </span>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table
        headers={["Confirmation", "User", "UID", "Event", "Event Date", "Email", "Phone", "Entry Fee", "Registered", "Status", "Note"]}
        loading={loading}
        colSpan={11}
        emptyText="No Teen Patti registrations yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace", color: C.gold, whiteSpace: "nowrap" }}>
              {item.confirmation_id}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.user_name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{item.user_uid}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.event_name}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>{item.event_start_date}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.email}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.phone || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {item.currency} {Number(item.entry_fee_at_registration || 0).toLocaleString()}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <select
                value={item.status}
                onChange={e => patch(item.id, { status: e.target.value })}
                style={{ ...selectStyle, color: C[STATUS_COLOR[item.status]] || C.text }}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: C.surface, color: C.text }}>{o.label}</option>
                ))}
              </select>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <input
                defaultValue={item.admin_note}
                placeholder="Add note…"
                style={{
                  width: "100%", minWidth: 150, padding: "5px 8px", borderRadius: 7, fontSize: 12,
                  background: C.inputBg, border: `1px solid ${C.border}`, color: C.text,
                  outline: "none", boxSizing: "border-box",
                }}
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
