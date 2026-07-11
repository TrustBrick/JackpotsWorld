import React from "react";
import { useTranslation } from "react-i18next";
import { Plane, Hotel, UtensilsCrossed, Wine, CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import { C } from "../../constants";
import { Card } from "../../components/SharedUI";
import { PACKAGES, WHATSAPP_NUMBER } from "../../../../data/packagesData";

function purchaseLink(pkg) {
  const msg = encodeURIComponent(
    `Hi! I'm interested in purchasing the *${pkg.name}* Casino Tour Package (${pkg.price}). Please share more details.`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

export default function PackagesTab() {
  const { t } = useTranslation();
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, color: "white", fontSize: 15, marginBottom: 4 }}>{t("packages.casinoTourPackages")}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          {t("packages.packagesDesc")}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {PACKAGES.map((pkg) => {
          const services = [
            { label: t("packages.airportVip"), val: pkg.airportVIP },
            { label: t("packages.jackpotRewards"), val: pkg.jackpotRewards },
            { label: t("packages.vipTransport"), val: pkg.vipTransport },
            { label: t("packages.spa"), val: pkg.spa },
            { label: t("packages.shoppingVoucher"), val: pkg.shoppingVoucher },
            { label: t("packages.visa"), val: pkg.visa },
          ];
          return (
            <Card key={pkg.name} style={{ position: "relative", border: `1px solid ${pkg.color}30`, padding: 0, overflow: "hidden" }}>
              {pkg.badge && (
                <div style={{
                  position: "absolute", top: 12, right: 12, background: `${pkg.color}22`,
                  border: `1px solid ${pkg.color}60`, borderRadius: 20, padding: "3px 10px",
                  fontSize: 10, fontWeight: 800, color: pkg.color, letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  {pkg.badge}
                </div>
              )}

              <div style={{ padding: "18px 18px 12px", background: `linear-gradient(135deg, ${pkg.color}10 0%, transparent 70%)`, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 26 }}>{pkg.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: pkg.color }}>{pkg.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{pkg.duration} · {t("packages.allDestinations")}</div>
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.gold }}>{pkg.price}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{t("packages.perPerson")}</div>
              </div>

              <div style={{ padding: "14px 18px" }}>
                {[
                  { Icon: Plane, label: t("packages.flight", { value: pkg.flight }) },
                  { Icon: Hotel, label: t("packages.hotel", { value: pkg.hotel }) },
                  { Icon: UtensilsCrossed, label: t("packages.food", { value: pkg.food }) },
                  { Icon: Wine, label: t("packages.liquor", { value: pkg.liquor }) },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                    <row.Icon size={13} style={{ color: pkg.color, flexShrink: 0 }} />
                    {row.label}
                  </div>
                ))}

                <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                  {services.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: s.val ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)" }}>
                      {s.val ? <CheckCircle2 size={12} style={{ color: C.green }} /> : <XCircle size={12} />}
                      {s.label}
                    </div>
                  ))}
                </div>

                <a href={purchaseLink(pkg)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <button style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "11px 0", borderRadius: 10, border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg,#25D366,#128C7E)", color: "white",
                    fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>
                    <MessageCircle size={14} /> {t("packages.purchase", { name: pkg.name })}
                  </button>
                </a>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
