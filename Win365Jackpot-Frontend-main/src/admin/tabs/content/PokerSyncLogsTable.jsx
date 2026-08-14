import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Btn, Table, Pagination, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const STATUS_TONE = { never: "muted", success: "green", partial: "orange", failed: "red" };

/**
 * PokerSyncLogsTable — one row per source per sync run (Part 10). A failed
 * source is recorded here rather than silently dropped, which is what makes
 * "source A failed but the run continued" visible after the fact.
 */
export default function PokerSyncLogsTable() {
  const { C } = useAdminTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (statusFilter) qs.set("status", statusFilter);
    adminFetch(`${API}/api/admin-panel/poker/sync-logs/?${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) { setItems(j.results || []); setTotal(j.count || 0); } })
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12.5, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none" }}
        >
          {["", "success", "partial", "failed"].map(s => (
            <option key={s || "all"} value={s} style={{ background: C.surface, color: C.text }}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>{total} runs</span>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table
        headers={["Source", "Started", "Finished", "Fetched", "New", "Updated", "Duplicates", "Skipped", "Status", "Error"]}
        loading={loading}
        colSpan={10}
        emptyText="No sync runs recorded yet"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.text }}>
              {item.source_name || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, color: C.sub, whiteSpace: "nowrap" }}>
              {item.started_at ? new Date(item.started_at).toLocaleString() : "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, color: C.sub, whiteSpace: "nowrap" }}>
              {item.finished_at ? new Date(item.finished_at).toLocaleTimeString() : "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.fetched_count}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.green, fontWeight: 700 }}>{item.created_count}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.updated_count}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.orange }}>{item.duplicate_count}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.skipped_count}</td>
            <td style={{ padding: "11px 14px" }}>
              <span style={{
                padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                color: C[STATUS_TONE[item.status]] || C.text,
                background: `${C[STATUS_TONE[item.status]] || C.text}18`,
                border: `1px solid ${C[STATUS_TONE[item.status]] || C.text}44`,
              }}>
                {item.status}
              </span>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 11, color: C.red, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={item.error_message}>
              {item.error_message || "—"}
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}
