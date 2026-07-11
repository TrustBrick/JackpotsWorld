import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "name",         label: "Location Name",              placeholder: "Vietnam" },
  { name: "country_code", label: "Country Code (ISO-2, for flag)", placeholder: "VN" },
  { name: "order",        label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "name", label: "Location" },
  { key: "country_code", label: "Code" },
  { key: "order", label: "Order" },
];

export default function LocationsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Location"
      apiPath="/api/admin-panel/locations/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
