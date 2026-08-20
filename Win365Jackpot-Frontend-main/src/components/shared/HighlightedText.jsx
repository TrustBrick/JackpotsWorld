import React from 'react'

/**
 * HighlightedText — renders a string with `**phrase**` segments in gold,
 * everything else in the surrounding (bright, not muted) color.
 *
 * The marker lives inside the translated string itself (i18n keys like
 * teenPatti.subtitle), not in JSX, so which word carries the emphasis is a
 * per-locale editorial choice rather than a hardcoded "3rd word in English"
 * assumption that would silently misalign once translated — word order
 * differs across the 24 locales this app ships.
 *
 * The emphasis is `.gold-emphasis` (index.css): gold gradient, slow sheen,
 * faint glow, and no motion at all under prefers-reduced-motion. Applying it
 * here rather than at each call site means every marked phrase across the app
 * gets the same treatment, and changing that treatment is one edit — callers
 * can still override with `goldClassName` where a specific context needs
 * something quieter.
 */
export default function HighlightedText({ text, as: Tag = 'span', goldClassName = 'gold-emphasis' }) {
  if (!text) return null
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <Tag>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <span key={i} className={goldClassName}>{part}</span>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </Tag>
  )
}
