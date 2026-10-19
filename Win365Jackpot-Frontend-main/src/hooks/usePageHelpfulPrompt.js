import { useEffect } from 'react'
import { requestFeedback } from '../services/feedbackPrompt'

// VISITOR-FEEDBACK: ask "Was this page helpful?" on an information page once
// the visitor has genuinely read it — at least a minute of visible time on the
// page and most of it scrolled. Whether the prompt then appears is still up to
// services/feedbackPrompt (one per visit, 14-day snooze, nothing open, ...).

const READ_FOR_MS = 60 * 1000
const SCROLLED_AT_LEAST = 0.7
const TICK_MS = 1000

export default function usePageHelpfulPrompt() {
  useEffect(() => {
    let visibleMs = 0
    let deepest = 0
    let done = false

    const measureScroll = () => {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      const ratio = scrollable <= 0 ? 1 : (window.scrollY + window.innerHeight) / doc.scrollHeight
      deepest = Math.max(deepest, ratio)
    }

    const interval = setInterval(() => {
      if (done) return
      if (!document.hidden) visibleMs += TICK_MS
      if (visibleMs >= READ_FOR_MS && deepest >= SCROLLED_AT_LEAST) {
        done = true
        requestFeedback('page_helpful')
      }
    }, TICK_MS)

    measureScroll()
    window.addEventListener('scroll', measureScroll, { passive: true })
    return () => { clearInterval(interval); window.removeEventListener('scroll', measureScroll) }
  }, [])
}
