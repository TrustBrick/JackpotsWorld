// src/components/AnalyticsTracker.jsx
//
// ANALYTICS: records a page_view on each real route change (not on every React
// re-render), captures first-touch UTM on arrival, and records clicks on
// tracked links and buttons. Renders nothing.
// Mounted once, inside <BrowserRouter> (it reads useLocation()).
//
// Separate from the affiliate ?ref/?campaign capture in App.jsx, which stays
// exactly as it is — this only feeds the first-party analytics.
//
// WHY CLICKS ARE TRACKED HERE, AS ONE DELEGATED LISTENER, rather than by
// adding an onClick to every button in the app:
//
//   • One listener on the document catches clicks on controls that did not
//     exist when it was attached, so newly-added UI is tracked automatically
//     instead of only when someone remembers to instrument it. The previous
//     approach — per-component calls — is why the only click events in the
//     whole system came from a single promotion CTA.
//   • It keeps every network call inside services/analytics.js (§26). No
//     component gains an analytics import or a fetch.
//   • It cannot double-count. The listener is attached once (not per render),
//     and each click resolves to the SAME element id, so the debounce and
//     server-side idempotency in services/analytics.js collapse a bubbled,
//     re-rendered or retried click into one row.
//
// To give a control a stable, readable name in the dashboard, add
// `data-analytics-id` (and optionally `data-analytics-label`) to it. Without
// one, an id is derived from the link's path or the button's own text, which
// is usually good enough and always better than no data.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureUtm, trackPageView, trackClick } from "../services/analytics";

// Back-office routes. Their clicks are deliberately NOT tracked: this dashboard
// answers "what do visitors do on the site", and an admin working through the
// panel would otherwise dominate every click breakdown with activity that is
// not visitor behaviour at all.
const UNTRACKED_CLICK_PREFIXES = ["/admin-panel", "/super-admin", "/affiliate-panel", "/affiliate-login"];

function isUntrackedArea(pathname) {
  return UNTRACKED_CLICK_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

// Trim a label down to something readable, from the element's own accessible
// text. Whitespace-collapsed so multi-line markup doesn't produce ragged
// labels that look like different controls in the dashboard.
function labelOf(el) {
  const explicit = el.getAttribute("data-analytics-label")
    || el.getAttribute("aria-label")
    || el.getAttribute("title");
  const text = explicit || el.textContent || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

// A STABLE identifier — the same control must produce the same id on every
// render and every page load, or its click history fragments into one row per
// render. Derived from the destination (for links) or the label (for buttons),
// never from a React key or a generated DOM id.
function idOf(el, label) {
  const explicit = el.getAttribute("data-analytics-id");
  if (explicit) return explicit.slice(0, 120);

  const href = el.getAttribute("href");
  if (href) {
    try {
      const url = new URL(href, window.location.origin);
      const internal = url.origin === window.location.origin;
      return `link:${internal ? url.pathname : `${url.hostname}${url.pathname}`}`.slice(0, 120);
    } catch {
      return `link:${href}`.slice(0, 120);
    }
  }
  if (!label) return "";
  return `button:${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`.slice(0, 120);
}

function destinationOf(el) {
  const href = el.getAttribute("href");
  if (!href) return "";
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // First-touch UTM is captured before the first page_view so that view is
    // already attributed; captureUtm no-ops on every call after the first.
    captureUtm(location.search);
    trackPageView(`${location.pathname}${location.search}`);
    // Keyed on pathname so a re-render (or a state-only change) doesn't double
    // count; a genuine navigation to a new path fires exactly one page_view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    // Attached ONCE for the life of the app, not per route change — a listener
    // re-attached on every navigation is the classic way a single click ends
    // up recorded N times.
    const onClick = (e) => {
      try {
        if (isUntrackedArea(window.location.pathname)) return;

        const target = e.target;
        if (!target || typeof target.closest !== "function") return;

        // Nearest tracked ancestor: an explicitly-marked element wins,
        // otherwise the enclosing link or button. `closest` means a click on
        // an icon inside a button is attributed to the button, which is what
        // the visitor thinks they clicked.
        const el = target.closest("[data-analytics-id], a[href], button, [role='button']");
        if (!el) return;
        if (el.hasAttribute("data-analytics-ignore")) return;

        const label = labelOf(el);
        const id = idOf(el, label);
        if (!id) return;

        trackClick(id, {
          label,
          type: el.getAttribute("data-analytics-type")
            || (el.tagName === "A" ? "link" : "button"),
          destination: destinationOf(el),
        });
      } catch {
        // Analytics must never interfere with the click the visitor actually
        // made — swallow anything that goes wrong here.
      }
    };

    // Capture phase, so a handler that calls stopPropagation() (common on
    // menus and modals) cannot prevent the click from being recorded.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
