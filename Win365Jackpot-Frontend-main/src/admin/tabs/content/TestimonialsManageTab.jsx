import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "name", label: "Name", placeholder: "Rajesh K." },
  { name: "city", label: "City / Country", placeholder: "Mumbai, India" },
  { name: "country_code", label: "Country Code (ISO-2, for flag)", placeholder: "IN" },
  { name: "rating", label: "Rating (1-5)", type: "number", placeholder: "5", default: 5 },
  { name: "amount_won", label: "Amount Won", placeholder: "$8.5 Lakhs" },
  { name: "destination", label: "Destination", placeholder: "Macau" },
  { name: "accent_color", label: "Accent Color (hex)", placeholder: "#D4AF37" },
  { name: "avatar", label: "Avatar Photo", type: "file", wide: true },
  { name: "text", label: "Testimonial Text", type: "textarea", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "city", label: "City" },
  { key: "amount_won", label: "Won" },
  { key: "destination", label: "Destination" },
];

export default function TestimonialsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Testimonial"
      apiPath="/api/admin-panel/testimonials/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
