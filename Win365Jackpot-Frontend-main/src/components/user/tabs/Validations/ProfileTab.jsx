import React, { useState, useRef } from "react";
import {
  User, Shield, Eye, EyeOff, Upload,
  Mail, Key, Lock, CheckCircle, Clock,
  AlertTriangle, Calendar,
} from "lucide-react";
import { C } from "../../constants";
import { authFetch, API } from "../../helpers";
import { Card, Btn, VIPBadge } from "../../components/SharedUI";

/* ─── tiny shared primitives ───────────────────────────────────────────── */
function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.09em", color: "rgba(255,255,255,0.38)", marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

function TextInput({ style, onFocus, onBlur, ...props }) {
  const base = {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 9,
    background: "rgba(255,255,255,0.055)",
    border: `1px solid ${C.border}`,
    color: "white",
    fontSize: 14, // 14px+ prevents iOS zoom-on-focus
    outline: "none",
    boxSizing: "border-box",
    transition: "border 0.15s",
    WebkitAppearance: "none",
  };
  return (
    <input
      style={{ ...base, ...style }}
      onFocus={e => { e.target.style.border = `1px solid ${C.gold}66`; onFocus?.(e); }}
      onBlur={e => { e.target.style.border = `1px solid ${C.border}`;  onBlur?.(e); }}
      {...props}
    />
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      padding: "9px 0",
      borderBottom: `1px solid ${C.border}`,
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 600, color: "white",
        fontFamily: mono ? "monospace" : "inherit",
        textAlign: "right",
        minWidth: 0,
        wordBreak: "break-word",
      }}>
        {value || "—"}
      </span>
    </div>
  );
}

function LockBanner({ daysLeft, lastUpdated }) {
  return (
    <div style={{
      padding: "11px 14px", borderRadius: 9, marginBottom: 14,
      background: "rgba(251,191,36,0.07)", border: `1px solid rgba(251,191,36,0.22)`,
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <Lock size={14} style={{ color: "#fbbf24", marginTop: 1, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 2 }}>
          Name &amp; Date of Birth locked
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          These fields can be changed once every 90 days.
          {lastUpdated && (
            <> Last changed on <b style={{ color: "white" }}>
              {new Date(lastUpdated).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </b>.</>
          )}
          {" "}Unlocks in <b style={{ color: "#fbbf24" }}>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</b>.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT — Mobile-first responsive
═══════════════════════════════════════════════════════════════════════════ */
export default function ProfileTab({ profile, onToast, onRefresh }) {
  /* ── profile form ── */
  const [form, setForm] = useState({
    name:          profile?.name          || "",
    date_of_birth: profile?.date_of_birth || "",
    country:       profile?.country       || "",
  });
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  /* ── password flow ── */
  const [pwStep,      setPwStep]      = useState(1);
  const [pwForm,      setPwForm]      = useState({ current_password: "", new_password: "" });
  const [showPw,      setShowPw]      = useState(false);
  const [otpCode,     setOtpCode]     = useState("");
  const [otpSending,  setOtpSending]  = useState(false);
  const [pwSaving,    setPwSaving]    = useState(false);

  /* ── derived lock state ── */
  const canEdit  = profile?.can_edit_profile !== false;
  const daysLeft = profile?.days_until_unlock || 0;
  const lastUpdated = profile?.profile_last_updated;

  /* ── handlers ── */
  const saveProfile = async () => {
    setSaving(true);
    const payload = {};
    if (form.name          !== (profile?.name          || "")) payload.name          = form.name;
    if (form.date_of_birth !== (profile?.date_of_birth || "")) payload.date_of_birth = form.date_of_birth;
    if (form.country       !== (profile?.country       || "")) payload.country       = form.country;

    if (!Object.keys(payload).length) {
      onToast("No changes to save", false);
      setSaving(false);
      return;
    }

    try {
      const r = await authFetch(`${API}/api/user/profile/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (r.ok) {
        onToast("Profile updated!", true);
        onRefresh();
      } else {
        const msg = j.non_field_errors?.[0] || j.detail || JSON.stringify(j);
        onToast(msg, false);
      }
    } catch {
      onToast("Something went wrong", false);
    }
    setSaving(false);
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd    = new FormData();
    fd.append("avatar", file);
    const token = localStorage.getItem("access");
    try {
      const r = await fetch(`${API}/api/user/avatar/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const j = await r.json();
      onToast(r.ok ? "Photo updated!" : (j.detail || "Upload failed"), r.ok);
      if (r.ok) onRefresh();
    } catch {
      onToast("Upload failed", false);
    }
    setUploading(false);
  };

  const sendOTP = async () => {
    if (!pwForm.current_password || !pwForm.new_password) {
      onToast("Fill in both fields", false); return;
    }
    if (pwForm.new_password === pwForm.current_password) {
      onToast("New password must differ", false); return;
    }
    setOtpSending(true);
    try {
      const r = await authFetch(`${API}/api/user/password-change-otp/`, {
        method: "POST",
        body: JSON.stringify({ current_password: pwForm.current_password }),
      });
      const j = await r.json();
      if (r.ok) { setPwStep(2); onToast("OTP sent to email", true); }
      else onToast(j.error || "Could not send OTP", false);
    } catch {
      onToast("Something went wrong", false);
    }
    setOtpSending(false);
  };

  const confirmPassword = async () => {
    if (!otpCode) { onToast("Enter the OTP", false); return; }
    setPwSaving(true);
    try {
      const r = await authFetch(`${API}/api/user/change-password/`, {
        method: "POST",
        body: JSON.stringify({ ...pwForm, otp: otpCode }),
      });
      const j = await r.json();
      onToast(r.ok ? "Password changed!" : (j.error || "Invalid OTP"), r.ok);
      if (r.ok) {
        setPwForm({ current_password: "", new_password: "" });
        setOtpCode("");
        setPwStep(1);
      }
    } catch {
      onToast("Something went wrong", false);
    }
    setPwSaving(false);
  };

  /* ── KYC color ── */
  const KYC_COLOR = {
    approved:  "#34d399",
    rejected:  "#f87171",
    submitted: "#fbbf24",
    pending:   "rgba(255,255,255,0.3)",
  };
  const kycColor = KYC_COLOR[profile?.kyc_status] || KYC_COLOR.pending;

  return (
    <>
      {/* Responsive layout: 1 column on mobile, 2 columns from 720px+ */}
      <style>{`
        .profile-tab-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          align-items: start;
          width: 100%;
          max-width: 100%;
        }
        .profile-tab-col {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }
        .profile-tab-btn-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .profile-tab-btn-row > * {
          flex: 1 1 140px;
          min-height: 44px;
        }
        @media (min-width: 720px) {
          .profile-tab-grid {
            grid-template-columns: 1fr 1fr;
            gap: 18px;
          }
        }
      `}</style>

      <div className="profile-tab-grid">

        {/* ══════════════════════════════════════════════
            LEFT — Personal Information
        ══════════════════════════════════════════════ */}
        <div className="profile-tab-col">

          {/* Avatar + identity */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <User size={14} style={{ color: C.gold }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Personal Information</span>
            </div>

            {/* Avatar row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${C.gold}, ${C.gold}70)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 900, color: "#06080E", overflow: "hidden",
                }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (profile?.name || profile?.email || "U")[0].toUpperCase()
                  }
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    position: "absolute", bottom: 0, right: 0,
                    width: 26, height: 26, borderRadius: "50%",
                    background: C.gold, border: "2px solid #06080E",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: uploading ? "not-allowed" : "pointer",
                    opacity: uploading ? 0.6 : 1,
                  }}
                  aria-label="Upload photo"
                >
                  <Upload size={12} style={{ color: "#06080E" }} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadPhoto} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "white", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profile?.name || "—"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 5 }}>
                  {uploading ? "Uploading…" : "Tap pencil to update photo"}
                </div>
                <VIPBadge level={profile?.vip_level} />
              </div>
            </div>

            {/* Locked read-only fields */}
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>Email <span style={{ color: "#f97316", marginLeft: 4 }}>LOCKED</span></FieldLabel>
              <TextInput value={profile?.email || ""} disabled style={{ opacity: 0.4, cursor: "not-allowed" }} readOnly />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Phone <span style={{ color: "#f97316", marginLeft: 4 }}>LOCKED</span></FieldLabel>
              <TextInput value={profile?.phone || ""} disabled style={{ opacity: 0.4, cursor: "not-allowed" }} readOnly />
            </div>

            {!canEdit && <LockBanner daysLeft={daysLeft} lastUpdated={lastUpdated} />}

            {/* Editable fields */}
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>
                Full Name
                {!canEdit && <Lock size={10} style={{ color: "#fbbf24", marginLeft: 5, verticalAlign: "middle" }} />}
              </FieldLabel>
              <TextInput
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Your full name"
                disabled={!canEdit}
                style={!canEdit ? { opacity: 0.45, cursor: "not-allowed" } : {}}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldLabel>
                Date of Birth
                {!canEdit && <Lock size={10} style={{ color: "#fbbf24", marginLeft: 5, verticalAlign: "middle" }} />}
              </FieldLabel>
              <TextInput
                type="date"
                value={form.date_of_birth}
                onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
                disabled={!canEdit}
                style={!canEdit ? { opacity: 0.45, cursor: "not-allowed" } : {}}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Country</FieldLabel>
              <TextInput
                value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}
                placeholder="e.g. India"
              />
            </div>

            <Btn
              onClick={saveProfile}
              disabled={saving}
              style={{ width: "100%", justifyContent: "center", minHeight: 44 }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </Btn>
          </Card>

          {/* Account summary card */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <CheckCircle size={14} style={{ color: kycColor }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Account Summary</span>
            </div>

            <InfoRow label="User ID"        value={profile?.user_uid}        mono />
            <InfoRow label="KYC Status"     value={
              <span style={{ color: kycColor, fontWeight: 700, textTransform: "capitalize" }}>
                {profile?.kyc_status || "Not submitted"}
              </span>
            } />
            <InfoRow label="Referral Code"  value={profile?.referral_code}   mono />
            <InfoRow label="Referred Users" value={profile?.referral_count ?? "0"} />
            <InfoRow label="Member Since"   value={
              profile?.date_joined
                ? new Date(profile.date_joined).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                : "—"
            } />

            {lastUpdated && (
              <div style={{
                marginTop: 12, padding: "9px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <Calendar size={12} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, minWidth: 0 }}>
                  Profile last updated:{" "}
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>
                    {new Date(lastUpdated).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                  {!canEdit && (
                    <> · Editable again in <span style={{ color: "#fbbf24" }}>{daysLeft}d</span></>
                  )}
                  {canEdit && lastUpdated && (
                    <> · <span style={{ color: "#34d399" }}>Editable now</span></>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ══════════════════════════════════════════════
            RIGHT — Security & Password
        ══════════════════════════════════════════════ */}
        <div className="profile-tab-col">
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <Shield size={14} style={{ color: C.purple || "#a78bfa" }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Security &amp; Password</span>
            </div>

            {pwStep === 1 ? (
              <>
                {/* Info banner */}
                <div style={{
                  padding: "10px 13px", borderRadius: 9, marginBottom: 18,
                  background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)",
                  display: "flex", alignItems: "flex-start", gap: 9,
                }}>
                  <Mail size={12} style={{ color: "#60a5fa", marginTop: 1, flexShrink: 0 }} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                    An OTP will be sent to your registered email to confirm the password change.
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <FieldLabel>Current Password</FieldLabel>
                  <div style={{ position: "relative" }}>
                    <TextInput
                      type={showPw ? "text" : "password"}
                      value={pwForm.current_password}
                      onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      style={{
                        position: "absolute", right: 6, top: "50%",
                        transform: "translateY(-50%)",
                        background: "none", border: "none",
                        color: "rgba(255,255,255,0.3)", cursor: "pointer",
                        padding: 8, display: "flex", alignItems: "center", justifyContent: "center",
                        minWidth: 32, minHeight: 32,
                      }}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <FieldLabel>New Password</FieldLabel>
                  <TextInput
                    type={showPw ? "text" : "password"}
                    value={pwForm.new_password}
                    onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                </div>

                {/* Password strength */}
                {pwForm.new_password.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    {(() => {
                      const len = pwForm.new_password.length;
                      const strength = len < 6 ? 0 : len < 8 ? 1 : len < 12 ? 2 : 3;
                      const labels   = ["Too short", "Weak", "Good", "Strong"];
                      const colors   = ["#f87171", "#f97316", "#fbbf24", "#34d399"];
                      return (
                        <>
                          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                            {[0,1,2,3].map(i => (
                              <div key={i} style={{
                                flex: 1, height: 3, borderRadius: 2,
                                background: i <= strength ? colors[strength] : "rgba(255,255,255,0.1)",
                                transition: "background 0.2s",
                              }} />
                            ))}
                          </div>
                          <div style={{ fontSize: 10, color: colors[strength] }}>{labels[strength]}</div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <Btn
                  onClick={sendOTP}
                  disabled={otpSending || !pwForm.current_password || !pwForm.new_password}
                  style={{ width: "100%", justifyContent: "center", gap: 7, minHeight: 44 }}
                >
                  <Mail size={13} />
                  {otpSending ? "Sending OTP…" : "Send OTP to Email"}
                </Btn>
              </>
            ) : (
              <>
                {/* OTP sent banner */}
                <div style={{
                  padding: "13px 14px", borderRadius: 10, marginBottom: 20,
                  background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)",
                  display: "flex", gap: 10,
                }}>
                  <CheckCircle size={14} style={{ color: "#34d399", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", marginBottom: 3 }}>
                      OTP Sent!
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, wordBreak: "break-word" }}>
                      Check <b style={{ color: "white" }}>{profile?.email}</b> — valid for 10 minutes.
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <FieldLabel>Enter OTP</FieldLabel>
                  <TextInput
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    style={{
                      fontFamily: "monospace",
                      fontSize: "clamp(22px, 6vw, 28px)",
                      letterSpacing: "clamp(0.2em, 1.2vw, 0.35em)",
                      textAlign: "center",
                      padding: "14px 13px",
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                    {otpCode.length}/6 digits entered
                  </div>
                </div>

                <div className="profile-tab-btn-row">
                  <Btn
                    onClick={confirmPassword}
                    disabled={pwSaving || otpCode.length < 6}
                    style={{ justifyContent: "center", gap: 7 }}
                  >
                    <Key size={13} />
                    {pwSaving ? "Changing…" : "Confirm & Change"}
                  </Btn>
                  <Btn
                    outline
                    onClick={() => { setPwStep(1); setOtpCode(""); }}
                    style={{ justifyContent: "center", flex: "0 1 100px" }}
                  >
                    Back
                  </Btn>
                </div>
              </>
            )}
          </Card>

          {/* Login security info */}
          <Card style={{ background: "rgba(255,255,255,0.015)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={13} style={{ color: "#f97316" }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Login Activity</span>
            </div>
            <InfoRow label="Last login" value={
              profile?.last_login
                ? new Date(profile.last_login).toLocaleString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })
                : "—"
            } />
            <InfoRow label="Account verified" value={
              <span style={{ color: profile?.is_verified ? "#34d399" : "#f87171" }}>
                {profile?.is_verified ? "Yes" : "No"}
              </span>
            } />
            <div style={{
              marginTop: 12, padding: "9px 12px", borderRadius: 8,
              background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)",
              fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6,
            }}>
              If you notice any suspicious activity, change your password immediately and contact support.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
