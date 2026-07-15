import React from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Hotel, UtensilsCrossed, Wine, CheckCircle2, XCircle, MessageCircle,
  Layers, Ticket, Dices, Trophy, PenLine, Gem, Crown, ShieldCheck,
} from "lucide-react";
import { C } from "../../constants";
import { Card } from "../../components/SharedUI";
import { useAutoFetch } from "../../../../hooks/useAutoFetch";
import { fetchTourPackages, fetchLandingSettings } from "../../../../services/landingService";

const FALLBACK_PACKAGES = [
  { name: "VIP", price: "$5,000", icon: <Layers size={26} color="#9E9E9E" />, color: "#9E9E9E", badge: null,
    duration: "3 Nights", flight: "Economy", hotel: "Standard 3-Star (3N)",
    food: "Casino", liquor: "Over the Gaming Table (Local)",
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: false, shoppingVoucher: false, visa: false },
  { name: "Classic", price: "$10,000", icon: <Ticket size={26} color="#78909C" />, color: "#78909C", badge: null,
    duration: "3 Nights", flight: "Economy", hotel: "Standard 4-Star (3N)",
    food: "Casino", liquor: "Over the Gaming Table (Local Premium)",
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: true, shoppingVoucher: false, visa: true },
  { name: "Premium", price: "$15,000", icon: <Dices size={26} color="#D4AF37" />, color: "#D4AF37", badge: "Popular",
    duration: "3 Nights", flight: "Economy", hotel: "Standard 5-Star (3N)",
    food: "Casino", liquor: "Over the Gaming Table (Premium)",
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: true, shoppingVoucher: false, visa: true },
  { name: "Prestige", price: "$20,000", icon: <Trophy size={26} color="#F5A623" />, color: "#F5A623", badge: null,
    duration: "3 Nights", flight: "Economy", hotel: "Executive 5-Star (3N)",
    food: "Casino", liquor: "Over the Gaming Table (Imported Premium)",
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: true, shoppingVoucher: false, visa: true },
  { name: "Signature", price: "$25,000", icon: <PenLine size={26} color="#26C6DA" />, color: "#26C6DA", badge: null,
    duration: "3 Nights", flight: "Economy", hotel: "Premium 5-Star (3N)",
    food: "Casino", liquor: "Over the Gaming Table (Imported Premium)",
    airportVIP: true, jackpotRewards: true, vipTransport: true,
    spa: true, shoppingVoucher: true, visa: true },
  { name: "Elite", price: "$50,000", icon: <Gem size={26} color="#B9F2FF" />, color: "#B9F2FF", badge: "Best Value",
    duration: "3 Nights", flight: "Business", hotel: "Suite 5-Star (3N)",
    food: "Casino/Hotel", liquor: "Imported Premium",
    airportVIP: true, jackpotRewards: true, vipTransport: true, vipTransportNote: "*",
    spa: true, spaNote: "*", shoppingVoucher: true, shoppingNote: "*", visa: true },
  { name: "Royal", price: "$100,000", icon: <Crown size={26} color="#FFD700" />, color: "#FFD700", badge: null,
    duration: "4 Nights", flight: "Business", hotel: "Executive Suite 5-Star (4N)",
    food: "Casino/Hotel", liquor: "Imported Premium",
    airportVIP: true, jackpotRewards: true, vipTransport: true, vipTransportNote: "**",
    spa: true, spaNote: "**", shoppingVoucher: true, shoppingNote: "**", visa: true },
  { name: "Sovereign", price: "$250,000+", icon: <ShieldCheck size={26} color="#C9A84C" />, color: "#C9A84C", badge: "Invite Only",
    duration: "7 Nights", flight: "Business", hotel: "Presidential Suite (7N)",
    food: "Casino/Hotel", liquor: "Imported Premium",
    airportVIP: true, jackpotRewards: true, vipTransport: true, vipTransportNote: "**",
    spa: true, spaNote: "***", shoppingVoucher: true, shoppingNote: "***", visa: true },
];

const DEFAULT_WHATSAPP_NUMBER = "917795281999";

function mapTourPackage(p) {
  if (p.airportVIP !== undefined) return p; // already fallback shape
  return {
    name: p.name, price: p.price, icon: p.icon, color: p.color, badge: p.badge || null,
    duration: p.duration, flight: p.flight, hotel: p.hotel, food: p.food, liquor: p.liquor,
    airportVIP: p.airport_vip, jackpotRewards: p.jackpot_rewards, vipTransport: p.vip_transport,
    spa: p.spa, shoppingVoucher: p.shopping_voucher, visa: p.visa,
  };
}

function purchaseLink(pkg, whatsappNumber) {
  const msg = encodeURIComponent(
    `Hi! I'm interested in purchasing the *${pkg.name}* Casino Tour Package (${pkg.price}). Please share more details.`
  );
  return `https://wa.me/${whatsappNumber}?text=${msg}`;
}

export default function PackagesTab() {
  const { t } = useTranslation();
  const { data: packagesData } = useAutoFetch(fetchTourPackages, {}, { intervalMs: 60_000 });
  const { data: settings } = useAutoFetch(fetchLandingSettings, {}, { intervalMs: 60_000 });
  const PACKAGES = (Array.isArray(packagesData) && packagesData.length > 0 ? packagesData : FALLBACK_PACKAGES).map(mapTourPackage);
  const whatsappNumber = settings?.whatsapp_number || DEFAULT_WHATSAPP_NUMBER;
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
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: s.val ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.42)" }}>
                      {s.val ? <CheckCircle2 size={12} style={{ color: C.green }} /> : <XCircle size={12} />}
                      {s.label}
                    </div>
                  ))}
                </div>

                <a href={purchaseLink(pkg, whatsappNumber)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
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
