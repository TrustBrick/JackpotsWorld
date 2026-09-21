import React, { useState } from "react";
import { LineChart, Megaphone, PlayCircle, UserCheck, Users, Pointer, Stethoscope } from "lucide-react";
import { useAdminTheme } from "../context/AdminThemeContext";
import AnalyticsOverviewTab from "./analytics/AnalyticsOverviewTab";
import CampaignAnalyticsTab from "./analytics/CampaignAnalyticsTab";
import VideoAnalyticsTab from "./analytics/VideoAnalyticsTab";
import MemberEngagementTab from "./analytics/MemberEngagementTab";
import VisitorAnalyticsTab from "./analytics/VisitorAnalyticsTab";
import ClickAnalyticsTab from "./analytics/ClickAnalyticsTab";
import AnalyticsDiagnosticTab from "./analytics/AnalyticsDiagnosticTab";

/**
 * SystemLogsTab — one Back Office destination for the platform's own
 * telemetry, with the analytics views as tabs inside it rather than as
 * separate sidebar entries.
 *
 * Purely a container: every panel below is the existing analytics component,
 * imported and rendered unchanged. No endpoint, query or table was
 * reimplemented here — moving where something is reached from should not
 * change what it shows, and if any of these ever needs to go back to being
 * its own sidebar item, it can, because nothing was folded into this file.
 *
 * URL Analytics was removed from this row on request, along with its
 * component, its /api/admin-panel/analytics/urls/ endpoint and the
 * urls_report aggregation behind it. Campaign Analytics is unaffected and
 * still counts the same url_click events -- see the note in
 * services/analytics_service.py for what stayed and why.
 *
 * This page answers questions about the system: traffic, campaigns, links,
 * media, engagement.
 *
 * It used to be paired with an Activity Logs destination (tabs/LogsTab.jsx)
 * that answered the other question — who did what. That page was removed on
 * request; the who-did-what trail is now kept as a database record only, and
 * is written for every admin action rather than the subset of endpoints that
 * logged by hand (authapp/middleware/admin_audit.py). LogsTab.jsx is still in
 * the tree, unwired, so the screen can come back without rebuilding it.
 *
 * The panel is kept mounted-on-demand (only the active tab renders), so
 * switching tabs does not leave every other panel's requests running behind
 * the one being looked at.
 */

const TABS = [
  { id: "overview", label: "Overview", icon: LineChart, Component: AnalyticsOverviewTab },
  { id: "campaigns", label: "Campaign Analytics", icon: Megaphone, Component: CampaignAnalyticsTab },
  { id: "videos", label: "Video Analytics", icon: PlayCircle, Component: VideoAnalyticsTab },
  { id: "members", label: "Member Analytics", icon: UserCheck, Component: MemberEngagementTab },
  // VISITOR-ANALYTICS: who came and from where, what got clicked, and a
  // diagnostic for when the first two look wrong.
  { id: "visitors", label: "Visitor Analytics", icon: Users, Component: VisitorAnalyticsTab },
  { id: "clicks", label: "Click Analytics", icon: Pointer, Component: ClickAnalyticsTab },
  { id: "diagnostic", label: "Diagnostic", icon: Stethoscope, Component: AnalyticsDiagnosticTab },
];

export default function SystemLogsTab(props) {
  const { C } = useAdminTheme();
  const [active, setActive] = useState("overview");
  const current = TABS.find(t => t.id === active) || TABS[0];
  const Panel = current.Component;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Same pill-row treatment the Commission Rules tab already uses for its
          in-page views, so this reads as an established Back Office pattern
          rather than a new one. */}
      <div
        role="tablist"
        aria-label="System Logs sections"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        {TABS.map(t => {
          const isActive = t.id === active;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                border: isActive ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
                background: isActive ? `${C.gold}15` : "transparent",
                color: isActive ? C.gold : C.muted,
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <Panel {...props} />
    </div>
  );
}
