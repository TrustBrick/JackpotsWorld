import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "label", label: "Tier Label", placeholder: "Bronze" },
  { name: "accent_color", label: "Accent Color (hex)", placeholder: "#92400e" },
  { name: "accent_bg", label: "Accent Background (hex)", placeholder: "#fef3c7" },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "label", label: "Tier" },
  { key: "order", label: "Order" },
];

export default function VipTiersManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="VIP Tier"
      apiPath="/api/admin-panel/vip-tiers/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
