// src/admin/tabs/analytics/AnalyticsOverviewTab.jsx
// ANALYTICS: the dashboard's headline KPIs + top campaigns/videos. Every value
// comes from the real /analytics/* endpoints; an empty database shows 0s.
import React, { useState, useEffect, useCallback } from "react";
import { adminFetch, API, fmtN } from "../../helpers";
import { Spinner } from "../../components/SharedUI";
import { C } from "../../constants";
import { RangeSelector, StatCard, StatGrid, Panel, BarRow, EmptyState, LocationTree, fmtPct, fmtSecs } from "./AnalyticsShared";

export default function AnalyticsOverviewTab({ onToast }) {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [videos, setVideos] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c, v, loc] = await Promise.all([
        adminFetch(`${API}/api/admin-panel/analytics/overview/?range=${range}`),
        adminFetch(`${API}/api/admin-panel/analytics/campaigns/?range=${range}`),
        adminFetch(`${API}/api/admin-panel/analytics/videos/?range=${range}`),
        adminFetch(`${API}/api/admin-panel/analytics/locations/?range=${range}`),
      ]);
      if (o?.ok) setData(await o.json()); else setData(null);
      setCampaigns(c?.ok ? await c.json() : []);
      setVideos(v?.ok ? await v.json() : []);
      setLocations(loc?.ok ? await loc.json() : []);
    } catch { onToast?.("Failed to load analytics", false); }
    setLoading(false);
  }, [range, onToast]);

  useEffect(() => { load(); }, [load]);

  const topCampaigns = [...campaigns].sort((a, b) => b.clicks - a.clicks).slice(0, 6);
  const topVideos = [...videos].sort((a, b) => b.total_views - a.total_views).slice(0, 6);
  const maxClicks = Math.max(1, ...topCampaigns.map(c => c.clicks));
  const maxViews = Math.max(1, ...topVideos.map(v => v.total_views));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Analytics Overview</div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {loading ? <Spinner /> : !data ? <EmptyState /> : (
        <>
          <StatGrid>
            <StatCard label="Total Visitors" value={fmtN(data.total_visitors)} sub="sessions" color={C.blue} />
            <StatCard label="Unique Visitors" value={fmtN(data.unique_visitors)} sub="distinct people" color={C.gold} />
            <StatCard label="Unique Members" value={fmtN(data.unique_members)} color={C.green} />
            <StatCard label="Page Views" value={fmtN(data.total_page_views)} color={C.teal} />
            <StatCard label="URL Clicks" value={fmtN(data.total_url_clicks)} sub={`${fmtN(data.unique_clickers)} unique`} color={C.purple} />
            <StatCard label="Video Views" value={fmtN(data.total_video_views)} sub={`${fmtN(data.unique_video_viewers)} unique`} color={C.orange} />
            <StatCard label="Video Completion" value={fmtPct(data.video_completion_rate)} color={C.pink} />
            <StatCard label="New Members" value={fmtN(data.new_members)} color={C.green} />
          </StatGrid>

          <Panel title="Video Analytics">
            <StatGrid>
              <StatCard label="Total Views" value={fmtN(data.total_video_views)} color={C.orange} />
              <StatCard label="Unique Viewers" value={fmtN(data.unique_video_viewers)} color={C.gold} />
              <StatCard label="Total Clicks" value={fmtN(data.total_video_clicks)} color={C.purple} />
              <StatCard label="Unique Clickers" value={fmtN(data.unique_video_clickers)} color={C.purple} />
              <StatCard label="Average Watch Time" value={fmtSecs(data.avg_video_watch_seconds)} color={C.teal} />
              <StatCard label="Completion Rate" value={fmtPct(data.video_completion_rate)} color={C.pink} />
              <StatCard label="CTR" value={fmtPct(data.video_ctr)} color={C.blue} />
            </StatGrid>
          </Panel>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <Panel title="Top Campaigns (by clicks)">
              {topCampaigns.length === 0 ? <EmptyState text="No campaign traffic yet" /> :
                topCampaigns.map((c, i) => (
                  <BarRow key={`${c.id}-${i}`} label={c.name || c.utm_campaign || "—"} value={c.clicks} max={maxClicks} color={C.blue} />
                ))}
            </Panel>
            <Panel title="Top Videos (by views)">
              {topVideos.length === 0 ? <EmptyState text="No video plays yet" /> :
                // Keyed with the index as well as the id: these ids come from
                // an aggregate the API is responsible for de-duplicating, and
                // a list should not stop rendering correctly because an
                // upstream query regressed.
                topVideos.map((v, i) => (
                  <BarRow key={`${v.content_id}-${i}`} label={v.content_id} value={v.total_views} max={maxViews} color={C.orange}
                          right={`${fmtN(v.total_views)}`} />
                ))}
            </Panel>
          </div>

          <Panel title="Viewers by Country (video)">
            <LocationTree countries={locations} />
          </Panel>
        </>
      )}
    </div>
  );
}
