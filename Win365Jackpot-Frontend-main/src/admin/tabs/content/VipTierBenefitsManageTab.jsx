import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "tier", label: "VIP Tier", type: "asyncSelect", optionsUrl: "/api/admin-panel/vip-tiers/", optionLabelKey: "label", placeholder: "— Select tier —" },
  { name: "name", label: "Benefit Name", placeholder: "Level Up Bonus" },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "tier", label: "Tier ID" },
  { key: "name", label: "Benefit" },
  { key: "order", label: "Order" },
];

export default function VipTierBenefitsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Benefit"
      apiPath="/api/admin-panel/vip-tier-benefits/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
