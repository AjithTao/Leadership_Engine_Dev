'use client'

import React from 'react'

// ── Design tokens ─────────────────────────────────────────────────────────────
// Brand accent routed through CSS vars: action blue in light mode, the original
// mustard #D4A847 in dark mode (see globals.css :root / .dark).
export const MUSTARD  = 'var(--accent-cool)'       // primary accent
export const OLIVE    = 'var(--accent-cool)'       // matches primary accent
// 15% translucent accent — resolves to rgba(212,168,71,0.15) in dark (the
// original MUSTARD_DIM value) and a blue tint in light.
export const MUSTARD_DIM = 'color-mix(in srgb, var(--accent-cool) 15%, transparent)'
export const OLIVE_DIM   = 'var(--olive-dim)'
// Accent variants that pop on the dark chrome (navbar/sidebar) in light mode
export const CHROME_ACCENT     = 'var(--chrome-accent)'
export const CHROME_ACCENT_DIM = 'var(--chrome-accent-dim)'

interface FalconXLogoProps {
  size?: number
  color?: string
  showText?: boolean
  textColor?: string
  xColor?: string
  className?: string
}

export function FalconXLogo({
  size = 32,
  color = MUSTARD,
  showText = true,
  textColor = 'var(--text-primary)',
  xColor,
  className = ''
}: FalconXLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Icon mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background circle */}
        <circle cx="20" cy="20" r="20" fill={color} fillOpacity="0.12" />

        {/* Falcon wing / arrow — reads as "F" and a bird mid-dive */}
        <path
          d="M8 10 L32 20 L20 22 L16 32 Z"
          fill={color}
          fillOpacity="0.85"
        />
        <path
          d="M8 10 L20 15 L18 20 Z"
          fill={color}
        />

        {/* Speed lines */}
        <line x1="10" y1="28" x2="18" y2="26" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
        <line x1="10" y1="31" x2="15" y2="29.5" stroke={color} strokeWidth="1" strokeLinecap="round" strokeOpacity="0.3" />
      </svg>

      {/* Wordmark */}
      {showText && (
        <span
          style={{
            color: textColor,
            fontSize: size * 0.45,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            lineHeight: 1
          }}
        >
          Falcon<span style={{ color: xColor ?? OLIVE }}>X</span>
        </span>
      )}
    </div>
  )
}

export function TaoLogo({ size = 28, className = '' }: { size?: number; textColor?: string; markColor?: string; className?: string }) {
  return <span className={className} style={{ display: 'inline-flex', background: '#17202c', padding: '6px 10px', borderRadius: 6 }}>
    <img src="/tao-logo.svg" alt="TAO Digital Solutions" style={{ height: Math.max(size, 36), width: 'auto' }} />
  </span>
}
