// LIVE-CHAT: real-time human-agent chat — distinct from SupportTicketsTab.jsx
// (async ticket replies, MULTILINGUAL-CHAT). Both sit on the same
// SupportTicket model; this one only shows is_live_chat=True sessions and
// talks over authapp's live-chat REST + WebSocket API.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LifeBuoy, Send, RefreshCw, CheckCircle2, Volume2, VolumeX, Disc, CircleSlash } from "lucide-react";
import { API, adminFetch, fmtDT } from "../helpers";
import { Card, Btn, Spinner } from "../components/SharedUI";
import { useAdminTheme } from "../context/AdminThemeContext";
import { connectLiveChatSocket } from "../../services/liveChatSocket";
import { asMessageArray, highestRealId, mergeById } from "../../services/liveChatMessages";
// VOICE-CALL: the agent end of in-app support calls. The call lives in
// AdminVoiceCallProvider at panel level so it rings on every tab; this tab
// only reflects it — status badge and per-conversation history.
import { PHASE } from "../../hooks/useVoiceCall";
import { useAdminVoiceCall } from "../context/AdminVoiceCallContext";
import CallStatus from "../../components/support/CallStatus";
import CallHistoryList from "../../components/support/CallHistoryList";
import { adminCallTheme } from "../../components/support/callTheme";
import { openAttachment } from "../../services/attachments";

const SOUND_PREF_KEY = "admin_live_chat_sound";

// VOICE-CALL: the deployment-wide recording switch. Server-side state, not a
// local preference like the chime above — it governs whether *customers* are
// recorded and whether they are told so, which is not a per-browser choice.
const RECORDING_ENDPOINT = "/api/admin-panel/voice-call-settings/";

function isSuperAdmin() {
  try { return !!JSON.parse(localStorage.getItem("admin_user") || "null")?.is_superuser; }
  catch { return false; }
}

// Player and affiliate conversations share the SupportTicket table and are
// told apart by participant_type (set server-side from the portal the chat
// was opened in — never from anything the sender can forge). Filtering is
// done client-side off the single list request so switching tabs doesn't
// re-hit the API or lose the unread counts already loaded.
const FILTERS = [
  { key: "all",       label: "All",        empty: "No live chat sessions yet" },
  { key: "player",    label: "Players",    empty: "No player sessions" },
  { key: "affiliate", label: "Affiliates", empty: "No affiliate sessions" },
];

// Older sessions predate participant_type and have no value; they are all
// player chats, which is exactly what the column defaults to server-side.
const participantOf = s => s.participant_type || "player";

// The session list is far heavier per request than a thread poll (it
// serialises unread counts and a last-message preview for every session), so
// it refreshes on a slower cadence than the open conversation does.
const SESSIONS_REFRESH_EVERY_N_POLLS = 5;

// The recording switch is deployment-wide, so another Super Admin can move it
// while this panel sits open — and a panel showing "Recording on" when the
// server says off is worse than showing nothing, because it is a claim about
// what customers are being told.
//
// It gets a timer of its own rather than riding the tick counter above,
// because that loop only runs while the WebSocket is NOT delivering (see
// liveChatSocket.startPolling/stopPolling). On any host where realtime works
// — which is production — hanging this off it would mean never refreshing at
// all, i.e. exactly the staleness this is meant to remove. Slow, because one
// row that changes a few times a year does not deserve the 2s inbox cadence;
// the visibility catch-up below is what makes it feel immediate in practice.
const RECORDING_REFRESH_MS = 60000;

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
  const [filter, setFilter] = useState("all");
  // null until loaded; the button renders nothing rather than guessing a state
  // it does not know — showing "Recording off" while the server says on would
  // be worse than showing nothing.
  const [recording, setRecording] = useState(null);
  const [recBusy, setRecBusy] = useState(false);
  const recBusyRef = useRef(false);
  useEffect(() => { recBusyRef.current = recBusy; }, [recBusy]);
  const canSwitchRecording = useMemo(() => isSuperAdmin(), []);
  // Same role, separate name: these are two different powers that happen to
  // sit with the same person, and reading one variable for both would hide
  // that if either ever moves.
  const canDeleteCalls = canSwitchRecording;
  const recordingHint = !recording
    ? ""
    : !recording.recording_available
      ? "Recording is switched off for this whole environment (VOICE_CALL_RECORDING_ENABLED). No button here can turn it on."
      : !canSwitchRecording
        ? "Only a Super Admin can change call recording."
        : recording.recording_effective
          ? "Recording is ON — customers are told so while the call rings. Click to turn it off."
          : "Recording is OFF — nothing is stored and no notice is shown. Click to turn it on.";

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

  // ── Voice call (VOICE-CALL) ──────────────────────────────────────────────
  // The call itself is owned by AdminVoiceCallProvider, one level up, so that
  // an agent keeps ringing on every tab rather than only this one. What is
  // left here is read-only: the inline status badge beside the header and the
  // per-conversation call history below. Nothing in this tab answers, ends or
  // negotiates a call any more — that all follows the agent around the panel.
  const voiceCall = useAdminVoiceCall();
  const callTheme = useMemo(() => adminCallTheme(C), [C]);
  const callPhase = voiceCall?.phase ?? PHASE.IDLE;

  const toggleSound = () => {
    setSoundOn(prev => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
      return next;
    });
  };

  // ── Recording switch ──────────────────────────────────────────────────────
  // Read on mount by every agent (the state is not a secret from the people
  // making the calls) and writable only by a Super Admin — the server enforces
  // that; disabling the button is courtesy, not the control.
  const loadRecording = useCallback(async () => {
    try {
      const r = await adminFetch(`${API}${RECORDING_ENDPOINT}`);
      const j = await r?.json();
      if (j && typeof j.recording_enabled === "boolean") setRecording(j);
    } catch { /* the tab still works without the switch */ }
  }, []);

  useEffect(() => { loadRecording(); }, [loadRecording]);

  useEffect(() => {
    const tick = () => {
      // Not on a hidden tab — same reasoning as the transport's poll loop,
      // and the visibility handler catches up the moment it is looked at.
      // Not mid-write either: a response landing between our PATCH and its
      // reply would paint the value we are in the middle of replacing.
      if (document.hidden || recBusyRef.current) return;
      loadRecording();
    };
    const id = setInterval(tick, RECORDING_REFRESH_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadRecording]);

  const toggleRecording = useCallback(async () => {
    if (!recording || recBusy) return;
    const next = !recording.recording_effective;
    setRecBusy(true);
    try {
      const r = await adminFetch(`${API}${RECORDING_ENDPOINT}`, {
        method: "PATCH",
        body: JSON.stringify({ recording_enabled: next }),
      });
      const j = await r?.json().catch(() => null);
      if (r?.ok && j) {
        setRecording(j);
        // Says what changed for *customers*, not just what the flag now reads:
        // switching this off also removes the notice they are shown.
        onToast?.(
          j.recording_effective
            ? "Call recording on — customers are notified while the call rings"
            : "Call recording off — no audio stored, and no notice shown",
          true,
        );
      } else {
        onToast?.(j?.error || "Could not change call recording", false);
      }
    } catch {
      onToast?.("Could not change call recording", false);
    } finally {
      setRecBusy(false);
    }
  }, [recording, recBusy, onToast]);

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
          // VOICE-CALL frames also arrive on this socket, because it joins the
          // same livechat_admins group. They are ignored here on purpose:
          // AdminVoiceCallProvider holds the only call hook in the panel, on
          // its own socket, so handling them here too would ring twice.
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
    // Resolving is the one explicit action that ends a request — a reply or a
    // voice call never does (that rule is enforced in the backend). Confirm
    // first, per the spec's Resolve Request flow.
    if (!window.confirm(
      "Are you sure you want to resolve this request?\n\n" +
      "The customer will no longer be able to send messages or start a call on it. " +
      "The conversation stays visible as history."
    )) return;
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
  const visibleSessions = filter === "all"
    ? sessions
    : sessions.filter(s => participantOf(s) === filter);
  const unreadFor = key => sessions
    .filter(s => key === "all" || participantOf(s) === key)
    .reduce((n, s) => n + (s.unread_count || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LifeBuoy size={15} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Live Support Chat</div>
          {callPhase !== PHASE.IDLE && (
            <CallStatus
              phase={callPhase}
              seconds={voiceCall?.seconds || 0}
              lastEnded={voiceCall?.lastEnded}
              theme={callTheme}
            />
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: connStatus === "open" || connStatus === "polling" ? `${C.green}18` : `${C.orange}18`,
            color: connStatus === "open" || connStatus === "polling" ? C.green : C.orange,
          }}>
            {connStatus === "open" ? "Live" : connStatus === "polling" ? "Live (polling)" : "Connecting…"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {recording && (
            /* The tooltip lives on a wrapper, not on the button: a disabled
               button receives no pointer events, so a title on it is invisible
               in exactly the two cases that need explaining — not a Super
               Admin, or switched off for the whole environment. */
            <span title={recordingHint} style={{ display: "inline-flex" }}>
              <Btn
                outline
                small
                onClick={toggleRecording}
                disabled={recBusy || !canSwitchRecording || !recording.recording_available}
                style={{
                  color: recording.recording_effective ? C.red : C.muted,
                  borderColor: recording.recording_effective ? `${C.red}66` : C.border,
                }}
              >
                {recording.recording_effective ? <Disc size={12} /> : <CircleSlash size={12} />}
                {" "}Recording {recording.recording_effective ? "on" : "off"}
              </Btn>
            </span>
          )}
          <Btn outline small onClick={toggleSound}>
            {soundOn ? <Volume2 size={12} /> : <VolumeX size={12} />} Sound {soundOn ? "on" : "off"}
          </Btn>
          <Btn outline small onClick={loadSessions}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, alignItems: "start" }}>
        {/* Session list */}
        <Card solid style={{ padding: 0, overflow: "hidden" }}>
          {/* Players / Affiliates segmentation — an affiliate asking about a
              commission and a player asking about a withdrawal are different
              queues, and previously both landed in one undifferentiated list. */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              const n = unreadFor(f.key);
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
                    background: active ? `${C.gold}14` : "transparent",
                    borderBottom: `2px solid ${active ? C.gold : "transparent"}`,
                    color: active ? C.gold : C.muted,
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}
                >
                  {f.label}
                  {n > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, minWidth: 15, height: 15, borderRadius: 8,
                      background: "#ff3366", color: "#fff", padding: "0 4px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {loading ? <Spinner /> : visibleSessions.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12.5 }}>
              {sessions.length === 0
                ? FILTERS[0].empty
                : FILTERS.find(f => f.key === filter).empty}
            </div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {visibleSessions.map(s => (
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
                      {s.name || s.email}
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
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.affiliate_id || s.user_uid} · {s.email}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.last_message?.message || "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, gap: 6, alignItems: "center" }}>
                    <span style={{ display: "flex", gap: 5, alignItems: "center", minWidth: 0 }}>
                      {participantOf(s) === "affiliate" && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 20,
                          background: `${C.gold}20`, color: C.gold, letterSpacing: "0.04em", flexShrink: 0,
                        }}>
                          AFFILIATE
                        </span>
                      )}
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                        background: s.status === "resolved" || s.status === "closed" ? `${C.green}18` : `${C.orange}18`,
                        color: s.status === "resolved" || s.status === "closed" ? C.green : C.orange,
                      }}>
                        {s.status.replace("_", " ")}
                      </span>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {selected.name || selected.email}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "1.5px 7px", borderRadius: 20,
                      letterSpacing: "0.04em",
                      background: participantOf(selected) === "affiliate" ? `${C.gold}20` : `${C.blue}18`,
                      color: participantOf(selected) === "affiliate" ? C.gold : C.blue,
                    }}>
                      {participantOf(selected) === "affiliate" ? "AFFILIATE SUPPORT" : "PLAYER SUPPORT"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>
                    {selected.affiliate_id || selected.user_uid} · {selected.email}
                  </div>
                </div>
                {selected.status !== "resolved" && selected.status !== "closed" && (
                  <Btn small onClick={markResolved}><CheckCircle2 size={12} /> Mark Resolved</Btn>
                )}
              </div>

              {/* VOICE-CALL: calls on this conversation. Scoped server-side to
                  what this agent is allowed to see — the component filters
                  nothing itself. refreshKey re-fetches when a call ends. */}
              <div style={{ marginBottom: 12 }}>
                <CallHistoryList
                  fetcher={adminFetch}
                  apiBase={API}
                  endpoint={`/api/admin-panel/live-chat/calls/?ticket_id=${selectedId}`}
                  theme={callTheme}
                  refreshKey={(voiceCall?.lastEnded?.id || 0) + (voiceCall?.recordingSavedAt || 0)}
                  emptyText="No voice calls on this conversation yet"
                  canPlayRecordings
                  canDeleteCalls={canDeleteCalls}
                  onDeleted={() => onToast?.("Call deleted from history", true)}
                />
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "4px 2px" }}>
                {messages.map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.sender_type === "admin" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "70%", padding: "8px 12px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.5,
                      background: m.sender_type === "admin" ? `${C.gold}20` : C.hoverBg,
                      color: C.text, border: `1px solid ${C.border}`,
                    }}>
                      {m.message ? <div>{m.message}</div> : null}
                      {m.attachment_url && (
                        // Opens the private object through its presigned link,
                        // which the API mints per request and which expires --
                        // the agent's own session is what authorises the fetch,
                        // so there is no permanent public URL anywhere.
                        <a
                          href={m.attachment_url}
                          onClick={e => {
                            // Downloaded with the agent's own admin token, so
                            // the server re-checks their entitlement.
                            e.preventDefault();
                            openAttachment(
                              m.attachment_url,
                              m.attachment_name,
                              localStorage.getItem("admin_token"),
                            ).catch(err => alert(err.message));
                          }}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            marginTop: m.message ? 6 : 0,
                            padding: "5px 9px", borderRadius: 8,
                            border: `1px solid ${C.gold}55`,
                            background: `${C.gold}14`,
                            color: C.gold, fontSize: 11.5, fontWeight: 600,
                            textDecoration: "none", maxWidth: "100%",
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                               stroke="currentColor" strokeWidth="2"
                               strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.attachment_name || "Attachment"}
                          </span>
                        </a>
                      )}
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
