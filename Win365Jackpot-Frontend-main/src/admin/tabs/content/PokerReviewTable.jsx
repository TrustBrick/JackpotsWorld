import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ExternalLink, Check, X, Copy, Archive, History } from "lucide-react";
import { Btn, Table, Pagination, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

// Mirrors ALLOWED_REVIEW_TRANSITIONS in poker_review_service.py. Advisory —
// the server validates every transition, so a stale tab can't force one.
const NEXT_ACTIONS = {
  discovered: ["pending_review", "rejected"],
  pending_review: ["approved", "published", "rejected", "duplicate"],
  approved: ["published", "pending_review", "rejected", "archived"],
  published: ["archived", "pending_review"],
  rejected: ["pending_review"],
  duplicate: ["pending_review", "rejected"],
  archived: ["published", "pending_review"],
};

const ACTION_META = {
  approved: { label: "Approve", icon: Check, tone: "teal" },
  published: { label: "Publish", icon: Check, tone: "green" },
  rejected: { label: "Reject", icon: X, tone: "red" },
  duplicate: { label: "Mark Duplicate", icon: Copy, tone: "orange" },
  archived: { label: "Archive", icon: Archive, tone: "muted" },
  pending_review: { label: "Send to Review", icon: History, tone: "blue" },
};

const REVIEW_TONE = {
  discovered: "muted", pending_review: "orange", approved: "teal",
  published: "green", rejected: "red", duplicate: "purple", archived: "muted",
};

const REVIEW_FILTERS = [
  "", "pending_review", "duplicate", "published", "approved", "rejected", "archived",
];

function HistoryDrawer({ tournament, onClose }) {
  const { C } = useAdminTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournament) return;
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/poker/${tournament.id}/history/`)
      .then(r => r?.json())
      .then(j => { if (j) setRows(Array.isArray(j) ? j : (j.results || [])); })
      .finally(() => setLoading(false));
  }, [tournament]);

  if (!tournament) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 520, maxWidth: "100%", height: "100%", overflowY: "auto", background: C.bg, borderLeft: `1px solid ${C.border}`, padding: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Change History</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>{tournament.name}</p>

        {loading ? (
          <p style={{ fontSize: 12, color: C.sub }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 12, color: C.sub }}>No recorded changes.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map(row => (
              <div key={row.id} style={{ padding: "10px 12px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, textTransform: "capitalize" }}>
                    {row.action.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 10.5, color: C.sub }}>
                    {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
                  </span>
                </div>
                {row.from_status && (
                  <div style={{ fontSize: 11.5, color: C.muted }}>
                    {row.from_status} → {row.to_status}
                  </div>
                )}
                {Object.entries(row.changed_fields || {}).map(([field, [before, after]]) => (
                  <div key={field} style={{ fontSize: 11.5, color: C.muted }}>
                    <b style={{ color: C.text }}>{field}</b>: {String(before) || "—"} → {String(after) || "—"}
                  </div>
                ))}
                {row.note && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>{row.note}</div>}
                {row.actor_email && (
                  <div style={{ fontSize: 10.5, color: C.sub, marginTop: 4 }}>by {row.actor_email}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PokerReviewTable — the Part 8 review queue. Every action here goes through
 * the /review/ endpoint, which validates the lifecycle and writes a change
 * history row; nothing in this table edits review_status directly.
 */
export default function PokerReviewTable({ onToast, defaultFilter = "pending_review", onChanged }) {
  const { C } = useAdminTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState(defaultFilter);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (reviewFilter) qs.set("review_status", reviewFilter);
    if (search.trim()) qs.set("search", search.trim());
    adminFetch(`${API}/api/admin-panel/poker/?${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) { setItems(j.results || []); setTotal(j.count || 0); } })
      .finally(() => setLoading(false));
  }, [page, reviewFilter, search]);

  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);

  const review = async (item, action) => {
    let duplicateOf;
    if (action === "duplicate") {
      duplicateOf = window.prompt(
        `Mark "${item.name}" as a duplicate of which event? Enter the other event's ID.`,
        item.duplicate_of || "",
      );
      if (!duplicateOf) return;
    }
    setBusyId(item.id);
    const r = await adminFetch(`${API}/api/admin-panel/poker/${item.id}/review/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, duplicate_of: duplicateOf || undefined }),
    });
    setBusyId(null);
    if (!r) { onToast?.("Session expired", false); return; }
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      onToast?.(`Event ${ACTION_META[action]?.label.toLowerCase() || action}d`, true);
      load(); onChanged?.();
    } else {
      onToast?.(body.error || "Action failed", false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HistoryDrawer tournament={history} onClose={() => setHistory(null)} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={13} style={{ position: "absolute", left: 10, color: C.muted, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name or casino…"
            style={{ width: 230, padding: "7px 10px 7px 30px", borderRadius: 8, fontSize: 12.5, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none" }}
          />
        </div>

        <select
          value={reviewFilter}
          onChange={e => { setReviewFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12.5, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none" }}
        >
          {REVIEW_FILTERS.map(f => (
            <option key={f || "all"} value={f} style={{ background: C.surface, color: C.text }}>
              {f ? f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "All review states"}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>{total} events</span>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table
        headers={["Event", "Series", "Location", "Venue", "Date", "Buy-in", "Source", "Review", "Actions"]}
        loading={loading}
        colSpan={9}
        emptyText="Nothing in this review state"
      >
        {items.map(item => (
          <tr key={item.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.text }}>
              {item.name}
              <div style={{ fontSize: 10.5, color: C.sub }}>#{item.id}</div>
              {item.duplicate_of && (
                <div style={{ fontSize: 10.5, color: C.orange }}>duplicate of #{item.duplicate_of}</div>
              )}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.series || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>
              {[item.city, item.country].filter(Boolean).join(", ") || item.location || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.casino_name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>{item.event_date}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>
              {Number(item.buy_in) > 0 ? `${item.currency || "USD"} ${Number(item.buy_in).toLocaleString()}` : "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 11.5 }}>
              {item.source_name || "Manual"}
              {item.source_url && (
                <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                   title="View original source"
                   style={{ color: C.gold, marginLeft: 5, display: "inline-flex", verticalAlign: "middle" }}>
                  <ExternalLink size={11} />
                </a>
              )}
              {item.discovered_at && (
                <div style={{ fontSize: 10, color: C.sub }}>
                  found {new Date(item.discovered_at).toLocaleDateString()}
                </div>
              )}
            </td>
            <td style={{ padding: "11px 14px" }}>
              <span style={{
                padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                color: C[REVIEW_TONE[item.review_status]] || C.text,
                background: `${C[REVIEW_TONE[item.review_status]] || C.text}18`,
                border: `1px solid ${C[REVIEW_TONE[item.review_status]] || C.text}44`,
              }}>
                {item.review_status.replace(/_/g, " ")}
              </span>
            </td>
            <td style={{ padding: "11px 14px" }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                {(NEXT_ACTIONS[item.review_status] || []).map(action => {
                  const meta = ACTION_META[action];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={action}
                      disabled={busyId === item.id}
                      onClick={() => review(item, action)}
                      title={meta.label}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                        borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: "none", color: C[meta.tone] || C.text,
                        border: `1px solid ${C[meta.tone] || C.border}55`,
                      }}
                    >
                      <Icon size={11} /> {meta.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setHistory(item)}
                  title="Change history"
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.muted, display: "flex" }}
                >
                  <History size={12} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}
