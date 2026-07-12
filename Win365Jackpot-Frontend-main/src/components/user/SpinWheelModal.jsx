import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  X, Sparkles, PartyPopper, Crown, Gift, DollarSign, Coins, TrendingUp,
  Percent, CreditCard, Award, Ticket, RotateCcw, Calendar,
} from "lucide-react";
import { C } from "./constants";
import { authFetch, API } from "./helpers";

// Mirrors the backend's REWARD_TYPE_CHOICES (spin_models.py) — the wheel is
// purely decorative; the backend has already decided the real outcome
// before the spin animation ever starts (see handleSpin), so there's no
// client-side RNG or exploit surface here. Segments themselves are fetched
// from GET /api/spin/wheel/ (admin-configured, see SpinWheelSegmentsView) —
// this is only the color cycle + icon fallback used to render whatever the
// backend returns, not the reward list itself.
const SEGMENT_COLORS = [C.gold, C.green, C.blue, C.orange, C.purple, C.pink, C.teal, C.red];
const REWARD_TYPE_ICONS = {
  cash_wallet_bonus: DollarSign,
  casino_wallet_bonus: DollarSign,
  rolling_points: TrendingUp,
  cashback: Percent,
  bonus_credits: CreditCard,
  merch: Gift,
  gift_voucher: Gift,
  discount_coupon: Ticket,
  event_pass: Calendar,
  tournament_entry: Award,
  vip_upgrade: Crown,
  jackpot_bonus: Coins,
  no_reward: RotateCcw,
};
function segmentColor(reward_type, index) {
  return reward_type === "no_reward" ? "rgba(255,255,255,0.15)" : SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}
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

function buildConicGradient(segments, segAngle) {
  const stops = segments.map((s, i) =>
    `${segmentColor(s.reward_type, i)} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
  );
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

// Reward types that create a pending UserGift (see spin_views.py's
// GIFT_TYPE_MAP) — these need a follow-up visit to the Gifts tab to claim,
// so the result popup's button copy reflects that instead of "Awesome!".
const GIFT_CREATING_TYPES = new Set(["merch", "gift_voucher", "discount_coupon"]);

export default function SpinWheelModal({ onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | spinning | result | error
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [segments, setSegments] = useState([]);
  const tickIntervalRef = useRef(null);
  const WHEEL_SIZE = useWheelSize();
  const SEG_ANGLE = segments.length ? 360 / segments.length : 0;

  const loadWheel = useCallback(async () => {
    try {
      const [statusRes, segmentsRes] = await Promise.all([
        authFetch(`${API}/api/spin/status/`),
        authFetch(`${API}/api/spin/wheel/`),
      ]);
      const statusJson = await statusRes?.json();
      const segmentsJson = await segmentsRes?.json();
      if (typeof statusJson?.sound_enabled === "boolean") setSoundEnabled(statusJson.sound_enabled);

      if (!segmentsRes?.ok || !Array.isArray(segmentsJson) || segmentsJson.length === 0) {
        setPhase("error");
        setErrorMsg("Spin rewards are not configured yet. Contact support.");
        return;
      }
      setSegments(segmentsJson);

      if (statusRes?.ok && statusJson?.spins_remaining > 0) setPhase("ready");
      else { setPhase("error"); setErrorMsg("No spins remaining this month."); }
    } catch {
      setPhase("error"); setErrorMsg("Couldn't load the spin wheel.");
    }
  }, []);

  useEffect(() => { loadWheel(); }, [loadWheel]);
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
      // Match on the exact config row (not reward_type — admin-defined tiers
      // can share a type, e.g. two different cash-bonus amounts).
      let segIndex = segments.findIndex(s => s.id === reward.config_id);
      if (segIndex === -1) segIndex = Math.max(0, segments.findIndex(s => s.reward_type === reward.reward_type));
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
              {result.reward_type !== "no_reward" && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                  style={{
                    width: 88, height: 88, borderRadius: "50%", margin: "0 auto 12px",
                    background: `radial-gradient(circle, ${C.gold}22, transparent 70%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 0 40px 6px ${C.gold}30`,
                  }}
                >
                  {result.image_url ? (
                    <img
                      src={result.image_url} alt={result.label}
                      style={{ width: 64, height: 64, objectFit: "contain", filter: `drop-shadow(0 0 10px ${C.gold}90)` }}
                      onError={e => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    (() => {
                      const Icon = REWARD_TYPE_ICONS[result.reward_type] || Gift;
                      return <Icon size={40} style={{ color: C.gold, filter: `drop-shadow(0 0 8px ${C.gold})` }} />;
                    })()
                  )}
                </motion.div>
              )}
              {result.is_jackpot ? (
                <Crown size={result.reward_type === "no_reward" ? 44 : 22} style={{ color: C.gold, marginBottom: 6, filter: `drop-shadow(0 0 12px ${C.gold})` }} />
              ) : result.reward_type === "no_reward" ? (
                <PartyPopper size={40} style={{ color: C.gold, marginBottom: 10 }} />
              ) : null}
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {result.is_jackpot ? "🏆 JACKPOT WIN!" : result.reward_type === "no_reward" ? "So Close!" : "Congratulations!"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginTop: 4 }}>
                {result.label}
              </div>
              {result.description && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6, lineHeight: 1.6, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
                  {result.description}
                </div>
              )}
              {result.reward_type === "no_reward" ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
                  Better luck on your next spin!
                </div>
              ) : result.needs_manual_fulfillment ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
                  Our team will contact you to arrange this prize.
                </div>
              ) : GIFT_CREATING_TYPES.has(result.reward_type) ? (
                <div style={{ fontSize: 12, color: C.gold, marginTop: 8 }}>
                  Added to your Gifts tab — claim it any time.
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
                {GIFT_CREATING_TYPES.has(result.reward_type) ? "Claim Reward" : "Awesome!"}
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
                    background: buildConicGradient(segments, SEG_ANGLE),
                    border: `4px solid ${C.gold}`,
                    boxShadow: `0 0 36px rgba(212,175,55,0.45), inset 0 0 20px rgba(0,0,0,0.35)`,
                    position: "relative", zIndex: 1,
                  }}
                >
                  {/* Radial divider lines between segments — premium wheel look */}
                  {segments.map((s, i) => (
                    <div
                      key={`div-${s.id}`}
                      style={{
                        position: "absolute", top: "50%", left: "50%",
                        width: "50%", height: 1.5,
                        background: "rgba(7,8,15,0.35)",
                        transformOrigin: "0 50%",
                        transform: `rotate(${i * SEG_ANGLE}deg)`,
                      }}
                    />
                  ))}

                  {segments.map((s, i) => {
                    const mid = i * SEG_ANGLE + SEG_ANGLE / 2;
                    const isNoReward = s.reward_type === "no_reward";
                    const Icon = REWARD_TYPE_ICONS[s.reward_type] || Gift;
                    const iconColor = isNoReward ? "rgba(255,255,255,0.5)" : "#07080F";
                    return (
                      <div
                        key={s.id}
                        style={{
                          position: "absolute", top: "50%", left: "50%", width: 0, height: 0,
                          transform: `rotate(${mid}deg)`,
                        }}
                      >
                        <div style={{
                          position: "absolute", left: 0, top: -WHEEL_SIZE / 2 + 26,
                          transform: "translateX(-50%)",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          width: Math.max(46, SEG_ANGLE * 1.4),
                        }}>
                          {s.image ? (
                            <img
                              src={s.image} alt={s.label}
                              style={{ width: 20, height: 20, objectFit: "contain" }}
                              onError={e => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : (
                            <Icon size={13} style={{ color: iconColor }} />
                          )}
                          <span style={{
                            fontSize: 7.5, fontWeight: 800, color: iconColor,
                            whiteSpace: "nowrap", letterSpacing: "0.02em", textAlign: "center",
                            overflow: "hidden", textOverflow: "ellipsis", maxWidth: Math.max(46, SEG_ANGLE * 1.4),
                          }}>
                            {s.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Winning-segment highlight — brief glowing pulse once the spin settles */}
                  {phase === "result" && result && result.segIndex >= 0 && segments[result.segIndex] && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.6, 1] }}
                      transition={{ duration: 1.2, repeat: 2 }}
                      style={{
                        position: "absolute", top: "50%", left: "50%", width: 0, height: 0,
                        transform: `rotate(${result.segIndex * SEG_ANGLE}deg)`,
                        zIndex: 2, pointerEvents: "none",
                      }}
                    >
                      <div style={{
                        position: "absolute", left: -WHEEL_SIZE / 2, top: -WHEEL_SIZE / 2,
                        width: WHEEL_SIZE, height: WHEEL_SIZE, borderRadius: "50%",
                        background: `conic-gradient(from 0deg, #FFFFFFCC 0deg ${SEG_ANGLE}deg, transparent ${SEG_ANGLE}deg 360deg)`,
                        mixBlendMode: "overlay",
                      }} />
                    </motion.div>
                  )}

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
