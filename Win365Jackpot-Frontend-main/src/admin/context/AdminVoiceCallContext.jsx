// src/admin/context/AdminVoiceCallContext.jsx
//
// VOICE-CALL: the agent's end of in-app support calls, hoisted to the whole
// panel.
//
// ── Why this is not inside LiveSupportTab ─────────────────────────────────
// It used to be. AdminPanel mounts exactly one tab at a time, so the call hook
// — and with it the incoming-call card and its ringtone — existed only while
// an agent happened to be looking at Live Support. An agent working Deposits,
// KYC or Users was simply unreachable: the customer's call rang into a group
// whose only listener had been unmounted, and they waited out the full ring
// timeout for an agent who was sitting right there.
//
// Living at the panel level instead means the ring follows the agent across
// every section, which is the entire point of a call: it is an interruption,
// and an interruption you only receive on one screen is not one.
//
// ── Two sockets, on purpose ──────────────────────────────────────────────
// This provider opens its own admin-inbox socket rather than sharing
// LiveSupportTab's. Both land in the same `livechat_admins` group, so both see
// the ring — but only this one owns a call hook, so only one card appears.
// Sharing a socket instead would mean the tab's connection lifecycle (mount,
// unmount, its own reconnects) decided whether calls could be answered, which
// is the coupling this module exists to remove.
//
// Signaling always rides the socket the hook was given, so a call negotiated
// here stays here regardless of which tab is open.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API, adminFetch } from "../helpers";
import { connectLiveChatSocket } from "../../services/liveChatSocket";
import { useVoiceCall, PHASE } from "../../hooks/useVoiceCall";
import { useAdminTheme } from "./AdminThemeContext";
import IncomingCallModal from "../../components/support/IncomingCallModal";
import ActiveCallModal from "../../components/support/ActiveCallModal";
import { adminCallTheme } from "../../components/support/callTheme";

const AdminVoiceCallContext = createContext(null);

/** The panel-wide call state. Returns null outside the provider, so a tab can
 *  render its inline call badge with `?.` and not care. */
export function useAdminVoiceCall() {
  return useContext(AdminVoiceCallContext);
}

export function AdminVoiceCallProvider({ children }) {
  const { C } = useAdminTheme();
  const callTheme = useMemo(() => adminCallTheme(C), [C]);

  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const sendCallSignal = useCallback(
    (action, payload) => socketRef.current?.send?.(action, payload) ?? false,
    [],
  );

  const voiceCall = useVoiceCall({
    role: "agent",
    apiBase: API,
    fetcher: adminFetch,
    sendSignal: sendCallSignal,
  });

  // The socket is created after this hook runs and is replaced on every
  // reconnect, so inbound frames reach the hook through a ref rather than a
  // captured value.
  const voiceCallRef = useRef(voiceCall);
  useEffect(() => { voiceCallRef.current = voiceCall; }, [voiceCall]);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("admin_token");
    if (!token) return undefined;

    (async () => {
      // Calling needs cross-process push to work at all (see
      // voice_call_service.calling_available). Where that is unavailable the
      // call button is hidden from customers anyway, so opening a socket
      // here would buy nothing but handshakes that can never succeed.
      let cfg = {};
      try {
        const r = await adminFetch(`${API}/api/live-chat/config/`);
        cfg = (await r?.json()) || {};
      } catch { /* treated as no realtime below */ }
      if (cancelled || cfg.realtime === false) return;

      socketRef.current = connectLiveChatSocket("/ws/live-chat/admin/inbox/", token, {
        realtime: true,
        // Calls are push-only — there is no REST endpoint that would tell an
        // agent "someone is ringing you right now", because a ring that
        // arrives on a poll cycle has already half expired. So this channel
        // has nothing to poll, and the transport's poll loop is a no-op here.
        poll: () => {},
        onEvent: (event, payload) => {
          voiceCallRef.current?.onSocketEvent?.(event, payload);
        },
        onStatusChange: (s) => setConnected(s === "open"),
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const value = { ...voiceCall, socketConnected: connected, callTheme };

  return (
    <AdminVoiceCallContext.Provider value={value}>
      {children}
      {/* Both surfaces are fixed-position overlays rendered at panel level, so
          they sit above whichever tab is open and follow the agent around. */}
      <IncomingCallModal
        call={voiceCall.phase === PHASE.INCOMING ? voiceCall.call : null}
        onAccept={() => voiceCall.acceptCall(voiceCall.call)}
        onReject={() => voiceCall.rejectCall(voiceCall.call)}
        theme={callTheme}
      />
      <ActiveCallModal
        phase={voiceCall.phase}
        call={voiceCall.call}
        lastEnded={voiceCall.lastEnded}
        seconds={voiceCall.seconds}
        muted={voiceCall.muted}
        speakerOn={voiceCall.speakerOn}
        speakerSupported={voiceCall.speakerSupported}
        recordingEnabled={voiceCall.recordingEnabled}
        error={voiceCall.error}
        onToggleMute={voiceCall.toggleMute}
        onToggleSpeaker={voiceCall.toggleSpeaker}
        onEnd={voiceCall.endCall}
        onDismiss={voiceCall.endCall}
        theme={callTheme}
      />
    </AdminVoiceCallContext.Provider>
  );
}
