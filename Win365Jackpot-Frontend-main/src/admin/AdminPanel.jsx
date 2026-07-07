import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Users, Wallet, Building2, Crown, Gift,
  Bell, FileText, Shield, Activity, UserCog, LogOut, Key,
  Eye, EyeOff, AlertCircle, CalendarDays, Spade,
} from "lucide-react";

import OverviewTab       from "./tabs/OverviewTab";
import UsersTab          from "./tabs/UsersTab";
import WalletTab         from "./tabs/WalletTab";
import OfflineDepositTab from "./tabs/offline_deposits/OfflineDepositTab";
import VIPTab            from "./tabs/VIPTab";
import RewardsTab        from "./tabs/RewardsTab";
import NotifsTab         from "./tabs/NotifsTab";
import TxnsTab           from "./tabs/TxnsTab";
import KycTab            from "./tabs/KycTab";
import LogsTab           from "./tabs/LogsTab";
import StaffTab          from "./tabs/StaffTab";
import EventsManageTab      from "./tabs/content/EventsManageTab";
import PokerManageTab       from "./tabs/content/PokerManageTab";
import PromotionsManageTab  from "./tabs/content/PromotionsManageTab";

import { Card, Toast } from "./components/SharedUI";
import { API } from "./helpers";
import { C, ADMIN_TABS } from "./constants";

import AdminWalletBanner from "./AdminWalletBanner";


const ICON_MAP = {
  BarChart3, Users, Wallet, Building2, Crown, Gift,
  Bell, FileText, Shield, Activity, UserCog, CalendarDays, Spade,
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Login Screen
// ─────────────────────────────────────────────────────────────────────────────

function AdminLoginScreen({ onSuccess }) {
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
        
        onSuccess();
      } else {
        setError(json.error || "Invalid admin credentials.");
      }
    } catch { setError("Network error. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${C.gold}18, transparent 60%)` }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: C.gold, letterSpacing: 3, marginBottom: 4 }}>JACKPOTS WORLD</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.4em", textTransform: "uppercase" }}>Admin Panel</div>
        </div>
        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Key size={16} style={{ color: C.gold }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Admin Login</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Staff access only</div>
            </div>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@jackpotswrld.casino"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.border = `1px solid ${C.gold}60`}
                onBlur={e  => e.target.style.border = `1px solid ${C.border}`} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
                  style={{ width: "100%", padding: "11px 44px 11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => e.target.style.border = `1px solid ${C.gold}60`}
                  onBlur={e  => e.target.style.border = `1px solid ${C.border}`} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", padding: 0 }}>
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
  const navigate  = useNavigate();
  const [authed,    setAuthed]    = useState(false);
  const [tab,       setTab]       = useState("overview");
  const [toast,     setToast]     = useState(null);
  const [adminUser, setAdminUser] = useState(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("admin_user") || "{}");
      if (user?.is_staff) { setAuthed(true); setAdminUser(user); }
    } catch {}
  }, []);

  const showToast = (msg, ok = true) => setToast({ msg, ok });

  const logout = () => {
    ["admin_token", "admin_refresh", "admin_user"].forEach(k => localStorage.removeItem(k));
    setAuthed(false);
    setAdminUser(null);
    // Replace (not push) so the authenticated panel entry is gone from
    // history — back button lands on the login screen, not the panel.
    navigate("/admin-panel", { replace: true });
  };

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
      case "vip":       return <VIPTab            {...props} />;
      case "rewards":   return <RewardsTab        {...props} />;
      case "notifications": return <NotifsTab     {...props} />;
      case "transactions":  return <TxnsTab       {...props} />;
      case "kyc":       return <KycTab            {...props} />;
      case "events":    return <EventsManageTab     {...props} />;
      case "poker":     return <PokerManageTab       {...props} />;
      case "promotions":return <PromotionsManageTab  {...props} />;
      case "logs":      return <LogsTab           {...props} />;
      case "staff":     return <StaffTab          {...props} />;
      default:          return <OverviewTab       {...props} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: "white", fontFamily: "'Space Grotesk', sans-serif", display: "flex" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 228, flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        background: "rgba(6,8,14,0.97)",
        padding: "22px 14px",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, height: "100vh",
        zIndex: 10, overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 22 }}>
          <img 
    src='images/jackpotsworld_watermark.png' 
    className="w-10 h-10 object-contain"
  />
  <div className="flex flex-col leading-none">
    <span className="font-bold text-xl md:text-2xl gold-text font-black tracking-wider">Jackpots</span>
    <span className="font-body text-xs tracking-[0.4em] text-gold/70 uppercase">World</span>
  </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.3em", textTransform: "uppercase" }}>Admin Panel</div>
        </div>

        {/* Admin user badge */}
        {adminUser && (
          <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 10, background: `${C.gold}10`, border: `1px solid ${C.gold}20` }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{adminUser.email}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{adminUser.role || "Admin"}</div>
          </div>
        )}

        {/* Nav items */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {ADMIN_TABS.map(t => {
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
                  color: active ? C.gold : "rgba(255,255,255,0.45)",
                  transition: "all 0.15s",
                }}>
                {Icon && <Icon size={13} />}
                {t.label}
                {t.id === "wallet" && (
                  <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 900, padding: "1px 5px", borderRadius: 20, background: C.orange, color: "white" }}>NEW</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button onClick={logout}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, background: "none", border: "none", color: "rgba(248,113,113,0.7)", cursor: "pointer", width: "100%", marginTop: 8 }}>
          <LogOut size={13} /> Logout
        </button>
      </aside>

      {/* ── Main content ── */}
      {/* <AdminWalletBanner /> */}
      <main style={{ flex: 1, marginLeft: 228, padding: 26, minHeight: "100vh", overflowX: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>
            {ADMIN_TABS.find(t => t.id === tab)?.label || "Overview"}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
            {adminUser?.user_uid || adminUser?.email || ""}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={tab}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}