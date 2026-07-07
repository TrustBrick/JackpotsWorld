import React from "react";
import ManageContentTab from "./ManageContentTab";

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

export default function EventsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Event"
      apiPath="/api/admin-panel/events/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
