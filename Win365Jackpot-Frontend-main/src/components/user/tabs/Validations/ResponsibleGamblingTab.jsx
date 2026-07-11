import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck, AlertTriangle, Clock, Ban, BookOpen,
  LifeBuoy, Save, Info,
} from "lucide-react";
import { C } from "../../constants";
import { authFetch, API } from "../../helpers";
import { Spinner } from "../../components/SharedUI";

function SectionHeader({ color, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: color }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: "16px 18px", ...style,
    }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
  color: "white", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const HELP_RESOURCES = [
  { name: "GamCare", url: "https://www.gamcare.org.uk" },
  { name: "BeGambleAware", url: "https://www.begambleaware.org" },
  { name: "National Council on Problem Gambling", url: "https://www.ncpgambling.org" },
];

export default function ResponsibleGamblingTab({ onToast }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    deposit_limit_daily: "", deposit_limit_weekly: "", deposit_limit_monthly: "",
    cooling_off_until: "", self_exclusion_until: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/api/user/responsible-gambling/`);
      if (r?.ok) {
        const j = await r.json();
        setSettings(j);
        setForm({
          deposit_limit_daily: j.deposit_limit_daily ?? "",
          deposit_limit_weekly: j.deposit_limit_weekly ?? "",
          deposit_limit_monthly: j.deposit_limit_monthly ?? "",
          cooling_off_until: j.cooling_off_until ?? "",
          self_exclusion_until: j.self_exclusion_until ?? "",
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (fields) => {
    setSaving(true);
    try {
      const r = await authFetch(`${API}/api/user/responsible-gambling/`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      if (r?.ok) { onToast?.(t("responsibleGambling.preferencesSaved"), true); load(); }
      else onToast?.(t("responsibleGambling.failedToSave"), false);
    } catch {
      onToast?.(t("system.networkError"), false);
    }
    setSaving(false);
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${C.green}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShieldCheck size={16} style={{ color: C.green }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>{t("responsibleGambling.header")}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t("responsibleGambling.toolsSubtitle")}</div>
        </div>
      </div>

      {/* Policy */}
      <div>
        <SectionHeader color={C.blue}>{t("responsibleGambling.policyTitle")}</SectionHeader>
        <Card>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: 0 }}>
            {t("responsibleGambling.policyText")}
          </p>
        </Card>
      </div>

      {/* Deposit limits */}
      <div>
        <SectionHeader color={C.gold}>{t("responsibleGambling.depositLimits")}</SectionHeader>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
            {[
              { key: "deposit_limit_daily", label: t("responsibleGambling.daily") },
              { key: "deposit_limit_weekly", label: t("responsibleGambling.weekly") },
              { key: "deposit_limit_monthly", label: t("responsibleGambling.monthly") },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{f.label}</label>
                <input
                  type="number" min="0" placeholder={t("responsibleGambling.noLimit")}
                  value={form[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => save({
              deposit_limit_daily: form.deposit_limit_daily || null,
              deposit_limit_weekly: form.deposit_limit_weekly || null,
              deposit_limit_monthly: form.deposit_limit_monthly || null,
            })}
            disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: `${C.gold}18`, border: `1px solid ${C.gold}40`, color: C.gold, cursor: saving ? "not-allowed" : "pointer" }}
          >
            <Save size={13} /> {t("responsibleGambling.saveLimits")}
          </button>
        </Card>
      </div>

      {/* Session reminder */}
      <div>
        <SectionHeader color={C.teal}>{t("responsibleGambling.sessionReminder")}</SectionHeader>
        <Card style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Clock size={15} style={{ color: C.teal, flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
            {t("responsibleGambling.sessionReminderText")}
          </div>
        </Card>
      </div>

      {/* Cooling-off + self-exclusion */}
      <div>
        <SectionHeader color={C.orange}>{t("responsibleGambling.coolingOffSelfExclusion")}</SectionHeader>
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{t("responsibleGambling.coolingOffUntil")}</label>
              <input
                type="date"
                value={form.cooling_off_until}
                onChange={e => setForm(prev => ({ ...prev, cooling_off_until: e.target.value }))}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: "block", fontSize: 10, color: C.red, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{t("responsibleGambling.selfExclusionUntil")}</label>
              <input
                type="date"
                value={form.self_exclusion_until}
                onChange={e => setForm(prev => ({ ...prev, self_exclusion_until: e.target.value }))}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 8, background: `${C.red}10`, border: `1px solid ${C.red}25` }}>
            <AlertTriangle size={14} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>
              {t("responsibleGambling.selfExclusionWarning")}
            </span>
          </div>
          <button
            onClick={() => save({
              cooling_off_until: form.cooling_off_until || null,
              self_exclusion_until: form.self_exclusion_until || null,
            })}
            disabled={saving}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: `${C.red}18`, border: `1px solid ${C.red}40`, color: C.red, cursor: saving ? "not-allowed" : "pointer" }}
          >
            <Ban size={13} /> {t("common.save")}
          </button>
        </Card>
      </div>

      {/* Awareness */}
      <div>
        <SectionHeader color={C.purple}>{t("responsibleGambling.gamblingAwareness")}</SectionHeader>
        <Card style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <BookOpen size={15} style={{ color: C.purple, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: 0 }}>
            {t("responsibleGambling.awarenessText")}
          </p>
        </Card>
      </div>

      {/* Help resources */}
      <div>
        <SectionHeader color={C.blue}>{t("responsibleGambling.helpResources")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {HELP_RESOURCES.map(r => (
            <Card key={r.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>{r.name}</span>
              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: C.blue, textDecoration: "none" }}>{t("responsibleGambling.visit")}</a>
            </Card>
          ))}
        </div>
      </div>

      {/* Contact support */}
      <Card style={{ display: "flex", alignItems: "center", gap: 10, background: `${C.blue}08`, border: `1px solid ${C.blue}25` }}>
        <LifeBuoy size={15} style={{ color: C.blue, flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
          {t("responsibleGambling.needToTalk")} <b style={{ color: "white" }}>{t("sidebar.liveSupport")}</b> {t("responsibleGambling.toRaiseTicket")}
        </div>
      </Card>
    </div>
  );
}
