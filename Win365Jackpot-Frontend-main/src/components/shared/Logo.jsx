import React from 'react'

// ─── Logo wordmark ──────────────────────────────────────────────────────────
// Single shared "Jackpots" / "World" text lockup used by every logo instance
// in the app (Navbar, Footer, Admin/Affiliate/User sidebars, Register modal).
// "World" is stretched horizontally with a CSS transform instead of
// letter-spacing so the letters stay naturally connected as one word while
// still visually filling roughly the same width as "Jackpots" above it.
// Jackpots grows at the md breakpoint (text-lg/xl -> text-2xl); World's font
// size stays fixed, so its stretch factor is tuned per breakpoint too, so the
// stretched word tracks ~87% of Jackpots' width at every screen size.
const SIZE_CONFIG = {
  sm: {
    jackpots: 'text-lg md:text-2xl',
    worldScale: '[transform:scaleX(1.85)] md:[transform:scaleX(2.45)]',
  },
  md: {
    jackpots: 'text-xl md:text-2xl',
    worldScale: '[transform:scaleX(2.05)] md:[transform:scaleX(2.45)]',
  },
}

export default function Logo({ size = 'md', className = '' }) {
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.md

  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <span className={`font-bold ${cfg.jackpots} gold-text font-black tracking-wider`}>Jackpots</span>
      <span
        className={`font-body text-xs uppercase inline-block [transform-origin:left_center] ${cfg.worldScale}`}
        style={{ color: '#FFFFFF' }}
      >
        World
      </span>
    </div>
  )
}
