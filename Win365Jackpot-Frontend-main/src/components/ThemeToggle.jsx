import React from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle({ size = 34 }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: size, height: size,
        background: 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(212,175,55,0.06))',
        border: '1.5px solid rgba(212,175,55,0.5)',
        color: '#D4AF37',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(212,175,55,0.2)',
        transition: 'background 0.2s, box-shadow 0.2s',
        touchAction: 'manipulation',
      }}
    >
      {isDark ? <Sun size={16} strokeWidth={2.5} /> : <Moon size={16} strokeWidth={2.5} />}
    </motion.button>
  )
}
