import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X, Sparkles, PartyPopper } from "lucide-react";
import { C } from "../constants";
import { authFetch, API } from "../helpers";
import WheelDisplay, { useWheelSize } from "./WheelDisplay";
import { iconFor } from "./wheelIcons";
import { playSpinTick, playWinChime } from "./wheelSound";

// Reward types that create a pending UserGift (see
// authapp/services/wheel_service.py's dispatch) rather than crediting
// instantly — the result popup's copy reflects that instead of "Awesome!".
const GIFT_CREATING_TYPES = new Set(["gift_voucher", "merchandise", "hotel_stay", "free_travel", "physical_gift", "discount"]);

function fireConfetti() {
  confetti({
    particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.55 },
    colors: [C.gold, "#34D399", "#60A5FA"], zIndex: 400,
  });
}

export default function SignupWheelModal({ onClose }) {
  const [phase, setPhase] = useState("loading");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [segments, setSegments] = useState([]);
  const tickIntervalRef = useRef(null);
  const WHEEL_SIZE = useWheelSize();
  const SEG_ANGLE = segments.length ? 360 / segments.length : 0;

  const load = useCallback(async () => {
    try {
      const [statusRes, segmentsRes] = await Promise.all([
        authFetch(`${API}/api/wheel/signup/status/`),
        authFetch(`${API}/api/wheel/signup/segments/`),
      ]);
      const statusJson = await statusRes?.json();
      const segmentsJson = await segmentsRes?.json();

      if (!segmentsRes?.ok || !Array.isArray(segmentsJson) || segmentsJson.length === 0) {
        setPhase("error");
        setErrorMsg("Spin rewards are not configured yet. Contact support.");
        return;
      }
      setSegments(segmentsJson);

      if (statusJson?.eligible) setPhase("ready");
      else {
        const messages = {
          disabled: "The Signup Wheel is currently unavailable.",
          window_expired: "Your Signup Wheel window has expired.",
          no_spins_left: "You've used all your Signup Wheel spins.",
        };
        setPhase("error");
        setErrorMsg(messages[statusJson?.reason] || "You're not eligible to spin right now.");
      }
    } catch {
      setPhase("error"); setErrorMsg("Couldn't load the Signup Wheel.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearInterval(tickIntervalRef.current), []);

  const handleSpin = async () => {
    if (phase !== "ready") return;
    setPhase("spinning");
    let ticks = 0;
    tickIntervalRef.current = setInterval(() => { playSpinTick(); ticks += 1; if (ticks > 26) clearInterval(tickIntervalRef.current); }, 110);
    try {
      const r = await authFetch(`${API}/api/wheel/signup/play/`, { method: "POST" });
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

      setResult({ ...reward, segIndex });
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
              <Sparkles size={16} /> Welcome Spin
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              A one-time welcome gift — good luck!
            </div>
          </div>

          {phase === "error" ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{errorMsg}</div>
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
