import React, { useState } from "react";
import { Ship } from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { invalidateLandingCache } from "../../../services/landingService";

/**
 * CruisesManageTab — the Cruise Offline Casino Package card, all of it.
 *
 * ONE TAB, THREE VIEWS. The card is one parent row plus two child tables, and
 * those were briefly three sibling tabs in the Landing Page nav. Three entries
 * for one card pushed the unrelated tabs around and made an admin hunt for
 * which of them held the thing they wanted to change, so they are pills inside
 * a single "Cruises" tab instead — the same shape ExperiencesManageTab uses for
 * its five pillars.
 *
 * Unlike that one, each view here talks to its OWN endpoint with its own
 * fields and columns, rather than one endpoint filtered by a category. So the
 * endpoint travels on the view object next to the fields it belongs with.
 *
 * The parent's two plain lists (the pills under the title, and the checklist)
 * are edited on the Package view as one-per-line text. They are just strings,
 * and a child table for them would be needless clicking.
 */

const PACKAGE_FIELDS = [
  { name: "title", label: "Title", placeholder: "Cruise Offline Casino Package" },
  { name: "subtitle", label: "Subtitle", placeholder: "International Waters · Casino at Sea · Full Luxury Experience", wide: true },
  { name: "eyebrow_text", label: "Pill Above Card", placeholder: "Limited Availability · Exclusive Experience", wide: true },
  { name: "icon_name", label: "Icon (Lucide name)", placeholder: "Ship" },
  { name: "accent_color", label: "Accent Colour (hex)", placeholder: "#22d3ee" },
  { name: "highlights", label: "Pills under the title (one per line)", type: "list", wide: true },
  { name: "inclusions", label: "Checklist (one per line)", type: "list", wide: true },
  { name: "cta_text", label: "Button Text", placeholder: "Enquire – Cruise Offline Casino Package", wide: true },
  { name: "enquiry_key", label: "Enquiry Message Key", placeholder: "cruise_package" },
  { name: "is_active", label: "Active", type: "boolean", default: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const PACKAGE_COLUMNS = [
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "is_active", label: "Active" },
];

/* The parent picker both child views need. Same endpoint as the Package view
   above, read here only to fill a dropdown. */
const PACKAGE_PICKER = {
  name: "package",
  label: "Cruise Package",
  type: "asyncSelect",
  optionsUrl: "/api/admin-panel/cruise-packages/",
  optionLabelKey: "title",
  placeholder: "— Select package —",
};

const DETAIL_FIELDS = [
  PACKAGE_PICKER,
  { name: "label", label: "Label", placeholder: "Transport" },
  { name: "value", label: "Value", placeholder: "Luxury Cruise Ship", wide: true },
  { name: "icon_name", label: "Icon (Lucide name)", placeholder: "Ship" },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const DETAIL_COLUMNS = [
  { key: "label", label: "Label" },
  { key: "value", label: "Value" },
  { key: "icon_name", label: "Icon" },
];

const MEDIA_FIELDS = [
  PACKAGE_PICKER,
  { name: "media_type", label: "Media Type", type: "select", options: [{ value: "image", label: "Image" }, { value: "video", label: "Video" }], default: "image" },
  { name: "label", label: "Caption (optional)", placeholder: "Onboard Casino Floor" },
  { name: "media", label: "Media File", type: "file", accept: "image/*,video/*", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const MEDIA_COLUMNS = [
  { key: "label", label: "Caption" },
  { key: "media_type", label: "Type" },
  { key: "order", label: "Order" },
];

const VIEWS = [
  {
    id: "package",
    label: "Package",
    resource: "Cruise Package",
    apiPath: "/api/admin-panel/cruise-packages/",
    fields: PACKAGE_FIELDS,
    columns: PACKAGE_COLUMNS,
    hint: "The card itself — its wording, colour, pills and checklist. Add a second row for another sailing and it renders as its own card.",
  },
  {
    id: "details",
    label: "Details Grid",
    resource: "Detail",
    apiPath: "/api/admin-panel/cruise-package-details/",
    fields: DETAIL_FIELDS,
    columns: DETAIL_COLUMNS,
    hint: "The labelled grid on the card — Transport, Cabin, Dining and the rest. An icon name it does not recognise falls back to a neutral icon rather than breaking the page.",
  },
  {
    id: "media",
    label: "Media",
    resource: "Slide",
    apiPath: "/api/admin-panel/cruise-package-media/",
    fields: MEDIA_FIELDS,
    columns: MEDIA_COLUMNS,
    hint: "The auto-scrolling strip at the top of the card. With no slides here the card shows the two cruise photographs bundled with the site, so it is never empty.",
  },
];

export default function CruisesManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState(VIEWS[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Ship size={16} style={{ color: C.gold }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>
          Cruise Offline Casino Package
        </h3>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
              border: view.id === v.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: view.id === v.id ? `${C.gold}15` : "transparent",
              color: view.id === v.id ? C.gold : C.muted,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
        {view.hint}
      </p>

      <ManageContentTab
        // key forces a clean remount per view. Without it the list, the open
        // form and the row being edited would carry over from the view before
        // — and since these three views post to different endpoints with
        // different fields, that would mean submitting one view's form data
        // to another view's API.
        key={view.id}
        resourceLabel={view.resource}
        apiPath={view.apiPath}
        fields={view.fields}
        columns={view.columns}
        onToast={onToast}
        onSaved={invalidateLandingCache}
      />
    </div>
  );
}
