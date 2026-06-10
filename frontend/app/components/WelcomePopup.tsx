'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../contexts/ThemeContext'
import { useSettings } from '../contexts/SettingsContext'

// ---------------------------------------------------------------------------
// Animation variants — module-level so they are never recreated on re-render
// ---------------------------------------------------------------------------

const pulseVariants = {
  idle: {
    scale: [1, 1.05, 1],
    transition: { duration: 2.0, repeat: Infinity, ease: 'easeInOut' as const }
  }
}

const waveVariants = {
  idle: {
    rotate: [0, -40, -60, -40, 0],
    transition: { duration: 1.2, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' as const, delay: 0.3 }
  }
}

const bubbleVariants = {
  hidden:  { scale: 0, opacity: 0, y: 10 },
  visible: {
    scale: 1, opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 18, delay: 0.9 }
  },
  exit: { scale: 0, opacity: 0, transition: { duration: 0.15 } }
}

// ---------------------------------------------------------------------------
// SimpleRobot — minimalist elegant SVG robot character
// ---------------------------------------------------------------------------

interface SimpleRobotProps {
  primaryColor: string
  accentColor:  string
  bodyFill:     string
  isDarkMode:   boolean
  isBlinking:   boolean
  userName?:    string
}

function SimpleRobot({ primaryColor, accentColor, bodyFill, isDarkMode, isBlinking, userName }: SimpleRobotProps) {
  const uid = useId().replace(/:/g, '')
  const glowId = `glow-${uid}`

  return (
    <div style={{ position: 'relative', width: 100, height: 120 }}>
      {/* ── Speech bubble ─────────────────────────────────────────────────── */}
      <motion.div
        variants={bubbleVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          position:        'absolute',
          top:             -44,
          left:            -96,
          backgroundColor: bodyFill,
          border:          `1.5px solid ${primaryColor}`,
          borderRadius:    12,
          padding:         '5px 14px',
          fontSize:        13,
          fontWeight:      700,
          color:           isDarkMode ? primaryColor : '#1F2937',
          whiteSpace:      'nowrap',
          boxShadow:       isDarkMode
            ? '0 4px 18px rgba(0,0,0,0.55)'
            : '0 4px 14px rgba(30,25,15,0.13)',
          pointerEvents:   'none',
          zIndex:          10,
          letterSpacing:   '0.01em',
        }}
      >
        Hi {userName ? userName.split(',')[1]?.trim() : 'there'}! 👋
        <div style={{
          position:    'absolute',
          bottom:      -9,
          right:       20,
          width:       0,
          height:      0,
          borderLeft:  '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop:   `9px solid ${primaryColor}`,
        }} />
        <div style={{
          position:    'absolute',
          bottom:      -7,
          right:       21,
          width:       0,
          height:      0,
          borderLeft:  '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop:   `8px solid ${bodyFill}`,
        }} />
      </motion.div>

      {/* ── Minimalist Robot SVG ─────────────────────────────────────────── */}
      <motion.svg
        viewBox="0 0 100 120"
        width="100"
        height="120"
        variants={pulseVariants}
        animate="idle"
        style={{ overflow: 'visible', transformOrigin: '50px 100px', display: 'block' }}
      >
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
        </defs>

        {/* ── Head (rounded square) ── */}
        <rect x="28" y="12" width="44" height="44" rx="8" fill={bodyFill} stroke={primaryColor} strokeWidth="1.5" />

        {/* ── Left eye ── */}
        <circle cx="39" cy="30" r="5" fill={accentColor} opacity="0.8" />

        {/* ── Right eye ── */}
        <circle cx="61" cy="30" r="5" fill={accentColor} opacity="0.8" />

        {/* ── Antenna ── */}
        <line x1="50" y1="8" x2="50" y2="2" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
        <circle cx="50" cy="0" r="2.5" fill={accentColor} />

        {/* ── Body (rounded rectangle) ── */}
        <rect x="22" y="62" width="56" height="44" rx="8" fill={bodyFill} stroke={primaryColor} strokeWidth="1.5" />

        {/* ── Chest light (animated pulse) ── */}
        <motion.circle
          cx="50" cy="84" r="5"
          fill={accentColor}
          filter={`url(#${glowId})`}
          variants={pulseVariants}
          animate="idle"
          style={{ transformOrigin: '50px 84px', opacity: 0.7 }}
        />

        {/* ── Left arm ── */}
        <rect x="10" y="72" width="10" height="22" rx="5" fill={bodyFill} stroke={primaryColor} strokeWidth="1.5" />

        {/* ── Right arm (waving) ── */}
        <motion.g variants={waveVariants} animate="idle" style={{ transformOrigin: '85px 72px' }}>
          <rect x="80" y="72" width="10" height="22" rx="5" fill={bodyFill} stroke={primaryColor} strokeWidth="1.5" />
        </motion.g>

        {/* ── Left leg ── */}
        <rect x="32" y="108" width="10" height="12" rx="4" fill={bodyFill} stroke={primaryColor} strokeWidth="1.5" />

        {/* ── Right leg ── */}
        <rect x="58" y="108" width="10" height="12" rx="4" fill={bodyFill} stroke={primaryColor} strokeWidth="1.5" />
      </motion.svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WelcomePopup
// ---------------------------------------------------------------------------

interface WelcomePopupProps {
  onClose: () => void
  userHasTyped?: boolean
}

export function WelcomePopup({ onClose, userHasTyped = false }: WelcomePopupProps) {
  const { currentTheme, isDarkMode } = useTheme()
  const { settings, isLoaded }       = useSettings()
  const [isVisible,     setIsVisible]     = useState(false)
  const [robotPosition, setRobotPosition] = useState(200)
  const [isBlinking,    setIsBlinking]    = useState(false)
  const blinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getUserName = () =>
    isLoaded && settings.userProfile.name ? settings.userProfile.name : 'User'

  // Show / auto-hide
  useEffect(() => {
    if (userHasTyped) return

    const showTimer = setTimeout(() => {
      setIsVisible(true)
      setRobotPosition(0)
    }, 300)

    const hideTimer = setTimeout(() => {
      setIsVisible(false)
      setRobotPosition(200)
      setTimeout(() => onClose(), 500)
    }, 5000)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [onClose, userHasTyped])

  // Dismiss immediately when user starts typing
  useEffect(() => {
    if (userHasTyped && isVisible) {
      setIsVisible(false)
      setRobotPosition(200)
      setTimeout(() => onClose(), 500)
    }
  }, [userHasTyped, isVisible, onClose])

  // Random blink loop — only while visible
  useEffect(() => {
    if (!isVisible) {
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
      return
    }
    const scheduleBlink = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        setIsBlinking(true)
        setTimeout(() => {
          setIsBlinking(false)
          blinkTimeoutRef.current = scheduleBlink()
        }, 180)
      }, 2500 + Math.random() * 2500)

    blinkTimeoutRef.current = scheduleBlink()
    return () => {
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
    }
  }, [isVisible])

  const userName = getUserName()

  return (
    <AnimatePresence>
      {isVisible && !userHasTyped && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-6 right-6 z-[9999]"
          style={{ pointerEvents: 'none' }}
        >
          {/* ── Robot character only ────────────────────────────────────── */}
          <motion.div
            initial={{ x: 200, opacity: 0, scale: 0.8 }}
            animate={{
              x:       robotPosition,
              opacity: robotPosition === 0 ? 1 : 0,
              scale:   robotPosition === 0 ? 1 : 0.8,
              y:       [0, -8, 0],
            }}
            exit={{ x: 200, opacity: 0, scale: 0.8 }}
            transition={{
              x:       { type: 'spring', damping: 15, stiffness: 200, duration: 0.8 },
              y:       { repeat: Infinity, duration: 0.5, ease: 'easeInOut', delay: 0.8 },
              opacity: { duration: 0.3 },
            }}
            style={{ width: '100px', height: '120px', pointerEvents: 'auto' }}
          >
            <SimpleRobot
              primaryColor={currentTheme.colors.primary}
              accentColor={currentTheme.colors.accent}
              bodyFill={currentTheme.colors.surfaceVariant}
              isDarkMode={isDarkMode}
              isBlinking={isBlinking}
              userName={userName}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
