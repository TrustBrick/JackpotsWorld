// AFFILIATE-APPROVAL: was a "coming soon" stub. Reads the same per-user
// Notification model/endpoints already used by the player dashboard and
// affiliate panel (GET /api/user/notifications/, POST .../<id>/read/,
// POST .../read-all/ — see authapp/views/user_views.py) — an admin is a
// User too, so these already return exactly this admin's own notifications
// with no backend changes needed.
import React, { useCallback, useEffect, useState } from "react";
import { Bell, Handshake, Check, CheckCheck, RefreshCw } from "lucide-react";
import { Card, Btn, Spinner } from "../components/SharedUI";
import { adminFetch, API, fmtDT } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

const ICONS = {
  affiliate_registration: Handshake,
};

export default function NotifsTab({ onToast, onNavigate }) {
  const { C } = useAdminTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/user/notifications/`)
      .then(r => r?.json())
      .then(j => { if (Array.isArray(j)) setItems(j); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    await adminFetch(`${API}/api/user/notifications/${id}/read/`, { method: "POST" }).catch(() => {});
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    const r = await adminFetch(`${API}/api/user/notifications/read-all/`, { method: "POST" });
    if (r?.ok) onToast?.("All notifications marked read", true);
  };

  const unreadCount = items.filter(n => !n.is_read).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn outline small onClick={markAllRead} disabled={unreadCount === 0}><CheckCheck size={12} /> Mark all read</Btn>
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40 }}><Spinner /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>No notifications</div>
        ) : (
          <div>
            {items.map((n, i) => {
              const Icon = ICONS[n.icon] || Bell;
              return (
                <div key={n.id} style={{
                  display: "flex", gap: 12, padding: "14px 18px",
                  borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none",
                  background: n.is_read ? "transparent" : `${C.gold}08`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} style={{ color: C.gold }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 13, fontWeight: n.is_read ? 600 : 800, color: C.text }}>{n.title}</div>
                      {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 8 }}>{n.message}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>{fmtDT(n.created_at)}</span>
                      {n.icon === "affiliate_registration" && (
                        <button onClick={() => { if (!n.is_read) markRead(n.id); onNavigate?.("affiliates"); }}
                          style={{ fontSize: 11, fontWeight: 700, color: C.gold, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          Review Affiliate
                        </button>
                      )}
                      {!n.is_read && (
                        <button onClick={() => markRead(n.id)}
                          style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3 }}>
                          <Check size={11} /> Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
