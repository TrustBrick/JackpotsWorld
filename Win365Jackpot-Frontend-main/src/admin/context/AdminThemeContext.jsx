import React, { createContext, useContext, useState } from "react";
import { C as BASE_C } from "../constants";
import { API, adminFetch } from "../helpers";

const STORAGE_KEY = "w365-admin-theme";

// Dark is exactly the existing admin palette, plus the text/muted/sub tokens
// it never had (colors were hardcoded literals everywhere instead) — adding
// them here doesn't change dark mode's appearance at all.
const DARK = {
  ...BASE_C,
  text: "#FFFFFF",
  sub: "rgba(255,255,255,0.6)",
  muted: "rgba(255,255,255,0.4)",
  dim: "rgba(255,255,255,0.25)",
  inputBg: "rgba(255,255,255,0.06)",
  hoverBg: "rgba(255,255,255,0.05)",
  panelBg: "rgba(6,8,14,0.97)",
};

const LIGHT = {
  bg: "#F5F3EE",
  surface: "#FFFFFF",
  surface2: "#F0EDE4",
  border: "rgba(0,0,0,0.09)",
  border2: "rgba(0,0,0,0.15)",
  gold: "#B8860B",
  green: "#15803D",
  red: "#DC2626",
  purple: "#7C3AED",
  blue: "#2563EB",
  orange: "#C2410C",
  teal: "#0F766E",
  pink: "#BE185D",
  text: "#161512",
  sub: "rgba(22,21,18,0.65)",
  muted: "rgba(22,21,18,0.45)",
  dim: "rgba(22,21,18,0.5)",
  inputBg: "rgba(0,0,0,0.035)",
  hoverBg: "rgba(0,0,0,0.04)",
  panelBg: "#FFFFFF",
};

const AdminThemeContext = createContext({ theme: "dark", toggleTheme: () => {}, C: DARK });

function getInitialTheme() {
  try {
    const cachedUser = JSON.parse(localStorage.getItem("admin_user") || "null");
    if (cachedUser?.theme_preference === "light" || cachedUser?.theme_preference === "dark") {
      return cachedUser.theme_preference;
    }
  } catch {}
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

function persistTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  try {
    const cachedUser = JSON.parse(localStorage.getItem("admin_user") || "null");
    if (cachedUser) {
      cachedUser.theme_preference = theme;
      localStorage.setItem("admin_user", JSON.stringify(cachedUser));
    }
  } catch {}
  // Only hit the backend once actually logged in — pre-login (e.g. toggling
  // from the login screen) there's no admin session to persist against, and
  // adminFetch's 401 handling force-reloads the page, which would otherwise
  // interrupt whatever the admin was doing on the login screen.
  if (localStorage.getItem("admin_token")) {
    // Fire-and-forget — the localStorage write above already makes this
    // instant/offline-safe; the backend call is just for cross-device/login persistence.
    adminFetch(`${API}/api/admin-panel/me/theme/`, {
      method: "PATCH",
      body: JSON.stringify({ theme_preference: theme }),
    }).catch(() => {});
  }
}

export function AdminThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  const toggleTheme = () => setTheme(t => {
    const next = t === "dark" ? "light" : "dark";
    persistTheme(next);
    return next;
  });

  const value = { theme, toggleTheme, C: theme === "dark" ? DARK : LIGHT };

  return (
    <AdminThemeContext.Provider value={value}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
