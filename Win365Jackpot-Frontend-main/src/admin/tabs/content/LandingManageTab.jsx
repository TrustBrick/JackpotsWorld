/**
 * LandingManageTab.jsx — ORCHESTRATOR
 *
 * One sidebar entry ("Landing Page") fanning out into the 14 sub-sections
 * that make up the public landing page's admin-managed content. Mirrors the
 * nested pill-tab pattern already used by
 * src/admin/tabs/offline_deposits/OfflineDepositTab.jsx.
 */
import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Settings, BarChart3, Sparkles, ShieldCheck, Gift, ListOrdered,
  Crown, ListChecks, Quote, MapPin, Images, GalleryHorizontal, Plane, Star,
  Clapperboard, MessageSquare,
} from "lucide-react";
import { useAdminTheme } from "../../context/AdminThemeContext";

import LandingSiteSettingsTab from "./LandingSiteSettingsTab";
import HeroStatsManageTab from "./HeroStatsManageTab";
import WhyChooseUsManageTab from "./WhyChooseUsManageTab";
import TrustBadgesManageTab from "./TrustBadgesManageTab";
import EnquiryMessagesManageTab from "./EnquiryMessagesManageTab";
import GiftItemsManageTab from "./GiftItemsManageTab";
import GiftStepsManageTab from "./GiftStepsManageTab";
import VipTiersManageTab from "./VipTiersManageTab";
import VipTierBenefitsManageTab from "./VipTierBenefitsManageTab";
import TestimonialsManageTab from "./TestimonialsManageTab";
import PremiumPartnersManageTab from "./PremiumPartnersManageTab";
import DestinationsManageTab from "./DestinationsManageTab";
import DestinationMediaManageTab from "./DestinationMediaManageTab";
import FeaturedDestinationShowcaseManageTab from "./FeaturedDestinationShowcaseManageTab";
import VipServiceImagesManageTab from "./VipServiceImagesManageTab";
import TourPackagesManageTab from "./TourPackagesManageTab";

const SUB_TABS = [
  { id: "settings",   label: "Site Settings",    Icon: Settings,          Comp: LandingSiteSettingsTab },
  { id: "stats",      label: "Hero Stats",        Icon: BarChart3,         Comp: HeroStatsManageTab },
  { id: "features",   label: "Why Choose Us",     Icon: Sparkles,          Comp: WhyChooseUsManageTab },
  { id: "trust",      label: "Trust Badges",      Icon: ShieldCheck,       Comp: TrustBadgesManageTab },
  { id: "gifts",      label: "Gifts & Prizes",    Icon: Gift,              Comp: GiftItemsManageTab },
  { id: "giftsteps",  label: "Gift Steps",        Icon: ListOrdered,       Comp: GiftStepsManageTab },
  { id: "viptiers",   label: "VIP Tiers",         Icon: Crown,             Comp: VipTiersManageTab },
  { id: "vipbenefits",label: "VIP Benefits",      Icon: ListChecks,        Comp: VipTierBenefitsManageTab },
  { id: "testimonials",label: "Testimonials",     Icon: Quote,             Comp: TestimonialsManageTab },
  { id: "partners",   label: "Premium Partners",  Icon: Star,              Comp: PremiumPartnersManageTab },
  { id: "destinations",label: "Destinations",     Icon: MapPin,            Comp: DestinationsManageTab },
  { id: "destmedia",  label: "Destination Media", Icon: Images,            Comp: DestinationMediaManageTab },
  // Separate from "Destination Media" above on purpose: that is the
  // per-destination gallery, this is the promotional landing-page block.
  { id: "destshowcase", label: "Featured Showcase", Icon: Clapperboard,    Comp: FeaturedDestinationShowcaseManageTab },
  { id: "vipgallery", label: "VIP Gallery",       Icon: GalleryHorizontal, Comp: VipServiceImagesManageTab },
  { id: "packages",   label: "Tour Packages",     Icon: Plane,             Comp: TourPackagesManageTab },
  // The prefilled WhatsApp text behind each enquiry button. Lives here
  // because these buttons are landing-page content, and this is where an
  // admin already comes to edit landing-page content.
  { id: "enquiries",  label: "Enquiry Messages",  Icon: MessageSquare,     Comp: EnquiryMessagesManageTab },
];

export default function LandingManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [tab, setTab] = useState("settings");
  const active = SUB_TABS.find(t => t.id === tab);
  const ActiveComp = active.Comp;

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{
        display: "flex", gap: 6, marginBottom: 20, padding: 4,
        borderRadius: 12, background: C.hoverBg, border: `1px solid ${C.border}`,
        flexWrap: "wrap",
      }}>
        {SUB_TABS.map(({ id, label, Icon }) => {
          const isActive = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 14px", borderRadius: 9, fontSize: 12,
              fontWeight: isActive ? 700 : 500, cursor: "pointer",
              transition: "all 0.18s", border: "none",
              background: isActive ? `${C.gold}18` : "transparent",
              outline: isActive ? `1px solid ${C.gold}40` : "none",
              color: isActive ? C.gold : C.muted,
              whiteSpace: "nowrap",
            }}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <ActiveComp onToast={onToast} />
      </motion.div>
    </div>
  );
}
