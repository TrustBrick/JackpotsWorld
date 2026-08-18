import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/**
 * Visible breadcrumb trail for detail pages.
 *
 * The detail pages already emit BreadcrumbList JSON-LD (see
 * utils/seoSchemas.js), but until now nothing rendered the trail on the page
 * itself — only a "Back to X" button. Structured data is meant to describe
 * what a visitor can actually see, so a BreadcrumbList with no visible
 * counterpart is the kind of mismatch Google's structured-data guidelines
 * call out. This renders the same trail the JSON-LD declares, from the same
 * array, so the two cannot drift apart.
 *
 * Props:
 *   trail — [{ name, path }, ...] in order, root first. The final entry is
 *           the current page and is rendered as plain text, not a link.
 */
export default function Breadcrumbs({ trail = [] }) {
  if (trail.length < 2) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-body text-white/45">
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight size={12} className="text-white/25 shrink-0" aria-hidden="true" />
              )}
              {isLast ? (
                // aria-current marks the page the trail ends on; it is not a
                // link because it points at the URL already being viewed.
                <span aria-current="page" className="text-gold/80 line-clamp-1">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="hover:text-gold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold rounded-sm"
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
