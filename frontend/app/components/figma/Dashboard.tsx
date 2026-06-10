'use client'

import React from 'react'
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { ScrollArea } from '../ui/scroll-area'
import {
  TrendingUp,
  Users,
  Target,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Zap,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  GitBranch,
  MessageCircle,
  Code,
  Crown,
  Star,
} from 'lucide-react'

// ── Design tokens — CSS variable references (theme-aware) ─────────────────
// Using CSS custom properties so both Light and Dark modes resolve correctly.
const T = {
  bgPage:       'var(--bg-page)',
  bgCard:       'var(--bg-card)',
  bgSurface:    'var(--bg-surface)',
  bgHover:      'var(--bg-hover)',
  bgActive:     'var(--bg-active)',
  border:       'var(--border)',
  borderStrong: 'var(--border-strong)',
  text:         'var(--text-primary)',
  textSec:      'var(--text-secondary)',
  textMuted:    'var(--text-muted)',
  textHint:     'var(--text-hint)',
  mustard:      'var(--accent-cool)',
  olive:        'var(--accent-cool)',
  mustardDim:   'var(--accent-cool-bg)',
  oliveDim:     'var(--accent-cool-bg)',
  amber:        'var(--amber)',
  amberBg:      'var(--amber-bg)',
  red:          'var(--red)',
  redBg:        'var(--red-bg)',
  blue:         'var(--blue)',
  blueBg:       'var(--blue-bg)',
} as const

interface FigmaDashboardProps {
  hasActiveConnections: boolean
  theme: 'light' | 'dark'
}

// Scroll animation hook
const useScrollAnim = () => {
  const ref = React.useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return { ref, isInView }
}

// Animated number counter
function AnimatedNumber({ value, duration = 2 }: { value: number; duration?: number }) {
  const mv  = useMotionValue(0)
  const sv  = useSpring(mv, { duration: duration * 1000, bounce: 0 })
  const disp = useTransform(sv, (c) => Math.round(c))
  React.useEffect(() => { mv.set(value) }, [mv, value])
  return <motion.span>{disp}</motion.span>
}

// Reusable panel card
function Panel({
  children,
  className = '',
  style = {},
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function FigmaDashboard({ hasActiveConnections, theme }: FigmaDashboardProps) {
  const { ref: metricsRef, isInView: metricsInView } = useScrollAnim()
  const { ref: chartsRef,  isInView: chartsInView  } = useScrollAnim()

  const metrics = [
    { title: 'Performance', value: 87, change: '+12%', up: true,  icon: TrendingUp, accent: T.mustard, accentBg: T.mustardDim },
    { title: 'Velocity',    value: 94, change: '+8%',  up: true,  icon: Zap,        accent: T.blue,    accentBg: T.blueBg     },
    { title: 'Quality',     value: 91, change: '+5%',  up: true,  icon: Star,       accent: T.amber,   accentBg: T.amberBg    },
    { title: 'Completion',  value: 78, change: '-3%',  up: false, icon: Target,     accent: T.red,     accentBg: T.redBg      },
  ]

  const activities = [
    { id: 1, title: 'Sprint 23 completed',     desc: 'All planned features delivered on time',  time: '2h ago', ok: true,  icon: CheckCircle },
    { id: 2, title: 'Code review completed',   desc: '15 pull requests reviewed and merged',    time: '4h ago', ok: true,  icon: GitBranch   },
    { id: 3, title: 'Team standup',            desc: 'Daily sync completed with 8 members',     time: '6h ago', ok: null,  icon: Users       },
    { id: 4, title: 'Performance alert',       desc: 'Response time increased by 15%',          time: '8h ago', ok: false, icon: AlertCircle },
  ]

  const team = [
    { name: 'Alex Chen',    role: 'Tech Lead',     avatar: 'AC', status: 'online', tasks: 8 },
    { name: 'Sarah Kim',    role: 'Frontend Dev',  avatar: 'SK', status: 'online', tasks: 6 },
    { name: 'Mike Johnson', role: 'Backend Dev',   avatar: 'MJ', status: 'away',   tasks: 4 },
    { name: 'Emma Davis',   role: 'QA Engineer',   avatar: 'ED', status: 'online', tasks: 7 },
    { name: 'David Wilson', role: 'DevOps',        avatar: 'DW', status: 'offline', tasks: 3 },
  ]

  const quickActions = [
    { icon: MessageCircle, label: 'Start Chat',        accent: T.mustard },
    { icon: Calendar,      label: 'Schedule Meeting',  accent: T.blue    },
    { icon: Code,          label: 'Code Review',       accent: T.amber   },
    { icon: Crown,         label: 'Leadership Access', accent: T.mustard },
  ]

  const statusDot = (status: string) =>
    status === 'online' ? T.mustard : status === 'away' ? T.amber : T.textMuted

  return (
    <ScrollArea className="h-full">
      <div
        className="min-h-full relative"
        style={{ backgroundColor: T.bgPage, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        {/* Subtle diagonal stripe background */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ opacity: 0.025 }}
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id="dash-diag" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <line x1="0" y1="0" x2="0" y2="48" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dash-diag)" />
        </svg>

        {/* Corner glow accents */}
        <div
          className="absolute top-0 right-0 w-96 h-96 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${T.oliveDim} 0%, transparent 70%)`, transform: 'translate(40%, -40%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${T.mustardDim} 0%, transparent 70%)`, transform: 'translate(-30%, 30%)' }}
        />

        <div className="relative z-10 p-6 space-y-6">

          {/* ── Page Header ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between"
          >
            <div>
              <p style={{ color: T.mustard, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Leadership Intelligence
              </p>
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 4 }}>
                Team Dashboard
              </h1>
              <p style={{ color: T.textSec, fontSize: 13 }}>
                Advanced analytics and strategic intelligence
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  color: T.textSec, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderStrong; e.currentTarget.style.color = T.text }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSec }}
              >
                <Activity size={13} /> Filter
              </button>
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  background: T.mustard, border: 'none',
                  color: 'var(--bg-page)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                <Download size={13} /> Export
              </button>
            </div>
          </motion.div>

          {/* ── Metrics Grid ─────────────────────────────────────────── */}
          <motion.div
            ref={metricsRef}
            initial={{ opacity: 0, y: 24 }}
            animate={metricsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            {metrics.map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={metricsInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                whileHover={{ y: -2 }}
              >
                <Panel>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p style={{ color: T.textSec, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {m.title}
                      </p>
                      <div
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          backgroundColor: m.accentBg,
                          border: `1px solid ${m.accent}22`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <m.icon size={14} style={{ color: m.accent }} />
                      </div>
                    </div>
                    <div className="flex items-end gap-2 mb-3">
                      <span style={{ color: T.text, fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}>
                        {metricsInView ? <AnimatedNumber value={m.value} /> : 0}
                        <span style={{ fontSize: 14 }}>%</span>
                      </span>
                      <div className="flex items-center gap-1 mb-0.5" style={{ color: m.up ? T.mustard : T.red, fontSize: 11, fontWeight: 600 }}>
                        {m.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {m.change}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 2, backgroundColor: T.border, borderRadius: 2, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={metricsInView ? { width: `${m.value}%` } : {}}
                        transition={{ duration: 1, delay: 0.4 + i * 0.08, ease: 'easeOut' }}
                        style={{ height: '100%', backgroundColor: m.accent, borderRadius: 2 }}
                      />
                    </div>
                  </div>
                </Panel>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Charts + Activities ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Performance Trends — 2/3 width */}
            <motion.div
              ref={chartsRef}
              initial={{ opacity: 0, x: -24 }}
              animate={chartsInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:col-span-2"
            >
              <Panel style={{ height: '100%' }}>
                <div className="p-5" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 size={15} style={{ color: T.mustard }} />
                    <h3 style={{ color: T.text, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Performance Trends</h3>
                  </div>
                  <p style={{ color: T.textMuted, fontSize: 12 }}>Metrics over the last 30 days</p>
                </div>
                <div className="p-5 flex items-center justify-center" style={{ minHeight: 180 }}>
                  <div className="text-center">
                    <div
                      style={{
                        width: 48, height: 48, borderRadius: 12,
                        backgroundColor: T.bgSurface, border: `1px solid ${T.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px',
                      }}
                    >
                      <BarChart3 size={20} style={{ color: T.textMuted }} />
                    </div>
                    <p style={{ color: T.textMuted, fontSize: 13 }}>Performance chart</p>
                    <p style={{ color: T.textHint, fontSize: 11, marginTop: 4 }}>Connect Jira to see live data</p>
                  </div>
                </div>
              </Panel>
            </motion.div>

            {/* Recent Activities — 1/3 width */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={chartsInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Panel>
                <div className="p-5" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Activity size={15} style={{ color: T.mustard }} />
                    <h3 style={{ color: T.text, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Recent Activity</h3>
                  </div>
                  <p style={{ color: T.textMuted, fontSize: 12 }}>Latest team updates</p>
                </div>
                <div className="p-3 space-y-1">
                  {activities.map((act, i) => (
                    <motion.div
                      key={act.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={chartsInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.3, delay: 0.4 + i * 0.07 }}
                      className="flex items-start gap-3 p-2.5 rounded-lg"
                      style={{ backgroundColor: 'transparent', transition: 'background-color 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.bgHover }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                          backgroundColor: act.ok === true ? T.mustardDim : act.ok === false ? T.redBg : T.bgSurface,
                          border: `1px solid ${act.ok === true ? T.mustard + '30' : act.ok === false ? T.red + '30' : T.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <act.icon size={13} style={{ color: act.ok === true ? T.mustard : act.ok === false ? T.red : T.textSec }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p style={{ color: T.text, fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{act.title}</p>
                        <p style={{ color: T.textMuted, fontSize: 11, marginTop: 2, lineHeight: 1.3 }}>{act.desc}</p>
                        <p style={{ color: T.textHint, fontSize: 10, marginTop: 2 }}>{act.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          </div>

          {/* ── Team Members ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Panel>
              <div className="p-5" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <Users size={15} style={{ color: T.mustard }} />
                  <h3 style={{ color: T.text, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Team Members</h3>
                </div>
                <p style={{ color: T.textMuted, fontSize: 12 }}>Current team status and workload</p>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {team.map((member, i) => (
                  <motion.div
                    key={member.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.55 + i * 0.07 }}
                    whileHover={{ y: -1 }}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      backgroundColor: T.bgSurface,
                      border: `1px solid ${T.border}`,
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.borderStrong }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.border }}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          backgroundColor: T.bgActive,
                          border: `1px solid ${T.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <span style={{ color: T.mustard, fontSize: 11, fontWeight: 700 }}>{member.avatar}</span>
                      </div>
                      {/* Status dot */}
                      <div
                        style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 9, height: 9, borderRadius: '50%',
                          backgroundColor: statusDot(member.status),
                          border: `1.5px solid ${T.bgSurface}`,
                        }}
                      />
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p style={{ color: T.text, fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{member.name}</p>
                      <p style={{ color: T.textSec, fontSize: 11, marginTop: 1 }}>{member.role}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          style={{
                            fontSize: 10, fontWeight: 600,
                            color: T.mustard,
                            backgroundColor: T.mustardDim,
                            border: `1px solid ${T.mustard}25`,
                            borderRadius: 4, padding: '1px 6px',
                          }}
                        >
                          {member.tasks} tasks
                        </span>
                        <span style={{ fontSize: 10, color: T.textMuted }}>{member.status}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Panel>
          </motion.div>

          {/* ── Quick Actions ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
          >
            <Panel>
              <div className="p-5" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={15} style={{ color: T.mustard }} />
                  <h3 style={{ color: T.text, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Quick Actions</h3>
                </div>
                <p style={{ color: T.textMuted, fontSize: 12 }}>Common tasks and shortcuts</p>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {quickActions.map((action, i) => (
                  <motion.button
                    key={action.label}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.7 + i * 0.07 }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 8, padding: '16px 12px', borderRadius: 10,
                      backgroundColor: T.bgSurface,
                      border: `1px solid ${T.border}`,
                      color: T.textSec, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = action.accent + '60'
                      e.currentTarget.style.color = T.text
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = T.border
                      e.currentTarget.style.color = T.textSec
                    }}
                  >
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: action.accent + '18',
                        border: `1px solid ${action.accent}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <action.icon size={16} style={{ color: action.accent }} />
                    </div>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{action.label}</span>
                  </motion.button>
                ))}
              </div>
            </Panel>
          </motion.div>

          {/* Bottom accent bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            style={{
              height: 1,
              background: `linear-gradient(to right, ${T.mustard}40, ${T.olive}40, transparent)`,
            }}
          />
          <p style={{ color: T.textMuted, fontSize: 11, paddingBottom: 4 }}>
            © {new Date().getFullYear()} CDK Global. FalconX Leadership Engine.
          </p>

        </div>
      </div>
    </ScrollArea>
  )
}
