import React, { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'w365-theme'
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} })

function getInitialTheme() {
  // The public site's toggle has been removed (theme now lives in the Back
  // Office only) — always dark, regardless of a stale saved preference or
  // the OS's prefers-color-scheme, since there's no longer any UI to
  // switch it back if either of those resolved to 'light'.
  return 'dark'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE_KEY, theme)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  // Mount-time safety net (theme is already applied synchronously below on
  // every change, but this covers the very first render).
  useEffect(() => {
    applyTheme(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mutate the DOM *synchronously* — not in a useEffect — so that when this
  // state change causes theme-keyed components further down the tree to
  // remount, `data-theme` on <html> already reflects the new value. If we
  // waited for a useEffect (which fires after render/commit), Framer Motion
  // components mounting during that remount would still see the *old*
  // data-theme and permanently bake the wrong color into their internal
  // MotionValues, since they resolve CSS custom properties once at mount
  // and don't re-read them on their own.
  const toggleTheme = () => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    return next
  })

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
