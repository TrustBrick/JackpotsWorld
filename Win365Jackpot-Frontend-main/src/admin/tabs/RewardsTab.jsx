import React, { useState, useEffect, useCallback } from "react";
import { Save } from "lucide-react";
import ManageContentTab from "./content/ManageContentTab";
import { Card, Btn, Spinner } from "../components/SharedUI";
import { adminFetch, API } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

const REWARD_TYPE_OPTIONS = [
  { value: "cash_wallet_bonus", label: "Cash Wallet Bonus" },
  { value: "casino_wallet_bonus", label: "Casino Wallet Bonus" },
  { value: "rolling_points", label: "Free Rolling Points" },
  { value: "cashback", label: "Cashback" },
  { value: "bonus_credits", label: "Bonus Credits (Non-Cash)" },
  { value: "merch", label: "Merchandise" },
  { value: "gift_voucher", label: "Gift Voucher" },
  { value: "discount_coupon", label: "Discount Voucher" },
  { value: "event_pass", label: "Event Pass" },
  { value: "tournament_entry", label: "Free Tournament Entry" },
  { value: "jackpot_bonus", label: "Jackpot Bonus" },
  { value: "vip_upgrade", label: "VIP Upgrade" },
  { value: "no_reward", label: "No Reward" },
];

const FIELDS = [
  { name: "label", label: "Reward Label", placeholder: "50 Rolling Points" },
  { name: "reward_type", label: "Reward Type", type: "select", options: REWARD_TYPE_OPTIONS },
  { name: "value", label: "Value / Amount", type: "number", placeholder: "50" },
  { name: "casino_name", label: "Casino (only for Casino Wallet Bonus)", placeholder: "Deltin Royale" },
  {
    name: "tournament", label: "Poker Tournament (only for Free Tournament Entry)", type: "asyncSelect",
    optionsUrl: "/api/admin-panel/poker/", optionLabelKey: "name", placeholder: "— No tournament linked —",
  },
  {
    name: "event", label: "Casino Event (only for Event Pass)", type: "asyncSelect",
    optionsUrl: "/api/admin-panel/events/", optionLabelKey: "name", placeholder: "— No event linked —",
  },
  { name: "image", label: "Reward Logo (Upload)", type: "file" },
  { name: "image_url", label: "Reward Image URL (used if no logo uploaded)", placeholder: "https://…" },
  { name: "description", label: "Reward Description (shown in win popup)", type: "textarea" },
  { name: "weight", label: "Weight (relative odds — non-jackpot tiers only)", type: "number", default: "10" },
  {
    name: "is_jackpot", label: "Jackpot Tier?", type: "select", default: "false",
    options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }],
  },
  {
    name: "is_active", label: "Active?", type: "select", default: "true",
    options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
  },
];

const COLUMNS = [
  { key: "label", label: "Label" },
  { key: "reward_type", label: "Type", render: item => REWARD_TYPE_OPTIONS.find(o => o.value === item.reward_type)?.label || item.reward_type },
  { key: "value", label: "Value" },
  { key: "weight", label: "Weight" },
  { key: "is_jackpot", label: "Jackpot", render: item => (item.is_jackpot === true || item.is_jackpot === "true") ? "🏆 Yes" : "—" },
];

function SpinSettingsCard({ onToast }) {
  const { C } = useAdminTheme();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await adminFetch(`${API}/api/admin-panel/spin-settings/`);
    if (r?.ok) setSettings(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const r = await adminFetch(`${API}/api/admin-panel/spin-settings/`, {
      method: "PATCH",
      body: JSON.stringify({
        max_spins_per_month: settings.max_spins_per_month,
        jackpot_every_n_users: settings.jackpot_every_n_users,
        sound_enabled: settings.sound_enabled,
      }),
    });
    if (r?.ok) { onToast?.("Spin settings saved", true); setSettings(await r.json()); }
    else onToast?.("Failed to save spin settings", false);
    setSaving(false);
  };

  if (!settings) return <Card><Spinner /></Card>;

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 };

  return (
    <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Spin Wheel Settings</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Max Spins / User / Month</label>
          <input type="number" min={1} value={settings.max_spins_per_month}
            onChange={e => setSettings(s => ({ ...s, max_spins_per_month: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Jackpot Every N Eligible Users</label>
          <input type="number" min={1} value={settings.jackpot_every_n_users}
            onChange={e => setSettings(s => ({ ...s, jackpot_every_n_users: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Sound Effects</label>
          <select value={String(settings.sound_enabled)} onChange={e => setSettings(s => ({ ...s, sound_enabled: e.target.value === "true" }))} style={inputStyle}>
            <option value="true" style={{ background: C.surface, color: C.text }}>Enabled</option>
            <option value="false" style={{ background: C.surface, color: C.text }}>Disabled</option>
          </select>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
        The jackpot tier is awarded to every Nth <em>distinct user's</em> first-ever spin — a running platform-wide
        counter, not tied to any individual user's spin count.
      </div>
      <Btn onClick={save} disabled={saving} color={C.gold}>
        <Save size={12} /> {saving ? "Saving…" : "Save Settings"}
      </Btn>
    </Card>
  );
}

/**
 * Admin CRUD for the Daily Login Spin Wheel's reward tiers + platform-wide
 * spin settings. The jackpot tier (is_jackpot=true) is awarded to every Nth
 * distinct eligible user's first-ever spin (see SpinPlayView / SpinSettings).
 * Everything else is a weighted random pick among the active, non-jackpot
 * tiers.
 */
export default function RewardsTab({ onToast }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        Configure the rewards shown on the user Dashboard's Daily Login Spin Wheel. Mark exactly one active
        tier as the Jackpot. Link a specific Poker Tournament / Casino Event for the Tournament Entry / Event
        Pass reward types so winning it auto-registers the player.
      </div>
      <SpinSettingsCard onToast={onToast} />
      <ManageContentTab
        resourceLabel="Spin Reward"
        apiPath="/api/admin-panel/spin-config/"
        fields={FIELDS}
        columns={COLUMNS}
        onToast={onToast}
      />
    </div>
  );
}
