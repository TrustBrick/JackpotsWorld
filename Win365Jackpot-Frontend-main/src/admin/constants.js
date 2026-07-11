// ─── Admin design tokens ───────────────────────────────────────────────────
export const C = {
  bg:      "#07080F",
  surface: "rgba(255,255,255,0.03)",
  surface2:"rgba(255,255,255,0.06)",
  border:  "rgba(255,255,255,0.07)",
  border2: "rgba(255,255,255,0.12)",
  gold:    "#D4AF37",
  green:   "#34D399",
  red:     "#F87171",
  purple:  "#A78BFA",
  blue:    "#60A5FA",
  orange:  "#FB923C",
  teal:    "#2DD4BF",
  pink:    "#F472B6",
};

export const VIP_COLOR = {
  1:"#9CA3AF",2:"#34D399",3:"#60A5FA",4:"#A78BFA",
  5:"#D4AF37",6:"#F59E0B",7:"#EF4444",8:"#EC4899",
  9:"#8B5CF6",10:"#D4AF37",
};

export const WALLET_CFG = {
  cash:           { label:"Cash",           abbr:"C",  color:"#34D399", seq:"001" },
  non_cash:       { label:"Non-Cash",       abbr:"NC", color:"#A78BFA", seq:"002" },
  otp:            { label:"OTP Credits",    abbr:"O",  color:"#2DD4BF", seq:"003" },
  rolling_points: { label:"Rolling Points", abbr:"RP", color:"#D4AF37", seq:"004" },
};

// Scenario meta — mirrors backend wallet_models.py
export const SCENARIO_META = {
  // Cash scenarios
  DAC:   { label:"Deposit at Casino",                        wallet:"cash",           dir:"credit" },
  WAC:   { label:"Withdraw at Casino",                       wallet:"cash",           dir:"debit"  },
  TAC:   { label:"Transfer to Another Casino",               wallet:"cash",           dir:"debit"  },
  LUB:   { label:"Level Up Bonus",                           wallet:"cash",           dir:"credit" },
  WBA:   { label:"Weekly Bonus Added",                       wallet:"cash",           dir:"credit" },
  MBA:   { label:"Monthly Bonus Added",                      wallet:"cash",           dir:"credit" },
  RMB:   { label:"Reimbursement",                            wallet:"cash",           dir:"credit" },
  WIN:   { label:"Winnings",                                 wallet:"cash",           dir:"credit" },
  GBE:   { label:"Gifts/Benefits Encashment",                wallet:"cash",           dir:"credit" },
  CBG:   { label:"Casino Cash Back / Gift",                  wallet:"cash",           dir:"credit" },
  // Non-Cash
  CBGNC: { label:"Casino CB/Gift – Non-Transferrable (NC)",  wallet:"non_cash",       dir:"credit" },
  LUBNC: { label:"Level Up Bonus – Transferrable (NC)",      wallet:"non_cash",       dir:"credit" },
  // OTP
  CBGOT: { label:"Casino CB/Gift – Non-Transferrable (OTP)", wallet:"otp",            dir:"credit" },
  LUBOT: { label:"Level Up Bonus – Transferrable (OTP)",     wallet:"otp",            dir:"credit" },
  // Rolling Points
  ROP:   { label:"Rolling Points – Daily Report",            wallet:"rolling_points", dir:"credit" },
};

export const VALIDATABLE = ["LUB","LUBNC","LUBOT","WBA","MBA"];

export const ADMIN_API = import.meta.env.VITE_API_URL;

export const ADMIN_TABS = [
  { id:"overview",      label:"Overview",         icon:"BarChart3"  },
  { id:"users",         label:"Users",            icon:"Users"      },
  // { id:"wallet",        label:"Wallet Manager",   icon:"Wallet"     },
  { id:"deposits",      label:"Offline Transactions", icon:"Building2"  },
  // { id:"vip",           label:"VIP / XP",         icon:"Crown"      },
  { id:"rewards",       label:"Rewards & Spin",   icon:"Gift"       },
  // { id:"notifications", label:"Notifications",    icon:"Bell"       },
  { id:"transactions",  label:"Transaction History",     icon:"FileText"   },
  { id:"kyc",           label:"KYC Management",   icon:"Shield"     },
  { id:"events",        label:"Manage Events",    icon:"CalendarDays" },
  { id:"poker",         label:"Manage Poker",      icon:"Spade" },
  { id:"promotions",    label:"Manage Promotions", icon:"Gift" },
  { id:"locations",     label:"Manage Locations",  icon:"MapPin" },
  { id:"affiliates",    label:"Affiliates",        icon:"Handshake" },
  { id:"logs",          label:"Activity Logs",    icon:"Activity"   },
  // { id:"staff",         label:"Staff",            icon:"UserCog"    },
];