// src/admin/tabs/analytics/ClickAnalyticsTab.jsx
//
// VISITOR-ANALYTICS: what visitors click, and who clicks it.
//
// "Clicks" here covers every click event type — the general element click,
// campaign-redirect clicks, and the two video click signals — because an
// admin asking "how many clicks did we get" means all of them. The previous
// dashboard counted only campaign-redirect clicks, which is why the number
// looked implausibly small.
//
// CLICKS vs UNIQUE CLICKERS is the distinction that makes this page useful and
// it is shown on every breakdown: clicks counts events, unique clickers counts
// DISTINCT VISITORS. One enthusiastic visitor clicking a CTA nine times is
// 9 clicks and 1 clicker, and conflating the two is how a control comes to
// look more popular than it is.
import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { adminFetch, API, fmtN } from "../../helpers";
import { Spinner } from "../../components/SharedUI";
import { C } from "../../constants";
import {
  DateRangeSelector, StatCard, StatGrid, Panel, BarRow, EmptyState,
} from "./AnalyticsShared";

const inputStyle = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
  borderRadius: 7, color: "white", fontSize: 12, padding: "6px 9px", minWidth: 110,
};

function rangeQuery(range) {
  const params = new URLSearchParams({ range: range.id });
  if (range.id === "custom" && range.start && range.end) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  return params;
}

// One breakdown panel. All of them have the same shape (label, clicks, unique
// clickers), so they share one renderer rather than five near-copies.
function Breakdown({ title, rows, labelKey, color }) {
  if (!rows?.length) return <Panel title={title}><EmptyState text="Nothing recorded in this window" /></Panel>;
  const max = Math.max(1, ...rows.map(r => r.clicks));
  return (
    <Panel title={title}>
      <div>
        {rows.slice(0, 12).map((r, i) => (
          <BarRow
            key={`${r[labelKey]}-${i}`}
            label={String(r[labelKey] ?? "Unknown").slice(0, 22)}
            value={r.clicks}
            max={max}
            color={color}
            right={`${fmtN(r.clicks)} · ${fmtN(r.unique_clickers)}u`}
          />
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
        clicks · unique clickers
      </div>
    </Panel>
  );
}

export default function ClickAnalyticsTab({ onToast }) {
  const [range, setRange] = useState({ id: "30d" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [device, setDevice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = rangeQuery(range);
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (device) params.set("device", device);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/clicks/?${params}`);
      setData(r?.ok ? await r.json() : null);
    } catch { onToast?.("Failed to load click analytics", false); }
    setLoading(false);
  }, [range, country, city, device, onToast]);

  useEffect(() => { load(); }, [load]);

  const maxDay = data?.over_time?.length ? Math.max(1, ...data.over_time.map(d => d.clicks)) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Click Analytics</div>
        <DateRangeSelector value={range} onChange={setRange} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Country code" value={country} onChange={e => setCountry(e.target.value)} style={inputStyle} />
        <input placeholder="City" value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
        <input placeholder="Device" value={device} onChange={e => setDevice(e.target.value)} style={inputStyle} />
        <button
          onClick={load}
          title="Refresh"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 7, color: "rgba(255,255,255,0.8)", padding: "6px 9px", cursor: "pointer" }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading && !data ? <Spinner /> : !data ? <EmptyState /> : (
        <>
          <StatGrid>
            <StatCard label="Total Clicks" value={fmtN(data.total_clicks)} color={C.purple} />
            <StatCard label="Unique Clickers" value={fmtN(data.unique_clickers)} sub="distinct visitors" color={C.gold} />
          </StatGrid>

          <Breakdown title="Clicks by element" rows={data.by_element} labelKey="element_label" color={C.purple} />
          <Breakdown title="Clicks by page" rows={data.by_page} labelKey="page" color={C.blue} />
          <Breakdown title="Clicks by country" rows={data.by_country} labelKey="country" color={C.teal} />
          <Breakdown title="Clicks by city" rows={data.by_city} labelKey="city" color={C.orange} />
          <Breakdown title="Clicks by device" rows={data.by_device} labelKey="device" color={C.pink} />

          <Panel title="Clicks over time">
            {!data.over_time?.length ? <EmptyState text="Nothing recorded in this window" /> : (
              <div>
                {data.over_time.map(d => (
                  <BarRow key={d.date} label={d.date} value={d.clicks} max={maxDay} color={C.gold} right={fmtN(d.clicks)} />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
