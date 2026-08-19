import React from "react";
import ManageContentTab from "./ManageContentTab";
import { invalidateLandingCache } from "../../../services/landingService";

/**
 * Back Office CRUD for the landing page's promotional destination blocks.
 *
 * Distinct from "Destination Media" (DestinationMediaManageTab), which is the
 * per-destination gallery. This is one large promotional cut per row with its
 * own headline and CTA, rendered as a full landing-page section. Both tabs
 * point at the same Destination list, so a destination can legitimately have
 * gallery images here AND a showcase there.
 *
 * Everything below is configuration for the shared ManageContentTab — create,
 * edit, media preview, activate/deactivate, reorder and delete all come from
 * it, the same as every other content tab.
 */

const FIELDS = [
  {
    name: "destination",
    label: "Destination",
    type: "asyncSelect",
    optionsUrl: "/api/admin-panel/destinations/",
    optionLabelKey: "name",
    placeholder: "— Select destination —",
  },
  { name: "title", label: "Title", placeholder: "Discover Sri Lanka", wide: true },
  {
    name: "description",
    label: "Subtitle / Description",
    placeholder: "Experience unforgettable VIP travel in Sri Lanka.",
    wide: true,
  },
  {
    name: "media_type",
    label: "Media Type",
    type: "select",
    options: [
      { value: "video", label: "Video" },
      { value: "image", label: "Image" },
    ],
    default: "video",
  },
  // accept is deliberately broad: the field holds a video or an image
  // depending on Media Type above, and the server validates the pair
  // together (see FeaturedDestinationShowcaseSerializer.validate).
  { name: "media", label: "Media File", type: "file", accept: "image/*,video/*", wide: true },
  {
    name: "mobile_media",
    label: "Mobile Media (optional)",
    type: "file",
    accept: "image/*,video/*",
    wide: true,
  },
  {
    name: "poster_image",
    label: "Poster Image (shown before a video plays)",
    type: "file",
    accept: "image/*",
    wide: true,
  },
  { name: "cta_text", label: "CTA Text", placeholder: "Explore Sri Lanka" },
  { name: "display_order", label: "Display Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "destination_name", label: "Destination" },
  { key: "title", label: "Title" },
  { key: "media_type", label: "Type" },
  { key: "display_order", label: "Order" },
];

export default function FeaturedDestinationShowcaseManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Showcase"
      apiPath="/api/admin-panel/featured-destination-showcases/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
      // Drops the 60s landing cache so an edit shows up on the public page
      // without waiting it out — same as every other content tab.
      onSaved={invalidateLandingCache}
    />
  );
}
