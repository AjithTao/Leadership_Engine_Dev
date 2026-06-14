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

// ── Design tokens ─────────────────────────────────────────────────────────────
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
  green:         'var(--green)',
  greenBg:       'var(--green-bg)',
  amber:         'var(--amber)',
  amberBg:       'var(--amber-bg)',
  red:           'var(--red)',
  redBg:         'var(--red-bg)',
  blue:          'var(--blue)',
  blueBg:        'var(--blue-bg)',
  font:          "'Plus Jakarta Sans', system-ui, sans-serif",
} as const

// ── Zephyr status colours ──────────────────────────────────────────────────────
const STATUS = {
  PASS:        { color: '#75B000', bg: '#75B00018', label: 'Pass',       icon: CheckCircle2  },
  FAIL:        { color: '#CC3300', bg: '#CC330018', label: 'Fail',       icon: XCircle       },
  WIP:         { color: '#F2B000', bg: '#F2B00018', label: 'WIP',        icon: Clock         },
  BLOCKED:     { color: '#6693B0', bg: '#6693B018', label: 'Blocked',    icon: MinusCircle   },
  UNEXECUTED:  { color: '#8B929A', bg: '#8B929A18', label: 'Not Run',    icon: MinusCircle   },
} as const

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
function LivePulse({ color = '#75B000' }: { color?: string }) {
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

function CardHeader({ icon: Icon, title, subtitle, accent = DS.blue }: {
  icon: React.ElementType; title: string; subtitle?: string; accent?: string
}) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${DS.border}`, display: 'flex', alignItems: 'flex-start', gap: 10, borderTop: `3px solid ${accent}`, borderRadius: '12px 12px 0 0' }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: accent + '18', border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} style={{ color: accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: DS.text, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{title}</p>
        {subtitle && <p style={{ color: DS.textMuted, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>}
      </div>
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
  bug_logged:  { color: '#CC3300', bg: '#CC330018', label: 'Bug'         },
  resolved:    { color: '#00875A', bg: '#00875A18', label: 'Resolved'    },
  in_progress: { color: '#F2B000', bg: '#F2B00018', label: 'In Progress' },
  pending:     { color: '#8B929A', bg: '#8B929A18', label: 'Pending'     },
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
      background: confirmed ? '#00875A18' : '#F2B00018',
      color: confirmed ? '#00875A' : '#F2B000',
      fontSize: 9,
      fontWeight: 700,
      border: `1px solid ${confirmed ? '#00875A30' : '#F2B00030'}`,
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
          { label: 'Observations', value: obs.total,         color: '#6554C0', bg: '#6554C018' },
          { label: 'Bugs Logged',  value: obs.stats.bug_logged,  color: '#CC3300', bg: '#CC330018' },
          { label: 'In Progress',  value: obs.stats.in_progress, color: '#F2B000', bg: '#F2B00018' },
          { label: 'Blockers',     value: blk.active_count,  color: '#FF5630', bg: '#FF563018' },
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
              border: `1px solid ${tab === t.id ? '#6554C0' : DS.border}`,
              background: tab === t.id ? '#6554C018' : 'transparent',
              color: tab === t.id ? '#6554C0' : DS.textMuted,
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
          { label: 'Observations ↗', url: data.obs_url, color: '#00875A' },
          { label: 'Blockers ↗',     url: data.blk_url, color: '#FF5630' },
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
    { label: 'Total Tests',      value: totalTests,        color: '#0052CC', Icon: TestTube2,    suffix: '' },
    { label: 'Open Bugs',        value: data.bugs_total,   color: '#FF5630', Icon: Bug,          suffix: '' },
    { label: 'Total Executions', value: totalExecs,        color: '#00875A', Icon: BarChart3,    suffix: '' },
    { label: 'Overall Pass Rate',value: overallPassRate,   color: '#75B000', Icon: TrendingUp,   suffix: '%' },
    { label: 'Active Blockers',  value: activeBlockers,    color: '#F2B000', Icon: AlertTriangle, suffix: '' },
  ]

  return (
    <ScrollArea className="h-full">
      <div style={{ minHeight: '100%', background: DS.page, fontFamily: DS.font, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <LivePulse color="#75B000" />
                <span style={{ color: '#75B000', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
                <span style={{ color: DS.textHint, fontSize: 10 }}>·</span>
                <span style={{ color: DS.textMuted, fontSize: 10 }}>Next refresh in {fmtCountdown(Math.max(0, countdown))}</span>
              </div>
              <h1 style={{ color: DS.text, fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>
                Project Mercury — Status Summary
              </h1>
              <p style={{ color: DS.textSec, fontSize: 12, marginTop: 4 }}>
                Version: <strong style={{ color: DS.text }}>{data.version}</strong>&ensp;·&ensp;Project: <strong style={{ color: DS.text }}>{data.project}</strong>
                {lastFetched && <>&ensp;·&ensp;<span style={{ color: DS.textMuted }}>Updated {fmtDate(lastFetched)}</span></>}
              </p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, flexShrink: 0,
                background: DS.blue, border: 'none', color: '#fff',
                fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                fontFamily: DS.font, opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh Now'}
            </button>
          </div>

          {/* Refresh progress bar */}
          <div style={{ height: 2, background: DS.border, borderRadius: 1, marginTop: 10, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${(countdown / AUTO_REFRESH_SECS) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
              style={{ height: '100%', background: `linear-gradient(90deg, ${DS.blue}, #75B000)`, borderRadius: 1 }}
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
              whileHover={{ y: -3, boxShadow: `0 8px 28px ${kpi.color}28` }}
              style={{
                background: DS.card, border: `1px solid ${DS.border}`,
                borderRadius: 12, padding: '14px 16px',
                borderTop: `3px solid ${kpi.color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: DS.textMuted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</span>
                <kpi.Icon size={13} style={{ color: kpi.color, opacity: 0.8 }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: DS.text, letterSpacing: '-0.04em', lineHeight: 1 }}>
                <AnimatedCounter target={kpi.value} />{kpi.suffix}
              </div>
              <div style={{ height: 2, background: DS.border, borderRadius: 1, marginTop: 10, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: kpi.suffix === '%' ? `${kpi.value}%` : '100%' }}
                  transition={{ duration: 1, delay: 0.4 + i * 0.08, ease: 'easeOut' }}
                  style={{ height: '100%', background: kpi.color, borderRadius: 1, opacity: 0.7 }}
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
            <CardHeader icon={TestTube2} title="Focused Test Suite" subtitle="High-priority GL, AP, AR, and 1099 regression coverage" accent="#BF2600" />
            <TestSuiteBreakdown {...data.focused_test_suite} />
          </Card>

          <Card>
            <CardHeader icon={Layers} title="Comprehensive Test Suite" subtitle="Full test coverage across all MODDWTC components" accent="#0052CC" />
            <TestSuiteBreakdown {...data.comprehensive_test_suite} />
          </Card>

          <Card>
            <CardHeader icon={Bug} title="Bug Distribution by Module" subtitle={`${data.bugs_total} total open bugs across T&L scope`} accent="#FF5630" />
            <BugDistributionChart bugs={data.bugs_distribution} />
          </Card>
        </motion.div>

        {/* ── Row 2: Execution Summary Table + Findings + Priority ──────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28 }}
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}
        >
          <Card>
            <CardHeader icon={BarChart3} title="Execution Summary — All T&L Dealers" subtitle={`Version: ${data.version} · ${data.project}`} accent="#00875A" />
            <ExecutionTable rows={data.execution_summary} />
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <CardHeader icon={FileText} title="Findings" subtitle="Live analysis · Confluence T&L pages" accent="#6554C0" />
              <FindingsPanel data={findings} />
            </Card>

            <Card style={{ flex: 1 }}>
              <CardHeader icon={ShieldAlert} title="Bug Priority Breakdown" subtitle="Open bugs by severity across all T&L modules" accent="#FF8B00" />
              <BugPriorityChart priorities={data.bug_priorities} total={data.bugs_total} />
            </Card>
          </div>
        </motion.div>

        {/* ── Row 3: Zephyr Execution Chart per cycle ──────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.38 }}
        >
          <Card>
            <CardHeader icon={TrendingUp} title="Zephyr Test Execution — by Cycle" subtitle={`Version: ${data.version} · test execution results grouped by dealer cycle`} accent="#0052CC" />
            <ExecutionBarsChart rows={data.execution_summary} />
          </Card>
        </motion.div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
          <LivePulse color={DS.blue} />
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
