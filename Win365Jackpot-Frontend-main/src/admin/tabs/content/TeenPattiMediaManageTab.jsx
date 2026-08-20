import React from "react";
import ManageContentTab from "./ManageContentTab";
import { invalidateLandingCache } from "../../../services/landingService";

/**
 * TeenPattiMediaManageTab — Back Office control for the Teen Patti hero's
 * three cinematic media slots (two side cards + the background watermark).
 *
 * Writes only to /api/admin-panel/section-media/teen-patti/, which the
 * backend hardcodes to section="teen_patti" on every create/update — this
 * tab has no way to touch a Poker row even if it wanted to (see
 * views/landing_views.py's _SectionMediaAdminListCreateBase/DetailBase).
 *
 * Reuses ManageContentTab exactly like PremiumPartnersManageTab: same
 * multipart upload flow, same admin auth, same error surfacing.
 */

const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

const SLOT_OPTIONS = [
  // Background only. The side-card slots were removed from the public hero —
  // both pages now carry a single cinematic watermark behind their content
  // instead of media rails beside it — so offering them here would invite an
  // upload that renders nowhere. The model keeps all three choices
  // (landing_models.SectionMedia.SLOT_CHOICES) so any existing side row stays
  // valid and readable; this list only governs what a new one can be.
  { value: "background", label: "Background Watermark" },
];

const FIELDS = [
  { name: "slot", label: "Slot", type: "select", default: "background", options: SLOT_OPTIONS },
  {
    name: "label", label: "Badge Label (optional — e.g. FEATURED, CASINO EXPERIENCE)",
    placeholder: "FEATURED",
  },
  {
    name: "video", label: "Video (MP4, WEBM, MOV — max 50MB). Takes priority over the poster image.",
    type: "file", accept: VIDEO_ACCEPT, wide: true,
  },
  {
    name: "poster_image", label: "Poster / Fallback Image (JPG, PNG, WEBP — max 5MB)",
    type: "file", accept: IMAGE_ACCEPT, wide: true,
  },
  { name: "is_active", label: "Active", type: "boolean", default: true },
];

const COLUMNS = [
  { key: "slot", label: "Slot" },
  { key: "label", label: "Badge" },
  { key: "media_type", label: "Media" },
];

export default function TeenPattiMediaManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Teen Patti Media"
      apiPath="/api/admin-panel/section-media/teen-patti/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
      onSaved={invalidateLandingCache}
    />
  );
}
