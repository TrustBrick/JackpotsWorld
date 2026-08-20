// src/admin/tabs/analytics/UrlAnalyticsTab.jsx
// ANALYTICS: one row per (source, medium, campaign) UTM tuple seen in range.
import React, { useState, useEffect, useCallback } from "react";
import { adminFetch, API, fmtN, fmtDT } from "../../helpers";
import { Table } from "../../components/SharedUI";
import { C } from "../../constants";
import { RangeSelector } from "./AnalyticsShared";

const td = { padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap" };

export default function UrlAnalyticsTab({ onToast }) {
  const [range, setRange] = useState("30d");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/urls/?range=${range}`);
      setRows(r?.ok ? await r.json() : []);
    } catch { onToast?.("Failed to load URL analytics", false); }
    setLoading(false);
  }, [range, onToast]);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r =>
    `${r.source} ${r.medium} ${r.campaign}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>URL / Source Analytics</div>
        <RangeSelector value={range} onChange={setRange} />
      </div>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search source / medium / campaign…"
        style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 12.5, outline: "none", maxWidth: 320 }}
      />
      <div style={{ overflowX: "auto" }}>
        <Table
          headers={["Campaign", "Source", "Medium", "Clicks", "Unique Visitors", "Unique Members", "Page Views", "Video Views", "Registrations", "Last Activity"]}
          loading={loading} colSpan={10} emptyText="No campaign / UTM traffic yet"
        >
          {filtered.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ ...td, fontWeight: 700, color: "white" }}>{r.campaign || "—"}</td>
              <td style={td}>{r.source || "—"}</td>
              <td style={td}>{r.medium || "—"}</td>
              <td style={{ ...td, color: C.blue, fontWeight: 700 }}>{fmtN(r.clicks)}</td>
              <td style={td}>{fmtN(r.unique_visitors)}</td>
              <td style={td}>{fmtN(r.unique_members)}</td>
              <td style={td}>{fmtN(r.page_views)}</td>
              <td style={td}>{fmtN(r.video_views)}</td>
              <td style={{ ...td, color: C.green, fontWeight: 700 }}>{fmtN(r.registrations)}</td>
              <td style={{ ...td, color: "rgba(255,255,255,0.5)" }}>{r.last_activity ? fmtDT(r.last_activity) : "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
