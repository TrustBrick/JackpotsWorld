import React, { useState, useEffect, useCallback } from "react";
import { Search, Eye, X, Users as UsersIcon, Receipt } from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";
import { C, Card, Table, Tr, Td, Pagination, Select, Pill } from "../components/SharedUI";

// Kept in sync with admin/tabs/UsersTab.jsx's LEVEL_NAMES — affiliate and
// admin panels intentionally don't share components, so this is a local copy.
const LEVEL_NAMES = [
  "", "VIP", "VIP Bronze", "Silver", "Gold",
  "Jackpot I", "Jackpot II", "Jackpot III",
  "Jackpot Platinum", "Jackpot Diamond", "Master",
];

const PAGE_SIZE = 20;

export default function ReferredUsersTab() {
  const [referrals, setReferrals] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [txPlayer, setTxPlayer] = useState(null); // { id, name } — player whose transactions are being viewed

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, q, status: statusFilter });
    const res = await affiliateFetch(`${API}/api/affiliate/referrals/?${params}`);
    if (res?.ok) {
      const json = await res.json();
      setReferrals(json.results || []);
      setCount(json.count || 0);
    }
    setLoading(false);
  }, [page, q, statusFilter]);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Search + filter */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
            placeholder="Search by name, email or UID…"
            style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, background: "#0D0D0D", border: `1px solid ${C.tableBorder}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={v => { setStatusFilter(v); setPage(1); }}
          minWidth={150}
          options={[
            { value: "", label: "All Statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      </div>

      {/* Referrals table */}
      <Table
        headers={["UID", "Player", "Country", "Level", "Joined", "Status", "Earned", "Transactions"]}
        loading={loading}
        isEmpty={!loading && referrals.length === 0}
        emptyText="No referred players yet."
        emptyIcon={UsersIcon}
        minWidth={900}
        footer={<Pagination page={page} totalPages={totalPages} count={count} onChange={setPage} />}
      >
        {referrals.map((r, i) => (
          <Tr key={r.id} index={i}>
            <Td mono muted style={{ fontSize: 11 }}>{r.user_uid}</Td>
            <Td>
              <div style={{ fontWeight: 700, color: "white" }}>{r.name || r.email?.split("@")[0]}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{r.email}</div>
            </Td>
            <Td muted>{r.country || "—"}</Td>
            <Td><Pill color={C.gold}>{LEVEL_NAMES[r.user_level] || `Level ${r.user_level}`}</Pill></Td>
            <Td muted>{fmtD(r.date_joined)}</Td>
            <Td><Pill color={r.is_active ? C.green : "rgba(255,255,255,0.4)"}>{r.is_active ? "Active" : "Inactive"}</Pill></Td>
            <Td mono gold>{fmt(r.commission_earned)}</Td>
            <Td>
              <button
                onClick={() => setTxPlayer({ id: r.id, name: r.name || r.email?.split("@")[0] })}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.tableBorder}`, background: "rgba(212,175,55,0.06)", color: C.gold, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                <Eye size={12} /> View
              </button>
            </Td>
          </Tr>
        ))}
      </Table>

      {txPlayer && (
        <PlayerTransactionsModal player={txPlayer} onClose={() => setTxPlayer(null)} />
      )}
    </div>
  );
}

function PlayerTransactionsModal({ player, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await affiliateFetch(`${API}/api/affiliate/commissions/?user_id=${player.id}`);
      if (!cancelled) {
        if (res?.status === 403) {
          setForbidden(true);
        } else if (res?.ok) {
          const json = await res.json();
          setRows(json.results || []);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [player.id]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>Transactions</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{player.name}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ padding: 18 }}>
            {forbidden ? (
              <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 1.6 }}>
                Transaction visibility is not enabled for your account.<br />Contact your account manager to request access.
              </div>
            ) : (
              <Table
                headers={["Date", "Amount", "Status"]}
                loading={loading}
                isEmpty={!loading && rows.length === 0}
                emptyText="No transactions for this player yet."
                emptyIcon={Receipt}
              >
                {rows.map((row, i) => (
                  <Tr key={row.id} index={i}>
                    <Td muted>{fmtD(row.created_at)}</Td>
                    <Td mono gold>{fmt(row.amount)}</Td>
                    <Td>
                      <Pill color={row.status === "paid" ? C.green : "#FB923C"}>
                        <span style={{ textTransform: "capitalize" }}>{row.status}</span>
                      </Pill>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
