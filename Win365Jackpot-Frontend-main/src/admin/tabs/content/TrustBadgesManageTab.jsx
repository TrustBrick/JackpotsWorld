import React from "react";
import ManageContentTab from "./ManageContentTab";

const ICON_OPTIONS = [
  "CheckCircle", "Lock", "BadgeCheck", "MapPin", "Star", "ShieldCheck", "Globe",
].map(v => ({ value: v, label: v }));

const FIELDS = [
  { name: "label", label: "Label", placeholder: "Licensed Partners" },
  { name: "icon_name", label: "Icon", type: "select", options: ICON_OPTIONS, default: "CheckCircle" },
  { name: "color", label: "Accent Color (hex)", placeholder: "#34d399", default: "#D4AF37" },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "label", label: "Label" },
  { key: "icon_name", label: "Icon" },
  { key: "order", label: "Order" },
];

export default function TrustBadgesManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Trust Badge"
      apiPath="/api/admin-panel/trust-badges/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
