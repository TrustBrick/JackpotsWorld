import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X, Sparkles, PartyPopper } from "lucide-react";
import { C } from "./constants";
import { authFetch, API } from "./helpers";

// Mirrors the backend's REWARD_TYPE_CHOICES (spin_models.py) — the wheel is
// purely decorative; the backend has already decided the real outcome
// before the spin animation ever starts (see handleSpin), so there's no
// client-side RNG or exploit surface here. Segments themselves are fetched
// from GET /api/spin/wheel/ (admin-configured, see SpinWheelSegmentsView) —
// this is only the color cycle + icon fallback used to render whatever the
// backend returns, not the reward list itself.
// Richer, more saturated variants of the app's theme colors, used only on
// the wheel face for a glossy premium look — the shared `C` tokens (used
// everywhere else in the app) are untouched.
const SEGMENT_COLORS = ["#F0B90B", "#0B9C7D", "#1B5FE0", "#F0650F", "#8636E8", "#F0338E", "#0E7A99", "#E01E1E"];
const NO_REWARD_COLOR = "#101014"; // near-black charcoal, matches the reference's "Try Again" wedge
const REWARD_TYPE_ICONS = {
  cash_wallet_bonus: "wallet",
  casino_wallet_bonus: "wallet",
  rolling_points: "trending",
  cashback: "percent",
  bonus_credits: "card",
  merch: "gift",
  gift_voucher: "gift",
  discount_coupon: "ticket",
  event_pass: "calendar",
  tournament_entry: "trophy",
  vip_upgrade: "crown",
  jackpot_bonus: "coins",
  no_reward: "rotate",
};
// Custom hand-built icon set — deliberately not Lucide/Heroicons/Feather, per
// explicit request. Each is a flat-filled gold shape with a dark edge stroke
// for definition (an "embossed" look on a colored wedge) plus a small light
// highlight dot/stroke to fake a metallic sheen. `outlineOnly` (used for the
// "Try Again" wedge) switches to a plain light stroke with no fill, matching
// how that one wedge reads in the reference (icon, not a gold badge).
function WheelIcon({ type, size = 20, color = C.gold, edgeColor = "#6B5416", outlineOnly = false, style }) {
  const fillProps = outlineOnly
    ? { fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }
    : { fill: color, stroke: edgeColor, strokeWidth: 1, strokeLinejoin: "round" };
  const strokeOnly = { fill: "none", stroke: color, strokeWidth: outlineOnly ? 2 : 2.4, strokeLinecap: "round", strokeLinejoin: "round" };
  let body;
  switch (type) {
    case "crown":
      body = (
        <>
          <polygon points="2,19 4,9 8,13.5 12,6 16,13.5 20,9 22,19" {...fillProps} />
          <rect x="2" y="19" width="20" height="2.5" rx="1" {...fillProps} />
          {!outlineOnly && <circle cx="12" cy="8.3" r="1.3" fill="#FFF6D8" />}
        </>
      );
      break;
    case "coins":
      body = (
        <>
          <ellipse cx="12" cy="17" rx="8" ry="3.2" {...fillProps} />
          <ellipse cx="12" cy="13" rx="8" ry="3.2" {...fillProps} />
          <ellipse cx="12" cy="9" rx="8" ry="3.2" {...fillProps} />
        </>
      );
      break;
    case "wallet":
      body = (
        <>
          <rect x="2" y="6" width="20" height="14" rx="2.5" {...fillProps} />
          <line x1="2" y1="10.5" x2="22" y2="10.5" stroke={edgeColor} strokeWidth="1" />
          {!outlineOnly && <circle cx="17" cy="14" r="1.5" fill="#FFF6D8" />}
        </>
      );
      break;
    case "percent":
      body = (
        <>
          <line x1="5" y1="19" x2="19" y2="5" {...strokeOnly} />
          <circle cx="7.5" cy="7.5" r="3.2" {...fillProps} />
          <circle cx="16.5" cy="16.5" r="3.2" {...fillProps} />
        </>
      );
      break;
    case "card":
      body = (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2.5" {...fillProps} />
          <rect x="2" y="9" width="20" height="3.4" fill={edgeColor} stroke="none" />
          {!outlineOnly && <line x1="6" y1="16" x2="11" y2="16" stroke="#FFF6D8" strokeWidth="1.6" strokeLinecap="round" />}
        </>
      );
      break;
    case "gift":
      body = (
        <>
          <rect x="3" y="10" width="18" height="11" rx="1.2" {...fillProps} />
          <rect x="3" y="6.5" width="18" height="4" rx="1" {...fillProps} />
          <rect x="10.6" y="6.5" width="2.8" height="14.5" fill={edgeColor} stroke="none" />
          <circle cx="9" cy="5" r="2.2" {...fillProps} />
          <circle cx="15" cy="5" r="2.2" {...fillProps} />
        </>
      );
      break;
    case "ticket":
      body = (
        <>
          <path
            d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a1.8 1.8 0 0 0 0 3.6V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a1.8 1.8 0 0 0 0-3.6Z"
            {...fillProps}
          />
          <line x1="12" y1="6" x2="12" y2="18" stroke={outlineOnly ? color : edgeColor} strokeWidth="1.4" strokeDasharray="2.2 2.2" />
        </>
      );
      break;
    case "calendar":
      body = (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" {...fillProps} />
          <rect x="3" y="5" width="18" height="4.5" rx="2" fill={outlineOnly ? "none" : edgeColor} stroke={outlineOnly ? color : "none"} />
          <line x1="7" y1="3" x2="7" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="3" x2="17" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </>
      );
      break;
    case "trophy":
      body = (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" {...fillProps} />
          <path d="M7 6H4a3 3 0 0 0 3 5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M17 6h3a3 3 0 0 1-3 5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <rect x="10.5" y="14" width="3" height="4" fill={color} stroke={edgeColor} strokeWidth="1" />
          <rect x="7" y="18" width="10" height="2.5" rx="1" fill={color} stroke={edgeColor} strokeWidth="1" />
        </>
      );
      break;
    case "trending":
      body = (
        <>
          <polyline points="3,17 9,10 13,14 21,4" {...strokeOnly} />
          <polyline points="14,4 21,4 21,11" {...strokeOnly} />
        </>
      );
      break;
    case "rotate":
    default:
      body = (
        <>
          <path d="M4 12a8 8 0 1 1 2.8 6.1" {...strokeOnly} />
          <polyline points="3,7 4,12 9,11" {...strokeOnly} />
        </>
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {body}
    </svg>
  );
}
// Lightens (positive) or darkens (negative) a hex color by `percent` (-100..100).
function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const clamp = v => Math.min(255, Math.max(0, v));
  const r = clamp((num >> 16) + amt), g = clamp(((num >> 8) & 0xff) + amt), b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
// angle 0 = 12 o'clock, increasing clockwise — matches the CSS conic-gradient
// and rotate() convention used everywhere else in this component.
function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
function wedgePath(cx, cy, r, a0, a1) {
  const p0 = polarToXY(cx, cy, r, a0);
  const p1 = polarToXY(cx, cy, r, a1);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y} Z`;
}
const WHEEL_SIZE_MAX = 368; // fills almost the full modal content width (372px) so the wheel dominates, per the reference
const WHEEL_SIZE_MIN = 230; // unchanged — the floor that still fits the narrowest supported viewport (320px)
// Modal card is `maxWidth:420` with 24px padding, inside an overlay with
// 20px padding — on the narrowest supported viewports (320px) a fixed-size
// wheel doesn't fit that content box and bleeds a few px past the card's
// edge. Shrink it down to fit below ~397px; unchanged everywhere else.
function useWheelSize() {
  const [size, setSize] = useState(() =>
    typeof window === "undefined" ? WHEEL_SIZE_MAX : Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, window.innerWidth - 92))
  );
  useEffect(() => {
    const onResize = () => setSize(Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, window.innerWidth - 92)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
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
  // Static metallic rim wraps the spinning segment disc so the gold ring
  // itself doesn't rotate — only the reward colors/labels do.
  const RIM_THICKNESS = Math.round(WHEEL_SIZE * 0.042) + 7;
  const FACE_SIZE = WHEEL_SIZE - RIM_THICKNESS * 2;
  const LABEL_INSET = FACE_SIZE * 0.08;
  const ICON_SIZE = Math.max(14, Math.round(WHEEL_SIZE * 0.052));
  const LABEL_FONT_SIZE = Math.max(8, WHEEL_SIZE * 0.026);
  const LABEL_OUTER_RADIUS = FACE_SIZE / 2 - LABEL_INSET;
  // Label content (icon + up to 2 text lines) spans from LABEL_OUTER_RADIUS
  // down toward the hub — the INNER edge is the narrowest point angularly,
  // so the safe-width calc below must use it, not the outer edge, or long
  // labels can still visually spill into a neighboring segment's color.
  const LABEL_BLOCK_HEIGHT = ICON_SIZE + 3 + 2 * LABEL_FONT_SIZE * 1.12;
  const LABEL_INNER_RADIUS = Math.max(LABEL_OUTER_RADIUS * 0.35, LABEL_OUTER_RADIUS - LABEL_BLOCK_HEIGHT);
  const SEG_HALF_RAD = (SEG_ANGLE * Math.PI) / 180 / 2;
  // Chord width of the segment at the label's narrowest radius (not a rough
  // linear guess). Text renders upright (not radially rotated), so the safe
  // width is angle-dependent in a way this radius-only formula can't fully
  // capture — the 0.90 factor was tuned against the worst real case
  // (verified empirically: sides of the wheel need more margin than top/
  // bottom) so the label stays within its own segment's color everywhere.
  const LABEL_WIDTH = SEG_ANGLE ? Math.max(28, 2 * LABEL_INNER_RADIUS * Math.sin(SEG_HALF_RAD) * 0.84) : 28;
  const RIM_BEAD_COUNT = Math.max(16, Math.round(WHEEL_SIZE / 11));
  const RIM_BEAD_ANGLES = Array.from({ length: RIM_BEAD_COUNT }, (_, i) => (360 / RIM_BEAD_COUNT) * i);
  // Center hub scales with the wheel so it stays proportionally prominent —
  // a fixed 56px hub reads as small once the wheel itself gets this large.
  const BUTTON_SIZE = Math.round(WHEEL_SIZE * 0.225);

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
          {/* Shared metallic-gold gradient, referenced by every WheelIcon via
              color="url(#wheelGoldIconGradient)" — lives outside the
              phase-conditional branches below (wheel vs. result screen) so
              it's always present in the DOM regardless of which one is showing. */}
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
            <defs>
              <linearGradient id="wheelGoldIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF6D8" />
                <stop offset="45%" stopColor={C.gold} />
                <stop offset="100%" stopColor="#8A6C1B" />
              </linearGradient>
            </defs>
          </svg>
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
                    <WheelIcon
                      type={REWARD_TYPE_ICONS[result.reward_type] || "gift"}
                      size={40}
                      color="url(#wheelGoldIconGradient)"
                      style={{ filter: `drop-shadow(0 0 8px ${C.gold})` }}
                    />
                  )}
                </motion.div>
              )}
              {result.is_jackpot ? (
                <WheelIcon
                  type="crown" size={result.reward_type === "no_reward" ? 44 : 22}
                  color="url(#wheelGoldIconGradient)"
                  style={{ marginBottom: 6, filter: `drop-shadow(0 0 12px ${C.gold})` }}
                />
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
                {/* Ambient glow ring behind the wheel — two layered blurs for a stronger bloom */}
                <motion.div
                  animate={{ opacity: [0.45, 0.9, 0.45] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    position: "absolute", inset: -26, borderRadius: "50%",
                    background: `radial-gradient(circle, ${C.gold}45, transparent 65%)`,
                    filter: "blur(10px)", zIndex: 0,
                  }}
                />
                <div style={{
                  position: "absolute", inset: -8, borderRadius: "50%",
                  background: `radial-gradient(circle, ${C.gold}35, transparent 60%)`,
                  filter: "blur(3px)", zIndex: 0,
                }} />
                {/* Pointer — larger, layered metallic gold with a bright bevel edge */}
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  width: 0, height: 0, zIndex: 3,
                  borderLeft: "15px solid transparent", borderRight: "15px solid transparent",
                  borderTop: "26px solid #B8941E",
                  filter: `drop-shadow(0 0 6px ${C.gold}) drop-shadow(0 3px 3px rgba(0,0,0,0.5))`,
                }} />
                <div style={{
                  position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
                  width: 0, height: 0, zIndex: 3, pointerEvents: "none",
                  borderLeft: "12px solid transparent", borderRight: "12px solid transparent",
                  borderTop: `22px solid ${C.gold}`,
                }} />
                <div style={{
                  position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)",
                  width: 0, height: 0, zIndex: 4, pointerEvents: "none",
                  borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                  borderTop: "12px solid rgba(255,255,255,0.55)",
                }} />

                {/* Static metallic rim — does not rotate; only the face inside it does */}
                <div style={{
                  position: "absolute", inset: 0, borderRadius: "50%", zIndex: 1,
                  background: `conic-gradient(from 200deg, #8A6C1B, #F5E07A, #B8941E, ${C.gold}, #FFF6D8, ${C.gold}, #8A6C1B, #F5E07A, #B8941E, ${C.gold}, #8A6C1B)`,
                  padding: RIM_THICKNESS, boxSizing: "border-box",
                  boxShadow: `0 0 48px rgba(240,185,11,0.55), 0 0 18px rgba(255,246,216,0.35), inset 0 3px 5px rgba(255,255,255,0.4), inset 0 -4px 8px rgba(0,0,0,0.45)`,
                }}>
                  {/* Studded bead detailing around the rim — static, purely decorative */}
                  {RIM_BEAD_ANGLES.map(a => {
                    const rad = (a * Math.PI) / 180;
                    const beadR = WHEEL_SIZE / 2 - RIM_THICKNESS / 2;
                    const beadSize = Math.max(2.5, RIM_THICKNESS * 0.32);
                    return (
                      <div
                        key={`bead-${a}`}
                        style={{
                          position: "absolute", zIndex: 4, pointerEvents: "none",
                          width: beadSize, height: beadSize, borderRadius: "50%",
                          left: `calc(50% + ${beadR * Math.sin(rad)}px - ${beadSize / 2}px)`,
                          top: `calc(50% - ${beadR * Math.cos(rad)}px - ${beadSize / 2}px)`,
                          background: "radial-gradient(circle at 35% 30%, #FFF6D8, #F5E07A 40%, #B8941E 85%)",
                          boxShadow: "0 0.5px 1px rgba(0,0,0,0.5)",
                        }}
                      />
                    );
                  })}
                  <motion.div
                    animate={{ rotate: rotation }}
                    transition={{ duration: 3, ease: [0.17, 0.67, 0.32, 1] }}
                    style={{
                      width: "100%", height: "100%", borderRadius: "50%",
                      boxShadow: `inset 0 0 20px rgba(0,0,0,0.35)`,
                      position: "relative",
                    }}
                  >
                    {/* Real SVG wedges (not a flat CSS conic-gradient) — each slice
                        gets its own radial gradient (light near the rim, darker
                        toward the hub) for a domed, glossy look. Slices share an
                        exact edge with no gap and no separate divider-line
                        element, so nothing can ever render across the reward
                        text/icons; the boundary is still exactly at SEG_ANGLE*i. */}
                    <svg
                      viewBox={`0 0 ${FACE_SIZE} ${FACE_SIZE}`} width="100%" height="100%"
                      style={{ position: "absolute", inset: 0, display: "block" }}
                    >
                      <defs>
                        {SEGMENT_COLORS.map((clr, ci) => (
                          <radialGradient key={ci} id={`wedgeGrad${ci}`} cx="50%" cy="30%" r="75%">
                            <stop offset="0%" stopColor={shade(clr, 30)} />
                            <stop offset="55%" stopColor={clr} />
                            <stop offset="100%" stopColor={shade(clr, -22)} />
                          </radialGradient>
                        ))}
                        <radialGradient id="wedgeGradCharcoal" cx="50%" cy="30%" r="75%">
                          <stop offset="0%" stopColor={shade(NO_REWARD_COLOR, 40)} />
                          <stop offset="55%" stopColor={NO_REWARD_COLOR} />
                          <stop offset="100%" stopColor={shade(NO_REWARD_COLOR, -12)} />
                        </radialGradient>
                      </defs>
                      {segments.map((s, i) => {
                        const gradId = s.reward_type === "no_reward" ? "wedgeGradCharcoal" : `wedgeGrad${i % SEGMENT_COLORS.length}`;
                        return (
                          <path
                            key={s.id}
                            d={wedgePath(FACE_SIZE / 2, FACE_SIZE / 2, FACE_SIZE / 2, i * SEG_ANGLE, (i + 1) * SEG_ANGLE)}
                            fill={`url(#${gradId})`}
                          />
                        );
                      })}
                    </svg>

                    {segments.map((s, i) => {
                      const mid = i * SEG_ANGLE + SEG_ANGLE / 2;
                      const isNoReward = s.reward_type === "no_reward";
                      const iconType = REWARD_TYPE_ICONS[s.reward_type] || "gift";
                      const iconColor = isNoReward ? "rgba(255,255,255,0.55)" : C.gold;
                      const textColor = isNoReward ? "rgba(255,255,255,0.7)" : "white";
                      return (
                        <div
                          key={s.id}
                          style={{
                            position: "absolute", top: "50%", left: "50%", width: 0, height: 0,
                            transform: `rotate(${mid}deg)`,
                          }}
                        >
                          {/* Positioned radially by the parent's rotation, then counter-rotated
                              so the icon/text render upright and stay easy to read regardless
                              of where the segment falls on the wheel. */}
                          <div style={{
                            position: "absolute", left: 0, top: -LABEL_OUTER_RADIUS,
                            transform: `translateX(-50%) rotate(${-mid}deg)`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                            width: LABEL_WIDTH,
                          }}>
                            {s.image ? (
                              <img
                                src={s.image} alt={s.label}
                                style={{ width: ICON_SIZE + 8, height: ICON_SIZE + 8, objectFit: "contain", filter: isNoReward ? "none" : `drop-shadow(0 1px 2px rgba(0,0,0,0.5))` }}
                                onError={e => { e.currentTarget.style.display = "none"; }}
                              />
                            ) : (
                              <WheelIcon
                                type={iconType} size={ICON_SIZE}
                                color={isNoReward ? iconColor : "url(#wheelGoldIconGradient)"}
                                edgeColor="#6B5416"
                                outlineOnly={isNoReward}
                                style={{
                                  flexShrink: 0,
                                  filter: isNoReward
                                    ? "none"
                                    : `drop-shadow(0 0 3px ${C.gold}A0) drop-shadow(0 1px 2px rgba(0,0,0,0.5))`,
                                }}
                              />
                            )}
                            <span style={{
                              fontSize: LABEL_FONT_SIZE, fontWeight: 800, color: textColor,
                              letterSpacing: "0.01em", textAlign: "center", lineHeight: 1.15,
                              textShadow: isNoReward ? "none" : "0 1px 3px rgba(0,0,0,0.7)",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              overflow: "hidden", wordBreak: "break-word", maxWidth: LABEL_WIDTH,
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
                          position: "absolute", left: -FACE_SIZE / 2, top: -FACE_SIZE / 2,
                          width: FACE_SIZE, height: FACE_SIZE, borderRadius: "50%",
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
                        width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: "50%",
                        background: phase === "ready"
                          ? `linear-gradient(135deg, #FFF6D8, #F5E07A 30%, ${C.gold} 60%, #B8941E)`
                          : "linear-gradient(135deg, #2a2a32, #1a1a20)",
                        border: `${Math.max(3, Math.round(BUTTON_SIZE * 0.05))}px solid ${phase === "ready" ? C.gold : C.border}`,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        cursor: phase === "ready" ? "pointer" : "not-allowed",
                        boxShadow: phase === "ready"
                          ? `0 0 28px rgba(240,185,11,0.7), 0 4px 10px rgba(0,0,0,0.4), inset 0 3px 4px rgba(255,255,255,0.55), inset 0 -4px 6px rgba(0,0,0,0.4)`
                          : "inset 0 2px 3px rgba(255,255,255,0.05), inset 0 -2px 4px rgba(0,0,0,0.3)",
                        transition: "all 0.2s", padding: 0,
                      }}
                    >
                      <Sparkles size={Math.round(BUTTON_SIZE * 0.32)} style={{ color: phase === "ready" ? "#07080F" : "rgba(255,255,255,0.3)" }} />
                      <span style={{ fontSize: Math.max(8, Math.round(BUTTON_SIZE * 0.15)), fontWeight: 900, letterSpacing: "0.05em", color: phase === "ready" ? "#07080F" : "rgba(255,255,255,0.3)", marginTop: 1 }}>
                        {phase === "spinning" ? "…" : "SPIN"}
                      </span>
                    </button>
                  </motion.div>

                  {/* Glossy dome lighting — static (doesn't spin with the segments), so it
                      reads as a fixed light source across the glass, like the reference. */}
                  <div style={{
                    position: "absolute", inset: RIM_THICKNESS, borderRadius: "50%",
                    pointerEvents: "none", zIndex: 3,
                    background: "radial-gradient(circle at 50% 22%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.10) 20%, transparent 45%), linear-gradient(160deg, rgba(255,255,255,0.10) 0%, transparent 30%, transparent 68%, rgba(0,0,0,0.22) 100%)",
                  }} />
                </div>
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
