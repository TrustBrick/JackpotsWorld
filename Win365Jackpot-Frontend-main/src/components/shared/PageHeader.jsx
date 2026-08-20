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
 */
export default function PageHeader({ eyebrow, title, subtitle, background = null }) {
  return (
    <div className="relative pt-32 pb-14 px-4 dice-pattern overflow-hidden">
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
      <div className="max-w-5xl mx-auto text-center relative z-10">
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
