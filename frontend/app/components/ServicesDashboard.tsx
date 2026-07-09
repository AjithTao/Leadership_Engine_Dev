'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DashboardLayout } from './DashboardLayout'
import {
  RefreshCw, ExternalLink, AlertCircle, CheckCircle2, XCircle,
  Clock, MinusCircle, Bug, TestTube2, BarChart3, FileText,
  TrendingUp, ShieldAlert, Layers, AlertTriangle, ChevronDown, ChevronRight,
  Activity, Zap, Target, PieChart, Info
} from 'lucide-react'
import { getApiUrl, fetchWithTimeout } from '../../lib/api-config'
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
  get accent()   { return pick('#816213', '#D4A847') },
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
  jql?: string
  columns?: MetricCell[]
}

interface MetricCell {
  label: string
  color?: string
  count: number
  jql?: string
}

interface TestSuiteData {
  total: number
  manual: number
  automated: number
  by_area?: TestAreaData[]
  columns?: MetricCell[]
  source_jql?: string
  gadget_id?: string
  chart_title?: string
}

interface BugDistItem {
  key: string
  label: string
  color: string
  count: number
  jql?: string
}

interface BugPriorityByProject {
  project: string
  label: string
  color: string
  total: number
  priorities: Record<string, number>
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
  focused_test_suite:        TestSuiteData
  comprehensive_test_suite:  TestSuiteData
  test_cases_distribution?:  TestSuiteData | null
  bugs_distribution:         BugDistItem[]
  bugs_distribution_total?:  number
  bugs_source_jql?:          string
  bug_priority_by_project:   BugPriorityByProject[]
  bug_priorities:            Record<string, number>
  priority_order?:           string[]
  bugs_total:                number
  execution_summary:         ExecRow[]
  execution_chart_summary?:  ExecRow[]
  version:                   string
  project:                   string
  jira_base_url?:            string
  findings: {
    observations_url: string
    blockers_url:     string
  }
  last_updated: string
}

interface AIInsight {
  gadget:   string
  headline: string
  insight:  string
  priority: 'high' | 'medium' | 'low'
  action:   string
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
    { key: 'M-Bug-MH',            label: 'Merced Honda',       color: '#0052CC', count: 35 },
    { key: 'M-Bug-Nissan',        label: 'Team Nissan Group',   color: '#00875A', count: 22 },
    { key: 'M-Bug-Highlandford',  label: 'Highland Park Ford',  color: '#FF5630', count: 18 },
    { key: 'M-Bug-Mikeburchford', label: 'Mike Burch Ford',     color: '#FF7A00', count: 15 },
    { key: 'M-Bug-Toyota',        label: 'Toyota of Glendora',  color: '#6554C0', count: 12 },
  ],
  bug_priority_by_project: [
    { project: 'APMODACC', label: 'Accounts Payable',    color: '#0052CC', total: 35,
      priorities: { Blocker: 0, High: 8, Medium: 20, Low: 6, Minor: 1 } },
    { project: 'GLMODACC', label: 'General Ledger',       color: '#00875A', total: 27,
      priorities: { Blocker: 0, High: 5, Medium: 17, Low: 4, Minor: 1 } },
    { project: 'ARMODACC', label: 'Accounts Receivable',  color: '#FF5630', total: 13,
      priorities: { Blocker: 0, High: 3, Medium: 7,  Low: 3, Minor: 0 } },
    { project: 'POMODACC', label: 'Purchase Orders',      color: '#FF8B00', total: 9,
      priorities: { Blocker: 0, High: 2, Medium: 5,  Low: 2, Minor: 0 } },
    { project: 'MODSRCH',  label: 'Search & Navigation',  color: '#6554C0', total: 5,
      priorities: { Blocker: 0, High: 0, Medium: 3,  Low: 2, Minor: 0 } },
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
  version:        'MOD ACCOUNTING UAT',
  project:        'MODDWTC',
  jira_base_url:  'https://projects.cdk.com',
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
// Column accent colours: Automated=blue, Manual=amber, everything else gets area colour
// Used only for column header labels and legend dots — not cell values
const COL_COLORS: Record<string, string> = {
  Automated: 'var(--accent-cool)',
  Manual:    'var(--text-secondary)',
}

function TestSuiteBreakdown({ manual, automated, total, by_area, columns: sourceColumns, source_jql }: TestSuiteData) {
  const areas = by_area?.filter(a => a.count > 0) ?? []
  const allColumns = sourceColumns?.length ? sourceColumns : by_area?.flatMap(a => a.columns ?? [])
    .reduce<MetricCell[]>((acc, cell) => {
      if (!acc.some(existing => existing.label === cell.label)) acc.push(cell)
      return acc
    }, []) ?? []
  const columns = allColumns.filter(c => c.label.toLowerCase() !== 'total')
  const totalTooltip = source_jql ? `Base JQL:\n${source_jql}` : undefined

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── 1. Detail table — TOP ─────────────────────────────────────────── */}
      {columns.length > 0 && areas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: '5px 8px', textAlign: 'left', color: DS.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${DS.border}`, whiteSpace: 'nowrap' }}>
                  Area
                </th>
                {columns.map(col => (
                  <th key={col.label} style={{ padding: '5px 8px', textAlign: 'right', color: COL_COLORS[col.label] ?? DS.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${DS.border}`, whiteSpace: 'nowrap' }}>
                    {col.label}
                  </th>
                ))}
                <th style={{ padding: '5px 8px', textAlign: 'right', color: DS.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${DS.border}` }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {areas.map((area, idx) => (
                <tr key={area.label} style={{ background: idx % 2 === 1 ? `color-mix(in srgb, ${DS.surface} 55%, transparent)` : 'transparent', borderBottom: `1px solid ${DS.border}` }}>
                  {/* Area name with colour dot */}
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: area.color, flexShrink: 0 }} />
                      <span style={{ color: DS.textSec, fontWeight: 500 }}>{area.label}</span>
                    </div>
                  </td>
                  {columns.map(col => {
                    const cell = area.columns?.find(c => c.label === col.label)
                    return (
                      <td key={col.label} title={cell?.jql} style={{ padding: '6px 8px', textAlign: 'right', color: DS.textSec, fontWeight: 500 }}>
                        {(cell?.count ?? 0).toLocaleString()}
                      </td>
                    )
                  })}
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: DS.text, fontWeight: 600 }}>
                    {columns.reduce((s, col) => s + (area.columns?.find(c => c.label === col.label)?.count ?? 0), 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 2. Automated / Manual totals — BOTTOM ───────────────────────── */}
      {(() => {
        // Sum each column directly from the table rows so footer always matches table
        const summaryItems = columns.length > 0
          ? columns.map(col => ({
              ...col,
              count: areas.reduce((s, a) => s + (a.columns?.find(c => c.label === col.label)?.count ?? 0), 0),
            }))
          : [
              { label: 'Automated', count: areas.reduce((s, a) => s + (a.columns?.find(c => c.label === 'Automated')?.count ?? 0), automated), color: 'var(--blue)'  },
              { label: 'Manual',    count: areas.reduce((s, a) => s + (a.columns?.find(c => c.label === 'Manual')?.count ?? 0), manual),    color: 'var(--amber)' },
            ]
        const derivedTotal = summaryItems.reduce((s, i) => s + i.count, 0)
        return (
          <div style={{ borderTop: `1px solid ${DS.border}`, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {summaryItems.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: COL_COLORS[s.label] ?? s.color ?? DS.blue, flexShrink: 0 }} />
                <span style={{ color: DS.textMuted, fontSize: 10 }}>
                  {s.label}: <strong style={{ color: DS.textSec, fontWeight: 600 }}>{s.count.toLocaleString()}</strong>
                </span>
              </div>
            ))}
            <span style={{ marginLeft: 'auto', color: DS.textMuted, fontSize: 10 }} title={totalTooltip}>
              Total: <strong style={{ color: DS.text, fontWeight: 700 }}>{derivedTotal.toLocaleString()}</strong>
              {source_jql ? ' ⓘ' : ''}
            </span>
          </div>
        )
      })()}
    </div>
  )
}

// ── Donut chart — single-dimension breakdown (e.g. Test Cases Distribution) ───
function TestCasesDonutChart({ data, jiraBase }: { data: TestSuiteData; jiraBase?: string }) {
  const areas = (data.by_area ?? []).filter(a => a.count > 0)
  const total = data.total || areas.reduce((s, a) => s + a.count, 0) || 1
  const base = jiraBase ?? 'https://projects.cdk.com'
  const [hovered, setHovered] = useState<string | null>(null)

  const openJql = (jql?: string) => {
    if (!jql) return
    window.open(`${base}/issues/?jql=${encodeURIComponent(jql)}`, '_blank', 'noopener,noreferrer')
  }

  if (areas.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: DS.textMuted, fontSize: 11 }}>
        No test case data available
      </div>
    )
  }

  const radius = 58
  const strokeWidth = 24
  const circumference = 2 * Math.PI * radius
  let offsetAccum = 0
  const hoveredArea = areas.find(a => a.label === hovered)

  return (
    <div style={{ padding: '14px 16px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* SVG Donut */}
      <div style={{ position: 'relative', width: 152, height: 152, flexShrink: 0 }}>
        <svg width={152} height={152} viewBox="0 0 152 152">
          <g transform="rotate(-90 76 76)">
            <circle cx={76} cy={76} r={radius} fill="none" stroke={DS.border} strokeWidth={strokeWidth} />
            {areas.map(area => {
              const pct = area.count / total
              const segLen = pct * circumference
              const dashArray = `${segLen} ${circumference - segLen}`
              const dashOffset = -offsetAccum
              offsetAccum += segLen
              const isHovered = hovered === area.label
              return (
                <circle
                  key={area.label}
                  cx={76} cy={76} r={radius} fill="none"
                  stroke={area.color}
                  strokeWidth={isHovered ? strokeWidth + 5 : strokeWidth}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  onMouseEnter={() => setHovered(area.label)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => openJql(area.jql)}
                  style={{
                    cursor: area.jql ? 'pointer' : 'default',
                    opacity: hovered && !isHovered ? 0.35 : 0.95,
                    transition: 'opacity 0.15s, stroke-width 0.15s',
                  }}
                >
                  <title>{`${area.label}: ${area.count} (${Math.round(pct * 100)}%)`}</title>
                </circle>
              )
            })}
          </g>
        </svg>
        {/* Center label */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ color: DS.text, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>
            {(hoveredArea ? hoveredArea.count : total).toLocaleString()}
          </span>
          <span style={{ color: DS.textMuted, fontSize: 9, marginTop: 3, textAlign: 'center', maxWidth: 90, lineHeight: 1.2 }}>
            {hoveredArea ? hoveredArea.label : 'Total Cases'}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {areas.map(area => {
          const pct = Math.round((area.count / total) * 100)
          return (
            <div
              key={area.label}
              onMouseEnter={() => setHovered(area.label)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => openJql(area.jql)}
              title={area.jql ? `Open in Jira: ${area.label}` : area.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 6,
                cursor: area.jql ? 'pointer' : 'default',
                background: hovered === area.label ? DS.surface : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 2, background: area.color, flexShrink: 0 }} />
              <span style={{ color: DS.textSec, fontSize: 11, flex: 1 }}>{area.label}</span>
              <span style={{ color: DS.textMuted, fontSize: 10 }}>{pct}%</span>
              <span style={{ color: DS.text, fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{area.count.toLocaleString()}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Bug Distribution horizontal bars ──────────────────────────────────────────
function BugDistributionChart({ bugs, total, sourceJql, jiraBase }: {
  bugs: BugDistItem[]
  total?: number
  sourceJql?: string
  jiraBase?: string
}) {
  const max = Math.max(...bugs.map(b => b.count), 1)
  const base = jiraBase ?? 'https://projects.cdk.com'

  const openJql = (jql?: string) => {
    if (!jql) return
    window.open(`${base}/issues/?jql=${encodeURIComponent(jql)}`, '_blank', 'noopener,noreferrer')
  }

  const totalTooltip = sourceJql ? `Click to open in Jira\nJQL: ${sourceJql}` : 'Total unique bugs'

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Total row */}
      {total !== undefined && (
        <div
          onClick={() => openJql(sourceJql)}
          title={totalTooltip}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingBottom: 8, marginBottom: 2, borderBottom: `1px solid ${DS.border}`,
            cursor: sourceJql ? 'pointer' : 'default',
          }}
        >
          <span style={{ color: DS.textMuted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total unique bugs {sourceJql ? '↗' : 'ⓘ'}
          </span>
          <span style={{ color: DS.text, fontSize: 15, fontWeight: 700 }}>{total}</span>
        </div>
      )}

      {bugs.map(bug => {
        const pct = total && total > 0 ? Math.round((bug.count / total) * 100) : null
        const hasLink = !!bug.jql
        return (
          <motion.div
            key={bug.key}
            onClick={() => openJql(bug.jql)}
            title={hasLink ? `Open in Jira: ${bug.label}` : bug.label}
            whileHover={hasLink ? { x: 2 } : {}}
            style={{ cursor: hasLink ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: bug.color, flexShrink: 0 }} />
                <span style={{ color: DS.textSec, fontSize: 11, whiteSpace: 'nowrap' }}>{bug.label}</span>
                {hasLink && <ExternalLink size={9} style={{ color: DS.textHint, flexShrink: 0 }} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                {pct !== null && (
                  <span style={{ color: DS.textMuted, fontSize: 10 }}>{pct}%</span>
                )}
                <span style={{ color: DS.text, fontSize: 12, fontWeight: 600 }}>{bug.count}</span>
              </div>
            </div>
            <div style={{ height: 5, background: DS.border, borderRadius: 3, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(bug.count / max) * 100}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ height: '100%', background: bug.color, borderRadius: 3, opacity: 0.6 }}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Execution Status Table ────────────────────────────────────────────────────
function ExecutionTable({ rows, jiraBase, project }: { rows: ExecRow[]; jiraBase?: string; project?: string }) {
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
                  {jiraBase && (
                    <a
                      href={`${jiraBase}/issues/?jql=${encodeURIComponent(`project in (${project || 'MODDWTC'}) AND issuetype = Test AND "Test Cycle" ~ "${row.cycle.replace(/"/g, '\\"')}"`)}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Open in Jira"
                      style={{ color: DS.textHint, lineHeight: 0, flexShrink: 0 }}
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}
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
                  background: row.pass_rate >= 85 ? DS.accentBg : row.pass_rate >= 70 ? DS.amberBg : DS.redBg,
                  color:      row.pass_rate >= 85 ? DS.accent   : row.pass_rate >= 70 ? DS.amber   : DS.red,
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
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: DS.accentBg, color: DS.accent, fontSize: 11, fontWeight: 700 }}>
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

// ── Bug Priority by Project (stacked horizontal bars) ────────────────────────
// Theme-aware (pick pattern, see DS above): these hexes render as TEXT (and as
// `${color}18` tints) in the matrix — dark AA-on-light hues for the light theme,
// bright 400-weight hues readable on #1E2028 for the dark theme.
const PRIORITY_COLORS: Record<string, string> = {
  get Blocker()  { return pick('#9B1C1C', '#F87171') },
  get Highest()  { return pick('#92400E', '#FB923C') },
  get High()     { return pick('#78350F', '#FBBF24') },
  get Medium()   { return pick('#854D0E', '#FCD34D') },
  get Normal()   { return pick('#1E40AF', '#60A5FA') },
  get Low()      { return pick('#166534', '#4ADE80') },
  get Lowest()   { return pick('#5B21B6', '#A78BFA') },
  get Minor()    { return pick('#4B5563', '#9CA3AF') },
}
const PRIORITY_ORDER = ['Blocker', 'Highest', 'High', 'Medium', 'Normal', 'Low', 'Lowest', 'Minor']
const FALLBACK_SERIES_COLORS: Array<[light: string, dark: string]> = [
  ['#1E3A5F', '#60A5FA'], ['#14532D', '#34D399'], ['#78350F', '#FBBF24'], ['#3B0764', '#C084FC'],
  ['#7F1D1D', '#F87171'], ['#164E63', '#22D3EE'], ['#374151', '#9CA3AF'], ['#5C0A00', '#FCA5A5'],
]
const paletteColor = (index: number) => {
  const [light, dark] = FALLBACK_SERIES_COLORS[Math.abs(index) % FALLBACK_SERIES_COLORS.length]
  return pick(light, dark)
}

function BugPriorityByProjectChart({ items = [], total, priorityOrder }: { items?: BugPriorityByProject[]; total: number; priorityOrder?: string[] }) {
  const activeItems = items.filter(item => item.total > 0)
  const liveOrder = priorityOrder?.length
    ? priorityOrder
    : Array.from(new Set(items.flatMap(item => Object.keys(item.priorities ?? {}))))
  const order = liveOrder.length ? liveOrder : PRIORITY_ORDER
  const usedPriorities = order.filter(p => activeItems.some(item => (item.priorities[p] ?? 0) > 0))

  const cellStyle = (count: number, p: string, idx: number): React.CSSProperties => {
    if (count === 0) return { color: DS.textMuted, opacity: 0.35 }
    const color = PRIORITY_COLORS[p] ?? paletteColor(idx)
    return {
      color,
      fontWeight: 700,
      background: color + '18',
      borderRadius: 4,
    }
  }

  return (
    <div style={{ padding: '4px 0 8px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${DS.border}` }}>
            <th style={{ padding: '6px 14px 6px 16px', textAlign: 'left', color: DS.textMuted, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', minWidth: 160 }}>
              Module
            </th>
            {usedPriorities.map((p, i) => (
              <th key={p} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', color: PRIORITY_COLORS[p] ?? paletteColor(i) }}>
                {p}
              </th>
            ))}
            <th style={{ padding: '6px 16px 6px 10px', textAlign: 'right', color: DS.textMuted, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {activeItems.map((item, rowIdx) => (
            <tr
              key={item.project}
              style={{ borderBottom: `1px solid ${DS.border}`, background: rowIdx % 2 === 0 ? 'transparent' : `color-mix(in srgb, ${DS.surface} 55%, transparent)` }}
            >
              <td style={{ padding: '7px 14px 7px 16px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                  <span style={{ color: DS.textSec, fontSize: 11, fontWeight: 500 }}>{item.label}</span>
                </div>
              </td>
              {usedPriorities.map((p, i) => {
                const count = item.priorities[p] ?? 0
                return (
                  <td key={p} style={{ padding: '7px 10px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', minWidth: 22, padding: '1px 5px', fontSize: 11, ...cellStyle(count, p, i) }}>
                      {count === 0 ? '–' : count}
                    </span>
                  </td>
                )
              })}
              <td style={{ padding: '7px 16px 7px 10px', textAlign: 'right' }}>
                <span style={{ color: DS.text, fontSize: 12, fontWeight: 700 }}>{item.total}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${DS.border}` }}>
            <td style={{ padding: '6px 14px 4px 16px', color: DS.textMuted, fontSize: 10, fontWeight: 600 }}>Total open bugs</td>
            {usedPriorities.map(p => {
              const colTotal = activeItems.reduce((s, item) => s + (item.priorities[p] ?? 0), 0)
              return (
                <td key={p} style={{ padding: '6px 10px 4px', textAlign: 'center', color: DS.textMuted, fontSize: 10, fontWeight: 600 }}>
                  {colTotal || '–'}
                </td>
              )
            })}
            <td style={{ padding: '6px 16px 4px 10px', textAlign: 'right', color: DS.text, fontSize: 12, fontWeight: 700 }}>{total}</td>
          </tr>
        </tfoot>
      </table>
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
function JiraLink({ id, jiraBase }: { id: string; jiraBase: string }) {
  return (
    <a
      href={`${jiraBase}/browse/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--blue)', fontSize: 9, fontWeight: 700,
        textDecoration: 'none', borderRadius: 3, padding: '1px 4px',
        background: 'var(--blue-bg)', border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)',
        display: 'inline-flex', alignItems: 'center', gap: 2,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {id} <ExternalLink size={7} />
    </a>
  )
}

function FindingsPanel({ data, jiraBase }: { data: FindingsAnalysis; jiraBase?: string }) {
  const base = jiraBase ?? 'https://projects.cdk.com'
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
          { label: 'Observations', value: obs.total,               color: DS.accent,                          bg: DS.accentBg                           },
          { label: 'Bugs Logged',  value: obs.stats.bug_logged,   color: pick('#C0330A', '#CC3300'),         bg: pick('#C0330A18', '#CC330018')         },
          { label: 'In Progress',  value: obs.stats.in_progress,  color: pick('#8A5E10', '#F2B000'),         bg: pick('#8A5E1018', '#F2B00018')         },
          { label: 'Blockers',     value: blk.active_count,       color: pick('#A82C18', '#FF5630'),         bg: pick('#A82C1818', '#FF563018')         },
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
                            <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {item.jira_ids.map(id => (
                                <JiraLink key={id} id={id} jiraBase={base} />
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
                <AlertTriangle size={11} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: DS.text, fontSize: 11, fontWeight: 500, lineHeight: 1.3, flex: 1 }}>{item.description}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingLeft: 17 }}>
                <StatusPill type={item.status_type} small />
                <span style={{ color: DS.textHint, fontSize: 9 }}>{item.workflow}</span>
                {item.confirmed_dealers.map(d => <DealerChip key={d} name={d} confirmed />)}
                {item.jira_ids.map(id => (
                  <JiraLink key={id} id={id} jiraBase={base} />
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
                  <CheckCircle2 size={10} style={{ color: 'var(--accent-cool)', flexShrink: 0, marginTop: 1 }} />
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

// ── AI Insights Panel ─────────────────────────────────────────────────────────
const GADGET_ICONS: Record<string, React.ElementType> = {
  bug_distribution: Bug,
  bug_priority:     ShieldAlert,
  test_coverage:    TestTube2,
  execution:        BarChart3,
  findings:         FileText,
  overview:         TrendingUp,
  automation_gap:   Zap,
  top_risk:         AlertTriangle,
  quick_win:        Target,
}

const PRIORITY_BADGE: Record<string, { color: string; bg: string }> = {
  high:   { color: 'var(--red)',         bg: 'var(--red-bg)'         },
  medium: { color: 'var(--amber)',       bg: 'var(--amber-bg)'       },
  low:    { color: 'var(--accent-cool)', bg: 'var(--accent-cool-bg)' },
}

// True once a payload carries real dashboard data (the dashboard mounts with
// EMPTY_DASHBOARD — all zeros / empty arrays — until the first fetch lands).
const hasRealData = (v: unknown): boolean => {
  if (typeof v === 'number') return v !== 0
  if (Array.isArray(v)) return v.length > 0
  if (v && typeof v === 'object') return Object.values(v).some(hasRealData)
  return false
}

function AIInsightsPanel({
  apiPath,
  payload,
  label = 'AI Insights',
}: {
  apiPath: string
  payload: Record<string, unknown>
  label?: string
}) {
  const [insights,  setInsights]  = useState<AIInsight[]>([])
  const [loading,   setLoading]   = useState(false)
  const [open,      setOpen]      = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  // Signature of the payload last sent for analysis (set at fetch time), so a
  // re-expand after the dashboard data changed (initial load / 5-min refresh)
  // triggers a fresh analysis instead of showing stale insights forever.
  const fetchedSignature = useRef<string | null>(null)
  const inFlight = useRef(false)
  const mounted  = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const payloadSignature = JSON.stringify(payload)
  const payloadEmpty = !hasRealData(payload)

  const fetchInsights = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    fetchedSignature.current = payloadSignature
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(getApiUrl(apiPath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadSignature,
      }, 60000)
      if (!res.ok) {
        const raw = await res.text()
        let msg = raw
        try {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.detail != null) {
            msg = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
          }
        } catch { /* not JSON — fall through to truncated raw text */ }
        if (msg.length > 200) msg = msg.slice(0, 200) + '…'
        throw new Error(msg || `Request failed (HTTP ${res.status})`)
      }
      const json = await res.json()
      if (!mounted.current) return
      setInsights(json.insights ?? [])
      setFetchedAt(json.generated_at ?? null)
    } catch (e) {
      if (!mounted.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [apiPath, payloadSignature])

  const handleOpen = () => setOpen(o => !o)

  // Fetch whenever the panel is open with real data whose signature differs from
  // the last analysed one — covers first expand, dashboard data arriving after
  // the EMPTY_DASHBOARD placeholder, and the 5-minute auto-refresh.
  useEffect(() => {
    if (!open || payloadEmpty || inFlight.current) return
    if (fetchedSignature.current === payloadSignature) return
    fetchInsights()
  }, [open, payloadEmpty, payloadSignature, fetchInsights])

  return (
    <div style={{ borderTop: `1px solid ${DS.border}` }}>
      {/* Toggle strip */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: DS.font, textAlign: 'left',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: 6,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          flexShrink: 0,
        }}>
          <Zap size={11} style={{ color: '#fff' }} />
        </div>
        <span style={{ color: DS.textSec, fontSize: 11, fontWeight: 600, flex: 1 }}>
          {label}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
          background: 'rgba(99,102,241,0.12)', color: pick('#4F46E5', '#A5B4FC'),
        }}>
          Falcon Insights
        </span>
        {open
          ? <ChevronDown  size={12} style={{ color: DS.textMuted }} />
          : <ChevronRight size={12} style={{ color: DS.textMuted }} />
        }
      </button>

      {/* Insights content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 12px 12px' }}>
              {!loading && !error && payloadEmpty && insights.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px' }}>
                  <Info size={12} style={{ color: DS.textMuted, flexShrink: 0 }} />
                  <span style={{ color: DS.textMuted, fontSize: 10 }}>Waiting for dashboard data…</span>
                </div>
              )}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    style={{ width: 14, height: 14, border: `2px solid ${DS.border}`, borderTopColor: '#6366f1', borderRadius: '50%' }}
                  />
                  <span style={{ color: DS.textMuted, fontSize: 11 }}>Analysing with Falcon Insights…</span>
                </div>
              )}

              {error && !loading && (
                <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} style={{ color: DS.amber, flexShrink: 0 }} />
                  <span style={{ color: DS.amber, fontSize: 10 }}>{error}</span>
                  <button onClick={fetchInsights} style={{ marginLeft: 'auto', color: DS.textMuted, fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Retry
                  </button>
                </div>
              )}

              {!loading && insights.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {insights.map((ins, i) => {
                    const Icon   = GADGET_ICONS[ins.gadget] ?? Activity
                    const badge  = PRIORITY_BADGE[ins.priority] ?? PRIORITY_BADGE.low
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        style={{
                          background: DS.surface,
                          border: `1px solid ${DS.border}`,
                          borderRadius: 8,
                          padding: '10px 12px',
                          borderLeft: `3px solid ${badge.color}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Icon size={11} style={{ color: badge.color, flexShrink: 0 }} />
                          <span style={{ color: DS.text, fontSize: 11, fontWeight: 700, flex: 1 }}>{ins.headline}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: badge.bg, color: badge.color, flexShrink: 0, textTransform: 'capitalize' }}>
                            {ins.priority}
                          </span>
                        </div>
                        <p style={{ color: DS.textSec, fontSize: 10, lineHeight: 1.5, margin: 0, marginBottom: 4 }}>{ins.insight}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: DS.textHint, fontSize: 9 }}>→</span>
                          <span style={{ color: DS.textMuted, fontSize: 9, fontWeight: 600, fontStyle: 'italic' }}>{ins.action}</span>
                        </div>
                      </motion.div>
                    )
                  })}
                  {fetchedAt && (
                    <p style={{ color: DS.textHint, fontSize: 9, textAlign: 'right', margin: 0 }}>
                      Generated {new Date(fetchedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Section divider label ────────────────────────────────────────────────────
function SectionLabel({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 -4px' }}>
      {Icon && <Icon size={12} style={{ color: DS.textMuted }} />}
      <span style={{
        color: DS.textMuted, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: DS.border }} />
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
const AUTO_REFRESH_SECS = 300 // 5 minutes

const EMPTY_DASHBOARD: DashboardData = {
  focused_test_suite: { total: 0, manual: 0, automated: 0, by_area: [], columns: [] },
  comprehensive_test_suite: { total: 0, manual: 0, automated: 0, by_area: [], columns: [] },
  bugs_distribution: [],
  bug_priority_by_project: [],
  bug_priorities: {},
  priority_order: [],
  bugs_total: 0,
  execution_summary: [],
  execution_chart_summary: [],
  version: '',
  project: '',
  jira_base_url: 'https://projects.cdk.com',
  findings: {
    observations_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140070',
    blockers_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140072',
  },
  last_updated: '',
}

const EMPTY_FINDINGS: FindingsAnalysis = {
  obs_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140070',
  blk_url: 'https://confluence.cdk.com/pages/viewpage.action?pageId=502140072',
  last_fetched: '',
  observations: {
    total: 0,
    stats: { bug_logged: 0, resolved: 0, in_progress: 0, pending: 0 },
    by_workflow: [],
  },
  blockers: {
    total: 0,
    active_count: 0,
    resolved_count: 0,
    active: [],
    resolved: [],
  },
}

export function ServicesDashboard() {
  // Subscribe to theme changes so the theme-aware accent getters (DS / STATUS /
  // STATUS_STYLE) re-resolve and the dashboard repaints when light/dark toggles.
  useTheme()
  const [data, setData]         = useState<DashboardData>(EMPTY_DASHBOARD)
  const [findings, setFindings] = useState<FindingsAnalysis>(EMPTY_FINDINGS)
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
      setError('Could not reach the live dashboard data source.')
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
              whileHover={{ y: -2, boxShadow: 'var(--shadow-medium)' }}
              style={{
                background: DS.card, border: `1px solid ${DS.border}`,
                borderRadius: 14, padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', color: DS.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {kpi.label}
                  <InfoTooltip text={kpi.info ?? ''} accent={kpi.color} size={14} />
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

        {/* ── Section: Test Coverage ───────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.16 }}>
          <SectionLabel label="Test Coverage" icon={TestTube2} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'stretch' }}
        >
          <Card>
            <CardHeader
              icon={Zap}
              title={data.focused_test_suite.chart_title || 'Focused Test Suite'}
              subtitle="High-priority regression — GL, AP, AR, 1099 (version-scoped)"
              accent={DS.accent}
              info="High-priority regression coverage for the most critical GL, AP, AR and 1099 workflows. Broken down by accounting component area, with the manual vs automated split shown below."
            />
            <TestSuiteBreakdown {...data.focused_test_suite} />
          </Card>

          <Card>
            <CardHeader
              icon={Layers}
              title={data.comprehensive_test_suite.chart_title || 'Comprehensive Test Suite'}
              subtitle="Full coverage across all MODDWTC components (all versions)"
              accent={DS.accent}
              info="Full end-to-end test coverage across every MODDWTC (Modern Accounting) component. Broken down by component area, with the manual vs automated split shown below."
            />
            <TestSuiteBreakdown {...data.comprehensive_test_suite} />
          </Card>

          {data.test_cases_distribution && (
            <Card>
              <CardHeader
                icon={PieChart}
                title={data.test_cases_distribution.chart_title || 'Test Cases Distribution'}
                subtitle="Test case spread across functional components · click a slice to open in Jira"
                accent={DS.amber}
              />
              <TestCasesDonutChart data={data.test_cases_distribution} jiraBase={data.jira_base_url} />
            </Card>
          )}
        </motion.div>

        {/* ── Section: Bug Intelligence ────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.24 }}>
          <SectionLabel label="Bug Intelligence" icon={Bug} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.26 }}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Card>
              <CardHeader
                icon={Bug}
                title="Bugs distribution across T&L boxes"
                subtitle="Click any row to open in Jira"
                accent={DS.red}
              />
              <BugDistributionChart
                bugs={data.bugs_distribution ?? []}
                total={data.bugs_distribution_total ?? data.bugs_total}
                sourceJql={data.bugs_source_jql}
                jiraBase={data.jira_base_url}
              />
            </Card>
            <AIInsightsPanel
              apiPath="/api/mercury-dashboard/ai-insights"
              payload={{
                bugs_distribution: data.bugs_distribution,
                bugs_total: data.bugs_distribution_total ?? data.bugs_total,
                bugs_source_jql: data.bugs_source_jql,
              }}
              label="AI: Bug Distribution Insight"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Card>
              <CardHeader
                icon={ShieldAlert}
                title="Bug Priority — by Module"
                subtitle="Open bugs per module with severity breakdown"
                accent={DS.amber}
              />
              <BugPriorityByProjectChart items={data.bug_priority_by_project} total={data.bugs_total} priorityOrder={data.priority_order} />
            </Card>
            <AIInsightsPanel
              apiPath="/api/mercury-dashboard/ai-insights"
              payload={{
                bug_priority_by_project: data.bug_priority_by_project,
                bug_priorities: data.bug_priorities,
                priority_order: data.priority_order,
                bugs_total: data.bugs_total,
              }}
              label="AI: Priority Risk Analysis"
            />
          </div>
        </motion.div>

        {/* ── Section: Execution Performance ──────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.32 }}>
          <SectionLabel label="Execution Performance" icon={BarChart3} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.34 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <Card>
            <CardHeader
              icon={BarChart3}
              title="Test Execution Summary — All T&L Dealers"
              subtitle={`${data.version} · ${data.project} · Pass / Fail / WIP / Blocked / Not Run per dealer cycle`}
              accent={DS.accent}
            />
            <ExecutionTable rows={data.execution_summary} jiraBase={data.jira_base_url} project={data.project} />
          </Card>
          <AIInsightsPanel
            apiPath="/api/mercury-dashboard/ai-insights"
            payload={{
              execution_summary: data.execution_summary,
              version: data.version,
              project: data.project,
            }}
            label="AI: Execution Performance Insight"
          />
        </motion.div>

        {/* ── Section: Insights & Execution Trends ────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.40 }}>
          <SectionLabel label="Insights & Execution Trends" icon={TrendingUp} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.42 }}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'stretch' }}
        >
          <Card>
            <CardHeader
              icon={TrendingUp}
              title="Zephyr Test Execution Chart"
              subtitle="All active test cycles · sorted by cycle order"
              accent={DS.blue}
            />
            <ExecutionBarsChart rows={data.execution_summary} />
          </Card>

          <Card>
            <CardHeader icon={FileText} title="Findings — Observations & Blockers" subtitle="Click Jira IDs to open tickets · Confluence links below" accent="var(--amber)" />
            <FindingsPanel data={findings} jiraBase={data.jira_base_url} />
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
