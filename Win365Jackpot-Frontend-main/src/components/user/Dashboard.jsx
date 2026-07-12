import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

// ── Constants & Helpers ──────────────────────────────────────────────────────
import { C, VIP_COLOR, TABS } from "./constants";
import { authFetch, API } from "./helpers";
import { revokeSession } from "../../services/authRevoke";
import { getToken, clearSession } from "../../services/authStorage";

// ── Shared UI ─────────────────────────────────────────────────────────────────
import { Toast, UidBadge, LoadingScreen, ErrorScreen } from "./components/SharedUI";

// ── Sidebar — also imports the breakpoint hook + width constants ───────────────
import Sidebar, { useBreakpoint, SIDEBAR_WIDTH, RAIL_WIDTH, TAB_I18N_KEY } from "./components/Sidebar";

// ── Tab Pages ─────────────────────────────────────────────────────────────────
import OverviewTab       from "./tabs/Validations/OverviewTab";
import WalletTab         from "./tabs/stats//WalletTab";
import TravelTab         from "./tabs/Validations/TravelTab";
import GiftsTab          from "./tabs/Validations/GiftsTab";
import PackagesTab       from "./tabs/Validations/PackagesTab";
import FavouritesTab     from "./tabs/Validations/FavouritesTab";
import BonusTab          from "./tabs/Validations/BonusTab";
import RewardsTab        from "./tabs/Validations/RewardsTab";
import NotificationsTab  from "./tabs/Validations/NotificationsTab";
import ReferralTab       from "./tabs/Validations/ReferralTab";
import ProfileTab        from "./tabs/Validations/ProfileTab";
import SupportTab        from "./tabs/Validations/SupportTab";
import ResponsibleGamblingTab from "./tabs/Validations/ResponsibleGamblingTab";
import SpinWheelModal     from "./SpinWheelModal";
import ChatBot            from "../ChatBot";

// ═════════════════════════════════════════════════════════════════════════════
// BannedScreen
// ═════════════════════════════════════════════════════════════════════════════
function BannedScreen({ message, supportEmail, onLogout }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a0f", flexDirection: "column", gap: 20,
      fontFamily: "'Manrope', sans-serif",
    }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
          width: 600, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(248,113,113,0.07), transparent 65%)",
          filter: "blur(60px)",
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
        style={{
          position: "relative", zIndex: 1,
          maxWidth: 460, width: "90%",
          padding: "40px 44px", borderRadius: 20,
          background: "#0f0f16", border: "1px solid rgba(248,113,113,0.25)",
          boxShadow: "0 0 60px rgba(248,113,113,0.06)", textAlign: "center",
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, margin: "0 auto 20px",
        }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 10, letterSpacing: "-0.01em" }}>
          Account on hold
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.75, marginBottom: 28, whiteSpace: "pre-line" }}>
          {message}
        </div>
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
          fontSize: 11, color: "rgba(248,113,113,0.7)", marginBottom: 24, lineHeight: 1.6,
        }}>
          If you believe this is a mistake, please contact our support team
          {supportEmail ? `: ${supportEmail}` : "."}
        </div>
        <button
          onClick={onLogout}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
            color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.18)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(248,113,113,0.1)"}
        >Sign out</button>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Dashboard
// ═════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { t } = useTranslation();

  const navigate = useNavigate();
  const bp       = useBreakpoint(); // ← reactive breakpoint

  const [tab,                setTab]                = useState("overview");
  const [data,               setData]               = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [error,              setError]              = useState(null);
  const [toast,              setToast]              = useState(null);
  const [checked,            setChecked]            = useState(false);
  const [bannedMessage,      setBannedMessage]      = useState(null);
  const [bannedSupportEmail, setBannedSupportEmail] = useState(null);
  const [notifCount,         setNotifCount]         = useState(0);
  const [showSpin,           setShowSpin]           = useState(false);

  // ── Compute responsive left margin ────────────────────────────────────────
  // desktop  → full sidebar width
  // tablet   → icon rail width
  // mobile   → 0 (sidebar is overlay only)
  const mainMarginLeft =
    bp === "desktop" ? SIDEBAR_WIDTH :
    bp === "tablet"  ? RAIL_WIDTH    : 0;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchNotifCount = useCallback(async () => {
    try {
      // /api/user/profile/ (ProfileView) doesn't include unread_notifications —
      // only /api/user/dashboard/ (UserDashboardView) does.
      const res = await authFetch(`${API}/api/user/dashboard/`);
      if (!res.ok) return;
      const d = await res.json();
      setNotifCount(d.unread_notifications || 0);
    } catch {}
  }, []);

  const fetchDashboard = useCallback(async () => {
    
    try {
      setLoading(true);
      setError(null);
      setBannedMessage(null);
      setBannedSupportEmail(null);

      const res = await authFetch(`${API}/api/user/profile/`);
      if (!res) { navigate("/"); return; }

      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        if (j.banned) { setBannedMessage(j.message); setBannedSupportEmail(j.support_email); setLoading(false); return; }
        navigate("/"); return;
      }
      if (res.status === 401) { navigate("/"); return; }
      if (!res.ok) { setError("Failed to load dashboard."); return; }

      setData(await res.json());
    } catch {
      setError("Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
  const token = getToken("access");

  if (!token) {
    navigate("/sign-in", { replace: true });
  } else {
    setChecked(true);
  }
}, [navigate]);

  useEffect(() => { if (!checked) return; fetchDashboard(); }, [checked, fetchDashboard]);

  useEffect(() => {
    if (!checked) return;
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 5000);
    return () => clearInterval(interval);
  }, [checked, fetchNotifCount]);

  // Daily Login Spin Wheel — show once per calendar day, only if the user
  // still has spins left this month. The "already shown today" flag is a
  // pure UX nicety (don't show it in an admin's face every tab switch);
  // the real spins-remaining cap is enforced server-side regardless.
  useEffect(() => {
    if (!checked) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("spin_last_shown") === today) return;
    authFetch(`${API}/api/spin/status/`)
      .then(r => r?.json())
      .then(d => {
        if (d?.spins_remaining > 0) {
          setShowSpin(true);
          localStorage.setItem("spin_last_shown", today);
        }
      })
      .catch(() => {});
  }, [checked]);

  if (!checked) return null;

  const showToast = (msg, ok = true) => setToast({ msg, ok });

  const logout = async () => {
  await revokeSession("access", "refresh");
  clearSession(["access", "refresh", "user"]);
  navigate("/", { replace: true });
};

  if (bannedMessage) return <BannedScreen message={bannedMessage} supportEmail={bannedSupportEmail} onLogout={logout} />;
  if (loading)       return <LoadingScreen />;
  if (error)         return <ErrorScreen message={error} onRetry={fetchDashboard} />;

  const profile             = data;
  const stats               = data;
  const recent_transactions = data?.recent_transactions;
  const vip_benefits        = data?.vip_benefits;
  const vipColor            = VIP_COLOR[profile?.vip_level] || C.gold;


  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: "white",
      fontFamily: "'Manrope', sans-serif",
      display: "flex",
    }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "5%", left: "15%", width: 600, height: 600, borderRadius: "50%",
          background: `radial-gradient(circle, ${vipColor}0A, transparent 65%)`, filter: "blur(50px)",
        }} />
        <div style={{
          position: "absolute", bottom: "15%", right: "5%", width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, #4F1B8E12, transparent 60%)", filter: "blur(40px)",
        }} />
      </div>

      {/* Sidebar — renders its own layout (fixed rail / floating hamburger) */}
      <Sidebar
        profile={profile}
        stats={{ unread_notifications: notifCount }}
        activeTab={tab}
        onTabChange={setTab}
        onLogout={logout}
      />

      {/* ── Main content — margin adapts to breakpoint ───────────────────── */}
      <main style={{
        flex: 1,
        marginLeft: mainMarginLeft,
        // Smooth transition so the layout shift isn't jarring on resize
        transition: "margin-left 0.25s ease",
        padding: bp === "mobile" ? "64px 16px 24px" : 26,
        minHeight: "100vh",
        overflowX: "hidden",
        position: "relative",
        zIndex: 1,
        // Ensure it never overflows the viewport on mobile
        maxWidth: "100vw",
        boxSizing: "border-box",
      }}>
        {/* Top bar */}
<div style={{ 
  display: "flex", 
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 22,
}}>
  {/* Left — spacer on mobile (hamburger is fixed, not in flow) */}
  {bp === "mobile" ? (
    <div style={{
      fontSize: 18,
      fontWeight: 900,
      color: C.gold,
      letterSpacing: 3,
      textShadow: `0 0 20px ${C.gold}40`,
    }}>
      Jackpots World
    </div>
  ) : (
    <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>
      {(() => {
        const found = TABS.find(x => x.id === tab);
        return found ? (TAB_I18N_KEY[found.id] ? t(TAB_I18N_KEY[found.id]) : found.label) : "";
      })()}
    </div>
  )}

  {/* Right — UID + refresh */}
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <UidBadge uid={profile?.user_uid} />
    <button
      onClick={fetchDashboard}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: C.surface, border: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "rgba(255,255,255,0.4)",
      }}
    >
      <RefreshCw size={13} />
    </button>
  </div>
</div>

        {/* Animated tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {tab === "overview"      && <OverviewTab      profile={profile} stats={stats} recent_transactions={recent_transactions} vip_benefits={vip_benefits} vipColor={vipColor} onTabChange={setTab} onRefresh={fetchDashboard} />}
            {tab === "wallet"        && <WalletTab        profile={profile} onToast={showToast} onRefresh={fetchDashboard} />}
            {tab === "travel"        && <TravelTab        profile={profile} onToast={showToast} />}
            {tab === "gifts"         && <GiftsTab         onToast={showToast} onRefresh={fetchDashboard} />}
            {tab === "packages"      && <PackagesTab      />}
            {tab === "favourites"    && <FavouritesTab    onToast={showToast} />}
            {tab === "bonus"         && <BonusTab         profile={profile} onToast={showToast} onRefresh={fetchDashboard} />}
            {tab === "rewards"       && <RewardsTab       onToast={showToast} onRefresh={fetchDashboard} />}
            {tab === "notifications" && <NotificationsTab onToast={showToast} onUnreadChange={setNotifCount} />}
            {tab === "referral"      && <ReferralTab      profile={profile} />}
            {tab === "profile"       && <ProfileTab       profile={profile} onToast={showToast} onRefresh={fetchDashboard} />}
            {tab === "support"                && <SupportTab              onToast={showToast} />}
            {tab === "responsible_gambling"    && <ResponsibleGamblingTab  onToast={showToast} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}
      </AnimatePresence>

      {/* Daily Login Spin Wheel */}
      {showSpin && <SpinWheelModal onClose={() => setShowSpin(false)} />}

      {/* AI Live Chat — opened via the Live Support tab's "Live Chat" card */}
      <ChatBot />
    </div>
  );
}