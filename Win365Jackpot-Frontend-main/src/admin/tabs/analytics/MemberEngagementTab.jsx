// src/admin/tabs/analytics/MemberEngagementTab.jsx
// ANALYTICS: per-member engagement summary (admin-only). Look a member up by
// their numeric user id (shown in the Users tab). Only legitimate business
// signals are shown — never message content or anything sensitive.
import React, { useState } from "react";
import { Search } from "lucide-react";
import { adminFetch, API, fmtN, fmtDT } from "../../helpers";
import { Spinner, Btn } from "../../components/SharedUI";
import { C } from "../../constants";
import { StatCard, StatGrid, Panel, EmptyState, fmtSecs } from "./AnalyticsShared";

export default function MemberEngagementTab({ onToast }) {
  const [userId, setUserId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const lookup = async () => {
    const id = userId.trim();
    if (!id || !/^\d+$/.test(id)) { onToast?.("Enter a numeric member id", false); return; }
    setLoading(true); setNotFound(false); setData(null);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/members/${id}/`);
      if (r?.status === 404) setNotFound(true);
      else if (r?.ok) setData(await r.json());
      else onToast?.("Failed to load member engagement", false);
    } catch { onToast?.("Network error", false); }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Member Engagement</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Enter a member's numeric user id (from the Users tab) to see their engagement.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={userId}
          onChange={e => setUserId(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") lookup(); }}
          placeholder="Member id, e.g. 42"
          style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 12.5, outline: "none", width: 180 }}
        />
        <Btn onClick={lookup}><Search size={13} /> Look up</Btn>
      </div>

      {loading ? <Spinner /> :
        notFound ? <EmptyState text="No member found with that id" /> :
        !data ? null : (
          <>
            <Panel title={`${data.email}`} right={<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{data.user_uid}</span>}>
              <StatGrid>
                <StatCard label="URLs Clicked" value={fmtN(data.urls_clicked)} color={C.blue} />
                <StatCard label="Page Views" value={fmtN(data.page_views)} color={C.teal} />
                <StatCard label="Videos Watched" value={fmtN(data.videos_watched)} color={C.orange} />
                <StatCard label="Videos Completed" value={fmtN(data.videos_completed)} color={C.pink} />
                <StatCard label="Total Watch Time" value={fmtSecs(data.total_watch_seconds)} color={C.gold} />
                <StatCard label="Logins" value={fmtN(data.logins)} color={C.green} />
              </StatGrid>
              <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                Last activity: {data.last_activity ? fmtDT(data.last_activity) : "—"}
              </div>
            </Panel>
          </>
        )}
    </div>
  );
}
