// src/affiliate/components/SharedUI.jsx
// Shared premium, enterprise-grade table primitives for the Affiliate panel —
// every data table in this module (Campaigns, Click Details, Referrals,
// Activity, Commission Tiers, Withdrawals…) renders through these so the
// look stays identical everywhere: solid dark card, gold-accented header,
// alternating rows, hover states, styled pagination/selects, and a
// consistent empty state — instead of each tab hand-rolling its own
// (previously transparent, hard-to-read) inline table markup.
import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Inbox, Loader2 } from "lucide-react";

export const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA", orange: "#FB923C",
  // Table-specific tokens — solid, opaque surfaces (never transparent) per
  // the premium black & gold spec.
  tableBg: "#141414", tableBgAlt: "#1A1A1A", tableHeaderBg: "#0D0D0D",
  tableBorder: "rgba(212,175,55,0.20)", rowBorder: "rgba(255,255,255,0.05)",
  textPrimary: "rgba(255,255,255,0.92)", textSecondary: "rgba(255,255,255,0.45)",
};

export function Card({ children, style = {}, ...rest }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }} {...rest}>
      {children}
    </div>
  );
}

// ─── Table shell ────────────────────────────────────────────────────────────

export function TableCard({ children, style = {} }) {
  return (
    <div style={{
      background: C.tableBg, border: `1px solid ${C.tableBorder}`, borderRadius: 16,
      overflow: "hidden", boxShadow: "0 6px 28px rgba(0,0,0,0.4)", ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * Full table: wraps a horizontally-scrollable <table> in a TableCard, with a
 * styled <thead>, and a loading spinner / empty state baked in so callers
 * never hand-roll those states with inconsistent markup.
 *
 * `children` should be the <tbody> rows (use <Tr>/<Td>) when data is present;
 * loading/empty are handled automatically via the `loading`/`isEmpty` props.
 */
export function Table({ headers, children, loading, isEmpty, emptyText = "No records found", emptyIcon, minWidth, footer }) {
  const colSpan = headers.length;
  return (
    <TableCard>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", minWidth: minWidth || undefined, borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.tableHeaderBg, borderBottom: `1px solid ${C.tableBorder}` }}>
              {headers.map((h, i) => (
                <th key={i} style={{
                  padding: "13px 16px", textAlign: "left", fontSize: 10.5, color: C.gold, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} style={{ padding: 0 }}><TableSpinner /></td></tr>
            ) : isEmpty ? (
              <tr><td colSpan={colSpan} style={{ padding: 0 }}><TableEmptyState text={emptyText} icon={emptyIcon} /></td></tr>
            ) : children}
          </tbody>
        </table>
      </div>
      {!loading && !isEmpty && footer}
    </TableCard>
  );
}

// Alternating-row <tr> with a hover tint. `index` drives the alternation —
// pass the row's position in the current page's result list.
export function Tr({ index = 0, onClick, children, style = {} }) {
  const [hover, setHover] = useState(false);
  const base = index % 2 === 0 ? C.tableBg : C.tableBgAlt;
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "rgba(212,175,55,0.07)" : base,
        borderBottom: `1px solid ${C.rowBorder}`,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s",
        ...style,
      }}
    >
      {children}
    </tr>
  );
}

export function Td({ children, muted, mono, gold, style = {} }) {
  return (
    <td style={{
      padding: "13px 16px", color: gold ? C.gold : muted ? C.textSecondary : C.textPrimary,
      fontFamily: mono ? "monospace" : "inherit", fontWeight: gold ? 700 : 400,
      verticalAlign: "middle", ...style,
    }}>
      {children}
    </td>
  );
}

function TableSpinner() {
  return (
    <div style={{ padding: 52, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <Loader2 size={22} style={{ color: C.gold, animation: "affSpin 0.9s linear infinite" }} />
      <span style={{ fontSize: 11.5, color: C.textSecondary }}>Loading…</span>
      <style>{`@keyframes affSpin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

export function TableEmptyState({ text, icon: Icon = Inbox }) {
  return (
    <div style={{ padding: "50px 20px", textAlign: "center" }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%", margin: "0 auto 12px",
        background: "rgba(212,175,55,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} style={{ color: "rgba(212,175,55,0.45)" }} />
      </div>
      <div style={{ fontSize: 12.5, color: C.textSecondary }}>{text}</div>
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export function Pagination({ page, totalPages, count, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 16px", borderTop: `1px solid ${C.tableBorder}`, background: C.tableHeaderBg,
    }}>
      <div style={{ fontSize: 11.5, color: C.textSecondary }}>
        Page <b style={{ color: "white" }}>{page}</b> of {totalPages}
        {typeof count === "number" && <> &middot; {count} total</>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <PageBtn disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={14} /></PageBtn>
        <PageBtn disabled={page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight size={14} /></PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ disabled, onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30, borderRadius: 8,
        background: disabled ? "rgba(255,255,255,0.02)" : hover ? "rgba(212,175,55,0.14)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${disabled ? "rgba(255,255,255,0.05)" : hover ? "rgba(212,175,55,0.45)" : C.tableBorder}`,
        color: disabled ? "rgba(255,255,255,0.15)" : hover ? C.gold : "rgba(255,255,255,0.65)",
        cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Styled select (sort / filter dropdowns) ───────────────────────────────

export function Select({ value, onChange, options, minWidth }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block", minWidth }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          padding: "9px 34px 9px 14px", borderRadius: 10,
          background: C.tableHeaderBg, border: `1px solid ${hover ? "rgba(212,175,55,0.5)" : C.tableBorder}`,
          color: "white", fontSize: 12.5, fontWeight: 600, outline: "none", cursor: "pointer",
          transition: "border-color 0.15s",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: "#0D0D0D", color: "white" }}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gold, pointerEvents: "none" }} />
    </div>
  );
}

// ─── Status pill (reused shape for status/state badges in tables) ─────────

export function Pill({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
      background: `${color}1E`, color, whiteSpace: "nowrap", border: `1px solid ${color}35`,
    }}>
      {children}
    </span>
  );
}
