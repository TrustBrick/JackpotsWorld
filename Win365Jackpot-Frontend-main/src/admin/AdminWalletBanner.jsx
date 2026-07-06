/**
 * AdminWalletBanner.jsx
 * Drop this anywhere in your existing admin panel layout —
 * it shows the live AdminWallet balances at the top of every page.
 *
 * Usage:
 *   import AdminWalletBanner from "./AdminWalletBanner";
 *   <AdminWalletBanner />   ← inside your admin layout, above the tab content
 */

import { useState, useEffect } from "react";
import { adminFetch, API, fmt } from "./helpers";  // adjust path if needed

const WALLETS = [
  { key: "cash_balance",     label: "Cash",     color: "#34d399", bg: "rgba(52,211,153,0.07)"  },
  { key: "non_cash_balance", label: "Non-Cash", color: "#a78bfa", bg: "rgba(167,139,250,0.07)" },
  { key: "otp_balance",      label: "OTP",      color: "#38bdf8", bg: "rgba(56,189,248,0.07)"  },
];

export default function AdminWalletBanner() {
  const [balance,  setBalance]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [lastSync, setLastSync] = useState(null);

  const load = () => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/wallet/admin-balance/`)
      .then(r => r.json())
      .then(j => { setBalance(j); setLastSync(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Auto-refresh every 60 seconds
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 16px",
      marginBottom: 18,
      borderRadius: 10,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      flexWrap: "wrap",
    }}>
      {/* Label */}
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)",
        marginRight: 6, whiteSpace: "nowrap",
      }}>
        Admin Wallet
      </div>

      {/* Balance pills */}
      {WALLETS.map(w => (
        <div key={w.key} style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "5px 12px", borderRadius: 20,
          background: w.bg, border: `1px solid ${w.color}25`,
        }}>
          <span style={{ fontSize: 10, color: w.color, fontWeight: 700 }}>{w.label}</span>
          <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 900, color: "white" }}>
            {loading ? "—" : fmt(balance?.[w.key] ?? 0)}
          </span>
        </div>
      ))}
    
      {/* Refresh + last sync */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {lastSync && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            synced {lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button
          onClick={load}
          style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 11,
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.4)", cursor: "pointer",
          }}
        >
          ↻
        </button>
      </div>
    </div>
  );
}