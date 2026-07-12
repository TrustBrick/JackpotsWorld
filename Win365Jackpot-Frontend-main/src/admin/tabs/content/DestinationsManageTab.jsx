import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "name", label: "Destination Name", placeholder: "Vietnam" },
  { name: "flag_country_code", label: "Country Code (ISO-2, for flag)", placeholder: "VN" },
  { name: "tagline", label: "Tagline", placeholder: "Paradise of the Orient" },
  { name: "accent_color", label: "Accent Color (hex)", placeholder: "#D32F2F" },
  { name: "casinos_text", label: "Top Casinos (comma-separated)", type: "textarea", wide: true },
  { name: "best_for", label: "Best For", placeholder: "Slots, Baccarat, Hold'em Poker", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "name", label: "Destination" },
  { key: "tagline", label: "Tagline" },
  { key: "order", label: "Order" },
];

export default function DestinationsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Destination"
      apiPath="/api/admin-panel/destinations/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
