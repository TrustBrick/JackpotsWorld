import React, { useEffect, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { Card, Btn, Input, Textarea, Spinner } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const ENDPOINT = "/api/admin-panel/landing-settings/";

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

  const save = async () => {
    setSaving(true);
    const fd = new FormData();
    FIELDS.forEach(f => fd.append(f.name, form[f.name] ?? ""));
    if (videoFile) fd.append("hero_background_video", videoFile);
    const r = await adminFetch(`${API}${ENDPOINT}`, { method: "PATCH", body: fd });
    if (!r) { onToast?.("Session expired", false); setSaving(false); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      onToast?.("Site settings saved", true);
      setForm(j);
      setCurrentVideo(j.hero_background_video || "");
      setVideoFile(null);
    } else {
      const firstError = Object.values(j)?.[0];
      onToast?.((Array.isArray(firstError) ? firstError[0] : firstError) || "Failed to save", false);
    }
    setSaving(false);
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
          accept="video/*"
          onChange={e => setVideoFile(e.target.files?.[0] || null)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, boxSizing: "border-box" }}
        />
        {!videoFile && currentVideo && (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
            Current: <a href={currentVideo} target="_blank" rel="noreferrer" style={{ color: C.gold }}>view file</a>
          </div>
        )}
      </div>

      <Btn onClick={save} disabled={saving} style={{ width: "100%", justifyContent: "center" }}>
        {saving ? "Saving…" : <><Save size={13} /> Save Settings</>}
      </Btn>
    </Card>
  );
}
