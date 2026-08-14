import React from "react";
import ManageContentTab from "./ManageContentTab";
import { invalidateLandingCache } from "../../../services/landingService";

/**
 * PremiumPartnersManageTab — Back Office control for the landing hero's
 * Top Premium Partners showcase.
 *
 * Reuses ManageContentTab, so uploads go through the same multipart flow,
 * the same admin auth and the same error surfacing as every other landing
 * section — no second upload system. invalidateLandingCache clears the
 * 60s landing read cache on save, so a change shows up on the next hero
 * fetch instead of waiting out the TTL.
 *
 * Nothing here touches Destinations: this writes only to
 * /api/admin-panel/premium-partners/.
 */

// Extensions mirror authapp/utils/file_validation.py exactly — the backend is
// the authority, this just stops the file picker from offering something that
// would be rejected on arrival.
const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

const FIELDS = [
  { name: "name", label: "Partner Name", placeholder: "Bellagio Casino" },
  { name: "country", label: "Country", placeholder: "Sri Lanka" },
  { name: "city", label: "City", placeholder: "Colombo" },
  { name: "flag_country_code", label: "Country Code (ISO-2, for caption flag)", placeholder: "LK" },
  {
    name: "description", label: "Description (shown beside the name)",
    placeholder: "Jewel of the Indian Ocean", wide: true,
  },
  {
    name: "hero_image", label: "Hero Image (JPG, PNG, WEBP — max 5MB)",
    type: "file", accept: IMAGE_ACCEPT, wide: true,
  },
  {
    name: "hero_video", label: "Hero Video (MP4, WEBM, MOV — max 50MB). Takes priority over the image, which becomes its poster.",
    type: "file", accept: VIDEO_ACCEPT, wide: true,
  },
  {
    name: "logo", label: "Partner Logo (optional)",
    type: "file", accept: IMAGE_ACCEPT, wide: true,
  },
  {
    name: "partner_type", label: "Partner Type", type: "select",
    default: "top_premium",
    options: [
      { value: "top_premium", label: "Top Premium Partner" },
      { value: "premium", label: "Premium Partner" },
      { value: "standard", label: "Standard Partner" },
    ],
  },
  {
    name: "is_featured_in_hero", label: "Featured in Hero",
    type: "boolean", default: true,
  },
  { name: "order", label: "Display Order", type: "number", placeholder: "1" },
];

const COLUMNS = [
  { key: "name", label: "Partner" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "partner_type", label: "Type" },
  { key: "media_type", label: "Media" },
  { key: "order", label: "Order" },
];

export default function PremiumPartnersManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Premium Partner"
      apiPath="/api/admin-panel/premium-partners/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
      onSaved={invalidateLandingCache}
    />
  );
}
