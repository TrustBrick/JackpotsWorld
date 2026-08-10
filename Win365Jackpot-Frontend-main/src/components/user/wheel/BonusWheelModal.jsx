import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X, Gift as GiftIcon, PartyPopper } from "lucide-react";
import { C } from "../constants";
import { authFetch, API } from "../helpers";
import WheelDisplay, { useWheelSize } from "./WheelDisplay";
import { iconFor } from "./wheelIcons";
import { playSpinTick, playWinChime } from "./wheelSound";

const GIFT_CREATING_TYPES = new Set(["gift_voucher", "merchandise", "hotel_stay", "free_travel", "physical_gift", "discount"]);

const GRANT_REASON_LABEL = {
  vip_levelup: "VIP Level-Up Reward", birthday: "Birthday Gift", loyalty: "Loyalty Reward",
  promotional: "Promotional Event", compensation: "Compensation", special_campaign: "Special Campaign",
  losing_streak: "A Little Something for You", winning_milestone: "Winning Milestone Reward", other: "Bonus Spin",
};

function fireConfetti() {
  confetti({ particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.55 }, colors: [C.gold, "#34D399", "#60A5FA"], zIndex: 400 });
}

export default function BonusWheelModal({ onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | choosing | ready | spinning | result | error
  const [grants, setGrants] = useState([]);
  const [activeGrant, setActiveGrant] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [segments, setSegments] = useState([]);
  const tickIntervalRef = useRef(null);
  const WHEEL_SIZE = useWheelSize();
  const SEG_ANGLE = segments.length ? 360 / segments.length : 0;

  const loadSegmentsFor = useCallback(async (grant) => {
    setActiveGrant(grant);
    const res = await authFetch(`${API}/api/wheel/bonus/${grant.id}/segments/`);
    const json = await res?.json();
    if (!res?.ok || !Array.isArray(json) || json.length === 0) {
      setPhase("error");
      setErrorMsg("This wheel's rewards aren't configured yet. Contact support.");
      return;
    }
    setSegments(json);
    setPhase("ready");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/wheel/bonus/available/`);
      const json = await res?.json();
      const list = json?.results || [];
      if (!res?.ok || list.length === 0) {
        setPhase("error");
        setErrorMsg("No bonus wheels available right now.");
        return;
      }
      setGrants(list);
      if (list.length === 1) await loadSegmentsFor(list[0]);
      else setPhase("choosing");
    } catch {
      setPhase("error"); setErrorMsg("Couldn't load your bonus wheels.");
    }
  }, [loadSegmentsFor]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearInterval(tickIntervalRef.current), []);

  const handleSpin = async () => {
    if (phase !== "ready" || !activeGrant) return;
    setPhase("spinning");
    let ticks = 0;
    tickIntervalRef.current = setInterval(() => { playSpinTick(); ticks += 1; if (ticks > 26) clearInterval(tickIntervalRef.current); }, 110);
    try {
      const r = await authFetch(`${API}/api/wheel/bonus/${activeGrant.id}/play/`, { method: "POST" });
      const j = await r?.json();
      if (!r?.ok) {
        clearInterval(tickIntervalRef.current);
        setPhase("error");
        setErrorMsg(j?.error || "Spin failed. Please try again.");
        return;
      }
      const reward = j.reward;
      let segIndex = segments.findIndex(s => s.id === reward.config_id);
      if (segIndex === -1) segIndex = Math.max(0, segments.findIndex(s => s.reward_type === reward.reward_type));
      const targetMidAngle = segIndex * SEG_ANGLE + SEG_ANGLE / 2;
      const finalRotation = 6 * 360 - targetMidAngle;

      setResult({ ...reward, segIndex, spins_remaining: j.spins_remaining });
      setRotation(finalRotation);
      setTimeout(() => {
        clearInterval(tickIntervalRef.current);
        setPhase("result");
        playWinChime(false);
        if (reward.reward_type !== "no_reward") fireConfetti();
      }, 3200);
    } catch {
      clearInterval(tickIntervalRef.current);
      setPhase("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  const ResultIcon = result ? iconFor(result.reward_type) : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          style={{
            width: "100%", maxWidth: 420, background: "linear-gradient(160deg, #14161f, #0a0b10)",
            border: `1px solid ${C.gold}35`, borderRadius: 20, padding: "24px 24px 28px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            position: "relative", boxShadow: `0 0 60px rgba(212,175,55,0.12), 0 20px 60px rgba(0,0,0,0.6)`,
          }}
        >
          {phase !== "spinning" && (
            <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={14} />
            </button>
          )}

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.gold, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <GiftIcon size={16} /> {activeGrant ? GRANT_REASON_LABEL[activeGrant.grant_reason] || "Bonus Spin" : "Bonus Wheel"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {activeGrant ? activeGrant.wheel_name : "You've been granted a spin — good luck!"}
            </div>
          </div>

          {phase === "error" ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{errorMsg}</div>
          ) : phase === "choosing" ? (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
              {grants.map(g => (
                <button
                  key={g.id} onClick={() => loadSegmentsFor(g)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "14px 16px", borderRadius: 12, background: "rgba(212,175,55,0.06)",
                    border: `1px solid ${C.gold}30`, color: "white", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{g.wheel_name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{GRANT_REASON_LABEL[g.grant_reason] || "Bonus Spin"}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.gold, fontFamily: "monospace" }}>{g.spins_remaining} spin{g.spins_remaining === 1 ? "" : "s"}</div>
                </button>
              ))}
            </div>
          ) : phase === "result" && result ? (
            <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} style={{ textAlign: "center", padding: "12px 0" }}>
              {result.reward_type !== "no_reward" && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                  style={{ width: 88, height: 88, borderRadius: "50%", margin: "0 auto 12px", background: `radial-gradient(circle, ${C.gold}22, transparent 70%)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 40px 6px ${C.gold}30` }}
                >
                  <ResultIcon size={40} style={{ color: C.gold, filter: `drop-shadow(0 0 8px ${C.gold})` }} />
                </motion.div>
              )}
              {result.reward_type === "no_reward" && <PartyPopper size={40} style={{ color: C.gold, marginBottom: 10 }} />}
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {result.reward_type === "no_reward" ? "So Close!" : "Congratulations!"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginTop: 4 }}>{result.label}</div>
              {result.reward_type === "no_reward" ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>No prize this time — thanks for playing!</div>
              ) : GIFT_CREATING_TYPES.has(result.reward_type) ? (
                <div style={{ fontSize: 12, color: C.gold, marginTop: 8 }}>Added to your Gifts tab — claim it any time.</div>
              ) : (
                <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>Credited to your account instantly.</div>
              )}
              {result.spins_remaining > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>{result.spins_remaining} spin{result.spins_remaining === 1 ? "" : "s"} left on this wheel.</div>
              )}
              <button onClick={onClose} style={{ marginTop: 18, padding: "10px 28px", borderRadius: 10, fontSize: 13, fontWeight: 800, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", cursor: "pointer" }}>
                {GIFT_CREATING_TYPES.has(result.reward_type) ? "Claim Reward" : "Awesome!"}
              </button>
            </motion.div>
          ) : (
            <>
              <WheelDisplay segments={segments} size={WHEEL_SIZE} rotation={rotation} phase={phase} winningIndex={result?.segIndex} onSpin={handleSpin} />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", minHeight: 16 }}>
                {phase === "loading" ? "Loading…" : phase === "spinning" ? "Good luck…" : "Tap the wheel to spin"}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
