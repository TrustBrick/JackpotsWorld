import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/* ─────────────────────────────────────────────────────────────────────────
   ScrollToTop — start a newly opened route at the top.

   ── The root cause it fixes ──────────────────────────────────────────────
   This is a single-page app. A route change swaps the component tree but the
   document is never reloaded, so `window.scrollY` is simply whatever the last
   page left it at. React Router does not reset it (by design — it cannot know
   whether a navigation is a new screen or a step within one). Nothing else in
   the app touched it either: RouteSeo and AnalyticsTracker both read
   useLocation() but neither scrolls. So opening Poker from halfway down Teen
   Patti dropped the visitor halfway down Poker.

   Renders nothing. Mounted once, inside BrowserRouter, above <Routes> so it
   sees every route including the lazy ones.

   ── Three things this deliberately does NOT do ───────────────────────────

   1. behavior: 'instant', not 'auto'.
      index.css sets `* { scroll-behavior: smooth }`. Per spec a programmatic
      scroll with 'auto' defers to that CSS property, so 'auto' here would
      animate the page from wherever it was up to the top — a long visible
      glide on every navigation, which is the opposite of the intent. 'instant'
      is the value that overrides the CSS and lands immediately.

   2. Nothing on POP.
      Back/forward is not "a new page". The browser's own scroll restoration
      (history.scrollRestoration, left at its 'auto' default) puts the visitor
      back where they were, which is what they expect from a back button.
      Forcing the top there would break it. Only PUSH and REPLACE reset.

   3. Nothing when the URL carries a hash.
      A hash is an explicit request for a position other than the top.

   ── Why it cannot fight the navbar ───────────────────────────────────────
   Navbar's cross-page section links navigate('/') and then call
   scrollToSectionWhenReady(), which starts at +60ms and retries while the
   section mounts. This runs in useLayoutEffect, synchronously on the location
   change and before paint, so it has always finished first and the section
   scroll lands after it. Within the homepage there is no navigation at all —
   the navbar scrolls directly — so this never runs for those.
   ───────────────────────────────────────────────────────────────────────── */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()

  // useLayoutEffect, not useEffect: this runs after the DOM is updated but
  // before the browser paints, so the new route is never shown at the old
  // scroll offset for a frame first.
  useLayoutEffect(() => {
    if (navigationType === 'POP') return
    if (hash) return

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    // `pathname` only. Deliberately not `search`: query strings here carry
    // filters and tab ids (the Back Office uses ?tab=), and resetting the
    // page every time someone changes a filter would yank it out from under
    // them mid-interaction.
  }, [pathname, hash, navigationType])

  return null
}
