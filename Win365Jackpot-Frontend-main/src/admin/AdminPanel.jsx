import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Users, Wallet, Building2, Crown, Gift,
  Bell, FileText, Shield, Activity, UserCog, LogOut, Key,
  Eye, EyeOff, AlertCircle, CalendarDays, Spade, Handshake, MapPin, LayoutTemplate,
  LifeBuoy, Languages, // MULTILINGUAL-CHAT
  ArrowDownCircle, ArrowUpCircle, Sparkles, // WALLET-REQUESTS / GIFTS-REWARDS
  MessageCircle, // LIVE-CHAT
  LayoutDashboard, ShieldCheck, History, Dices, Megaphone, UsersRound,
  Landmark, Award, FileEdit, Network, Headset, Settings, ChevronDown,
  Menu, X, // sidebar reorg: group chevrons + mobile drawer controls
  Percent, // Affiliate Commissions — was referenced in constants.js but never
           // actually imported/registered, so this icon silently never
           // rendered even before this reorganization; fixed while here.
} from "lucide-react";

import OverviewTab       from "./tabs/OverviewTab";
import UsersTab          from "./tabs/UsersTab";
import WalletTab         from "./tabs/WalletTab";
import OfflineDepositTab from "./tabs/offline_deposits/OfflineDepositTab";
import VIPTab            from "./tabs/VIPTab";
import WheelsTab         from "./tabs/WheelsTab";
import NotifsTab         from "./tabs/NotifsTab";
import TxnsTab           from "./tabs/TxnsTab";
import KycTab            from "./tabs/KycTab";
import LogsTab           from "./tabs/LogsTab";
import StaffTab          from "./tabs/StaffTab";
import EventsManageTab      from "./tabs/content/EventsManageTab";
import PokerManageTab       from "./tabs/content/PokerManageTab";
import PromotionsManageTab  from "./tabs/content/PromotionsManageTab";
import LocationsManageTab   from "./tabs/content/LocationsManageTab";
import LandingManageTab     from "./tabs/content/LandingManageTab";
import AffiliatesTab        from "./tabs/AffiliatesTab";
import AffiliateWithdrawalsTab from "./tabs/AffiliateWithdrawalsTab"; // AFFILIATE-WITHDRAWALS
import AffiliateCommissionsTab from "./tabs/AffiliateCommissionsTab"; // Commission Engine
import DepositRequestsTab    from "./tabs/DepositRequestsTab";     // WALLET-REQUESTS
import WithdrawalRequestsTab from "./tabs/WithdrawalRequestsTab";  // WALLET-REQUESTS
import GiftsRewardsTab       from "./tabs/GiftsRewardsTab";        // GIFTS-REWARDS
import SupportTicketsTab    from "./tabs/SupportTicketsTab";           // MULTILINGUAL-CHAT
import SupportSettingsTab   from "./tabs/content/SupportSettingsTab";  // MULTILINGUAL-CHAT
import LiveSupportTab       from "./tabs/LiveSupportTab";              // LIVE-CHAT

import { Card, Toast } from "./components/SharedUI";
import { API, adminFetch } from "./helpers";
import { endSession, noteLogin } from "../services/sessionManager";
import { C, ADMIN_TABS, ADMIN_NAV_GROUPS } from "./constants";

import AdminWalletBanner from "./AdminWalletBanner";
import { AdminThemeProvider, useAdminTheme } from "./context/AdminThemeContext";
import AdminThemeToggle from "./components/AdminThemeToggle";
import Logo from "../components/shared/Logo";
import BrandMark from "../components/shared/BrandMark";


const ICON_MAP = {
  BarChart3, Users, Wallet, Building2, Crown, Gift,
  Bell, FileText, Shield, Activity, UserCog, CalendarDays, Spade, Handshake, MapPin, LayoutTemplate,
  LifeBuoy, Languages, // MULTILINGUAL-CHAT
  ArrowDownCircle, ArrowUpCircle, Sparkles, // WALLET-REQUESTS / GIFTS-REWARDS
  MessageCircle, // LIVE-CHAT
  LayoutDashboard, ShieldCheck, History, Dices, Megaphone, UsersRound,
  Landmark, Award, FileEdit, Network, Headset, Settings, Percent,
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Login Screen
// ─────────────────────────────────────────────────────────────────────────────

function AdminLoginScreen({ onSuccess }) {
  const { C, theme } = useAdminTheme();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/auth/admin-login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      // console.log("ADMIN LOGIN RESPONSE:", json); use for dev 
      if (res.ok && json.user?.is_staff) {
        localStorage.setItem("admin_token", json.tokens?.access || json.access);
        localStorage.setItem("admin_refresh", json.tokens?.refresh || json.refresh);
        localStorage.setItem("admin_user",    JSON.stringify(json.user));
        // Start the inactivity clock fresh for the new session.
        noteLogin();
        onSuccess();
      } else {
        setError(json.error || "Invalid admin credentials.");
      }
    } catch { setError("Network error. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${C.gold}18, transparent 60%)` }} />
      </div>
      <div style={{ position: "fixed", top: 18, right: 18 }}><AdminThemeToggle /></div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <Logo size="md" />
          </div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.4em", textTransform: "uppercase" }}>Admin Panel</div>
        </div>
        <Card style={{ padding: 28, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Key size={16} style={{ color: C.gold }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Admin Login</div>
              <div style={{ fontSize: 11, color: C.muted }}>Staff access only</div>
            </div>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@jackpotswrld.casino"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.border = `1px solid ${C.gold}60`}
                onBlur={e  => e.target.style.border = `1px solid ${C.border}`} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
                  style={{ width: "100%", padding: "11px 44px 11px 14px", borderRadius: 10, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => e.target.style.border = `1px solid ${C.gold}60`}
                  onBlur={e  => e.target.style.border = `1px solid ${C.border}`} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 0 }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <button type="submit" disabled={loading || !email || !password}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 14, fontWeight: 800, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: (!email || !password) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading
                ? <><div style={{ width: 14, height: 14, border: "2px solid transparent", borderTopColor: "#07080F", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Authenticating…</>
                : <><Key size={14} /> Sign In</>}
            </button>
          </form>
        </Card>
      </motion.div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Admin Panel
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  return (
    <AdminThemeProvider>
      <AdminPanelInner />
    </AdminThemeProvider>
  );
}

function AdminPanelInner() {
  const { C } = useAdminTheme();
  const [authed,    setAuthed]    = useState(false);
  // Persisted across refreshes so re-loading the panel reopens the same
  // page instead of always resetting to Overview.
  const [tab,       setTab]       = useState(() => {
    try { return localStorage.getItem("admin_active_tab") || "overview"; } catch { return "overview"; }
  });
  const [toast,     setToast]     = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  // LIVE-CHAT: sidebar unread badge — polls independently of whether the
  // "Live Support" tab is actually open (that tab keeps its own WebSocket
  // connection for its own live view while it's mounted).
  const [liveSupportUnread, setLiveSupportUnread] = useState(0);

  // Which collapsible nav groups are open — defaults to all-open so every
  // feature stays discoverable; the group containing the active tab is
  // always treated as open too (see activeGroupId below), even if the admin
  // had manually collapsed it, so navigating there never hides the page.
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(ADMIN_NAV_GROUPS.filter(g => g.type === "group").map(g => g.id))
  );
  const activeGroupId = ADMIN_NAV_GROUPS.find(
    g => g.type === "group" && g.items.some(i => i.id === tab)
  )?.id;
  const toggleGroup = (id) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Sidebar becomes an off-canvas drawer below the tablet breakpoint —
  // desktop/laptop keep the always-visible layout unchanged.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const selectTab = (id) => {
    setTab(id);
    try { localStorage.setItem("admin_active_tab", id); } catch {}
    if (isMobile) setSidebarOpen(false);
  };

  useEffect(() => {
    if (!authed) return undefined;
    const poll = async () => {
      try {
        const r = await adminFetch(`${API}/api/admin-panel/live-chat/list/`);
        const j = await r?.json();
        const list = Array.isArray(j) ? j : j?.results || [];
        setLiveSupportUnread(list.reduce((sum, s) => sum + (s.unread_count || 0), 0));
      } catch { /* keep previous count on a transient failure */ }
    };
    poll();
    const interval = setInterval(poll, 20000);
    return () => clearInterval(interval);
  }, [authed]);

  useEffect(() => {
    const init = async () => {
      try {
        const user = JSON.parse(localStorage.getItem("admin_user") || "{}");
        const token = localStorage.getItem("admin_token");
        if (!user?.is_staff || !token) return;

        // Re-validate the token against the backend rather than trusting
        // the client-supplied is_staff flag alone — a forged localStorage
        // value would otherwise render the panel shell before any real API
        // call happens.
        const r = await adminFetch(`${API}/api/admin-panel/stats/`);
        if (r && r.ok) {
          setAuthed(true);
          setAdminUser(user);
        } else {
          ["admin_token", "admin_refresh", "admin_user"].forEach(k => localStorage.removeItem(k));
        }
      } catch {}
    };
    init();
  }, []);

  const showToast = (msg, ok = true) => setToast({ msg, ok });

  // Routed through the session manager so the refresh token is blacklisted,
  // every cached copy of the admin session is wiped, and any other open tab
  // logs out too. It replaces the document (not a client-side navigate) so
  // the authenticated panel is gone from history and from memory.
  const logout = () => endSession({ roles: ["admin"], reason: "manual", redirectTo: "/admin-panel" });

  if (!authed) return (
    <AdminLoginScreen onSuccess={() => {
      setAuthed(true);
      try { setAdminUser(JSON.parse(localStorage.getItem("admin_user") || "{}")); } catch {}
    }} />
  );
  

  const renderTab = () => {
    const props = { onToast: showToast };
    switch (tab) {
      case "overview":  return <OverviewTab       {...props} />;
      case "users":     return <UsersTab          {...props} />;
      case "wallet":    return <WalletTab         {...props} />;
      case "deposits":  return <OfflineDepositTab {...props} />;
      case "deposit-requests":    return <DepositRequestsTab    {...props} />; // WALLET-REQUESTS
      case "withdrawal-requests": return <WithdrawalRequestsTab {...props} />; // WALLET-REQUESTS
      case "vip":       return <VIPTab            {...props} />;
      case "rewards":   return <WheelsTab         {...props} />;
      case "gifts-rewards": return <GiftsRewardsTab {...props} />; // GIFTS-REWARDS
      case "notifications": return <NotifsTab     {...props} />;
      case "transactions":  return <TxnsTab       {...props} />;
      case "kyc":       return <KycTab            {...props} />;
      case "events":    return <EventsManageTab     {...props} />;
      case "poker":     return <PokerManageTab       {...props} />;
      case "promotions":return <PromotionsManageTab  {...props} />;
      case "locations": return <LocationsManageTab   {...props} />;
      case "landing":   return <LandingManageTab     {...props} />;
      case "affiliates":return <AffiliatesTab        {...props} />;
      case "affiliate-withdrawals": return <AffiliateWithdrawalsTab {...props} />; // AFFILIATE-WITHDRAWALS
      case "affiliate-commissions": return <AffiliateCommissionsTab {...props} />; // Commission Engine
      // MULTILINGUAL-CHAT: 2 new cases
      case "support-tickets":  return <SupportTicketsTab  {...props} />;
      case "support-settings": return <SupportSettingsTab {...props} />;
      case "live-support":     return <LiveSupportTab     {...props} />; // LIVE-CHAT
      case "logs":      return <LogsTab           {...props} />;
      case "staff":     return <StaffTab          {...props} />;
      default:          return <OverviewTab       {...props} />;
    }
  };

  // Shared button styling for both the pinned Overview item and every
  // nested group item — identical look, so factored out once rather than
  // duplicated per render site.
  const navItemStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 12px", borderRadius: 10,
    fontSize: 12, fontWeight: active ? 700 : 500,
    textAlign: "left", width: "100%", cursor: "pointer",
    border: active ? `1px solid ${C.gold}30` : "1px solid transparent",
    background: active ? `${C.gold}12` : "transparent",
    color: active ? C.gold : C.muted,
    transition: "all 0.15s",
  });
  const navItemHover = (e, active, entering) => {
    if (active) return;
    e.currentTarget.style.background = entering ? C.hoverBg : "transparent";
    e.currentTarget.style.color = entering ? C.text : C.muted;
  };
  const groupHeaderStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", borderRadius: 8,
    fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
    textAlign: "left", width: "100%", cursor: "pointer",
    background: "transparent", border: "none", color: C.muted,
  };

  const renderBadge = (id) => (
    <>
      {id === "wallet" && (
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 900, padding: "1px 5px", borderRadius: 20, background: C.orange, color: "white" }}>NEW</span>
      )}
      {id === "live-support" && liveSupportUnread > 0 && (
        <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", background: "#ff3366", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {liveSupportUnread}
        </span>
      )}
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Manrope', sans-serif", display: "flex" }}>

      {/* Themed scrollbar for the sidebar nav region only — subtle, matches
          the dark/gold theme in both light and dark admin themes. */}
      <style>{`
        .admin-sidebar-scroll::-webkit-scrollbar { width: 6px; }
        .admin-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb { background: ${C.gold}30; border-radius: 10px; }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: ${C.gold}55; }
      `}</style>

      {/* Mobile hamburger — only rendered below the drawer breakpoint */}
      {isMobile && (
        <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"
          style={{
            position: "fixed", top: 16, left: 16, zIndex: 30,
            width: 38, height: 38, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: C.panelBg, border: `1px solid ${C.border}`, color: C.text, cursor: "pointer",
          }}>
          <Menu size={17} />
        </button>
      )}

      {/* Backdrop — closes the drawer on click, mobile only */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 35 }} />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: 228, flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        background: C.panelBg,
        padding: "22px 14px",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, height: "100vh",
        zIndex: 40,
        transition: "transform 0.2s ease",
        transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
      }}>
        {/* Logo — stays fixed, never scrolls with the nav below it */}
        <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
          <div>
            <BrandMark size={40} />
    <Logo size="md" />
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.3em", textTransform: "uppercase" }}>Admin Panel</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AdminThemeToggle size={28} />
            {isMobile && (
              <button onClick={() => setSidebarOpen(false)} aria-label="Close menu"
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Admin user badge — also fixed */}
        {adminUser && (
          <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 10, background: `${C.gold}10`, border: `1px solid ${C.gold}20`, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{adminUser.email}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{adminUser.role || "Admin"}</div>
          </div>
        )}

        {/* Nav — the only scrollable region, so long lists never push the
            logo/header off-screen or overflow the viewport. */}
        <nav className="admin-sidebar-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
          {ADMIN_NAV_GROUPS.map(g => {
            if (g.type === "pinned") {
              const Icon = ICON_MAP[g.icon];
              const active = tab === g.id;
              return (
                <button key={g.id} onClick={() => selectTab(g.id)} style={navItemStyle(active)}
                  onMouseEnter={e => navItemHover(e, active, true)} onMouseLeave={e => navItemHover(e, active, false)}>
                  {Icon && <Icon size={13} />}
                  {g.label}
                </button>
              );
            }
            const GroupIcon = ICON_MAP[g.icon];
            const isOpen = expandedGroups.has(g.id) || g.id === activeGroupId;
            return (
              <div key={g.id} style={{ marginTop: 8 }}>
                <button onClick={() => toggleGroup(g.id)} style={groupHeaderStyle}
                  onMouseEnter={e => e.currentTarget.style.color = C.text}
                  onMouseLeave={e => e.currentTarget.style.color = C.muted}>
                  {GroupIcon && <GroupIcon size={12} />}
                  <span style={{ flex: 1 }}>{g.label}</span>
                  <ChevronDown size={12} style={{ transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }} style={{ overflow: "hidden" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
                        {g.items.map(t => {
                          const Icon = ICON_MAP[t.icon];
                          const active = tab === t.id;
                          return (
                            <button key={t.id} onClick={() => selectTab(t.id)} style={navItemStyle(active)}
                              onMouseEnter={e => navItemHover(e, active, true)} onMouseLeave={e => navItemHover(e, active, false)}>
                              {Icon && <Icon size={13} />}
                              {t.label}
                              {renderBadge(t.id)}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Logout — stays fixed at the bottom */}
        <button onClick={logout}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, background: "none", border: "none", color: "rgba(248,113,113,0.7)", cursor: "pointer", width: "100%", marginTop: 8, flexShrink: 0 }}>
          <LogOut size={13} /> Logout
        </button>
      </aside>

      {/* ── Main content ── */}
      {/* <AdminWalletBanner /> */}
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 228, padding: 26, paddingTop: isMobile ? 70 : 26, minHeight: "100vh", overflowX: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>
            {ADMIN_TABS.find(t => t.id === tab)?.label || "Overview"}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
            {adminUser?.user_uid || adminUser?.email || ""}
          </div>
        </div>

        {/* Tab content */}
        <motion.div key={tab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}>
          {renderTab()}
        </motion.div>
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}