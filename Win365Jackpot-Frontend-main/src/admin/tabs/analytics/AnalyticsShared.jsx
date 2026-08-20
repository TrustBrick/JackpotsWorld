// src/admin/tabs/analytics/AnalyticsShared.jsx
//
// ANALYTICS: shared building blocks for the Admin Analytics tabs. Hand-rolled
// KPI tiles and CSS/SVG bars in the existing dark/gold admin style — no chart
// dependency is added (the project has none, and the approved decision was to
// match the existing look). Every value shown is passed in from a real API
// response; there is no placeholder data anywhere here.
import React from "react";
import { C } from "../../constants";

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
