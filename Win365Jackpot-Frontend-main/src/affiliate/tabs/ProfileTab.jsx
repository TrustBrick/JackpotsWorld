import React, { useState, useEffect, useCallback } from "react";
import { User, Mail, Phone, Globe, Calendar, Save } from "lucide-react";
import { API, affiliateFetch, fmtD } from "../helpers";
import { PhoneInput, DEFAULT_COUNTRY, DIGIT_MAP } from "../../components/AuthModal";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
  color: "white", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const labelStyle = {
  display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};

export default function ProfileTab({ onToast }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/user/profile/`);
    if (res?.ok) {
      const j = await res.json();
      setProfile(j);
      // Strip the dial code off the stored full phone so PhoneInput only
      // shows the local digits (dial code is shown separately via `country`).
      const dial = j.dial_code || DEFAULT_COUNTRY.code;
      const localDigits = (j.phone || "").startsWith(dial) ? j.phone.slice(dial.length) : (j.phone || "");
      setForm({ name: j.name || "", phone: localDigits });
      setCountry(c => (c.code === dial ? c : { ...DEFAULT_COUNTRY, code: dial }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`${API || ''}/api/auth/countries/`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const mapped = data
          .map(c => ({ code: c.dial_code, iso2: c.code, flag: c.flag, name: c.name, digits: DIGIT_MAP[c.dial_code] || 10, placeholder: '0'.repeat(DIGIT_MAP[c.dial_code] || 10), format: v => v }))
          .filter(c => c.code && c.code !== '+');
        setCountries(mapped);
        // Reconcile the placeholder country (set from profile.dial_code before
        // the full list loaded) with its real flag/name/digit-count entry.
        setCountry(cur => mapped.find(m => m.code === cur.code) || cur);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await affiliateFetch(`${API}/api/user/profile/`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name,
        phone: form.phone ? country.code + form.phone : "",
        country: country.iso2 || "IN",
        dial_code: country.code,
      }),
    });
    if (res?.ok) { onToast?.("Profile updated!", true); load(); }
    else onToast?.("Failed to update profile", false);
    setSaving(false);
  };

  if (!profile) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.gold}, ${C.gold}80)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 900, color: "#06080E", flexShrink: 0,
        }}>
          {(profile.name || profile.email || "A")[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>{profile.name || profile.email?.split("@")[0]}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{profile.email}</div>
        </div>
      </div>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 14 }}>Edit Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Your full name" />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <PhoneInput
              value={form.phone}
              country={country}
              countries={countries}
              onValueChange={digits => setForm(f => ({ ...f, phone: digits }))}
              onCountryChange={setCountry}
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9,
            fontSize: 12.5, fontWeight: 700, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`,
            color: "#07080F", border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          <Save size={13} /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </Card>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 14 }}>Account Summary</div>
        {[
          { icon: <Mail size={11} />, label: "Email", value: profile.email },
          { icon: <Phone size={11} />, label: "Phone", value: profile.phone || "Not provided" },
          { icon: <Globe size={11} />, label: "Country", value: profile.country || "—" },
          { icon: <Calendar size={11} />, label: "Member Since", value: fmtD(profile.date_joined) },
        ].map(row => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {row.icon} {row.label}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{row.value}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
