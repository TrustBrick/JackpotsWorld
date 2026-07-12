import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "label", label: "Label", placeholder: "Players" },
  { name: "value", label: "Value", placeholder: "20K+" },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "label", label: "Label" },
  { key: "value", label: "Value" },
  { key: "order", label: "Order" },
];

export default function HeroStatsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Hero Stat"
      apiPath="/api/admin-panel/hero-stats/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
