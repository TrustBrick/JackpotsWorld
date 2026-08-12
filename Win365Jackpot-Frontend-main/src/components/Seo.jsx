import React from 'react'
import { Helmet } from 'react-helmet-async'

import {
  SITE_NAME,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  TWITTER_HANDLE,
  absoluteUrl,
  absoluteImage,
} from '../config/seo'

/**
 * Emits the <head> tags for one page: title, description, canonical, Open
 * Graph, Twitter Card and any JSON-LD.
 *
 * Later-mounted Helmet instances win, so a page can render its own <Seo>
 * to override the route defaults <RouteSeo> already applied — that's how
 * /events/:id replaces the generic listing title once the record arrives.
 *
 * Props:
 *   title, description — plain strings, already truncated by the caller
 *   path               — pathname for canonical/og:url (defaults to current)
 *   image              — og:image; relative paths are made absolute
 *   noindex            — keep this page out of search results
 *   type               — og:type ('website' | 'article' | 'event')
 *   jsonLd             — one schema.org object, or an array of them
 *   lang               — overrides <html lang>, for the i18n language switch
 */
export default function Seo({
  title,
  description,
  path,
  image,
  noindex = false,
  type = 'website',
  jsonLd,
  lang,
}) {
  const resolvedTitle = title || DEFAULT_TITLE
  const resolvedDescription = description || DEFAULT_DESCRIPTION
  const canonical = absoluteUrl(
    path ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  )
  const resolvedImage = absoluteImage(image || DEFAULT_OG_IMAGE)

  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []

  return (
    // defer={false} is required, not a preference. react-helmet-async
    // defaults to defer:true, which commits head changes inside a
    // requestAnimationFrame callback — that never fires in a tab that isn't
    // painting, which includes background tabs and, critically, headless
    // crawlers and prerenderers. With the default, the <head> silently keeps
    // index.html's static tags and every per-route title/canonical/JSON-LD
    // on this page is invisible to exactly the clients this file exists for.
    <Helmet
      defer={false}
      prioritizeSeoTags
      {...(lang ? { htmlAttributes: { lang } } : {})}
    >
      <title>{resolvedTitle}</title>
      <meta name="description" content={resolvedDescription} />

      {/* A noindex page still gets a canonical: it stops the URL being
          treated as a duplicate if it is ever linked externally. */}
      <link rel="canonical" href={canonical} />
      <meta
        name="robots"
        content={noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}
      />

      {/* ── Open Graph ──────────────────────────────────────────────────── */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={resolvedImage} />
      <meta property="og:image:alt" content={resolvedTitle} />

      {/* ── Twitter / X ─────────────────────────────────────────────────── */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={resolvedImage} />
      {TWITTER_HANDLE ? <meta name="twitter:site" content={TWITTER_HANDLE} /> : null}

      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  )
}
