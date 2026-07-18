// MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
import React, { useEffect, useState } from "react";
import { Save, RefreshCw, Languages } from "lucide-react";
import { Card, Btn, Select, Spinner } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const ENDPOINT = "/api/admin-panel/support-settings/";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" }, { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" }, { value: "ta", label: "Tamil" },
  { value: "kn", label: "Kannada" }, { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" }, { value: "bn", label: "Bengali" },
  { value: "gu", label: "Gujarati" }, { value: "pa", label: "Punjabi" },
  { value: "si", label: "Sinhala" }, { value: "vi", label: "Vietnamese" },
  { value: "zh-CN", label: "Chinese" }, { value: "ms", label: "Malay" },
  { value: "th", label: "Thai" }, { value: "fil", label: "Filipino" },
];

const PROVIDER_OPTIONS = [
  { value: "mock", label: "Mock (offline, no external calls)" },
  { value: "openai", label: "OpenAI (real translation — needs OPENAI_API_KEY in .env)" },
  { value: "aws_translate", label: "AWS Translate (not yet configured)" },
  { value: "google_translate", label: "Google Cloud Translate (not yet configured)" },
];

function Toggle({ checked, onChange, label, sub, C }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 10, background: C.hoverBg, border: `1px solid ${C.border}`, cursor: "pointer", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, flexShrink: 0, accentColor: C.gold, cursor: "pointer" }} />
    </label>
  );
}

export default function SupportSettingsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminFetch(`${API}${ENDPOINT}`)
      .then(r => r?.json())
      .then(j => { if (j) setForm(j); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const r = await adminFetch(`${API}${ENDPOINT}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled: form.enabled,
        default_language: form.default_language,
        translation_provider: form.translation_provider,
        fallback_language: form.fallback_language,
        auto_detect_enabled: form.auto_detect_enabled,
      }),
    });
    if (!r) { onToast?.("Session expired", false); setSaving(false); return; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) { onToast?.("Support settings saved", true); setForm(j); }
    else { onToast?.("Failed to save", false); }
    setSaving(false);
  };

  if (loading || !form) return <Spinner />;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Languages size={15} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Support Settings — Multilingual Chat (local preview)</div>
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Toggle
        C={C}
        checked={!!form.enabled}
        onChange={v => setForm(p => ({ ...p, enabled: v }))}
        label="Enable multilingual chat"
        sub="Customers see a language selector on the Support tab; Back Office sees English translations. Requires ENABLE_MULTILINGUAL_CHAT=true in the local .env as well — this toggle alone can't turn the feature on in an environment where that's unset."
      />
      <Toggle
        C={C}
        checked={!!form.auto_detect_enabled}
        onChange={v => setForm(p => ({ ...p, auto_detect_enabled: v }))}
        label="Enable auto-detect language"
        sub="Detect a customer's language from their browser/country when they haven't picked one explicitly."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
        <Select label="Default Language" value={form.default_language} onChange={v => setForm(p => ({ ...p, default_language: v }))} options={LANGUAGE_OPTIONS} placeholder="" />
        <Select label="Fallback Language" value={form.fallback_language} onChange={v => setForm(p => ({ ...p, fallback_language: v }))} options={LANGUAGE_OPTIONS} placeholder="" />
        <div style={{ gridColumn: "1 / -1" }}>
          <Select label="Translation Provider" value={form.translation_provider} onChange={v => setForm(p => ({ ...p, translation_provider: v }))} options={PROVIDER_OPTIONS} placeholder="" />
        </div>
      </div>

      <Btn onClick={save} disabled={saving} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
        {saving ? "Saving…" : <><Save size={13} /> Save Settings</>}
      </Btn>
    </Card>
  );
}
