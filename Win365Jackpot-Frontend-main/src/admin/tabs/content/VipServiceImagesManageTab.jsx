import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "label", label: "Label", placeholder: "Classic Massage" },
  { name: "category", label: "Category", placeholder: "Wellness" },
  { name: "image", label: "Image", type: "file", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "label", label: "Label" },
  { key: "category", label: "Category" },
  { key: "order", label: "Order" },
];

export default function VipServiceImagesManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="VIP Service Image"
      apiPath="/api/admin-panel/vip-service-images/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
