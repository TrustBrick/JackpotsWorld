import React from "react";
import ManageContentTab from "./ManageContentTab";

/**
 * The WhatsApp text behind each enquiry button on the site.
 *
 * Built on ManageContentTab like every other landing resource, so it inherits
 * the list, the create/edit form, the enable/disable toggle and the delete
 * confirmation without reimplementing any of them.
 *
 * Deliberately NOT wired to invalidateLandingCache: these rows are not part of
 * the landing content payload. The site reads them from /api/enquiry-messages/
 * through hooks/useEnquiryMessage.js, which caches per page load — so a saved
 * edit is live for anyone who loads a page after it, with no rebuild and no
 * deploy.
 *
 * `key` is the binding between a row and the button that uses it. Editing it
 * on a seeded row points that button at nothing and it falls back to its
 * built-in default, so the field is labelled to say so. It stays editable
 * because adding a new row for a future button legitimately needs it.
 */

// Raw ISO timestamps are what the API returns; this is the same value in the
// admin's own locale. Kept local to these two tabs rather than pushed into
// ManageContentTab, which a dozen other resources share.
function stamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

const FIELDS = [
  {
    name: "label",
    label: "Enquiry Type / Button",
    placeholder: "VIP Package Enquiry",
  },
  {
    name: "template",
    label: "WhatsApp Message",
    type: "textarea",
    placeholder: "Hi, I am interested in your VIP package. Please provide more information.",
  },
  {
    name: "description",
    label: "Where it appears",
    placeholder: "Landing page: the VIP Services block",
  },
  {
    name: "placeholders",
    label: "Available placeholders (comma separated)",
    placeholder: "package,price",
  },
  {
    name: "key",
    label: "Key — must match the button in the site code; changing it unbinds this message",
    placeholder: "tour_packages_general",
  },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "label", label: "Enquiry Type / Button" },
  { key: "template", label: "Message" },
  { key: "key", label: "Key" },
  { key: "updated_at", label: "Last Updated", render: (r) => stamp(r.updated_at) },
];

export default function EnquiryMessagesManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Enquiry Message"
      apiPath="/api/admin-panel/enquiry-messages/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
