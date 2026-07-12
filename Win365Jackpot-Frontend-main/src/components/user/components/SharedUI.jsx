import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Crown, CheckCircle, AlertCircle } from "lucide-react";
import { C, VIP_COLOR } from "../constants";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 20,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, color = C.gold, outline = false, disabled = false, small = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "6px 14px" : "10px 20px",
        borderRadius: 10,
        fontSize: small ? 12 : 13,
        fontWeight: 700,
        border: outline ? `1px solid ${color}40` : "none",
        background: outline ? `${color}10` : `linear-gradient(135deg, ${color}, ${color}CC)`,
        color: outline ? color : (color === C.gold ? "#06080E" : "white"),
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────
export function Toast({ msg, ok, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        padding: "12px 20px", borderRadius: 12,
        background: ok ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
        border: `1px solid ${ok ? C.green : C.red}40`,
        color: ok ? C.green : C.red,
        fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
      {msg}
    </motion.div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <div style={{
        width: 32, height: 32,
        border: "2px solid transparent",
        borderTopColor: C.gold,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── UID badge ────────────────────────────────────────────────────────────────
export function UidBadge({ uid }) {
  if (!uid) return null; // 👈 REMOVE THIS LINE if exists

  return (
    <div style={{
      padding: "6px 10px",
      borderRadius: 8,
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      fontSize: 12,
      fontWeight: 800,
      color: "#facc15",
      letterSpacing: "0.05em"
    }}>
      {uid || "—"}
    </div>
  );
}

// ─── VIP badge ────────────────────────────────────────────────────────────────
export function VIPBadge({ level }) {
  const color = VIP_COLOR[level] || C.gold;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 800, letterSpacing: "0.05em",
      background: `${color}20`, border: `1px solid ${color}50`, color,
    }}>
      <Crown size={10} /> VIP {level}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const cfg = {
    approved:  { color: C.green,                    bg: `${C.green}15`,                   label: "Approved"  },
    pending:   { color: C.orange,                   bg: `${C.orange}15`,                  label: "Pending"   },
    rejected:  { color: C.red,                      bg: `${C.red}15`,                     label: "Rejected"  },
    completed: { color: C.green,                    bg: `${C.green}15`,                   label: "Completed" },
    active:    { color: C.blue,                     bg: `${C.blue}15`,                    label: "Active"    },
    locked:    { color: "rgba(255,255,255,0.5)",    bg: "rgba(255,255,255,0.05)",          label: "Locked"    },
  }[status?.toLowerCase()] || { color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", label: status || "—" };

  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      padding: "3px 9px", borderRadius: 20,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────
export function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 14,
    }}>
      <div style={{
        width: 32, height: 32,
        border: "2px solid transparent", borderTopColor: C.gold,
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Loading your dashboard…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── Error screen ─────────────────────────────────────────────────────────────
export function ErrorScreen({ message, onRetry }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 10,
    }}>
      <AlertCircle size={36} style={{ color: C.red }} />
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{message}</div>
      <Btn onClick={onRetry}>Retry</Btn>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ page, total, perPage, onPrev, onNext }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderTop: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        Showing {Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)} of {total.toLocaleString("en-IN")}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { disabled: page <= 1, onClick: onPrev, icon: "‹" },
          { disabled: page >= totalPages, onClick: onNext, icon: "›" },
        ].map((b, i) => (
          <button key={i} onClick={b.onClick} disabled={b.disabled} style={{
            width: 28, height: 28, borderRadius: 7,
            background: C.surface, border: `1px solid ${C.border}`,
            color: b.disabled ? "rgba(255,255,255,0.15)" : "white",
            cursor: b.disabled ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
}