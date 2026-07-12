import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Key, Eye, EyeOff, AlertCircle, RefreshCw,
  LayoutGrid, Megaphone, Percent, Users, HelpCircle, Activity, Bell, User, ShieldCheck,
} from "lucide-react";
import { API, affiliateFetch } from "./helpers";
import { revokeSession } from "../services/authRevoke";
import { setSession, getToken, getUser, clearSession } from "../services/authStorage";
import AffiliateSidebar, { SIDEBAR_WIDTH, useBreakpoint } from "./AffiliateSidebar";
import OverviewTab from "./tabs/OverviewTab";
import CampaignsTab from "./tabs/CampaignsTab";
import CommissionTab from "./tabs/CommissionTab";
import ReferredUsersTab from "./tabs/ReferredUsersTab";
import ActivityTab from "./tabs/ActivityTab";
import NotificationsTab from "./tabs/NotificationsTab";
import ProfileTab from "./tabs/ProfileTab";
import KycTab from "./tabs/KycTab";
import FaqTab from "./tabs/FaqTab";
import ChatBot from "../components/ChatBot";
import { C } from "../admin/constants";

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Login screen
// ─────────────────────────────────────────────────────────────────────────────

function AffiliateLoginScreen({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/affiliate/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (res.ok) {
        setSession(
          { access: "affiliate_token", refresh: "affiliate_refresh", user: "affiliate_user" },
          json.tokens, json.user, remember,
        );
        onSuccess();
      } else {
        setError(json.error || "Invalid affiliate credentials.");
      }
    } catch { setError("Network error. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${C.gold}18, transparent 60%)` }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: C.gold, letterSpacing: 3, marginBottom: 4 }}>JACKPOTS WORLD</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.4em", textTransform: "uppercase" }}>Affiliate Portal</div>
        </div>
        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Key size={16} style={{ color: C.gold }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Affiliate Login</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Approved affiliates only</div>
            </div>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
                  style={{ width: "100%", padding: "11px 44px 11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", padding: 0 }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.gold, cursor: "pointer" }} />
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>Remember me</span>
            </label>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <button type="submit" disabled={loading || !email || !password}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 14, fontWeight: 800, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: (!email || !password) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? "Authenticating…" : <><Key size={14} /> Sign In</>}
            </button>
          </form>
        </Card>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Not an affiliate yet? <a href="/affiliates" style={{ color: C.gold, textDecoration: "none" }}>Learn about the program</a>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — sidebar layout (Overview / Campaigns / Commission / Referred
// Players / Activity / Notifications / Profile / FAQ), mirroring the user
// dashboard's Sidebar.jsx pattern (same logo, same nav-item style).
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid, Component: OverviewTab },
  { id: "campaigns", label: "Campaigns", icon: Megaphone, Component: CampaignsTab },
  { id: "commission", label: "Commission", icon: Percent, Component: CommissionTab },
  { id: "referred", label: "Referred Players", icon: Users, Component: ReferredUsersTab },
  { id: "activity", label: "Activity", icon: Activity, Component: ActivityTab },
  { id: "notifications", label: "Notifications", icon: Bell, Component: NotificationsTab },
  { id: "kyc", label: "KYC Verification", icon: ShieldCheck, Component: KycTab },
  { id: "profile", label: "Profile", icon: User, Component: ProfileTab },
  { id: "faq", label: "FAQ", icon: HelpCircle, Component: FaqTab },
];

function AffiliateDashboard({ affiliateUser, onLogout }) {
  const bp = useBreakpoint();
  const [tab, setTab] = useState("overview");
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const active = TABS.find(t => t.id === tab) || TABS[0];
  const Active = active.Component;
  const mainMarginLeft = bp === "desktop" ? SIDEBAR_WIDTH : 0;

  const showToast = (msg, ok = true) => setToast({ msg, ok });
  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Poll the unread notification count independently of which tab is active,
  // so the sidebar bell badge stays live even while NotificationsTab isn't mounted.
  useEffect(() => {
    let cancelled = false;
    const loadUnread = async () => {
      const res = await affiliateFetch(`${API}/api/user/notifications/`);
      if (!res?.ok || cancelled) return;
      const json = await res.json();
      const results = Array.isArray(json) ? json : (json.results || []);
      setUnread(results.filter(n => !n.is_read).length);
    };
    loadUnread();
    const id = setInterval(loadUnread, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Manrope', sans-serif", display: "flex" }}>
      <AffiliateSidebar
        C={C}
        affiliateUser={affiliateUser}
        activeTab={tab}
        onTabChange={setTab}
        onLogout={onLogout}
        unread={unread}
        tabs={TABS}
      />

      <main style={{
        flex: 1, marginLeft: mainMarginLeft, padding: bp === "mobile" ? "64px 16px 24px" : 26,
        transition: "margin-left 0.25s ease",
        minHeight: "100vh", maxWidth: "100vw", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>{active.label}</div>
          <button
            onClick={refresh}
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

        <Active key={refreshKey} onToast={showToast} onUnreadChange={setUnread} onRefresh={refresh} />
      </main>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 300,
          padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: toast.ok ? `${C.green}18` : `${C.red}18`,
          border: `1px solid ${toast.ok ? C.green : C.red}40`,
          color: toast.ok ? C.green : C.red,
        }}>
          {toast.msg}
        </div>
      )}

      <ChatBot />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export default function AffiliatePanel() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [affiliateUser, setAffiliateUser] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const user = getUser("affiliate_user");
        const token = getToken("affiliate_token");
        if (!user || !token) return;

        // Re-validate against the backend rather than trusting the
        // client-supplied localStorage flag alone before showing the panel.
        const r = await affiliateFetch(`${API}/api/affiliate/dashboard/`);
        if (r && r.ok) {
          setAuthed(true);
          setAffiliateUser(user);
        } else {
          clearSession(["affiliate_token", "affiliate_refresh", "affiliate_user"]);
        }
      } catch {}
    };
    init();
  }, []);

  const logout = async () => {
    await revokeSession("affiliate_token", "affiliate_refresh");
    clearSession(["affiliate_token", "affiliate_refresh", "affiliate_user"]);
    navigate("/", { replace: true });
  };

  if (!authed) {
    return (
      <AffiliateLoginScreen onSuccess={() => {
        setAffiliateUser(getUser("affiliate_user"));
        setAuthed(true);
      }} />
    );
  }

  return <AffiliateDashboard affiliateUser={affiliateUser} onLogout={logout} />;
}
