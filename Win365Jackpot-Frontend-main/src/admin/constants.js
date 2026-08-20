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

// ─── Sidebar navigation — grouped, collapsible sections ───────────────────────
// Grouping/labels only — every `id` below is unchanged from the old flat
// ADMIN_TABS list, so every existing route/tab-key/API call it drives is
// untouched. Items commented out here were already disabled before this
// reorg (dead config, kept for the same "safe to remove" notes as before) —
// not reactivated by this change.
export const ADMIN_NAV_GROUPS = [
  {
    group: "Overview",
    items: [
      { id:"overview", label:"Overview", icon:"BarChart3" },
    ],
  },
  {
    group: "User Management",
    items: [
      { id:"users", label:"Users", icon:"Users" },
      { id:"kyc",   label:"KYC Management", icon:"Shield" },
    ],
  },
  {
    group: "Financial Operations",
    items: [
      // { id:"wallet", label:"Wallet Manager", icon:"Wallet" },
      // WALLET-REQUESTS: 2 new tabs (local preview feature) — safe to remove
      // these lines along with DepositRequestsTab.jsx / WithdrawalRequestsTab.jsx
      // and their cases in AdminPanel.jsx to remove the feature.
      { id:"deposit-requests",    label:"Deposit Requests",    icon:"ArrowDownCircle" },
      { id:"withdrawal-requests", label:"Withdrawal Requests", icon:"ArrowUpCircle"   },
      { id:"deposits",     label:"Offline Transactions",  icon:"Building2" },
      { id:"transactions", label:"Transaction History",   icon:"FileText"  },
    ],
  },
  {
    group: "Rewards & Engagement",
    items: [
      // { id:"vip", label:"VIP / XP", icon:"Crown" },
      { id:"rewards", label:"Wheels & Rewards", icon:"Gift" },
      // GIFTS-REWARDS: new tab (local preview feature) — safe to remove this
      // line along with GiftsRewardsTab.jsx and its case in AdminPanel.jsx to
      // remove the feature.
      { id:"gifts-rewards", label:"Gifts & Rewards", icon:"Sparkles" },
    ],
  },
  {
    group: "Affiliate Management",
    items: [
      { id:"affiliates", label:"Affiliates", icon:"Handshake" },
      // Commission Engine (Deposit / Losing / Rolling) — safe to remove this
      // line along with AffiliateCommissionsTab.jsx and its case in
      // AdminPanel.jsx to remove the feature.
      { id:"affiliate-commissions", label:"Affiliate Commissions", icon:"Percent" },
      // Country + Casino + Tier commission rules — the layer above the
      // per-affiliate plans in the tab directly above. Dashboard, rules
      // (with tier/condition editors) and the ledger live behind one tab's
      // view toggle, matching how Manage Poker / Teen Patti are organised.
      { id:"commission-rules", label:"Commission Rules", icon:"Layers" },
      // AFFILIATE-WITHDRAWALS: new tab (local preview feature) — safe to
      // remove this line along with AffiliateWithdrawalsTab.jsx and its case
      // in AdminPanel.jsx to remove the feature.
      { id:"affiliate-withdrawals", label:"Affiliate Withdrawals", icon:"Wallet" },
    ],
  },
  {
    group: "Content Management",
    items: [
      { id:"events",     label:"Manage Events",     icon:"CalendarDays"   },
      { id:"poker",      label:"Manage Poker",       icon:"Spade"         },
      // Teen Patti: events + registrations, managed through one tab with an
      // in-tab view toggle — same shape as Manage Poker above.
      { id:"teen-patti", label:"Teen Patti",         icon:"Club"          },
      { id:"promotions", label:"Manage Promotions",  icon:"Gift"          },
      { id:"locations",  label:"Manage Locations",   icon:"MapPin"        },
      { id:"landing",    label:"Landing Page",       icon:"LayoutTemplate"},
    ],
  },
  {
    group: "Support & Communication",
    items: [
      // MULTILINGUAL-CHAT: 2 new tabs (local preview feature)
      { id:"support-tickets",  label:"Support Tickets",  icon:"LifeBuoy"  },
      { id:"support-settings", label:"Support Settings", icon:"Languages" },
      // LIVE-CHAT: real-time human-agent chat (distinct from the async
      // ticket tabs above) — safe to remove this line + LiveSupportTab.jsx +
      // its case in AdminPanel.jsx to remove the feature.
      { id:"live-support", label:"Live Support", icon:"MessageCircle" },
      { id:"notifications", label:"Notifications", icon:"Bell" },
    ],
  },
  {
    // SYSTEM: the platform's own telemetry. The five analytics views used to
    // be five sidebar entries; they are now tabs inside System Logs
    // (tabs/SystemLogsTab.jsx), because they are five readings of one subject
    // rather than five destinations. The tab components themselves are
    // untouched and still live in tabs/analytics/.
    group: "System",
    items: [
      { id:"system-logs", label:"System Logs", icon:"LineChart" },
      // { id:"staff", label:"Staff", icon:"UserCog" },
    ],
  },
  {
    // Deliberately its own group, and deliberately not merged into System
    // Logs above: Activity Logs is the who-did-what audit trail (User Logs /
    // Admin Logs) and answers questions about people, where System Logs
    // answers questions about the system.
    group: "Activity / Logs",
    items: [
      { id:"logs", label:"Activity Logs", icon:"Activity" },
    ],
  },
];

// Flat list derived from the groups above — kept as ADMIN_TABS so every
// existing lookup (header title, icon resolution, etc.) keeps working
// unchanged; the groups above are additive, not a replacement data source.
export const ADMIN_TABS = ADMIN_NAV_GROUPS.flatMap(g => g.items);
