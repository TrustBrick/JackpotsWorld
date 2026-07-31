// src/services/liveChatSocket.js
//
// Transport for the Live Support Chat feature. Native WebSocket only — no
// socket.io, matching this project's existing "no extra client deps"
// convention (it also wouldn't work: socket.io needs a socket.io server,
// and the backend speaks plain ASGI/Channels).
//
// ── Why this is a "channel" and not just a socket ──────────────────────────
// The previous version treated polling as a last-resort fallback that only
// engaged after the socket had failed 5 times with exponential backoff —
// roughly 62 seconds of total silence — and then never went back to the
// socket. Two deployments make that the common path, not the rare one:
//
//   * cPanel/Passenger (the live jackpotsworld.vip host) serves WSGI only
//     and never runs the `websocket` Procfile process, so /ws/ cannot be
//     reached at all.
//   * Any host where the channel layer is InMemory: the socket connects
//     fine, but the REST process that saves a message can't reach the
//     daphne process holding the socket, so the push never arrives and the
//     socket never "fails" either — it just stays silent forever.
//
// So the invariant here is: **something is always fetching**. The poll loop
// runs whenever the socket is not confirmed open, the socket only *replaces*
// polling once it is actually connected, and reconnecting triggers an
// immediate catch-up fetch to cover the gap. Delivery therefore never
// depends on the WebSocket working, and the WebSocket is a latency
// optimisation on top rather than the only path.

const MAX_BACKOFF_MS = 15000;
const DEFAULT_POLL_MS = 2000;

function wsBase() {
  const api = import.meta.env.VITE_API_URL || window.location.origin;
  return api.replace(/^http/, "ws");
}

/**
 * Opens a live-chat channel that keeps `poll` running until (and unless) a
 * WebSocket is genuinely delivering.
 *
 * @param {string}   path            e.g. `/ws/live-chat/42/`
 * @param {string}   token           JWT access token (sent as ?token=, since
 *                                   the browser WebSocket API can't set headers)
 * @param {object}   handlers
 * @param {function} handlers.poll   async () => void — fetch anything new over
 *                                   REST. Called on an interval while the
 *                                   socket is down, and once on (re)connect.
 * @param {function} handlers.onEvent      (eventName, data) => void
 * @param {function} handlers.onStatusChange (status) => void — one of
 *                   "connecting" | "open" | "reconnecting" | "polling" | "closed"
 * @param {boolean}  handlers.realtime      false ⇒ skip the socket entirely and
 *                                          just poll (see LIVE_CHAT_REALTIME)
 * @param {number}   handlers.pollIntervalMs
 */
export function connectLiveChatSocket(path, token, handlers = {}) {
  const {
    poll,
    onEvent,
    onStatusChange,
    realtime = true,
    pollIntervalMs = DEFAULT_POLL_MS,
  } = handlers;

  let socket = null;
  let attempt = 0;
  let closedByCaller = false;
  let retryTimer = null;
  let pollTimer = null;
  let polling = false;

  const notify = (status) => onStatusChange?.(status);

  // ── Poll loop ────────────────────────────────────────────────────────────
  const runPoll = async () => {
    if (closedByCaller || !poll) return;
    // Don't stack requests if one is slow, and don't burn requests on a
    // backgrounded tab — visibilitychange below catches up on return.
    if (polling || document.hidden) return;
    polling = true;
    try { await poll(); } catch { /* transient; next tick retries */ }
    finally { polling = false; }
  };

  const startPolling = () => {
    if (pollTimer || closedByCaller) return;
    runPoll();
    pollTimer = setInterval(runPoll, pollIntervalMs);
  };

  const stopPolling = () => {
    clearInterval(pollTimer);
    pollTimer = null;
  };

  const onVisible = () => { if (!document.hidden) runPoll(); };
  document.addEventListener("visibilitychange", onVisible);

  // ── Socket ───────────────────────────────────────────────────────────────
  const open = () => {
    if (closedByCaller) return;
    notify(attempt === 0 ? "connecting" : "reconnecting");

    let url;
    try {
      url = `${wsBase()}${path}?token=${encodeURIComponent(token || "")}`;
      socket = new WebSocket(url);
    } catch {
      // e.g. mixed-content block on an https page — polling already covers us
      scheduleRetry();
      return;
    }

    socket.onopen = () => {
      attempt = 0;
      notify("open");
      // Catch up on anything sent while we were disconnected, *then* hand
      // over to the socket. Without this, messages that arrived during the
      // gap would stay invisible until the next reload.
      runPoll().finally(stopPolling);
    };

    socket.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed?.event) onEvent?.(parsed.event, parsed.data);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      socket = null;
      if (closedByCaller) { notify("closed"); return; }
      // Resume polling immediately — never leave a gap where neither
      // transport is running.
      startPolling();
      notify("polling");
      scheduleRetry();
    };

    socket.onerror = () => {
      try { socket?.close(); } catch { /* onclose handles the rest */ }
    };
  };

  const scheduleRetry = () => {
    if (closedByCaller) return;
    attempt += 1;
    // Keep retrying forever, but cap the interval. A host that can never
    // serve /ws/ costs one cheap failed handshake every 15s while polling
    // carries the actual traffic.
    const backoff = Math.min(1000 * 2 ** Math.min(attempt, 4), MAX_BACKOFF_MS);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, backoff);
  };

  // Start polling first, so there is zero dead time before the socket
  // resolves one way or the other.
  startPolling();
  if (realtime) {
    open();
  } else {
    notify("polling");
  }

  return {
    /** Force an immediate fetch (e.g. right after sending). */
    refresh: runPoll,
    close() {
      closedByCaller = true;
      clearTimeout(retryTimer);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      try { socket?.close(); } catch { /* already gone */ }
      socket = null;
    },
  };
}
