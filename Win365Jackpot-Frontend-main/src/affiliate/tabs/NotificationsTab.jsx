import React, { useState, useEffect, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { API, affiliateFetch, fmtD } from "../helpers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export default function NotificationsTab({ onUnreadChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await affiliateFetch(`${API}/api/user/notifications/`);
    if (res?.ok) {
      const json = await res.json();
      // /api/user/notifications/ returns a bare array, not a paginated
      // {results: [...]} envelope — handle both shapes defensively.
      const results = Array.isArray(json) ? json : (json.results || []);
      setItems(results);
      onUnreadChange?.(results.filter(n => !n.is_read).length);
    }
    setLoading(false);
  }, [onUnreadChange]);

  // Poll for new notifications so the list updates in real time without
  // requiring the affiliate to manually revisit this tab.
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    await affiliateFetch(`${API}/api/user/notifications/read-all/`, { method: "POST" });
    await load();
    setMarking(false);
  };

  const markRead = async (id) => {
    await affiliateFetch(`${API}/api/user/notifications/${id}/read/`, { method: "POST" });
    load();
  };

  const unread = items.filter(n => !n.is_read).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: `${C.gold}15`, border: `1px solid ${C.gold}40`, color: C.gold, fontSize: 12, fontWeight: 700, cursor: marking ? "not-allowed" : "pointer" }}
          >
            <CheckCheck size={13} /> {marking ? "Marking…" : "Mark all read"}
          </button>
        )}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Bell size={28} style={{ color: "rgba(255,255,255,0.15)", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>No notifications yet</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {items.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
                  cursor: n.is_read ? "default" : "pointer",
                  background: n.is_read ? "transparent" : "rgba(212,175,55,0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: n.is_read ? 600 : 800, color: "white" }}>{n.title}</div>
                  {!n.is_read && (
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 20, background: `${C.gold}20`, color: C.gold }}>NEW</span>
                  )}
                </div>
                {n.message && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.5 }}>{n.message}</div>}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>{fmtD(n.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
