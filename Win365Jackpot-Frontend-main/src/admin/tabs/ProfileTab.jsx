// ADMIN-PROFILE: the signed-in admin's own account details, plus a
// self-service password change proven by an OTP sent to the admin's
// registered email. The account itself (name, email, role, first password) is
// created by the super admin, so the details here are read-only.
//
// Backend: authapp/views/admin_profile_views.py
import React, { useEffect, useState } from "react";
import { Mail, KeyRound, ShieldCheck, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Card, Btn, Input, Spinner, SectionTitle, UidBadge } from "../components/SharedUI";
import { API, adminFetch, fmtDT, fmtD } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";
import { endSession } from "../../services/sessionManager";

// Mirrors authapp/serializers/user_serializers.validate_strong_password so the
// admin sees what's missing before submitting; the server still enforces it.
const PW_RULES = [
  { label: "8+ characters",     test: v => v.length >= 8 },
  { label: "Uppercase letter",  test: v => /[A-Z]/.test(v) },
  { label: "Lowercase letter",  test: v => /[a-z]/.test(v) },
  { label: "Number",            test: v => /\d/.test(v) },
  { label: "Special character", test: v => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(v) },
];

function DetailRow({ label, children }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 13, color: C.text, fontWeight: 600, textAlign: "right", wordBreak: "break-word" }}>{children || "—"}</span>
    </div>
  );
}

function StepDot({ n, active, done }) {
  const { C } = useAdminTheme();
  return (
    <span style={{
      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 800,
      background: done ? C.green : active ? C.gold : C.surface,
      color: done || active ? "#07080F" : C.muted,
      border: `1px solid ${done ? C.green : active ? C.gold : C.border}`,
    }}>{done ? "✓" : n}</span>
  );
}

function ChangePasswordCard({ registeredEmail, onToast }) {
  const { C } = useAdminTheme();
  const [step, setStep]         = useState(1);   // 1 = verify email, 2 = code + new password
  const [email, setEmail]       = useState("");
  const [otp, setOtp]           = useState("");
  const [pw, setPw]             = useState("");
  const [pw2, setPw2]           = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");
  const [info, setInfo]         = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    setError(""); setInfo("");
    if (!email.trim()) { setError("Enter your registered email address."); return; }
    setBusy(true);
    try {
      const res = await adminFetch(`${API}/api/admin-panel/me/change-password/request-otp/`, {
        method: "POST", body: JSON.stringify({ email: email.trim() }),
      });
      if (!res) return;
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setInfo(json.message || "Verification code sent.");
        setStep(2);
        setCooldown(60);
      } else if (res.status === 429) {
        setError("Too many requests. Please wait a minute and try again.");
      } else {
        setError(json.error || "Could not send the verification code.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setBusy(false); }
  };

  const pwOk = PW_RULES.every(r => r.test(pw));
  const canSubmit = /^\d{6}$/.test(otp) && pwOk && pw === pw2 && !busy;

  const submit = async () => {
    setError("");
    if (pw !== pw2) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await adminFetch(`${API}/api/admin-panel/me/change-password/`, {
        method: "POST", body: JSON.stringify({ otp, new_password: pw }),
      });
      if (!res) return;
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        onToast?.("Password changed. Please sign in again.", true);
        // Every session was signed out server-side; send this one to login too.
        setTimeout(() => endSession({ roles: ["admin"], reason: "manual", redirectTo: "/admin-panel", revoke: false }), 1200);
      } else if (res.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else {
        setError(json.error || "Could not change the password.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setBusy(false); }
  };

  const reset = () => { setStep(1); setOtp(""); setPw(""); setPw2(""); setError(""); setInfo(""); };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <KeyRound size={16} style={{ color: C.gold }} />
        <SectionTitle sub="A verification code is sent to your registered email before the password can be changed.">
          Change Password
        </SectionTitle>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 12, color: C.muted }}>
        <StepDot n={1} active={step === 1} done={step > 1} /> Verify email
        <span style={{ flex: "0 0 24px", height: 1, background: C.border }} />
        <StepDot n={2} active={step === 2} /> Set new password
      </div>

      {step === 1 && (
        <>
          <Input label="Registered email" type="email" value={email} onChange={setEmail} placeholder="you@jackpotsworld.vip" />
          <div style={{ fontSize: 11, color: C.muted, marginTop: -4, marginBottom: 14 }}>
            Must match the email on your admin account. The code is sent only to that address.
          </div>
          <Btn onClick={requestCode} disabled={busy}>
            <Mail size={14} /> {busy ? "Sending…" : "Send verification code"}
          </Btn>
        </>
      )}

      {step === 2 && (
        <>
          {info && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.green, background: `${C.green}12`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
              <CheckCircle size={14} /> {info}
            </div>
          )}
          <Input label="Verification code" value={otp} onChange={v => setOtp(v.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" style={{ letterSpacing: "0.3em", fontFamily: "monospace" }} />
          <div style={{ position: "relative" }}>
            <Input label="New password" type={showPw ? "text" : "password"} value={pw} onChange={setPw} style={{ paddingRight: 42 }} />
            <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 10, top: 30, background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: -4, marginBottom: 12 }}>
            {PW_RULES.map(r => {
              const ok = r.test(pw);
              return (
                <span key={r.label} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 20, border: `1px solid ${ok ? `${C.green}50` : C.border}`, color: ok ? C.green : C.muted }}>
                  {ok ? "✓ " : ""}{r.label}
                </span>
              );
            })}
          </div>
          <Input label="Confirm new password" type={showPw ? "text" : "password"} value={pw2} onChange={setPw2} />
          {pw2 && pw !== pw2 && <div style={{ fontSize: 11, color: C.red, marginTop: -6, marginBottom: 10 }}>Passwords do not match.</div>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 4 }}>
            <Btn onClick={submit} disabled={!canSubmit}>
              <ShieldCheck size={14} /> {busy ? "Saving…" : "Change password"}
            </Btn>
            <Btn outline onClick={requestCode} disabled={busy || cooldown > 0} color={C.muted}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </Btn>
            <button type="button" onClick={reset} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
              Start over
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
            Code sent to <b style={{ color: C.text }}>{registeredEmail}</b>. After the change you'll be signed out of every session.
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: 12, color: C.red, background: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "9px 12px", marginTop: 14 }}>
          {error}
        </div>
      )}
    </Card>
  );
}

export default function ProfileTab({ onToast }) {
  const { C } = useAdminTheme();
  const [profile, setProfile] = useState(null);
  const [error, setError]     = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch(`${API}/api/admin-panel/me/profile/`);
        if (!res) return;
        if (res.ok) setProfile(await res.json());
        else setError("Could not load your profile.");
      } catch { setError("Network error. Please try again."); }
    })();
  }, []);

  if (error) return <Card><div style={{ color: C.red, fontSize: 13 }}>{error}</div></Card>;
  if (!profile) return <Spinner />;

  const initials = (profile.name || profile.email || "?").split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, alignItems: "start" }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#07080F", background: `linear-gradient(135deg, ${C.gold}, ${C.gold}AA)` }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{profile.name || "—"}</div>
            <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis" }}>{profile.email}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <UidBadge uid={profile.user_uid} />
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${C.gold}14`, color: C.gold }}>{profile.role_label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: profile.is_active ? `${C.green}14` : `${C.red}14`, color: profile.is_active ? C.green : C.red }}>
                {profile.is_active ? "Active" : "Disabled"}
              </span>
            </div>
          </div>
        </div>

        <SectionTitle sub="Set by the super admin. Contact them to change these details.">Admin Details</SectionTitle>
        <DetailRow label="Admin ID"><span style={{ fontFamily: "monospace" }}>{profile.user_uid}</span></DetailRow>
        <DetailRow label="Name">{profile.name}</DetailRow>
        <DetailRow label="Registered email">{profile.email}</DetailRow>
        <DetailRow label="Phone">{profile.phone}</DetailRow>
        <DetailRow label="Role">{profile.role_label}</DetailRow>
        <DetailRow label="Department">{profile.department}</DetailRow>
        <DetailRow label="Account created">{profile.date_joined && fmtD(profile.date_joined)}</DetailRow>
        <DetailRow label="Last login">{profile.last_login && fmtDT(profile.last_login)}</DetailRow>
        <DetailRow label="Last login IP"><span style={{ fontFamily: "monospace" }}>{profile.last_login_ip}</span></DetailRow>
        <DetailRow label="Total logins">{profile.login_count}</DetailRow>
      </Card>

      <ChangePasswordCard registeredEmail={profile.email} onToast={onToast} />
    </div>
  );
}
