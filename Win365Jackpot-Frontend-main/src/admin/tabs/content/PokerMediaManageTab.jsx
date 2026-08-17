import React from "react";
import ManageContentTab from "./ManageContentTab";
import { invalidateLandingCache } from "../../../services/landingService";

/**
 * PokerMediaManageTab — Back Office control for the Poker hero's three
 * cinematic media slots. Mirrors TeenPattiMediaManageTab exactly, but writes
 * to /api/admin-panel/section-media/poker/, which the backend hardcodes to
 * section="poker" on every write — this tab has no way to touch a Teen
 * Patti row (see views/landing_views.py's shared base classes).
 */

const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

const SLOT_OPTIONS = [
  { value: "side_left", label: "Side Card — Left" },
  { value: "side_right", label: "Side Card — Right" },
  { value: "background", label: "Background Watermark" },
];

const FIELDS = [
  { name: "slot", label: "Slot", type: "select", default: "side_left", options: SLOT_OPTIONS },
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

export default function PokerMediaManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Poker Media"
      apiPath="/api/admin-panel/section-media/poker/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
      onSaved={invalidateLandingCache}
    />
  );
}
