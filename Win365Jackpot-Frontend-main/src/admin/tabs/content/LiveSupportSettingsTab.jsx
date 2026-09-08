import React, { useCallback, useEffect, useState } from "react";
import { Headset, RefreshCw, Save, Upload } from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import { Card, Btn, Spinner } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

/**
 * LiveSupportSettingsTab — one screen for how the support desk behaves.
 *
 * Availability, working hours, hold, forwarding, departments and every
 * player-facing message, all backed by the SAME VoiceCallSettings singleton
 * the recording switch already lives on. Deliberately one row and one screen:
 * a second settings model would mean two places to look for "is calling on?"
 * and two rows that can disagree.
 *
 * Distinct from Support Settings (tabs/content/SupportSettingsTab.jsx), which
 * is the multilingual translation configuration — a different subject with a
 * different model behind it.
 *
 * The Departments view is the shared ManageContentTab, so its list, form and
 * delete flow are the ones every other content tab already uses.
 */

const AUDIO_ACCEPT = ".mp3,.ogg,.wav,.m4a,audio/mpeg,audio/ogg,audio/wav,audio/mp4";

const SECTIONS = [
  {
    title: "Availability",
    fields: [
      {
        name: "chat_enabled", label: "Live chat enabled", type: "boolean",
        hint: "Off closes chat for everyone. To close it for one player, use Player Access below.",
      },
      { name: "calls_enabled", label: "Voice calls enabled", type: "boolean" },
      {
        name: "holiday_mode", label: "Closed today (holiday)", type: "boolean",
        hint: "A one-switch override, so you do not have to edit the hours to close for a day.",
      },
      {
        name: "working_hours_start", label: "Open from", type: "time",
        hint: "Leave both times empty for always open. Calls only — chat still takes messages out of hours.",
      },
      { name: "working_hours_end", label: "Open until", type: "time" },
      {
        name: "ring_timeout_seconds", label: "Ring timeout (seconds, 0 = server default)",
        type: "number",
      },
    ],
  },
  {
    title: "Hold",
    fields: [
      { name: "hold_enabled", label: "Agents can put callers on hold", type: "boolean" },
      {
        name: "hold_audio", label: "Hold audio", type: "file", accept: AUDIO_ACCEPT,
        hint: "Optional. Upload only audio you have the rights to use. With this empty, "
            + "callers hear a plain generated tone instead — not a recording, so no rights apply.",
      },
      {
        name: "hold_message", label: "On-hold message", type: "textarea",
        hint: "Shown to the caller on screen while they are on hold.",
      },
      {
        name: "max_hold_seconds", label: "Maximum hold (seconds, 0 = no limit)", type: "number",
        hint: "The server takes the caller off hold by itself at this point, so nobody is left "
            + "waiting because an agent walked away. Minimum 60 when set.",
      },
    ],
  },
  {
    title: "Forwarding",
    fields: [
      { name: "forwarding_enabled", label: "Agents can forward calls", type: "boolean" },
      {
        name: "transfer_ring_timeout_seconds",
        label: "Forward ring timeout (seconds, 0 = use the call ring timeout)", type: "number",
        hint: "How long a forwarded call rings its target before it returns to the original agent.",
      },
    ],
  },
  {
    title: "Messages shown to players",
    fields: [
      { name: "offline_message", label: "Support offline", type: "textarea" },
      { name: "queue_message", label: "Waiting in the queue", type: "textarea" },
      { name: "call_unavailable_message", label: "Calling unavailable", type: "textarea" },
      {
        name: "chat_disabled_message", label: "Chat disabled for this player", type: "textarea",
        hint: "The default when an admin has not written a specific message on the restriction. "
            + "The internal reason is never shown to the player.",
      },
      { name: "call_disabled_message", label: "Calls disabled for this player", type: "textarea" },
    ],
  },
  {
    title: "Recording",
    fields: [
      {
        name: "recording_enabled", label: "Record calls", type: "boolean",
        hint: "Drives both the agent's recorder and the notice the caller sees before they "
            + "speak, so the two can never disagree. The VOICE_CALL_RECORDING_ENABLED "
            + "environment variable is the hard master switch above this.",
      },
    ],
  },
];

const DEPARTMENT_FIELDS = [
  { name: "name", label: "Department Name", placeholder: "Payments" },
  {
    name: "slug", label: "Slug", placeholder: "payments",
    // A stable identifier the API and clients key off, so the display name can
    // be renamed without breaking anything pointing at it.
  },
  { name: "description", label: "Description", type: "textarea", wide: true },
  {
    name: "agents", label: "Agents", type: "asyncSelect", multiple: true,
    optionsUrl: "/api/admin-panel/live-chat/transfer-targets/", optionsKey: "agents",
    placeholder: "— Select agents —",
  },
  {
    name: "ring_timeout_seconds", label: "Ring timeout (seconds, 0 = use the default)",
    type: "number",
  },
  { name: "order", label: "Sort Order", type: "number" },
  { name: "is_active", label: "Active", type: "boolean", default: true },
];

const DEPARTMENT_COLUMNS = [
  { key: "name", label: "Department" },
  { key: "slug", label: "Slug" },
  { key: "agent_count", label: "Agents" },
];

const VIEWS = [
  { id: "settings", label: "Desk Settings" },
  { id: "departments", label: "Departments" },
];

function SettingsForm({ onToast }) {
  const { C } = useAdminTheme();
  const [form, setForm] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/live-support-settings/`)
      .then(r => r?.json())
      .then(j => { if (j) setForm(j); })
      .catch(() => onToast?.("Could not load live support settings", false))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    // Multipart, because the hold audio may be riding along. A settings save
    // with no file is the same request shape, which keeps one code path.
    const fd = new FormData();
    SECTIONS.forEach(section => {
      section.fields.forEach(f => {
        if (f.type === "file") return;
        const value = form[f.name];
        if (f.type === "boolean") fd.append(f.name, value ? "true" : "false");
        // A blank time or number is sent as an empty string, which DRF reads
        // as null for a nullable field — that is how "always open" is saved.
        else fd.append(f.name, value ?? "");
      });
    });
    if (audioFile) fd.append("hold_audio", audioFile);

    try {
      const res = await adminFetch(`${API}/api/admin-panel/live-support-settings/`, {
        method: "PATCH", body: fd,
      });
      if (res?.ok) {
        setForm(await res.json());
        setAudioFile(null);
        onToast?.("Live support settings saved", true);
      } else {
        const err = await res?.json().catch(() => null);
        const first = err && Object.values(err)[0];
        onToast?.(Array.isArray(first) ? first[0] : "Could not save settings", false);
      }
    } catch {
      onToast?.("Could not save live support settings", false);
    }
    setSaving(false);
  };

  if (loading && !form) return <div style={{ padding: 20 }}><Spinner /></div>;
  if (!form) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {SECTIONS.map(section => (
        <Card key={section.title} style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, color: C.gold, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {section.title}
          </h3>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {section.fields.map(f => (
              <div
                key={f.name}
                style={{ gridColumn: (f.type === "textarea" || f.type === "file") ? "1 / -1" : undefined }}
              >
                {f.type === "boolean" ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!form[f.name]}
                      onChange={e => setForm(p => ({ ...p, [f.name]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                ) : (
                  <>
                    <label
                      htmlFor={`ls-${f.name}`}
                      style={{ display: "block", marginBottom: 5, fontSize: 11.5, color: C.muted }}
                    >
                      {f.label}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        id={`ls-${f.name}`}
                        rows={2}
                        value={form[f.name] ?? ""}
                        onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                      />
                    ) : f.type === "file" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <label
                          htmlFor={`ls-${f.name}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 7,
                            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                            border: `1px solid ${C.border}`, color: C.text, fontSize: 12.5,
                          }}
                        >
                          <Upload size={14} /> {audioFile ? audioFile.name : "Choose file"}
                        </label>
                        <input
                          id={`ls-${f.name}`}
                          type="file"
                          accept={f.accept}
                          onChange={e => setAudioFile(e.target.files?.[0] || null)}
                          style={{ display: "none" }}
                        />
                        {form.hold_audio_url && !audioFile && (
                          // A player, not a link: an admin should be able to
                          // hear what callers will hear before saving it.
                          <audio controls src={form.hold_audio_url} style={{ height: 32 }} />
                        )}
                      </div>
                    ) : (
                      <input
                        id={`ls-${f.name}`}
                        type={f.type === "number" ? "number" : f.type === "time" ? "time" : "text"}
                        value={form[f.name] ?? ""}
                        onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                        style={inputStyle}
                      />
                    )}
                  </>
                )}
                {f.hint && (
                  <p style={{ margin: "5px 0 0", fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>{f.hint}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={save} disabled={saving}>
          <Save size={14} /> {saving ? "Saving…" : "Save Settings"}
        </Btn>
        <Btn variant="ghost" onClick={load} disabled={saving}>
          <RefreshCw size={14} /> Reload
        </Btn>
      </div>
      {form.updated_by_email && (
        <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
          Last saved by {form.updated_by_email}
        </p>
      )}
    </div>
  );
}

export default function LiveSupportSettingsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("settings");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Headset size={17} style={{ color: C.gold }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>Live Support</h2>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
              border: view === v.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: view === v.id ? `${C.gold}15` : "transparent",
              color: view === v.id ? C.gold : C.muted,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "settings" ? (
        <SettingsForm onToast={onToast} />
      ) : (
        <ManageContentTab
          resourceLabel="Department"
          apiPath="/api/admin-panel/support-departments/"
          fields={DEPARTMENT_FIELDS}
          columns={DEPARTMENT_COLUMNS}
          onToast={onToast}
        />
      )}
    </div>
  );
}
