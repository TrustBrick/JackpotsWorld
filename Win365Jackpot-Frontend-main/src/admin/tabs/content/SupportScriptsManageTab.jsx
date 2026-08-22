import React from "react";
import ManageContentTab from "./ManageContentTab";

/**
 * The standard support wording from the Call & Live Chat Script Manual.
 *
 * Built on ManageContentTab like the other Back Office content resources, so
 * the list, form, enable/disable and delete all behave the way an admin
 * already expects.
 *
 * "Auto-send on chat open" is the field that matters. Exactly one row should
 * have it — the greeting — because an automatic message cannot check anything
 * in the Admin Portal first, which is the manual's governing rule. The other
 * rows are wording an agent sends deliberately; they live here so the team has
 * one agreed version of each rather than five retyped ones.
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
  { name: "label", label: "Script", placeholder: "Live Chat Greeting" },
  { name: "body", label: "Message", type: "textarea", placeholder: "Hello! Welcome to Jackpots World VIP Support. How can I help you today?" },
  {
    name: "is_auto_send",
    label: "Auto-send when a live chat opens (greeting only)",
    type: "boolean",
  },
  { name: "source_section", label: "Source in the manual", placeholder: "Manual s.35 - Quick Reference Script Library" },
  { name: "key", label: "Key — the greeting must stay 'greeting'", placeholder: "greeting" },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
];

const COLUMNS = [
  { key: "label", label: "Script" },
  { key: "body", label: "Message" },
  // React renders a bare `true` as nothing, so without an explicit renderer
  // the column that matters most here would be silently blank.
  { key: "is_auto_send", label: "Auto-send", render: (r) => (r.is_auto_send ? "Yes" : "—") },
  { key: "updated_at", label: "Last Updated", render: (r) => stamp(r.updated_at) },
];

export default function SupportScriptsManageTab({ onToast }) {
  return (
    <ManageContentTab
      resourceLabel="Support Script"
      apiPath="/api/admin-panel/support-scripts/"
      fields={FIELDS}
      columns={COLUMNS}
      onToast={onToast}
    />
  );
}
