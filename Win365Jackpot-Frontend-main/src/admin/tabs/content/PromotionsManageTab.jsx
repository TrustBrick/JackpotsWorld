import React from "react";
import ManageContentTab from "./ManageContentTab";

const FIELDS = [
  { name: "country",             label: "Country",           placeholder: "India" },
  { name: "country_code",         label: "Country Code (ISO-2, for flag)", placeholder: "IN" },
  { name: "casino_name",            label: "Casino",             placeholder: "Deltin Royale" },
  { name: "title",                   label: "Title",              placeholder: "Welcome Bonus 100%" },
  { name: "validity_text",             label: "Validity",           placeholder: "Valid until Aug 31" },
  { name: "bonus_details",              label: "Bonus Details",      placeholder: "100% match bonus" },
  { name: "cta_label",                   label: "CTA Button Label", placeholder: "Claim Bonus", default: "Claim Bonus" },
  { name: "order",                        label: "Sort Order", type: "number", placeholder: "0" },
  { name: "description",                   label: "Description", type: "textarea", wide: true },
  { name: "benefits",                       label: "Benefits (one per line)", type: "list", wide: true },
  { name: "terms_conditions",                 label: "Terms & Conditions", type: "textarea", wide: true },
  { name: "image",                           label: "Promotion Banner", type: "file", wide: true },
  { name: "casino_logo",                      label: "Casino Logo", type: "file", wide: true },
  { name: "video",                             label: "Promotion Video (optional)", type: "file", accept: "video/*", wide: true },
  { name: "gallery",                            label: "Gallery Images", type: "gallery", galleryEndpoint: "gallery", wide: true },
];

const COLUMNS = [
  { key: "country", label: "Country" },
  { key: "title", label: "Title" },
  { key: "casino_name", label: "Casino" },
  { key: "validity_text", label: "Validity" },
];

export default function PromotionsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Promotion"
      apiPath="/api/admin-panel/promotions/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
