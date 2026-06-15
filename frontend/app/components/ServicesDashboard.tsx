'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from './ui/scroll-area'
import {
  RefreshCw, ExternalLink, AlertCircle, CheckCircle2, XCircle,
  Clock, MinusCircle, Bug, TestTube2, BarChart3, FileText,
  TrendingUp, ShieldAlert, Layers, AlertTriangle, ChevronDown, ChevronRight,
  Activity, Zap, Target
} from 'lucide-react'
import { getApiUrl } from '../../lib/api-config'

// ── Design tokens — mirrors the globals.css variable structure ─────────────────
const DS = {
  page:         'var(--bg-page)',
  card:         'var(--bg-card)',
  surface:      'var(--bg-surface)',
  hover:        'var(--bg-hover)',
  border:       'var(--border)',
  borderStrong: 'var(--border-strong)',
  text:         'var(--text-primary)',
  textSec:      'var(--text-secondary)',
  textMuted:    'var(--text-muted)',
  textHint:     'var(--text-hint)',
  // Primary brand accent (mustard gold — same as insights page)
  accent:       'var(--accent-cool)',
  accentBg:     'var(--accent-cool-bg)',
  // Semantic colours (direct hex in CSS, so +hex-alpha suffix pattern works)
  amber:        'var(--amber)',
  amberBg:      'var(--amber-bg)',
  red:          'var(--red)',
  redBg:        'var(--red-bg)',
  blue:         'var(--blue)',
  blueBg:       'var(--blue-bg)',
  font:         "'Plus Jakarta Sans', system-ui, sans-serif",
} as const

// ── Zephyr execution status colours — aligned to theme semantic palette ────────
const STATUS = {
  PASS:        { color: 'var(--accent-cool)', bg: 'var(--accent-cool-bg)', label: 'Pass',    icon: CheckCircle2 },
  FAIL:        { color: 'var(--red)',          bg: 'var(--red-bg)',         label: 'Fail',    icon: XCircle      },
  WIP:         { color: 'var(--amber)',        bg: 'var(--amber-bg)',       label: 'WIP',     icon: Clock        },
  BLOCKED:     { color: 'var(--blue)',         bg: 'var(--blue-bg)',        label: 'Blocked', icon: MinusCircle  },
  UNEXECUTED:  { color: 'var(--text-muted)',   bg: 'var(--bg-surface)',     label: 'Not Run', icon: MinusCircle  },
} as const

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
function LivePulse({ color = 'var(--accent-cool)' }: { color?: string }) {
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
        background: DS.card, border: `1px solid ${DS.border}`, borderRadius: 12, ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

function CardHeader({ icon: Icon, title, subtitle, accent = 'var(--accent-cool)' }: {
  icon: React.ElementType; title: string; subtitle?: string; accent?: string
}) {
  return (
    <div style={{
      padding: '11px 16px',
      borderBottom: `1px solid ${DS.border}`,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      borderTop: `3px solid ${accent}`,
      borderRadius: '12px 12px 0 0',
    }}>
      {/* Icon badge — uses hex-alpha suffix trick; works because all theme semantic vars are direct hex */}
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: accent + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={13} style={{ color: accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: DS.text, fontSize: 12, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{title}</p>
        {subtitle && (
          <p style={{ color: DS.textMuted, fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </p>
        )}
      </div>
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
                <tr key={area.label} style={{ background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: `1px solid ${DS.border}` }}>
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
function ExecutionTable({ rows, jiraBase }: { rows: ExecRow[]; jiraBase?: string }) {
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
                      href={`${jiraBase}/issues/?jql=${encodeURIComponent(`project in (MODDWTC) AND issuetype = Test AND "Test Cycle" ~ "${row.cycle}"`)}`}
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
const PRIORITY_COLORS: Record<string, string> = {
  Blocker:  '#9B1C1C',
  Highest:  '#92400E',
  High:     '#78350F',
  Medium:   '#854D0E',
  Normal:   '#1E40AF',
  Low:      '#166534',
  Lowest:   '#5B21B6',
  Minor:    '#4B5563',
}
const PRIORITY_ORDER = ['Blocker', 'Highest', 'High', 'Medium', 'Normal', 'Low', 'Lowest', 'Minor']
const FALLBACK_SERIES_COLORS = ['#1E3A5F', '#14532D', '#78350F', '#3B0764', '#7F1D1D', '#164E63', '#374151', '#5C0A00']
const paletteColor = (index: number) => FALLBACK_SERIES_COLORS[Math.abs(index) % FALLBACK_SERIES_COLORS.length]

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
              style={{ borderBottom: `1px solid ${DS.border}`, background: rowIdx % 2 === 0 ? 'transparent' : DS.bg + '55' }}
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
  bug_logged:  { color: 'var(--red)',          bg: 'var(--red-bg)',         label: 'Bug'         },
  resolved:    { color: 'var(--accent-cool)',  bg: 'var(--accent-cool-bg)', label: 'Resolved'    },
  in_progress: { color: 'var(--amber)',        bg: 'var(--amber-bg)',       label: 'In Progress' },
  pending:     { color: 'var(--text-muted)',   bg: 'var(--bg-surface)',     label: 'Pending'     },
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
      background: confirmed ? 'var(--accent-cool-bg)' : 'var(--amber-bg)',
      color:      confirmed ? 'var(--accent-cool)'    : 'var(--amber)',
      fontSize: 9,
      fontWeight: 700,
      border: `1px solid var(--border)`,
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
        background: 'var(--blue-bg)', border: '1px solid var(--blue)30',
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
          { label: 'Observations', value: obs.total,               color: DS.blue,   bg: DS.blueBg   },
          { label: 'Bugs Logged',  value: obs.stats.bug_logged,    color: DS.red,    bg: DS.redBg    },
          { label: 'In Progress',  value: obs.stats.in_progress,   color: DS.amber,  bg: DS.amberBg  },
          { label: 'Blockers',     value: blk.active_count,        color: DS.red,    bg: DS.redBg    },
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
              border: `1px solid ${tab === t.id ? 'var(--accent-cool)' : DS.border}`,
              background: tab === t.id ? 'var(--accent-cool-bg)' : 'transparent',
              color: tab === t.id ? 'var(--accent-cool)' : DS.textMuted,
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
          { label: 'Observations ↗', url: data.obs_url, color: 'var(--accent-cool)' },
          { label: 'Blockers ↗',     url: data.blk_url, color: 'var(--red)'         },
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
  const fetched = useRef(false)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(getApiUrl(apiPath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setInsights(json.insights ?? [])
      setFetchedAt(json.generated_at ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [apiPath, payload])

  const handleOpen = () => {
    setOpen(o => !o)
    if (!fetched.current) {
      fetched.current = true
      fetchInsights()
    }
  }

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
          background: 'rgba(99,102,241,0.12)', color: '#818cf8',
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
    { label: 'Total Tests',       value: totalTests,       color: DS.blue,    Icon: TestTube2,     suffix: '' },
    { label: 'Open Bugs',         value: data.bugs_total,  color: DS.red,     Icon: Bug,           suffix: '' },
    { label: 'Total Executions',  value: totalExecs,       color: DS.accent,  Icon: BarChart3,     suffix: '' },
    { label: 'Overall Pass Rate', value: overallPassRate,  color: DS.accent,  Icon: TrendingUp,    suffix: '%' },
    { label: 'Active Blockers',   value: activeBlockers,   color: DS.amber,   Icon: AlertTriangle, suffix: '' },
  ]

  return (
    <ScrollArea className="h-full">
      <div style={{ minHeight: '100%', background: DS.page, fontFamily: DS.font, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <LivePulse color="var(--accent-cool)" />
                <span style={{ color: DS.accent, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
                <span style={{ color: DS.textHint, fontSize: 10 }}>·</span>
                <span style={{ color: DS.textMuted, fontSize: 10 }}>Next refresh in {fmtCountdown(Math.max(0, countdown))}</span>
              </div>
              <h1 style={{ color: DS.text, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>
                Project Mercury — Status Summary
              </h1>
              <p style={{ color: DS.textMuted, fontSize: 12, marginTop: 4 }}>
                Version: <strong style={{ color: DS.text }}>{data.version}</strong>&ensp;·&ensp;Project: <strong style={{ color: DS.text }}>{data.project}</strong>
                {lastFetched && <>&ensp;·&ensp;<span style={{ color: DS.textHint }}>Updated {fmtDate(lastFetched)}</span></>}
              </p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, flexShrink: 0,
                background: DS.surface, border: `1px solid ${DS.border}`,
                color: DS.text, fontSize: 12, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: DS.font, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {/* Refresh progress bar */}
          <div style={{ height: 2, background: DS.border, borderRadius: 1, marginTop: 10, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${(countdown / AUTO_REFRESH_SECS) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
              style={{ height: '100%', background: `linear-gradient(90deg, var(--blue), var(--accent-cool))`, borderRadius: 1 }}
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 10px', borderRadius: 6, background: DS.amberBg, border: `1px solid ${DS.amber}30` }}>
                <AlertCircle size={13} style={{ color: DS.amber, flexShrink: 0 }} />
                <span style={{ color: DS.amber, fontSize: 11 }}>{error}</span>
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
                background: DS.card,
                border: `1px solid ${DS.border}`,
                borderRadius: 12,
                padding: '14px 16px',
                borderTop: `3px solid ${kpi.color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: DS.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {kpi.label}
                </span>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: kpi.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <kpi.Icon size={12} style={{ color: kpi.color }} />
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: DS.text, letterSpacing: '-0.04em', lineHeight: 1 }}>
                <AnimatedCounter target={kpi.value} />{kpi.suffix}
              </div>
              <div style={{ height: 2, background: DS.border, borderRadius: 1, marginTop: 10, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: kpi.suffix === '%' ? `${kpi.value}%` : '100%' }}
                  transition={{ duration: 1, delay: 0.4 + i * 0.08, ease: 'easeOut' }}
                  style={{ height: '100%', background: kpi.color, borderRadius: 1, opacity: 0.6 }}
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
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'stretch' }}
        >
          <Card>
            <CardHeader
              icon={Zap}
              title={data.focused_test_suite.chart_title || 'Focused Test Suite'}
              subtitle="High-priority regression — GL, AP, AR, 1099 (version-scoped)"
              accent="var(--accent-cool)"
            />
            <TestSuiteBreakdown {...data.focused_test_suite} />
          </Card>

          <Card>
            <CardHeader
              icon={Layers}
              title={data.comprehensive_test_suite.chart_title || 'Comprehensive Test Suite'}
              subtitle="Full coverage across all MODDWTC components (all versions)"
              accent="var(--blue)"
            />
            <TestSuiteBreakdown {...data.comprehensive_test_suite} />
          </Card>
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
                accent="var(--red)"
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
                accent="var(--amber)"
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
              accent="var(--accent-cool)"
            />
            <ExecutionTable rows={data.execution_summary} jiraBase={data.jira_base_url} />
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
              accent="var(--blue)"
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
          <LivePulse color="var(--accent-cool)" />
          <p style={{ color: DS.textHint, fontSize: 10, margin: 0 }}>
            Project Mercury · {data.project} · Zephyr Scale · CDK Global FalconX
          </p>
          <span style={{ marginLeft: 'auto', color: DS.textHint, fontSize: 10 }}>
            Auto-refreshes every 5 min · Next in {fmtCountdown(Math.max(0, countdown))}
          </span>
        </div>
      </div>
    </ScrollArea>
  )
}
