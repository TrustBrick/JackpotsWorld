import React, { useState, useEffect, useCallback } from "react";
import { Percent } from "lucide-react";
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
  const [rate, setRate] = useState(null);

  const load = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/dashboard/`);
    if (res?.ok) {
      const j = await res.json();
      setRate(j.affiliate_profile?.commission_rate);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Percent size={14} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>How your commission is calculated</div>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          You earn <b style={{ color: C.gold }}>{rate != null ? `${rate}%` : "your tier's rate"}</b> of every
          referred player's real-money casino deposit — a flat percentage of the deposit amount, credited to your
          account the moment your referral deposits at any partner casino.
        </p>
      </Card>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>Commission Tiers</div>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Tier", "Active Referrals", "Commission Rate"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commissionTiers.map((row, i) => (
                  <tr key={row.tier} style={{ borderBottom: i < commissionTiers.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: "white" }}>{row.tier}</td>
                    <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.6)" }}>{row.referrals}</td>
                    <td style={{ padding: "11px 14px", color: C.gold, fontWeight: 700 }}>{row.rate}</td>
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
