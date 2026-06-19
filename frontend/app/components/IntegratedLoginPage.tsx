'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Eye, EyeOff, AlertCircle, RefreshCw, CheckCircle2,
  Sparkles, TrendingUp, ShieldCheck, GitPullRequest, BarChart3, LifeBuoy
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { getApiUrl, fetchWithTimeout } from '../../lib/api-config'
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
  { icon: Sparkles,       label: 'Work Buddy AI',        desc: 'Conversational copilot for your work data'      },
  { icon: TrendingUp,     label: 'Sprint Analytics',     desc: 'Velocity, burndown & top performers'            },
  { icon: ShieldCheck,    label: 'Quality Intelligence', desc: 'Defect leakage, coverage & TCOE metrics'        },
  { icon: GitPullRequest, label: 'Engineering Insights', desc: 'GitHub PRs, repos & CI/CD health'               },
  { icon: BarChart3,      label: 'KPI Dashboards',       desc: 'Executive metrics with AI-driven insights'      },
  { icon: LifeBuoy,       label: 'Case Intelligence',    desc: 'AI-classified Salesforce case analytics'        },
]

const integrations = ['Jira', 'Confluence', 'GitHub', 'Salesforce']

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
      const result = await login(username, password)
      if (!result.success) {
        setError(result.message || 'Invalid username or password')
        setLoading(false)
        return
      }

      // The user is authenticated the instant login() resolves — the JWT is
      // stored and isAuthenticated has flipped, so page.tsx will swap in the app
      // on the next render. Connecting the Jira/Confluence/GitHub service
      // accounts is best-effort warmup that makes several serial calls to CDK
      // over VPN, so fire it in the BACKGROUND and redirect immediately rather
      // than holding the user on "Connecting…" for it. When it resolves it
      // dispatches 'integration-update'; the app also polls service status on
      // mount, so a dropped event self-heals. Do NOT set React state in this
      // callback — this component unmounts the moment we navigate.
      const token = localStorage.getItem('auth_token')
      fetchWithTimeout(getApiUrl('/api/auth/auto-connect-integrations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const { jira, confluence, github } = data.results
            if (jira.success || confluence.success || github?.success) {
              window.dispatchEvent(new CustomEvent('integration-update', {
                detail: {
                  service: 'auto-connect',
                  jira: jira.success,
                  confluence: confluence.success,
                  github: github?.success ?? false
                }
              }))
            }
          }
        })
        .catch(() => { /* non-critical: the user is already authenticated */ })

      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen lg:h-screen lg:overflow-hidden flex"
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

        {/* Content — fluid vertical rhythm so the panel always fits the viewport */}
        <div
          className="relative z-10 flex flex-col h-full min-h-0"
          style={{ padding: 'clamp(20px, 3.5vh, 52px) clamp(36px, 4vw, 64px)' }}
        >

          {/* Top — CDK logo */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <CDKLogo size={26} />
          </motion.div>

          {/* Middle — hero. my-auto wrapper instead of justify-center: on
              overflow it top-aligns and clips bottom-only, never the logo */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="my-auto">
            {/* FalconX logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              style={{ marginBottom: 'clamp(14px, 2.5vh, 28px)' }}
            >
              <FalconXLogo size={44} color={T.mustard} textColor={T.text} showText={true} />
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
                marginBottom: 'clamp(8px, 1.4vh, 14px)'
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
                fontSize: 'clamp(24px, 3.4vh, 32px)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: 'clamp(10px, 1.6vh, 16px)',
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
              className="[@media(max-height:560px)]:hidden"
              style={{
                color: T.textSec,
                fontSize: 'clamp(12.5px, 1.6vh, 14px)',
                lineHeight: 1.65,
                maxWidth: 420,
                marginBottom: 'clamp(16px, 3vh, 32px)'
              }}
            >
              FalconX unifies Jira, Confluence, GitHub, and Salesforce into one
              intelligent workspace — sprint analytics, quality metrics, and an
              AI copilot that answers in plain language.
            </motion.p>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3" style={{ maxWidth: 560 }}>
              {features.map((f, i) => {
                const Icon = f.icon
                return (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.46 + i * 0.06 }}
                    whileHover={{ y: -3 }}
                    className="flex items-start gap-3"
                    style={{
                      padding: 'clamp(8px, 1.4vh, 12px) 14px',
                      borderRadius: 12,
                      background: T.bgCard,
                      border: `1px solid ${T.border}`
                    }}
                  >
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: T.mustardDim,
                        flexShrink: 0
                      }}
                    >
                      <Icon size={15} style={{ color: T.mustard }} />
                    </div>
                    <div>
                      <p style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                        {f.label}
                      </p>
                      <p
                        className="[@media(max-height:760px)]:line-clamp-1 [@media(max-height:560px)]:hidden"
                        style={{ color: T.textMuted, fontSize: 11.5, lineHeight: 1.5 }}
                      >
                        {f.desc}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Integration chips */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              className="flex items-center gap-2 flex-wrap"
              style={{ marginTop: 'clamp(14px, 2.4vh, 28px)' }}
            >
              <span
                style={{
                  color: T.textMuted,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginRight: 4
                }}
              >
                Unified with
              </span>
              {integrations.map(name => (
                <span
                  key={name}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    border: `1px solid ${T.border}`,
                    background: T.bgSurface,
                    color: T.textSec,
                    fontSize: 11.5,
                    fontWeight: 500
                  }}
                >
                  {name}
                </span>
              ))}
              <span
                className="[@media(max-height:760px)]:hidden"
                style={{ color: T.textMuted, fontSize: 11.5 }}
              >
                + PDF, PowerPoint & Excel exports
              </span>
            </motion.div>
            </div>
          </div>

          {/* Bottom — divider line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            style={{
              height: 1,
              background: `linear-gradient(to right, ${T.mustard}40, ${T.olive}40, transparent)`,
              marginBottom: 'clamp(10px, 1.4vh, 16px)',
              marginTop: 'clamp(12px, 2vh, 24px)'
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

      {/* ── Right login panel — internal scroll fallback so the form is
            always reachable even on very short windows ─────────────────── */}
      <div
        className="w-full lg:flex-1 flex p-8 relative overflow-y-auto overflow-x-hidden"
        style={{ backgroundColor: T.bgCard }}
      >
        {/* Subtle mustard glow top-right */}
        <div
          className="absolute top-0 right-0 w-72 h-72 -translate-y-1/3 translate-x-1/3 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${T.mustardDim} 0%, transparent 70%)` }}
        />

        {/* scale-up entrance (not y-offset) so the transform never extends
            the scroll container and flashes a scrollbar on short screens */}
        <motion.div
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="w-full max-w-[360px] relative z-10 m-auto"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-10">
            <FalconXLogo size={40} color={T.mustard} textColor={T.text} />
          </div>

          {/* Heading */}
          <div className="mb-8 [@media(max-height:760px)]:mb-4">
            <h2 style={{ color: T.text, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 6 }}>
              Sign in
            </h2>
            <p style={{ color: T.textSec, fontSize: 13 }}>
              Access your Leadership Engine workspace
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-5 [@media(max-height:760px)]:gap-3">

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
          <div className="mt-6 [@media(max-height:760px)]:mt-3">
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
            className="mt-7 [@media(max-height:760px)]:mt-3"
            style={{
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
