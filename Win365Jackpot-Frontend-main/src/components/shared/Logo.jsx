import React from 'react'

// ─── Logo wordmark ──────────────────────────────────────────────────────────
// Single shared "Jackpots" / "World" text lockup used by every logo instance
// in the app (Navbar, Footer, Admin/Affiliate/User sidebars, Register modal).
// "World" uses the same font family as Jackpots at a bold weight and a size
// close to Jackpots' own — width balance comes from real weight/size, not
// from a scaleX stretch or extra letter-spacing (both distort the glyphs).
const SIZE_CONFIG = {
  sm: {
    jackpots: 'text-lg md:text-2xl',
    world: 'text-base md:text-xl',
  },
  md: {
    jackpots: 'text-xl md:text-2xl',
    world: 'text-lg md:text-xl',
  },
}

export default function Logo({ size = 'md', className = '' }) {
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.md

  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <span className={`font-bold ${cfg.jackpots} gold-text font-black tracking-wider`}>Jackpots</span>
      <span
        className={`font-body font-black uppercase inline-block ${cfg.world}`}
        style={{ color: '#FFFFFF' }}
      >
        World
      </span>
    </div>
  )
}
