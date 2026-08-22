import React from 'react'
import { motion } from 'framer-motion'
import HighlightedText from './HighlightedText'

/**
 * PageHeader
 * Lightweight hero banner used at the top of new inner pages (Events,
 * Promotions, Affiliates, Poker). Reuses the same gold-text / dice-pattern /
 * section-divider utility classes already defined in index.css so it sits
 * visually in line with the rest of the site without introducing new tokens.
 *
 * `background` is an optional node rendered *behind* the copy — Poker uses it
 * for its cinematic watermark. It is opt-in precisely so the pages that do not
 * pass one (Events, Promotions, Affiliates) render exactly as they always
 * have: no wrapper, no extra layer, nothing to regress. The scrim below only
 * appears alongside it, since there is nothing to darken without it.
 *
 * ── Why the band takes a min-height when it has a background ───────────────
 * Without one, this band's height is whatever its text needs: pt-32 (128px)
 * plus the copy plus pb-14 (56px). That is the right rule for a text header
 * and the wrong rule for a box something has to be *drawn into*, because the
 * height then never changes while the width does. Measured on the Poker page,
 * the band was 1494x361 on a desktop viewport — a 4.14:1 slot. A background
 * must fill its box, so `object-fit: cover` scaled the 16:9 clip to 1494x841
 * and clipped 480px away: 57% of the frame gone, 240px off the top and 240px
 * off the bottom. Nothing was stretched (cover preserves the aspect ratio by
 * definition) but well over half the picture was never on screen.
 *
 * So the band now takes a floor derived from the footage's own intrinsic
 * ratio, which is what `backgroundRatio` carries. Two bounds keep it sane:
 * TARGET_VISIBLE_FRAME sets how much of the frame should survive the crop,
 * and MAX_BAND_VH stops a squarish clip turning a page header into a
 * full-screen takeover. It is a *min*-height, so the copy can always push the
 * band taller and can never be clipped by it.
 *
 * Below roughly 900px wide the ratio-derived floor lands under what the copy
 * needs, so the copy wins and narrow viewports render exactly as before. The
 * crop that remains there is the opposite problem — the band is taller than a
 * 16:9 clip wants, so the sides go instead — and it cannot be fixed by
 * shrinking the band without clipping the text.
 *
 * Both bounds only ever apply alongside a background. Pass no background and
 * this is the same content-sized band it has always been.
 */

// How much of the background's frame should survive the crop. Some crop is
// inherent to a full-bleed background; this bounds it. 0.72 leaves roughly
// three-quarters of a 16:9 clip on screen instead of 43%.
const TARGET_VISIBLE_FRAME = 0.72
// The ceiling, so the band stays a header. Binds on short viewports and on
// clips squarer than about 2.4:1.
const MAX_BAND_VH = 60

export default function PageHeader({ eyebrow, title, subtitle, background = null, backgroundRatio = null }) {
  // Only shape the band when there is something in it to shape it around, and
  // only once that thing has reported a usable ratio.
  const bandStyle = background && backgroundRatio > 0
    ? {
        minHeight: `min(calc(100vw / ${(backgroundRatio / TARGET_VISIBLE_FRAME).toFixed(4)}), ${MAX_BAND_VH}vh)`,
        // The floor can leave more room than the copy fills, and the copy
        // would otherwise sit under pt-32 with the surplus dumped beneath it.
        // Centring puts the surplus on both sides of the copy instead. The
        // background and scrim are absolutely positioned, so they are out of
        // flow and unaffected.
        //
        // This centres within the content box, so the band's own asymmetric
        // padding (pt-32 against pb-14, the top being navbar clearance) still
        // shows: at a 540px band the copy sits about 36px below the exact
        // centre. That is deliberate — equalising the padding would push every
        // narrow-viewport Poker header 72px taller for a difference that reads
        // as optical centring anyway.
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }
    : undefined

  return (
    <div className="relative pt-32 pb-14 px-4 dice-pattern overflow-hidden" style={bandStyle}>
      {background}
      {background && (
        // Keeps the title/subtitle contrast identical to a video-less header
        // no matter how bright the footage behind it happens to be.
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(10,0,5,0.35) 0%, rgba(10,0,5,0.72) 100%)',
          }}
          aria-hidden="true"
        />
      )}
      <div className="w-full max-w-5xl mx-auto text-center relative z-10">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-body text-xs md:text-sm tracking-[0.35em] uppercase text-gold/70 mb-3"
          >
            <HighlightedText text={eyebrow} />
          </motion.p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="gold-text font-black text-3xl md:text-5xl tracking-wide mb-4"
          style={{ fontFamily: "'Manrope', sans-serif" }}
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-theme-muted font-body text-sm md:text-base max-w-2xl mx-auto"
          >
            {/* Through HighlightedText, not raw: these strings may carry
                **phrase** emphasis markers (poker.subtitle does), and printing
                them literally is what a plain render does. A string without
                markers comes out byte-identical, so the pages that have none
                are unaffected. */}
            <HighlightedText text={subtitle} />
          </motion.p>
        )}
        <div className="section-divider max-w-xs mx-auto mt-8" />
      </div>
    </div>
  )
}
