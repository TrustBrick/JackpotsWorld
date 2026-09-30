import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Volume2, VolumeX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Fallback clip, bundled in /public, used only when an admin has NOT uploaded
// one via the Manage Promotions tab. Lives at
//   Win365Jackpot-Frontend-main/public/assets/audio/promotions-voiceover.mp3
const STATIC_FALLBACK_SRC = '/assets/audio/promotions-voiceover.mp3'

/**
 * PromotionsVoiceOver — plays a spoken intro when the Promotions page opens.
 *
 * The clip is admin-managed: the Promotions page reads it from the
 * GET /api/promotions/ payload ({ voiceover: { audio, enabled } }) and passes
 * it in as `voiceover`. When no audio has been uploaded yet, it falls back to
 * the bundled static file; when an admin disables it, the component renders
 * nothing.
 *
 * Browsers block audio-WITH-sound from auto-playing until the visitor has
 * interacted with the page (a muted autoplay would defeat the point of a
 * voice-over), so this does two things:
 *   1. Attempts to play on mount. Works for returning visitors who have
 *      already interacted with the origin.
 *   2. If the browser refuses, arms one-time listeners so the clip starts on
 *      the visitor's very first tap / click / key press anywhere on the page.
 *
 * A floating speaker control lets the visitor mute/unmute, and — once the clip
 * has been paused or has ended — replay it. The control is itself a user
 * gesture, so pressing it always succeeds even when step 1 was blocked.
 */
export default function PromotionsVoiceOver({ voiceover }) {
  const { t } = useTranslation()

  // An explicit `enabled: false` from the admin hides the voice-over entirely.
  const enabled = voiceover ? voiceover.enabled !== false : true
  const src = (voiceover && voiceover.audio) || STATIC_FALLBACK_SRC
  const audioRef = useRef(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const startPlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const p = audio.play()
    if (p && typeof p.then === 'function') p.catch(() => {})
  }, [])

  // Autoplay attempt + first-interaction fallback.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    let disposed = false
    const onFirstInteraction = () => {
      if (disposed) return
      startPlayback()
      removeListeners()
    }
    const removeListeners = () => {
      disposed = true
      document.removeEventListener('pointerdown', onFirstInteraction)
      document.removeEventListener('keydown', onFirstInteraction)
      document.removeEventListener('touchstart', onFirstInteraction)
    }
    const armFallback = () => {
      // Passive so we never interfere with scrolling; each fires at most once.
      document.addEventListener('pointerdown', onFirstInteraction, { once: true, passive: true })
      document.addEventListener('keydown', onFirstInteraction, { once: true })
      document.addEventListener('touchstart', onFirstInteraction, { once: true, passive: true })
    }

    const p = audio.play()
    if (p && typeof p.then === 'function') {
      p.catch(() => { if (!disposed) armFallback() })
    }

    return () => {
      removeListeners()
      audio.pause()
    }
  }, [startPlayback])

  // Keep the button icon in sync with what the audio element is actually doing.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const sync = () => {
      setIsPlaying(!audio.paused && !audio.ended)
      setIsMuted(audio.muted)
    }
    audio.addEventListener('play', sync)
    audio.addEventListener('pause', sync)
    audio.addEventListener('ended', sync)
    audio.addEventListener('volumechange', sync)
    return () => {
      audio.removeEventListener('play', sync)
      audio.removeEventListener('pause', sync)
      audio.removeEventListener('ended', sync)
      audio.removeEventListener('volumechange', sync)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused || audio.ended) {
      // Not playing → this tap starts (or replays) it, unmuted.
      audio.muted = false
      if (audio.ended) audio.currentTime = 0
      startPlayback()
    } else {
      // Playing → toggle mute.
      audio.muted = !audio.muted
    }
  }

  const audible = isPlaying && !isMuted
  const label = audible
    ? t('promotions.voiceOver.mute', 'Mute the promotions voice-over')
    : t('promotions.voiceOver.play', 'Play the promotions voice-over')

  // Admin turned the voice-over off — render nothing (and, because there is no
  // <audio> element, the effects above no-op on their null ref).
  if (!enabled) return null

  return (
    <>
      <audio ref={audioRef} src={src} preload="auto" playsInline />

      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed z-40 flex items-center justify-center"
        style={{
          // Bottom LEFT — PageScrollButtons and the live-support launcher own
          // the bottom-right corner, so this stays clear of both.
          bottom: 'clamp(20px, 4vw, 26px)',
          left: 'clamp(20px, 3vw, 26px)',
        }}
      >
        <motion.button
          type="button"
          onClick={toggle}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          aria-label={label}
          title={label}
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 48,
            height: 48,
            color: '#F3D671',
            background: 'rgba(15, 12, 8, 0.72)',
            border: '1px solid rgba(212, 175, 55, 0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            cursor: 'pointer',
            touchAction: 'manipulation',
            boxShadow: '0 0 4px rgba(212,175,55,0.35), 0 0 14px rgba(212,175,55,0.14)',
          }}
        >
          {/* Soft pulse while sound is actually audible, so a muted/idle state
              reads as clearly different from a speaking one. */}
          {audible && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{ border: '1px solid rgba(212,175,55,0.5)' }}
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          {audible ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </motion.button>
      </motion.div>
    </>
  )
}
