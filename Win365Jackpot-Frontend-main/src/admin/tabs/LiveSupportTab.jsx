// LIVE-CHAT: real-time human-agent chat — distinct from SupportTicketsTab.jsx
// (async ticket replies, MULTILINGUAL-CHAT). Both sit on the same
// SupportTicket model; this one only shows is_live_chat=True sessions and
// talks over authapp's live-chat REST + WebSocket API.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { LifeBuoy, Send, RefreshCw, CheckCircle2, Volume2, VolumeX } from "lucide-react";
import { API, adminFetch, fmtDT } from "../helpers";
import { Card, Btn, Spinner } from "../components/SharedUI";
import { useAdminTheme } from "../context/AdminThemeContext";
import { connectLiveChatSocket } from "../../services/liveChatSocket";

const SOUND_PREF_KEY = "admin_live_chat_sound";

// Short two-tone chime via the Web Audio API — no binary asset needed.
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch { /* best-effort only */ }
}

export default function LiveSupportTab({ onToast }) {
  const { C } = useAdminTheme();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [connStatus, setConnStatus] = useState("connecting");
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_PREF_KEY) !== "off");

  const socketRef = useRef(null);
  const pollRef = useRef(null);
  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId]);

  const toggleSound = () => {
    setSoundOn(prev => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
      return next;
    });
  };

  const loadSessions = useCallback(async () => {
    try {
      const r = await adminFetch(`${API}/api/admin-panel/live-chat/list/`);
      const j = await r?.json();
      setSessions(Array.isArray(j) ? j : j?.results || []);
    } catch { onToast?.("Failed to load live chat sessions", false); }
    setLoading(false);
  }, [onToast]);

  const loadMessages = useCallback(async (ticketId) => {
    try {
      const r = await adminFetch(`${API}/api/admin-panel/live-chat/${ticketId}/messages/`);
      const j = await r?.json();
      setMessages(Array.isArray(j) ? j : j?.results || []);
      await adminFetch(`${API}/api/admin-panel/live-chat/${ticketId}/read/`, { method: "POST" });
      setSessions(prev => prev.map(s => (s.id === ticketId ? { ...s, unread_count: 0 } : s)));
    } catch { onToast?.("Failed to load messages", false); }
  }, [onToast]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (selectedId != null) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Cross-session inbox feed — keeps the list fresh and the open thread
  // live, without needing a WS connection per session.
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) return undefined;

    const startPolling = () => {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(loadSessions, 20000);
    };

    socketRef.current = connectLiveChatSocket("/ws/live-chat/admin/inbox/", token, {
      onEvent: (event, payload) => {
        if (event === "chat_created") {
          loadSessions();
        } else if (event === "new_message") {
          if (payload.ticket_id === selectedIdRef.current) {
            setMessages(prev => (prev.some(m => m.id === payload.id) ? prev : [...prev, payload]));
          }
          if (payload.sender_type === "user") {
            if (payload.ticket_id !== selectedIdRef.current && soundOn) playChime();
            loadSessions();
          }
        }
      },
      onStatusChange: (status) => {
        setConnStatus(status);
        if (status === "failed") startPolling();
        else clearInterval(pollRef.current);
      },
    });

    return () => {
      socketRef.current?.close();
      clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSessions]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setReply("");
    try {
      const r = await adminFetch(`${API}/api/admin-panel/live-chat/${selectedId}/messages/`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      if (r?.ok) {
        const saved = await r.json();
        // The admin-inbox WS push for this same message can arrive before
        // this response does (it's broadcast the instant the row is
        // created) — dedupe by id instead of appending unconditionally.
        setMessages(prev => (prev.some(m => m.id === saved.id) ? prev : [...prev, saved]));
      } else {
        onToast?.("Failed to send reply", false);
      }
    } catch { onToast?.("Failed to send reply", false); }
    setSending(false);
  };

  const markResolved = async () => {
    if (!selectedId) return;
    const r = await adminFetch(`${API}/api/admin-panel/support/tickets/${selectedId}/`, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
    if (r?.ok) {
      onToast?.("Session marked resolved", true);
      setSessions(prev => prev.map(s => (s.id === selectedId ? { ...s, status: "resolved" } : s)));
    } else onToast?.("Failed to update status", false);
  };

  const selected = sessions.find(s => s.id === selectedId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LifeBuoy size={15} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Live Support Chat</div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: connStatus === "open" ? `${C.green}18` : `${C.orange}18`,
            color: connStatus === "open" ? C.green : C.orange,
          }}>
            {connStatus === "open" ? "Live" : connStatus === "failed" ? "Polling" : "Connecting…"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn outline small onClick={toggleSound}>
            {soundOn ? <Volume2 size={12} /> : <VolumeX size={12} />} Sound {soundOn ? "on" : "off"}
          </Btn>
          <Btn outline small onClick={loadSessions}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, alignItems: "start" }}>
        {/* Session list */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {loading ? <Spinner /> : sessions.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12.5 }}>No live chat sessions yet</div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 14px", display: "block",
                    background: selectedId === s.id ? `${C.gold}12` : "transparent",
                    border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.email}
                    </span>
                    {s.unread_count > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8,
                        background: "#ff3366", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                      }}>
                        {s.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.last_message?.message || "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                      background: s.status === "resolved" || s.status === "closed" ? `${C.green}18` : `${C.orange}18`,
                      color: s.status === "resolved" || s.status === "closed" ? C.green : C.orange,
                    }}>
                      {s.status.replace("_", " ")}
                    </span>
                    <span style={{ fontSize: 9.5, color: C.dim }}>{fmtDT(s.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Thread */}
        <Card style={{ minHeight: 520, display: "flex", flexDirection: "column" }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12.5 }}>
              Select a session to view the conversation
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selected.email}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{selected.user_uid}</div>
                </div>
                {selected.status !== "resolved" && selected.status !== "closed" && (
                  <Btn small onClick={markResolved}><CheckCircle2 size={12} /> Mark Resolved</Btn>
                )}
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "4px 2px" }}>
                {messages.map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.sender_type === "admin" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "70%", padding: "8px 12px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.5,
                      background: m.sender_type === "admin" ? `${C.gold}20` : C.hoverBg,
                      color: C.text, border: `1px solid ${C.border}`,
                    }}>
                      <div>{m.message}</div>
                      <div style={{ fontSize: 9.5, color: C.dim, marginTop: 3 }}>{fmtDT(m.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Type a reply…"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none" }}
                />
                <Btn onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? "Sending…" : <><Send size={12} /> Send</>}
                </Btn>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
