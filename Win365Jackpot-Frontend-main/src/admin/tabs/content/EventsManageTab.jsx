import React, { useState } from "react";
import ManageContentTab from "./ManageContentTab";
import EventTicketsTable from "./EventTicketsTable";
import { useAdminTheme } from "../../context/AdminThemeContext";

const FIELDS = [
  { name: "name",              label: "Event Name",       placeholder: "Riviera Grand Slam Weekend" },
  { name: "country",            label: "Country",          placeholder: "India" },
  { name: "city",                label: "City",             placeholder: "Goa" },
  { name: "venue",                label: "Venue",            placeholder: "Deltin Royale" },
  { name: "event_date",             label: "Date",  type: "date" },
  { name: "event_time",              label: "Time",  type: "time" },
  { name: "category",                 label: "Category",         placeholder: "High Roller" },
  { name: "status",                    label: "Status", type: "select", options: [
    { value: "upcoming", label: "Upcoming" }, { value: "live", label: "Live" }, { value: "completed", label: "Completed" },
  ] },
  { name: "short_description",          label: "Short Description", placeholder: "One-line summary shown on the card", wide: true },
  { name: "description",                 label: "Full Description",  type: "textarea", wide: true },
  { name: "ticket_note",                  label: "Ticket Note", placeholder: "Entry requirements, buy-in, etc.", wide: true },
  { name: "image",                         label: "Event Image", type: "file", wide: true },
];

const COLUMNS = [
  { key: "name" },
  { key: "country" },
  { key: "event_date", label: "Date" },
  { key: "category" },
].map(c => ({ label: c.label || c.key[0].toUpperCase() + c.key.slice(1), ...c }));

const VIEWS = [
  { id: "events", label: "Events" },
  { id: "registrations", label: "Ticket Requests" },
];

export default function EventsManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("events");

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

      {view === "events" ? (
        <ManageContentTab
          resourceLabel="Event"
          apiPath="/api/admin-panel/events/"
          fields={FIELDS}
          columns={COLUMNS}
          onToast={onToast}
        />
      ) : (
        <EventTicketsTable onToast={onToast} />
      )}
    </div>
  );
}
