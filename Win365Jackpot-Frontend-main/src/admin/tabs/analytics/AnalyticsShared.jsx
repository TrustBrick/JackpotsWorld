// src/admin/tabs/analytics/AnalyticsShared.jsx
//
// ANALYTICS: shared building blocks for the Admin Analytics tabs. Hand-rolled
// KPI tiles and CSS/SVG bars in the existing dark/gold admin style — no chart
// dependency is added (the project has none, and the approved decision was to
// match the existing look). Every value shown is passed in from a real API
// response; there is no placeholder data anywhere here.
import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C } from "../../constants";
import { fmtN } from "../../helpers";

export const RANGES = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
];

export function RangeSelector({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {RANGES.map(r => {
        const active = value === r.id;
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: active ? `${C.gold}22` : "rgba(255,255,255,0.04)",
              border: `1px solid ${active ? C.gold : C.border}`,
              color: active ? C.gold : "rgba(255,255,255,0.6)",
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// Adds a "Custom Range" option on top of RangeSelector's presets, with two
// date inputs. A separate component (rather than extending RangeSelector
// itself) so the three existing consumers of RangeSelector — Overview,
// Campaign, URL analytics — are completely unaffected; only Video Analytics
// uses this one. `value` is {id, start, end} (start/end only meaningful when
// id === "custom", "YYYY-MM-DD"); onChange receives the same shape.
const inputStyle = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
  borderRadius: 7, color: "white", fontSize: 12, padding: "5px 8px",
  colorScheme: "dark",
};

export function DateRangeSelector({ value, onChange }) {
  const { id, start = "", end = "" } = value || {};
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const isCustom = id === "custom";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {RANGES.map(r => {
        const active = !isCustom && id === r.id;
        return (
          <button
            key={r.id}
            onClick={() => onChange({ id: r.id })}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: active ? `${C.gold}22` : "rgba(255,255,255,0.04)",
              border: `1px solid ${active ? C.gold : C.border}`,
              color: active ? C.gold : "rgba(255,255,255,0.6)",
            }}
          >
            {r.label}
          </button>
        );
      })}
      <button
        onClick={() => onChange({ id: "custom", start: draftStart, end: draftEnd })}
        style={{
          padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
          background: isCustom ? `${C.gold}22` : "rgba(255,255,255,0.04)",
          border: `1px solid ${isCustom ? C.gold : C.border}`,
          color: isCustom ? C.gold : "rgba(255,255,255,0.6)",
        }}
      >
        Custom Range
      </button>
      {isCustom && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)} style={inputStyle} />
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>to</span>
          <input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)} style={inputStyle} />
          <button
            onClick={() => draftStart && draftEnd && onChange({ id: "custom", start: draftStart, end: draftEnd })}
            disabled={!draftStart || !draftEnd}
            style={{
              padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 700,
              cursor: draftStart && draftEnd ? "pointer" : "not-allowed",
              opacity: draftStart && draftEnd ? 1 : 0.5,
              background: C.gold, border: "none", color: "#1a1200",
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export function StatCard({ label, value, sub, color = C.gold }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "14px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 6, lineHeight: 1.1, wordBreak: "break-word" }}>
        {value}
      </div>
      {sub != null && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

export function Panel({ title, right, children }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// A labelled horizontal bar — the project's charting idiom (used across the
// admin dashboards) rather than a chart library.
export function BarRow({ label, value, max, color = C.gold, right }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 90, flexShrink: 0, fontSize: 11.5, color: "rgba(255,255,255,0.6)", textAlign: "right" }}>{label}</div>
      <div style={{ flex: 1, height: 16, borderRadius: 6, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}AA)`, borderRadius: 6 }} />
      </div>
      <div style={{ width: 70, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "white" }}>
        {right != null ? right : value}
      </div>
    </div>
  );
}

export function EmptyState({ text = "No analytics data yet" }) {
  return (
    <div style={{ padding: "28px 12px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
      {text}
    </div>
  );
}

export function fmtSecs(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

export function fmtPct(n) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

// LOCATION-ANALYTICS: country -> region -> city, each level expandable. Rows
// are pre-sorted by viewers (most first) by the backend. Shared by the
// per-video location panel (VideoAnalyticsTab) and the site-wide "Viewers by
// Country" panel (AnalyticsOverviewTab) — same shape, same component.
export function LocationTree({ countries }) {
  const [openCountry, setOpenCountry] = useState(null);
  const [openRegion, setOpenRegion] = useState(null);

  if (!countries?.length) return <EmptyState text="No location data for this window" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {countries.map(c => {
        const isOpen = openCountry === c.country;
        return (
          <div key={c.country}>
            <button
              onClick={() => { setOpenCountry(isOpen ? null : c.country); setOpenRegion(null); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left",
              }}
            >
              {isOpen ? <ChevronDown size={13} color="rgba(255,255,255,0.5)" /> : <ChevronRight size={13} color="rgba(255,255,255,0.5)" />}
              <span style={{ fontWeight: 700, fontSize: 12.5, color: "white", flex: 1 }}>{c.country || "Unknown"}</span>
              <span style={{ fontSize: 11.5, color: C.orange, fontWeight: 700 }}>{fmtN(c.viewers)} viewers</span>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>{fmtN(c.clicks)} clicks · {fmtN(c.unique_clickers)} clickers</span>
            </button>
            {isOpen && (
              <div style={{ paddingLeft: 22, marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                {c.regions.map(r => {
                  const regionKey = `${c.country}:${r.region}`;
                  const rOpen = openRegion === regionKey;
                  return (
                    <div key={r.region}>
                      <button
                        onClick={() => setOpenRegion(rOpen ? null : regionKey)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 8,
                          background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
                          borderRadius: 7, padding: "6px 9px", cursor: "pointer", textAlign: "left",
                        }}
                      >
                        {rOpen ? <ChevronDown size={12} color="rgba(255,255,255,0.4)" /> : <ChevronRight size={12} color="rgba(255,255,255,0.4)" />}
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", flex: 1 }}>{r.region}</span>
                        <span style={{ fontSize: 11, color: C.orange }}>{fmtN(r.viewers)} viewers</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{fmtN(r.clicks)} clicks</span>
                      </button>
                      {rOpen && (
                        <div style={{ paddingLeft: 20, marginTop: 4 }}>
                          {r.cities.map(city => (
                            <div key={city.city} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", fontSize: 11.5 }}>
                              <span style={{ color: "rgba(255,255,255,0.6)", flex: 1 }}>{city.city}</span>
                              <span style={{ color: C.orange }}>{fmtN(city.viewers)} viewers</span>
                              <span style={{ color: "rgba(255,255,255,0.4)" }}>{fmtN(city.clicks)} clicks · {fmtN(city.unique_clickers)} clickers</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
