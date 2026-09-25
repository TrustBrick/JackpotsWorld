import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Check, Ban, ChevronDown, Lock, Zap } from "lucide-react";
import { Card, Btn, Table, rowHover } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtD } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";
import { AFFILIATE_LEVELS, affiliateLevel } from "../../config/affiliateLevels";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

function statusOf(row) {
  if (!row.approved_by) return "pending";
  return row.is_active ? "active" : "inactive";
}

function StatusPill({ status }) {
  const { C } = useAdminTheme();
  const cfg = {
    pending:  { color: C.orange, label: "Pending" },
    active:   { color: C.green,  label: "Active"  },
    inactive: { color: C.red,    label: "Inactive" },
  }[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// AFFILIATE-LEVELS: the level pill doubles as the picker. Custom popup rather
// than a native <select>, for the same reason SharedUI.Select is custom: the
// native option list ignores the theme and renders white. The popup is
// position:fixed at the pill's on-screen spot because SharedUI.Table wraps
// rows in an overflow container that would clip it on the last rows -- and
// portalled to <body>, because the tab content sits inside a framer-motion
// wrapper whose transform turns "fixed" into "relative to that wrapper",
// which put the menu 254px right of the pill (measured).
//
// A level picked here is LOCKED (lock icon): automatic level-ups leave that
// affiliate alone. "Automatic" at the top of the menu unlocks it and re-checks
// against the Affiliate Levels conditions straight away.
function LevelPicker({ value, locked, onChange, onAutomatic, disabled }) {
  const { C } = useAdminTheme();
  const [pos, setPos] = useState(null);   // null = closed
  const ref = React.useRef(null);
  const menuRef = React.useRef(null);
  const current = affiliateLevel(value);
  const open = pos !== null;

  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    const menuH = (AFFILIATE_LEVELS.length + 1) * 32 + 16;
    const top = r.bottom + 4 + menuH > window.innerHeight ? r.top - 4 - menuH : r.bottom + 4;
    setPos({ top, left: r.left });
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = e => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setPos(null);
    };
    const esc = e => { if (e.key === "Escape") setPos(null); };
    const shut = () => setPos(null);   // a fixed popup would drift from its pill
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" disabled={disabled} onClick={toggle} title="Change level"
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800,
          padding: "3px 8px 3px 10px", borderRadius: 20, cursor: disabled ? "wait" : "pointer",
          background: `${current.color}1c`, color: current.color, border: `1px solid ${current.color}55`,
        }}>
        {locked && <Lock size={10} />}{current.label} <ChevronDown size={11} />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 60, minWidth: 130,
          background: C.panelBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          fontFamily: "'Manrope', sans-serif",   // outside the panel root, so set it here
        }}>
          <button type="button"
            onClick={() => { setPos(null); if (locked) onAutomatic(); }}
            title="Follow the Affiliate Levels conditions"
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              padding: "7px 9px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: "none",
              background: !locked ? `${C.gold}18` : "transparent", color: C.text,
            }}>
            <Zap size={11} style={{ color: C.gold, flexShrink: 0 }} />
            Automatic{!locked ? " ✓" : ""}
          </button>
          <div style={{ height: 1, background: C.border, margin: "3px 4px" }} />
          {AFFILIATE_LEVELS.map(l => (
            <button key={l.id} type="button"
              onClick={() => { setPos(null); if (l.id !== current.id) onChange(l.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                padding: "7px 9px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: "none",
                background: l.id === current.id ? `${l.color}18` : "transparent", color: C.text,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
              {l.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function AffiliatesTab({ onToast }) {
  const { C } = useAdminTheme();
  const rateInputStyle = {
    width: 64, padding: "5px 7px", borderRadius: 7, fontSize: 12,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, outline: "none", boxSizing: "border-box",
  };
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState({});
  const [savingLevel, setSavingLevel] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = tab !== "all" ? `?status=${tab}` : "";
    adminFetch(`${API}/api/admin-panel/affiliates/${qs}`)
      .then(r => r?.json())
      .then(j => { if (j) setItems(j.results || []); })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const grant = async (row, isActive) => {
    const rate = rates[row.user_id] ?? row.commission_rate;
    const r = await adminFetch(`${API}/api/admin-panel/affiliates/grant/`, {
      method: "POST",
      body: JSON.stringify({ user_id: row.user_id, commission_rate: rate, is_active: isActive }),
    });
    if (!r) { onToast?.("Session expired", false); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) { onToast?.(j.message || "Updated", true); load(); }
    else onToast?.(j.error || "Failed to update affiliate", false);
  };

  // body is { level } (set by hand and lock) or { automatic: true } (unlock).
  const setLevel = async (row, body) => {
    setSavingLevel(row.user_id);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/affiliates/${row.user_id}/level/`, {
        method: "PATCH", body: JSON.stringify(body),
      });
      if (!r) { onToast?.("Session expired", false); return; }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setItems(prev => prev.map(it => it.user_id === row.user_id ? { ...it, ...j } : it));
        onToast?.(body.automatic
          ? `${row.email} follows the level conditions again (${j.level_label})`
          : `${row.email} is now ${j.level_label} (set by hand)`, true);
      } else onToast?.(j.error || "Failed to update level", false);
    } finally { setSavingLevel(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
                border: tab === t.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
                background: tab === t.id ? `${C.gold}15` : "transparent",
                color: tab === t.id ? C.gold : C.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table
        headers={["UID", "Email", "Name", "Country", "Level", "Commission Rate", "Earned", "Paid", "Applied On", "Status", ""]}
        loading={loading}
        colSpan={11}
        emptyText="No affiliates in this view"
      >
        {items.map(row => {
          const status = statusOf(row);
          return (
            <tr key={row.user_id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{row.user_uid}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{row.email}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{row.name || "—"}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{row.country || "—"}</td>
              <td style={{ padding: "11px 14px" }}>
                <LevelPicker
                  value={row.level} locked={row.level_locked} disabled={savingLevel === row.user_id}
                  onChange={lvl => setLevel(row, { level: lvl })}
                  onAutomatic={() => setLevel(row, { automatic: true })}
                />
              </td>
              <td style={{ padding: "11px 14px" }}>
                <input
                  type="number" step="0.01"
                  defaultValue={row.commission_rate}
                  onChange={e => setRates(prev => ({ ...prev, [row.user_id]: e.target.value }))}
                  style={rateInputStyle}
                />%
              </td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{fmt(row.total_earned)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{fmt(row.total_paid)}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtD(row.created_at)}</td>
              <td style={{ padding: "11px 14px" }}><StatusPill status={status} /></td>
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                {status !== "active" && (
                  <Btn small color={C.green} onClick={() => grant(row, true)} style={{ marginRight: 6 }}>
                    <Check size={12} /> Approve
                  </Btn>
                )}
                {status !== "inactive" && (
                  <Btn small outline color={C.red} onClick={() => grant(row, false)}>
                    <Ban size={12} /> Deactivate
                  </Btn>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
