// src/hooks/useActiveSection.js
import { useEffect, useState } from 'react'
import { getNavOffset, getSectionElement } from '../utils/scroll'

/**
 * Returns the id of the section currently at the top of the viewport, so the
 * navbar can highlight the matching entry. Replaces react-scroll's `spy`,
 * which we can no longer use now that navigation goes through
 * utils/scroll.js instead of react-scroll's <Link>.
 *
 * `ids` may be listed in any order — they're sorted by their real position on
 * every pass, because the nav order doesn't match document order (Contacts is
 * the footer, so it renders last but sits mid-list in the navbar).
 *
 * @param {string[]} ids      section ids to track
 * @param {boolean}  enabled  false on routes that have no sections (e.g. /poker)
 */
export default function useActiveSection(ids, { enabled = true } = {}) {
  const [activeId, setActiveId] = useState(null)

  // Depend on the joined string: `ids` is usually a fresh array each render,
  // which would otherwise re-run this effect on every render.
  const key = ids.join('|')

  useEffect(() => {
    if (!enabled || !ids.length) {
      setActiveId(null)
      return undefined
    }

    let frame = null

    const compute = () => {
      frame = null

      // The y-coordinate we treat as "the top of the readable page".
      const line = getNavOffset() + 8

      const positioned = ids
        .map(id => {
          const el = getSectionElement(id)
          return el ? { id, rect: el.getBoundingClientRect() } : null
        })
        .filter(Boolean)
        .sort((a, b) => a.rect.top - b.rect.top)

      if (!positioned.length) {
        setActiveId(null)
        return
      }

      // The section straddling the line wins.
      let current = positioned.find(s => s.rect.top <= line && s.rect.bottom > line)?.id

      // Nothing straddles it (a gap between sections, or we're above the
      // first one): fall back to the last section that starts above the line.
      if (!current) {
        const above = positioned.filter(s => s.rect.top <= line)
        current = above.length ? above[above.length - 1].id : null
      }

      // At the very bottom the final section can be too short to reach the
      // line, which would otherwise leave the last nav entry unreachable.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (atBottom) current = positioned[positioned.length - 1].id

      setActiveId(current)
    }

    // Coalesce scroll events into one measurement per frame.
    const onScroll = () => {
      if (frame == null) frame = requestAnimationFrame(compute)
    }

    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame != null) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  return activeId
}
