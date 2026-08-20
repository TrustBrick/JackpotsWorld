// src/components/support/callTheme.js
//
// VOICE-CALL: the call UI is rendered in two very different shells — the
// public site's permanently-dark gold theme (ChatBot) and the Back Office's
// themeable admin palette (LiveSupportTab, which has a light mode). Rather
// than fork the components, they take a palette and default to the public
// one, so behaviour can never drift between the two ends of the same call.
//
// Values mirror tailwind.config.js's `gold` and `casino` scales exactly; they
// are literals here because these components are also mounted inside the admin
// panel, which styles with inline tokens rather than Tailwind classes.

export const PUBLIC_CALL_THEME = {
  gold: "#D4AF37",
  goldLight: "#F5D060",
  goldDark: "#9A7D20",
  surface: "#1A0015",
  surface2: "#150010",
  border: "#3D1A30",
  text: "#FFFFFF",
  sub: "rgba(255,255,255,0.62)",
  muted: "rgba(255,255,255,0.4)",
  red: "#E0405B",
  green: "#39B87A",
  overlay: "rgba(6,0,4,0.72)",
}

/** Adapts the admin theme's `C` object onto the shape above. */
export function adminCallTheme(C) {
  return {
    gold: C.gold,
    goldLight: C.gold,
    goldDark: C.gold,
    surface: C.surface,
    surface2: C.surface2,
    border: C.border,
    text: C.text,
    sub: C.sub,
    muted: C.muted,
    red: C.red,
    green: C.green,
    overlay: "rgba(0,0,0,0.6)",
  }
}
