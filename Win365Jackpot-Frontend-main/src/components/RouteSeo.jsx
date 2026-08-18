import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import Seo from './Seo'
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  ROUTE_SEO,
  isNoindexPath,
  isDynamicDetailPath,
} from '../config/seo'

/**
 * Site-wide Organization + WebSite graph. Emitted on every page (schema.org
 * expects the publisher on any page, not just the home page) and the piece
 * Google uses to build a knowledge panel / brand entity.
 */
function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/assets/icons/web-app-manifest-512x512.png`,
          width: 512,
          height: 512,
        },
        description: DEFAULT_DESCRIPTION,
        areaServed: ['Vietnam', 'Macau', 'India', 'Sri Lanka', 'Philippines'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en',
      },
    ],
  }
}

/**
 * Applies the static per-route metadata from config/seo.js on every
 * navigation. Rendered once, inside the router but above <Routes>.
 *
 * Detail routes (/events/:id etc.) are skipped here rather than given a
 * generic title — they render their own <Seo> once the record loads, and
 * emitting a placeholder first would leave the real title missing on any
 * page whose fetch fails.
 */
export default function RouteSeo() {
  const { pathname } = useLocation()
  const { i18n } = useTranslation()

  const entry = ROUTE_SEO[pathname]
  const dynamic = isDynamicDetailPath(pathname)

  // Unknown, non-detail paths are the SPA's catch-all redirect target. Keep
  // them out of the index instead of letting them accumulate as thin
  // duplicates of the home page.
  const unknown = !entry && !dynamic

  return (
    <Seo
      title={entry?.title || (dynamic ? undefined : DEFAULT_TITLE)}
      description={entry?.description || (dynamic ? undefined : DEFAULT_DESCRIPTION)}
      path={pathname}
      noindex={entry?.noindex || isNoindexPath(pathname) || unknown}
      lang={i18n?.resolvedLanguage || i18n?.language || 'en'}
      jsonLd={organizationSchema()}
    />
  )
}
