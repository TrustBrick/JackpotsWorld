// ── Root ──────────────────────────────────────────────────────────────────────
export { default } from "./Dashboard";

// ── Constants & Helpers ───────────────────────────────────────────────────────
export * from "./constants";
export * from "./helpers";

// ── Shared UI components ──────────────────────────────────────────────────────
export * from "./components/SharedUI";
export { default as Sidebar } from "./components/Sidebar";

// ── Tab pages ─────────────────────────────────────────────────────────────────
export { default as OverviewTab }      from "./tabs/Validations/OverviewTab";
export { default as WalletTab }        from "./tabs/WalletTab";
export { default as TravelTab }        from "./tabs/Validations/TravelTab";
export { default as GiftsTab }         from "./tabs/Validations/GiftsTab";
export { default as FavouritesTab }    from "./tabs/Validations/FavouritesTab";
export { default as BonusTab }         from "./tabs/Validations/BonusTab";
export { default as RewardsTab }       from "./tabs/Validations/RewardsTab";
export { default as NotificationsTab } from "./tabs/Validations/NotificationsTab";
export { default as ReferralTab }      from "./tabs/Validations/ReferralTab";
export { default as ProfileTab }       from "./tabs/Validations/ProfileTab";