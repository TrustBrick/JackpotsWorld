import React, { useState } from 'react'
import { ImageOff } from 'lucide-react'

// Taller than this (height / width) counts as a portrait poster. Casino
// photos are landscape; the flyers casinos send out are ~9:16.
const POSTER_RATIO = 1.15

/**
 * PromotionBanner — the image block at the top of a promotion card and the
 * promotion details page.
 *
 * Landscape images keep the original treatment: a fixed-height strip,
 * object-cover, a dark bottom fade and the casino caption laid over it.
 *
 * Portrait posters (a casino's promo flyer) carry their own headline, price
 * and terms, so cropping them into a strip keeps only a meaningless slice of
 * the middle. They are shown whole instead (object-contain) in a taller
 * frame, with a blurred copy of the same image filling the side bands, and
 * the caption is moved below the frame so it doesn't sit on the artwork.
 */
export default function PromotionBanner({ src, alt, stripClass, posterClass, caption, iconSize = 22 }) {
  const [failed, setFailed] = useState(false)
  const [isPoster, setIsPoster] = useState(false)

  const onLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    if (w && h / w > POSTER_RATIO) setIsPoster(true)
  }

  if (!src || failed) {
    return (
      <div className={`relative overflow-hidden ${stripClass}`}>
        <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}>
          <ImageOff size={iconSize} className="text-gold/30" />
        </div>
        {caption && <div className="absolute bottom-3 left-4">{caption}</div>}
      </div>
    )
  }

  if (isPoster) {
    return (
      <>
        <div className={`relative overflow-hidden ${posterClass}`}>
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
          />
          <div className="absolute inset-0" style={{ background: 'rgba(10,0,5,0.35)' }} />
          <img
            src={src}
            alt={alt}
            className="relative w-full h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            onError={() => setFailed(true)}
          />
        </div>
        {caption && (
          <div className="px-5 pt-4 -mb-2" style={{ borderTop: '1px solid rgba(212,175,55,0.18)' }}>
            {caption}
          </div>
        )}
      </>
    )
  }

  return (
    <div className={`relative overflow-hidden ${stripClass}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        loading="lazy"
        onLoad={onLoad}
        onError={() => setFailed(true)}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(10,0,5,0.92) 100%)' }}
      />
      {caption && <div className="absolute bottom-3 left-4">{caption}</div>}
    </div>
  )
}
