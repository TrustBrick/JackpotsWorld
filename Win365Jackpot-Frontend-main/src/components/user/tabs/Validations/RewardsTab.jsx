import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Gift, Clock, CheckCircle, Sparkles, History, Crown, RefreshCw } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmtD, fmtDT } from "../../helpers";
import { Spinner, Btn } from "../../components/SharedUI";
import SpinWheelModal from "../../SpinWheelModal";

const REWARD_TYPE_LABELS = {
  cash_wallet_bonus: "Cash Wallet Bonus",
  casino_wallet_bonus: "Casino Wallet Bonus",
  rolling_points: "Rolling Points",
  cashback: "Cashback",
  bonus_credits: "Bonus Credits",
  merch: "Merchandise",
  gift_voucher: "Gift Voucher",
  discount_coupon: "Discount Voucher",
  event_pass: "Event Pass",
  tournament_entry: "Tournament Entry",
  jackpot_bonus: "Jackpot Bonus",
  vip_upgrade: "VIP Upgrade",
  no_reward: "No Reward",
};

const GIFT_TYPE_LABELS = {
  bonus: "Bonus", cashback: "Cashback", referral: "Referral Bonus",
  vip_upgrade: "VIP Upgrade Gift", tournament: "Tournament Prize", welcome: "Welcome Bonus",
  manual: "Manual Gift", merchandise: "Merchandise", gift_voucher: "Gift Voucher",
  discount_voucher: "Discount Voucher", spin_reward: "Spin Wheel Reward",
};

export default function RewardsTab({ onToast, onRefresh }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("spin");
  const [spinOpen, setSpinOpen] = useState(false);
  const [spinData, setSpinData] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [gifts, setGifts] = useState([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/spin/status/`);
      if (r?.ok) setSpinData(await r.json());
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await authFetch(`${API}/api/spin/history/`);
      const j = await r?.json();
      setHistory(j?.results || j || []);
    } catch {}
    setHistoryLoading(false);
  }, []);

  const loadGifts = useCallback(async () => {
    setGiftsLoading(true);
    try {
      const r = await authFetch(`${API}/api/gifts/`);
      const j = await r?.json();
      setGifts(j?.results || j || []);
    } catch {}
    setGiftsLoading(false);
  }, []);

  useEffect(() => { loadStatus(); loadHistory(); loadGifts(); }, [loadStatus, loadHistory, loadGifts]);

  const closeSpin = () => {
    setSpinOpen(false);
    loadStatus();
    loadHistory();
    loadGifts();
    onRefresh?.();
  };

  const claimGift = async (id) => {
    setClaiming(id);
    try {
      const r = await authFetch(`${API}/api/gifts/${id}/claim/`, { method: "POST" });
      const j = await r.json();
      onToast?.(j.message || j.error || (r.ok ? "Gift claimed!" : "Failed to claim gift"), r.ok);
      if (r.ok) { loadGifts(); onRefresh?.(); }
    } catch {
      onToast?.("Network error", false);
    }
    setClaiming(null);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {[["spin", "Spin Wheel", Sparkles], ["history", "Spin History", History], ["gifts", "My Gifts", Gift]].map(([m, l, Icon]) => (
          <button key={m} onClick={() => setActiveTab(m)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${activeTab === m ? `${C.gold}40` : C.border}`,
            background: activeTab === m ? `${C.gold}12` : "transparent",
            color: activeTab === m ? C.gold : "rgba(255,255,255,0.4)",
          }}>
            <Icon size={13} /> {l}
          </button>
        ))}
      </div>

      {activeTab === "spin" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", textAlign: "center" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: `radial-gradient(circle, ${C.gold}25, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
          }}>
            <Sparkles size={30} style={{ color: C.gold }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 6 }}>Daily Login Spin</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 4, maxWidth: 360 }}>
            Spin the wheel for a chance to win cash bonuses, rolling points, VIP upgrades, tournament entries, and more.
          </div>
          {spinData && (
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 20 }}>
              {spinData.spins_remaining} of {spinData.max_spins_per_month} spins remaining this month
            </div>
          )}
          <button
            onClick={() => setSpinOpen(true)}
            disabled={spinData && spinData.spins_remaining <= 0}
            style={{
              padding: "13px 40px", borderRadius: 50, fontSize: 14, fontWeight: 800,
              letterSpacing: "0.03em",
              border: "none", cursor: (!spinData || spinData.spins_remaining > 0) ? "pointer" : "not-allowed",
              background: (!spinData || spinData.spins_remaining > 0) ? `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)` : "rgba(255,255,255,0.06)",
              color: (!spinData || spinData.spins_remaining > 0) ? "#07080F" : "rgba(255,255,255,0.3)",
              boxShadow: (!spinData || spinData.spins_remaining > 0) ? `0 4px 20px ${C.gold}40` : "none",
              transition: "all 0.2s",
            }}
          >
            {spinData && spinData.spins_remaining <= 0 ? "No spins left this month" : "Spin the Wheel"}
          </button>
        </div>
      )}

      {activeTab === "history" && (
        historyLoading ? <Spinner /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 44, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No spins yet — try the Spin Wheel!</div>
            ) : history.map(h => (
              <div key={h.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 16px", borderRadius: 12,
                background: h.is_jackpot_win ? `${C.gold}0C` : "rgba(255,255,255,0.02)",
                border: `1px solid ${h.is_jackpot_win ? `${C.gold}35` : C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {h.is_jackpot_win ? <Crown size={16} style={{ color: C.gold, flexShrink: 0 }} /> : <Gift size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.reward_label_snapshot}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      {REWARD_TYPE_LABELS[h.reward_type_snapshot] || h.reward_type_snapshot} · {fmtDT(h.spun_at)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {Number(h.value_snapshot) > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: C.gold }}>{Number(h.value_snapshot).toLocaleString("en-IN")}</div>
                  )}
                  {h.needs_manual_fulfillment && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Manual follow-up</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === "gifts" && (
        giftsLoading ? <Spinner /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
            {gifts.map(g => (
              <motion.div key={g.id} layout style={{ padding: 18, borderRadius: 14, background: g.status !== "pending" ? "rgba(255,255,255,0.015)" : `${C.gold}07`, border: `1px solid ${g.status !== "pending" ? C.border : `${C.gold}28`}` }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>🎁</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  {GIFT_TYPE_LABELS[g.gift_type] || g.gift_type}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>{g.description}</div>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: g.status !== "pending" ? "rgba(255,255,255,0.25)" : C.gold, marginBottom: 12 }}>
                  {Number(g.amount || 0) > 0 ? `$${Number(g.amount).toLocaleString("en-IN")}` : "—"}
                </div>
                {g.status !== "pending" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 600, textTransform: "capitalize" }}>
                    <CheckCircle size={11} /> {g.status}
                  </div>
                ) : (
                  <Btn onClick={() => claimGift(g.id)} disabled={claiming === g.id} style={{ width: "100%", justifyContent: "center" }}>
                    <Gift size={12} />{claiming === g.id ? "Claiming…" : "Claim"}
                  </Btn>
                )}
                {g.expires_at && g.status === "pending" && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={9} /> Expires {fmtD(g.expires_at)}
                  </div>
                )}
              </motion.div>
            ))}
            {gifts.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 44, color: "rgba(255,255,255,0.4)" }}>No gifts yet</div>
            )}
          </div>
        )
      )}

      <AnimatePresence>
        {spinOpen && <SpinWheelModal onClose={closeSpin} />}
      </AnimatePresence>
    </div>
  );
}
