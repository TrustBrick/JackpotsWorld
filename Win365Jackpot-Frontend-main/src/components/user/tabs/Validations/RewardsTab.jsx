import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Gift, Clock, CheckCircle, Sparkles, History, Crown, PartyPopper } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmtD, fmtDT } from "../../helpers";
import { Spinner, Btn } from "../../components/SharedUI";
import SignupWheelModal from "../../wheel/SignupWheelModal";
import BonusWheelModal from "../../wheel/BonusWheelModal";

const REWARD_TYPE_LABELS = {
  // Current (Signup Wheel / Bonus Wheel)
  cash_bonus: "Cash Bonus", cashback: "Cashback", rolling_points: "Rolling Points",
  vip_points: "VIP Points", gift_voucher: "Gift Voucher", merchandise: "Merchandise",
  hotel_stay: "Hotel Stay", event_ticket: "Event Ticket", casino_coupon: "Casino Coupon",
  free_travel: "Free Travel", discount: "Discount", free_spins: "Free Spins",
  physical_gift: "Physical Gift", mystery_reward: "Mystery Reward", no_reward: "Try Again",
  // Legacy (retired Daily Login Spin — still shown in combined history)
  cash_wallet_bonus: "Cash Wallet Bonus", casino_wallet_bonus: "Casino Wallet Bonus",
  bonus_credits: "Bonus Credits", discount_coupon: "Discount Voucher", event_pass: "Event Pass",
  tournament_entry: "Tournament Entry", jackpot_bonus: "Jackpot Bonus", vip_upgrade: "VIP Upgrade",
};

const GIFT_TYPE_LABELS = {
  bonus: "Bonus", cashback: "Cashback", referral: "Referral Bonus",
  vip_upgrade: "VIP Upgrade Gift", tournament: "Tournament Prize", welcome: "Welcome Bonus",
  manual: "Manual Gift", merchandise: "Merchandise", gift_voucher: "Gift Voucher",
  discount_voucher: "Discount Voucher", spin_reward: "Spin Wheel Reward",
  hotel_stay: "Hotel Stay", free_travel: "Free Travel", physical_gift: "Physical Gift",
};

const SOURCE_LABEL = { signup: "Signup Wheel", bonus: "Bonus Wheel", legacy: "Daily Login Spin" };

export default function RewardsTab({ onToast, onRefresh }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("signup");
  const [signupOpen, setSignupOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [signupStatus, setSignupStatus] = useState(null);
  const [bonusGrants, setBonusGrants] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [gifts, setGifts] = useState([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);

  const loadSignupStatus = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/wheel/signup/status/`);
      if (r?.ok) setSignupStatus(await r.json());
    } catch {}
  }, []);

  const loadBonusGrants = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/wheel/bonus/available/`);
      const j = await r?.json();
      setBonusGrants(j?.results || []);
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await authFetch(`${API}/api/wheel/history/`);
      const j = await r?.json();
      setHistory(j?.results || []);
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

  useEffect(() => { loadSignupStatus(); loadBonusGrants(); loadHistory(); loadGifts(); }, [loadSignupStatus, loadBonusGrants, loadHistory, loadGifts]);

  const refreshAll = () => {
    loadSignupStatus(); loadBonusGrants(); loadHistory(); loadGifts();
    onRefresh?.();
  };
  const closeSignup = () => { setSignupOpen(false); refreshAll(); };
  const closeBonus = () => { setBonusOpen(false); refreshAll(); };

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

  const bonusCount = bonusGrants.length;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {[["signup", "Signup Wheel", Sparkles], ["bonus", "Bonus Wheel", Crown], ["history", "Wheel History", History], ["gifts", "My Gifts", Gift]].map(([m, l, Icon]) => (
          <button key={m} onClick={() => setActiveTab(m)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${activeTab === m ? `${C.gold}40` : C.border}`,
            background: activeTab === m ? `${C.gold}12` : "transparent",
            color: activeTab === m ? C.gold : "rgba(255,255,255,0.4)",
          }}>
            <Icon size={13} /> {l}{m === "bonus" && bonusCount > 0 && ` (${bonusCount})`}
          </button>
        ))}
      </div>

      {activeTab === "signup" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", textAlign: "center" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: `radial-gradient(circle, ${C.gold}25, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
          }}>
            <Sparkles size={30} style={{ color: C.gold }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 6 }}>Signup Wheel</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 4, maxWidth: 360 }}>
            A one-time welcome gift for new players — a handful of free spins within your first 30 days.
          </div>
          {signupStatus?.eligible ? (
            <>
              <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginTop: 12, marginBottom: 20 }}>
                {signupStatus.spins_remaining} spin{signupStatus.spins_remaining === 1 ? "" : "s"} remaining
              </div>
              <button
                onClick={() => setSignupOpen(true)}
                style={{
                  padding: "13px 40px", borderRadius: 50, fontSize: 14, fontWeight: 800, letterSpacing: "0.03em",
                  border: "none", cursor: "pointer",
                  background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F",
                  boxShadow: `0 4px 20px ${C.gold}40`, transition: "all 0.2s",
                }}
              >
                Spin the Wheel
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 16 }}>
              {signupStatus?.reason === "no_spins_left" && "You've used all your Signup Wheel spins."}
              {signupStatus?.reason === "window_expired" && "Your Signup Wheel window has ended."}
              {signupStatus?.reason === "disabled" && "The Signup Wheel is currently unavailable."}
              {!signupStatus && "Loading…"}
            </div>
          )}
        </div>
      )}

      {activeTab === "bonus" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", textAlign: "center" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: `radial-gradient(circle, ${C.gold}25, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
          }}>
            <Crown size={30} style={{ color: C.gold }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 6 }}>Bonus Wheel</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20, maxWidth: 360 }}>
            Granted by our team for special occasions — a VIP level-up, your birthday, a loyalty reward, and more. Check back after big wins or milestones!
          </div>
          {bonusCount > 0 ? (
            <button
              onClick={() => setBonusOpen(true)}
              style={{
                padding: "13px 40px", borderRadius: 50, fontSize: 14, fontWeight: 800, letterSpacing: "0.03em",
                border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F",
                boxShadow: `0 4px 20px ${C.gold}40`, transition: "all 0.2s",
              }}
            >
              {bonusCount} Bonus Wheel{bonusCount === 1 ? "" : "s"} Available!
            </button>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No bonus wheels available right now.</div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        historyLoading ? <Spinner /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 44, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No spins yet — try the Signup Wheel!</div>
            ) : history.map(h => (
              <div key={`${h.source}-${h.id}`} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 16px", borderRadius: 12,
                background: h.source === "bonus" ? `${C.gold}0C` : "rgba(255,255,255,0.02)",
                border: `1px solid ${h.source === "bonus" ? `${C.gold}35` : C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {h.source === "bonus" ? <Crown size={16} style={{ color: C.gold, flexShrink: 0 }} /> : <PartyPopper size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.label}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      {SOURCE_LABEL[h.source] || h.source}{h.wheel_name ? ` · ${h.wheel_name}` : ""} · {REWARD_TYPE_LABELS[h.reward_type] || h.reward_type} · {fmtDT(h.spun_at)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {Number(h.value) > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: C.gold }}>{Number(h.value).toLocaleString("en-IN")}</div>
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
        {signupOpen && <SignupWheelModal onClose={closeSignup} />}
        {bonusOpen && <BonusWheelModal onClose={closeBonus} />}
      </AnimatePresence>
    </div>
  );
}
