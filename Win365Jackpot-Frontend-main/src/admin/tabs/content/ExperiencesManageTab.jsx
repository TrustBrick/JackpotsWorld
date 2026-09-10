import React, { useState } from "react";
import { Gem } from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { invalidateExperienceCache } from "../../../services/experienceService";

/**
 * ExperiencesManageTab — the destination half of the public landing page.
 *
 * ONE TAB, FIVE VIEWS, ONE ENDPOINT. The "Beyond the Casino" overview band and
 * the four pillars behind it (Luxury Travel, Hotels & Resorts, Dining &
 * Entertainment, VIP Concierge) are one model separated by `category`, so this
 * is a view toggle over the shared ManageContentTab with
 * `listParams` narrowing the list and a locked default forcing the category on
 * create. Nothing here reimplements list/create/edit/delete, file upload,
 * pagination or the active toggle.
 *
 * EVERY string the four public sections render comes from these rows — titles,
 * subtitles, body copy, CTA labels, icons and accent colours. The components
 * contain no card copy at all; a pillar with no rows renders nothing rather
 * than falling back to hardcoded text.
 */

const DESTINATION_URL = "/api/admin-panel/destinations/";

// Kept in step with ICON_MAP in components/experiences/shared.js. A name not
// in that map falls back to a neutral icon rather than breaking the section,
// but offering only names it knows is what stops an admin picking one that
// silently does nothing.
const ICON_OPTIONS = [
  "Plane", "Ship", "BedDouble", "Home", "Building2", "UtensilsCrossed",
  "Martini", "Music", "Drama", "Sparkles", "Crown", "CalendarDays", "Car",
  "Headset", "MapPin", "Star", "Gem", "Spade",
].map(v => ({ value: v, label: v }));

const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

const PILLARS = [
  {
    id: "overview",
    label: "Beyond the Casino",
    resource: "Overview Card",
    hint: "The six signposts under the hero. These link to the rest of the page — set the CTA Link to an anchor like #stays, or to a route like /poker.",
  },
  {
    id: "luxury_travel",
    label: "Luxury Travel",
    resource: "Luxury Travel Item",
    hint: "Private jets, cruises and how members get to a destination.",
  },
  {
    id: "stay",
    label: "Hotels & Resorts",
    resource: "Stay",
    hint: "Where members stay. Name a property only once an arrangement is actually in place.",
  },
  {
    id: "dining",
    label: "Dining & Entertainment",
    resource: "Dining & Entertainment Item",
    hint: "Restaurants, lounges, live music, shows and nightlife around each destination.",
  },
  {
    id: "concierge",
    label: "VIP Concierge",
    resource: "Concierge Service",
    hint: "What a VIP host arranges. These render as the concierge service list.",
  },
];

/**
 * `category` is deliberately absent from the form: it is forced by the view
 * the admin is in, so a card cannot be created into the wrong pillar by
 * mistake, and the list is already filtered to that pillar.
 */
function fieldsFor(pillar) {
  return [
    { name: "title", label: "Title", placeholder: "Private Jet Travel" },
    { name: "subtitle", label: "Subtitle (small caps line)", placeholder: "Arrive on your schedule" },
    {
      name: "description", label: "Description", type: "textarea", wide: true,
      placeholder: "What is arranged, and what a member gets. Describe the service — do not promise availability or a price.",
    },
    {
      name: "destination", label: "Destination", type: "asyncSelect",
      optionsUrl: DESTINATION_URL, optionValueKey: "id", optionLabelKey: "name",
      placeholder: "— Network-wide —",
    },
    { name: "city", label: "City", placeholder: "Leave blank if not tied to one city" },
    {
      name: "partner", label: "Partner / Operator",
      placeholder: "Only once an arrangement is in place",
    },
    { name: "icon_name", label: "Icon", type: "select", options: ICON_OPTIONS, default: "Gem" },
    { name: "accent_color", label: "Accent Colour (hex)", default: "#D4AF37", placeholder: "#D4AF37" },
    {
      name: "cta_text", label: "CTA Label",
      // An overview card sends you somewhere; a pillar card opens an enquiry.
      default: pillar.id === "overview" ? "Explore" : "Enquire Now",
      placeholder: pillar.id === "overview" ? "Explore" : "Enquire Now",
    },
    {
      name: "cta_link", label: "CTA Link",
      placeholder: "#stays, /poker, or a full URL",
      hint: "Where this card sends the visitor. Overview cards need one; pillar cards leave it blank and open the enquiry form instead.",
    },
    {
      name: "enquiry_key", label: "WhatsApp Message Key",
      placeholder: `experience_${pillar.id === "luxury_travel" ? "private_jet" : pillar.id}`,
      hint: "Must match a key in Landing Page → Enquiry Messages, or the WhatsApp handoff opens an empty composer.",
    },
    { name: "image", label: "Image (optional)", type: "file", accept: IMAGE_ACCEPT, wide: true },
    { name: "video", label: "Video (optional)", type: "file", accept: VIDEO_ACCEPT, wide: true },
    { name: "is_featured", label: "Featured", type: "boolean", checkboxLabel: "Show as featured" },
    { name: "is_active", label: "Active", type: "boolean", default: true },
    { name: "display_order", label: "Sort Order", type: "number", placeholder: "0" },
    // Forced, and hidden from the admin: the view already says which pillar
    // this is. Sent on create so the row lands in the right section.
    { name: "category", type: "hidden", default: pillar.id },
  ];
}

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "destination_name", label: "Destination" },
  { key: "partner", label: "Partner" },
  { key: "display_order", label: "Order" },
];

export default function ExperiencesManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [pillar, setPillar] = useState(PILLARS[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Gem size={16} style={{ color: C.gold }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>
          Destination Experiences
        </h3>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PILLARS.map(p => (
          <button
            key={p.id}
            onClick={() => setPillar(p)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
              border: pillar.id === p.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: pillar.id === p.id ? `${C.gold}15` : "transparent",
              color: pillar.id === p.id ? C.gold : C.muted,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
        {pillar.hint} These appear on the public landing page. Do not name a
        venue, quote a price or promise availability that is not actually
        arranged.
      </p>

      <ManageContentTab
        // key forces a clean remount per pillar, so the list, the open form
        // and the editing row never carry over from the pillar before.
        key={pillar.id}
        resourceLabel={pillar.resource}
        apiPath="/api/admin-panel/experiences/"
        listParams={{ category: pillar.id }}
        fields={fieldsFor(pillar)}
        columns={COLUMNS}
        onToast={onToast}
        onSaved={invalidateExperienceCache}
      />
    </div>
  );
}
