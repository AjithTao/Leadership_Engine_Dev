'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, AlertCircle, TestTube2, Zap, Clock, CheckCircle2,
  ExternalLink, ChevronDown, ChevronRight, Activity, HelpCircle,
  Layers, Tag,
} from 'lucide-react'
import { getApiUrl, fetchWithTimeout } from '../../lib/api-config'
import { useTheme } from '../contexts/ThemeContext'

// Theme detection (same pattern as ServicesDashboard). The category hexes below
// need dark, AA-on-near-white variants on light surfaces and brighter variants on
// the dark #1E2028 surfaces. These getters resolve per render; the dashboard
// subscribes to useTheme() so the subtree re-renders when the theme toggles.
// Default to dark (the app's default) during SSR / before the class is applied.
const isDarkTheme = () =>
  typeof document === 'undefined' || document.documentElement.classList.contains('dark')
const pick = (light: string, dark: string) => (isDarkTheme() ? dark : light)

// ── Design tokens ─────────────────────────────────────────────────────────────
const DS = {
  page:         'var(--bg-page)',
  card:         'var(--bg-card)',
  surface:      'var(--bg-surface)',
  border:       'var(--border)',
  borderStrong: 'var(--border-strong)',
  text:         'var(--text-primary)',
  textSec:      'var(--text-secondary)',
  textMuted:    'var(--text-muted)',
  textHint:     'var(--text-hint)',
  accent:       'var(--accent-cool)',
  accentBg:     'var(--accent-cool-bg)',
  font:         "'Plus Jakarta Sans', system-ui, sans-serif",
} as const

// Theme-aware category colours: light = dark AA hues on near-white, dark = bright
// hues readable as text on #1E2028. Getters so `${color}NN` alpha tints resolve too.
const CAT = {
  automated:              { get color() { return pick('#2E7D5E', '#4ADE80') }, get bg() { return pick('rgba(46,125,94,0.12)',  'rgba(74,222,128,0.12)') },  label: 'Automated' },
  requires_automation:    { get color() { return pick('#8B6020', '#FCD34D') }, get bg() { return pick('rgba(139,96,32,0.12)',  'rgba(252,211,77,0.12)') },  label: 'Requires Automation' },
  automation_not_required:{ get color() { return pick('#555E6B', '#94A3B8') }, get bg() { return pick('rgba(85,94,107,0.12)',  'rgba(148,163,184,0.12)') }, label: 'Not Required' },
  unclassified:           { get color() { return pick('#9B2C2C', '#F87171') }, get bg() { return pick('rgba(155,44,44,0.10)',  'rgba(248,113,113,0.10)') }, label: 'Unclassified' },
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ModuleData {
  name: string
  overall: number
  automated: number
  requires_automation: number
  automation_not_required: number
  unclassified: number
  jql: {
    overall: string
    automated: string
    requires_automation: string
    automation_not_required: string
    unclassified: string
  }
}

interface TKCategory {
  name: string
  description: string
  color: string
  total: number
  automated: number
  requires_automation: number
  automation_not_required: number
  unclassified: number
  jql: {
    overall: string
    automated: string
    requires_automation: string
    automation_not_required: string
    unclassified: string
  }
}

interface TKCategoryData {
  module: string
  base_jql: string
  tk_total: number
  categories: TKCategory[]
  jira_base_url: string
  last_fetched: string
}

interface DashboardData {
  modules:       ModuleData[]
  jira_base_url?: string
  last_fetched:  string
}

interface AIInsight {
  gadget:   string
  headline: string
  insight:  string
  priority: 'high' | 'medium' | 'low'
  action:   string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function openJira(jql: string, base: string) {
  window.open(`${base}/issues/?jql=${encodeURIComponent(jql)}`, '_blank', 'noopener,noreferrer')
}

// Extract a human-readable message from a failed Response: prefer a JSON `detail`
// field, else strip markup and truncate to ~200 chars (never render raw HTML/blobs).
async function readErrorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const json = JSON.parse(text)
    if (json && typeof json.detail === 'string') return json.detail.slice(0, 200)
  } catch { /* not JSON */ }
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain.slice(0, 200) || res.statusText || 'Request failed'
}

// Keyboard activation (Enter / Space) for clickable non-button elements.
const onActionKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
}

// ── AnimatedCounter ────────────────────────────────────────────────────────────
function AnimatedCounter({ target }: { target: number }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    let start = 0
    const step = Math.ceil(target / 40)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setVal(target); clearInterval(timer) }
      else setVal(start)
    }, 20)
    return () => clearInterval(timer)
  }, [target])
  return <>{val.toLocaleString()}</>
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ modules }: { modules: ModuleData[] }) {
  const total    = modules.reduce((s, m) => s + m.overall, 0)
  const auto     = modules.reduce((s, m) => s + m.automated, 0)
  const req      = modules.reduce((s, m) => s + m.requires_automation, 0)
  const notReq   = modules.reduce((s, m) => s + m.automation_not_required, 0)
  const unclass  = modules.reduce((s, m) => s + (m.unclassified ?? 0), 0)

  const stats = [
    { label: 'Total Tests',             count: total,   color: DS.accent,                          Icon: TestTube2    },
    { label: 'Automated',               count: auto,    color: CAT.automated.color,                Icon: Zap          },
    { label: 'Requires Automation',     count: req,     color: CAT.requires_automation.color,      Icon: Clock        },
    { label: 'Automation Not Required', count: notReq,  color: CAT.automation_not_required.color,  Icon: CheckCircle2 },
    { label: 'Unclassified',            count: unclass, color: CAT.unclassified.color,             Icon: HelpCircle   },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      {stats.map(s => (
        <div
          key={s.label}
          style={{
            background: DS.card, border: `1px solid ${DS.border}`,
            borderRadius: 10, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10, fontFamily: DS.font,
          }}
        >
          <s.Icon size={16} style={{ color: s.color, flexShrink: 0 }} />
          <div>
            <div style={{ color: DS.text, fontSize: 18, fontWeight: 700 }}>
              <AnimatedCounter target={s.count} />
            </div>
            <div style={{ color: DS.textMuted, fontSize: 10, marginTop: 1 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Module bar chart ──────────────────────────────────────────────────────────
type CatKey = 'automated' | 'requires_automation' | 'automation_not_required' | 'unclassified'
type CatSegment = { key: CatKey; jqlKey: keyof ModuleData['jql'] }

const SEGMENTS: CatSegment[] = [
  { key: 'automated',               jqlKey: 'automated'               },
  { key: 'requires_automation',     jqlKey: 'requires_automation'     },
  { key: 'automation_not_required', jqlKey: 'automation_not_required' },
  { key: 'unclassified',            jqlKey: 'unclassified'            },
]

function ModuleBarChart({ modules, jiraBase }: { modules: ModuleData[]; jiraBase: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (name: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  return (
    <div style={{ fontFamily: DS.font }}>
      {modules.map((mod, idx) => {
        const isLast   = idx === modules.length - 1
        const isOpen   = expanded.has(mod.name)
        const total    = mod.overall || 1
        const autoPct  = Math.round((mod.automated / total) * 100)

        return (
          <div
            key={mod.name}
            style={{ borderBottom: isLast ? 'none' : `1px solid ${DS.border}`, padding: '10px 16px' }}
          >
            {/* ── Row: name · auto% · total · expand ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <button
                onClick={() => openJira(mod.jql.overall, jiraBase)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{ color: DS.textSec, fontSize: 11, fontWeight: 500 }}>{mod.name}</span>
                <ExternalLink size={9} style={{ color: DS.textHint }} />
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ color: CAT.automated.color, fontSize: 10, fontWeight: 600 }}>{autoPct}%</span>
              <span style={{ color: DS.textMuted, fontSize: 10 }}>{mod.overall}</span>
              <button
                onClick={() => toggle(mod.name)}
                title={isOpen ? 'Collapse' : 'Expand breakdown'}
                style={{
                  background: 'none', border: `1px solid ${DS.border}`, borderRadius: 4,
                  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, padding: 0,
                }}
              >
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: 'flex' }}
                >
                  <ChevronRight size={11} style={{ color: DS.textMuted }} />
                </motion.span>
              </button>
            </div>

            {/* ── Stacked bar ── */}
            <div style={{ height: 7, borderRadius: 4, overflow: 'hidden', display: 'flex', background: DS.border }}>
              {SEGMENTS.map(seg => {
                const count = (mod[seg.key as keyof ModuleData] as number) ?? 0
                const pct   = (count / total) * 100
                if (!count || pct < 0.3) return null
                return (
                  <motion.div
                    key={seg.key}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    title={`${CAT[seg.key].label}: ${count}`}
                    style={{ height: '100%', background: CAT[seg.key].color, opacity: 0.85 }}
                  />
                )
              })}
            </div>

            {/* ── Expanded breakdown ── */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="breakdown"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, paddingTop: 10 }}>
                    {SEGMENTS.map(seg => {
                      const count = (mod[seg.key as keyof ModuleData] as number) ?? 0
                      const pct   = Math.round((count / total) * 100)
                      const cat   = CAT[seg.key]
                      return (
                        <motion.button
                          key={seg.key}
                          onClick={() => count > 0 && openJira(mod.jql[seg.jqlKey], jiraBase)}
                          whileHover={count > 0 ? { y: -1 } : {}}
                          style={{
                            background: cat.bg,
                            border: `1px solid ${cat.color}30`,
                            borderLeft: `3px solid ${cat.color}`,
                            borderRadius: 7,
                            padding: '9px 11px',
                            cursor: count > 0 ? 'pointer' : 'default',
                            textAlign: 'left',
                            fontFamily: DS.font,
                          }}
                        >
                          <div style={{ color: cat.color, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{count}</div>
                          <div style={{ color: DS.textSec, fontSize: 10, fontWeight: 600, marginTop: 4 }}>{cat.label}</div>
                          <div style={{ color: DS.textHint, fontSize: 9, marginTop: 2 }}>{pct}% of {mod.overall}</div>
                          {count > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5 }}>
                              <ExternalLink size={8} style={{ color: DS.textHint }} />
                              <span style={{ color: DS.textHint, fontSize: 9 }}>Open in Jira</span>
                            </div>
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}

      {/* ── Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', padding: '8px 16px', borderTop: `1px solid ${DS.border}` }}>
        {(Object.entries(CAT) as [CatKey, typeof CAT[CatKey]][]).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: v.color, opacity: 0.85 }} />
            <span style={{ color: DS.textMuted, fontSize: 10 }}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Module table ──────────────────────────────────────────────────────────────
const COLS: { key: CatKey; jqlKey: keyof ModuleData['jql'] }[] = [
  { key: 'automated',               jqlKey: 'automated'               },
  { key: 'requires_automation',     jqlKey: 'requires_automation'     },
  { key: 'automation_not_required', jqlKey: 'automation_not_required' },
  { key: 'unclassified',            jqlKey: 'unclassified'            },
]

function ModuleTable({ modules, jiraBase }: { modules: ModuleData[]; jiraBase: string }) {
  const cellStyle = (count: number, catKey: CatKey): React.CSSProperties => {
    if (count === 0) return { color: DS.textMuted, opacity: 0.35 }
    const color = CAT[catKey].color
    return { color, fontWeight: 700, background: color + '18', borderRadius: 4 }
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${DS.border}` }}>
            <th style={{ padding: '7px 16px', textAlign: 'left', color: DS.textMuted, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', minWidth: 160 }}>
              Module
            </th>
            {COLS.map(col => (
              <th key={col.key} style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', color: CAT[col.key].color }}>
                {CAT[col.key].label}
              </th>
            ))}
            <th style={{ padding: '7px 16px 7px 12px', textAlign: 'right', color: DS.textMuted, fontWeight: 600, fontSize: 10 }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {modules.map((mod, rowIdx) => (
            <tr
              key={mod.name}
              style={{ borderBottom: `1px solid ${DS.border}`, background: rowIdx % 2 === 0 ? 'transparent' : DS.surface + '55' }}
            >
              {/* Module name — click opens overall JQL */}
              <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                <div
                  role="button"
                  tabIndex={0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  onClick={() => openJira(mod.jql.overall, jiraBase)}
                  onKeyDown={onActionKey(() => openJira(mod.jql.overall, jiraBase))}
                  title="Open all tests in Jira"
                >
                  <TestTube2 size={11} style={{ color: DS.accent, flexShrink: 0 }} />
                  <span style={{ color: DS.textSec, fontSize: 11, fontWeight: 500 }}>{mod.name}</span>
                  <ExternalLink size={9} style={{ color: DS.textHint, flexShrink: 0 }} />
                </div>
              </td>

              {/* Per-category counts */}
              {COLS.map(col => {
                const count = (mod[col.key as keyof ModuleData] as number) ?? 0
                const jql   = mod.jql[col.jqlKey] ?? mod.jql.overall
                return (
                  <td key={col.key} style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <motion.span
                      role={count > 0 ? 'button' : undefined}
                      tabIndex={count > 0 ? 0 : undefined}
                      onClick={() => count > 0 && openJira(jql, jiraBase)}
                      onKeyDown={count > 0 ? onActionKey(() => openJira(jql, jiraBase)) : undefined}
                      whileHover={count > 0 ? { scale: 1.08 } : {}}
                      style={{
                        display: 'inline-block', minWidth: 28, padding: '2px 7px',
                        fontSize: 11, borderRadius: 4,
                        cursor: count > 0 ? 'pointer' : 'default',
                        ...cellStyle(count, col.key),
                      }}
                      title={count > 0 ? `Open in Jira: ${count} ${CAT[col.key].label}` : '–'}
                    >
                      {count === 0 ? '–' : count}
                    </motion.span>
                  </td>
                )
              })}

              {/* Total */}
              <td style={{ padding: '8px 16px 8px 12px', textAlign: 'right' }}>
                <motion.span
                  role="button"
                  tabIndex={0}
                  onClick={() => openJira(mod.jql.overall, jiraBase)}
                  onKeyDown={onActionKey(() => openJira(mod.jql.overall, jiraBase))}
                  whileHover={{ scale: 1.06 }}
                  style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                    background: DS.accentBg, color: DS.accent,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                  title="Open all tests in Jira"
                >
                  {mod.overall}
                </motion.span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${DS.borderStrong}`, background: DS.surface }}>
            <td style={{ padding: '7px 16px', color: DS.textMuted, fontSize: 10, fontWeight: 700 }}>TOTAL</td>
            {COLS.map(col => {
              const colTotal = modules.reduce((s, m) => s + (m[col.key as keyof ModuleData] as number), 0)
              return (
                <td key={col.key} style={{ padding: '7px 12px', textAlign: 'center', color: CAT[col.key].color, fontSize: 11, fontWeight: 700 }}>
                  {colTotal || '–'}
                </td>
              )
            })}
            <td style={{ padding: '7px 16px 7px 12px', textAlign: 'right', color: DS.text, fontSize: 12, fontWeight: 700 }}>
              {modules.reduce((s, m) => s + m.overall, 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── AI Insights Panel ─────────────────────────────────────────────────────────
const PRIORITY_BADGE: Record<string, { color: string; bg: string }> = {
  high:   { color: 'var(--red)',         bg: 'var(--red-bg)'         },
  medium: { color: 'var(--amber)',       bg: 'var(--amber-bg)'       },
  low:    { color: 'var(--accent-cool)', bg: 'var(--accent-cool-bg)' },
}

const GADGET_ICONS: Record<string, React.ElementType> = {
  automation_gap: Zap,
  top_risk:       AlertCircle,
  quick_win:      CheckCircle2,
  overview:       Activity,
}

function AIInsightsPanel({ modules }: { modules: ModuleData[] }) {
  const [insights,  setInsights]  = useState<AIInsight[]>([])
  const [loading,   setLoading]   = useState(false)
  const [open,      setOpen]      = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  // Signature of the modules payload the last fetch was issued for — lets an
  // expand after a dashboard Refresh detect stale insights and refetch.
  const fetchedSig = useRef<string | null>(null)
  const inFlight   = useRef(false)
  const mounted    = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const fetchInsights = useCallback(async () => {
    if (modules.length === 0 || inFlight.current) return
    inFlight.current = true
    fetchedSig.current = JSON.stringify(modules)
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(getApiUrl('/api/services-mod-dashboard/ai-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules }),
      }, 60000)
      if (!res.ok) throw new Error(await readErrorText(res))
      const json = await res.json()
      if (!mounted.current) return
      setInsights(json.insights ?? [])
      setFetchedAt(json.generated_at ?? null)
    } catch (e) {
      fetchedSig.current = null // failed — allow the next expand to retry
      if (mounted.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [modules])

  const handleOpen = () => {
    const willOpen = !open
    setOpen(willOpen)
    // Fetch on expand when nothing has been fetched yet, or the dashboard data
    // has changed since the last fetch (e.g. after a Refresh). Never fetch with
    // an empty payload — wait for real module data.
    if (willOpen && modules.length > 0 && JSON.stringify(modules) !== fetchedSig.current) {
      fetchInsights()
    }
  }

  return (
    <div style={{ border: `1px solid ${DS.border}`, borderRadius: 12, background: DS.card, fontFamily: DS.font }}>
      {/* Toggle */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: DS.font, textAlign: 'left',
          borderRadius: 12,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 6,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0,
        }}>
          <Zap size={12} style={{ color: '#fff' }} />
        </div>
        <span style={{ color: DS.text, fontSize: 12, fontWeight: 700, flex: 1 }}>AI Insights</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
          Falcon Insights
        </span>
        {open
          ? <ChevronDown  size={13} style={{ color: DS.textMuted }} />
          : <ChevronRight size={13} style={{ color: DS.textMuted }} />
        }
      </button>

      {/* Content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${DS.border}` }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    style={{ width: 14, height: 14, border: `2px solid ${DS.border}`, borderTopColor: '#6366f1', borderRadius: '50%' }}
                  />
                  <span style={{ color: DS.textMuted, fontSize: 11 }}>Analysing module data with Falcon Insights…</span>
                </div>
              )}

              {error && !loading && (
                <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--amber)', fontSize: 10 }}>{error}</span>
                  <button onClick={fetchInsights} style={{ marginLeft: 'auto', color: DS.textMuted, fontSize: 10, background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
                </div>
              )}

              {!loading && insights.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, paddingTop: 12 }}>
                  {insights.map((ins, i) => {
                    const Icon  = GADGET_ICONS[ins.gadget] ?? Activity
                    const badge = PRIORITY_BADGE[ins.priority] ?? PRIORITY_BADGE.low
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        style={{
                          background: DS.surface, border: `1px solid ${DS.border}`,
                          borderRadius: 8, padding: '10px 12px',
                          borderLeft: `3px solid ${badge.color}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Icon size={11} style={{ color: badge.color, flexShrink: 0 }} />
                          <span style={{ color: DS.text, fontSize: 11, fontWeight: 700, flex: 1 }}>{ins.headline}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: badge.bg, color: badge.color, flexShrink: 0, textTransform: 'capitalize' }}>
                            {ins.priority}
                          </span>
                        </div>
                        <p style={{ color: DS.textSec, fontSize: 10, lineHeight: 1.5, margin: '0 0 5px' }}>{ins.insight}</p>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span style={{ color: DS.textHint, fontSize: 9 }}>→</span>
                          <span style={{ color: DS.textMuted, fontSize: 9, fontStyle: 'italic' }}>{ins.action}</span>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}

              {fetchedAt && !loading && (
                <p style={{ color: DS.textHint, fontSize: 9, textAlign: 'right', margin: '8px 0 0' }}>
                  Generated {new Date(fetchedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── TK Function Categorisation Gadget ─────────────────────────────────────────
const STATUS_COLS: { key: keyof TKCategory; label: string; color: string }[] = [
  { key: 'automated',               label: 'Automated',      get color() { return CAT.automated.color               } },
  { key: 'requires_automation',     label: 'Req. Auto',      get color() { return CAT.requires_automation.color     } },
  { key: 'automation_not_required', label: 'Not Required',   get color() { return CAT.automation_not_required.color } },
  { key: 'unclassified',            label: 'Unclassified',   get color() { return CAT.unclassified.color            } },
]

function TKCategorizationGadget({ jiraBase }: { jiraBase: string }) {
  const [open,    setOpen]    = useState(false)
  const [data,    setData]    = useState<TKCategoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const fetched = useRef(false)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(getApiUrl('/api/services-mod-dashboard/tk-categories'), {}, 45000)
      if (!res.ok) throw new Error(await readErrorText(res))
      const json = await res.json()
      if (mounted.current) setData(json)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const handleToggle = () => {
    setOpen(o => !o)
    if (!fetched.current) { fetched.current = true; fetchData() }
  }

  const cats = data?.categories ?? []
  const maxTotal = Math.max(...cats.map(c => c.total), 1)

  return (
    <div style={{ border: `1px solid ${DS.border}`, borderRadius: 12, background: DS.card, fontFamily: DS.font }}>
      {/* Header toggle */}
      <button
        onClick={handleToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: DS.font, textAlign: 'left', borderRadius: 12,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: 'linear-gradient(135deg, #0369A1, #7C3AED)',
        }}>
          <Layers size={12} style={{ color: '#fff' }} />
        </div>
        <span style={{ color: DS.text, fontSize: 12, fontWeight: 700, flex: 1 }}>
          TK Test Case Categorisation
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(3,105,161,0.12)', color: '#0369A1' }}>
          by Function Code
        </span>
        {data && (
          <span style={{ color: DS.textMuted, fontSize: 10 }}>{data.tk_total} tests</span>
        )}
        {open
          ? <ChevronDown  size={13} style={{ color: DS.textMuted }} />
          : <ChevronRight size={13} style={{ color: DS.textMuted }} />
        }
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ borderTop: `1px solid ${DS.border}`, padding: '12px 16px 16px' }}>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    style={{ width: 14, height: 14, border: `2px solid ${DS.border}`, borderTopColor: '#0369A1', borderRadius: '50%' }}
                  />
                  <span style={{ color: DS.textMuted, fontSize: 11 }}>Fetching TK test case categories from Jira…</span>
                </div>
              )}

              {error && !loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0' }}>
                  <AlertCircle size={12} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--red)', fontSize: 10 }}>{error}</span>
                  <button onClick={fetchData} style={{ marginLeft: 'auto', color: DS.textMuted, fontSize: 10, background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
                </div>
              )}

              {!loading && cats.length > 0 && (
                <>
                  {/* Horizontal scroll wrapper — the fixed-width grid columns overflow narrow viewports */}
                  <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 640 }}>
                  {/* Column header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 60px 80px 80px 80px 80px 80px',
                    gap: 4,
                    padding: '6px 8px',
                    marginBottom: 4,
                    borderBottom: `1px solid ${DS.border}`,
                  }}>
                    <span style={{ color: DS.textMuted, fontSize: 10, fontWeight: 700 }}>Category</span>
                    <span style={{ color: DS.textMuted, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>Total</span>
                    {STATUS_COLS.map(sc => (
                      <span key={sc.key} style={{ color: sc.color, fontSize: 9, fontWeight: 700, textAlign: 'center' }}>{sc.label}</span>
                    ))}
                    <span style={{ color: DS.textMuted, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>Coverage</span>
                  </div>

                  {/* Category rows */}
                  {cats.filter(c => c.total > 0).map((cat, i) => {
                    const autoPct = cat.total > 0 ? Math.round((cat.automated / cat.total) * 100) : 0
                    return (
                      <motion.div
                        key={cat.name}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 60px 80px 80px 80px 80px 80px',
                          gap: 4,
                          padding: '8px',
                          borderRadius: 8,
                          marginBottom: 2,
                          background: i % 2 === 0 ? 'transparent' : DS.surface + '55',
                          alignItems: 'center',
                        }}
                      >
                        {/* Name + description + mini bar */}
                        <div>
                          <button
                            onClick={() => window.open(`${jiraBase}/issues/?jql=${encodeURIComponent(cat.jql.overall)}`, '_blank', 'noopener,noreferrer')}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}
                          >
                            <Tag size={9} style={{ color: cat.color, flexShrink: 0 }} />
                            <span style={{ color: DS.text, fontSize: 11, fontWeight: 600 }}>{cat.name}</span>
                            <ExternalLink size={8} style={{ color: DS.textHint }} />
                          </button>
                          <div style={{ fontSize: 9, color: DS.textHint, marginBottom: 4 }}>{cat.description}</div>
                          {/* Mini stacked bar */}
                          <div style={{ height: 4, borderRadius: 3, overflow: 'hidden', display: 'flex', background: DS.border, width: '90%' }}>
                            {[
                              { pct: (cat.automated / maxTotal) * 100,               color: CAT.automated.color },
                              { pct: (cat.requires_automation / maxTotal) * 100,     color: CAT.requires_automation.color },
                              { pct: (cat.automation_not_required / maxTotal) * 100, color: CAT.automation_not_required.color },
                              { pct: (cat.unclassified / maxTotal) * 100,            color: CAT.unclassified.color },
                            ].map((seg, si) => seg.pct > 0.3 ? (
                              <motion.div
                                key={si}
                                initial={{ width: 0 }}
                                animate={{ width: `${seg.pct}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.03 }}
                                style={{ height: '100%', background: seg.color, opacity: 0.85 }}
                              />
                            ) : null)}
                          </div>
                        </div>

                        {/* Total */}
                        <div style={{ textAlign: 'center' }}>
                          <motion.span
                            role="button"
                            tabIndex={0}
                            onClick={() => window.open(`${jiraBase}/issues/?jql=${encodeURIComponent(cat.jql.overall)}`, '_blank', 'noopener,noreferrer')}
                            onKeyDown={onActionKey(() => window.open(`${jiraBase}/issues/?jql=${encodeURIComponent(cat.jql.overall)}`, '_blank', 'noopener,noreferrer'))}
                            whileHover={{ scale: 1.1 }}
                            style={{
                              display: 'inline-block', padding: '2px 7px', borderRadius: 6,
                              background: cat.color + '18', color: cat.color,
                              fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {cat.total}
                          </motion.span>
                        </div>

                        {/* Per-status counts */}
                        {STATUS_COLS.map(sc => {
                          const count = cat[sc.key] as number
                          const jqlForCol = cat.jql[sc.key as keyof TKCategory['jql']]
                          return (
                            <div key={sc.key} style={{ textAlign: 'center' }}>
                              {count > 0 ? (
                                <motion.span
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => window.open(`${jiraBase}/issues/?jql=${encodeURIComponent(jqlForCol)}`, '_blank', 'noopener,noreferrer')}
                                  onKeyDown={onActionKey(() => window.open(`${jiraBase}/issues/?jql=${encodeURIComponent(jqlForCol)}`, '_blank', 'noopener,noreferrer'))}
                                  whileHover={{ scale: 1.1 }}
                                  style={{
                                    display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                                    background: sc.color + '15', color: sc.color,
                                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  }}
                                >
                                  {count}
                                </motion.span>
                              ) : (
                                <span style={{ color: DS.textHint, fontSize: 10 }}>–</span>
                              )}
                            </div>
                          )
                        })}

                        {/* Coverage % */}
                        <div style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: autoPct >= 60 ? CAT.automated.color
                                 : autoPct >= 30 ? CAT.requires_automation.color
                                 : CAT.unclassified.color,
                          }}>
                            {autoPct}%
                          </span>
                        </div>
                      </motion.div>
                    )
                  })}
                  </div>
                  </div>

                  {/* Footer */}
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {STATUS_COLS.map(sc => (
                        <div key={sc.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: sc.color }} />
                          <span style={{ color: DS.textMuted, fontSize: 9 }}>{sc.label}</span>
                        </div>
                      ))}
                    </div>
                    {data?.last_fetched && (
                      <span style={{ color: DS.textHint, fontSize: 9 }}>
                        Updated {new Date(data.last_fetched).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ServicesModDashboard() {
  // Subscribe to theme changes so the theme-aware CAT colour getters re-resolve
  // and the dashboard repaints when light/dark toggles.
  useTheme()
  const [data,       setData]       = useState<DashboardData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const fetchData = useCallback(async () => {
    try {
      // Long timeout: the backend fans out many JQL queries for this endpoint.
      const res = await fetchWithTimeout(getApiUrl('/api/services-mod-dashboard'), {}, 90000)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await readErrorText(res)}`)
      const json = await res.json()
      if (!mounted.current) return
      setData(json)
      setError(null)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => { if (mounted.current) setLoading(false) })
  }, [fetchData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    if (mounted.current) setRefreshing(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: DS.page, fontFamily: DS.font }}>
      <div style={{ textAlign: 'center', color: DS.textMuted }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: 28, height: 28, border: `2px solid ${DS.border}`, borderTopColor: DS.accent, borderRadius: '50%', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13 }}>Loading module test data…</div>
        <div style={{ fontSize: 11, marginTop: 4, color: DS.textHint }}>Running Jira queries concurrently…</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: DS.page, fontFamily: DS.font }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <AlertCircle size={28} style={{ color: 'var(--red)', margin: '0 auto 12px' }} />
        <div style={{ color: DS.text, fontWeight: 600, marginBottom: 6 }}>Failed to load dashboard</div>
        <div style={{ color: DS.textMuted, fontSize: 12, marginBottom: 16, wordBreak: 'break-word' }}>{error}</div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: DS.accent, color: '#000', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <motion.span
            animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={{ repeat: refreshing ? Infinity : 0, duration: 0.8, ease: 'linear' }}
            style={{ display: 'flex' }}
          >
            <RefreshCw size={13} />
          </motion.span>
          {refreshing ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  )

  const modules  = data?.modules ?? []
  const jiraBase = data?.jira_base_url ?? 'https://projects.cdk.com'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DS.page, fontFamily: DS.font, overflow: 'hidden' }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${DS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: DS.card, flexShrink: 0,
      }}>
        <div>
          <div style={{ color: DS.text, fontWeight: 700, fontSize: 15 }}>Services Dashboard</div>
          <div style={{ color: DS.textMuted, fontSize: 11, marginTop: 2 }}>
            Module test automation status · {modules.length} modules · click any count to open in Jira
            {data?.last_fetched && (
              <span style={{ marginLeft: 10, color: DS.textHint }}>
                · Updated {new Date(data.last_fetched).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: `1px solid ${DS.border}`,
            color: DS.textSec, borderRadius: 8, padding: '6px 12px',
            fontSize: 12, cursor: refreshing ? 'default' : 'pointer',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: refreshing ? Infinity : 0, duration: 0.8, ease: 'linear' }}>
            <RefreshCw size={12} />
          </motion.span>
          Refresh
        </button>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* KPI summary */}
        <SummaryBar modules={modules} />

        {/* Automation bar chart */}
        <div style={{ background: DS.card, border: `1px solid ${DS.border}`, borderRadius: 12 }}>
          <div style={{ padding: '10px 16px 6px', borderBottom: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: DS.textSec, fontSize: 11, fontWeight: 700 }}>Automation Coverage by Module</span>
            <span style={{ color: DS.textHint, fontSize: 10 }}>Click module name to open in Jira</span>
          </div>
          <ModuleBarChart modules={modules} jiraBase={jiraBase} />
        </div>

        {/* Module detail table */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: DS.textHint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Detail Breakdown
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {Object.entries(CAT).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />
                <span style={{ color: DS.textMuted, fontSize: 11 }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: DS.card, border: `1px solid ${DS.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <ModuleTable modules={modules} jiraBase={jiraBase} />
        </div>

        {/* TK Categorisation gadget */}
        <TKCategorizationGadget jiraBase={jiraBase} />

        {/* AI insights */}
        {modules.length > 0 && <AIInsightsPanel modules={modules} />}

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}
