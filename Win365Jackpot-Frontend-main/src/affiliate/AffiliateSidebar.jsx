import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Menu, X, LifeBuoy } from "lucide-react";

export const SIDEBAR_WIDTH = 228;

export function useBreakpoint() {
  const get = () => (window.innerWidth >= 1024 ? "desktop" : "mobile");
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return bp;
}

export default function AffiliateSidebar({ C, affiliateUser, activeTab, onTabChange, onLogout, unread, tabs }) {
  const bp = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { if (bp === "desktop") setDrawerOpen(false); }, [bp]);

  const handleTabChange = (id) => {
    onTabChange(id);
    if (bp !== "desktop") setDrawerOpen(false);
  };

  const content = (
    <aside style={{
      width: SIDEBAR_WIDTH, flexShrink: 0,
      borderRight: `1px solid ${C.border}`,
      background: "rgba(6,8,14,0.98)",
      padding: "20px 14px",
      display: "flex", flexDirection: "column",
      height: "100vh", overflowY: "auto",
      position: "fixed", top: 0, left: 0, zIndex: 110,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, paddingLeft: 4 }}>
        <div onClick={() => window.location.href = "/"} style={{ cursor: "pointer" }}>
          <img src="/images/jackpotsworld_watermark.png" className="w-10 h-10 object-contain" />
          <div className="flex flex-col leading-none">
            <span className="font-bold text-xl md:text-2xl gold-text font-black tracking-wider">Jackpots</span>
            <span className="font-body text-xs tracking-[0.4em] text-gold/70 uppercase">World</span>
          </div>
        </div>
        {bp !== "desktop" && (
          <button onClick={() => setDrawerOpen(false)} style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "rgba(255,255,255,0.4)",
          }}><X size={13} /></button>
        )}
      </div>

      {/* Affiliate card */}
      <div style={{ marginBottom: 14, padding: "12px 10px", borderRadius: 12, background: `${C.gold}10`, border: `1px solid ${C.gold}28` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.gold}, ${C.gold}80)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 900, color: "#06080E", flexShrink: 0,
          }}>
            {(affiliateUser?.name || affiliateUser?.email || "A")[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {affiliateUser?.name || affiliateUser?.email?.split("@")[0]}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
              background: `${C.gold}20`, border: `1px solid ${C.gold}40`, color: C.gold,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Affiliate</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const hasBadge = tab.id === "notifications" && unread > 0;
          return (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 10,
              fontSize: 12, fontWeight: isActive ? 700 : 500,
              textAlign: "left", width: "100%",
              border: isActive ? `1px solid ${C.gold}28` : "1px solid transparent",
              background: isActive ? `${C.gold}10` : "transparent",
              color: isActive ? C.gold : "rgba(255,255,255,0.4)",
              cursor: "pointer", transition: "all 0.15s", position: "relative",
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; } }}
            >
              {Icon && <Icon size={13} />}
              {tab.label}
              {hasBadge && (
                <span style={{
                  marginLeft: "auto", fontSize: 9, fontWeight: 900, padding: "1px 6px",
                  borderRadius: 20, background: C.red, color: "white", flexShrink: 0,
                }}>{unread}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Live chat */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8 }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-chat"))}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, padding: "8px", borderRadius: 9,
            background: `${C.blue}12`, border: `1px solid ${C.blue}30`,
            color: C.blue, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}
        >
          <LifeBuoy size={12} /> Live Chat
        </button>
      </div>

      <button onClick={onLogout} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 10px", borderRadius: 9, fontSize: 12, fontWeight: 600,
        background: "none", border: "none", color: "rgba(248,113,113,0.6)",
        cursor: "pointer", width: "100%", marginTop: 6,
      }}><LogOut size={13} /> Sign Out</button>
    </aside>
  );

  if (bp === "desktop") return content;

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
              background: "rgba(6,8,14,0.95)", border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.gold,
            }}
          >
            <Menu size={18} />
            {unread > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%",
                background: C.red, fontSize: 8, fontWeight: 900, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #06080E",
              }}>{unread > 9 ? "9+" : unread}</span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 135, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
            />
            <motion.div
              key="drawer"
              initial={{ x: -310 }} animate={{ x: 0 }} exit={{ x: -310 }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              style={{ position: "fixed", top: 0, left: 0, zIndex: 140, height: "100vh" }}
            >
              {content}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
