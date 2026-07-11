import React, { useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Eye, X } from "lucide-react";
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
            style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(12,14,22,0.95)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none" }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Referrals table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Player", "Joined", "Status", "Earned", "Transactions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>Loading…</td></tr>
              ) : referrals.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No referred players yet.</td></tr>
              ) : referrals.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontWeight: 700, color: "white" }}>{r.name || r.email?.split("@")[0]}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{r.email} · {r.user_uid}</div>
                  </td>
                  <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.5)" }}>{fmtD(r.date_joined)}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: r.is_active ? `${C.green}15` : "rgba(255,255,255,0.05)", color: r.is_active ? C.green : "rgba(255,255,255,0.4)" }}>
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.gold, fontWeight: 700 }}>{fmt(r.commission_earned)}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <button
                      onClick={() => setTxPlayer({ id: r.id, name: r.name || r.email?.split("@")[0] })}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: "white", fontSize: 11, cursor: "pointer" }}
                    >
                      <Eye size={12} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
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

      {txPlayer && (
        <PlayerTransactionsModal player={txPlayer} onClose={() => setTxPlayer(null)} />
      )}
    </div>
  );
}

function PlayerTransactionsModal({ player, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await affiliateFetch(`${API}/api/affiliate/commissions/?user_id=${player.id}`);
      if (res?.ok && !cancelled) {
        const json = await res.json();
        setRows(json.results || []);
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
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
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
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>No transactions for this player yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Date", "Amount", "Status"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.5)" }}>{fmtD(row.created_at)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: C.gold, fontWeight: 700 }}>{fmt(row.amount)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: row.status === "paid" ? `${C.green}15` : "rgba(251,146,60,0.15)", color: row.status === "paid" ? C.green : "#FB923C", textTransform: "capitalize" }}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
