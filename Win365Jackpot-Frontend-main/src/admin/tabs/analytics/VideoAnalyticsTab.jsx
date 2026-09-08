// src/admin/tabs/analytics/VideoAnalyticsTab.jsx
// ANALYTICS: per-video exposure/views/clicks/retention/location. Click a row
// for its retention funnel, click/CTR breakdown, and location drill-down.
//
// TWO CTRs, deliberately labelled apart:
//   Unique CTR  unique clickers / people exposed. The headline — someone who
//               plays a video three times and clicks once is one
//               click-through, not a third of one. Cannot exceed 100%.
//   Total CTR   all clicks / all impressions. CAN legitimately exceed 100%
//               (one exposure can produce several clicks), which is exactly
//               why it is not blended with the number above.
// Both divide by EXPOSURE, not by plays. The previous single CTR divided by
// plays, and on a click-to-play video the click that starts playback is the
// same gesture that creates the play — so the numerator was inside the
// denominator and CTR sat pinned near 100%. See _reduce_video's docstring.
import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { adminFetch, API, fmtN } from "../../helpers";
import { Table, Spinner } from "../../components/SharedUI";
import { C } from "../../constants";
import { DateRangeSelector, StatCard, StatGrid, Panel, BarRow, EmptyState, LocationTree, fmtSecs, fmtPct } from "./AnalyticsShared";

const td = { padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap" };

// range: {id, start, end} -> the querystring analytics_service.resolve_range expects.
function rangeQuery(range) {
  const params = new URLSearchParams({ range: range.id });
  if (range.id === "custom" && range.start && range.end) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  return params.toString();
}

function VideoDetail({ contentId, range, onBack, onToast }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await adminFetch(`${API}/api/admin-panel/analytics/videos/${encodeURIComponent(contentId)}/?${rangeQuery(range)}`);
        if (alive) setDetail(r?.ok ? await r.json() : null);
      } catch { onToast?.("Failed to load video detail", false); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [contentId, range, onToast]);

  const maxStage = detail ? Math.max(1, ...detail.retention.map(s => s.count)) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={onBack} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "rgba(255,255,255,0.8)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
        <ArrowLeft size={14} /> Back to videos
      </button>
      <div style={{ fontSize: 15, fontWeight: 800, color: "white", wordBreak: "break-all" }}>{contentId}</div>
      {loading ? <Spinner /> : !detail ? <EmptyState /> : (
        <>
          <StatGrid>
            {/* Exposure first — it is the DENOMINATOR of CTR, and putting it
                anywhere else is how the old dashboard let a CTR near 100% look
                plausible. An impression is "the player was at least half on
                screen", emitted once per video per tab session. */}
            <StatCard label="Impressions" value={fmtN(detail.impressions)} sub={`${fmtN(detail.unique_impressions)} unique`} color={C.teal} />
            <StatCard label="People Exposed" value={fmtN(detail.unique_exposed)} sub="impressions, plays and clicks combined" color={C.teal} />
            <StatCard label="Total Views" value={fmtN(detail.total_views)} color={C.orange} />
            <StatCard label="Unique Viewers" value={fmtN(detail.unique_viewers)} color={C.gold} />
            <StatCard label="View-Through Rate" value={fmtPct(detail.view_through_rate)} sub="of those exposed, how many played" color={C.gold} />
            <StatCard label="Video Starts" value={fmtN(detail.video_starts)} color={C.gold} />
            <StatCard label="Total Clicks" value={fmtN(detail.total_clicks)} sub={`${fmtN(detail.unique_clickers)} unique`} color={C.purple} />
            <StatCard label="Avg Watch Time" value={fmtSecs(detail.avg_watch_seconds)} color={C.teal} />
            <StatCard label="Completion Rate" value={fmtPct(detail.completion_rate)} color={C.pink} />
            <StatCard label="Unique CTR" value={fmtPct(detail.ctr)} sub="unique clickers / people exposed" color={C.blue} />
            {/* A dash, not 0%, when there is no impression data to divide by.
                That happens for windows predating impression tracking, and
                showing a measured-looking zero there would be a fabrication. */}
            <StatCard
              label="Total CTR"
              value={detail.total_ctr == null ? "—" : fmtPct(detail.total_ctr)}
              sub={detail.has_impression_data ? "all clicks / all impressions" : "no impressions recorded"}
              color={C.blue}
            />
          </StatGrid>

          <Panel title="Clicks breakdown">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Play clicks (player itself)</span>
                <span style={{ color: "white", fontWeight: 700 }}>{fmtN(detail.play_clicks)} · {fmtN(detail.unique_play_clickers)} unique</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>CTA clicks (call-to-action)</span>
                <span style={{ color: "white", fontWeight: 700 }}>{fmtN(detail.cta_clicks)} · {fmtN(detail.unique_cta_clickers)} unique</span>
              </div>
            </div>
          </Panel>

          <Panel title="Retention (from real playback events)">
            {detail.retention.map(s => (
              <BarRow key={s.stage} label={s.stage} value={s.count} max={maxStage} color={C.orange}
                      right={`${fmtN(s.count)} · ${fmtPct(s.pct)}`} />
            ))}
          </Panel>

          <Panel title="Viewers &amp; clicks by location">
            <LocationTree countries={detail.locations} />
          </Panel>
        </>
      )}
    </div>
  );
}

export default function VideoAnalyticsTab({ onToast }) {
  const [range, setRange] = useState({ id: "30d" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    // A custom range with an incomplete date pair isn't ready to query yet —
    // DateRangeSelector only calls onChange once both dates are filled.
    if (range.id === "custom" && (!range.start || !range.end)) return;
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/videos/?${rangeQuery(range)}`);
      setRows(r?.ok ? await r.json() : []);
    } catch { onToast?.("Failed to load video analytics", false); }
    setLoading(false);
  }, [range, onToast]);
  useEffect(() => { load(); }, [load]);

  if (selected) {
    return <VideoDetail contentId={selected} range={range} onBack={() => setSelected(null)} onToast={onToast} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Video Analytics</div>
        <DateRangeSelector value={range} onChange={setRange} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <Table
          headers={["Video", "Impressions", "Exposed", "Total Views", "Unique Viewers", "View-Through", "Reached 50%", "Completed", "Avg Watch", "Completion", "Total Clicks", "Unique Clickers", "Unique CTR", "Total CTR", ""]}
          loading={loading} colSpan={15} emptyText="No video impressions or plays yet"
        >
          {rows.map(v => (
            <tr key={v.content_id} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => setSelected(v.content_id)}>
              <td style={{ ...td, fontWeight: 700, color: "white" }}>{v.content_id}</td>
              <td style={{ ...td, color: C.teal, fontWeight: 700 }}>{fmtN(v.impressions)}</td>
              <td style={td}>{fmtN(v.unique_exposed)}</td>
              <td style={{ ...td, color: C.orange, fontWeight: 700 }}>{fmtN(v.total_views)}</td>
              <td style={td}>{fmtN(v.unique_viewers)}</td>
              <td style={td}>{fmtPct(v.view_through_rate)}</td>
              <td style={td}>{fmtN(v.reached_50)}</td>
              <td style={td}>{fmtN(v.completed)}</td>
              <td style={td}>{fmtSecs(v.avg_watch_seconds)}</td>
              <td style={{ ...td, color: C.pink, fontWeight: 700 }}>{fmtPct(v.completion_rate)}</td>
              <td style={{ ...td, color: C.purple, fontWeight: 700 }}>{fmtN(v.total_clicks)}</td>
              <td style={td}>{fmtN(v.unique_clickers)}</td>
              <td style={{ ...td, color: C.blue, fontWeight: 700 }}>{fmtPct(v.ctr)}</td>
              <td style={td}>{v.total_ctr == null ? "—" : fmtPct(v.total_ctr)}</td>
              <td style={{ ...td, color: C.blue }}>View →</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
