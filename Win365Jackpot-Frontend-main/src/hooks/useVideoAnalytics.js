// src/hooks/useVideoAnalytics.js
//
// ANALYTICS: attach engagement tracking to an EXISTING <video> element without
// replacing the player. Point it at the same ref the component already uses.
//
// A "view" requires ACTUAL PLAYBACK — video_start fires on the element's
// `play`/`playing` event (autoplay counts once it truly begins), never on load
// or render. Milestones (10/25/50/75/90) are emitted from `timeupdate` and are
// de-duplicated per mount, so pausing and resuming around a milestone can't
// send it twice. `video_complete` fires on `ended`.
//
// Use it ONLY for content videos the user is meant to watch (Featured
// Destination Showcase, Premium Partner, promotional/landing videos). Do NOT
// attach it to muted, looping, decorative background videos.
import { useEffect, useRef } from "react";
import { trackVideoEvent } from "../services/analytics";

const MILESTONES = [10, 25, 50, 75, 90];

export function useVideoAnalytics(videoRef, { contentId, title, contentKind = "content", enabled = true } = {}) {
  const stateRef = useRef({ started: false, milestones: new Set(), completed: false });

  useEffect(() => {
    const el = videoRef?.current;
    if (!el || !enabled || !contentId) return;

    // Fresh state each time the element or the content changes, so a player
    // reused for a new video re-counts from scratch.
    const s = { started: false, milestones: new Set(), completed: false };
    stateRef.current = s;

    const start = () => {
      if (s.started) return;
      s.started = true;
      trackVideoEvent("video_start", {
        contentId, title, contentKind,
        duration: el.duration, watchedSeconds: el.currentTime,
      });
    };

    const onTimeUpdate = () => {
      const dur = el.duration;
      if (!dur || !isFinite(dur) || dur <= 0) return;
      if (!s.started && !el.paused && el.currentTime > 0) start();
      const pct = (el.currentTime / dur) * 100;
      for (const m of MILESTONES) {
        if (pct >= m && !s.milestones.has(m)) {
          s.milestones.add(m);
          trackVideoEvent("video_progress", {
            contentId, percent: m, title, contentKind,
            watchedSeconds: el.currentTime, duration: dur,
          });
        }
      }
    };

    const onEnded = () => {
      if (s.completed) return;
      s.completed = true;
      trackVideoEvent("video_complete", {
        contentId, percent: 100, title, contentKind,
        watchedSeconds: el.duration || el.currentTime, duration: el.duration,
      });
    };

    el.addEventListener("play", start);
    el.addEventListener("playing", start);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", start);
      el.removeEventListener("playing", start);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("ended", onEnded);
    };
  }, [videoRef, contentId, title, contentKind, enabled]);
}
