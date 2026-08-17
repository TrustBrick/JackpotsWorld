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
 */
export default function HighlightedText({ text, as: Tag = 'span', goldClassName = 'text-gold font-semibold' }) {
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
