import React, { useEffect, useRef, useState } from "react";
import { Volume2, Save, RefreshCw, Upload } from "lucide-react";
import { Card, Btn, Spinner, SectionTitle } from "../../components/SharedUI";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { adminFetch, API } from "../../helpers";
import { invalidatePromotionsCache } from "../../../services/promotionService";

const ENDPOINT = "/api/admin-panel/promotions/settings/";

// Mirror authapp/utils/file_validation.py's ALLOWED_AUDIO_EXTENSIONS /
// MAX_AUDIO_SIZE_BYTES — a fast client-side pre-check so an obviously-wrong
// file is rejected before the upload starts. The server-side validator is the
// real enforcement.
const ALLOWED_AUDIO_EXT = ["mp3", "ogg", "wav", "m4a", "aac", "webm"];
const MAX_AUDIO_MB = 10;

/**
 * Page-level voice-over for the public Promotions page. A single clip that
 * auto-plays (subject to the browser's autoplay policy) when a visitor opens
 * /promotions. Uploaded/toggled here; consumed by
 * src/components/promotions/PromotionsVoiceOver.jsx via the promotions payload.
 */
export default function PromotionsVoiceOverSettings({ onToast }) {
  const { C } = useAdminTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [audioUrl, setAudioUrl] = useState(null); // currently-saved clip
  const [file, setFile] = useState(null);          // newly-picked replacement
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}${ENDPOINT}`);
      if (!r) return; // session expired — adminFetch already redirected
      if (r.ok) {
        const d = await r.json();
        setEnabled(d.enabled !== false);
        setAudioUrl(d.audio || null);
      }
    } catch {
      onToast?.("Could not load voice-over settings", false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.includes(".") ? f.name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_AUDIO_EXT.includes(ext)) {
      onToast?.(`Unsupported audio type. Allowed: ${ALLOWED_AUDIO_EXT.join(", ")}.`, false);
      e.target.value = "";
      return;
    }
    if (f.size > MAX_AUDIO_MB * 1024 * 1024) {
      onToast?.(`File too large. Max size is ${MAX_AUDIO_MB}MB.`, false);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const save = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("enabled", enabled ? "true" : "false");
      if (file) fd.append("audio", file);

      const r = await adminFetch(`${API}${ENDPOINT}`, { method: "PATCH", body: fd });
      if (!r) return; // session expired
      if (r.ok) {
        const d = await r.json();
        setAudioUrl(d.audio || null);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        invalidatePromotionsCache(); // so the live page picks up the new clip
        onToast?.("Voice-over saved", true);
      } else {
        let msg = `Save failed (HTTP ${r.status})`;
        try {
          const err = await r.json();
          const first = err.audio || err.enabled || err.detail;
          if (first) msg = Array.isArray(first) ? first[0] : first;
        } catch { /* keep the generic message */ }
        onToast?.(msg, false);
      }
    } catch {
      onToast?.("Network error while saving", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <SectionTitle sub="Plays automatically when a visitor opens the Promotions page. Browsers may hold sound until the visitor's first tap; a floating mute button on the page lets them control it.">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Volume2 size={16} style={{ color: C.gold }} /> Promotions Voice-Over
        </span>
      </SectionTitle>

      {loading ? (
        <Spinner />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Enable toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: C.text, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: C.gold }}
            />
            Enabled (play the voice-over on the Promotions page)
          </label>

          {/* Current clip */}
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Current clip</div>
            {audioUrl ? (
              <audio controls src={audioUrl} style={{ width: "100%", maxWidth: 420 }} />
            ) : (
              <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
                None uploaded — the site's bundled fallback clip is used until you add one.
              </div>
            )}
          </div>

          {/* Upload replacement */}
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              {audioUrl ? "Replace clip" : "Upload clip"} ({ALLOWED_AUDIO_EXT.join(", ")}, max {MAX_AUDIO_MB}MB)
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={pickFile}
              style={{ fontSize: 12, color: C.text }}
            />
            {file && (
              <div style={{ fontSize: 12, color: C.gold, marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Upload size={13} /> {file.name} ready to upload
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? "Saving…" : "Save"}
            </Btn>
            <Btn onClick={load} outline disabled={saving}>
              <RefreshCw size={14} /> Reset
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
