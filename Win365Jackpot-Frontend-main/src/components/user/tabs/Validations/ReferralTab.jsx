import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Users, Wallet, Gift, Copy, Check } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmt, fmtN, fmtD } from "../../helpers";
import { Card, Btn, Spinner } from "../../components/SharedUI";

export default function ReferralTab({ profile }) {
  const { t } = useTranslation();
  const [copied, setCopied]         = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [referrals, setReferrals]   = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    authFetch(`${API}/api/user/referral/`)
      .then(r => r.json())
      .then(d => { setReferrals(d.referrals || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const copy = (text, which) => {
    navigator.clipboard.writeText(text);
    if (which === "code") { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    else                  { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
  };

  const referralLink = `${window.location.origin}?ref=${profile?.referral_code}`;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[
          { label: t("referral.totalReferrals"),     value: fmtN(profile?.referral_count || 0),  icon: Users,  color: C.blue  },
          { label: t("referral.referralEarnings"),   value: fmt(profile?.referral_earnings),      icon: Wallet, color: C.green },
          { label: t("referral.rewardPerReferral"), value: fmt(50),                              icon: Gift,   color: C.gold  },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <s.icon size={14} style={{ color: s.color }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Benefits info */}
      <Card style={{ marginBottom: 16, background: `${C.teal}06`, border: `1px solid ${C.teal}20` }}>
        <div style={{ fontWeight: 700, color: "white", fontSize: 13, marginBottom: 12 }}>{t("referral.referralBenefits")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
          {[
            { label: t("referral.youEarnPerReferral"),  value: "$50 bonus credit"      },
            { label: t("referral.friendGetsOnSignup"),  value: "$25 welcome bonus"     },
            { label: t("referral.bonusType"),             value: "Non-Cash (NC) wallet"  },
            { label: t("referral.validity"),               value: "90 days from join"     },
          ].map(b => (
            <div key={b.label} style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.025)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>{b.label}</div>
              <div style={{ fontWeight: 700, color: C.teal }}>{b.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Code + share link */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: "white", fontSize: 13, marginBottom: 14 }}>{t("referral.yourReferralCode")}</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "11px 14px", borderRadius: 10, background: `${C.gold}10`, border: `1px solid ${C.gold}32`, fontFamily: "monospace", fontWeight: 900, fontSize: 20, color: C.gold, letterSpacing: "0.25em" }}>
            {profile?.referral_code || "—"}
          </div>
          <Btn onClick={() => copy(profile?.referral_code, "code")} outline color={copied ? C.green : C.gold}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t("common.copied") : t("common.copy")}
          </Btn>
        </div>

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>{t("referral.shareLink")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, fontSize: 11, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {referralLink}
          </div>
          <Btn small outline onClick={() => copy(referralLink, "link")} color={copiedLink ? C.green : "rgba(255,255,255,0.35)"}>
            {copiedLink ? <Check size={11} /> : <Copy size={11} />}
          </Btn>
        </div>
      </Card>

      {/* Referrals table */}
      {loading ? (
        <Spinner />
      ) : referrals.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: "white", fontSize: 12 }}>
            {t("referral.yourReferrals", { count: referrals.length })}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              {referrals.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, color: C.gold }}>
                      {(r.name || r.email || "?")[0].toUpperCase()}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontWeight: 600, color: "white", fontSize: 12 }}>{r.name || r.email?.split("@")[0]}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{t("referral.joined", { date: fmtD(r.date_joined) })}</div>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 900, color: C.green, fontFamily: "monospace", fontSize: 12 }}>
                    +{fmt(50)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}