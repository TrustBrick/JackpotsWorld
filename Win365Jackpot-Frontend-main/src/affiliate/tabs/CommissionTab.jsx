import React, { useState, useEffect, useCallback } from "react";
import { HandCoins } from "lucide-react";
import { API, affiliateFetch } from "../helpers";
import { commissionTiers } from "../commissionTiers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export default function CommissionTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HandCoins size={14} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>How your commission is calculated</div>
        </div>
      </Card>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>Commission Tiers</div>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Tier", "Active Referrals", "Commission Rate"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 800, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, textShadow: "0 0 8px rgba(212,175,55,0.25)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commissionTiers.map((row, i) => (
                  <tr key={row.tier} style={{ borderBottom: i < commissionTiers.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: "white" }}>{row.tier}</td>
                    <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.6)" }}>{row.referrals}</td>
                    <td style={{ padding: "11px 14px", color: C.gold, fontWeight: 700 }}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        Tiers upgrade automatically as your active referral count grows — no action needed on your part.
      </div>
    </div>
  );
}
