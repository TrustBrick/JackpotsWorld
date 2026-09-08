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
import TransferCallModal from "../../components/support/TransferCallModal";
import IncomingTransferModal from "../../components/support/IncomingTransferModal";
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

  // Loaded on demand when the agent opens the picker, not on mount: the
  // roster only matters while a transfer is being chosen, and fetching it for
  // every agent on every panel load would be a request per session for a list
  // most of them never open.
  const fetchTransferTargets = useCallback(async () => {
    const res = await adminFetch(`${API}/api/admin-panel/live-chat/transfer-targets/`);
    return res?.ok ? res.json() : null;
  }, []);

  const [transferOpen, setTransferOpen] = useState(false);

  // Accepting a forward is a multi-step negotiation (accept, subscribe, offer),
  // not a single post, so the card has to stay put and stay disabled until it
  // resolves — otherwise the agent presses again and the second accept is
  // refused, replacing a working call with an error.
  // Read fresh rather than cached: the whole failure this guards against is a
  // token that changed under the panel after the socket was already open.
  const signedInAdmin = (() => {
    try {
      return JSON.parse(localStorage.getItem("admin_user") || "{}");
    } catch {
      return {};
    }
  })();

  const [accepting, setAccepting] = useState(false);
  const acceptForwardedCall = useCallback(async () => {
    const transfer = voiceCall.incomingTransfer;
    if (!transfer || accepting) return;
    setAccepting(true);
    try {
      await voiceCall.acceptTransfer(transfer);
    } finally {
      setAccepting(false);
    }
  }, [voiceCall, accepting]);

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
      {/* showCallerContact: this is the agent's own screen, so the identity
          on it is the caller's — `receiver_name` here is the agent. */}
      <ActiveCallModal
        phase={voiceCall.phase}
        call={voiceCall.call}
        lastEnded={voiceCall.lastEnded}
        seconds={voiceCall.seconds}
        muted={voiceCall.muted}
        speakerOn={voiceCall.speakerOn}
        speakerSupported={voiceCall.speakerSupported}
        recordingEnabled={voiceCall.recordingEnabled}
        showCallerContact
        onHold={voiceCall.onHold}
        transferring={voiceCall.transferring}
        holdMessage={voiceCall.holdMessage}
        // The agent's own surface, so both controls are offered here. Hold is
        // still gated on the server's hold_enabled setting; forwarding is
        // gated on forwarding_enabled, and the endpoints refuse either way.
        canHold={voiceCall.holdEnabled}
        canForward
        onHoldToggle={() => (voiceCall.onHold ? voiceCall.resumeCall() : voiceCall.holdCall())}
        onForward={() => setTransferOpen(true)}
        error={voiceCall.error}
        onToggleMute={voiceCall.toggleMute}
        onToggleSpeaker={voiceCall.toggleSpeaker}
        onEnd={voiceCall.endCall}
        onDismiss={voiceCall.endCall}
        theme={callTheme}
      />
      <TransferCallModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onSubmit={voiceCall.transferCall}
        fetchTargets={fetchTransferTargets}
        theme={callTheme}
      />
      {/* A colleague has forwarded a call here. Rendered at panel level like
          the incoming-call card above, for the same reason: an escalation is
          an interruption, and one that only reaches an agent while they happen
          to have Live Support open is not one. */}
      <IncomingTransferModal
        transfer={voiceCall.incomingTransfer}
        onAccept={acceptForwardedCall}
        onDecline={() => voiceCall.respondToTransfer(voiceCall.incomingTransfer?.id, "decline")}
        // Taking a forwarded call needs the same browser capabilities as
        // answering any other one. Without this the card offered a button that
        // could not work and said nothing when it didn't.
        canAccept={voiceCall.supported}
        busy={accepting}
        error={voiceCall.error}
        signedInAdminId={signedInAdmin?.id ?? null}
        signedInAs={signedInAdmin?.email || ""}
        theme={callTheme}
      />
    </AdminVoiceCallContext.Provider>
  );
}
