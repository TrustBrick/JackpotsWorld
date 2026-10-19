import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Star, X, ThumbsUp, ThumbsDown } from 'lucide-react'

import FeedbackForm from './FeedbackForm'
import {
  REQUEST_EVENT, markFeedbackSent, markPromptDismissed, markPromptShown,
  openFeedback, promptAllowedOnPath, promptReadyToShow, sendFeedback,
} from '../../services/feedbackPrompt'
import { T } from '../../i18n/useSiteText'

/**
 * VISITOR-FEEDBACK: everything feedback-related on a public page, anchored to
 * the bottom-left corner (the chat assistant and WhatsApp own the right).
 *
 *   • A small round button — dark glass, thin gold ring, gold star — that
 *     appears once the visitor scrolls past the hero and opens the full form.
 *   • The prompt card, which slides up from the same corner right after the
 *     visitor finishes something (services/feedbackPrompt decides when).
 *     One tap answers it; the comment is optional.
 */

const GOLD = '#D4AF37'
const GOLD_LIGHT = '#F3D671'
const CHECK_EVERY_MS = 500
const CLEAR_FOR_MS = 1500   // how long the screen must be free before the prompt appears
const THANKS_FOR_MS = 2600

const QUESTIONS = {
  experience_enquiry: T('How easy was it to send your enquiry?'),
  whatsapp_enquiry:   T('How was your experience with us so far?'),
  registration:       T('How smooth was registration?'),
  signup:             T('How was signing up?'),
  page_helpful:       T('Was this page helpful?'),
}
const RATING_WORDS = ['', T('Poor'), T('Fair'), T('Good'), T('Very good'), T('Excellent')]

function commentHint(trigger, rating) {
  if (trigger === 'page_helpful') {
    return rating >= 4 ? T('Anything we could add? (optional)') : T('What were you looking for? (optional)')
  }
  return rating >= 4 ? T('What did you like most? (optional)') : T('What could we do better? (optional)')
}

const glass = {
  background: 'rgba(14, 10, 18, 0.82)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

export default function FeedbackWidget() {
  const [launcherVisible, setLauncherVisible] = useState(false)
  const [launcherLifted, setLauncherLifted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [prompt, setPrompt] = useState(null)   // { trigger, stage, rating, message }
  const clearSince = useRef(null)
  const promptRef = useRef(null)
  promptRef.current = prompt

  // One cheap loop drives both the launcher and the prompt: scroll position,
  // the cookie banner, the voice-over button, and whether a queued prompt
  // may show yet.
  useEffect(() => {
    const tick = () => {
      const pastHero = window.scrollY > Math.min(window.innerHeight * 0.6, 520)
      const cookieBanner = !!document.querySelector('[data-feedback-blocker="cookie"]')
      setLauncherVisible(pastHero && !cookieBanner && promptAllowedOnPath())
      // The Promotions voice-over button also lives bottom-left.
      setLauncherLifted(!!document.querySelector('[data-voiceover-toggle]'))

      if (promptRef.current) return
      const ready = promptReadyToShow()
      if (!ready) { clearSince.current = null; return }
      if (clearSince.current == null) { clearSince.current = Date.now(); return }
      if (Date.now() - clearSince.current < CLEAR_FOR_MS) return
      clearSince.current = null
      markPromptShown()
      setPrompt({ trigger: ready.trigger, stage: 'ask', rating: 0, message: '' })
    }
    tick()
    const interval = setInterval(tick, CHECK_EVERY_MS)
    const onRequest = () => { clearSince.current = null }
    window.addEventListener(REQUEST_EVENT, onRequest)
    return () => { clearInterval(interval); window.removeEventListener(REQUEST_EVENT, onRequest) }
  }, [])

  const submit = async (p = promptRef.current) => {
    if (!p || !p.rating) return
    setPrompt({ ...p, stage: 'thanks' })
    markFeedbackSent()
    await sendFeedback({ rating: p.rating, category: 'other', trigger: p.trigger, message: p.message })
    setTimeout(() => setPrompt(cur => (cur && cur.stage === 'thanks' ? null : cur)), THANKS_FOR_MS)
  }

  const dismiss = () => {
    const p = promptRef.current
    if (!p) return
    if (p.stage === 'comment' && p.rating) { submit(p); return }  // a rating was given: keep it
    if (p.stage === 'ask') markPromptDismissed()
    setPrompt(null)
  }

  useEffect(() => {
    if (!prompt) return undefined
    const onKey = e => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prompt])

  const choose = rating => setPrompt(p => ({ ...p, rating, stage: 'comment' }))

  const bottomBase = 'max(20px, env(safe-area-inset-bottom))'
  const launcherBottom = launcherLifted ? 'calc(max(20px, env(safe-area-inset-bottom)) + 62px)' : bottomBase
  const left = 'clamp(16px, 3vw, 26px)'

  return (
    <>
      {/* ── Round launcher ─────────────────────────────────────────── */}
      <AnimatePresence>
        {launcherVisible && !prompt && (
          <motion.div
            key="fb-launcher"
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'fixed', left, bottom: launcherBottom, zIndex: 40, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <motion.button
              type="button"
              onClick={openFeedback}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onFocus={() => setHovered(true)}
              onBlur={() => setHovered(false)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              aria-label={T('Share feedback')}
              style={{
                ...glass,
                width: 48, height: 48, borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1.5px solid rgba(212, 175, 55, 0.7)',
                boxShadow: '0 0 0 4px rgba(212, 175, 55, 0.08), 0 8px 24px rgba(0, 0, 0, 0.45), inset 0 0 12px rgba(212, 175, 55, 0.12)',
                touchAction: 'manipulation',
              }}
            >
              <Star size={20} color={GOLD_LIGHT} fill="rgba(243, 214, 113, 0.18)" strokeWidth={1.7} aria-hidden="true" />
            </motion.button>
            <AnimatePresence>
              {hovered && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    ...glass, pointerEvents: 'none', whiteSpace: 'nowrap',
                    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    color: GOLD_LIGHT, border: '1px solid rgba(212, 175, 55, 0.35)',
                  }}
                >
                  {T('Share feedback')}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Activity prompt ────────────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {prompt && (
            <motion.div
              key="fb-prompt"
              role="dialog"
              aria-labelledby="jw-fb-prompt-title"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                ...glass,
                position: 'fixed', left, bottom: bottomBase, zIndex: 60,
                width: 'min(340px, calc(100vw - 32px))', boxSizing: 'border-box',
                padding: '16px 16px 14px', borderRadius: 16,
                border: '1px solid rgba(212, 175, 55, 0.45)',
                boxShadow: '0 18px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(243, 214, 113, 0.12)',
                color: '#F5F0E6',  // always on dark glass, whatever the site theme
              }}
            >
              <button
                type="button" onClick={dismiss} aria-label={T('Close')}
                style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', padding: 4, lineHeight: 0 }}
              >
                <X size={16} />
              </button>

              {prompt.stage === 'thanks' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 22px 2px 0' }}>
                  <Star size={22} color={GOLD} fill={GOLD} />
                  <div id="jw-fb-prompt-title" style={{ fontSize: 14, fontWeight: 700 }}>
                    {T('Thank you for your feedback!')}
                  </div>
                </div>
              ) : (
                <>
                  <div id="jw-fb-prompt-title" style={{ fontSize: 14.5, fontWeight: 700, paddingRight: 24, lineHeight: 1.35 }}>
                    {QUESTIONS[prompt.trigger] || QUESTIONS.whatsapp_enquiry}
                  </div>

                  {prompt.trigger === 'page_helpful' ? (
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      {[{ rating: 5, Icon: ThumbsUp, label: T('Yes') }, { rating: 1, Icon: ThumbsDown, label: T('No') }].map(({ rating, Icon, label }) => {
                        const active = prompt.rating === rating
                        return (
                          <button
                            key={rating} type="button" onClick={() => choose(rating)} aria-pressed={active}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              padding: '9px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              border: `1px solid ${active ? GOLD : 'rgba(212, 175, 55, 0.3)'}`,
                              background: active ? 'rgba(212, 175, 55, 0.16)' : 'transparent',
                              color: active ? GOLD_LIGHT : '#F5F0E6',
                            }}
                          >
                            <Icon size={16} /> {label}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div role="radiogroup" aria-labelledby="jw-fb-prompt-title" style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 10 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n} type="button" role="radio" aria-checked={prompt.rating === n}
                          aria-label={`${n} – ${RATING_WORDS[n]}`} onClick={() => choose(n)}
                          style={{ background: 'none', border: 'none', padding: 3, cursor: 'pointer', lineHeight: 0 }}
                        >
                          <Star size={28} color={GOLD} strokeWidth={1.5} fill={n <= prompt.rating ? GOLD : 'transparent'} />
                        </button>
                      ))}
                      {prompt.rating > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 600, color: GOLD_LIGHT }}>
                          {RATING_WORDS[prompt.rating]}
                        </span>
                      )}
                    </div>
                  )}

                  {prompt.stage === 'comment' ? (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'hidden' }}>
                      <textarea
                        autoFocus rows={3} maxLength={2000}
                        value={prompt.message}
                        onChange={e => setPrompt(p => ({ ...p, message: e.target.value }))}
                        placeholder={commentHint(prompt.trigger, prompt.rating)}
                        aria-label={commentHint(prompt.trigger, prompt.rating)}
                        style={{
                          width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '9px 11px',
                          borderRadius: 10, resize: 'none', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                          background: 'rgba(255, 255, 255, 0.05)', color: '#F5F0E6',
                          border: '1px solid rgba(212, 175, 55, 0.28)',
                        }}
                      />
                      <button
                        type="button" onClick={() => submit()}
                        style={{
                          width: '100%', marginTop: 10, padding: '10px 14px', borderRadius: 10, border: 'none',
                          cursor: 'pointer', fontWeight: 800, fontSize: 13.5, color: '#1a1406',
                          background: `linear-gradient(90deg, ${GOLD_LIGHT}, ${GOLD} 55%, #b8912a)`,
                        }}
                      >
                        {T('Send feedback')}
                      </button>
                    </motion.div>
                  ) : (
                    <button
                      type="button" onClick={dismiss}
                      style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.55)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      {T('Not now')}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <FeedbackForm />
    </>
  )
}
