import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { VIP_COLOR } from "../constants";
import { fmtN } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, color, outline = false, disabled = false, small = false, style = {} }) {
  const { C } = useAdminTheme();
  const c = color || C.gold;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "6px 14px" : "10px 20px", borderRadius: 10,
      fontSize: small ? 12 : 13, fontWeight: 700,
      border: outline ? `1px solid ${c}40` : "none",
      background: outline ? `${c}10` : `linear-gradient(135deg, ${c}, ${c}CC)`,
      color: outline ? c : (c === C.gold ? "#07080F" : "white"),
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 6, ...style,
    }}>{children}</button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, value, onChange, type = "text", placeholder = "", disabled = false, style = {} }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</label>}
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: disabled ? C.surface : C.inputBg, border: `1px solid ${C.border}`, color: disabled ? C.muted : C.text, fontSize: 14, outline: "none", boxSizing: "border-box", cursor: disabled ? "not-allowed" : "text", ...style }}
        onFocus={e => { if (!disabled) e.target.style.border = `1px solid ${C.gold}60`; }}
        onBlur={e  => { e.target.style.border = `1px solid ${C.border}`; }}
      />
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options, placeholder = "Select…" }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({ label, value, onChange, placeholder = "", rows = 3 }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
        onFocus={e => e.target.style.border = `1px solid ${C.gold}60`}
        onBlur={e  => e.target.style.border = `1px solid ${C.border}`}
      />
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ msg, ok, onDone }) {
  const { C } = useAdminTheme();
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "12px 20px", borderRadius: 12, background: ok ? `${C.green}18` : `${C.red}18`, border: `1px solid ${ok ? C.green : C.red}40`, color: ok ? C.green : C.red, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
      {ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}{msg}
    </motion.div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner() {
  const { C } = useAdminTheme();
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <div style={{ width: 32, height: 32, border: `2px solid ${C.border}`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── UID badge ────────────────────────────────────────────────────────────────
export function UidBadge({ uid }) {
  const { C } = useAdminTheme();
  return (
    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, background: `${C.gold}18`, color: C.gold, border: `1px solid ${C.gold}30`, borderRadius: 6, padding: "2px 7px" }}>
      {uid || "—"}
    </span>
  );
}

// ─── UTR badge ────────────────────────────────────────────────────────────────
export function UtrBadge({ utr }) {
  const { C } = useAdminTheme();
  return (
    <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, background: `${C.blue}15`, color: C.blue, border: `1px solid ${C.blue}30`, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.04em" }}>
      {utr || "—"}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const { C } = useAdminTheme();
  const cfg = {
    approved:  { color: C.green,  bg: `${C.green}15`,  label: "Approved"  },
    pending:   { color: C.orange, bg: `${C.orange}15`, label: "Pending"   },
    rejected:  { color: C.red,    bg: `${C.red}15`,    label: "Rejected"  },
    completed: { color: C.green,  bg: `${C.green}15`,  label: "Completed" },
    active:    { color: C.blue,   bg: `${C.blue}15`,   label: "Active"    },
  }[status?.toLowerCase()] || { color: C.muted, bg: C.hoverBg, label: status || "—" };
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}

// ─── VIP badge ────────────────────────────────────────────────────────────────
export function VIPBadge({ level }) {
  const { C } = useAdminTheme();
  const color = VIP_COLOR[level] || C.gold;
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 8, background: `${color}20`, border: `1px solid ${color}40`, color }}>
      VIP {level}
    </span>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ page, total, perPage = 20, onChange }) {
  const { C } = useAdminTheme();
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12, color: C.dim }}>
        Showing {Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)} of {fmtN(total)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onChange(page - 1)} disabled={page <= 1}
          style={{ width: 32, height: 32, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: page <= 1 ? C.dim : C.text, cursor: page <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
          style={{ width: 32, height: 32, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: page >= totalPages ? C.dim : C.text, cursor: page >= totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Table shell ──────────────────────────────────────────────────────────────
export function Table({ headers, children, loading, colSpan, emptyText = "No records found" }) {
  const { C } = useAdminTheme();
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.hoverBg }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? <tr><td colSpan={colSpan || headers.length} style={{ padding: 40, textAlign: "center", color: C.muted }}><Spinner /></td></tr>
            : children || <tr><td colSpan={colSpan || headers.length} style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>{emptyText}</td></tr>
          }
        </tbody>
      </table>
      </div>
    </Card>
  );
}

// ─── Row hover helper ─────────────────────────────────────────────────────────
// Takes the current theme's C object (from useAdminTheme() in the caller)
// since this is a plain object/function, not a component, and can't call
// hooks itself. Usage: <tr {...rowHover(C)}>
export const rowHover = (C) => ({
  onMouseEnter: e => e.currentTarget.style.background = C.hoverBg,
  onMouseLeave: e => e.currentTarget.style.background = "transparent",
});

// ─── Section header ───────────────────────────────────────────────────────────
export function SectionTitle({ children, sub }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
