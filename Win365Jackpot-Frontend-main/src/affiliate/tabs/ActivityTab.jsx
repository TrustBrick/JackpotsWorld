import React, { useState, useEffect, useCallback } from "react";
import { Gift, History } from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";
import { C, Table, Tr, Td, Pagination } from "../components/SharedUI";

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
  const isBonus = type === "bonus";

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

      <Table
        headers={cfg.columns}
        loading={!isBonus && loading}
        isEmpty={isBonus || (!loading && rows.length === 0)}
        emptyText={isBonus ? "No bonus rewards yet — coming soon." : `No ${cfg.label.toLowerCase()} yet.`}
        emptyIcon={isBonus ? Gift : History}
        footer={cfg.endpoint && <Pagination page={page} totalPages={totalPages} count={count} onChange={setPage} />}
      >
        {!isBonus && rows.map((r, ri) => (
          <Tr key={r.id} index={ri}>
            {cfg.row(r).map((cell, i) => (
              <Td key={i} muted={i === 0}>{cell}</Td>
            ))}
          </Tr>
        ))}
      </Table>
    </div>
  );
}
