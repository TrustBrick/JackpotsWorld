import React, { useCallback, useEffect, useState } from "react";
import { History, MessageSquareOff, PhoneOff, ShieldCheck } from "lucide-react";
import { Btn, Spinner } from "./SharedUI";
import { adminFetch, API } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

/**
 * PlayerCommunicationPanel — turn one player's chat and calls on or off.
 *
 * This is the "your issue will be answered within 24 hours, please stop
 * calling" control. It is admin-only in three separate places, and that is
 * deliberate rather than redundant:
 *
 *   1. the endpoints behind it are IsAdminOrSuperAdmin;
 *   2. the SERVICE that opens a chat session or starts a call checks the
 *      restriction, so a player who calls the API directly is still refused;
 *   3. there is no player-facing write path to these rows at all.
 *
 * ── What the player sees, and what they do not ────────────────────────────
 * "Reason" and "Internal note" are staff-only and are never sent to the
 * player. "Message to the player" is the only field they see; leave it blank
 * and they get the default from Live Support settings. That separation is
 * enforced server-side too (see communication_restriction_service) — this
 * screen's labelling is the reminder, not the guarantee.
 */

const CHANNELS = [
  {
    key: "chat",
    label: "Live chat",
    icon: MessageSquareOff,
    help: "Blocks new chat sessions and reopening an existing one.",
  },
  {
    key: "call",
    label: "Voice calls",
    icon: PhoneOff,
    help: "Blocks the player from starting a support call.",
  },
];

function ChannelCard({ userId, channel, state, onSaved, onToast }) {
  const { C } = useAdminTheme();
  const [form, setForm] = useState({
    is_enabled: state.is_enabled,
    disabled_until: state.disabled_until ? state.disabled_until.slice(0, 16) : "",
    reason: state.reason || "",
    admin_note: state.admin_note || "",
    player_message: state.player_message || "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      is_enabled: state.is_enabled,
      disabled_until: state.disabled_until ? state.disabled_until.slice(0, 16) : "",
      reason: state.reason || "",
      admin_note: state.admin_note || "",
      player_message: state.player_message || "",
    });
  }, [state]);

  const inputStyle = {
    width: "100%", padding: "7px 10px", borderRadius: 7,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box",
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch(`${API}/api/admin-panel/players/${userId}/communication/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: channel.key,
          is_enabled: form.is_enabled,
          // Only meaningful while disabled; the server clears it on re-enable
          // anyway, so sending it either way is harmless and keeps one path.
          disabled_until: form.disabled_until || null,
          reason: form.reason,
          admin_note: form.admin_note,
          player_message: form.player_message,
        }),
      });
      if (res?.ok) {
        const json = await res.json();
        onSaved?.(json.channels);
        onToast?.(
          `${channel.label} ${form.is_enabled ? "enabled" : "disabled"} for this player`,
          true,
        );
      } else {
        onToast?.(`Could not update ${channel.label.toLowerCase()}`, false);
      }
    } catch {
      onToast?.(`Could not update ${channel.label.toLowerCase()}`, false);
    }
    setSaving(false);
  };

  const Icon = channel.icon;
  const blocking = state.is_currently_blocking;

  return (
    <div style={{
      border: `1px solid ${blocking ? `${C.red}55` : C.border}`,
      background: blocking ? `${C.red}0D` : "transparent",
      borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 9,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={14} style={{ color: blocking ? C.red : C.green }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, flex: 1 }}>
          {channel.label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          color: blocking ? C.red : C.green,
          background: blocking ? `${C.red}18` : `${C.green}18`,
          border: `1px solid ${blocking ? `${C.red}44` : `${C.green}44`}`,
        }}>
          {blocking ? "Blocked" : "Open"}
        </span>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={form.is_enabled}
          onChange={e => setForm(p => ({ ...p, is_enabled: e.target.checked }))}
        />
        {channel.label} enabled
      </label>
      <p style={{ margin: 0, fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>{channel.help}</p>

      {!form.is_enabled && (
        <>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 10.5, color: C.muted }}>
              Re-enable automatically at (leave empty for indefinite)
            </label>
            <input
              type="datetime-local"
              value={form.disabled_until}
              onChange={e => setForm(p => ({ ...p, disabled_until: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 10.5, color: C.muted }}>
              Reason (staff only)
            </label>
            <input
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Repeated contact while under review"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 10.5, color: C.muted }}>
              Internal note (staff only — never shown to the player)
            </label>
            <textarea
              rows={2}
              value={form.admin_note}
              onChange={e => setForm(p => ({ ...p, admin_note: e.target.value }))}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 10.5, color: C.muted }}>
              Message to the player (blank uses the default from Live Support settings)
            </label>
            <textarea
              rows={2}
              value={form.player_message}
              onChange={e => setForm(p => ({ ...p, player_message: e.target.value }))}
              placeholder="Your issue is being reviewed and we will update you within 24 hours."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </>
      )}

      <Btn onClick={save} disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Saving…" : "Save"}
      </Btn>
    </div>
  );
}

export default function PlayerCommunicationPanel({ userId, onToast }) {
  const { C } = useAdminTheme();
  const [channels, setChannels] = useState(null);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/players/${userId}/communication/`)
      .then(r => r?.json())
      .then(j => { if (j) setChannels(j.channels); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const loadHistory = async () => {
    setShowHistory(v => !v);
    if (history) return;
    try {
      const res = await adminFetch(`${API}/api/admin-panel/players/${userId}/communication/history/`);
      if (res?.ok) setHistory((await res.json()).history || []);
    } catch { /* the panel still works without it */ }
  };

  if (loading && !channels) return <div style={{ padding: 14 }}><Spinner /></div>;
  if (!channels) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <ShieldCheck size={14} style={{ color: C.gold }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text, flex: 1 }}>
          Support access
        </span>
        <button
          type="button"
          onClick={loadHistory}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 9px", borderRadius: 6, fontSize: 10.5,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.muted, cursor: "pointer",
          }}
        >
          <History size={12} /> History
        </button>
      </div>

      {CHANNELS.map(channel => (
        <ChannelCard
          key={channel.key}
          userId={userId}
          channel={channel}
          state={channels[channel.key]}
          onSaved={setChannels}
          onToast={onToast}
        />
      ))}

      {showHistory && (
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 10, padding: 10,
          display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto",
        }}>
          {!history?.length ? (
            <p style={{ margin: 0, fontSize: 11, color: C.muted }}>No changes recorded yet.</p>
          ) : history.map(row => (
            <div key={row.id} style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              <span style={{ color: row.is_enabled ? C.green : C.red, fontWeight: 700 }}>
                {row.channel === "chat" ? "Chat" : "Calls"} {row.is_enabled ? "enabled" : "disabled"}
              </span>
              {" · "}{new Date(row.created_at).toLocaleString()}
              {row.actor ? ` · ${row.actor}` : ""}
              {row.reason ? <div style={{ color: C.text }}>{row.reason}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
