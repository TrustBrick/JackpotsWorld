import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Clock, CheckCircle } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmt, fmtD } from "../../helpers";
import { Spinner, Btn } from "../../components/SharedUI";

const DEFAULT_PRIZES = [
  { label: "$100 Bonus",  color: "#2DD4BF", weight: 30, type: "bonus",       value: 100  },
  { label: "$500 Bonus",  color: "#818CF8", weight: 20, type: "bonus",       value: 500  },
  { label: "$1,000",      color: "#F472B6", weight: 10, type: "bonus",       value: 1000 },
  { label: "Free Spin",   color: "#FB923C", weight: 25, type: "spin",        value: 1    },
  { label: "$50 Bonus",   color: "#34D399", weight: 10, type: "bonus",       value: 50   },
  { label: "Better Luck", color: "#94A3B8", weight: 5,  type: "consolation", value: 0    },
];
const DARK_COLORS = ["#1A9E94", "#5B52D4", "#C4337D", "#D9641A", "#1A9E6A", "#5A6677"];

export default function RewardsTab({ onToast, onRefresh }) {
  const [activeTab, setActiveTab] = useState("spin");
  const [rewards, setRewards]     = useState([]);
  const [spinData, setSpinData]   = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinResult, setSpinResult]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [claiming, setClaiming]   = useState(null);
  const [countdown, setCountdown] = useState("");
  const canvasRef  = useRef(null);
  const angleRef   = useRef(0);
  const prizesRef  = useRef([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRes, sRes] = await Promise.all([
        authFetch(`${API}/api/rewards/`),
        authFetch(`${API}/api/spin/status/`),
      ]);
      const [rJson, sJson] = await Promise.all([rRes.json(), sRes.json()]);
      setRewards(rJson.results || rJson);
      setSpinData(sJson);
      prizesRef.current = sJson.prize_config || DEFAULT_PRIZES;
    } catch {}
    setLoading(false);
  };

  // Draw wheel whenever spin tab is active
  useEffect(() => {
    if (activeTab !== "spin") return;
    const prizes = prizesRef.current.length ? prizesRef.current : DEFAULT_PRIZES;
    drawWheel(canvasRef.current, angleRef.current, prizes);
  }, [activeTab, spinData]);

  function drawWheel(canvas, angle, prizes) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = 320, CX = 160, CY = 160, R = 150;
    ctx.clearRect(0, 0, W, W);
    const tw = prizes.reduce((s, p) => s + (p.weight || 1), 0);
    let start = angle - Math.PI / 2;
    prizes.forEach((p, i) => {
      const sweep = ((p.weight || 1) / tw) * 2 * Math.PI;
      const end = start + sweep, mid = (start + end) / 2;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.arc(CX, CY, R, start, end); ctx.closePath();
      const g = ctx.createRadialGradient(CX, CY, R * 0.3, CX, CY, R);
      g.addColorStop(0, p.color + "EE"); g.addColorStop(1, (DARK_COLORS[i] || p.color) + "99");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      if (sweep > 0.3) {
        ctx.save();
        ctx.translate(CX + Math.cos(mid) * R * 0.65, CY + Math.sin(mid) * R * 0.65);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 4;
        ctx.fillText(p.label, 0, 0); ctx.restore();
      }
      ctx.restore(); start = end;
    });
    const sh = ctx.createLinearGradient(0, 0, 0, W);
    sh.addColorStop(0, "rgba(255,255,255,0.1)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.15)");
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fillStyle = sh; ctx.fill(); ctx.restore();
  }

  const doSpin = async () => {
    if (!spinData?.can_spin || isAnimating) return;
    setIsAnimating(true); setSpinResult(null);
    const prizes = prizesRef.current.length ? prizesRef.current : DEFAULT_PRIZES;
    try {
      const r = await authFetch(`${API}/api/spin/`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { onToast(j.error || "Spin failed", false); setIsAnimating(false); return; }
      const winIdx = Math.max(prizes.findIndex(p => p.label === j.prize_label), 0);
      const tw = prizes.reduce((s, p) => s + (p.weight || 1), 0);
      let ang = 0;
      for (let i = 0; i < winIdx; i++) ang += (prizes[i].weight || 1) / tw * 2 * Math.PI;
      ang += (prizes[winIdx].weight || 1) / tw * Math.PI;
      const cur    = angleRef.current % (2 * Math.PI);
      const target = angleRef.current + (6 * 2 * Math.PI) + ((2 * Math.PI - cur + (-Math.PI / 2 + ang + 2 * Math.PI) % (2 * Math.PI)) % (2 * Math.PI));
      const startA = angleRef.current, startT = performance.now(), dur = 4000;
      const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const frame = (now) => {
        const t = Math.min((now - startT) / dur, 1);
        angleRef.current = startA + (target - startA) * ease(t);
        drawWheel(canvasRef.current, angleRef.current, prizes);
        if (t < 1) requestAnimationFrame(frame);
        else {
          angleRef.current = target % (2 * Math.PI);
          drawWheel(canvasRef.current, angleRef.current, prizes);
          setIsAnimating(false); setSpinResult(j);
          setSpinData(p => ({ ...p, can_spin: false, next_spin_at: j.next_spin_at }));
          onRefresh();
        }
      };
      requestAnimationFrame(frame);
    } catch { setIsAnimating(false); }
  };

  // Countdown timer
  useEffect(() => {
    if (!spinData?.next_spin_at) return;
    const tick = () => {
      const diff = new Date(spinData.next_spin_at) - new Date();
      if (diff <= 0) { setCountdown(""); return; }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [spinData?.next_spin_at]);

  const claimReward = async (id) => {
    setClaiming(id);
    const r = await authFetch(`${API}/api/rewards/${id}/claim/`, { method: "POST" });
    const j = await r.json();
    onToast(j.message || j.error, r.ok);
    if (r.ok) { loadAll(); onRefresh(); }
    setClaiming(null);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {[["spin", "🎰 Daily Spin"], ["rewards", "🎁 My Rewards"]].map(([m, l]) => (
          <button key={m} onClick={() => setActiveTab(m)} style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${activeTab === m ? `${C.gold}40` : C.border}`,
            background: activeTab === m ? `${C.gold}12` : "transparent",
            color: activeTab === m ? C.gold : "rgba(255,255,255,0.4)",
          }}>{l}</button>
        ))}
      </div>

      {activeTab === "spin" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>Your daily reward awaits</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "white", marginBottom: 3 }}>Spin &amp; Win</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 32 }}>One free spin every 24 hours</div>

          {/* Wheel */}
          <div style={{ position: "relative", width: 320, height: 320, marginBottom: 24 }}>
            <div style={{ position: "absolute", inset: -14, borderRadius: "50%", border: `2px solid ${C.gold}`, opacity: 0.1, pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: -8,  borderRadius: "50%", border: `8px solid ${C.gold}`, opacity: 0.15, pointerEvents: "none" }} />
            {/* Pointer */}
            <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: `22px solid ${C.gold}`, zIndex: 10 }} />
            <canvas ref={canvasRef} width={320} height={320} style={{ borderRadius: "50%", display: "block", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }} />
            {/* Center cap */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 44, height: 44, borderRadius: "50%", background: C.gold, border: "3px solid rgba(255,255,255,0.15)", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 18, height: 18, background: "rgba(0,0,0,0.4)", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
            </div>
            {/* Locked overlay */}
            {!spinData?.can_spin && !isAnimating && (
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.65)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 6 }}>
                <div style={{ fontSize: 10, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Next spin in</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "white", fontFamily: "monospace" }}>{countdown || "—"}</div>
              </div>
            )}
          </div>

          {/* Result */}
          <AnimatePresence>
            {spinResult && (
              <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}
                style={{ padding: "16px 28px", borderRadius: 14, background: `${C.gold}15`, border: `1px solid ${C.gold}40`, textAlign: "center", marginBottom: 22, minWidth: 240 }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{spinResult.prize_type === "bonus" ? "🎰" : spinResult.prize_type === "spin" ? "🔄" : "🎲"}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>You won</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>{spinResult.prize_label}</div>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={doSpin} disabled={!spinData?.can_spin || isAnimating} style={{
            padding: "14px 48px", borderRadius: 50, fontSize: 14, fontWeight: 700,
            cursor: (!spinData?.can_spin || isAnimating) ? "not-allowed" : "pointer",
            border: "none",
            background: (spinData?.can_spin && !isAnimating) ? C.gold : "rgba(255,255,255,0.07)",
            color:      (spinData?.can_spin && !isAnimating) ? "#06080E" : "rgba(255,255,255,0.35)",
            transition: "all 0.2s",
            boxShadow:  (spinData?.can_spin && !isAnimating) ? `0 4px 20px ${C.gold}40` : "none",
          }}>
            {isAnimating ? "Spinning…" : spinData?.can_spin ? "Spin the Wheel" : `Come back in ${countdown || "…"}`}
          </button>
        </div>
      )}

      {activeTab === "rewards" && (
        loading ? <Spinner /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
            {rewards.map(r => (
              <motion.div key={r.id} layout style={{ padding: 18, borderRadius: 14, background: r.is_claimed ? "rgba(255,255,255,0.015)" : `${C.gold}07`, border: `1px solid ${r.is_claimed ? C.border : `${C.gold}28`}` }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>🎁</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  {(r.type || "").replace("_", " ")}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: r.is_claimed ? "rgba(255,255,255,0.25)" : C.gold, marginBottom: 12 }}>
                  ${Number(r.amount || 0).toLocaleString("en-IN")}
                </div>
                {r.is_claimed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>
                    <CheckCircle size={11} /> Claimed
                  </div>
                ) : (
                  <Btn onClick={() => claimReward(r.id)} disabled={claiming === r.id} style={{ width: "100%", justifyContent: "center" }}>
                    <Gift size={12} />{claiming === r.id ? "Claiming…" : "Claim Now"}
                  </Btn>
                )}
                {r.expires_at && !r.is_claimed && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={9} /> Expires {fmtD(r.expires_at)}
                  </div>
                )}
              </motion.div>
            ))}
            {rewards.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 44, color: "rgba(255,255,255,0.2)" }}>No rewards available</div>
            )}
          </div>
        )
      )}
    </div>
  );
}