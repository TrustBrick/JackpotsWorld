import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Gift } from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";

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

const PAGE_SIZE = 20;

// Each type maps to an endpoint + the columns to render for its rows.
const TYPES = {
  login: {
    label: "Login History",
    endpoint: "/api/affiliate/login-history/",
    columns: ["Date", "IP Address"],
    row: r => [fmtD(r.created_at), r.ip_address || "—"],
  },
  clicks: {
    label: "Referral Clicks",
    endpoint: "/api/affiliate/clicks/",
    columns: ["Date", "Landing Page"],
    row: r => [fmtD(r.created_at), r.landing_path || "/"],
  },
  commission: {
    label: "Commission History",
    endpoint: "/api/affiliate/commissions/",
    columns: ["Date", "Referred User", "Deposit", "Commission", "Status"],
    row: r => [
      fmtD(r.created_at), r.referred_user_name || r.referred_user_email,
      fmt(r.deposit_amount), fmt(r.amount),
      r.status === "paid" ? "Paid" : "Pending",
    ],
  },
  withdrawal: {
    label: "Withdrawal History",
    endpoint: "/api/affiliate/commissions/?status=paid",
    columns: ["Date Paid", "Referred User", "Amount"],
    row: r => [fmtD(r.paid_at), r.referred_user_name || r.referred_user_email, fmt(r.amount)],
  },
  bonus: {
    label: "Bonus Rewards",
    endpoint: null,
    columns: ["Date", "Reward"],
    row: () => [],
  },
};

export default function ActivityTab() {
  const [type, setType] = useState("commission");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const cfg = TYPES[type];

  const load = useCallback(async () => {
    if (!cfg.endpoint) { setRows([]); setCount(0); setLoading(false); return; }
    setLoading(true);
    const sep = cfg.endpoint.includes("?") ? "&" : "?";
    const res = await affiliateFetch(`${API}${cfg.endpoint}${sep}page=${page}`);
    if (res?.ok) {
      const json = await res.json();
      setRows(json.results || []);
      setCount(json.count || 0);
    }
    setLoading(false);
  }, [cfg, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(TYPES).map(([id, t]) => (
          <button
            key={id}
            onClick={() => { setType(id); setPage(1); }}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
              border: type === id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: type === id ? `${C.gold}15` : "transparent",
              color: type === id ? C.gold : "rgba(255,255,255,0.4)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {cfg.columns.map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {type === "bonus" ? (
                <tr>
                  <td colSpan={cfg.columns.length} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.25)" }}>
                    <Gift size={22} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <div>No bonus rewards yet — coming soon.</div>
                  </td>
                </tr>
              ) : loading ? (
                <tr><td colSpan={cfg.columns.length} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={cfg.columns.length} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No {cfg.label.toLowerCase()} yet.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  {cfg.row(r).map((cell, i) => (
                    <td key={i} style={{ padding: "11px 14px", color: i === 0 ? "rgba(255,255,255,0.5)" : "white" }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cfg.endpoint && totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Page {page} of {totalPages} · {count} total</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ width: 28, height: 28, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: page <= 1 ? "rgba(255,255,255,0.15)" : "white", cursor: page <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                style={{ width: 28, height: 28, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: page >= totalPages ? "rgba(255,255,255,0.15)" : "white", cursor: page >= totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
