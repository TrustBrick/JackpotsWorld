import React from 'react'

// ─── Brand mark (the circular Jackpots World emblem) ────────────────────────
// The single place the emblem image is referenced. Pairs with Logo.jsx, which
// is the "Jackpots / World" *text* lockup — most headers show both.
//
// Why this component exists: every instance used to point straight at
// /assets/images/jackpotsworld_watermark.png, which is a *fully opaque* RGB image —
// the emblem baked onto a solid black square with no alpha channel at all.
// `object-fit: contain` cannot help there, so the mark rendered as a black
// box on every surface. The asset below is the same artwork re-cut with a
// real alpha channel (see public/assets/images/jackpotsworld-logo.png).
//
// The 256px copy is the default because the full-resolution original is a
// ~2.9 MB 1254px image that was being downloaded to paint a 28x28 navbar
// icon. Pass `full` only where the art is genuinely displayed large (the
// landing-page watermark).

export const BRAND_MARK_SRC = '/assets/images/jackpotsworld-logo-256.png'
export const BRAND_MARK_SRC_FULL = '/assets/images/jackpotsworld-logo.png'

export default function BrandMark({
  size = 40,
  full = false,
  alt = 'Jackpots World',
  className = '',
  style,
  ...rest
}) {
  return (
    <img
      src={full ? BRAND_MARK_SRC_FULL : BRAND_MARK_SRC}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
      style={{
        width: size,
        height: size,
        // Guarantees the transparent PNG is never letterboxed or squashed,
        // whatever container it lands in.
        objectFit: 'contain',
        // These four are the ones that produced the visible square. They are
        // set explicitly (not just omitted) so a parent's cascading styles
        // can't reintroduce the box.
        background: 'transparent',
        border: 'none',
        padding: 0,
        borderRadius: 0,
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    />
  )
}
