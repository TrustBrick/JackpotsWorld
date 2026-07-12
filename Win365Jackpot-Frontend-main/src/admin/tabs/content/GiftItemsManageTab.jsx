import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "name", label: "Prize Name", placeholder: "Rolex Submariner" },
  { name: "tier", label: "Tier", placeholder: "LEGENDARY" },
  { name: "tier_color", label: "Tier Color (hex)", placeholder: "#D4AF37" },
  { name: "value", label: "Market Value", placeholder: "$15K+" },
  { name: "accent_color", label: "Accent Color (hex)", placeholder: "#D4AF37" },
  { name: "featured", label: "Featured (large hero card)", type: "boolean" },
  { name: "subtitle", label: "Subtitle", placeholder: "Swiss Precision · Timeless Prestige", wide: true },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "perks", label: "Perks (one per line)", type: "list", wide: true },
  { name: "logo", label: "Logo Image", type: "file", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "name", label: "Prize" },
  { key: "tier", label: "Tier" },
  { key: "value", label: "Value" },
  { key: "featured", label: "Featured", render: item => (item.featured ? "Yes" : "No") },
];

export default function GiftItemsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Gift"
      apiPath="/api/admin-panel/gift-items/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
