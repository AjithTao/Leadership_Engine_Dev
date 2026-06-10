'use client'

import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { MUSTARD, OLIVE } from './ui/FalconXLogo'

// ── FalconX Loading Screen ────────────────────────────────────────────────────
export function LoadingScreen() {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase]       = useState(0)

  const phases = [
    'Initializing workspace…',
    'Loading integrations…',
    'Preparing dashboards…',
    'Almost ready…',
  ]

  useEffect(() => {
    // Animate progress bar
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100 }
        const increment = p < 60 ? 3 : p < 85 ? 1.5 : 0.8
        return Math.min(p + increment, 100)
      })
    }, 60)

    // Cycle phase labels
    const phaseInterval = setInterval(() => {
      setPhase(ph => (ph + 1) % phases.length)
    }, 900)

    return () => {
      clearInterval(interval)
      clearInterval(phaseInterval)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        backgroundColor: 'var(--bg-page)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
      }}
    >
      {/* Mustard radial glow — top */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{ background: `radial-gradient(ellipse at center, rgba(212,168,71,0.06) 0%, transparent 70%)` }}
      />
      {/* Olive radial glow — bottom */}
      <div
        className="absolute bottom-0 left-1/4 translate-y-1/2 w-[500px] h-[400px] pointer-events-none"
        style={{ background: `radial-gradient(ellipse at center, rgba(122,142,78,0.05) 0%, transparent 70%)` }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center" style={{ gap: 0 }}>

        {/* Animated FalconX icon */}
        <div style={{ marginBottom: 28, position: 'relative' }}>
          {/* Outer ring — slow rotate */}
          <svg
            width={96}
            height={96}
            viewBox="0 0 96 96"
            style={{ animation: 'fx-ring-spin 8s linear infinite', position: 'absolute', inset: 0 }}
          >
            <circle
              cx={48} cy={48} r={44}
              stroke={MUSTARD}
              strokeWidth={1}
              strokeDasharray="12 8"
              strokeOpacity={0.25}
              fill="none"
            />
          </svg>

          {/* Inner ring — counter-rotate */}
          <svg
            width={96}
            height={96}
            viewBox="0 0 96 96"
            style={{ animation: 'fx-ring-counter 5s linear infinite', position: 'absolute', inset: 0 }}
          >
            <circle
              cx={48} cy={48} r={34}
              stroke={OLIVE}
              strokeWidth={1}
              strokeDasharray="6 10"
              strokeOpacity={0.2}
              fill="none"
            />
          </svg>

          {/* Falcon logo mark — pulse */}
          <svg
            width={96}
            height={96}
            viewBox="0 0 96 96"
            fill="none"
            style={{ animation: 'fx-pulse 2.4s ease-in-out infinite' }}
          >
            {/* Background circle */}
            <circle cx={48} cy={48} r={40} fill={MUSTARD} fillOpacity={0.08} />

            {/* Falcon wing shape — scaled to 96×96 */}
            <path d="M20 24 L76 48 L48 53 L40 76 Z" fill={MUSTARD} fillOpacity={0.85} />
            <path d="M20 24 L48 36 L44 48 Z" fill={MUSTARD} />

            {/* Speed lines */}
            <line x1="24" y1="67" x2="42" y2="62" stroke={MUSTARD} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" />
            <line x1="24" y1="74" x2="36" y2="70" stroke={MUSTARD} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.25" />

            {/* Olive accent dot */}
            <circle cx={68} cy={34} r={4} fill={OLIVE} fillOpacity={0.7} />
          </svg>
        </div>

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, marginBottom: 6 }}>
          <span style={{
            color: 'var(--text-primary)',
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1
          }}>
            Falcon
          </span>
          <span style={{
            color: OLIVE,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1
          }}>
            X
          </span>
        </div>

        {/* Eyebrow */}
        <p style={{
          color: MUSTARD,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 40
        }}>
          Leadership Engine
        </p>

        {/* Progress bar */}
        <div style={{
          width: 240,
          height: 2,
          background: 'var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 14
        }}>
          <div style={{
            height: '100%',
            borderRadius: 2,
            width: `${progress}%`,
            background: `linear-gradient(to right, ${MUSTARD}, ${OLIVE})`,
            transition: 'width 0.08s linear'
          }} />
        </div>

        {/* Phase label */}
        <p
          key={phase}
          style={{
            color: 'var(--text-muted)',
            fontSize: 12,
            letterSpacing: '0.02em',
            animation: 'fx-fade-phase 0.4s ease-out'
          }}
        >
          {phases[phase]}
        </p>

        {/* Three dots */}
        <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: i === 0 ? MUSTARD : i === 1 ? OLIVE : 'var(--border-strong)',
                animation: `fx-dot-pulse 1.4s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom brand */}
      <div
        className="absolute bottom-8 left-0 right-0 flex flex-col items-center"
        style={{ gap: 6 }}
      >
        {/* Gradient line */}
        <div style={{
          width: 120,
          height: 1,
          background: `linear-gradient(to right, transparent, ${MUSTARD}60, ${OLIVE}60, transparent)`
        }} />
        <p style={{ color: '#3A4060', fontSize: 11 }}>
          © {new Date().getFullYear()} CDK Global · FalconX Leadership Engine
        </p>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes fx-ring-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fx-ring-counter {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes fx-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.8; transform: scale(0.96); }
        }
        @keyframes fx-dot-pulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.3); }
        }
        @keyframes fx-fade-phase {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Inline spinner ────────────────────────────────────────────────────────────
export function LoadingSpinner({
  size = 'default',
  className = ''
}: {
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  const sizeMap = { sm: 'w-4 h-4', default: 'w-6 h-6', lg: 'w-8 h-8' }
  return (
    <Loader2
      className={`${sizeMap[size]} animate-spin ${className}`}
      style={{ color: 'var(--text-secondary)' }}
    />
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
export function LoadingCard() {
  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 rounded-lg skeleton" />
        <div className="flex-1">
          <div className="h-4 rounded w-3/4 mb-2 skeleton" />
          <div className="h-3 rounded w-1/2 skeleton" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-3 rounded skeleton" />
        <div className="h-3 rounded w-5/6 skeleton" />
        <div className="h-3 rounded w-4/6 skeleton" />
      </div>
    </div>
  )
}
