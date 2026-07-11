import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Check, Ban } from "lucide-react";
import { Card, Btn, Table, rowHover } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtD } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

function statusOf(row) {
  if (!row.approved_by) return "pending";
  return row.is_active ? "active" : "inactive";
}

function StatusPill({ status }) {
  const { C } = useAdminTheme();
  const cfg = {
    pending:  { color: C.orange, label: "Pending" },
    active:   { color: C.green,  label: "Active"  },
    inactive: { color: C.red,    label: "Inactive" },
  }[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

export default function AffiliatesTab({ onToast }) {
  const { C } = useAdminTheme();
  const rateInputStyle = {
    width: 64, padding: "5px 7px", borderRadius: 7, fontSize: 12,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, outline: "none", boxSizing: "border-box",
  };
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    const qs = tab !== "all" ? `?status=${tab}` : "";
    adminFetch(`${API}/api/admin-panel/affiliates/${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) setItems(j.results || []); })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const grant = async (row, isActive) => {
    const rate = rates[row.user_id] ?? row.commission_rate;
    const r = await adminFetch(`${API}/api/admin-panel/affiliates/grant/`, {
      method: "POST",
      body: JSON.stringify({ user_id: row.user_id, commission_rate: rate, is_active: isActive }),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) { onToast?.(j.message || "Updated", true); load(); }
    else onToast?.(j.error || "Failed to update affiliate", false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
                border: tab === t.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
                background: tab === t.id ? `${C.gold}15` : "transparent",
                color: tab === t.id ? C.gold : C.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={["UID", "Email", "Name", "Commission Rate", "Earned", "Paid", "Applied On", "Status", ""]}
        loading={loading}
        colSpan={9}
        emptyText="No affiliates in this view"
      >
        {items.map(row => {
          const status = statusOf(row);
          return (
            <tr key={row.user_id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{row.user_uid}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{row.email}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{row.name || "—"}</td>
              <td style={{ padding: "11px 14px" }}>
                <input
                  type="number" step="0.01"
                  defaultValue={row.commission_rate}
                  onChange={e => setRates(prev => ({ ...prev, [row.user_id]: e.target.value }))}
                  style={rateInputStyle}
                />%
              </td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{fmt(row.total_earned)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{fmt(row.total_paid)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtD(row.created_at)}</td>
              <td style={{ padding: "11px 14px" }}><StatusPill status={status} /></td>
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                {status !== "active" && (
                  <Btn small color={C.green} onClick={() => grant(row, true)} style={{ marginRight: 6 }}>
                    <Check size={12} /> Approve
                  </Btn>
                )}
                {status !== "inactive" && (
                  <Btn small outline color={C.red} onClick={() => grant(row, false)}>
                    <Ban size={12} /> Deactivate
                  </Btn>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
