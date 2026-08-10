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
import { asMessageArray, highestRealId, mergeById } from "../../services/liveChatMessages";

const SOUND_PREF_KEY = "admin_live_chat_sound";

// The session list is far heavier per request than a thread poll (it
// serialises unread counts and a last-message preview for every session), so
// it refreshes on a slower cadence than the open conversation does.
const SESSIONS_REFRESH_EVERY_N_POLLS = 5;

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
  const selectedIdRef = useRef(null);
  const messagesRef = useRef([]);
  const soundOnRef = useRef(soundOn);
  const pollTickRef = useRef(0);
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId]);
  // Mirrored into refs because the transport's poll callback is created once
  // and would otherwise capture the first render's values forever.
  useEffect(() => { messagesRef.current = messages }, [messages]);
  useEffect(() => { soundOnRef.current = soundOn }, [soundOn]);

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
      const full = asMessageArray(await r?.json());
      setMessages(full);
      messagesRef.current = full;
      await adminFetch(`${API}/api/admin-panel/live-chat/${ticketId}/read/`, { method: "POST" });
      setSessions(prev => prev.map(s => (s.id === ticketId ? { ...s, unread_count: 0 } : s)));
    } catch { onToast?.("Failed to load messages", false); }
  }, [onToast]);

  // Incremental fetch for the conversation currently on screen.
  //
  // This is the half that was missing: the old fallback polled only
  // loadSessions(), which refreshes the left-hand list but never the open
  // thread — so an agent sitting in a conversation saw the player's replies
  // only after switching sessions or reloading the panel.
  const pollOpenThread = useCallback(async () => {
    const ticketId = selectedIdRef.current;
    if (ticketId == null) return false;
    const afterId = highestRealId(messagesRef.current);
    const r = await adminFetch(
      `${API}/api/admin-panel/live-chat/${ticketId}/messages/${afterId ? `?after_id=${afterId}` : ""}`
    );
    const fresh = asMessageArray(await r?.json());
    if (!fresh.length) return false;
    setMessages(prev => mergeById(prev, fresh));
    if (fresh.some(m => m.sender_type === "user")) {
      if (soundOnRef.current) playChime();
      // The agent is looking at this thread, so the player's messages in it
      // are read by definition — keep the badge from re-appearing.
      adminFetch(`${API}/api/admin-panel/live-chat/${ticketId}/read/`, { method: "POST" }).catch(() => {});
    }
    return true;
  }, []);

  // AdminPanel builds `onToast` inline on every render, so loadSessions and
  // pollLiveChat get a new identity each time. Reaching them through refs
  // keeps the connection effect below on an empty dependency list — without
  // this it would tear down and re-open the socket on every parent render,
  // which is exactly the reconnect storm that would defeat the fix.
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => { loadSessionsRef.current = loadSessions }, [loadSessions]);

  const pollLiveChat = useCallback(async () => {
    let sawNew = false;
    try { sawNew = await pollOpenThread(); } catch { /* next tick retries */ }
    pollTickRef.current += 1;
    // Refresh the inbox on its slower cadence, or straight away when the
    // open thread just moved (its preview/ordering is now stale).
    if (sawNew || pollTickRef.current % SESSIONS_REFRESH_EVERY_N_POLLS === 0) {
      await loadSessionsRef.current();
    }
  }, [pollOpenThread]);

  const pollLiveChatRef = useRef(pollLiveChat);
  useEffect(() => { pollLiveChatRef.current = pollLiveChat }, [pollLiveChat]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (selectedId != null) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Cross-session inbox feed — keeps the list fresh and the open thread
  // live. The transport polls whenever the socket isn't actually delivering,
  // so this works identically on hosts that can't serve /ws/ at all.
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) return undefined;

    let cancelled = false;

    // Ask the server whether real-time push is possible here before paying
    // for handshakes that can never succeed.
    (async () => {
      let cfg = {};
      try {
        const r = await adminFetch(`${API}/api/live-chat/config/`);
        cfg = (await r?.json()) || {};
      } catch { /* assume no realtime; polling covers it */ }
      if (cancelled) return;

      socketRef.current = connectLiveChatSocket("/ws/live-chat/admin/inbox/", token, {
        realtime: cfg.realtime !== false,
        pollIntervalMs: cfg.poll_interval_ms || 2000,
        poll: () => pollLiveChatRef.current(),
        onEvent: (event, payload) => {
          if (event === "chat_created") {
            loadSessionsRef.current();
          } else if (event === "new_message") {
            if (payload.ticket_id === selectedIdRef.current) {
              setMessages(prev => mergeById(prev, [payload]));
            }
            if (payload.sender_type === "user") {
              if (payload.ticket_id !== selectedIdRef.current && soundOnRef.current) playChime();
              loadSessionsRef.current();
            }
          }
        },
        onStatusChange: setConnStatus,
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
    // Mount-once: every changing value it needs is reached through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setMessages(prev => mergeById(prev, [saved]));
        // Replying is when the player is most likely to answer back — pull
        // once now rather than waiting out the interval.
        socketRef.current?.refresh();
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
            background: connStatus === "open" || connStatus === "polling" ? `${C.green}18` : `${C.orange}18`,
            color: connStatus === "open" || connStatus === "polling" ? C.green : C.orange,
          }}>
            {connStatus === "open" ? "Live" : connStatus === "polling" ? "Live (polling)" : "Connecting…"}
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
