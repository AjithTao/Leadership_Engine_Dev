'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DashboardLayout } from './DashboardLayout'
import {
  RefreshCw, ExternalLink, AlertCircle, CheckCircle2, XCircle,
  Clock, MinusCircle, Bug, TestTube2, BarChart3, FileText,
  TrendingUp, ShieldAlert, Layers, AlertTriangle, ChevronDown, ChevronRight,
  Activity, Zap, Target, Info
} from 'lucide-react'
import { getApiUrl } from '../../lib/api-config'
import { useTheme } from '../contexts/ThemeContext'

// Theme detection. The semantic accent hexes below need darker, WCAG-AA variants
// on light surfaces — the vivid dark-mode hues (e.g. #F59E0B amber, #22C55E green)
// fail contrast as text on near-white. These resolve per render; the dashboard
// subscribes to useTheme() so the whole subtree re-renders — and these getters
// re-evaluate — whenever the theme toggles. Default to dark (the app's default)
// during SSR / before the class is applied.
const isDarkTheme = () =>
  typeof document === 'undefined' || document.documentElement.classList.contains('dark')
const pick = (light: string, dark: string) => (isDarkTheme() ? dark : light)

// ── Design tokens ─────────────────────────────────────────────────────────────
// Surfaces / text / border are theme-aware CSS vars so the dashboard matches the
// Jira & GitHub Insights pages in both light and dark mode. The semantic accents
// are concrete hex (so the `${color}NN` 8-digit-alpha tints resolve) but theme-
// aware via pick(): light = AA-on-near-white variants, dark = original vivid hues.
const DS = {
  page:          'var(--bg-page)',
  card:          'var(--bg-card)',
  surface:       'var(--bg-surface)',
  hover:         'var(--bg-hover)',
  border:        'var(--border)',
  borderStrong:  'var(--border-strong)',
  text:          'var(--text-primary)',
  textSec:       'var(--text-secondary)',
  textMuted:     'var(--text-muted)',
  textHint:      'var(--text-hint)',
  get accent()   { return pick('#816213', '#D4A847') },   // brand gold
  get accentBg() { return pick('#81621318', '#D4A84718') },
  get green()    { return pick('#1A7331', '#22C55E') },
  get greenBg()  { return pick('#1A733118', '#22C55E18') },
  get amber()    { return pick('#8A5E10', '#F59E0B') },
  get amberBg()  { return pick('#8A5E1018', '#F59E0B18') },
  get red()      { return pick('#C01C1C', '#EF4444') },
  get redBg()    { return pick('#C01C1C18', '#EF444418') },
  blue:          'var(--blue)',
  blueBg:        'var(--blue-bg)',
  font:          'var(--font)',
}

// ── Zephyr status colours (theme-aware: light variants pass AA as table text) ──
const STATUS = {
  PASS:        { get color() { return pick('#4F7A0F', '#75B000') }, get bg() { return pick('#4F7A0F18', '#75B00018') }, label: 'Pass',    icon: CheckCircle2 },
  FAIL:        { get color() { return pick('#C0330A', '#CC3300') }, get bg() { return pick('#C0330A18', '#CC330018') }, label: 'Fail',    icon: XCircle      },
  WIP:         { get color() { return pick('#8A5E10', '#F2B000') }, get bg() { return pick('#8A5E1018', '#F2B00018') }, label: 'WIP',     icon: Clock        },
  BLOCKED:     { get color() { return pick('#3D6A8C', '#6693B0') }, get bg() { return pick('#3D6A8C18', '#6693B018') }, label: 'Blocked', icon: MinusCircle  },
  UNEXECUTED:  { get color() { return pick('#5E6573', '#8B929A') }, get bg() { return pick('#5E657318', '#8B929A18') }, label: 'Not Run', icon: MinusCircle  },
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TestAreaData {
  label: string
  color: string
  count: number
}

interface TestSuiteData {
  total: number
  manual: number
  automated: number
  by_area?: TestAreaData[]
}

interface BugDistItem {
  project: string
  label: string
  color: string
  count: number
}

interface ExecRow {
  cycle:      string
  color:      string
  pass:       number
  fail:       number
  wip:        number
  blocked:    number
  unexecuted: number
  total:      number
  pass_rate:  number
}

interface FindingItem {
  description: string
  status: 'bug_logged' | 'resolved' | 'in_progress' | 'pending'
  jira_ids: string[]
}

interface WorkflowGroup {
  workflow: string
  count: number
  statuses: string[]
  confirmed_dealers: string[]
  pending_dealers: string[]
  jira_ids: string[]
  items: FindingItem[]
}

interface ObsAnalysis {
  total: number
  stats: { bug_logged: number; resolved: number; in_progress: number; pending: number }
  by_workflow: WorkflowGroup[]
}

interface BlockerItem {
  id: string
  description: string
  workflow: string
  status_type: 'bug_logged' | 'resolved' | 'in_progress' | 'pending'
  status_text: string
  jira_ids: string[]
  confirmed_dealers: string[]
  pending_dealers: string[]
}

interface BlkAnalysis {
  total: number
  active_count: number
  resolved_count: number
  active: BlockerItem[]
  resolved: BlockerItem[]
}

interface FindingsAnalysis {
  observations: ObsAnalysis
  blockers: BlkAnalysis
  obs_url: string
  blk_url: string
  last_fetched: string
}

interface DashboardData {
  focused_test_suite:       TestSuiteData
  comprehensive_test_suite: TestSuiteData
  bugs_distribution:        BugDistItem[]
  bug_priorities:           Record<string, number>
  bugs_total:               number
  execution_summary:        ExecRow[]
  version:                  string
  project:                  string
  findings: {
    observations_url: string
    blockers_url:     string
  }
  last_updated: string
}

// ── Seed data — shown while backend loads ──────────────────────────────────────
const SEED: DashboardData = {
  focused_test_suite: {
    total: 3119, manual: 1845, automated: 1274,
    by_area: [
      { label: 'General Ledger',      color: '#0052CC', count: 935  },
      { label: 'Accounts Payable',    color: '#00875A', count: 1250 },
      { label: 'Accounts Receivable', color: '#FF8B00', count: 310  },
      { label: '1099 / Tax',          color: '#6554C0', count: 315  },
      { label: 'Other',               color: '#8B929A', count: 309  },
    ],
  },
  comprehensive_test_suite: {
    total: 9611, manual: 7284, automated: 1325,
    by_area: [
      { label: 'General Ledger',      color: '#0052CC', count: 2883 },
      { label: 'Accounts Payable',    color: '#00875A', count: 3364 },
      { label: 'Accounts Receivable', color: '#FF8B00', count: 961  },
      { label: '1099 / Tax',          color: '#6554C0', count: 769  },
      { label: 'Other',               color: '#8B929A', count: 1634 },
    ],
  },
  bugs_distribution: [
    { project: 'APMODACC', label: 'Accounts Payable',    color: '#0052CC', count: 35 },
    { project: 'GLMODACC', label: 'General Ledger',       color: '#00875A', count: 27 },
    { project: 'ARMODACC', label: 'Accounts Receivable',  color: '#FF5630', count: 13 },
    { project: 'POMODACC', label: 'Purchase Orders',      color: '#FF8B00', count: 9  },
    { project: 'MODSRCH',  label: 'Search & Navigation',  color: '#6554C0', count: 5  },
  ],
  bug_priorities: { Blocker: 0, High: 8, Medium: 62, Low: 7, Minor: 1 },
  bugs_total: 89,
  execution_summary: [
    { cycle: 'MERCED HONDA',       color: '#0052CC', pass: 2716, fail:  92, wip: 0, blocked:  64, unexecuted:  30, total: 2902, pass_rate: 93.6 },
    { cycle: 'Team Nissan Group',  color: '#00875A', pass:  562, fail:  27, wip: 0, blocked:   1, unexecuted: 110, total:  700, pass_rate: 80.3 },
    { cycle: 'Highland Park Ford', color: '#FF5630', pass:  534, fail:  31, wip: 0, blocked:   4, unexecuted: 118, total:  687, pass_rate: 77.7 },
    { cycle: 'Mike Burch Ford',    color: '#FF7A00', pass:  499, fail:  31, wip: 0, blocked:   4, unexecuted: 153, total:  687, pass_rate: 72.6 },
    { cycle: 'TOYOTA OF GLENDORA', color: '#6554C0', pass:  510, fail:  12, wip: 0, blocked:   1, unexecuted: 177, total:  700, pass_rate: 72.9 },
  ],
  version:      'MOD ACCOUNTING UAT',
  project:      'MODDWTC',
  findings: {
    observations_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140070',
    blockers_url:     'https://confluence.cdk.com/pages/viewpage.action?pageId=502140072',
  },
  last_updated: new Date().toISOString(),
}

const SEED_FINDINGS: FindingsAnalysis = {
  obs_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140070',
  blk_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140072',
  last_fetched: new Date().toISOString(),
  observations: {
    total: 43,
    stats: { bug_logged: 15, resolved: 3, in_progress: 12, pending: 13 },
    by_workflow: [
      {
        workflow: 'AP Daily Processing', count: 11,
        statuses: ['bug_logged', 'in_progress'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan'],
        pending_dealers: ['Highland Park', 'Mike Burch'],
        jira_ids: ['POMODACC-2278', 'APMODACC-4474', 'APMODACC-4578'],
        items: [
          { description: 'Outstanding PO Amount shows $0.00 despite correct invoice — 3-way matching not working', status: 'in_progress', jira_ids: ['POMODACC-2278'] },
          { description: 'VCC payment type incorrectly displayed as "Check" during AP Payment processing', status: 'in_progress', jira_ids: ['APMODACC-4474'] },
        ],
      },
      {
        workflow: 'AP Payments', count: 9,
        statuses: ['bug_logged'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan', 'Highland Park', 'Mike Burch'],
        pending_dealers: [],
        jira_ids: ['APMODACC-4578', 'APMODACC-4603'],
        items: [
          { description: 'Printer not configured — cannot Archive/void check, ODP, or any payment type across all dealers', status: 'bug_logged', jira_ids: ['APMODACC-4578'] },
          { description: 'Unable to open Print dialog in Needs Authorization tabs and payment register', status: 'bug_logged', jira_ids: ['APMODACC-4603'] },
        ],
      },
      {
        workflow: '1099 Workflow', count: 7,
        statuses: ['bug_logged', 'pending'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan'],
        pending_dealers: ['Highland Park', 'Mike Burch'],
        jira_ids: [],
        items: [
          { description: 'Reconciliation report — payment date incorrect format in .csv and Excel files', status: 'bug_logged', jira_ids: [] },
          { description: '1099 filing snapshot data overlapping in PDF format for multiple records', status: 'bug_logged', jira_ids: [] },
        ],
      },
      {
        workflow: 'PO Daily Processing', count: 5,
        statuses: ['in_progress'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan'],
        pending_dealers: ['Highland Park', 'Mike Burch'],
        jira_ids: [],
        items: [
          { description: 'Freight functionality improperly configured — cannot update freight values or create freight-only POs', status: 'in_progress', jira_ids: [] },
          { description: 'System incorrectly enforces $2,000 approval limit on Admin users (RBAC issue)', status: 'in_progress', jira_ids: [] },
        ],
      },
      {
        workflow: 'GL Inquiry', count: 4,
        statuses: ['bug_logged', 'resolved', 'in_progress'],
        confirmed_dealers: ['Toyota', 'Nissan', 'Highland Park'],
        pending_dealers: ['Mike Burch'],
        jira_ids: ['GLMODACC-5380', 'GLMODACC-5377'],
        items: [
          { description: 'Posting dates displaying incorrectly (40/26/2026, 42/26/2026) — 2000+ records affected', status: 'bug_logged', jira_ids: ['GLMODACC-5380'] },
          { description: 'Adjustment and reversal data not appearing when searching by reference number', status: 'bug_logged', jira_ids: ['GLMODACC-5377'] },
        ],
      },
      {
        workflow: 'GL Processing', count: 3,
        statuses: ['in_progress', 'pending'],
        confirmed_dealers: ['Toyota', 'Nissan'],
        pending_dealers: ['Highland Park', 'Mike Burch'],
        jira_ids: ['GLMODACC-4387'],
        items: [
          { description: 'System allows payment date earlier than invoice date — validation missing', status: 'pending', jira_ids: [] },
          { description: 'Reversal entry allowed with date earlier than original journal entry date', status: 'pending', jira_ids: [] },
        ],
      },
      {
        workflow: 'AR', count: 3,
        statuses: ['bug_logged'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan', 'Highland Park', 'Mike Burch'],
        pending_dealers: [],
        jira_ids: ['ARMODACC-7507', 'ARMODACC-7508'],
        items: [
          { description: 'Navigation for Apply Payments blocked for AR Bal Customers', status: 'bug_logged', jira_ids: ['ARMODACC-7507'] },
          { description: 'AR Imports — Deposit left became -299 even after all transactions posted', status: 'bug_logged', jira_ids: ['ARMODACC-7508'] },
        ],
      },
      {
        workflow: 'Name Entity', count: 2,
        statuses: ['in_progress'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan'],
        pending_dealers: ['Highland Park', 'Mike Burch'],
        jira_ids: [],
        items: [
          { description: 'No comprehensive listing of vendor/customer records — new story to be created', status: 'in_progress', jira_ids: [] },
        ],
      },
      {
        workflow: 'Financial Statement', count: 1,
        statuses: ['bug_logged'],
        confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan'],
        pending_dealers: ['Highland Park', 'Mike Burch'],
        jira_ids: ['ARMODACC-7356'],
        items: [
          { description: 'Financial Statement and Accounts Receivable balances are mismatching', status: 'bug_logged', jira_ids: ['ARMODACC-7356'] },
        ],
      },
    ],
  },
  blockers: {
    total: 10,
    active_count: 6,
    resolved_count: 4,
    active: [
      {
        id: '1', description: '2024 tax year not available — Dev working on data migration logic',
        workflow: '1099 Workflow', status_type: 'in_progress',
        status_text: 'Dev working on data migration logic',
        jira_ids: [], confirmed_dealers: ['Merced Honda', 'Toyota', 'Nissan'], pending_dealers: ['Highland Park', 'Mike Burch'],
      },
      {
        id: '2', description: 'AP checks printing scenario is blocked in AP Payments workflow',
        workflow: 'AP Payments', status_type: 'pending',
        status_text: 'Active — no resolution yet',
        jira_ids: [], confirmed_dealers: ['Merced Honda', 'Toyota'], pending_dealers: ['Nissan', 'Highland Park', 'Mike Burch'],
      },
      {
        id: '4', description: '"Out of Balance" error blocking all GL processing for Highland Park dealer',
        workflow: 'GL Processing', status_type: 'in_progress',
        status_text: 'In Progress',
        jira_ids: [], confirmed_dealers: ['Highland Park'], pending_dealers: [],
      },
      {
        id: '6', description: 'Account Configuration tab not reflecting data (Blank Page) — Name Entity',
        workflow: 'Name Entity', status_type: 'bug_logged',
        status_text: 'MODSRCH-10231',
        jira_ids: ['MODSRCH-10231'], confirmed_dealers: ['Highland Park', 'Mike Burch'], pending_dealers: [],
      },
      {
        id: '7', description: 'Printer not configured and check sequence flag not enabled in Mike Burch Ford',
        workflow: 'AP Payments', status_type: 'bug_logged',
        status_text: 'APMODACC-4605',
        jira_ids: ['APMODACC-4605'], confirmed_dealers: ['Mike Burch'], pending_dealers: [],
      },
      {
        id: '11', description: 'Financial Statement screen not visible in Highland Park and Mike Burch environments',
        workflow: 'Financial Statement', status_type: 'pending',
        status_text: 'Unresolved — no fix yet',
        jira_ids: [], confirmed_dealers: ['Highland Park', 'Mike Burch'], pending_dealers: [],
      },
    ],
    resolved: [
      {
        id: '5', description: 'AR — No AR Bal Customers on Highland Park (caused by AP Out of Balance)',
        workflow: 'AR', status_type: 'resolved', status_text: 'Resolved',
        jira_ids: [], confirmed_dealers: ['Highland Park'], pending_dealers: [],
      },
      {
        id: '8', description: 'Approval/Receive config and Change history flags not enabled',
        workflow: 'Other', status_type: 'resolved', status_text: 'Flags and configs enabled — no more a blocker',
        jira_ids: [], confirmed_dealers: [], pending_dealers: [],
      },
      {
        id: '9', description: 'AR Apply Payments — AR Account number and GL account info not visible',
        workflow: 'AR', status_type: 'resolved', status_text: 'Solved',
        jira_ids: [], confirmed_dealers: ['Highland Park', 'Mike Burch'], pending_dealers: [],
      },
      {
        id: '10', description: 'AR Apply Payments — BAL customer account number and GL account info not visible',
        workflow: 'AR', status_type: 'resolved', status_text: 'Solved',
        jira_ids: [], confirmed_dealers: ['Highland Park', 'Mike Burch'], pending_dealers: [],
      },
    ],
  },
}

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedCounter({ target, duration = 900 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target === 0) { setCount(0); return }
    const startTime = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return <>{count.toLocaleString()}</>
}

// ── Live pulse dot ────────────────────────────────────────────────────────────
function LivePulse({ color = DS.accent }: { color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, flexShrink: 0 }}>
      <motion.span
        animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: color }}
      />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'block', position: 'relative', zIndex: 1 }} />
    </span>
  )
}

// ── Reusable card ──────────────────────────────────────────────────────────────
function Card({ children, style = {}, className = '', hover = true }: { children: React.ReactNode; style?: React.CSSProperties; className?: string; hover?: boolean }) {
  return (
    <motion.div
      className={className}
      whileHover={hover ? { y: -2, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' } : undefined}
      transition={{ duration: 0.18 }}
      style={{
        background: DS.card, border: `1px solid ${DS.border}`, borderRadius: 16, overflow: 'hidden', ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

// ── Info tooltip ("i" button + hover/click explanation) ───────────────────────
// Rendered through a portal to <body> so the floating panel can never be clipped
// by a card's overflow or painted over by a sibling card's stacking context.
const TOOLTIP_W = 248

function InfoTooltip({
  text,
  accent = DS.blue,
  align = 'right',
  size = 16,
}: {
  text: string
  accent?: string
  align?: 'left' | 'right'
  size?: number
}) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const open = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = align === 'right' ? r.right - TOOLTIP_W : r.left
    const maxLeft = window.innerWidth - TOOLTIP_W - 8
    if (left > maxLeft) left = maxLeft
    if (left < 8) left = 8
    setCoords({ top: r.bottom + 8, left })
    setShow(true)
  }

  return (
    <span
      style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      onMouseEnter={open}
      onMouseLeave={() => setShow(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label="More information"
        onClick={e => { e.stopPropagation(); if (show) setShow(false); else open() }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: '50%', padding: 0, flexShrink: 0,
          border: `1px solid ${show ? accent + '60' : DS.border}`,
          background: show ? accent + '14' : 'transparent',
          color: show ? accent : DS.textMuted,
          cursor: 'help', transition: 'all 0.15s', fontFamily: DS.font,
        }}
      >
        <Info size={Math.round(size * 0.62)} strokeWidth={2.4} />
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {show && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.13 }}
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 9999,
                width: TOOLTIP_W,
                padding: '9px 11px',
                borderRadius: 8,
                background: DS.card,
                border: `1px solid ${DS.borderStrong}`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.20)',
                color: DS.textSec,
                fontSize: 11,
                fontWeight: 400,
                lineHeight: 1.5,
                textAlign: 'left',
                whiteSpace: 'normal',
                fontFamily: DS.font,
                pointerEvents: 'none',
              }}
            >
              {text}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </span>
  )
}

function CardHeader({ icon: Icon, title, subtitle, accent = DS.blue, info }: {
  icon: React.ElementType; title: string; subtitle?: string; accent?: string; info?: string
}) {
  return (
    <div style={{ padding: '13px 20px', borderBottom: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 10, background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} style={{ color: accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: DS.text, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{title}</p>
        {subtitle && <p style={{ color: DS.textMuted, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>}
      </div>
      {info && <InfoTooltip text={info} accent={accent} />}
    </div>
  )
}

// ── Test Suite Component Area Breakdown ───────────────────────────────────────
function TestSuiteBreakdown({ manual, automated, total, by_area }: TestSuiteData) {
  const areas = by_area?.filter(a => a.count > 0) ?? []
  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Total */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: DS.text, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
          <AnimatedCounter target={total} />
        </span>
        <span style={{ color: DS.textMuted, fontSize: 11 }}>total test cases</span>
      </div>

      {/* Component area breakdown */}
      {areas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {areas.map(area => {
            const pct = total > 0 ? (area.count / total) * 100 : 0
            return (
              <div key={area.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: area.color, flexShrink: 0 }} />
                    <span style={{ color: DS.textSec, fontSize: 11 }}>{area.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ color: DS.text, fontSize: 12, fontWeight: 600 }}>{area.count.toLocaleString()}</span>
                    <span style={{ color: DS.textMuted, fontSize: 10 }}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ height: 4, background: DS.border, borderRadius: 2, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    style={{ height: '100%', background: area.color, borderRadius: 2 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Manual / Automated summary strip */}
      <div style={{ display: 'flex', gap: 14, paddingTop: 6, borderTop: `1px solid ${DS.border}` }}>
        {[
          { label: 'Manual',    count: manual,    color: '#BF2600' },
          { label: 'Automated', count: automated, color: '#0052CC' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: DS.textMuted, fontSize: 10 }}>
              {s.label}: <strong style={{ color: DS.textSec, fontWeight: 600 }}>{s.count.toLocaleString()}</strong>
            </span>
          </div>
        ))}
        {total > (manual + automated) && (
          <span style={{ color: DS.textMuted, fontSize: 10 }}>
            Other: <strong style={{ color: DS.textSec, fontWeight: 600 }}>{(total - manual - automated).toLocaleString()}</strong>
          </span>
        )}
      </div>
    </div>
  )
}

// ── Bug Distribution horizontal bars ──────────────────────────────────────────
function BugDistributionChart({ bugs }: { bugs: BugDistItem[] }) {
  const max = Math.max(...bugs.map(b => b.count), 1)
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bugs.map(bug => (
        <div key={bug.project}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: bug.color, flexShrink: 0 }} />
              <span style={{ color: DS.textSec, fontSize: 11, whiteSpace: 'nowrap' }}>{bug.label}</span>
            </div>
            <span style={{ color: DS.text, fontSize: 12, fontWeight: 600, marginLeft: 8 }}>{bug.count}</span>
          </div>
          <div style={{ height: 6, background: DS.border, borderRadius: 3, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(bug.count / max) * 100}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{ height: '100%', background: bug.color, borderRadius: 3 }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Execution Status Table ────────────────────────────────────────────────────
function ExecutionTable({ rows }: { rows: ExecRow[] }) {
  const cols: Array<{ key: keyof ExecRow; label: string; status: keyof typeof STATUS }> = [
    { key: 'pass',       label: 'Pass',     status: 'PASS'       },
    { key: 'fail',       label: 'Fail',     status: 'FAIL'       },
    { key: 'wip',        label: 'WIP',      status: 'WIP'        },
    { key: 'blocked',    label: 'Blocked',  status: 'BLOCKED'    },
    { key: 'unexecuted', label: 'Not Run',  status: 'UNEXECUTED' },
  ]

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${DS.border}` }}>
            <th style={{ padding: '8px 14px', textAlign: 'left', color: DS.textMuted, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
              Test Cycle
            </th>
            {cols.map(c => (
              <th key={c.key} style={{ padding: '8px 10px', textAlign: 'right', color: STATUS[c.status].color, fontWeight: 600, fontSize: 11 }}>
                {c.label}
              </th>
            ))}
            <th style={{ padding: '8px 10px', textAlign: 'right', color: DS.textMuted, fontWeight: 600, fontSize: 11 }}>Total</th>
            <th style={{ padding: '8px 14px', textAlign: 'right', color: DS.textMuted, fontWeight: 600, fontSize: 11 }}>Pass %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.cycle} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${DS.border}` : 'none' }}>
              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                  <span style={{ color: DS.text, fontWeight: 500 }}>{row.cycle}</span>
                </div>
              </td>
              {cols.map(c => (
                <td key={c.key} style={{ padding: '10px 10px', textAlign: 'right' }}>
                  <span style={{ color: (row[c.key] as number) > 0 ? STATUS[c.status].color : DS.textHint, fontWeight: (row[c.key] as number) > 0 ? 600 : 400 }}>
                    {(row[c.key] as number).toLocaleString()}
                  </span>
                </td>
              ))}
              <td style={{ padding: '10px 10px', textAlign: 'right', color: DS.textSec, fontWeight: 500 }}>
                {row.total.toLocaleString()}
              </td>
              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                  background: row.pass_rate >= 85 ? DS.greenBg : row.pass_rate >= 70 ? DS.amberBg : DS.redBg,
                  color:      row.pass_rate >= 85 ? DS.green   : row.pass_rate >= 70 ? DS.amber   : DS.red,
                  fontSize: 11, fontWeight: 700,
                }}>
                  {row.pass_rate.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (() => {
          const tot = {
            pass: rows.reduce((s, r) => s + r.pass, 0),
            fail: rows.reduce((s, r) => s + r.fail, 0),
            wip:  rows.reduce((s, r) => s + r.wip, 0),
            blocked: rows.reduce((s, r) => s + r.blocked, 0),
            unexecuted: rows.reduce((s, r) => s + r.unexecuted, 0),
            total: rows.reduce((s, r) => s + r.total, 0),
          }
          const overallPass = tot.total > 0 ? (tot.pass / tot.total * 100).toFixed(1) : '0.0'
          return (
            <tfoot>
              <tr style={{ borderTop: `1px solid ${DS.borderStrong}`, background: DS.surface }}>
                <td style={{ padding: '8px 14px', color: DS.textSec, fontWeight: 700, fontSize: 11 }}>TOTAL</td>
                {[tot.pass, tot.fail, tot.wip, tot.blocked, tot.unexecuted].map((v, i) => (
                  <td key={i} style={{ padding: '8px 10px', textAlign: 'right', color: DS.text, fontWeight: 700, fontSize: 12 }}>
                    {v.toLocaleString()}
                  </td>
                ))}
                <td style={{ padding: '8px 10px', textAlign: 'right', color: DS.text, fontWeight: 700, fontSize: 12 }}>
                  {tot.total.toLocaleString()}
                </td>
                <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: DS.blueBg, color: DS.blue, fontSize: 11, fontWeight: 700 }}>
                    {overallPass}%
                  </span>
                </td>
              </tr>
            </tfoot>
          )
        })()}
      </table>
    </div>
  )
}

// ── Execution bars chart ──────────────────────────────────────────────────────
function ExecutionBarsChart({ rows }: { rows: ExecRow[] }) {
  const statusKeys: Array<keyof typeof STATUS> = ['PASS', 'FAIL', 'BLOCKED', 'WIP', 'UNEXECUTED']
  const rowKeys: Record<keyof typeof STATUS, keyof ExecRow> = {
    PASS: 'pass', FAIL: 'fail', BLOCKED: 'blocked', WIP: 'wip', UNEXECUTED: 'unexecuted',
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(row => {
        const barTotal = row.total || 1
        return (
          <div key={row.cycle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                <span style={{ color: DS.text, fontSize: 11, fontWeight: 500 }}>{row.cycle}</span>
              </div>
              <span style={{ color: DS.textMuted, fontSize: 10 }}>{row.total.toLocaleString()} executions</span>
            </div>
            <div style={{ height: 14, borderRadius: 4, overflow: 'hidden', display: 'flex', background: DS.border }}>
              {statusKeys.map(sk => {
                const val = row[rowKeys[sk]] as number
                const pct = (val / barTotal) * 100
                if (pct < 0.1) return null
                return (
                  <motion.div
                    key={sk}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    title={`${STATUS[sk].label}: ${val}`}
                    style={{ height: '100%', background: STATUS[sk].color }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 4 }}>
        {statusKeys.map(sk => (
          <div key={sk} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS[sk].color }} />
            <span style={{ color: DS.textMuted, fontSize: 10 }}>{STATUS[sk].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bug priority chart ────────────────────────────────────────────────────────
function BugPriorityChart({ priorities, total }: { priorities: Record<string, number>; total: number }) {
  const PRIORITY_COLORS: Record<string, string> = {
    Blocker: '#CC3300', High: '#FF5630', Medium: '#FF8B00', Low: '#00875A', Minor: '#6554C0',
  }
  const entries = Object.entries(priorities).filter(([, v]) => v > 0)
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([priority, count]) => {
        const color = PRIORITY_COLORS[priority] || DS.blue
        const pct = (count / max) * 100
        return (
          <div key={priority}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ color: DS.textSec, fontSize: 11 }}>{priority}</span>
              </div>
              <span style={{ color: DS.text, fontSize: 12, fontWeight: 600 }}>{count}</span>
            </div>
            <div style={{ height: 5, background: DS.border, borderRadius: 2, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ height: '100%', background: color, borderRadius: 2 }}
              />
            </div>
          </div>
        )
      })}
      <p style={{ color: DS.textMuted, fontSize: 10, marginTop: 4 }}>
        Total open bugs: <strong style={{ color: DS.textSec }}>{total}</strong>
      </p>
    </div>
  )
}

// ── Status pill helper ────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  bug_logged:  { get color() { return pick('#C0330A', '#CC3300') }, get bg() { return pick('#C0330A18', '#CC330018') }, label: 'Bug'         },
  resolved:    { get color() { return pick('#1A7331', '#00875A') }, get bg() { return pick('#1A733118', '#00875A18') }, label: 'Resolved'    },
  in_progress: { get color() { return pick('#8A5E10', '#F2B000') }, get bg() { return pick('#8A5E1018', '#F2B00018') }, label: 'In Progress' },
  pending:     { get color() { return pick('#5E6573', '#8B929A') }, get bg() { return pick('#5E657318', '#8B929A18') }, label: 'Pending'     },
}

function StatusPill({ type, small }: { type: string; small?: boolean }) {
  const s = STATUS_STYLE[type] || STATUS_STYLE.pending
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '1px 6px' : '2px 7px',
      borderRadius: 6,
      background: s.bg,
      color: s.color,
      fontSize: small ? 9 : 10,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

function DealerChip({ name, confirmed }: { name: string; confirmed: boolean }) {
  const abbr: Record<string, string> = {
    'Merced Honda': 'MH', 'Toyota': 'TY', 'Nissan': 'NS', 'Highland Park': 'HP', 'Mike Burch': 'MB',
  }
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 5px',
      borderRadius: 4,
      background: confirmed ? pick('#1A733118', '#00875A18') : pick('#8A5E1018', '#F2B00018'),
      color: confirmed ? pick('#1A7331', '#00875A') : pick('#8A5E10', '#F2B000'),
      fontSize: 9,
      fontWeight: 700,
      border: `1px solid ${confirmed ? pick('#1A733130', '#00875A30') : pick('#8A5E1030', '#F2B00030')}`,
    }}>
      {abbr[name] ?? name.slice(0, 2).toUpperCase()}
    </span>
  )
}

// ── FindingsPanel ─────────────────────────────────────────────────────────────
function FindingsPanel({ data }: { data: FindingsAnalysis }) {
  const [tab, setTab] = useState<'obs' | 'blk'>('obs')
  const [expanded, setExpanded] = useState<string | null>(null)

  const obs = data.observations
  const blk = data.blockers

  const dominantStatus = (statuses: string[]) => {
    const order = ['bug_logged', 'in_progress', 'resolved', 'pending']
    return order.find(s => statuses.includes(s)) ?? 'pending'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Summary stat pills ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 14px', borderBottom: `1px solid ${DS.border}` }}>
        {[
          { label: 'Observations', value: obs.total,         color: DS.accent, bg: DS.accentBg },
          { label: 'Bugs Logged',  value: obs.stats.bug_logged,  color: pick('#C0330A', '#CC3300'), bg: pick('#C0330A18', '#CC330018') },
          { label: 'In Progress',  value: obs.stats.in_progress, color: pick('#8A5E10', '#F2B000'), bg: pick('#8A5E1018', '#F2B00018') },
          { label: 'Blockers',     value: blk.active_count,  color: pick('#A82C18', '#FF5630'), bg: pick('#A82C1818', '#FF563018') },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, background: s.bg }}>
            <div style={{ color: s.color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: s.color, fontSize: 9, marginTop: 2, opacity: 0.85 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', padding: '8px 14px 0', gap: 4 }}>
        {[
          { id: 'obs' as const, label: `Observations (${obs.total})` },
          { id: 'blk' as const, label: `Blockers · ${blk.active_count} active` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${tab === t.id ? DS.accent : DS.border}`,
              background: tab === t.id ? DS.accentBg : 'transparent',
              color: tab === t.id ? DS.accent : DS.textMuted,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: DS.font,
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Observations tab ────────────────────────────────────────────── */}
      {tab === 'obs' && (
        <div style={{ maxHeight: 230, overflowY: 'auto', padding: '8px 0' }}>
          {obs.by_workflow.map(group => {
            const isOpen = expanded === group.workflow
            const dom = dominantStatus(group.statuses)
            return (
              <div key={group.workflow} style={{ borderBottom: `1px solid ${DS.border}` }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : group.workflow)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px', background: 'transparent', border: 'none',
                    cursor: 'pointer', fontFamily: DS.font, textAlign: 'left',
                  }}
                >
                  {isOpen
                    ? <ChevronDown size={12} style={{ color: DS.textMuted, flexShrink: 0 }} />
                    : <ChevronRight size={12} style={{ color: DS.textMuted, flexShrink: 0 }} />
                  }
                  <span style={{ flex: 1, color: DS.text, fontSize: 11, fontWeight: 600 }}>{group.workflow}</span>
                  <span style={{
                    display: 'inline-block', padding: '1px 6px', borderRadius: 10,
                    background: DS.surface, color: DS.textSec, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${DS.border}`,
                  }}>
                    {group.count}
                  </span>
                  <StatusPill type={dom} small />
                </button>

                {isOpen && (
                  <div style={{ padding: '4px 14px 10px 30px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
                      {group.confirmed_dealers.map(d => <DealerChip key={d} name={d} confirmed />)}
                      {group.pending_dealers.map(d => <DealerChip key={d} name={d} confirmed={false} />)}
                    </div>
                    {group.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'flex-start' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: STATUS_STYLE[item.status]?.color ?? DS.textMuted, marginTop: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ color: DS.textSec, fontSize: 10, lineHeight: 1.4 }}>{item.description}</span>
                          {item.jira_ids.length > 0 && (
                            <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {item.jira_ids.map(id => (
                                <span key={id} style={{ color: '#0052CC', fontSize: 9, fontWeight: 600 }}>{id}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {group.count > group.items.length && (
                      <p style={{ color: DS.textHint, fontSize: 9, marginTop: 2 }}>
                        +{group.count - group.items.length} more items
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Blockers tab ────────────────────────────────────────────────── */}
      {tab === 'blk' && (
        <div style={{ maxHeight: 230, overflowY: 'auto' }}>
          {blk.active.map(item => (
            <div key={item.id} style={{ padding: '8px 14px', borderBottom: `1px solid ${DS.border}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                <AlertTriangle size={11} style={{ color: '#FF5630', flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: DS.text, fontSize: 11, fontWeight: 500, lineHeight: 1.3, flex: 1 }}>{item.description}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingLeft: 17 }}>
                <StatusPill type={item.status_type} small />
                <span style={{ color: DS.textHint, fontSize: 9 }}>{item.workflow}</span>
                {item.confirmed_dealers.map(d => <DealerChip key={d} name={d} confirmed />)}
                {item.jira_ids.map(id => (
                  <span key={id} style={{ color: '#0052CC', fontSize: 9, fontWeight: 600 }}>{id}</span>
                ))}
              </div>
            </div>
          ))}

          {blk.resolved.length > 0 && (
            <div style={{ padding: '6px 14px', background: DS.surface }}>
              <p style={{ color: DS.textMuted, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>
                RESOLVED ({blk.resolved_count})
              </p>
              {blk.resolved.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                  <CheckCircle2 size={10} style={{ color: '#00875A', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: DS.textMuted, fontSize: 10, lineHeight: 1.3 }}>{item.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer links ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderTop: `1px solid ${DS.border}` }}>
        {[
          { label: 'Observations ↗', url: data.obs_url, color: pick('#1A7331', '#00875A') },
          { label: 'Blockers ↗',     url: data.blk_url, color: pick('#A82C18', '#FF5630') },
        ].map(l => (
          <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
            style={{ color: l.color, fontSize: 10, fontWeight: 600, textDecoration: 'none', opacity: 0.8 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
          >
            {l.label}
          </a>
        ))}
        <span style={{ marginLeft: 'auto', color: DS.textHint, fontSize: 9 }}>
          Confluence · across T&amp;L dealers
        </span>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
const AUTO_REFRESH_SECS = 300 // 5 minutes

export function ServicesDashboard() {
  // Subscribe to theme changes so the theme-aware accent getters (DS / STATUS /
  // STATUS_STYLE) re-resolve and the dashboard repaints when light/dark toggles.
  useTheme()
  const [data, setData]         = useState<DashboardData>(SEED)
  const [findings, setFindings] = useState<FindingsAnalysis>(SEED_FINDINGS)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECS)
  const countdownRef = useRef(AUTO_REFRESH_SECS)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mainRes, findRes] = await Promise.all([
        fetch(getApiUrl('/api/mercury-dashboard')),
        fetch(getApiUrl('/api/mercury-dashboard/findings')),
      ])
      if (mainRes.ok) {
        const json: DashboardData = await mainRes.json()
        setData(json)
      }
      if (findRes.ok) {
        const fj: FindingsAnalysis = await findRes.json()
        setFindings(fj)
      }
      if (!mainRes.ok && !findRes.ok) throw new Error('Backend unreachable')
      setLastFetched(new Date())
      countdownRef.current = AUTO_REFRESH_SECS
      setCountdown(AUTO_REFRESH_SECS)
    } catch {
      setError('Could not reach the backend — showing last known snapshot.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Countdown ticker + auto-refresh
  useEffect(() => {
    const tick = setInterval(() => {
      countdownRef.current -= 1
      setCountdown(countdownRef.current)
      if (countdownRef.current <= 0) {
        fetchData()
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [fetchData])

  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Computed KPIs
  const totalTests = (data.focused_test_suite.total || 0) + (data.comprehensive_test_suite.total || 0)
  const totalExecs = data.execution_summary.reduce((s, r) => s + r.total, 0)
  const totalPass  = data.execution_summary.reduce((s, r) => s + r.pass, 0)
  const overallPassRate = totalExecs > 0 ? Math.round((totalPass / totalExecs) * 100) : 0
  const activeBlockers = findings.blockers.active_count

  const KPI_CARDS = [
    { label: 'Total Tests',      value: totalTests,        color: DS.accent, Icon: TestTube2,    suffix: '',
      info: 'Combined count of every test case across the Focused and Comprehensive suites for the MODDWTC (Modern Accounting) project — the sum of both suite totals.' },
    { label: 'Open Bugs',        value: data.bugs_total,   color: DS.red,    Icon: Bug,          suffix: '',
      info: 'Total open (unresolved) defects logged across all T&L modules — Accounts Payable, General Ledger, Accounts Receivable, Purchase Orders and Search & Navigation.' },
    { label: 'Total Executions', value: totalExecs,        color: DS.accent, Icon: BarChart3,    suffix: '',
      info: 'Total number of test-case executions recorded in Zephyr Scale across every dealer test cycle for the current version.' },
    { label: 'Overall Pass Rate',value: overallPassRate,   color: DS.green,  Icon: TrendingUp,   suffix: '%',
      info: 'Share of executed tests that passed across all dealer cycles — total Pass ÷ total Executions. Thresholds: green ≥ 85%, amber 70–84%, red < 70%.' },
    { label: 'Active Blockers',  value: activeBlockers,    color: DS.amber,  Icon: AlertTriangle, suffix: '',
      info: 'Unresolved blocking issues currently preventing testing or go-live across T&L dealers, pulled live from the Confluence blockers page.' },
  ]

  return (
    <DashboardLayout>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: DS.page }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: DS.font }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: DS.accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Project Mercury
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ color: DS.text, fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15, margin: 0 }}>
                  DMS Modern Enablement
                </h1>
                <InfoTooltip
                  align="left"
                  accent={DS.accent}
                  size={18}
                  text="DMS Modern Enablement dashboard — summarises QA status for Project Mercury (Modern Accounting / MODDWTC) across all T&L dealer environments. It combines Zephyr Scale test-execution data with live Confluence findings and auto-refreshes every 5 minutes. Hover the ⓘ on any card or KPI for details about that metric."
                />
              </div>
              <p style={{ color: DS.textMuted, fontSize: 13, margin: '4px 0 0' }}>
                Version: <strong style={{ color: DS.textSec }}>{data.version}</strong>&ensp;·&ensp;Project: <strong style={{ color: DS.textSec }}>{data.project}</strong>
                {lastFetched && <>&ensp;·&ensp;Updated {fmtDate(lastFetched)}</>}
              </p>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                background: DS.accentBg, color: DS.accent, border: `1px solid ${DS.accent}30`,
                borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
              }}>
                <LivePulse color={DS.accent} /> Live
                <span style={{ marginLeft: 2, background: `${DS.accent}20`, borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
                  Next refresh {fmtCountdown(Math.max(0, countdown))}
                </span>
              </span>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, flexShrink: 0,
                background: DS.card, border: `1px solid ${DS.border}`, color: DS.textSec,
                fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                fontFamily: DS.font, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {/* Refresh progress bar */}
          <div style={{ height: 2, background: DS.border, borderRadius: 1, marginTop: 14, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${(countdown / AUTO_REFRESH_SECS) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
              style={{ height: '100%', background: `linear-gradient(90deg, ${DS.accent}, ${DS.accent}88)`, borderRadius: 1 }}
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 10px', borderRadius: 6, background: DS.amberBg, border: `1px solid ${DS.amber}30` }}>
                <AlertCircle size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                <span style={{ color: 'var(--amber)', fontSize: 11 }}>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── KPI Summary Bar ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.05 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}
        >
          {KPI_CARDS.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
              whileHover={{ y: -3, boxShadow: `0 8px 28px ${kpi.color}28` }}
              style={{
                background: DS.card, border: `1px solid ${DS.border}`,
                borderRadius: 14, padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', color: DS.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {kpi.label}
                  <InfoTooltip text={kpi.info} accent={kpi.color} size={14} />
                </span>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `${kpi.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <kpi.Icon size={15} style={{ color: kpi.color }} />
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: DS.text, letterSpacing: '-0.04em', lineHeight: 1 }}>
                <AnimatedCounter target={kpi.value} />{kpi.suffix}
              </div>
              <div style={{ height: 3, background: DS.surface, borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: kpi.suffix === '%' ? `${kpi.value}%` : '100%' }}
                  transition={{ duration: 1, delay: 0.4 + i * 0.08, ease: 'easeOut' }}
                  style={{ height: '100%', background: kpi.color, borderRadius: 2 }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Row 1: Test Suites + Bug Distribution ────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}
        >
          <Card>
            <CardHeader icon={TestTube2} title="Focused Test Suite" subtitle="High-priority GL, AP, AR, and 1099 regression coverage" accent={DS.accent}
              info="High-priority regression coverage for the most critical GL, AP, AR and 1099 workflows. Broken down by accounting component area, with the manual vs automated split shown below." />
            <TestSuiteBreakdown {...data.focused_test_suite} />
          </Card>

          <Card>
            <CardHeader icon={Layers} title="Comprehensive Test Suite" subtitle="Full test coverage across all MODDWTC components" accent={DS.accent}
              info="Full end-to-end test coverage across every MODDWTC (Modern Accounting) component. Broken down by component area, with the manual vs automated split shown below." />
            <TestSuiteBreakdown {...data.comprehensive_test_suite} />
          </Card>

          <Card>
            <CardHeader icon={Bug} title="Bug Distribution by Module" subtitle={`${data.bugs_total} total open bugs across T&L scope`} accent={DS.red}
              info="Open defects grouped by Jira project / accounting module, highlighting which functional areas carry the most defects. Each bar's length is relative to the highest-count module." />
            <BugDistributionChart bugs={data.bugs_distribution} />
          </Card>
        </motion.div>

        {/* ── Row 2: Execution Summary Table + Findings + Priority ──────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28 }}
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}
        >
          <Card>
            <CardHeader icon={BarChart3} title="Execution Summary — All T&L Dealers" subtitle={`Version: ${data.version} · ${data.project}`} accent={DS.accent}
              info="Per-dealer test execution results for the current version. Columns: Pass (passed), Fail (failed), WIP (in progress), Blocked (blocked by an issue), Not Run (not yet executed), plus each cycle's pass rate. The TOTAL row aggregates all dealers." />
            <ExecutionTable rows={data.execution_summary} />
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <CardHeader icon={FileText} title="Findings" subtitle="Live analysis · Confluence T&L pages" accent={DS.accent}
                info="Live analysis of QA observations and blockers pulled from the Confluence T&L pages. Observations are grouped by workflow; blockers are split into active and resolved. Dealer chips show which dealers confirmed (green) or are pending (amber) each item." />
              <FindingsPanel data={findings} />
            </Card>

            <Card style={{ flex: 1 }}>
              <CardHeader icon={ShieldAlert} title="Bug Priority Breakdown" subtitle="Open bugs by severity across all T&L modules" accent={DS.amber}
                info="Open bugs grouped by severity — Blocker, High, Medium, Low and Minor — across all T&L modules. Each bar's length is relative to the highest-count priority." />
              <BugPriorityChart priorities={data.bug_priorities} total={data.bugs_total} />
            </Card>
          </div>
        </motion.div>

        {/* ── Row 3: Zephyr Execution Chart per cycle ──────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.38 }}
        >
          <Card>
            <CardHeader icon={TrendingUp} title="Zephyr Test Execution — by Cycle" subtitle={`Version: ${data.version} · test execution results grouped by dealer cycle`} accent={DS.accent}
              info="Stacked execution breakdown per dealer cycle, visualising the proportion of Pass / Fail / Blocked / WIP / Not Run for each. Sourced from Zephyr Scale for the current version. Hover a segment for its exact count." />
            <ExecutionBarsChart rows={data.execution_summary} />
          </Card>
        </motion.div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
          <LivePulse color={DS.accent} />
          <p style={{ color: DS.textHint, fontSize: 10, margin: 0 }}>
            Project Mercury · {data.project} · Zephyr Scale · CDK Global FalconX
          </p>
          <span style={{ marginLeft: 'auto', color: DS.textHint, fontSize: 10 }}>
            Auto-refreshes every 5 min · Next in {fmtCountdown(Math.max(0, countdown))}
          </span>
        </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
