import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import PokerRegistrationsTable from "./PokerRegistrationsTable";
import PokerReviewTable from "./PokerReviewTable";
import PokerSourcesTable from "./PokerSourcesTable";
import PokerSyncLogsTable from "./PokerSyncLogsTable";
import PokerMediaManageTab from "./PokerMediaManageTab";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { invalidatePokerCache } from "../../../services/pokerService";

const CASINO_CATALOG_URL = "/api/admin-panel/casino-catalog/";

// Part 14's manual-creation form. Country is driven by the shared casino
// catalog so the value always matches what the filters and commission rules
// use; everything else is free text because a poker venue is often not one of
// the managed partner casinos.
const FIELDS = [
  { name: "name", label: "Event Name", placeholder: "Sunday Million Deepstack" },
  { name: "series", label: "Poker Series", placeholder: "WSOP" },
  {
    name: "country", label: "Country", type: "asyncSelect",
    optionsUrl: CASINO_CATALOG_URL, optionsKey: "countries",
    optionValueKey: "id", placeholder: "— Select country —",
  },
  { name: "city", label: "City", placeholder: "Goa" },
  { name: "casino_name", label: "Casino / Venue", placeholder: "Deltin Royale" },
  { name: "event_date", label: "Start Date", type: "date" },
  { name: "end_date", label: "End Date", type: "date" },
  { name: "event_time", label: "Start Time", type: "time" },
  { name: "buy_in", label: "Buy-in", type: "number", placeholder: "500" },
  { name: "currency", label: "Currency", default: "USD", placeholder: "USD" },
  { name: "prize_pool", label: "Guaranteed Prize Pool", type: "number", placeholder: "1000000" },
  { name: "game_type", label: "Game Type", placeholder: "No-Limit Hold'em" },
  { name: "organizer", label: "Organizer", placeholder: "WSOP" },
  { name: "official_url", label: "Official Event URL", placeholder: "https://…", wide: true },
  { name: "seats_available", label: "Seats Available", type: "number", placeholder: "200" },
  {
    name: "status", label: "Status", type: "select", options: [
      { value: "upcoming", label: "Upcoming" },
      { value: "live", label: "Live" },
      { value: "completed", label: "Completed" },
    ],
  },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "image", label: "Tournament Image", type: "file", wide: true },
];

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "series", label: "Series" },
  { key: "casino_name", label: "Casino" },
  { key: "country", label: "Country" },
  { key: "event_date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "review_status", label: "Review" },
];

const VIEWS = [
  { id: "tournaments", label: "Events" },
  { id: "review", label: "Pending Review" },
  { id: "sources", label: "Sources" },
  { id: "sync-logs", label: "Sync Logs" },
  { id: "history", label: "Change History" },
  { id: "media", label: "Hero Media" },
  { id: "registrations", label: "Registrations" },
];

function ChangeHistoryTable() {
  const { C } = useAdminTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/poker/history/`)
      .then(r => r?.json())
      .then(j => { if (j) setRows(j.results || []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ fontSize: 12.5, color: C.muted, padding: 16 }}>Loading…</p>;
  if (rows.length === 0) return <p style={{ fontSize: 12.5, color: C.sub, padding: 16 }}>No recorded changes yet.</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map(row => (
        <div key={row.id} style={{ padding: "11px 14px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{row.tournament_name}</span>
            <span style={{ fontSize: 11, color: C.gold, textTransform: "capitalize" }}>
              {row.action.replace(/_/g, " ")}
              {row.from_status ? ` · ${row.from_status} → ${row.to_status}` : ""}
            </span>
            <span style={{ fontSize: 10.5, color: C.sub }}>
              {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
            </span>
          </div>
          {Object.entries(row.changed_fields || {}).map(([field, [before, after]]) => (
            <div key={field} style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
              <b style={{ color: C.text }}>{field}</b>: {String(before) || "—"} → {String(after) || "—"}
            </div>
          ))}
          {row.note && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>{row.note}</div>}
          {row.actor_email && <div style={{ fontSize: 10.5, color: C.sub, marginTop: 3 }}>by {row.actor_email}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * PokerManageTab — Back Office home for Poker (Part 45's Poker section:
 * Events, Pending Review, Sources, Sync Logs, Change History), organised as
 * one tab with a view toggle rather than five sidebar entries, matching how
 * the panel already groups sub-views.
 */
export default function PokerManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("tournaments");
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(() => {
    adminFetch(`${API}/api/admin-panel/poker/stats/`)
      .then(r => r?.json())
      .then(j => { if (j) setStats(j); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Drops the public /api/poker/ cache (pokerService.js's own, independent
  // of loadStats' admin-dashboard-stats fetch) so a Tournament Image upload
  // shows up without a 60s wait, same as every landingService-backed tab.
  const handleSaved = useCallback(() => {
    invalidatePokerCache();
    loadStats();
  }, [loadStats]);

  const pending = stats?.pending_review || 0;
  const duplicates = stats?.duplicate || 0;
  const failing = stats?.sources_failing || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(pending > 0 || duplicates > 0 || failing > 0) && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderRadius: 9,
            background: `${C.orange}12`, border: `1px solid ${C.orange}33`,
          }}
        >
          <AlertCircle size={15} style={{ color: C.orange, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: C.muted }}>
            {pending > 0 && <><b style={{ color: C.orange }}>{pending}</b> event(s) awaiting review. </>}
            {duplicates > 0 && <><b style={{ color: C.orange }}>{duplicates}</b> flagged as possible duplicates. </>}
            {failing > 0 && <><b style={{ color: C.red }}>{failing}</b> source(s) failing.</>}
          </span>
          {(pending > 0 || duplicates > 0) && (
            <button
              onClick={() => setView("review")}
              style={{
                marginLeft: "auto", background: "none", border: `1px solid ${C.orange}55`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                fontSize: 11.5, fontWeight: 700, color: C.orange,
              }}
            >
              Review now
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
              border: view === v.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: view === v.id ? `${C.gold}15` : "transparent",
              color: view === v.id ? C.gold : C.muted,
            }}
          >
            {v.label}
            {v.id === "review" && pending > 0 && (
              <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 10, fontSize: 10, background: `${C.orange}25`, color: C.orange }}>
                {pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "tournaments" && (
        <ManageContentTab
          resourceLabel="Tournament"
          apiPath="/api/admin-panel/poker/"
          fields={FIELDS}
          columns={COLUMNS}
          onToast={onToast}
          onSaved={handleSaved}
        />
      )}
      {view === "review" && (
        <PokerReviewTable onToast={onToast} defaultFilter="pending_review" onChanged={loadStats} />
      )}
      {view === "sources" && <PokerSourcesTable onToast={onToast} onChanged={loadStats} />}
      {view === "sync-logs" && <PokerSyncLogsTable />}
      {view === "history" && <ChangeHistoryTable />}
      {view === "media" && <PokerMediaManageTab onToast={onToast} />}
      {view === "registrations" && <PokerRegistrationsTable onToast={onToast} />}
    </div>
  );
}
