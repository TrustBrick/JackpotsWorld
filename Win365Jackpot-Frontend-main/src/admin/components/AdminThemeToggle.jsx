import React from "react";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useAdminTheme } from "../context/AdminThemeContext";

export default function AdminThemeToggle({ size = 34 }) {
  const { theme, toggleTheme, C } = useAdminTheme();
  const isDark = theme === "dark";

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      style={{
        width: size, height: size, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%",
        background: `${C.gold}18`,
        border: `1.5px solid ${C.gold}50`,
        color: C.gold,
        cursor: "pointer",
        touchAction: "manipulation",
      }}
    >
      {isDark ? <Sun size={15} strokeWidth={2.5} /> : <Moon size={15} strokeWidth={2.5} />}
    </motion.button>
  );
}
