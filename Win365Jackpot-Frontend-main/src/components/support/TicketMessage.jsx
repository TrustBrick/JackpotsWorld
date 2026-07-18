// MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
//
// Shared "primary text + optional secondary translation" block, reused by
// both SupportTab (customer: reply shown in their language, English as a
// small secondary line) and the admin SupportTicketsTab (Back Office:
// English shown primary, original-language text as the secondary line).
// This is the piece named "ChatTranslator" in the feature spec.
import React from "react";

// `secondaryLabel` is the complete label text — callers compose it
// themselves (e.g. "Original · Telugu" for the back office, plain
// "English" for the customer view) since what belongs after the label
// differs per caller rather than always being "this text's language".
export default function TicketMessage({ primaryText, secondaryLabel, secondaryText, C }) {
  const border = C?.border || "rgba(255,255,255,0.1)";
  return (
    <div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {primaryText}
      </div>
      {secondaryText && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${border}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
            {secondaryLabel}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {secondaryText}
          </div>
        </div>
      )}
    </div>
  );
}
