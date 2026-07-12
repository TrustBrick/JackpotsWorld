import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "destination", label: "Destination", type: "asyncSelect", optionsUrl: "/api/admin-panel/destinations/", optionLabelKey: "name", placeholder: "— Select destination —" },
  { name: "media_type", label: "Media Type", type: "select", options: [{ value: "image", label: "Image" }, { value: "video", label: "Video" }], default: "image" },
  { name: "label", label: "Caption", placeholder: "Casino Corona, Phu Quoc" },
  { name: "media", label: "Media File", type: "file", accept: "image/*,video/*", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "destination", label: "Destination ID" },
  { key: "label", label: "Caption" },
  { key: "media_type", label: "Type" },
];

export default function DestinationMediaManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Media"
      apiPath="/api/admin-panel/destination-media/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
