import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Globe, ChevronDown, X } from 'lucide-react'
import {
  LOCATIONS, LANGUAGE_NAMES, NATIVE_NAMES, flagUrl, resolveLocation, saveLocationId,
} from '../i18n/locations'
import { T } from '../i18n/useSiteText'

function LocationFlag({ location, size = 22 }) {
  const url = flagUrl(location.country)
  if (!url) return <Globe size={size} strokeWidth={1.6} style={{ flexShrink: 0 }} />
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }}
    />
  )
}

function LocationLabel({ location }) {
  return (
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 600 }}>{location.name}</span>{' '}
      <span style={{ opacity: 0.6 }}>{LANGUAGE_NAMES[location.lang]}</span>
    </span>
  )
}

/**
 * Site-wide location switch in the header (flag + language code), modelled
 * on the country-wise pickers international sites use: "Australia English",
 * "India English"… Choosing a location switches the whole site to its
 * language and remembers the country, so the button keeps showing its flag.
 */
export default function SiteLanguageButton({ compact = false }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [listOpen, setListOpen] = useState(true)
  const [q, setQ] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef(null)

  const current = resolveLocation(i18n.language)

  // Every typed word must appear somewhere in "country language native", so
  // "india eng" and "english india" both find India English.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = LOCATIONS.filter(l => {
    const haystack = `${l.name} ${LANGUAGE_NAMES[l.lang]} ${NATIVE_NAMES[l.lang]}`.toLowerCase()
    return words.every(w => haystack.includes(w))
  })

  const close = () => { setOpen(false); setQ('') }

  const openPicker = () => {
    setOpen(true)
    setListOpen(true)
    setHighlight(Math.max(0, LOCATIONS.findIndex(l => l.id === current.id)))
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open, listOpen])

  const choose = location => {
    close()
    if (location.id === current.id) return
    saveLocationId(location.id)
    if (location.lang === i18n.language) {
      // Same language, different country: only the flag changes.
      window.location.reload()
      return
    }
    // Interface text switches instantly, but Back Office content (packages,
    // events, FAQs…) arrives from the server already translated, and pages
    // have fetched and cached it in the old language. A reload refetches
    // everything in the new one.
    i18n.changeLanguage(location.lang).then(() => window.location.reload())
  }

  const onSearchKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setListOpen(true); setHighlight(h => Math.min(h + 1, shown.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter' && shown[highlight]) { e.preventDefault(); choose(shown[highlight]) }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={`Location: ${current.name} ${LANGUAGE_NAMES[current.lang]}. Change location`}
        title={`${current.name} ${LANGUAGE_NAMES[current.lang]}`}
        className="flex items-center gap-1.5 rounded-full font-bold tracking-wider"
        style={{
          height: compact ? 30 : 40,
          padding: compact ? '0 8px' : '0 12px',
          fontSize: compact ? 11 : 12,
          background: 'rgba(212,175,55,0.08)',
          border: '1px solid rgba(212,175,55,0.35)',
          color: '#D4AF37',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <LocationFlag location={current} size={compact ? 15 : 18} />
        {current.lang === 'zh-CN' ? 'ZH' : current.lang === 'zh-TW' ? 'ZH-TW' : current.lang.toUpperCase()}
      </button>

      {open && createPortal(
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select location"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', width: '100%', maxWidth: 460,
              background: 'var(--w365-bg, #0A0005)', color: 'var(--w365-text, #fff)',
              border: '1px solid rgba(212,175,55,0.3)', borderRadius: 18,
              padding: '28px 24px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14, width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.12)', border: 'none', color: 'inherit', cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>

            <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 22, fontWeight: 800, margin: '0 0 22px' }}>
              <Globe size={20} style={{ color: '#D4AF37' }} /> {T('Select Location')}
            </h2>

            {/* The field doubles as the search box, like a native select you can type into. */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 50,
                borderRadius: listOpen ? '12px 12px 0 0' : 12,
                border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(255,255,255,0.04)',
              }}
            >
              <LocationFlag location={current} />
              <input
                autoFocus
                value={q}
                onChange={e => { setQ(e.target.value); setListOpen(true); setHighlight(0) }}
                onKeyDown={onSearchKey}
                onFocus={() => setListOpen(true)}
                placeholder={`${current.name} ${LANGUAGE_NAMES[current.lang]}`}
                aria-label={T('Search country or language…')}
                role="combobox"
                aria-expanded={listOpen}
                aria-controls="site-location-list"
                style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'inherit', fontSize: 15 }}
              />
              <button
                type="button"
                onClick={() => setListOpen(o => !o)}
                aria-label="Toggle list"
                style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', display: 'flex' }}
              >
                <ChevronDown size={16} style={{ transform: listOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
            </div>

            {listOpen && (
              <ul
                id="site-location-list"
                ref={listRef}
                role="listbox"
                style={{
                  listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(46vh, 360px)', overflowY: 'auto',
                  border: '1px solid rgba(212,175,55,0.35)', borderTop: 'none', borderRadius: '0 0 12px 12px',
                  background: 'var(--w365-bg, #0A0005)',
                }}
              >
                {shown.map((loc, i) => {
                  const active = loc.id === current.id
                  const lit = i === highlight
                  return (
                    <li
                      key={loc.id}
                      data-index={i}
                      role="option"
                      aria-selected={active}
                      lang={loc.lang}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => choose(loc)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', cursor: 'pointer', fontSize: 15,
                        background: lit ? 'rgba(212,175,55,0.85)' : active ? 'rgba(212,175,55,0.12)' : 'transparent',
                        color: lit ? '#0A0005' : 'inherit',
                      }}
                    >
                      <LocationFlag location={loc} />
                      <LocationLabel location={loc} />
                    </li>
                  )
                })}
                {shown.length === 0 && (
                  <li style={{ padding: 18, textAlign: 'center', fontSize: 13, opacity: 0.55 }}>
                    {T('No locations match')} “{q}”
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
