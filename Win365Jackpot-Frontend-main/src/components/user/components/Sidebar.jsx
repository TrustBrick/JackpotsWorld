import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, MessageCircle, Send, Bell, Gift,
  BarChart3, Wallet, Plane, Heart, Star,
  Trophy, Users, User, Menu, X, ChevronRight, Package,
} from "lucide-react";
import { C, VIP_COLOR, TABS } from "../constants";
import { fmtN } from "../helpers";
import { VIPBadge } from "./SharedUI";


// ── Exported constants — Dashboard reads these to set its own marginLeft ──────
export const SIDEBAR_WIDTH = 230;
export const RAIL_WIDTH    = 64;

// ── Breakpoint hook — also exported for Dashboard ─────────────────────────────
export function useBreakpoint() {
  const get = () => {
    const w = window.innerWidth;
    if (w >= 1024) return "desktop";
    if (w >= 640)  return "tablet";
    return "mobile";
  };
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return bp;
}

const ICON_MAP = { BarChart3, Wallet, Plane, Gift, Heart, Star, Trophy, Bell, Users, User, Package };

function useNotifPulse() {
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @keyframes notif-pulse {
        0%,100%{opacity:1;transform:scale(1)}
        50%{opacity:.6;transform:scale(1.4)}
      }
      @keyframes bell-shake {
        0%,100%{transform:rotate(0deg)}
        10%{transform:rotate(-18deg)}
        20%{transform:rotate(16deg)}
        30%{transform:rotate(-14deg)}
        40%{transform:rotate(12deg)}
        50%{transform:rotate(-8deg)}
        60%{transform:rotate(6deg)}
        70%{transform:rotate(-4deg)}
        80%{transform:rotate(2deg)}
      }
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);
}

const ANIMATED_BELL_URL = "https://cdn-icons-gif.flaticon.com/15578679/15578679.gif";

// ═════════════════════════════════════════════════════════════════════════════
export default function Sidebar({ profile, stats, activeTab, onTabChange, onLogout }) {
  useNotifPulse();
  const bp       = useBreakpoint();
  const vipColor = VIP_COLOR[profile?.vip_level] || C.gold;
  const unread   = stats?.unread_notifications ?? 0;
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { if (bp === "desktop") setDrawerOpen(false); }, [bp]);

  const handleTabChange = useCallback((id) => {
    onTabChange(id);
    if (bp !== "desktop") setDrawerOpen(false);
  }, [bp, onTabChange]);

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (bp === "desktop") {
    return (
      <FullSidebar
        profile={profile} vipColor={vipColor} unread={unread}
        activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout}
        width={SIDEBAR_WIDTH} fixed
      />
    );
  }

  // ── Tablet ────────────────────────────────────────────────────────────────
  if (bp === "tablet") {
    return (
      <>
        <IconRail
          vipColor={vipColor} unread={unread} activeTab={activeTab}
          profile={profile} onTabChange={handleTabChange}
          onHamburger={() => setDrawerOpen(true)} onLogout={onLogout}
        />
        <AnimatePresence>
          {drawerOpen && (
            <>
              <Backdrop onClick={() => setDrawerOpen(false)} zIndex={118} />
              <motion.div
                key="tablet-drawer"
                initial={{ x: -(SIDEBAR_WIDTH + 20) }}
                animate={{ x: 0 }}
                exit={{ x: -(SIDEBAR_WIDTH + 20) }}
                transition={{ type: "spring", stiffness: 340, damping: 34 }}
                style={{ position: "fixed", top: 0, left: RAIL_WIDTH, zIndex: 120, height: "100vh" }}
              >
                <FullSidebar
                  profile={profile} vipColor={vipColor} unread={unread}
                  activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout}
                  width={SIDEBAR_WIDTH} showClose onClose={() => setDrawerOpen(false)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Mobile ────────────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {!drawerOpen && (
          <motion.button
            key="hamburger"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setDrawerOpen(true)}
            style={{
              position: "fixed", top: 14, left: 14, zIndex: 130,
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(6,8,14,0.95)",
              border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.gold,
            }}
          >
            <Menu size={18} />
            {unread > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5,
                width: 16, height: 16, borderRadius: "50%",
                background: C.red, fontSize: 8, fontWeight: 900,
                color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #06080E",
              }}>{unread > 9 ? "9+" : unread}</span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <Backdrop onClick={() => setDrawerOpen(false)} zIndex={135} />
            <motion.div
              key="mobile-drawer"
              initial={{ x: -310 }}
              animate={{ x: 0 }}
              exit={{ x: -310 }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              style={{ position: "fixed", top: 0, left: 0, zIndex: 140, height: "100vh" }}
            >
              <FullSidebar
                profile={profile} vipColor={vipColor} unread={unread}
                activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout}
                width={Math.min(280, window.innerWidth - 60)}
                showClose onClose={() => setDrawerOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Icon Rail ─────────────────────────────────────────────────────────────────
function IconRail({ vipColor, unread, activeTab, profile, onTabChange, onHamburger, onLogout }) {
  return (
    <aside style={{
      width: RAIL_WIDTH, flexShrink: 0,
      borderRight: `1px solid ${C.border}`,
      background: "rgba(6,8,14,0.97)",
      backdropFilter: "blur(20px)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "14px 0",
      position: "fixed", top: 0, left: 0,
      height: "100vh", zIndex: 100,
      overflowY: "auto",
    }}>
      <div onClick={() => window.location.href = "/"} title="JACKPOTS WORLD" style={{
        width: 36, height: 36, borderRadius: 9,
        background: `${C.gold}15`, border: `1px solid ${C.gold}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", marginBottom: 6,
        fontSize: 10, fontWeight: 900, color: C.gold, letterSpacing: 1,
      }}>W3</div>

      <button onClick={onHamburger} title="Open menu" style={{
        width: 36, height: 36, borderRadius: 9,
        background: "transparent", border: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "rgba(255,255,255,0.4)", marginBottom: 12,
      }}>
        <Menu size={15} />
      </button>

      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: `linear-gradient(135deg, ${vipColor}, ${vipColor}80)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 900, color: "#06080E",
        overflow: "hidden", marginBottom: 12, flexShrink: 0,
      }}>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : (profile?.name || profile?.email || "U")[0].toUpperCase()
        }
      </div>

      <nav style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
        {TABS.map(t => {
  const Icon     = ICON_MAP[t.icon];
  const isActive = activeTab === t.id;
  const hasBadge = t.id === "notifications" && unread > 0;
  return (
    <button key={t.id} onClick={() => onTabChange(t.id)} title={t.label} style={{
      width: 40, height: 38, borderRadius: 9,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: isActive ? `1px solid ${vipColor}30` : "1px solid transparent",
      background: isActive ? `${vipColor}12` : "transparent",
      color: isActive ? vipColor : "rgba(255,255,255,0.35)",
      cursor: "pointer", position: "relative", transition: "all 0.15s",
    }}>
      {t.id === "notifications" && hasBadge ? (
        <img
          src={ANIMATED_BELL_URL}
          alt="notifications"
          style={{ width: 18, height: 18, objectFit: "contain" }}
        />
      ) : (
        Icon && <Icon size={15} />
      )}
      {hasBadge && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          width: 7, height: 7, borderRadius: "50%",
          background: C.red, animation: "notif-pulse 2s ease-in-out infinite",
        }} />
      )}
    </button>
  );
})}
      </nav>

      <button onClick={onLogout} title="Sign Out" style={{
        width: 40, height: 36, borderRadius: 9,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: "1px solid transparent",
        color: "rgba(248,113,113,0.5)", cursor: "pointer", marginTop: 6,
      }}>
        <LogOut size={14} />
      </button>
    </aside>
  );
}

// ── Full Sidebar ──────────────────────────────────────────────────────────────
function FullSidebar({ profile, vipColor, unread, activeTab, onTabChange, onLogout, width, fixed = false, showClose = false, onClose }) {
  return (
    <aside style={{
      width, flexShrink: 0,
      borderRight: `1px solid ${C.border}`,
      background: "rgba(6,8,14,0.98)",
      backdropFilter: "blur(24px)",
      padding: "20px 14px",
      display: "flex", flexDirection: "column",
      height: "100vh", overflowY: "auto",
      ...(fixed ? { position: "fixed", top: 0, left: 0, zIndex: 10 } : {}),
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, paddingLeft: 4 }}>
        <div onClick={() => window.location.href = "/"} style={{ cursor: "pointer" }}>
          <img 
    src='images/jackpotsworld_watermark.png' 
    className="w-10 h-10 object-contain"
  />
  <div className="flex flex-col leading-none">
    <span className="font-bold text-xl md:text-2xl gold-text font-black tracking-wider">Jackpots</span>
    <span className="font-body text-xs tracking-[0.4em] text-gold/70 uppercase">World</span>
  </div>
        </div>
        {showClose && (
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "rgba(255,255,255,0.4)",
          }}><X size={13} /></button>
        )}
      </div>

      {/* User card */}
      <div style={{ marginBottom: 14, padding: "12px 10px", borderRadius: 12, background: `${vipColor}10`, border: `1px solid ${vipColor}28` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: `linear-gradient(135deg, ${vipColor}, ${vipColor}80)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 900, color: "#06080E",
            flexShrink: 0, overflow: "hidden",
          }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (profile?.name || profile?.email || "U")[0].toUpperCase()
            }
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {profile?.name || profile?.email?.split("@")[0]}
            </div>
            <span style={{
  fontSize: 9, fontWeight: 700, padding: "2px 7px",
  borderRadius: 4, background: `${vipColor}20`,
  border: `1px solid ${vipColor}40`, color: vipColor,
  textTransform: "uppercase", letterSpacing: "0.05em",
}}>
  {["VIP","VIP Bronze","Silver","Gold","Jackpot I","Jackpot II","Jackpot III","Jackpot Platinum","Jackpot Diamond"][( profile?.vip_level || 1) - 1] || "VIP"}
</span>
          </div>
        </div>
        {/* <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
          <span>XP Progress</span>
          <span style={{ color: vipColor }}>{fmtN(profile?.vip_xp)} / {fmtN(profile?.vip_xp_needed)}</span>
        </div> */}
        {/* <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${profile?.vip_progress_pct || 0}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${vipColor}60, ${vipColor})` }}
          />
        </div> */}
        {/* <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>Next: VIP {(profile?.vip_level || 1) + 1}</span>
          <span style={{ color: vipColor, fontWeight: 700 }}>{profile?.vip_progress_pct || 0}%</span>
        </div> */}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {TABS.map(t => {
  const Icon     = ICON_MAP[t.icon];
  const isActive = activeTab === t.id;
  const hasBadge = t.id === "notifications" && unread > 0;
  return (
    <button key={t.id} onClick={() => onTabChange(t.id)} style={{
      display: "flex", alignItems: "center", gap: 9,
      padding: "8px 10px", borderRadius: 9,
      fontSize: 12, fontWeight: isActive ? 700 : 500,
      textAlign: "left", width: "100%",
      border: isActive ? `1px solid ${vipColor}28` : "1px solid transparent",
      background: isActive ? `${vipColor}10` : "transparent",
      color: isActive ? vipColor : "rgba(255,255,255,0.4)",
      cursor: "pointer", transition: "all 0.15s", position: "relative",
    }}>
      {/* ── Icon slot ── */}
      {t.id === "notifications" && hasBadge ? (
        <img
          src={ANIMATED_BELL_URL}
          alt="notifications"
          style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }}
        />
      ) : (
        Icon && <Icon size={13} />
      )}

      {t.label}

      {/* ── Unread count badge ── */}
      {hasBadge && (
        <span style={{
          marginLeft: "auto",
          fontSize: 9, fontWeight: 900, padding: "1px 6px",
          borderRadius: 20, background: C.red, color: "white",
          animation: "notif-pulse 2s ease-in-out infinite",
          flexShrink: 0,
        }}>{unread}</span>
      )}
      {!hasBadge && isActive && (
        <ChevronRight size={10} style={{ marginLeft: "auto", opacity: 0.35 }} />
      )}
    </button>
  );
})}
      </nav>

      {/* Chat shortcuts */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, display: "flex", gap: 8 }}>
        <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 5, padding: "8px", borderRadius: 9,
          background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.2)",
          color: "#25d366", fontSize: 11, fontWeight: 700, textDecoration: "none",
        }}><MessageCircle size={12} /> WhatsApp</a>
        <a href="https://t.me/" target="_blank" rel="noopener noreferrer" style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 5, padding: "8px", borderRadius: 9,
          background: "rgba(0,136,204,0.1)", border: "1px solid rgba(0,136,204,0.2)",
          color: "#0088cc", fontSize: 11, fontWeight: 700, textDecoration: "none",
        }}><Send size={12} /> Telegram</a>
      </div>

      <button onClick={onLogout} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 10px", borderRadius: 9, fontSize: 12, fontWeight: 600,
        background: "none", border: "none", color: "rgba(248,113,113,0.6)",
        cursor: "pointer", width: "100%", marginTop: 6,
      }}><LogOut size={13} /> Sign Out</button>
    </aside>
  );
}

// ── Backdrop ──────────────────────────────────────────────────────────────────
function Backdrop({ onClick, zIndex = 115 }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClick}
      style={{
        position: "fixed", inset: 0, zIndex,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
      }}
    />
  );
}