// src/hooks/useVideoAnalytics.js
//
// ANALYTICS: attach engagement tracking to an EXISTING <video> element without
// replacing the player. Point it at the same ref the component already uses.
//
// A "view" requires ACTUAL PLAYBACK — video_start fires on the element's
// `play`/`playing` event (autoplay counts once it truly begins), never on load
// or render. Milestones (25/50/75/100) are emitted from `timeupdate`.
// `video_complete` fires on `ended`. A click on the player itself (tapping the
// poster/native controls to start or resume) fires video_click.
//
// Also emitted: `video_impression` when the player is at least half on screen
// (once per video per tab session — the denominator for a view-through rate),
// `video_pause` on a real pause (never on the pause that `ended` implies), and
// `video_exit` when playback was under way and the page or component goes
// away. Pause and exit carry the playhead position and duration, so "where do
// people drop off" is answerable rather than merely "some people left".
//
// Use it ONLY for content videos the user is meant to watch (Featured
// Destination Showcase, Premium Partner, promotional/landing videos). Do NOT
// attach it to muted, looping, decorative background videos.
//
// PLAYBACK SESSIONS — why a refresh doesn't inflate the view count.
// Every event this hook sends carries a client_event_id built from a
// "playback session id" scoped to (contentId, this browser tab). That id is
// minted the first time the video truly starts playing and is persisted to
// sessionStorage, so if the page is refreshed mid-playback the same id comes
// back, the resulting video_start carries the SAME client_event_id as the
// first one, and the server's idempotency constraint (see
// AnalyticsEvent.client_event_id) makes the retry a no-op instead of a second
// counted view — this is what actually fixes it, not any client-side state,
// since client-side state is exactly what a refresh throws away. The id is
// cleared when the video actually finishes (`ended`), so a deliberate later
// re-watch mints a fresh session and is correctly counted as a new view — the
// dedup only ever collapses the SAME unfinished playback attempt seen twice.
import { useEffect, useRef } from "react";
import {
  trackVideoEvent, trackVideoClick, mintActionId,
  trackVideoImpression, trackVideoPause, trackVideoExit,
} from "../services/analytics";

const MILESTONES = [25, 50, 75, 100];
const SESSION_KEY_PREFIX = "jw_video_session:";
// One impression per video per browsing session, tracked separately from the
// playback session because an impression is not a playback: the viewer may
// scroll a video into view repeatedly without ever playing it, and counting
// each of those would make the view-through denominator meaningless.
const IMPRESSION_KEY_PREFIX = "jw_video_impression:";
// How much of the player has to be on screen before it counts as seen. Half,
// so a sliver at the edge of the viewport during a fast scroll doesn't count.
const IMPRESSION_VISIBILITY = 0.5;

function readSession(contentId) {
  try { return sessionStorage.getItem(SESSION_KEY_PREFIX + contentId) || ""; } catch { return ""; }
}
function writeSession(contentId, sessionId) {
  try { sessionStorage.setItem(SESSION_KEY_PREFIX + contentId, sessionId); } catch { /* storage blocked — dedup simply degrades, tracking still works */ }
}
function clearSession(contentId) {
  try { sessionStorage.removeItem(SESSION_KEY_PREFIX + contentId); } catch { /* no-op */ }
}
function randomSessionId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function useVideoAnalytics(videoRef, { contentId, title, contentKind = "content", enabled = true } = {}) {
  const stateRef = useRef({ started: false, milestones: new Set(), completed: false, exited: false, playbackSessionId: "" });

  useEffect(() => {
    const el = videoRef?.current;
    if (!el || !enabled || !contentId) return;

    // Fresh in-mount state each time the element or the content changes, so a
    // player reused for a new video re-counts from scratch. The playback
    // SESSION (below) is deliberately separate from this — it survives a
    // remount/refresh on purpose; this Set only avoids redundant client-side
    // sends within one mount's lifetime.
    const s = { started: false, milestones: new Set(), completed: false, exited: false, playbackSessionId: "" };
    stateRef.current = s;

    // Resume the existing playback session if one is already in flight for
    // this video in this tab (e.g. this is a refresh mid-playback); otherwise
    // this mount hasn't started playing yet, so no session id is minted until
    // it actually does (see start()).
    s.playbackSessionId = readSession(contentId);

    const ensureSession = () => {
      if (!s.playbackSessionId) {
        s.playbackSessionId = randomSessionId();
        writeSession(contentId, s.playbackSessionId);
      }
      return s.playbackSessionId;
    };

    const start = () => {
      if (s.started) return;
      s.started = true;
      const sessionId = ensureSession();
      trackVideoEvent("video_start", {
        contentId, title, contentKind,
        duration: el.duration, watchedSeconds: el.currentTime,
        clientEventId: `${contentId}:${sessionId}:start`,
      });
    };

    const onClick = () => {
      // A tap/click on the player itself — native controls' play/pause button
      // included, since it's the element that receives the click either way.
      // mintActionId debounces a literal double-click into one id; a later,
      // genuinely separate click gets a new id and correctly counts again.
      trackVideoClick(contentId, { title, contentKind });
    };

    const onTimeUpdate = () => {
      const dur = el.duration;
      if (!dur || !isFinite(dur) || dur <= 0) return;
      if (!s.started && !el.paused && el.currentTime > 0) start();
      const sessionId = s.playbackSessionId || ensureSession();
      const pct = (el.currentTime / dur) * 100;
      for (const m of MILESTONES) {
        if (pct >= m && !s.milestones.has(m)) {
          s.milestones.add(m);
          trackVideoEvent("video_progress", {
            contentId, percent: m, title, contentKind,
            watchedSeconds: el.currentTime, duration: dur,
            clientEventId: `${contentId}:${sessionId}:progress:${m}`,
          });
        }
      }
    };

    const onEnded = () => {
      if (s.completed) return;
      s.completed = true;
      const sessionId = s.playbackSessionId || ensureSession();
      trackVideoEvent("video_complete", {
        contentId, percent: 100, title, contentKind,
        watchedSeconds: el.duration || el.currentTime, duration: el.duration,
        clientEventId: `${contentId}:${sessionId}:complete`,
      });
      // The playback attempt this session tracked is now finished — a later
      // re-watch is a deliberately new viewing event (per spec), so free the
      // session id rather than reusing it indefinitely for this tab.
      clearSession(contentId);
      s.playbackSessionId = "";
    };

    const onPause = () => {
      // `ended` also fires a `pause`. A finished video is a completion, not a
      // pause, and recording both would double-count the same moment.
      if (el.ended || !s.started) return;
      trackVideoPause(contentId, {
        title, contentKind,
        position: el.currentTime, duration: el.duration,
      });
    };

    // An exit is "they were watching and then they weren't" — navigating away,
    // closing the tab, or this component unmounting mid-playback. Only
    // meaningful if playback had actually started and had not finished;
    // otherwise there is nothing to exit from.
    const exit = () => {
      if (!s.started || s.completed || s.exited) return;
      s.exited = true;
      trackVideoExit(contentId, {
        title, contentKind,
        position: el.currentTime, duration: el.duration,
        watchedSeconds: el.currentTime,
      });
    };
    const onPageHide = () => exit();

    // IMPRESSION: the player was genuinely on screen. Guarded by
    // sessionStorage so scrolling it in and out repeatedly is still one
    // impression, and by client_event_id so a refresh isn't a second one.
    let observer = null;
    const seenId = () => {
      try { return sessionStorage.getItem(IMPRESSION_KEY_PREFIX + contentId) || ""; } catch { return ""; }
    };
    // The stored value IS the idempotency key, not a bare flag. Storing the id
    // means a refresh that re-fires the observer reuses the same
    // client_event_id, so the server collapses it — belt and braces alongside
    // the "already seen" short-circuit, which a cleared/blocked sessionStorage
    // would otherwise defeat.
    const markSeen = (id) => {
      try { sessionStorage.setItem(IMPRESSION_KEY_PREFIX + contentId, id); } catch { /* degrade quietly */ }
    };

    if (!seenId() && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = seenId() || randomSessionId();
          markSeen(id);
          trackVideoImpression(contentId, {
            title, contentKind,
            clientEventId: `${contentId}:${id}:impression`,
          });
          if (observer) { observer.disconnect(); observer = null; }
          break;
        }
      }, { threshold: IMPRESSION_VISIBILITY });
      observer.observe(el);
    }

    el.addEventListener("play", start);
    el.addEventListener("playing", start);
    el.addEventListener("click", onClick);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);
    return () => {
      // Unmounting mid-playback is itself an exit.
      exit();
      if (observer) observer.disconnect();
      el.removeEventListener("play", start);
      el.removeEventListener("playing", start);
      el.removeEventListener("click", onClick);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("pause", onPause);
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
    };
  }, [videoRef, contentId, title, contentKind, enabled]);
}

// Exported so a CTA button that sits OUTSIDE the <video> element (e.g. a
// promotion's "Claim Bonus" button next to its video) can still generate an
// idempotency-debounced id consistent with how the hook mints its own — see
// services/analytics.js's trackVideoCtaClick, which is what callers actually
// use; this re-export exists only for a caller that needs the raw id.
export { mintActionId };
