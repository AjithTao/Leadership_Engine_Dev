'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useSettings } from '../contexts/SettingsContext'

// ---------------------------------------------------------------------------
// WelcomePopup — a subtle, enterprise-grade welcome toast.
// Slides in once on entry, auto-dismisses, and disappears the moment the user
// starts typing. No looping/bouncing animations.
// ---------------------------------------------------------------------------

interface WelcomePopupProps {
  onClose: () => void
  userHasTyped?: boolean
}

/** "Abdullah, MohamedSheikh" → "MohamedSheikh"; "Jane Doe" → "Jane Doe" */
function getFirstName(fullName: string): string {
  if (!fullName) return 'there'
  if (fullName.includes(',')) {
    const after = fullName.split(',')[1]?.trim()
    if (after) return after
  }
  return fullName.trim()
}

export function WelcomePopup({ onClose, userHasTyped = false }: WelcomePopupProps) {
  const { currentTheme, isDarkMode } = useTheme()
  const { settings, isLoaded } = useSettings()
  const [isVisible, setIsVisible] = useState(false)

  const { accent, surfaceVariant, border, text, textSecondary } = currentTheme.colors
  const firstName = getFirstName(isLoaded ? settings.userProfile.name : '')

  // Show shortly after mount, then auto-hide
  useEffect(() => {
    if (userHasTyped) return

    const showTimer = setTimeout(() => setIsVisible(true), 300)
    const hideTimer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => onClose(), 350)
    }, 5000)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [onClose, userHasTyped])

  // Dismiss immediately when the user starts typing
  useEffect(() => {
    if (userHasTyped && isVisible) {
      setIsVisible(false)
      setTimeout(() => onClose(), 350)
    }
  }, [userHasTyped, isVisible, onClose])

  return (
    <AnimatePresence>
      {isVisible && !userHasTyped && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-6 right-6 z-[9999]"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="relative flex items-center gap-3 overflow-hidden"
            style={{
              padding: '13px 18px 13px 16px',
              borderRadius: 16,
              backgroundColor: surfaceVariant,
              border: `1px solid ${border}`,
              boxShadow: isDarkMode ? '0 12px 32px rgba(0,0,0,0.45)' : 'var(--shadow-large)',
              maxWidth: 340,
            }}
          >
            {/* Accent bar */}
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 14,
                bottom: 14,
                width: 3,
                borderRadius: '0 3px 3px 0',
                backgroundColor: accent,
              }}
            />
            {/* Icon tile */}
            <span
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: `${accent}24`,
                border: `1px solid ${accent}48`,
              }}
            >
              <Sparkles className="w-[19px] h-[19px]" style={{ color: accent }} />
            </span>
            {/* Text */}
            <span className="min-w-0">
              <span className="block" style={{ fontSize: 13.5, fontWeight: 600, color: text, letterSpacing: '-0.01em' }}>
                Welcome back, {firstName}
              </span>
              <span className="block" style={{ fontSize: 11.5, color: textSecondary, marginTop: 2 }}>
                Work Buddy is ready to help.
              </span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
