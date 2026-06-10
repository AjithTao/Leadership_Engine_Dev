'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { getApiUrl } from '../../lib/api-config'
import { FalconXLogo, CDKLogo, MUSTARD, OLIVE, MUSTARD_DIM, OLIVE_DIM } from './ui/FalconXLogo'

// ── Design tokens — CSS variable references (theme-aware) ─────────────────────
const T = {
  bgPage:       'var(--bg-page)',
  bgCard:       'var(--bg-card)',
  bgSurface:    'var(--bg-surface)',
  border:       'var(--border)',
  borderStrong: 'var(--border-strong)',
  text:         'var(--text-primary)',
  textSec:      'var(--text-secondary)',
  textMuted:    'var(--text-muted)',
  mustard:      MUSTARD,
  olive:        OLIVE,
  mustardDim:   MUSTARD_DIM,
  oliveDim:     OLIVE_DIM,
  red:          'var(--red)',
  redBg:        'var(--red-bg)',
} as const

const features = [
  { label: 'Sprint Analytics',      desc: 'Real-time velocity & burndown' },
  { label: 'AI Copilot',            desc: 'Predictive team intelligence'   },
  { label: 'Defect Tracking',       desc: 'Leakage detection & prevention' },
  { label: 'KPI Dashboards',        desc: 'Executive-grade metrics'        },
  { label: 'GitHub & Jira',         desc: 'Unified integration layer'      },
]

export function IntegratedLoginPage() {
  const { login } = useAuth()
  const router    = useRouter()

  const [username, setUsername]   = useState('')
  const [password, setPassword]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const success = await login(username, password)
      if (!success) {
        setError('Invalid username or password')
        setLoading(false)
        return
      }
      try {
        const token = localStorage.getItem('auth_token')
        const res   = await fetch(getApiUrl('/api/auth/auto-connect-integrations'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : ''
          }
        })
        const data = await res.json()
        if (data.success) {
          const { jira, confluence } = data.results
          if (jira.success || confluence.success) {
            window.dispatchEvent(new CustomEvent('integration-update', {
              detail: { service: 'auto-connect', jira: jira.success, confluence: confluence.success }
            }))
          }
        }
      } catch { /* non-critical */ }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: T.bgPage, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >

      {/* ── Left branding panel ───────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[58%] flex-col justify-between relative overflow-hidden"
        style={{ backgroundColor: T.bgPage }}
      >
        {/* Geometric background — subtle diagonal stripes */}
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.035 }}
        >
          <defs>
            <pattern id="diag" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <line x1="0" y1="0" x2="0" y2="48" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#diag)" />
        </svg>

        {/* Olive corner accent */}
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${T.oliveDim} 0%, transparent 70%)` }}
        />
        {/* Mustard corner accent */}
        <div
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full translate-y-1/2 -translate-x-1/3 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${T.mustardDim} 0%, transparent 70%)` }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-16 py-14">

          {/* Top — CDK logo */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <CDKLogo size={26} />
          </motion.div>

          {/* Middle — hero */}
          <div className="flex-1 flex flex-col justify-center">
            {/* FalconX logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-8"
            >
              <FalconXLogo size={52} color={T.mustard} textColor={T.text} showText={true} />
            </motion.div>

            {/* Eyebrow label */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.22 }}
              style={{
                color: T.mustard,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 14
              }}
            >
              Leadership Engine
            </motion.p>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              style={{
                color: T.text,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: 16,
                maxWidth: 420
              }}
            >
              AI‑Powered Leadership Intelligence
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.38 }}
              style={{
                color: T.textSec,
                fontSize: 14,
                lineHeight: 1.65,
                maxWidth: 380,
                marginBottom: 40
              }}
            >
              Real-time insights, sprint analytics, defect leakage
              detection, and predictive team intelligence — all in one place.
            </motion.p>

            {/* Feature list */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.48 }}
              className="flex flex-col gap-3"
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.52 + i * 0.07 }}
                  className="flex items-center gap-3"
                >
                  {/* Olive dot indicator */}
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: i % 2 === 0 ? T.mustard : T.olive,
                      flexShrink: 0
                    }}
                  />
                  <span style={{ color: T.text, fontSize: 13, fontWeight: 500 }}>{f.label}</span>
                  <span style={{ color: T.textMuted, fontSize: 12 }}>{f.desc}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Bottom — divider line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            style={{
              height: 1,
              background: `linear-gradient(to right, ${T.mustard}40, ${T.olive}40, transparent)`,
              marginBottom: 16
            }}
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.05 }}
            style={{ color: T.textMuted, fontSize: 11 }}
          >
            © {new Date().getFullYear()} CDK Global. FalconX Leadership Engine.
          </motion.p>
        </div>
      </div>

      {/* ── Vertical divider ─────────────────────────────────────────── */}
      <div
        className="hidden lg:block"
        style={{ width: 1, background: T.border, flexShrink: 0 }}
      />

      {/* ── Right login panel ─────────────────────────────────────────── */}
      <div
        className="w-full lg:flex-1 flex items-center justify-center p-8 relative"
        style={{ backgroundColor: T.bgCard }}
      >
        {/* Subtle mustard glow top-right */}
        <div
          className="absolute top-0 right-0 w-72 h-72 -translate-y-1/3 translate-x-1/3 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${T.mustardDim} 0%, transparent 70%)` }}
        />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="w-full max-w-[360px] relative z-10"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-10">
            <FalconXLogo size={40} color={T.mustard} textColor={T.text} />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 style={{ color: T.text, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 6 }}>
              Sign in
            </h2>
            <p style={{ color: T.textSec, fontSize: 13 }}>
              Access your Leadership Engine workspace
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-5">

            {/* Username */}
            <div>
              <label style={{ display: 'block', color: T.textSec, fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: '0.02em' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: T.bgSurface,
                  border: `1px solid ${T.border}`,
                  color: T.text,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s'
                }}
                onFocus={e => { e.target.style.borderColor = T.mustard }}
                onBlur={e  => { e.target.style.borderColor = T.border  }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', color: T.textSec, fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: '0.02em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 14px',
                    borderRadius: 8,
                    background: T.bgSurface,
                    border: `1px solid ${T.border}`,
                    color: T.text,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => { e.target.style.borderColor = T.mustard }}
                  onBlur={e  => { e.target.style.borderColor = T.border  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: T.textMuted,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex'
                  }}
                >
                  {showPwd ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="remember"
                style={{ accentColor: T.mustard, width: 14, height: 14 }}
              />
              <label htmlFor="remember" style={{ color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
                Remember me
              </label>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: T.redBg,
                  border: `1px solid rgba(248,113,113,0.25)`,
                  color: T.red,
                  fontSize: 13
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                {error}
              </motion.div>
            )}

            {/* Sign in button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ opacity: 0.9 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 8,
                background: T.mustard,
                color: 'var(--bg-page)',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                letterSpacing: '-0.01em',
                transition: 'opacity 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Connecting…
                </>
              ) : 'Sign In'}
            </motion.button>
          </form>

          {/* Footer links */}
          <div style={{ marginTop: 24 }}>
            {/* Divider */}
            <div style={{ height: 1, background: T.border, marginBottom: 18 }} />

            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: T.mustard,
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer',
                padding: 0,
                marginBottom: 10,
                display: 'block'
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.textDecoration = 'underline' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.textDecoration = 'none' }}
            >
              Forgot your password?
            </button>

            <p style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.6, marginBottom: 6 }}>
              Forgot your email or need an account? Contact your enterprise administrator.
            </p>
            <p style={{ color: T.textMuted, fontSize: 12 }}>
              For assistance, contact{' '}
              <span style={{ color: T.olive }}>FalconX Support</span>.
            </p>
          </div>

          {/* Olive accent bar at bottom of card */}
          <div
            style={{
              marginTop: 28,
              height: 2,
              borderRadius: 2,
              background: `linear-gradient(to right, ${T.mustard}, ${T.olive}, transparent)`
            }}
          />
        </motion.div>
      </div>
    </div>
  )
}
