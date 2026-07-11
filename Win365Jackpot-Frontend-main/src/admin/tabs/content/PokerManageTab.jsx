import React, { useState } from "react";
import ManageContentTab from "./ManageContentTab";
import PokerRegistrationsTable from "./PokerRegistrationsTable";
import { useAdminTheme } from "../../context/AdminThemeContext";

const FIELDS = [
  { name: "name",              label: "Tournament Name",  placeholder: "Sunday Million Deepstack" },
  { name: "casino_name",        label: "Casino",           placeholder: "Deltin Royale" },
  { name: "location",           label: "Location",         placeholder: "Goa, India" },
  { name: "event_date",          label: "Date", type: "date" },
  { name: "event_time",           label: "Time", type: "time" },
  { name: "buy_in",                label: "Buy-in (USD)", type: "number", placeholder: "500" },
  { name: "prize_pool",             label: "Prize Pool (USD)", type: "number", placeholder: "1000000" },
  { name: "seats_available",         label: "Seats Available", type: "number", placeholder: "200" },
  { name: "status",                   label: "Status", type: "select", options: [
    { value: "upcoming", label: "Upcoming" }, { value: "live", label: "Live" }, { value: "completed", label: "Completed" },
  ] },
  { name: "description",                label: "Description", type: "textarea", wide: true },
  { name: "image",                       label: "Tournament Image", type: "file", wide: true },
];

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "casino_name", label: "Casino" },
  { key: "event_date", label: "Date" },
  { key: "status", label: "Status" },
];

const VIEWS = [
  { id: "tournaments", label: "Tournaments" },
  { id: "registrations", label: "Registrations" },
];

export default function PokerManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("tournaments");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
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
          </button>
        ))}
      </div>

      {view === "tournaments" ? (
        <ManageContentTab
          resourceLabel="Tournament"
          apiPath="/api/admin-panel/poker/"
          fields={FIELDS}
          columns={COLUMNS}
          onToast={onToast}
        />
      ) : (
        <PokerRegistrationsTable onToast={onToast} />
      )}
    </div>
  );
}
