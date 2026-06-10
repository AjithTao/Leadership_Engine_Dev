'use client'

import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

/**
 * ThemeToggle — premium pill-shaped Sun ↔ Moon switch.
 *
 * Design decisions:
 * - Track color follows the active mode: dark-slate in dark, soft-steel in light.
 * - Thumb slides with a cubic-bezier spring feel (no library needed).
 * - Sun/Moon icons render inside the thumb and fade-swap during transition.
 * - Track background fades via the global `theme-transitioning` class.
 * - Full keyboard + ARIA support (role="switch").
 */
export function ThemeToggle() {
  const { isDarkMode, toggleDarkMode } = useTheme()

  return (
    <button
      role="switch"
      aria-checked={isDarkMode}
      aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      onClick={toggleDarkMode}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 52,
        height: 28,
        borderRadius: 99,
        cursor: 'pointer',
        border: `1px solid ${isDarkMode ? '#3D4258' : '#B0B5CA'}`,
        backgroundColor: isDarkMode ? '#252830' : '#EAECF4',
        transition: 'background-color 0.25s ease, border-color 0.25s ease',
        outline: 'none',
        flexShrink: 0,
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--border-strong)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* ── Track: Sun icon (left, visible in dark mode so user can switch to light) */}
      <span
        style={{
          position: 'absolute',
          left: 7,
          display: 'flex',
          alignItems: 'center',
          color: isDarkMode ? '#545B78' : '#B07A24',
          opacity: isDarkMode ? 1 : 0,
          transform: isDarkMode ? 'scale(1)' : 'scale(0.7)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: 'none',
        }}
      >
        <Sun size={11} strokeWidth={2.2} />
      </span>

      {/* ── Track: Moon icon (right, visible in light mode so user can switch to dark) */}
      <span
        style={{
          position: 'absolute',
          right: 7,
          display: 'flex',
          alignItems: 'center',
          color: isDarkMode ? 'transparent' : '#7B84A6',
          opacity: isDarkMode ? 0 : 1,
          transform: isDarkMode ? 'scale(0.7)' : 'scale(1)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: 'none',
        }}
      >
        <Moon size={11} strokeWidth={2.2} />
      </span>

      {/* ── Thumb ── */}
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: isDarkMode ? '#C8CADC' : '#FFFFFF',
          boxShadow: isDarkMode
            ? '0 1px 4px rgba(0,0,0,0.5)'
            : '0 1px 4px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isDarkMode ? 'translateX(24px)' : 'translateX(0px)',
          transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), background-color 0.25s ease, box-shadow 0.25s ease',
          flexShrink: 0,
        }}
      >
        {/* Thumb icon — fades between Sun and Moon */}
        <span
          style={{
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            color: '#D4A847',
            opacity: isDarkMode ? 0 : 1,
            transform: isDarkMode ? 'rotate(-30deg) scale(0.6)' : 'rotate(0deg) scale(1)',
            transition: 'opacity 0.2s ease, transform 0.25s ease',
          }}
        >
          <Sun size={11} strokeWidth={2.5} />
        </span>
        <span
          style={{
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            color: '#353A52',
            opacity: isDarkMode ? 1 : 0,
            transform: isDarkMode ? 'rotate(0deg) scale(1)' : 'rotate(30deg) scale(0.6)',
            transition: 'opacity 0.2s ease, transform 0.25s ease',
          }}
        >
          <Moon size={11} strokeWidth={2.5} />
        </span>
      </span>
    </button>
  )
}

/**
 * ThemeSelector — labelled version of the toggle with Sun / Moon flanking labels.
 * Drop-in replacement wherever the old ThemeSelector was used.
 */
export function ThemeSelector() {
  const { isDarkMode, toggleDarkMode } = useTheme()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Sun
        size={14}
        style={{
          color: isDarkMode ? 'var(--text-muted)' : 'var(--accent-cool)',
          transition: 'color 0.2s ease',
        }}
      />
      <ThemeToggle />
      <Moon
        size={14}
        style={{
          color: isDarkMode ? 'var(--blue)' : 'var(--text-muted)',
          transition: 'color 0.2s ease',
        }}
      />
    </div>
  )
}
