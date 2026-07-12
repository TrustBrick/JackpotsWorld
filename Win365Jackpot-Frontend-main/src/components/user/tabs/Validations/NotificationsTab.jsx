import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell, RefreshCw, CheckCheck, CheckCircle2,
  ArrowDownToLine, ArrowUpFromLine, Gift,
  Crown, ShieldCheck, Star, Trophy, Zap,
  TrendingUp, Info, AlertCircle, Mail, MailOpen,
  ChevronDown, Wallet,
} from "lucide-react";
import { C } from "../../constants";
import { authFetch, API } from "../../helpers";
import { Spinner } from "../../components/SharedUI";

const TYPE_CFG = {
  deposit:    { Icon: ArrowDownToLine, color: "#29b676", bg: "rgba(41,182,118,0.08)",  border: "rgba(41,182,118,0.20)"  },
  withdrawal: { Icon: ArrowUpFromLine, color: "#e5534b", bg: "rgba(229,83,75,0.08)",   border: "rgba(229,83,75,0.20)"   },
  bonus:      { Icon: Gift,            color: "#e6a817", bg: "rgba(230,168,23,0.08)",  border: "rgba(230,168,23,0.20)"  },
  promo:      { Icon: Star,            color: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.20)"  },
  vip:        { Icon: Crown,           color: "#D4AF37", bg: "rgba(212,175,55,0.08)",  border: "rgba(212,175,55,0.20)"  },
  security:   { Icon: ShieldCheck,     color: "#6366f1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.20)"  },
  win:        { Icon: Trophy,          color: "#06b6d4", bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.20)"   },
  otp:        { Icon: Zap,             color: "#d946ef", bg: "rgba(217,70,239,0.08)",  border: "rgba(217,70,239,0.20)"  },
  rolling:    { Icon: TrendingUp,      color: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.20)"  },
  info:       { Icon: Info,            color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.20)"  },
  alert:      { Icon: AlertCircle,     color: "#e5534b", bg: "rgba(229,83,75,0.08)",   border: "rgba(229,83,75,0.20)"   },
  crown:      { Icon: Crown,           color: "#D4AF37", bg: "rgba(212,175,55,0.08)",  border: "rgba(212,175,55,0.20)"  },
  wallet:     { Icon: Wallet,          color: "#29b676", bg: "rgba(41,182,118,0.08)",  border: "rgba(41,182,118,0.20)"  },
  system:     { Icon: Bell,            color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.20)" },
};

const POLL_INTERVAL = 30000;
const PAGE_SIZE = 10;

function fmtDate(str, t) {
  if (!str) return { relative: "", absolute: "" };
  const date  = new Date(str);
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  let relative;
  if (mins < 1)        relative = t("notifications.justNow");
  else if (mins < 60)  relative = t("notifications.minsAgo", { count: mins });
  else if (hours < 24) relative = t("notifications.hoursAgo", { count: hours });
  else if (days < 7)   relative = t("notifications.daysAgo", { count: days });
  else                 relative = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const absolute = date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
  return { relative, absolute };
}

function parseMessageLines(message) {
  if (!message) return [];
  return message.split("\n").filter(Boolean).map(line => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > -1) {
      const left  = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      const emojiMatch = left.match(/^(\p{Emoji})\s*(.+)$/u);
      if (emojiMatch) return { emoji: emojiMatch[1], label: emojiMatch[2], value, isKV: true };
      return { label: left, value, isKV: true };
    }
    return { raw: line, isKV: false };
  });
}

// ── Animate height open/close without JS height measurement issues ──
function ExpandPanel({ open, children }) {
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (open) setRender(true);
    else {
      const t = setTimeout(() => setRender(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: open ? "1fr" : "0fr",
      transition: "grid-template-rows 0.28s cubic-bezier(0.4,0,0.2,1)",
    }}>
      <div style={{ overflow: "hidden" }}>
        {render && children}
      </div>
    </div>
  );
}

export default function NotificationsTab({ onToast, onUnreadChange }) {
  const { t } = useTranslation();
  const [notifs,   setNotifs]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  // KEY CHANGE: expanded is just a plain ref for instant toggle, 
  // openId is the state that drives rendering
  const [openId,   setOpenId]   = useState(null);
  const [marking,  setMarking]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [newIds,   setNewIds]   = useState(new Set());

  // Track locally which IDs we've already marked read so
  // re-renders from onRefresh don't flip is_read back to false in UI
  const localReadIds = useRef(new Set());
  const prevIdsRef   = useRef(new Set());
  const pollRef      = useRef(null);
  // Guard against double-fires on mobile (touchend + click)
  const lastToggleRef = useRef({ id: null, time: 0 });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await authFetch(`${API}/api/user/notifications/`);
      if (!r.ok) throw new Error();
      const j    = await r.json();
      const raw  = j.results || j || [];

      // Merge local read state so onRefresh doesn't flicker unread indicator
      const list = raw.map(n =>
        localReadIds.current.has(n.id) ? { ...n, is_read: true } : n
      );

      const incoming = new Set(list.map(n => n.id));
      const arrived  = new Set([...incoming].filter(id => !prevIdsRef.current.has(id)));
      if (arrived.size > 0 && prevIdsRef.current.size > 0) {
        setNewIds(arrived);
        setTimeout(() => setNewIds(new Set()), 5000);
      }
      prevIdsRef.current = incoming;

      setNotifs(prev => {
        const pk = prev.map(n => n.id + n.is_read).join();
        const nk = list.map(n => n.id + n.is_read).join();
        return pk === nk ? prev : list;
      });
      if (!silent) setPage(1);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [load]);
  useEffect(() => { setOpenId(null); }, [page]);

  // Report the live unread count up to Dashboard so the sidebar badge
  // updates the instant something is marked read here, instead of waiting
  // for the next 5s poll tick in Dashboard.
  useEffect(() => {
    onUnreadChange?.(notifs.filter(n => !n.is_read).length);
  }, [notifs, onUnreadChange]);

  // Fire-and-forget read mark — never blocks or re-renders the toggle
  const fireMarkRead = useCallback((id) => {
  if (localReadIds.current.has(id)) return;
  localReadIds.current.add(id);
  setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  authFetch(`${API}/api/user/notifications/${id}/read/`, { method: "POST" })
    .catch(() => {});  // ← fire and forget, no parent refresh
}, []);  // ← no onRefresh dependency

  const markAllRead = useCallback(async () => {
  setMarking(true);
  setNotifs(prev => prev.map(n => {
    localReadIds.current.add(n.id);
    return { ...n, is_read: true };
  }));
  try {
    await authFetch(`${API}/api/user/notifications/read-all/`, { method: "POST" });
    load(true);  // soft refresh only inside this component
  } catch {}
  setMarking(false);
}, [load]);  // ← correct dependency

  // Single clean toggle — deduplicated against mobile double-fire
  const handleToggle = useCallback((e, id, isRead) => {
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    // Debounce: ignore if same id fired within 300ms (touchend + click double-fire)
    if (lastToggleRef.current.id === id && now - lastToggleRef.current.time < 300) return;
    lastToggleRef.current = { id, time: now };

    setOpenId(prev => {
      if (prev === id) return null;   // close
      if (!isRead) fireMarkRead(id);  // mark read only when opening
      return id;                      // open
    });
  }, [fireMarkRead]);

  const unreadCount = notifs.filter(n => !n.is_read).length;
  const totalPages  = Math.max(1, Math.ceil(notifs.length / PAGE_SIZE));
  const pageNotifs  = notifs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart  = notifs.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd    = Math.min(page * PAGE_SIZE, notifs.length);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 40, fontFamily: "'Manrope', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, flexWrap: "wrap", gap: 10,
        padding: "14px 16px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={15} color={C.gold} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.01em" }}>
            {t("notifications.header")}
          </span>
          {unreadCount > 0 && (
            <span style={{
              background: "#e5534b", color: "white",
              fontSize: 10, fontWeight: 700,
              padding: "2px 7px", borderRadius: 20, lineHeight: 1.5,
            }}>{t("notifications.unread", { count: unreadCount })}</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => load(false)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 11px", borderRadius: 6, fontSize: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.55)", cursor: "pointer",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}
          >
            <RefreshCw size={11} /> {t("common.refresh")}
          </button>
          <button
            onClick={() => { if (!marking && unreadCount > 0) markAllRead(); }}
            disabled={marking || unreadCount === 0}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 11px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: `1px solid ${unreadCount > 0 ? "rgba(212,175,55,0.35)" : "rgba(255,255,255,0.08)"}`,
              background: unreadCount > 0 ? "rgba(212,175,55,0.08)" : "transparent",
              color: unreadCount > 0 ? C.gold : "rgba(255,255,255,0.2)",
              cursor: (marking || unreadCount === 0) ? "not-allowed" : "pointer",
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            }}
          >
            <CheckCheck size={11} />
            {marking ? t("notifications.marking") : t("notifications.markAllRead")}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Spinner /></div>
      ) : notifs.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "70px 20px",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
          background: "rgba(255,255,255,0.01)",
        }}>
          <Mail size={32} style={{ opacity: 0.1, display: "block", margin: "0 auto 12px", color: "white" }} />
          <div style={{ fontWeight: 500, fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            {t("notifications.noNotificationsYet")}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            {t("notifications.activityWillAppearHere")}
          </div>
        </div>
      ) : (
        <div style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,0.015)",
        }}>
          {pageNotifs.map((n, idx) => {
            const isOpen = openId === n.id;
            const isNew  = newIds.has(n.id);
            const { relative, absolute } = fmtDate(n.created_at, t);
            const cfg    = TYPE_CFG[n.icon] || TYPE_CFG[n.type] || TYPE_CFG.system;
            const Icon   = cfg.Icon;
            const isLast = idx === pageNotifs.length - 1;
            const parsed = parseMessageLines(n.message);

            return (
              <div
                key={n.id}
                style={{
                  borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.06)",
                  background: isOpen
                    ? "rgba(255,255,255,0.03)"
                    : isNew
                      ? "rgba(212,175,55,0.04)"
                      : !n.is_read
                        ? "rgba(255,255,255,0.02)"
                        : "transparent",
                  transition: "background 0.2s",
                  position: "relative",
                }}
              >
                {/* Unread indicator bar */}
                {!n.is_read && (
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: 2, background: C.gold, borderRadius: "0 1px 1px 0",
                  }} />
                )}

                {/* ── Row ── */}
                <div
                  onClick={(e) => handleToggle(e, n.id, n.is_read)}
                  style={{
                    display: "flex", alignItems: "center",
                    gap: 12, padding: "13px 16px 13px 18px",
                    cursor: "pointer", userSelect: "none",
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Type icon badge */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    color: cfg.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none",
                  }}>
                    <Icon size={15} />
                  </div>

                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0, pointerEvents: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: n.is_read ? 400 : 600,
                        color: n.is_read ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.92)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        letterSpacing: "-0.01em",
                      }}>
                        {n.title}
                      </span>
                      {isNew && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, flexShrink: 0,
                          color: "#e6a817",
                          background: "rgba(230,168,23,0.12)",
                          padding: "1px 5px", borderRadius: 4,
                          border: "1px solid rgba(230,168,23,0.3)",
                          animation: "blink 1.5s ease-in-out infinite",
                          letterSpacing: "0.04em",
                        }}>{t("notifications.new")}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {n.is_read
                        ? <MailOpen size={10} color="rgba(255,255,255,0.18)" style={{ flexShrink: 0 }} />
                        : <Mail     size={10} color={C.gold}                 style={{ flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)" }}>
                        {n.is_read ? t("notifications.read") : t("notifications.unreadLabel")} · {relative}
                      </span>
                    </div>
                  </div>

                  {/* Chevron */}
                  <div style={{
                    width: 20, height: 20,
                    borderRadius: 5,
                    background: isOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "rgba(255,255,255,0.4)",
                    transition: "transform 0.25s, background 0.15s",
                    transform: isOpen ? "rotate(180deg)" : "none",
                    flexShrink: 0,
                    pointerEvents: "none",
                  }}>
                    <ChevronDown size={12} />
                  </div>
                </div>

                {/* ── Expanded Detail Panel ── */}
                <ExpandPanel open={isOpen}>
                  <div style={{
                    margin: "0 12px 12px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(0,0,0,0.18)",
                    overflow: "hidden",
                  }}>
                    {/* Detail header */}
                    <div style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.03)",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6,
                        background: cfg.bg, border: `1px solid ${cfg.border}`,
                        color: cfg.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <Icon size={12} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
                        {n.title}
                      </span>
                    </div>

                    {/* Key-value detail rows */}
                    <div style={{ padding: "4px 0" }}>
                      {parsed.map((item, i) => (
                        item.isKV ? (
                          <div key={i} style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 14px",
                            borderBottom: i < parsed.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          }}>
                            <span style={{
                              fontSize: 12, color: "rgba(255,255,255,0.38)",
                              display: "flex", alignItems: "center", gap: 5,
                            }}>
                              {item.emoji && <span style={{ fontSize: 13 }}>{item.emoji}</span>}
                              {item.label}
                            </span>
                            <span style={{
                              fontSize: 12, fontWeight: 500,
                              color: "rgba(255,255,255,0.82)",
                              textAlign: "right", maxWidth: "60%",
                            }}>
                              {item.value}
                            </span>
                          </div>
                        ) : (
                          <div key={i} style={{
                            padding: "8px 14px",
                            fontSize: 12, color: "rgba(255,255,255,0.55)",
                            lineHeight: 1.6,
                            borderBottom: i < parsed.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          }}>
                            {item.raw}
                          </div>
                        )
                      ))}
                    </div>

                    {/* Footer: timestamp */}
                    <div style={{
                      padding: "8px 14px",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      background: "rgba(255,255,255,0.02)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <CheckCircle2 size={10} color="#29b676" />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {n.is_read ? t("notifications.read") : t("notifications.opened")} · {absolute}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10, color: cfg.color,
                        background: cfg.bg,
                        padding: "2px 7px", borderRadius: 4,
                        border: `1px solid ${cfg.border}`,
                        fontWeight: 500, textTransform: "capitalize",
                      }}>
                        {n.icon || n.type || "system"}
                      </span>
                    </div>
                  </div>
                </ExpandPanel>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 8, marginTop: 12,
          padding: "9px 14px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
          fontSize: 12,
        }}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>
            {t("notifications.showingRange", { start: rangeStart, end: rangeEnd, total: notifs.length })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "4px 11px", borderRadius: 5, fontSize: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                background: page === 1 ? "transparent" : "rgba(255,255,255,0.05)",
                color: page === 1 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.6)",
                cursor: page === 1 ? "not-allowed" : "pointer",
                touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              }}
            >{t("tables.prev")}</button>
            <span style={{
              padding: "4px 10px", fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 5,
            }}>{t("tables.pageOf", { page, total: totalPages })}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: "4px 11px", borderRadius: 5, fontSize: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                background: page >= totalPages ? "transparent" : "rgba(255,255,255,0.05)",
                color: page >= totalPages ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.6)",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              }}
            >{t("tables.next")}</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </div>
  );
}