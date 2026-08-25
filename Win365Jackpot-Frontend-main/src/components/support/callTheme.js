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

/** Drops the alpha channel from an `rgba(...)` colour, leaving `rgb(...)`.
 *
 * The admin palette's opaque-ish tokens are still fractionally translucent
 * (`panelBg` is 0.97 in dark mode), which is fine for a panel sitting on the
 * app background and not fine for a card floating over a dashboard: whatever
 * is behind it keeps showing through, faintly, right under the caller's name.
 * A call surface is the one thing on screen that must be read at a glance.
 */
function opaque(color) {
  const m = /^rgba?\(([^)]+)\)$/.exec((color || "").trim())
  if (!m) return color            // hex or named — already opaque
  const [r, g, b] = m[1].split(",").map(v => v.trim())
  return `rgb(${r}, ${g}, ${b})`
}

/** Adapts the admin theme's `C` object onto the shape above.
 *
 * `surface` maps to the admin palette's **panelBg**, not its `surface`. That
 * token is `rgba(255,255,255,0.03)` in dark mode — 3% white, which reads as a
 * solid card only because everything that uses it sits on an opaque panel.
 * The call surfaces are fixed-position overlays floating over whatever tab is
 * open, so painting them with it made the whole dashboard show through the
 * card: wallet balances legible straight across the caller's name. `panelBg`
 * is the palette's opaque backdrop (both modes define one) and is what a
 * surface that floats over arbitrary content has to use.
 */
export function adminCallTheme(C) {
  return {
    gold: C.gold,
    goldLight: C.gold,
    goldDark: C.gold,
    surface: opaque(C.panelBg || C.bg),
    surface2: C.surface2,
    border: C.border,
    text: C.text,
    sub: C.sub,
    muted: C.muted,
    red: C.red,
    green: C.green,
    // Darker than the panel's own scrims: a ringing call is the one thing on
    // screen that should be answered, and the dimming is what separates an
    // opaque card from the busy dashboard behind it.
    overlay: "rgba(0,0,0,0.72)",
  }
}
