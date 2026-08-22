import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Users, Wallet, Building2, Crown, Gift,
  Bell, FileText, Shield, Activity, UserCog, LogOut, Key,
  Eye, EyeOff, AlertCircle, CalendarDays, Spade, Handshake, MapPin, LayoutTemplate,
  LifeBuoy, Languages, // MULTILINGUAL-CHAT
  MessageSquare, // SUPPORT-SCRIPT
  ArrowDownCircle, ArrowUpCircle, Sparkles, // WALLET-REQUESTS / GIFTS-REWARDS
  MessageCircle, // LIVE-CHAT
  Percent, ChevronDown, // AFFILIATE-APPROVAL: sidebar groups + Commission Engine icon
  Club, // Teen Patti
  Layers, // Commission Rules
  LineChart, MousePointerClick, PlayCircle, Megaphone, UserCheck, // ANALYTICS
  Menu, X, // mobile off-canvas drawer controls
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
import TeenPattiManageTab   from "./tabs/content/TeenPattiManageTab";
import CommissionRulesTab   from "./tabs/CommissionRulesTab";
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
import SupportScriptsManageTab from "./tabs/content/SupportScriptsManageTab";  // SUPPORT-SCRIPT
import LiveSupportTab       from "./tabs/LiveSupportTab";              // LIVE-CHAT
// ANALYTICS: real first-party analytics dashboard tabs.
import SystemLogsTab       from "./tabs/SystemLogsTab";

import { Card, Toast, NotificationPopup } from "./components/SharedUI";
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
  MessageSquare, // SUPPORT-SCRIPT
  ArrowDownCircle, ArrowUpCircle, Sparkles, // WALLET-REQUESTS / GIFTS-REWARDS
  MessageCircle, // LIVE-CHAT
  Percent, // Affiliate Commissions — was referenced but never mapped/imported before this change
  Club, // Teen Patti
  Layers, // Commission Rules
  LineChart, MousePointerClick, PlayCircle, Megaphone, UserCheck, // ANALYTICS
};

// AFFILIATE-APPROVAL: sessionStorage keys for sidebar state that should
// survive a refresh (active tab/group shouldn't reset to Overview every
// reload).
const ACTIVE_TAB_KEY    = "admin_active_tab";
const OPEN_GROUPS_KEY   = "admin_sidebar_open_groups";
const LAST_ALERTED_KEY  = "admin_notif_last_alerted_id"; // highest Notification id already popped-up/chimed for

function initialTab() {
  // ?tab=<id> (used by the affiliate-registration email's CTA button and the
  // in-app notification popup's "Review Affiliate" button) wins over
  // whatever was last open, which wins over the "overview" default.
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("tab");
    if (fromQuery && ADMIN_TABS.some(t => t.id === fromQuery)) return fromQuery;
  } catch {}
  try {
    const stored = sessionStorage.getItem(ACTIVE_TAB_KEY);
    if (stored && ADMIN_TABS.some(t => t.id === stored)) return stored;
  } catch {}
  return "overview";
}

function groupForTab(tabId) {
  return ADMIN_NAV_GROUPS.find(g => g.items.some(i => i.id === tabId))?.group;
}

function initialOpenGroups() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(OPEN_GROUPS_KEY) || "null");
    if (stored && typeof stored === "object") return stored;
  } catch {}
  return {}; // absent = open (see isGroupOpen) — every group starts expanded
}

// Single rising tone via the Web Audio API — same technique as
// LiveSupportTab.jsx's playChime() (no binary asset needed/exists in this
// frontend), pitched differently so the two are distinguishable by ear.
function playNotifChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.16, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.28);
    });
  } catch { /* best-effort only */ }
}

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
  const [tab,       setTabState]  = useState(initialTab);
  const [openGroups, setOpenGroups] = useState(initialOpenGroups);
  const [toast,     setToast]     = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  // LIVE-CHAT: sidebar unread badge — polls independently of whether the
  // "Live Support" tab is actually open (that tab keeps its own WebSocket
  // connection for its own live view while it's mounted).
  const [liveSupportUnread, setLiveSupportUnread] = useState(0);
  // AFFILIATE-APPROVAL: sidebar "Notifications" badge + the popup below,
  // both fed by the same poll of the existing per-user Notification model
  // (GET /api/user/notifications/, already used by the player dashboard and
  // affiliate panel — see authapp/views/user_views.py). Not WebSocket-based:
  // the only real-time channel in this app is chat-specific, and the channel
  // layer silently no-ops without REDIS_URL configured, so polling (like the
  // live-chat badge above) is the mechanism that's guaranteed to work.
  const [adminNotifUnread, setAdminNotifUnread] = useState(0);
  const [notifPopup, setNotifPopup] = useState(null);

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

  const setTab = (id) => {
    setTabState(id);
    try { sessionStorage.setItem(ACTIVE_TAB_KEY, id); } catch {}
    const g = groupForTab(id);
    if (g) setOpenGroups(prev => {
      if (prev[g] !== false) return prev; // already open (or unset = open)
      const next = { ...prev, [g]: true };
      try { sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    if (isMobile) setSidebarOpen(false); // navigating on mobile closes the drawer
  };

  const toggleGroup = (g) => {
    setOpenGroups(prev => {
      const next = { ...prev, [g]: prev[g] === false ? true : false };
      try { sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const isGroupOpen = (g) => openGroups[g] !== false;

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

  // AFFILIATE-APPROVAL: admin notification poll — popup + one-time chime for
  // genuinely new items, badge count for everything unread. "Genuinely new"
  // is tracked separately from the server's is_read flag via the highest
  // notification id already alerted-on, persisted to localStorage (mirrors
  // LiveSupportTab.jsx's SOUND_PREF_KEY pattern) — is_read only changes when
  // an admin explicitly reads it, which would otherwise mean an unread item
  // keeps re-popping/re-chiming on every 20s poll forever.
  useEffect(() => {
    if (!authed) return undefined;
    const poll = async () => {
      try {
        const r = await adminFetch(`${API}/api/user/notifications/`);
        const list = await r?.json();
        if (!Array.isArray(list)) return;
        setAdminNotifUnread(list.filter(n => !n.is_read).length);

        const lastAlerted = Number(localStorage.getItem(LAST_ALERTED_KEY) || 0);
        const registrationAlerts = list.filter(n => n.icon === "affiliate_registration");
        const unseen = registrationAlerts.filter(n => n.id > lastAlerted);
        if (unseen.length > 0) {
          const newest = unseen.reduce((a, b) => (a.id > b.id ? a : b));
          setNotifPopup(newest);
          playNotifChime();
        }
        const highestId = registrationAlerts.reduce((max, n) => Math.max(max, n.id), lastAlerted);
        if (highestId > lastAlerted) localStorage.setItem(LAST_ALERTED_KEY, String(highestId));
      } catch { /* keep previous state on a transient failure */ }
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
    const props = { onToast: showToast, onNavigate: setTab };
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
      case "teen-patti":return <TeenPattiManageTab   {...props} />;
      case "promotions":return <PromotionsManageTab  {...props} />;
      case "locations": return <LocationsManageTab   {...props} />;
      case "landing":   return <LandingManageTab     {...props} />;
      case "affiliates":return <AffiliatesTab        {...props} />;
      case "affiliate-withdrawals": return <AffiliateWithdrawalsTab {...props} />; // AFFILIATE-WITHDRAWALS
      case "affiliate-commissions": return <AffiliateCommissionsTab {...props} />; // Commission Engine
      case "commission-rules": return <CommissionRulesTab {...props} />; // Country+Casino+Tier rules
      // MULTILINGUAL-CHAT: 2 new cases
      case "support-tickets":  return <SupportTicketsTab  {...props} />;
      case "support-settings": return <SupportSettingsTab {...props} />;
      case "support-scripts": return <SupportScriptsManageTab {...props} />;  // SUPPORT-SCRIPT
      case "live-support":     return <LiveSupportTab     {...props} />; // LIVE-CHAT
      // SYSTEM LOGS: one destination, five tabs inside it. The old
      // per-analytics ids still resolve here so a browser session holding one
      // of them in sessionStorage opens the page that now contains that view
      // rather than falling through to the default tab.
      case "system-logs":
      case "analytics-overview":
      case "analytics-urls":
      case "analytics-videos":
      case "analytics-campaigns":
      case "analytics-members":   return <SystemLogsTab        {...props} />;
      case "logs":      return <LogsTab           {...props} />;
      case "staff":     return <StaffTab          {...props} />;
      default:          return <OverviewTab       {...props} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Manrope', sans-serif", display: "flex" }}>

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
        zIndex: 40, overflow: "hidden",
        transition: "transform 0.2s ease",
        transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
      }}>
        {/* Logo — stays fixed above the scrolling nav below */}
        <div style={{ flexShrink: 0, marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
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
          <div style={{ flexShrink: 0, marginBottom: 16, padding: "10px 12px", borderRadius: 10, background: `${C.gold}10`, border: `1px solid ${C.gold}20` }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{adminUser.email}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{adminUser.role || "Admin"}</div>
          </div>
        )}

        {/* Nav groups — the only part that scrolls, so logo/badge above and
            Logout below stay put regardless of how many items are in view.
            Each group is collapsible; the group containing the active tab
            is force-opened by setTab(). */}
        <nav className="admin-sidebar-nav" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, marginRight: -6, paddingRight: 6 }}>
          {ADMIN_NAV_GROUPS.map(g => {
            const open = isGroupOpen(g.group);
            return (
              <div key={g.group} style={{ marginBottom: 2 }}>
                <button onClick={() => toggleGroup(g.group)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "10px 10px 6px", background: "none", border: "none",
                    cursor: "pointer", textAlign: "left",
                  }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>
                    {g.group}
                  </span>
                  <ChevronDown size={11} style={{ color: C.dim, transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
                </button>
                {open && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {g.items.map(t => {
                      const Icon = ICON_MAP[t.icon];
                      const active = tab === t.id;
                      return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "9px 12px", borderRadius: 10,
                            fontSize: 12, fontWeight: active ? 700 : 500,
                            textAlign: "left", width: "100%", cursor: "pointer",
                            border: active ? `1px solid ${C.gold}30` : "1px solid transparent",
                            background: active ? `${C.gold}12` : "transparent",
                            color: active ? C.gold : C.muted,
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.text; } }}
                          onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.muted; } }}
                        >
                          {Icon && <Icon size={13} />}
                          {t.label}
                          {t.id === "wallet" && (
                            <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 900, padding: "1px 5px", borderRadius: 20, background: C.orange, color: "white" }}>NEW</span>
                          )}
                          {t.id === "live-support" && liveSupportUnread > 0 && (
                            <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", background: "#ff3366", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {liveSupportUnread}
                            </span>
                          )}
                          {t.id === "notifications" && adminNotifUnread > 0 && (
                            <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", background: "#ff3366", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {adminNotifUnread}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Logout — stays fixed at the bottom */}
        <button onClick={logout}
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, background: "none", border: "none", color: "rgba(248,113,113,0.7)", cursor: "pointer", width: "100%", marginTop: 8 }}>
          <LogOut size={13} /> Logout
        </button>
      </aside>
      <style>{`
        .admin-sidebar-nav::-webkit-scrollbar { width: 5px; }
        .admin-sidebar-nav::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.25); border-radius: 10px; }
        .admin-sidebar-nav::-webkit-scrollbar-track { background: transparent; }
      `}</style>

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

      {/* New-affiliate-registration popup — separate from Toast above since
          it needs structured fields + an action button, not just a one-line
          message (see SharedUI.NotificationPopup). */}
      <AnimatePresence>
        {notifPopup && (
          <NotificationPopup
            notif={notifPopup}
            onReview={() => {
              adminFetch(`${API}/api/user/notifications/${notifPopup.id}/read/`, { method: "POST" }).catch(() => {});
              setAdminNotifUnread(n => Math.max(0, n - 1));
              setNotifPopup(null);
              setTab("affiliates");
            }}
            onDismiss={() => setNotifPopup(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
