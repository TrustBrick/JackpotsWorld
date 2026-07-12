import React from "react";
import ManageContentTab from "./ManageContentTab";

// Matches the Lucide icon names looked up by WhyChooseUs.jsx's ICON_MAP.
const ICON_OPTIONS = [
  "ShieldCheck", "Zap", "Gift", "Globe", "HeadphonesIcon",
  "PlaneTakeoff", "Crown", "BarChart3", "Star", "Lock", "CheckCircle",
].map(v => ({ value: v, label: v }));

const FIELDS = [
  { name: "title", label: "Title", placeholder: "Secure & Licensed" },
  { name: "icon_name", label: "Icon", type: "select", options: ICON_OPTIONS, default: "ShieldCheck" },
  { name: "color", label: "Accent Color (hex)", placeholder: "#34d399", default: "#D4AF37" },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "icon_name", label: "Icon" },
  { key: "order", label: "Order" },
];

export default function WhyChooseUsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Feature"
      apiPath="/api/admin-panel/why-choose-us/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
