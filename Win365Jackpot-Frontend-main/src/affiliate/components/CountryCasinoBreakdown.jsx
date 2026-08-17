import React, { useEffect, useState } from "react";
import { Globe2, Users, CheckCircle2 } from "lucide-react";
import { API, affiliateFetch, fmt } from "../helpers";
import { C, Card } from "./SharedUI";

/**
 * CountryCasinoBreakdown — the Part 40 affiliate view of the Country+Casino
 * commission engine. Rendered above the existing Commission Slip and only
 * when this affiliate actually has rule-engine earnings, so an affiliate
 * still on a plan or the flat rate sees their tab exactly as before.
 *
 * Every figure comes from /api/affiliate/commissions/summary/, which is
 * scoped server-side to the requesting affiliate and deliberately excludes
 * rule internals — an affiliate sees what they earned, never how the rules
 * are configured.
 */
export default function CountryCasinoBreakdown() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    affiliateFetch(`${API}/api/affiliate/commissions/summary/`)
      .then(r => (r?.ok ? r.json() : null))
      .then(j => { if (!cancelled && j) setData(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rows = (data?.breakdown || []).filter(r => Number(r.amount) > 0 || r.count > 0);
  if (!data || rows.length === 0) return null;

  const perf = data.performance || {};

  return (
    <Card style={{ background: `${C.gold}06`, border: `1px solid ${C.gold}22` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Globe2 size={14} style={{ color: C.gold }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Country &amp; Casino Commissions</div>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
        Your earnings under country and casino specific commission rates.
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Users size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Referred: <b style={{ color: "white" }}>{perf.referred_players ?? 0}</b>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <CheckCircle2 size={13} style={{ color: C.green }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Qualified: <b style={{ color: "white" }}>{perf.qualified_players ?? 0}</b>
          </span>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          Total earned: <b style={{ color: C.gold, fontFamily: "monospace" }}>{fmt(data.total_earned)}</b>
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((row, i) => (
          <div
            key={`${row.country}-${row.casino}-${i}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "9px 12px", borderRadius: 9,
              background: "rgba(255,255,255,0.03)", border: `1px solid ${C.tableBorder}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "white" }}>{row.country}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{row.casino}</div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, fontFamily: "monospace" }}>
                {fmt(row.amount)}
              </div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>
                {row.count} commission{row.count === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
