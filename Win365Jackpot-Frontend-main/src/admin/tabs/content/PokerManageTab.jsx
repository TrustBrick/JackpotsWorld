import React from "react";
import ManageContentTab from "./ManageContentTab";

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

export default function PokerManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Tournament"
      apiPath="/api/admin-panel/poker/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
