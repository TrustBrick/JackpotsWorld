// src/services/liveChatSocket.js
//
// Thin native-WebSocket wrapper for the Live Support Chat feature (no new
// dependency — matches this project's existing "no axios/socket.io"
// convention). Handles exponential-backoff reconnect and reports when it
// gives up, so the caller (ChatBot.jsx / LiveSupportTab.jsx) can fall back
// to polling the equivalent REST endpoint — this is what keeps the feature
// working on deployments without a websocket-capable proxy in front (e.g.
// the cPanel/Passenger deployment, which never runs the `websocket`
// Procfile process) and what satisfies the "reconnection" edge case.

const MAX_BACKOFF_MS = 30000;
const GIVE_UP_AFTER_ATTEMPTS = 5;

function wsBase() {
  const api = import.meta.env.VITE_API_URL || window.location.origin;
  return api.replace(/^http/, "ws");
}

// path: e.g. `/ws/live-chat/42/` or `/ws/live-chat/admin/inbox/`
// handlers: { onEvent(event, data), onStatusChange(status) } — status is
// one of "connecting" | "open" | "reconnecting" | "failed" | "closed".
export function connectLiveChatSocket(path, token, handlers = {}) {
  let socket = null;
  let attempt = 0;
  let closedByCaller = false;
  let retryTimer = null;

  const notify = (status) => handlers.onStatusChange?.(status);

  const open = () => {
    notify(attempt === 0 ? "connecting" : "reconnecting");
    const url = `${wsBase()}${path}?token=${encodeURIComponent(token || "")}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
      attempt = 0;
      notify("open");
    };

    socket.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed?.event) handlers.onEvent?.(parsed.event, parsed.data);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      if (closedByCaller) { notify("closed"); return; }
      attempt += 1;
      if (attempt > GIVE_UP_AFTER_ATTEMPTS) {
        notify("failed");
        return;
      }
      const backoff = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      retryTimer = setTimeout(open, backoff);
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  open();

  return {
    close() {
      closedByCaller = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
