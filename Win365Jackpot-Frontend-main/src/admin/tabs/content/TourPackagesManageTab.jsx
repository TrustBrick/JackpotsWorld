import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "name", label: "Package Name", placeholder: "Premium" },
  { name: "price", label: "Price", placeholder: "$15,000" },
  { name: "icon", label: "Icon (emoji)", placeholder: "🎲" },
  { name: "color", label: "Accent Color (hex)", placeholder: "#D4AF37" },
  { name: "badge", label: "Badge (optional)", placeholder: "Popular" },
  { name: "duration", label: "Duration", placeholder: "3 Nights" },
  { name: "flight", label: "Flight", placeholder: "Economy" },
  { name: "hotel", label: "Hotel", placeholder: "Standard 5★ (3N)" },
  { name: "food", label: "Food", placeholder: "Casino" },
  { name: "liquor", label: "Liquor", placeholder: "Over the Gaming Table (Premium)", wide: true },
  { name: "airport_vip", label: "Airport VIP Service", type: "boolean" },
  { name: "jackpot_rewards", label: "Jackpot Rewards", type: "boolean" },
  { name: "vip_transport", label: "VIP Transportation", type: "boolean" },
  { name: "vip_transport_note", label: "VIP Transport Note", placeholder: "*" },
  { name: "spa", label: "Spa Service", type: "boolean" },
  { name: "spa_note", label: "Spa Note", placeholder: "*" },
  { name: "shopping_voucher", label: "Shopping Voucher", type: "boolean" },
  { name: "shopping_note", label: "Shopping Note", placeholder: "*" },
  { name: "visa", label: "Visa Included", type: "boolean" },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "name", label: "Package" },
  { key: "price", label: "Price" },
  { key: "duration", label: "Duration" },
  { key: "badge", label: "Badge" },
];

export default function TourPackagesManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Package"
      apiPath="/api/admin-panel/tour-packages/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
