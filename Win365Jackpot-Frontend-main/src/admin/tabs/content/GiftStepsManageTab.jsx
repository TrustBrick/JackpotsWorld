import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "label", label: "Label", placeholder: "Play & Win" },
  { name: "icon", label: "Icon (emoji)", placeholder: "🎰" },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "icon", label: "Icon" },
  { key: "label", label: "Label" },
  { key: "order", label: "Order" },
];

export default function GiftStepsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Step"
      apiPath="/api/admin-panel/gift-steps/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
