import React, { useEffect, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { Card, Btn, Input, Textarea, Spinner } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { handleUnauthorized } from "../../../services/sessionManager";
import { invalidateLandingCache } from "../../../services/landingService";

const ENDPOINT = "/api/admin-panel/landing-settings/";

// Keep in sync with authapp/utils/file_validation.py's
// ALLOWED_VIDEO_EXTENSIONS / MAX_VIDEO_SIZE_BYTES — this is an instant,
// client-side pre-check (better UX, avoids starting a multi-minute upload
// that's doomed to fail), not a substitute for the server-side validator,
// which remains the real enforcement.
const ALLOWED_VIDEO_EXT = ["mp4", "webm", "mov"];
const MAX_VIDEO_MB = 50;

function xhrPatch(url, formData, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

// XHR-based upload with progress — fetch() has no upload-progress API, and a
// multi-second (up to 50MB) video PATCH with no feedback is exactly what
// reads as "frozen" rather than "working." Used only for the hero-video
// path (see save() below); the common text-only save keeps using adminFetch
// unchanged. Mirrors adminFetch's token-refresh-on-401 behavior so a save
// started right as the access token expires still transparently retries
// instead of failing, and resolves to a fetch-Response-shaped object
// ({ ok, status, json() }) so the rest of save() doesn't need to know which
// path produced it.
async function uploadVideoWithProgress(url, formData, onProgress) {
  const token = localStorage.getItem("admin_token");
  let xhr = await xhrPatch(url, formData, token, onProgress);
  if (xhr.status === 401) {
    const refresh = localStorage.getItem("admin_refresh");
    if (!refresh) { await handleUnauthorized("admin"); return null; }
    const rr = await fetch(`${API}/api/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!rr.ok) { await handleUnauthorized("admin"); return null; }
    const d = await rr.json();
    localStorage.setItem("admin_token", d.access);
    if (d.refresh) localStorage.setItem("admin_refresh", d.refresh);
    xhr = await xhrPatch(url, formData, d.access, onProgress);
  }
  return {
    ok: xhr.status >= 200 && xhr.status < 300,
    status: xhr.status,
    json: async () => JSON.parse(xhr.responseText),
  };
}

const FIELDS = [
  { name: "hero_badge_text", label: "Hero Badge Text" },
  { name: "hero_cta_primary_label", label: "Hero Primary CTA Label" },
  { name: "hero_cta_secondary_label", label: "Hero Secondary CTA Label" },
  { name: "hero_tagline", label: "Hero Tagline (below countries ribbon)" },
  { name: "global_reach_tagline", label: "Global Reach Tagline" },
  { name: "trust_banner_heading", label: "Trust Banner Heading" },
  { name: "trust_banner_subtext", label: "Trust Banner Subtext", type: "textarea" },
  { name: "whatsapp_number", label: "WhatsApp Number (digits only, with country code)" },
];

export default function LandingSiteSettingsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [currentVideo, setCurrentVideo] = useState("");

  const load = () => {
    setLoading(true);
    adminFetch(`${API}${ENDPOINT}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        setForm(j);
        setCurrentVideo(j.hero_background_video || "");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const onPickVideo = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) { setVideoFile(null); return; }
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_VIDEO_EXT.includes(ext)) {
      onToast?.(`Unsupported file type. Allowed: ${ALLOWED_VIDEO_EXT.join(", ")}.`, false);
      e.target.value = ""; // clear the native input so it doesn't keep showing the rejected filename
      setVideoFile(null);
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      onToast?.(`Video is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is ${MAX_VIDEO_MB}MB.`, false);
      e.target.value = "";
      setVideoFile(null);
      return;
    }
    setVideoFile(file);
  };

  const save = async () => {
    if (saving) return; // defense in depth — the Save button is already disabled while saving
    setSaving(true);
    setUploadProgress(null);
    const fd = new FormData();
    FIELDS.forEach(f => fd.append(f.name, form[f.name] ?? ""));
    if (videoFile) fd.append("hero_background_video", videoFile);
    try {
      // Only the video-attached path needs XHR/progress — plain field edits
      // are a few KB and finish before a progress readout would even matter.
      const r = videoFile
        ? await uploadVideoWithProgress(`${API}${ENDPOINT}`, fd, setUploadProgress)
        : await adminFetch(`${API}${ENDPOINT}`, { method: "PATCH", body: fd });
      if (!r) { onToast?.("Session expired", false); return; }
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        onToast?.("Site settings saved", true);
        setForm(j);
        setCurrentVideo(j.hero_background_video || "");
        setVideoFile(null);
        invalidateLandingCache();
        return;
      }
      // Real HTTP error with a parseable body -> show the actual cause.
      // Unparseable (e.g. an nginx/ALB gateway/timeout page for a large
      // video upload) -> the outcome is genuinely ambiguous, so say that
      // honestly and reload the real saved state rather than guessing.
      const j = await r.json().catch(() => null);
      if (j) {
        const firstError = Object.values(j)?.[0];
        onToast?.((Array.isArray(firstError) ? firstError[0] : firstError) || `Failed to save (HTTP ${r.status})`, false);
      } else {
        onToast?.(`Save may have failed (HTTP ${r.status}) — refreshing to confirm…`, false);
        load();
      }
    } catch {
      // adminFetch's fetch() itself rejected (connection reset, gateway
      // timeout, offline) — the request may or may not have completed
      // server-side. Never leave the button stuck; re-sync instead of
      // guessing.
      onToast?.("Network error — refreshing to check whether it saved…", false);
      load();
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  if (loading || !form) return <Spinner />;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Landing Page — Site Settings</div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {FIELDS.map(f => (
          <div key={f.name} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            {f.type === "textarea" ? (
              <Textarea label={f.label} value={form[f.name] ?? ""} onChange={v => setForm(p => ({ ...p, [f.name]: v }))} rows={3} />
            ) : (
              <Input label={f.label} value={form[f.name] ?? ""} onChange={v => setForm(p => ({ ...p, [f.name]: v }))} />
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 4, marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Hero Background Video
        </label>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={onPickVideo}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
          MP4, WebM, or MOV — max {MAX_VIDEO_MB}MB.
        </div>
        {!videoFile && currentVideo && (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
            Current: <a href={currentVideo} target="_blank" rel="noreferrer" style={{ color: C.gold }}>view file</a>
          </div>
        )}
      </div>

      <Btn onClick={save} disabled={saving} style={{ width: "100%", justifyContent: "center" }}>
        {saving
          ? (uploadProgress !== null && uploadProgress < 100 ? `Uploading video… ${uploadProgress}%` : "Saving…")
          : <><Save size={13} /> Save Settings</>}
      </Btn>
    </Card>
  );
}
