// Signup Wheel + Bonus Wheel — new admin tab, safe to remove this file along
// with its entry in constants.js's ADMIN_TABS and its case in AdminPanel.jsx
// to remove the feature. Replaces the retired admin/tabs/RewardsTab.jsx
// (Daily Login Spin Wheel management — see authapp/views/spin_views.py).
import React, { useCallback, useEffect, useState } from "react";
import { Save, Plus, X, Pencil, Trash2, UserPlus, History, Search, RefreshCw } from "lucide-react";
import ManageContentTab from "./content/ManageContentTab";
import { Card, Btn, Input, Select, Textarea, Table, Pagination, Spinner, rowHover, SectionTitle } from "../components/SharedUI";
import { adminFetch, API, fmtD, fmtDT } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

const WHEEL_REWARD_TYPE_OPTIONS = [
  { value: "cash_bonus", label: "Cash Bonus" },
  { value: "cashback", label: "Cashback" },
  { value: "rolling_points", label: "Rolling Points" },
  { value: "vip_points", label: "VIP Points" },
  { value: "gift_voucher", label: "Gift Voucher" },
  { value: "merchandise", label: "Merchandise" },
  { value: "hotel_stay", label: "Hotel Stay" },
  { value: "event_ticket", label: "Event Ticket" },
  { value: "casino_coupon", label: "Casino Coupon" },
  { value: "free_travel", label: "Free Travel" },
  { value: "discount", label: "Discount" },
  { value: "free_spins", label: "Free Spins" },
  { value: "physical_gift", label: "Physical Gift" },
  { value: "mystery_reward", label: "Mystery Reward" },
  { value: "no_reward", label: "Try Again" },
];
const rewardTypeLabel = t => WHEEL_REWARD_TYPE_OPTIONS.find(o => o.value === t)?.label || t;

const GRANT_REASON_OPTIONS = [
  { value: "vip_levelup", label: "VIP Level-Up" }, { value: "birthday", label: "Birthday" },
  { value: "loyalty", label: "Loyalty Reward" }, { value: "promotional", label: "Promotional Event" },
  { value: "compensation", label: "Compensation" }, { value: "special_campaign", label: "Special Campaign" },
  { value: "losing_streak", label: "Losing-Streak Reward" }, { value: "winning_milestone", label: "Winning Milestone" },
  { value: "other", label: "Other" },
];

const inputStyle = C => ({
  width: "100%", padding: "9px 12px", borderRadius: 8, background: C.inputBg,
  border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
});
const labelStyle = C => ({ display: "block", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 });

// ─────────────────────────────────────────────────────────────────────────────
// Signup Wheel
// ─────────────────────────────────────────────────────────────────────────────

const SIGNUP_FIELDS = [
  { name: "label", label: "Reward Label", placeholder: "$50" },
  { name: "reward_type", label: "Reward Type", type: "select", options: WHEEL_REWARD_TYPE_OPTIONS },
  { name: "value", label: "Value / Amount", type: "number", placeholder: "50" },
  { name: "probability_pct", label: "Probability (%) — all active tiers should sum to 100", type: "number", placeholder: "30.000" },
  {
    name: "no_repeat_for_player", label: "One-Time Per Player?", type: "select", default: "false",
    options: [{ value: "false", label: "No — can repeat" }, { value: "true", label: "Yes — never repeats once won" }],
  },
  { name: "color", label: "Segment Color (hex, optional)", placeholder: "#0B9C7D" },
  { name: "image", label: "Custom Icon Image (optional — overrides the default icon)", type: "file" },
  { name: "display_order", label: "Display Order", type: "number", default: "0" },
  { name: "is_active", label: "Active?", type: "select", default: "true", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
];
const SIGNUP_COLUMNS = [
  { key: "label", label: "Label" },
  { key: "reward_type", label: "Type", render: item => rewardTypeLabel(item.reward_type) },
  { key: "value", label: "Value" },
  { key: "probability_pct", label: "Probability %" },
  { key: "no_repeat_for_player", label: "One-Time", render: item => (item.no_repeat_for_player === true || item.no_repeat_for_player === "true") ? "Yes" : "—" },
];

function SignupWheelSettingsCard({ onToast }) {
  const { C } = useAdminTheme();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await adminFetch(`${API}/api/admin-panel/wheel/signup/settings/`);
    if (r?.ok) setSettings(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const r = await adminFetch(`${API}/api/admin-panel/wheel/signup/settings/`, {
      method: "PATCH",
      body: JSON.stringify({
        is_enabled: settings.is_enabled,
        max_lifetime_spins: settings.max_lifetime_spins,
        eligibility_window_days: settings.eligibility_window_days,
      }),
    });
    if (r?.ok) { onToast?.("Signup Wheel settings saved", true); setSettings(await r.json()); }
    else onToast?.("Failed to save settings", false);
    setSaving(false);
  };

  if (!settings) return <Card><Spinner /></Card>;

  return (
    <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Signup Wheel Settings</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle(C)}>Enabled</label>
          <select value={String(settings.is_enabled)} onChange={e => setSettings(s => ({ ...s, is_enabled: e.target.value === "true" }))} style={inputStyle(C)}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </div>
        <div>
          <label style={labelStyle(C)}>Max Lifetime Spins / Player</label>
          <input type="number" min={1} value={settings.max_lifetime_spins} onChange={e => setSettings(s => ({ ...s, max_lifetime_spins: e.target.value }))} style={inputStyle(C)} />
        </div>
        <div>
          <label style={labelStyle(C)}>Eligibility Window (days from signup)</label>
          <input type="number" min={1} value={settings.eligibility_window_days} onChange={e => setSettings(s => ({ ...s, eligibility_window_days: e.target.value }))} style={inputStyle(C)} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
        Every new player gets up to this many free spins, only within the eligibility window after they register.
        Disabling this stops the wheel platform-wide immediately.
      </div>
      <Btn onClick={save} disabled={saving} color={C.gold}><Save size={12} /> {saving ? "Saving…" : "Save Settings"}</Btn>
    </Card>
  );
}

function SignupWheelSection({ onToast }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        Configure the Signup Wheel's fixed reward tiers and their odds. Active tiers' Probability % should sum to
        100 — the engine still works if they don't (odds are simply renormalized), but a 100% total keeps the
        numbers meaningful to read. Mark high-value tiers "One-Time Per Player" so a player can never win them twice.
      </div>
      <SignupWheelSettingsCard onToast={onToast} />
      <ManageContentTab resourceLabel="Signup Wheel Reward" apiPath="/api/admin-panel/wheel/signup/rewards/" fields={SIGNUP_FIELDS} columns={SIGNUP_COLUMNS} onToast={onToast} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus Wheel — reward tier modal
// ─────────────────────────────────────────────────────────────────────────────

function RewardFormModal({ wheelId, reward, C, onClose, onSaved }) {
  const isEdit = !!reward?.id;
  const [label, setLabel] = useState(reward?.label || "");
  const [rewardType, setRewardType] = useState(reward?.reward_type || "cash_bonus");
  const [value, setValue] = useState(reward?.value ?? "0");
  const [casinoName, setCasinoName] = useState(reward?.casino_name || "");
  const [weight, setWeight] = useState(reward?.weight ?? "10");
  const [isMystery, setIsMystery] = useState(reward?.is_mystery ?? false);
  const [allowRepeat, setAllowRepeat] = useState(reward?.allow_repeat ?? true);
  const [maxWinners, setMaxWinners] = useState(reward?.max_winners ?? "");
  const [dailyLimit, setDailyLimit] = useState(reward?.daily_limit ?? "");
  const [monthlyLimit, setMonthlyLimit] = useState(reward?.monthly_limit ?? "");
  const [color, setColor] = useState(reward?.color || "");
  const [isActive, setIsActive] = useState(reward?.is_active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) { setError("Label is required."); return; }
    setError(""); setBusy(true);
    const body = {
      label: label.trim(), reward_type: rewardType, value, weight,
      is_mystery: isMystery, allow_repeat: allowRepeat,
      max_winners: maxWinners === "" ? null : maxWinners,
      daily_limit: dailyLimit === "" ? null : dailyLimit,
      monthly_limit: monthlyLimit === "" ? null : monthlyLimit,
      color, is_active: isActive,
      casino_name: rewardType === "casino_coupon" ? casinoName : "",
    };
    const url = isEdit
      ? `${API}/api/admin-panel/wheel/bonus/${wheelId}/rewards/${reward.id}/`
      : `${API}/api/admin-panel/wheel/bonus/${wheelId}/rewards/`;
    const res = await adminFetch(url, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(body) });
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) onSaved();
    else setError(json?.error || Object.values(json || {})[0]?.[0] || "Failed to save reward tier.");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{isEdit ? "Edit Reward Tier" : "New Reward Tier"}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>
          <Input label="Label" value={label} onChange={setLabel} placeholder="Cash Bonus" />
          <Select label="Reward Type" value={rewardType} onChange={setRewardType} options={WHEEL_REWARD_TYPE_OPTIONS} />
          <Input label="Value / Amount" value={value} onChange={setValue} type="number" />
          {rewardType === "casino_coupon" && <Input label="Casino Name" value={casinoName} onChange={setCasinoName} placeholder="Deltin Royale" />}
          <Input label="Weight (relative odds among this wheel's active tiers)" value={weight} onChange={setWeight} type="number" />
          <Input label="Max Winners (platform-wide, blank = unlimited)" value={maxWinners} onChange={setMaxWinners} type="number" />
          <Input label="Daily Limit (blank = unlimited)" value={dailyLimit} onChange={setDailyLimit} type="number" />
          <Input label="Monthly Limit (blank = unlimited)" value={monthlyLimit} onChange={setMonthlyLimit} type="number" />
          <Input label="Segment Color (hex, optional)" value={color} onChange={setColor} placeholder="#0B9C7D" />
          <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer" }}>
              <input type="checkbox" checked={allowRepeat} onChange={e => setAllowRepeat(e.target.checked)} /> Can repeat
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer" }}>
              <input type="checkbox" checked={isMystery} onChange={e => setIsMystery(e.target.checked)} /> Mystery reward
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer" }}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active
            </label>
          </div>
          {error && <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>}
          <Btn onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>{busy ? "Saving…" : isEdit ? "Save Tier" : "Add Tier"}</Btn>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus Wheel — wheel create/edit modal (with nested reward tier list)
// ─────────────────────────────────────────────────────────────────────────────

function WheelFormModal({ wheel, C, onClose, onChanged }) {
  const [current, setCurrent] = useState(wheel);
  const [name, setName] = useState(wheel?.name || "");
  const [campaignTag, setCampaignTag] = useState(wheel?.campaign_tag || "");
  const [description, setDescription] = useState(wheel?.description || "");
  const [isActive, setIsActive] = useState(wheel?.is_active ?? true);
  const [activeFrom, setActiveFrom] = useState(wheel?.active_from ? wheel.active_from.slice(0, 16) : "");
  const [activeUntil, setActiveUntil] = useState(wheel?.active_until ? wheel.active_until.slice(0, 16) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rewardModal, setRewardModal] = useState(null);

  const isEdit = !!current?.id;

  const refetch = useCallback(async () => {
    if (!current?.id) return;
    const r = await adminFetch(`${API}/api/admin-panel/wheel/bonus/${current.id}/`);
    if (r?.ok) setCurrent(await r.json());
  }, [current?.id]);

  const saveWheel = async () => {
    if (!name.trim()) { setError("Wheel name is required."); return; }
    setError(""); setBusy(true);
    const body = {
      name: name.trim(), campaign_tag: campaignTag.trim(), description,
      is_active: isActive, active_from: activeFrom || null, active_until: activeUntil || null,
    };
    const url = isEdit ? `${API}/api/admin-panel/wheel/bonus/${current.id}/` : `${API}/api/admin-panel/wheel/bonus/`;
    const res = await adminFetch(url, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(body) });
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) { setCurrent(json); onChanged(); }
    else setError(json?.error || Object.values(json || {})[0]?.[0] || "Failed to save wheel.");
  };

  const deleteReward = async (rewardId) => {
    await adminFetch(`${API}/api/admin-panel/wheel/bonus/${current.id}/rewards/${rewardId}/`, { method: "DELETE" });
    refetch();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{isEdit ? "Edit Bonus Wheel" : "New Bonus Wheel"}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          <Input label="Wheel Name" value={name} onChange={setName} placeholder="Birthday Wheel" />
          <Input label="Campaign Tag (optional label, for organizing/reporting)" value={campaignTag} onChange={setCampaignTag} placeholder="birthday-2026" />
          <Textarea label="Description" value={description} onChange={setDescription} rows={2} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle(C)}>Active From (optional)</label>
              <input type="datetime-local" value={activeFrom} onChange={e => setActiveFrom(e.target.value)} style={{ ...inputStyle(C), marginBottom: 12 }} />
            </div>
            <div>
              <label style={labelStyle(C)}>Active Until (optional)</label>
              <input type="datetime-local" value={activeUntil} onChange={e => setActiveUntil(e.target.value)} style={{ ...inputStyle(C), marginBottom: 12 }} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer", marginBottom: 14 }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active
          </label>

          {error && <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>}
          <Btn onClick={saveWheel} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>{busy ? "Saving…" : isEdit ? "Save Changes" : "Create Wheel"}</Btn>

          {isEdit ? (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Reward Tiers</div>
                <Btn small onClick={() => setRewardModal({})}><Plus size={12} /> Add Tier</Btn>
              </div>
              {(current.rewards || []).length === 0 ? (
                <div style={{ fontSize: 11.5, color: C.muted, padding: "10px 0" }}>No reward tiers yet — add at least one before assigning this wheel to anyone.</div>
              ) : (current.rewards || []).map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: r.is_active ? C.text : C.muted }}>{r.label}{r.is_mystery ? " (mystery)" : ""}</div>
                    <div style={{ fontSize: 10.5, color: C.muted }}>{rewardTypeLabel(r.reward_type)} · weight {r.weight}{!r.allow_repeat ? " · one-time" : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setRewardModal(r)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><Pencil size={13} /></button>
                    <button onClick={() => deleteReward(r.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 14 }}>Save the wheel first, then add reward tiers.</div>
          )}
        </Card>
      </div>

      {rewardModal && (
        <RewardFormModal
          wheelId={current.id} reward={rewardModal.id ? rewardModal : null} C={C}
          onClose={() => setRewardModal(null)}
          onSaved={() => { setRewardModal(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus Wheel — assign modal
// ─────────────────────────────────────────────────────────────────────────────

function AssignModal({ wheel, C, onClose, onAssigned }) {
  const [targetType, setTargetType] = useState("individual");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [vipLevel, setVipLevel] = useState("5");
  const [country, setCountry] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState([]);
  const [spinsGranted, setSpinsGranted] = useState("1");
  const [grantReason, setGrantReason] = useState("other");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (targetType === "event_registrants" && events.length === 0) {
      adminFetch(`${API}/api/admin-panel/events/`).then(r => r?.json()).then(j => setEvents(j?.results || j || [])).catch(() => {});
    }
  }, [targetType, events.length]);

  useEffect(() => {
    if (targetType !== "individual" || !userQuery.trim()) { setUserResults([]); return; }
    const t = setTimeout(() => {
      adminFetch(`${API}/api/admin-panel/users/?q=${encodeURIComponent(userQuery.trim())}`)
        .then(r => r?.json()).then(j => setUserResults(j?.results || j || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [userQuery, targetType]);

  const buildTarget = () => {
    if (targetType === "individual") return { target_type: "individual", target_user_ids: selectedUsers.map(u => u.id) };
    if (targetType === "vip_level") return { target_type: "vip_level", target_vip_level: Number(vipLevel) };
    if (targetType === "country") return { target_type: "country", target_country: country.trim().toUpperCase() };
    return { target_type: "event_registrants", target_event_id: Number(eventId) };
  };

  const validTarget = () => {
    if (targetType === "individual") return selectedUsers.length > 0;
    if (targetType === "vip_level") return !!vipLevel;
    if (targetType === "country") return country.trim().length === 2;
    return !!eventId;
  };

  const runPreview = async () => {
    setError(""); setPreview(null);
    if (!validTarget()) { setError(targetType === "country" ? "Enter a 2-letter country code (e.g. IN)." : "Choose a valid target."); return; }
    const res = await adminFetch(`${API}/api/admin-panel/wheel/bonus/${wheel.id}/assign/preview/`, { method: "POST", body: JSON.stringify(buildTarget()) });
    const json = await res?.json().catch(() => ({}));
    if (res?.ok) setPreview(json.recipient_count);
    else setError(json?.error || "Preview failed.");
  };

  const submit = async () => {
    if (!validTarget()) { setError("Choose a valid target first."); return; }
    setBusy(true); setError("");
    const body = { ...buildTarget(), spins_granted: Number(spinsGranted) || 1, grant_reason: grantReason, expires_at: expiresAt || null, note };
    const res = await adminFetch(`${API}/api/admin-panel/wheel/bonus/${wheel.id}/assign/`, { method: "POST", body: JSON.stringify(body) });
    const json = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) onAssigned(json);
    else setError(json?.error || "Assignment failed.");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Assign Bonus Wheel</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 16 }}>{wheel.name}</div>

          <Select label="Target" value={targetType} onChange={v => { setTargetType(v); setPreview(null); setError(""); }} options={[
            { value: "individual", label: "Individual Player(s)" },
            { value: "vip_level", label: "VIP Level" },
            { value: "country", label: "Country" },
            { value: "event_registrants", label: "Event Registrants" },
          ]} />

          {targetType === "individual" && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle(C)}>Search Players</label>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
                <input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="Search by name, email, UID…" style={{ ...inputStyle(C), paddingLeft: 30 }} />
              </div>
              {userResults.length > 0 && (
                <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8 }}>
                  {userResults.map(u => (
                    <div key={u.id} onClick={() => { if (!selectedUsers.find(s => s.id === u.id)) setSelectedUsers(prev => [...prev, u]); setUserQuery(""); setUserResults([]); }}
                      style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                      {u.name || u.email} <span style={{ color: C.muted }}>({u.email})</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedUsers.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedUsers.map(u => (
                    <span key={u.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 8px", borderRadius: 20, background: `${C.gold}15`, color: C.gold }}>
                      {u.name || u.email}
                      <X size={10} style={{ cursor: "pointer" }} onClick={() => setSelectedUsers(prev => prev.filter(x => x.id !== u.id))} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {targetType === "vip_level" && (
            <Select label="VIP Level" value={vipLevel} onChange={setVipLevel} options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `VIP ${i + 1}` }))} />
          )}
          {targetType === "country" && (
            <Input label="Country Code (ISO, e.g. IN, US, PH)" value={country} onChange={v => setCountry(v.toUpperCase().slice(0, 2))} placeholder="IN" />
          )}
          {targetType === "event_registrants" && (
            <Select label="Event" value={eventId} onChange={setEventId} placeholder="Choose an event…" options={events.map(e => ({ value: String(e.id), label: e.name }))} />
          )}

          <Btn outline small onClick={runPreview} style={{ marginBottom: 10 }}><RefreshCw size={12} /> Preview Recipients</Btn>
          {preview != null && (
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 14 }}>{preview} player{preview === 1 ? "" : "s"} will receive this wheel.</div>
          )}

          <Input label="Spins Granted (per player)" value={spinsGranted} onChange={setSpinsGranted} type="number" />
          <Select label="Reason" value={grantReason} onChange={setGrantReason} options={GRANT_REASON_OPTIONS} />
          <div>
            <label style={labelStyle(C)}>Expires At (optional)</label>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ ...inputStyle(C), marginBottom: 12 }} />
          </div>
          <Textarea label="Note (internal, optional)" value={note} onChange={setNote} rows={2} />

          {error && <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>}
          <Btn onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>{busy ? "Assigning…" : "Assign Wheel"}</Btn>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus Wheel — main section
// ─────────────────────────────────────────────────────────────────────────────

const GRANTS_PAGE_SIZE = 20;

function BonusWheelsSection({ onToast }) {
  const { C } = useAdminTheme();
  const [wheels, setWheels] = useState([]);
  const [loadingWheels, setLoadingWheels] = useState(true);
  const [wheelModal, setWheelModal] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  const [grants, setGrants] = useState([]);
  const [grantsCount, setGrantsCount] = useState(0);
  const [grantsPage, setGrantsPage] = useState(1);
  const [loadingGrants, setLoadingGrants] = useState(true);
  const [grantsQ, setGrantsQ] = useState("");

  const loadWheels = useCallback(() => {
    setLoadingWheels(true);
    adminFetch(`${API}/api/admin-panel/wheel/bonus/`).then(r => r?.json()).then(j => { if (j) setWheels(j.results || []); }).finally(() => setLoadingWheels(false));
  }, []);

  const loadGrants = useCallback(() => {
    setLoadingGrants(true);
    const params = new URLSearchParams({ page: grantsPage });
    if (grantsQ) params.set("q", grantsQ);
    adminFetch(`${API}/api/admin-panel/wheel/bonus/grants/?${params}`)
      .then(r => r?.json()).then(j => { if (j) { setGrants(j.results || []); setGrantsCount(j.count || 0); } })
      .finally(() => setLoadingGrants(false));
  }, [grantsPage, grantsQ]);

  useEffect(() => { loadWheels(); }, [loadWheels]);
  useEffect(() => { loadGrants(); }, [loadGrants]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <SectionTitle sub="Never self-service — a player only ever spins one of these because your team explicitly granted it.">Bonus Wheels</SectionTitle>
          <Btn small onClick={() => setWheelModal({})}><Plus size={13} /> New Wheel</Btn>
        </div>
        {loadingWheels ? <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {wheels.map(w => (
              <Card key={w.id} style={{ opacity: w.is_active ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: w.is_currently_active ? C.green : C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {w.is_currently_active ? "Active" : "Inactive"}
                  </span>
                  <button onClick={() => setWheelModal(w)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><Pencil size={13} /></button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{w.name}</div>
                {w.campaign_tag && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>#{w.campaign_tag}</div>}
                <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{w.reward_count ?? 0} reward tier(s)</div>
                <Btn small outline onClick={() => setAssignTarget(w)} style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
                  <UserPlus size={12} /> Assign
                </Btn>
              </Card>
            ))}
            {wheels.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>No Bonus Wheels yet — create one to get started.</div>}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <SectionTitle sub="Every spin granted on any Bonus Wheel, across every player.">Grant History</SectionTitle>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
              <input value={grantsQ} onChange={e => { setGrantsQ(e.target.value); setGrantsPage(1); }} placeholder="Search player…"
                style={{ padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", width: 200 }} />
            </div>
            <Btn outline small onClick={loadGrants}><RefreshCw size={12} /> Refresh</Btn>
          </div>
        </div>
        <Table headers={["Player", "Wheel", "Reason", "Spins", "Expires", "Granted"]} loading={loadingGrants} colSpan={6} emptyText="No grants yet">
          {grants.map(g => (
            <tr key={g.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, color: C.text }}>{g.user_name || g.user_email}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{g.user_email}</div>
              </td>
              <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{g.wheel_name}</td>
              <td style={{ padding: "11px 14px", fontSize: 12 }}>{GRANT_REASON_OPTIONS.find(o => o.value === g.grant_reason)?.label || g.grant_reason || "—"}</td>
              <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace" }}>{g.spins_used}/{g.spins_total}</td>
              <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>{g.expires_at ? fmtD(g.expires_at) : "—"}</td>
              <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDT(g.created_at)}</td>
            </tr>
          ))}
        </Table>
        <Pagination page={grantsPage} total={grantsCount} perPage={GRANTS_PAGE_SIZE} onChange={setGrantsPage} />
      </div>

      {wheelModal && (
        <WheelFormModal wheel={wheelModal.id ? wheelModal : null} C={C} onClose={() => setWheelModal(null)} onChanged={loadWheels} />
      )}
      {assignTarget && (
        <AssignModal wheel={assignTarget} C={C} onClose={() => setAssignTarget(null)}
          onAssigned={(json) => { setAssignTarget(null); loadGrants(); onToast?.(`Assigned to ${json.grants_created} player(s).`, true); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tab
// ─────────────────────────────────────────────────────────────────────────────

export default function WheelsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [subTab, setSubTab] = useState("signup");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["signup", "Signup Wheel"], ["bonus", "Bonus Wheels"]].map(([m, l]) => (
          <button key={m} onClick={() => setSubTab(m)} style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${subTab === m ? `${C.gold}40` : C.border}`,
            background: subTab === m ? `${C.gold}12` : "transparent",
            color: subTab === m ? C.gold : C.muted,
          }}>
            {l}
          </button>
        ))}
      </div>
      {subTab === "signup" ? <SignupWheelSection onToast={onToast} /> : <BonusWheelsSection onToast={onToast} />}
    </div>
  );
}
