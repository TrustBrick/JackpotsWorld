import React from 'react'
import { motion } from 'framer-motion'

/**
 * PageHeader
 * Lightweight hero banner used at the top of new inner pages (Events,
 * Promotions, Affiliates, Poker). Reuses the same gold-text / dice-pattern /
 * section-divider utility classes already defined in index.css so it sits
 * visually in line with the rest of the site without introducing new tokens.
 */
export default function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="relative pt-32 pb-14 px-4 dice-pattern overflow-hidden">
      <div className="max-w-5xl mx-auto text-center relative z-10">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-body text-xs md:text-sm tracking-[0.35em] uppercase text-gold/70 mb-3"
          >
            {eyebrow}
          </motion.p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="gold-text font-black text-3xl md:text-5xl tracking-wide mb-4"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/60 font-body text-sm md:text-base max-w-2xl mx-auto"
          >
            {subtitle}
          </motion.p>
        )}
        <div className="section-divider max-w-xs mx-auto mt-8" />
      </div>
    </div>
  )
}
