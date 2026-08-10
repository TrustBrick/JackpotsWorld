import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { C } from "../constants";
import { iconFor } from "./wheelIcons";

// Ring chrome asset geometry — must match gen_wheel_assets.py's own
// outer_frac/inner_frac exactly, so the spinning face disc lines up with
// the ring's transparent inner hole with no gap or overlap.
const RING_INNER_FRAC = 0.415;
const FACE_SIZE_RATIO = RING_INNER_FRAC * 2; // fraction of WHEEL_SIZE the face disc fills

const WHEEL_SIZE_MAX = 368;
const WHEEL_SIZE_MIN = 230;

export function useWheelSize() {
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

// angle 0 = 12 o'clock, increasing clockwise.
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
function shade(hex, percent) {
  const num = parseInt((hex || "#D4AF37").slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const clamp = v => Math.min(255, Math.max(0, v));
  const r = clamp((num >> 16) + amt), g = clamp(((num >> 8) & 0xff) + amt), b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const SEGMENT_COLORS = ["#F0B90B", "#0B9C7D", "#1B5FE0", "#F0650F", "#8636E8", "#F0338E", "#0E7A99", "#E01E1E"];
const NO_REWARD_COLOR = "#101014";

/**
 * The one shared, purely-presentational premium wheel — used by both
 * SignupWheelModal and BonusWheelModal. No API knowledge: segments/rotation/
 * phase are all passed in, the reward is always resolved server-side by the
 * caller before rotation is ever set.
 */
export default function WheelDisplay({
  segments, size, rotation, phase, winningIndex, onSpin, spinLabel = "SPIN",
}) {
  const WHEEL_SIZE = size || useWheelSize();
  const SEG_ANGLE = segments.length ? 360 / segments.length : 0;
  const FACE_SIZE = WHEEL_SIZE * FACE_SIZE_RATIO;
  const LABEL_INSET = FACE_SIZE * 0.09;
  const ICON_SIZE = Math.max(14, Math.round(WHEEL_SIZE * 0.05));
  const LABEL_FONT_SIZE = Math.max(8, WHEEL_SIZE * 0.025);
  const LABEL_OUTER_RADIUS = FACE_SIZE / 2 - LABEL_INSET;
  const LABEL_BLOCK_HEIGHT = ICON_SIZE + 3 + 2 * LABEL_FONT_SIZE * 1.12;
  const LABEL_INNER_RADIUS = Math.max(LABEL_OUTER_RADIUS * 0.35, LABEL_OUTER_RADIUS - LABEL_BLOCK_HEIGHT);
  const SEG_HALF_RAD = (SEG_ANGLE * Math.PI) / 180 / 2;
  const LABEL_WIDTH = SEG_ANGLE ? Math.max(28, 2 * LABEL_INNER_RADIUS * Math.sin(SEG_HALF_RAD) * 0.84) : 28;
  const BUTTON_SIZE = Math.round(WHEEL_SIZE * 0.225);
  const POINTER_WIDTH = Math.round(WHEEL_SIZE * 0.13);
  const POINTER_HEIGHT = Math.round(POINTER_WIDTH * (220 / 180));

  const canSpin = phase === "ready";

  return (
    <div style={{ position: "relative", width: WHEEL_SIZE, height: WHEEL_SIZE }}>
      {/* Ambient glow behind the wheel */}
      <motion.div
        animate={{ opacity: [0.45, 0.9, 0.45] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", inset: -26, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.gold}45, transparent 65%)`,
          filter: "blur(10px)", zIndex: 0,
        }}
      />

      {/* Pointer */}
      <img
        src="/images/wheel/pointer.png" alt="" aria-hidden="true"
        style={{
          position: "absolute", top: -POINTER_HEIGHT * 0.28, left: "50%",
          transform: "translateX(-50%)", width: POINTER_WIDTH, height: POINTER_HEIGHT,
          zIndex: 4, pointerEvents: "none",
          filter: `drop-shadow(0 0 6px ${C.gold}90) drop-shadow(0 3px 4px rgba(0,0,0,0.5))`,
        }}
      />

      {/* Metallic gold ring chrome — static, does not rotate */}
      <img
        src="/images/wheel/ring.png" alt="" aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}
      />

      {/* Spinning face disc */}
      <motion.div
        animate={{ rotate: rotation }}
        transition={{ duration: 3, ease: [0.17, 0.67, 0.32, 1] }}
        style={{
          position: "absolute", top: "50%", left: "50%",
          width: FACE_SIZE, height: FACE_SIZE, marginLeft: -FACE_SIZE / 2, marginTop: -FACE_SIZE / 2,
          borderRadius: "50%", boxShadow: "inset 0 0 20px rgba(0,0,0,0.35)", zIndex: 2,
        }}
      >
        <svg viewBox={`0 0 ${FACE_SIZE} ${FACE_SIZE}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }}>
          <defs>
            {SEGMENT_COLORS.map((clr, ci) => (
              <radialGradient key={ci} id={`wheelWedgeGrad${ci}`} cx="50%" cy="30%" r="75%">
                <stop offset="0%" stopColor={shade(clr, 30)} />
                <stop offset="55%" stopColor={clr} />
                <stop offset="100%" stopColor={shade(clr, -22)} />
              </radialGradient>
            ))}
            <radialGradient id="wheelWedgeGradCharcoal" cx="50%" cy="30%" r="75%">
              <stop offset="0%" stopColor={shade(NO_REWARD_COLOR, 40)} />
              <stop offset="55%" stopColor={NO_REWARD_COLOR} />
              <stop offset="100%" stopColor={shade(NO_REWARD_COLOR, -12)} />
            </radialGradient>
          </defs>
          {segments.map((s, i) => {
            const isNoReward = s.reward_type === "no_reward";
            const custom = s.color ? null : undefined;
            const gradId = isNoReward
              ? "wheelWedgeGradCharcoal"
              : `wheelWedgeGrad${i % SEGMENT_COLORS.length}`;
            return (
              <path
                key={s.id}
                d={wedgePath(FACE_SIZE / 2, FACE_SIZE / 2, FACE_SIZE / 2, i * SEG_ANGLE, (i + 1) * SEG_ANGLE)}
                fill={s.color || `url(#${gradId})`}
              />
            );
          })}
        </svg>

        {segments.map((s, i) => {
          const mid = i * SEG_ANGLE + SEG_ANGLE / 2;
          const isNoReward = s.reward_type === "no_reward";
          const Icon = iconFor(s.is_mystery ? "mystery_reward" : s.reward_type);
          const iconColor = isNoReward ? "rgba(255,255,255,0.55)" : C.gold;
          const textColor = isNoReward ? "rgba(255,255,255,0.7)" : "white";
          return (
            <div key={s.id} style={{ position: "absolute", top: "50%", left: "50%", width: 0, height: 0, transform: `rotate(${mid}deg)` }}>
              <div style={{
                position: "absolute", left: 0, top: -LABEL_OUTER_RADIUS,
                transform: `translateX(-50%) rotate(${-mid}deg)`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: LABEL_WIDTH,
              }}>
                {s.image ? (
                  <img
                    src={s.image} alt={s.label}
                    style={{ width: ICON_SIZE + 8, height: ICON_SIZE + 8, objectFit: "contain", filter: isNoReward ? "none" : "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
                    onError={e => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <Icon
                    size={ICON_SIZE}
                    style={{
                      flexShrink: 0, color: iconColor,
                      filter: isNoReward ? "none" : `drop-shadow(0 0 3px ${C.gold}A0) drop-shadow(0 1px 2px rgba(0,0,0,0.5))`,
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

        {/* Winning-segment highlight pulse */}
        {phase === "result" && winningIndex != null && segments[winningIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6, 1] }}
            transition={{ duration: 1.2, repeat: 2 }}
            style={{
              position: "absolute", top: "50%", left: "50%", width: 0, height: 0,
              transform: `rotate(${winningIndex * SEG_ANGLE}deg)`, zIndex: 2, pointerEvents: "none",
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
      </motion.div>

      {/* Glossy dome lighting overlay, static */}
      <div style={{
        position: "absolute", left: "50%", top: "50%", width: FACE_SIZE, height: FACE_SIZE,
        marginLeft: -FACE_SIZE / 2, marginTop: -FACE_SIZE / 2, borderRadius: "50%",
        pointerEvents: "none", zIndex: 3,
        background: "radial-gradient(circle at 50% 22%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.10) 20%, transparent 45%), linear-gradient(160deg, rgba(255,255,255,0.10) 0%, transparent 30%, transparent 68%, rgba(0,0,0,0.22) 100%)",
      }} />

      {/* Center hub — the spin button */}
      <button
        onClick={onSpin}
        disabled={!canSpin}
        aria-label="Spin the wheel"
        style={{
          position: "absolute", inset: 0, margin: "auto",
          width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: "50%", zIndex: 5,
          padding: 0, border: "none", cursor: canSpin ? "pointer" : "not-allowed",
          background: `url(/images/wheel/hub.png) center/cover`,
          filter: canSpin ? "none" : "grayscale(0.7) brightness(0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: canSpin ? `0 0 28px rgba(240,185,11,0.7)` : "none",
          transition: "filter 0.2s, box-shadow 0.2s",
        }}
      >
        <span style={{
          fontSize: Math.max(9, Math.round(BUTTON_SIZE * 0.17)), fontWeight: 900, letterSpacing: "0.05em",
          color: "#3a2a06", textShadow: "0 1px 0 rgba(255,255,255,0.35)",
        }}>
          {phase === "spinning" ? "…" : spinLabel}
        </span>
      </button>
    </div>
  );
}
