// src/components/AnalyticsTracker.jsx
//
// ANALYTICS: records a page_view on each real route change (not on every React
// re-render) and captures first-touch UTM on arrival. Renders nothing.
// Mounted once, inside <BrowserRouter> (it reads useLocation()).
//
// Separate from the affiliate ?ref/?campaign capture in App.jsx, which stays
// exactly as it is — this only feeds the new first-party analytics.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureUtm, trackPageView } from "../services/analytics";

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

  return null;
}
