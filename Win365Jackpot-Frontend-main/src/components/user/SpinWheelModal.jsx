import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X, Sparkles, PartyPopper, Crown } from "lucide-react";
import { C } from "./constants";
import { authFetch, API } from "./helpers";

// Mirrors the backend's REWARD_TYPE_CHOICES (spin_models.py) — the wheel is
// purely decorative; the backend has already decided the real outcome
// before the spin animation ever starts (see handleSpin), so there's no
// client-side RNG or exploit surface here.
const SEGMENTS = [
  { type: "cash_wallet_bonus", label: "Cash Bonus", color: C.green },
  { type: "casino_wallet_bonus", label: "Casino Bonus", color: C.blue },
  { type: "rolling_points", label: "Rolling Pts", color: C.gold },
  { type: "cashback", label: "Cashback", color: C.orange },
  { type: "bonus_credits", label: "Bonus Credits", color: C.purple },
  { type: "merch", label: "Merch", color: C.pink },
  { type: "gift_voucher", label: "Gift Voucher", color: "#34D399" },
  { type: "discount_coupon", label: "Voucher", color: "#60A5FA" },
  { type: "event_pass", label: "Event Pass", color: C.teal },
  { type: "tournament_entry", label: "Tournament", color: "#8B5CF6" },
  { type: "vip_upgrade", label: "VIP Upgrade", color: "#EC4899" },
  { type: "jackpot_bonus", label: "JACKPOT", color: C.red },
  { type: "no_reward", label: "Try Again", color: "rgba(255,255,255,0.15)" },
];
const SEG_ANGLE = 360 / SEGMENTS.length;
const WHEEL_SIZE_MAX = 260;
const WHEEL_SIZE_MIN = 200;
// Modal card is `maxWidth:420` with 24px padding, inside an overlay with
// 20px padding — on the narrowest supported viewports (320px) the fixed
// 260px wheel doesn't fit that content box and bled a few px past the
// card's edge. Shrink it down to fit below ~396px; unchanged everywhere else.
function useWheelSize() {
  const [size, setSize] = useState(() =>
    typeof window === "undefined" ? WHEEL_SIZE_MAX : Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, window.innerWidth - 88))
  );
  useEffect(() => {
    const onResize = () => setSize(Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, window.innerWidth - 88)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function buildConicGradient() {
  const stops = SEGMENTS.map((s, i) => `${s.color} ${i * SEG_ANGLE}deg ${(i + 1) * SEG_ANGLE}deg`);
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

// ─── Synthesized sound effects (Web Audio API — no binary assets needed) ────
let _audioCtx = null;
function getAudioCtx() {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  return _audioCtx;
}
function playTone(freq, duration, delay = 0, type = "sine", peakGain = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startAt = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}
function playSpinTick() { playTone(320, 0.06, 0, "square", 0.03); }
function playWinChime(isJackpot) {
  const notes = isJackpot ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
  notes.forEach((f, i) => playTone(f, 0.35, i * 0.11, "triangle", isJackpot ? 0.1 : 0.07));
}

function fireConfetti(isJackpot) {
  const colors = isJackpot ? ["#D4AF37", "#F87171", "#FFFFFF"] : ["#D4AF37", "#34D399", "#60A5FA"];
  confetti({
    particleCount: isJackpot ? 160 : 80,
    spread: isJackpot ? 100 : 70,
    startVelocity: isJackpot ? 55 : 40,
    origin: { y: 0.55 },
    colors,
    zIndex: 400,
  });
  if (isJackpot) {
    setTimeout(() => confetti({ particleCount: 100, spread: 120, startVelocity: 45, origin: { y: 0.4 }, colors, zIndex: 400 }), 250);
  }
}

export default function SpinWheelModal({ onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | spinning | result | error
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const tickIntervalRef = useRef(null);
  const WHEEL_SIZE = useWheelSize();

  const checkStatus = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/spin/status/`);
      const j = await r?.json();
      if (typeof j?.sound_enabled === "boolean") setSoundEnabled(j.sound_enabled);
      if (r?.ok && j?.spins_remaining > 0) setPhase("ready");
      else { setPhase("error"); setErrorMsg("No spins remaining this month."); }
    } catch {
      setPhase("error"); setErrorMsg("Couldn't load spin status.");
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);
  useEffect(() => () => clearInterval(tickIntervalRef.current), []);

  const handleSpin = async () => {
    if (phase !== "ready") return; // belt-and-braces guard against double-fire on top of `disabled`
    setPhase("spinning");
    if (soundEnabled) {
      let ticks = 0;
      tickIntervalRef.current = setInterval(() => { playSpinTick(); ticks += 1; if (ticks > 26) clearInterval(tickIntervalRef.current); }, 110);
    }
    try {
      const r = await authFetch(`${API}/api/spin/play/`, { method: "POST" });
      const j = await r?.json();
      if (!r?.ok) {
        clearInterval(tickIntervalRef.current);
        setPhase("error");
        setErrorMsg(j?.error || "Spin failed. Please try again.");
        return;
      }
      const reward = j.reward;
      const segIndex = Math.max(0, SEGMENTS.findIndex(s => s.type === reward.reward_type));
      const targetMidAngle = segIndex * SEG_ANGLE + SEG_ANGLE / 2;
      const fullTurns = 6;
      const finalRotation = fullTurns * 360 - targetMidAngle;

      setResult({ ...reward, segIndex });
      setRotation(finalRotation);
      // Reveal the result once the spin animation (3s, see motion.div below) settles.
      setTimeout(() => {
        clearInterval(tickIntervalRef.current);
        setPhase("result");
        if (soundEnabled) playWinChime(reward.is_jackpot);
        if (reward.reward_type !== "no_reward") fireConfetti(reward.is_jackpot);
      }, 3200);
    } catch {
      clearInterval(tickIntervalRef.current);
      setPhase("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          style={{
            width: "100%", maxWidth: 420, background: "linear-gradient(160deg, #14161f, #0a0b10)",
            border: `1px solid ${C.gold}35`, borderRadius: 20, padding: "24px 24px 28px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            position: "relative", boxShadow: `0 0 60px rgba(212,175,55,0.12), 0 20px 60px rgba(0,0,0,0.6)`,
          }}
        >
          {phase !== "spinning" && (
            <button
              onClick={onClose}
              style={{
                position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: 8,
                background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                color: "rgba(255,255,255,0.4)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={14} />
            </button>
          )}

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.gold, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <Sparkles size={16} /> Daily Login Spin
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              Spin for a chance at exclusive rewards — good luck!
            </div>
          </div>

          {phase === "error" ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              {errorMsg}
            </div>
          ) : phase === "result" && result ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              style={{ textAlign: "center", padding: "12px 0" }}
            >
              {result.is_jackpot ? (
                <Crown size={44} style={{ color: C.gold, marginBottom: 10, filter: `drop-shadow(0 0 12px ${C.gold})` }} />
              ) : (
                <PartyPopper size={40} style={{ color: C.gold, marginBottom: 10 }} />
              )}
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {result.is_jackpot ? "🏆 JACKPOT WIN!" : result.reward_type === "no_reward" ? "So Close!" : "Congratulations!"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginTop: 4 }}>
                {result.label}
              </div>
              {result.reward_type === "no_reward" ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
                  Better luck on your next spin!
                </div>
              ) : result.needs_manual_fulfillment ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
                  Our team will contact you to arrange this prize.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>
                  Credited to your account instantly.
                </div>
              )}
              <button
                onClick={onClose}
                style={{
                  marginTop: 18, padding: "10px 28px", borderRadius: 10, fontSize: 13, fontWeight: 800,
                  background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F",
                  border: "none", cursor: "pointer",
                }}
              >
                Awesome!
              </button>
            </motion.div>
          ) : (
            <>
              <div style={{ position: "relative", width: WHEEL_SIZE, height: WHEEL_SIZE }}>
                {/* Ambient glow ring behind the wheel */}
                <motion.div
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    position: "absolute", inset: -14, borderRadius: "50%",
                    background: `radial-gradient(circle, ${C.gold}30, transparent 70%)`,
                    filter: "blur(6px)", zIndex: 0,
                  }}
                />
                {/* Pointer */}
                <div style={{
                  position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
                  width: 0, height: 0, zIndex: 3,
                  borderLeft: "10px solid transparent", borderRight: "10px solid transparent",
                  borderTop: `16px solid ${C.gold}`, filter: `drop-shadow(0 0 4px ${C.gold})`,
                }} />
                <motion.div
                  animate={{ rotate: rotation }}
                  transition={{ duration: 3, ease: [0.17, 0.67, 0.32, 1] }}
                  style={{
                    width: WHEEL_SIZE, height: WHEEL_SIZE, borderRadius: "50%",
                    background: buildConicGradient(),
                    border: `4px solid ${C.gold}`,
                    boxShadow: `0 0 36px rgba(212,175,55,0.45), inset 0 0 20px rgba(0,0,0,0.35)`,
                    position: "relative", zIndex: 1,
                  }}
                >
                  {SEGMENTS.map((s, i) => {
                    const mid = i * SEG_ANGLE + SEG_ANGLE / 2;
                    return (
                      <div
                        key={s.type}
                        style={{
                          position: "absolute", top: "50%", left: "50%", width: 0, height: 0,
                          transform: `rotate(${mid}deg)`,
                        }}
                      >
                        <span style={{
                          position: "absolute", left: 0, top: -WHEEL_SIZE / 2 + 22,
                          transform: "translateX(-50%)",
                          fontSize: 8.5, fontWeight: 800, color: s.type === "no_reward" ? "rgba(255,255,255,0.5)" : "#07080F",
                          whiteSpace: "nowrap", letterSpacing: "0.02em",
                        }}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}

                  {/* Premium center hub — this IS the spin button */}
                  <button
                    onClick={handleSpin}
                    disabled={phase !== "ready"}
                    aria-label="Spin the wheel"
                    style={{
                      position: "absolute", inset: 0, margin: "auto",
                      width: 56, height: 56, borderRadius: "50%",
                      background: phase === "ready"
                        ? `linear-gradient(135deg, ${C.gold}, #B8941E)`
                        : "linear-gradient(135deg, #2a2a32, #1a1a20)",
                      border: `3px solid ${phase === "ready" ? C.gold : C.border}`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      cursor: phase === "ready" ? "pointer" : "not-allowed",
                      boxShadow: phase === "ready" ? `0 0 20px rgba(212,175,55,0.6)` : "none",
                      transition: "all 0.2s", padding: 0,
                    }}
                  >
                    <Sparkles size={16} style={{ color: phase === "ready" ? "#07080F" : "rgba(255,255,255,0.3)" }} />
                    <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.05em", color: phase === "ready" ? "#07080F" : "rgba(255,255,255,0.3)", marginTop: 1 }}>
                      {phase === "spinning" ? "…" : "SPIN"}
                    </span>
                  </button>
                </motion.div>
              </div>

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
