import React from 'react'

/**
 * Renders a heading string as the site's heading standard: the page's text
 * colour with the LAST word in the gold gradient -- "Beyond the **Casino**".
 * See .section-heading in index.css.
 *
 * For titles that arrive as plain strings (translations, Back Office copy),
 * where the gold span can't be written into the markup by hand. A one-word
 * title is all gold, which is the same rule applied to one word. Anything
 * that isn't a string (already marked-up JSX) is returned untouched.
 */
export default function GoldLastWord({ text }) {
  if (typeof text !== 'string') return text ?? null
  const trimmed = text.trim()
  const cut = trimmed.lastIndexOf(' ')
  if (cut === -1) return <span className="gold-text">{trimmed}</span>
  return (
    <>
      {trimmed.slice(0, cut)}{' '}
      <span className="gold-text">{trimmed.slice(cut + 1)}</span>
    </>
  )
}
