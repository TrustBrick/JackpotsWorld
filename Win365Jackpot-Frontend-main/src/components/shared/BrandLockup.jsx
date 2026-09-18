import React from 'react'
import BrandMark from './BrandMark'
import Logo from './Logo'

// ─── The brand lockup: emblem + "Jackpots / World" ──────────────────────────
// The one definition of how the two pieces sit together, so the navbar and the
// footer render the SAME signature rather than two that merely resemble each
// other. They had drifted: the navbar paired a 28px mark with Logo size="sm"
// and an 8px gap, the footer a 46px mark with size="md" and 11px — visibly
// different weights for the same mark on one page.
//
// 40px is the emblem size the rest of the app already uses (Back Office,
// affiliate and member sidebars), and it is also what the wordmark measures:
// "Jackpots" at text-2xl (24px) over "World" at 0.532em plus its margin comes
// to ~41px, so the mark and the text lock to the same cap-height-to-baseline
// block. That is why it costs the navbar no height — the bar was already as
// tall as the wordmark.
export default function BrandLockup({
  markSize = 40,
  logoSize = 'md',
  gap = 10,
  className = '',
  // Merged into the lockup's own style rather than spread through ...rest: a
  // caller passing style={{ marginBottom: 12 }} through the spread replaced
  // the whole style object, silently dropping the gap and butting the emblem
  // against the wordmark.
  style,
  ...rest
}) {
  return (
    <span
      className={`flex items-center ${className}`}
      style={{ gap, ...style }}
      {...rest}
    >
      <BrandMark size={markSize} />
      <Logo size={logoSize} />
    </span>
  )
}
