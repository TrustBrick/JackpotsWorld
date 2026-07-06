import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Trophy, Building2, CheckCircle } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmt, fmtN, fmtD } from "../../helpers";
import { Card, Btn, Spinner, StatusBadge, Pagination } from "../../components/SharedUI";

export default function BonusTab({ profile, onToast, onRefresh }) {
  const [history, setHistory]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [claiming, setClaiming]       = useState(false);
  const [page, setPage]               = useState(1);
  const [total, setTotal]             = useState(0);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const PER_PAGE = 10;

  const bonusBalance    = Number(profile?.bonus_balance || 0);
  const CLAIM_THRESHOLD = 1500;
  const canClaim        = bonusBalance >= CLAIM_THRESHOLD;
  const progress        = Math.min((bonusBalance / CLAIM_THRESHOLD) * 100, 100);

  useEffect(() => { loadHistory(page); }, [page]);

  const loadHistory = async (pg = 1) => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/api/bonus/history/?page=${pg}&page_size=${PER_PAGE}`);
      const j = await r.json();
      setHistory(j.results || []);
      setTotal(j.count || 0);
    } catch { setHistory([]); }
    setLoading(false);
  };

  const claimBonus = async () => {
    if (!canClaim) return;
    setClaiming(true);
    try {
      const r = await authFetch(`${API}/api/bonus/claim/`, { method: "POST" });
      const j = await r.json();
      if (r.ok) { setClaimSuccess(true); onRefresh(); loadHistory(1); }
      else onToast(j.error || "Claim failed", false);
    } catch { onToast("Something went wrong", false); }
    setClaiming(false);
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Bonus Balance",      value: fmt(bonusBalance),                   icon: Gift,      color: C.purple },
          { label: "Total Bonus Earned", value: fmt(profile?.total_bonus_earned),    icon: Trophy,    color: C.gold   },
          { label: "Casinos Visited",    value: fmtN(profile?.casinos_visited || 0), icon: Building2, color: C.blue   },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <s.icon size={15} style={{ color: s.color }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Claim card */}
      <Card style={{
        marginBottom: 22,
        background: canClaim ? `linear-gradient(135deg, ${C.gold}12, ${C.gold}03)` : C.surface,
        border: `1px solid ${canClaim ? `${C.gold}40` : C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>Claim Bonus Points</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
              {canClaim
                ? "🎉 Threshold reached! Claim $1,500 to be credited on your next casino deposit."
                : `Need ${fmt(CLAIM_THRESHOLD - bonusBalance)} more to reach the claim threshold.`}
            </div>
          </div>
          {canClaim && <CheckCircle size={26} style={{ color: C.gold, flexShrink: 0, marginLeft: 16 }} />}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 5 }}>
            <span>{fmt(bonusBalance)} accumulated</span>
            <span style={{ color: canClaim ? C.gold : "rgba(255,255,255,0.35)" }}>Goal: {fmt(CLAIM_THRESHOLD)}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{ height: "100%", borderRadius: 4, background: canClaim ? `linear-gradient(90deg, ${C.gold}70, ${C.gold})` : `linear-gradient(90deg, ${C.purple}70, ${C.purple})` }}
            />
          </div>
        </div>

        <Btn
          onClick={claimBonus}
          disabled={!canClaim || claiming}
          color={canClaim ? C.gold : "rgba(255,255,255,0.15)"}
          style={{ width: "100%", justifyContent: "center", opacity: canClaim ? 1 : 0.5 }}
        >
          <Gift size={13} />
          {claiming ? "Submitting…" : canClaim ? "Claim $1,500 Bonus" : `Locked — Need ${fmt(CLAIM_THRESHOLD - bonusBalance)} more`}
        </Btn>
      </Card>

      {/* History table */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 10 }}>Bonus History</div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Txn ID", "Date", "Bonus Added", "Deposit Amount", "Note", "Status"].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.25)" }}>Loading…</td></tr>
            ) : history.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 36, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No bonus transactions yet</td></tr>
            ) : history.map(item => (
              <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "11px 14px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, background: `${C.blue}12`, color: C.blue, border: `1px solid ${C.blue}25`, borderRadius: 5, padding: "2px 7px" }}>
                    {item.txn_id || String(item.id).padStart(10, "0")}
                  </span>
                </td>
                <td style={{ padding: "11px 14px", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{fmtD(item.created_at)}</td>
                <td style={{ padding: "11px 14px", fontFamily: "monospace", fontWeight: 700, color: C.purple }}>+{fmt(item.bonus_amount || item.amount)}</td>
                <td style={{ padding: "11px 14px", fontFamily: "monospace", fontWeight: 700, color: C.gold }}>{fmt(item.deposit_amount || 0)}</td>
                <td style={{ padding: "11px 14px", fontSize: 10, color: "rgba(255,255,255,0.4)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.note || "—"}</td>
                <td style={{ padding: "11px 14px" }}><StatusBadge status={item.status || "completed"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} perPage={PER_PAGE} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
      </Card>

      {/* Claim success modal */}
      <AnimatePresence>
        {claimSuccess && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setClaimSuccess(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000 }} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: "100%", maxWidth: 380, padding: "0 20px" }}>
              <Card style={{ padding: 30, textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Claim Submitted!</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 22 }}>
                  Your claim of <b style={{ color: "white" }}>$1,500</b> is submitted.<br />
                  Our team will contact you within <b style={{ color: C.green }}>12–24 hours</b> via WhatsApp or call.
                </div>
                <Btn onClick={() => setClaimSuccess(false)} style={{ width: "100%", justifyContent: "center" }}>
                  <CheckCircle size={13} /> Got it!
                </Btn>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}