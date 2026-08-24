import React, { useState } from "react";
import { LineChart, Megaphone, MousePointerClick, PlayCircle, UserCheck, Users, Pointer, Stethoscope } from "lucide-react";
import { useAdminTheme } from "../context/AdminThemeContext";
import AnalyticsOverviewTab from "./analytics/AnalyticsOverviewTab";
import CampaignAnalyticsTab from "./analytics/CampaignAnalyticsTab";
import UrlAnalyticsTab from "./analytics/UrlAnalyticsTab";
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
 * Deliberately distinct from Activity Logs (tabs/LogsTab.jsx). That page is
 * the who-did-what audit trail — User Logs and Admin Logs — and answers
 * questions about people. This one answers questions about the system:
 * traffic, campaigns, links, media, engagement. They stay two destinations
 * because they are two different questions.
 *
 * The panel is kept mounted-on-demand (only the active tab renders), so
 * switching tabs does not leave every other panel's requests running behind
 * the one being looked at.
 */

const TABS = [
  { id: "overview", label: "Overview", icon: LineChart, Component: AnalyticsOverviewTab },
  { id: "campaigns", label: "Campaign Analytics", icon: Megaphone, Component: CampaignAnalyticsTab },
  { id: "urls", label: "URL Analytics", icon: MousePointerClick, Component: UrlAnalyticsTab },
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
