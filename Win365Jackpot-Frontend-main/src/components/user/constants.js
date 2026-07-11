// ─── Design tokens ────────────────────────────────────────────────────────────
export const C = {
  bg:       "#06080E",
  surface:  "rgba(255,255,255,0.03)",
  surface2: "rgba(255,255,255,0.055)",
  border:   "rgba(255,255,255,0.07)",
  border2:  "rgba(255,255,255,0.12)",
  gold:     "#D4AF37",
  green:    "#34D399",
  red:      "#F87171",
  purple:   "#A78BFA",
  blue:     "#60A5FA",
  orange:   "#FB923C",
  teal:     "#2DD4BF",
  pink:     "#F472B6",
};

export const VIP_COLOR = {
  1: "#9CA3AF", 2: "#34D399", 3: "#60A5FA", 4: "#A78BFA",
  5: "#D4AF37", 6: "#F59E0B", 7: "#EF4444", 8: "#EC4899",
  9: "#8B5CF6", 10: "#D4AF37",
};

export const WALLET_CFG = {
  cash: {
    label: "Cash", abbr: "C", color: "#34D399",
    icon: "DollarSign", desc: "Main spendable balance",
  },
  non_cash: {
    label: "Non-Cash", abbr: "NC", color: "#A78BFA",
    icon: "CreditCard", desc: "Bonus & promotional credits",
  },
  otp: {
    label: "OTP Credits", abbr: "O", color: "#2DD4BF",
    icon: "Zap", desc: "One-time promo credits",
  },
  rolling_points: {
    label: "Rolling Points", abbr: "RP", color: "#D4AF37",
    icon: "TrendingUp", desc: "Loyalty & reward points",
  },
};

export const TABS = [
  { id: "overview",      label: "Overview",       icon: "BarChart3"      },
  { id: "wallet",        label: "Wallet",          icon: "Wallet"         },
  { id: "travel",        label: "Travel History",  icon: "Plane"          },
  { id: "gifts",         label: "Gifts",           icon: "Gift"           },
  { id: "packages",      label: "Packages",        icon: "Package"        },
  // { id: "favourites",    label: "Favourites",      icon: "Heart"          },
  // { id: "bonus",         label: "Bonus",           icon: "Star"           },
  { id: "rewards",       label: "Spin & Rewards",  icon: "Trophy"         },
  { id: "notifications", label: "Notifications",   icon: "Bell"           },
  { id: "referral",      label: "Referral",        icon: "Users"          },
  { id: "profile",       label: "Profile",         icon: "User"           },
  { id: "support",              label: "Live Support",        icon: "LifeBuoy"    },
  { id: "responsible_gambling", label: "Responsible Gambling", icon: "ShieldCheck" },
];

export const TX_COLORS = {
  deposit:       "#34D399",
  withdrawal:    "#F87171",
  bonus:         "#A78BFA",
  level_up_bonus:"#D4AF37",
  weekly_bonus:  "#60A5FA",
  monthly_bonus: "#FB923C",
  referral:      "#2DD4BF",
  spin_win:      "#F472B6",
  claim:         "#34D399",
};