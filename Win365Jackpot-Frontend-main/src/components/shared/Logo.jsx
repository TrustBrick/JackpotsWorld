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
    world: 'text-sm md:text-lg',
  },
  md: {
    jackpots: 'text-xl md:text-2xl',
    world: 'text-base md:text-lg',
  },
}

export default function Logo({ size = 'md', className = '' }) {
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.md

  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <span className={`leading-[1.15] ${cfg.jackpots} gold-text font-black tracking-wider`}>Jackpots</span>
      <span
        className={`leading-[1.15] font-body font-bold uppercase inline-block ${cfg.world}`}
        style={{ color: '#FFFFFF' }}
      >
        World
      </span>
    </div>
  )
}
