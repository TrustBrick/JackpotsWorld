import { useLayoutEffect, useRef } from 'react'

/**
 * Start at the top when a tab that is really a different screen is opened.
 *
 * The route-level fix (components/ScrollToTop) cannot help here: the Dashboard
 * and the Back Office keep their active tab in local state, so switching tabs
 * changes no URL and fires no navigation. Without this, opening Wallet from
 * halfway down Overview drops you halfway down Wallet.
 *
 * Only for tabs that swap the whole content area. Do NOT reach for this on
 * filter chips, dropdowns, modals, accordions or anything else that leaves the
 * surrounding page in place — moving the page under someone who just clicked a
 * filter is worse than the problem it solves.
 *
 * Skips the first render. Arriving on the page is the route's business, and
 * ScrollToTop has already handled it; firing here as well would mean two
 * scrolls for one navigation, and would fight a deep link that legitimately
 * wants a position other than the top.
 *
 * `behavior: 'instant'` for the same reason as ScrollToTop: index.css sets
 * `* { scroll-behavior: smooth }`, and 'auto' defers to it, which would
 * animate a long glide up the page on every tab click.
 *
 * @param {unknown} value  the active tab id — scrolls whenever it changes
 */
export function useScrollToTopOnChange(value) {
  const previous = useRef(value)

  useLayoutEffect(() => {
    if (previous.current === value) return
    previous.current = value
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [value])
}

export default useScrollToTopOnChange
