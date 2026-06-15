'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, AlertCircle, TestTube2, Zap, Clock, CheckCircle2,
  ExternalLink, ChevronDown, ChevronRight, Activity,
} from 'lucide-react'
import { getApiUrl } from '../../lib/api-config'

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

const CAT = {
  automated:              { color: '#2E7D5E', bg: 'rgba(46,125,94,0.12)',   label: 'Automated' },
  requires_automation:    { color: '#8B6020', bg: 'rgba(139,96,32,0.12)',   label: 'Requires Automation' },
  automation_not_required:{ color: '#555E6B', bg: 'rgba(85,94,107,0.12)',   label: 'Not Required' },
} as const

// ── Types ──────────────────────────────────────────────────────────────────────
interface ModuleData {
  name: string
  overall: number
  automated: number
  requires_automation: number
  automation_not_required: number
  jql: {
    overall: string
    automated: string
    requires_automation: string
    automation_not_required: string
  }
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
  const total  = modules.reduce((s, m) => s + m.overall, 0)
  const auto   = modules.reduce((s, m) => s + m.automated, 0)
  const req    = modules.reduce((s, m) => s + m.requires_automation, 0)
  const notReq = modules.reduce((s, m) => s + m.automation_not_required, 0)

  const stats = [
    { label: 'Total Tests',             count: total,  color: DS.accent,                         Icon: TestTube2    },
    { label: 'Automated',               count: auto,   color: CAT.automated.color,               Icon: Zap          },
    { label: 'Requires Automation',     count: req,    color: CAT.requires_automation.color,     Icon: Clock        },
    { label: 'Automation Not Required', count: notReq, color: CAT.automation_not_required.color, Icon: CheckCircle2 },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
type CatSegment = { key: CatKey; jqlKey: keyof ModuleData['jql'] }

const SEGMENTS: CatSegment[] = [
  { key: 'automated',               jqlKey: 'automated'               },
  { key: 'requires_automation',     jqlKey: 'requires_automation'     },
  { key: 'automation_not_required', jqlKey: 'automation_not_required' },
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
                const count = mod[seg.key as keyof ModuleData] as number
                const pct   = (count / total) * 100
                if (pct < 0.3) return null
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 10 }}>
                    {SEGMENTS.map(seg => {
                      const count = mod[seg.key as keyof ModuleData] as number
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
type CatKey = 'automated' | 'requires_automation' | 'automation_not_required'
const COLS: { key: CatKey; jqlKey: keyof ModuleData['jql'] }[] = [
  { key: 'automated',               jqlKey: 'automated'               },
  { key: 'requires_automation',     jqlKey: 'requires_automation'     },
  { key: 'automation_not_required', jqlKey: 'automation_not_required' },
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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  onClick={() => openJira(mod.jql.overall, jiraBase)}
                  title="Open all tests in Jira"
                >
                  <TestTube2 size={11} style={{ color: DS.accent, flexShrink: 0 }} />
                  <span style={{ color: DS.textSec, fontSize: 11, fontWeight: 500 }}>{mod.name}</span>
                  <ExternalLink size={9} style={{ color: DS.textHint, flexShrink: 0 }} />
                </div>
              </td>

              {/* Per-category counts */}
              {COLS.map(col => {
                const count = mod[col.key as keyof ModuleData] as number
                const jql   = mod.jql[col.jqlKey]
                return (
                  <td key={col.key} style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <motion.span
                      onClick={() => count > 0 && openJira(jql, jiraBase)}
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
                  onClick={() => openJira(mod.jql.overall, jiraBase)}
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
  const fetched = useRef(false)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(getApiUrl('/api/services-mod-dashboard/ai-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules }),
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
  }, [modules])

  const handleOpen = () => {
    setOpen(o => !o)
    if (!fetched.current) {
      fetched.current = true
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

// ── Main component ─────────────────────────────────────────────────────────────
export function ServicesModDashboard() {
  const [data,       setData]       = useState<DashboardData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/services-mod-dashboard'))
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: DS.page, fontFamily: DS.font }}>
      <div style={{ textAlign: 'center', color: DS.textMuted }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: 28, height: 28, border: `2px solid ${DS.border}`, borderTopColor: DS.accent, borderRadius: '50%', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13 }}>Loading module test data…</div>
        <div style={{ fontSize: 11, marginTop: 4, color: DS.textHint }}>Running 28 JQL queries concurrently</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: DS.page, fontFamily: DS.font }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <AlertCircle size={28} style={{ color: 'var(--red)', margin: '0 auto 12px' }} />
        <div style={{ color: DS.text, fontWeight: 600, marginBottom: 6 }}>Failed to load dashboard</div>
        <div style={{ color: DS.textMuted, fontSize: 12, marginBottom: 16, wordBreak: 'break-word' }}>{error}</div>
        <button onClick={handleRefresh} style={{ background: DS.accent, color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Retry
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

        {/* AI insights */}
        {modules.length > 0 && <AIInsightsPanel modules={modules} />}

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}
