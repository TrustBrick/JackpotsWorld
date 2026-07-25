import React from 'react'

// ─── Logo wordmark ──────────────────────────────────────────────────────────
// Single shared "Jackpots" / "World" text lockup used by every logo instance
// in the app (Navbar, Footer, Admin/Affiliate/User sidebars, Register modal).
//
// Values below were measured directly (pixel bounding boxes, not estimated)
// from the reference logo image, then reverse-engineered against the real
// Manrope font metrics via canvas measureText():
//   width ratio  (World / Jackpots) = 0.606
//   height ratio (World / Jackpots) = 0.417
//   gap ratio    (gap / Jackpots height) = 0.375
//   left edge: aligned (0 offset)
// Base font-size lives on the wrapper so "World" can be sized as a true
// em-fraction of "Jackpots" — this keeps the ratio exact at every breakpoint.
const SIZE_CONFIG = {
  sm: 'text-lg md:text-2xl',
  md: 'text-xl md:text-2xl',
}

const WORLD_SIZE_EM = 0.532
const WORLD_LETTER_SPACING_EM = 0.293
// Tighter vertical gap between "Jackpots" and "World" than the original
// 0.375-of-Jackpots-height measurement — kept small but still a visible
// breathing gap (not touching).
const WORLD_MARGIN_TOP_EM = 0.16 / WORLD_SIZE_EM

export default function Logo({ size = 'md', className = '' }) {
  const baseSize = SIZE_CONFIG[size] || SIZE_CONFIG.md

  return (
    <div className={`flex flex-col leading-none ${baseSize} ${className}`}>
      <span className="gold-text font-black tracking-wider leading-none" style={{ fontSize: '1em' }}>Jackpots</span>
      <span
        className="font-body font-bold uppercase inline-block leading-none"
        style={{
          color: '#FFFFFF',
          fontSize: `${WORLD_SIZE_EM}em`,
          letterSpacing: `${WORLD_LETTER_SPACING_EM}em`,
          marginTop: `${WORLD_MARGIN_TOP_EM}em`,
        }}
      >
        World
      </span>
    </div>
  )
}
