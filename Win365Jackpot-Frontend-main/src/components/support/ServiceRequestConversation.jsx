// src/components/support/ServiceRequestConversation.jsx
//
// SERVICE-REQUEST CONVERSATION: the customer's per-ticket Chat + Voice + (agent)
// Resolve surface, opened from the "My Service Requests" list. It is NOT a new
// chat or call system — it reuses exactly what the floating ChatBot widget and
// the admin Live Support tab already use:
//
//   • the live-chat REST thread   /api/live-chat/<ticket_id>/messages/
//   • the live-chat WebSocket      /ws/live-chat/<ticket_id>/   (connectLiveChatSocket)
//   • the WebRTC voice call        useVoiceCall({ ticketId }) → /api/live-chat/<ticket_id>/calls/
//   • the shared call UI           ActiveCallModal / CallStatus / VoiceCallButton
//
// The one thing this adds over the floating widget is that it targets the
// *specific* Service Request the customer clicked (its real ticket id), instead
// of the generic get_or_create_active_session thread. The backend
// POST /api/support/tickets/<id>/open-conversation/ promotes that ticket to a
// live thread in place (see live_chat_service.open_ticket_conversation) and
// hands back its transcript.
//
// Business rules mirrored from the backend, never invented here:
//   • Sending a message never resolves the request (post_message only moves
//     open → in_progress). Only an agent's explicit Resolve does.
//   • A resolved/closed request is read-only: composer and call disabled, its
//     history still shown. Enforced server-side (the 409 below is the fallback,
//     the ticket_status push is the instant path); the disabled UI is only the
//     courtesy on top.
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, CheckCircle2, Headset, User as UserIcon } from "lucide-react";
import { C } from "../user/constants";
import { API } from "../user/helpers";
import { getToken } from "../../services/authStorage";
import { connectLiveChatSocket } from "../../services/liveChatSocket";
import { asMessageArray, highestRealId } from "../../services/liveChatMessages";
import { useVoiceCall, PHASE } from "../../hooks/useVoiceCall";
import VoiceCallButton from "./VoiceCallButton";
import ActiveCallModal from "./ActiveCallModal";
import IncomingCallModal from "./IncomingCallModal";
import CallStatus from "./CallStatus";

const LIVE_POLL_MS = 2000;
// Same pair the backend gates messages/calls on (MESSAGEABLE_TICKET_STATUSES /
// CALLABLE_TICKET_STATUSES). Kept in sync by intent, not import — the frontend
// only decides what to *offer*; the server is still the authority that refuses.
const ACTIVE_STATUSES = ["open", "in_progress"];

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};
const fmtDay = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
};

// Mirrors ChatBot's live-mode reconciliation: a just-sent message can arrive
// twice (the REST response and the WebSocket echo), and either can be first.
// Already present by id → no-op; our own optimistic bubble still there → replace
// it; otherwise (e.g. the agent's reply) → append.
function reconcileMessage(prev, real, tempId) {
  if (prev.some(m => m.id === real.id)) return prev;
  const pendingIdx = tempId
    ? prev.findIndex(m => m.id === tempId)
    : prev.findIndex(m => typeof m.id === "string" && m.id.startsWith("pending-")
        && m.sender_type === real.sender_type && m.message === real.message);
  if (pendingIdx !== -1) {
    const next = [...prev];
    next[pendingIdx] = real;
    return next;
  }
  return [...prev, real];
}
function mergeMessages(prev, incoming) {
  if (!incoming.length) return prev;
  return incoming.reduce((acc, m) => reconcileMessage(acc, m), prev);
}

// Read-only fallback for a resolved request that never became a live thread:
// show its original submission and the agent's reply as two bubbles so the
// conversation is never blank. String ids so they can't collide with real ones.
function synthesizeHistory(meta, createdAt) {
  const out = [];
  const original = (meta.message || "").trim();
  if (original && original !== "(live chat session)") {
    out.push({ id: "orig", sender_type: "user", message: original, created_at: createdAt });
  }
  const reply = (meta.admin_reply || "").trim();
  if (reply) out.push({ id: "reply", sender_type: "admin", message: reply, created_at: meta.updated_at || createdAt });
  return out;
}

function StatusBadge({ status }) {
  const active = ACTIVE_STATUSES.includes(status);
  const color = active ? C.green : C.blue; // spec §2/§8: green active, blue resolved
  const label = status === "in_progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
      background: `${color}18`, color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

export default function ServiceRequestConversation({ ticket, onBack, onToast }) {
  const token = getToken("access");
  const [status, setStatus] = useState(ticket.status);
  const [messages, setMessages] = useState([]);
  const [connStatus, setConnStatus] = useState("closed");
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");

  const socketRef = useRef(null);
  const messagesRef = useRef([]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const isActive = ACTIVE_STATUSES.includes(status);

  // ── Voice call — the same hook the ChatBot uses, pointed at THIS ticket ──
  const callFetcher = useCallback((url, opts = {}) => {
    if (!token) return Promise.resolve(undefined);
    return fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }, [token]);
  const sendCallSignal = useCallback(
    (action, payload) => socketRef.current?.send?.(action, payload) ?? false,
    [],
  );
  const voiceCall = useVoiceCall({
    role: "customer",
    apiBase: API,
    fetcher: callFetcher,
    sendSignal: sendCallSignal,
    ticketId: ticket.id,
    enabled: isActive && !!token,
  });
  const voiceCallRef = useRef(voiceCall);
  useEffect(() => { voiceCallRef.current = voiceCall; }, [voiceCall]);

  // Incremental catch-up fetch handed to the transport (?after_id= keeps it a
  // single indexed query), identical in spirit to the ChatBot poll.
  const pollMessages = useCallback(async () => {
    if (!token) return;
    const afterId = highestRealId(messagesRef.current);
    const qs = afterId ? `?after_id=${afterId}` : "";
    const res = await fetch(`${API}/api/live-chat/${ticket.id}/messages/${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const fresh = asMessageArray(await res.json());
    if (fresh.length) setMessages(prev => mergeMessages(prev, fresh));
  }, [token, ticket.id]);

  const teardown = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  // ── Open the conversation on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/support/tickets/${ticket.id}/open-conversation/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("open failed");
        const data = await res.json();
        if (cancelled) return;

        const meta = data.ticket || {};
        const nextStatus = meta.status || ticket.status;
        setStatus(nextStatus);

        let initial = asMessageArray(data.messages);
        if (!initial.length) initial = synthesizeHistory(meta, meta.created_at || ticket.created_at);
        setMessages(initial);
        messagesRef.current = initial;
        setLoading(false);

        // Only a still-active request gets a live socket; a resolved one is
        // pure history, so there is nothing to push and no composer to feed.
        if (ACTIVE_STATUSES.includes(nextStatus)) {
          teardown();
          socketRef.current = connectLiveChatSocket(`/ws/live-chat/${ticket.id}/`, token, {
            realtime: data.realtime !== false,
            pollIntervalMs: data.poll_interval_ms || LIVE_POLL_MS,
            poll: pollMessages,
            onEvent: (event, payload) => {
              if (event === "new_message" && payload?.ticket_id === ticket.id) {
                setMessages(prev => reconcileMessage(prev, payload));
                return;
              }
              // Live resolve push — flip to the read-only state at once.
              if (event === "ticket_status" && payload?.ticket_id === ticket.id) {
                if (payload.status) setStatus(payload.status);
                return;
              }
              // Voice-call frames share this socket; the hook ignores anything
              // it doesn't recognise, so chat is unaffected.
              voiceCallRef.current?.onSocketEvent?.(event, payload);
            },
            onStatusChange: setConnStatus,
          });
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          onToast?.("Couldn't open this request right now. Please try again.", false);
        }
      }
    })();
    return () => { cancelled = true; teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // Once the request is no longer active (agent resolved it), drop the socket.
  useEffect(() => {
    if (!isActive) { teardown(); setConnStatus("closed"); }
  }, [isActive, teardown]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (isActive) setTimeout(() => inputRef.current?.focus(), 200); }, [isActive]);

  const doSend = useCallback(async (text) => {
    if (!text || !token) return;
    const tempId = `pending-${Date.now()}`;
    const clientMessageId = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID() : `${ticket.id}-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, sender_type: "user", message: text, status: "pending",
      created_at: new Date().toISOString(),
    }]);
    const attempt = () => fetch(`${API}/api/live-chat/${ticket.id}/messages/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, client_message_id: clientMessageId }),
    });
    try {
      let res = await attempt();
      if (!res.ok && res.status !== 429 && res.status !== 409) res = await attempt();
      if (res.status === 409) {
        // Resolved out from under us (the 409 gate). Reflect it, drop the bubble.
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setStatus("resolved");
        onToast?.("This service request has been resolved.", false);
        return;
      }
      if (!res.ok) throw new Error("send failed");
      const saved = await res.json();
      setMessages(prev => reconcileMessage(prev, saved, tempId));
      socketRef.current?.refresh();
    } catch {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: "failed" } : m)));
    }
  }, [token, ticket.id, onToast]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !isActive) return;
    setInput("");
    doSend(text);
  };
  const retryMessage = (m) => {
    setMessages(prev => prev.filter(x => x.id !== m.id));
    doSend(m.message);
  };
  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  // Render helpers — insert a centred date pill whenever the day changes.
  let lastDay = null;

  return (
    <>
      {/* VOICE-CALL: a support callback rings *here* now, so the player needs
          the same incoming card the agent has. Rendered alongside the active
          call surface and outside the launcher's own stacking context, so it
          is centred on the viewport rather than pinned to the corner widget. */}
      <IncomingCallModal
        call={voiceCall.phase === PHASE.INCOMING ? voiceCall.call : null}
        onAccept={() => voiceCall.acceptCall(voiceCall.call)}
        onReject={() => voiceCall.rejectCall(voiceCall.call)}
      />
      <ActiveCallModal
        phase={voiceCall.phase}
        call={voiceCall.call}
        lastEnded={voiceCall.lastEnded}
        seconds={voiceCall.seconds}
        muted={voiceCall.muted}
        speakerOn={voiceCall.speakerOn}
        speakerSupported={voiceCall.speakerSupported}
        error={voiceCall.error}
        recordingEnabled={voiceCall.recordingEnabled}
        onToggleMute={voiceCall.toggleMute}
        onToggleSpeaker={voiceCall.toggleSpeaker}
        onEnd={voiceCall.endCall}
        onDismiss={voiceCall.endCall}
      />

      <div style={{
        display: "flex", flexDirection: "column",
        height: "min(74vh, 720px)",
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
          borderBottom: `1px solid ${C.border}`,
          background: "linear-gradient(135deg, rgba(212,175,55,0.06), rgba(212,175,55,0.02))",
          flexShrink: 0,
        }}>
          <button
            onClick={onBack}
            aria-label="Back to my service requests"
            style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0, cursor: "pointer",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
              color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ticket.subject}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
              Service Request #SR-{ticket.id}
              {isActive && (
                <span style={{ marginLeft: 8, color: connStatus === "open" || connStatus === "polling" ? C.green : "rgba(255,255,255,0.35)" }}>
                  · {connStatus === "open" || connStatus === "polling" ? "Connected" : "Connecting…"}
                </span>
              )}
            </div>
          </div>
          {isActive && voiceCall.phase !== PHASE.IDLE && (
            <CallStatus phase={voiceCall.phase} seconds={voiceCall.seconds} lastEnded={voiceCall.lastEnded} />
          )}
          <StatusBadge status={status} />
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 14px",
          display: "flex", flexDirection: "column", gap: 10,
          scrollbarWidth: "thin", scrollbarColor: "rgba(212,175,55,0.15) transparent",
        }}>
          {loading ? (
            <div style={{ margin: "auto", color: "rgba(255,255,255,0.4)", fontSize: 12.5 }}>Loading conversation…</div>
          ) : messages.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12.5, maxWidth: 260 }}>
              No messages yet. Send a message below and an agent will reply here.
            </div>
          ) : messages.map((m, i) => {
            const day = fmtDay(m.created_at);
            const showDay = day && day !== lastDay;
            lastDay = day || lastDay;
            const isUser = m.sender_type === "user";
            return (
              <React.Fragment key={m.id ?? i}>
                {showDay && (
                  <div style={{ alignSelf: "center", margin: "4px 0", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.04)", padding: "3px 10px", borderRadius: 20 }}>
                    {day}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, padding: "0 4px" }}>
                    {isUser
                      ? <UserIcon size={11} style={{ color: C.gold }} />
                      : <Headset size={11} style={{ color: C.blue }} />}
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
                      {isUser ? "You" : "Support Agent"}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{fmtTime(m.created_at)}</span>
                  </div>
                  <div style={{
                    maxWidth: "82%", padding: "9px 13px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
                    borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    opacity: m.status === "pending" ? 0.6 : 1,
                    background: isUser ? "linear-gradient(135deg, #D4AF37, #c9a227)" : "rgba(255,255,255,0.05)",
                    border: m.status === "failed" ? `1px solid ${C.red}` : isUser ? "none" : `1px solid ${C.border}`,
                    color: isUser ? "#0a0005" : "rgba(255,255,255,0.88)",
                    fontWeight: isUser ? 600 : 400,
                  }}>
                    {m.message}
                  </div>
                  {m.status === "failed" && (
                    <button onClick={() => retryMessage(m)} style={{ marginTop: 4, background: "none", border: "none", color: C.red, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                      Failed to send — tap to retry
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Resolved banner (read-only state) */}
        {!isActive && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
            borderTop: `1px solid ${C.border}`, background: `${C.blue}10`, flexShrink: 0,
          }}>
            <CheckCircle2 size={15} style={{ color: C.blue, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>
              This service request has been resolved. The conversation is kept here for your reference.
            </span>
          </div>
        )}

        {/* Call row — only while active; VoiceCallButton renders nothing when
            calling can't work here (unsupported browser, or a host that can't
            push signaling). "open" (not "polling") is required: an SDP offer
            needs a live socket or it rings into nothing. */}
        {isActive && voiceCall.phase === PHASE.IDLE && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "8px 14px", borderTop: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Prefer to talk it through?</span>
            <VoiceCallButton
              available={voiceCall.available && connStatus === "open"}
              busy={voiceCall.isBusy}
              onClick={voiceCall.startCall}
              label="Call Agent"
            />
          </div>
        )}

        {/* Composer — disabled once resolved (server refuses it either way). */}
        {isActive && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
            borderTop: `1px solid ${C.border}`, background: "rgba(0,0,0,0.2)", flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type your message…"
              style={{
                flex: 1, borderRadius: 10, border: `1px solid ${C.border}`,
                padding: "10px 13px", fontSize: 13, background: "rgba(255,255,255,0.05)",
                color: "#fff", outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              aria-label="Send message"
              style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: input.trim() ? "linear-gradient(135deg, #D4AF37, #c9a227)" : "rgba(212,175,55,0.15)",
                border: `1px solid ${C.gold}55`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: input.trim() ? "pointer" : "default",
                color: input.trim() ? "#0a0005" : "rgba(212,175,55,0.4)",
              }}
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
