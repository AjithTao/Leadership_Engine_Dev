'use client'

/**
 * Tableau Executive Insights dashboard (Insights → Tableau).
 *
 * Pulls live data from the Tableau integration (Top 7 QCOE metrics view +
 * Unit Testing Coverage view) and renders an executive summary: KPI tiles,
 * actual-vs-target, tier mix, PI trend, project heatmap drill-down, and a
 * computed risks/opportunities panel. Falls back to clearly-badged sample
 * data (shaped like the real views) when Tableau is not connected.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line,
} from 'recharts'
import {
  BarChart3, RefreshCw, Download, Printer, Share2, Search,
  Trophy, CheckCircle, AlertTriangle, AlertCircle, TrendingUp, TrendingDown,
  Sparkles, Database, X,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getApiUrl } from '../../lib/api-config'

// ------------------------------------------------------------------ config

const TOP7_VIEW_URL =
  'https://tableau.cdk.com/#/site/CDKInternal/views/EngineeringEfficiency-Top7View/Top7View-Actuals'
const COVERAGE_VIEW_URL =
  'https://tableau.cdk.com/#/site/CDKInternal/views/UnitTestingCoverage/UnitTestingCoverage'

// Categorical palettes — validated (dataviz six checks) against the app's
// card surfaces: light #FFFFFF, dark #1E2028. Fixed assignment order.
const CAT_LIGHT = ['#1878B9', '#2563EB', '#0891B2', '#7C3AED', '#C2410C']
const CAT_DARK  = ['#B08A2E', '#3B82F6', '#0891B2', '#8B5CF6', '#EA580C']
const NEUTRAL_LIGHT = '#7C7C95'
const NEUTRAL_DARK  = '#6B7280'

const TIER_ORDER = ['Elite', 'Good', 'Fair', 'Needs Improvement'] as const
type Tier = (typeof TIER_ORDER)[number]

// Status colors are reserved for tier state and always paired with icon+label.
const TIER_STYLE: Record<Tier, { light: string; dark: string; Icon: any }> = {
  'Elite':             { light: '#2E7D46', dark: '#4ADE80', Icon: Trophy },
  'Good':              { light: '#146AA5', dark: '#D4A847', Icon: CheckCircle },
  'Fair':              { light: '#B45309', dark: '#FCD34D', Icon: AlertTriangle },
  'Needs Improvement': { light: '#C21F3A', dark: '#F87171', Icon: AlertCircle },
}

interface Kpi {
  metric: string
  value: number
  unit: string
  tier: Tier
  module: string
  target: number | null       // "Good" threshold lower bound when parseable
  eliteTarget: number | null  // "Elite" threshold lower bound
  source: string
}

interface TrendPoint { pi: string; [series: string]: number | string }
interface ProjectCoverage { project: string; byPi: Record<string, number> }

// ---------------------------------------------------------- sample dataset
// Shaped exactly like the live views (values modeled on real magnitudes).

const SAMPLE_KPIS: Kpi[] = [
  { metric: 'Unit Testing Coverage %',      value: 75.1, unit: '%', tier: 'Good', module: 'Product Quality', target: 70, eliteTarget: 80, source: 'SonarQube & JIRA' },
  { metric: 'Overall Automation %',         value: 68.4, unit: '%', tier: 'Fair', module: 'Product Quality', target: 70, eliteTarget: 85, source: 'JIRA' },
  { metric: 'Regression Automation %',      value: 82.6, unit: '%', tier: 'Elite', module: 'Product Quality', target: 70, eliteTarget: 80, source: 'JIRA' },
  { metric: 'Bugs Ratio',                   value: 18.0, unit: '%', tier: 'Good', module: 'Product Quality', target: 20, eliteTarget: 10, source: 'JIRA' },
  { metric: 'Defect Leakage %',             value: 6.2,  unit: '%', tier: 'Good', module: 'Product Quality', target: 8,  eliteTarget: 4,  source: 'JIRA' },
  { metric: 'Test Case Review Status',      value: 88.9, unit: '%', tier: 'Elite', module: 'Process Quality', target: 75, eliteTarget: 85, source: 'Zephyr' },
  { metric: 'Test-to-Story Ratio',          value: 47.5, unit: '%', tier: 'Needs Improvement', module: 'Process Quality', target: 60, eliteTarget: 80, source: 'JIRA' },
]

const SAMPLE_PIS = ['CY25PI1', 'CY25PI2', 'CY25PI3', 'CY25PI4', 'CY26PI1', 'CY26PI2']

const SAMPLE_PROJECTS: ProjectCoverage[] = [
  { project: 'accounting-fs-service',  byPi: { CY25PI1: 95.3, CY25PI2: 95.4, CY25PI3: 95.8, CY25PI4: 97.5, CY26PI1: 97.4, CY26PI2: 96.8 } },
  { project: 'parts-inventory-ui',     byPi: { CY25PI1: 71.2, CY25PI2: 72.8, CY25PI3: 74.1, CY25PI4: 76.0, CY26PI1: 77.3, CY26PI2: 78.9 } },
  { project: 'service-scheduler-api',  byPi: { CY25PI1: 66.5, CY25PI2: 65.9, CY25PI3: 68.3, CY25PI4: 70.2, CY26PI1: 72.8, CY26PI2: 74.5 } },
  { project: 'dms-core-platform',      byPi: { CY25PI1: 58.4, CY25PI2: 60.1, CY25PI3: 63.7, CY25PI4: 62.9, CY26PI1: 66.2, CY26PI2: 69.0 } },
  { project: 'crm-lead-engine',        byPi: { CY25PI1: 81.0, CY25PI2: 82.2, CY25PI3: 81.7, CY25PI4: 83.5, CY26PI1: 84.9, CY26PI2: 86.1 } },
  { project: 'payments-gateway',       byPi: { CY25PI1: 52.3, CY25PI2: 55.6, CY25PI3: 54.9, CY25PI4: 59.4, CY26PI1: 63.1, CY26PI2: 61.8 } },
  { project: 'telemetry-pipeline',     byPi: { CY25PI1: 74.8, CY25PI2: 73.2, CY25PI3: 76.5, CY25PI4: 78.8, CY26PI1: 79.6, CY26PI2: 81.4 } },
  { project: 'auth-identity-service',  byPi: { CY25PI1: 88.7, CY25PI2: 89.5, CY25PI3: 90.2, CY25PI4: 91.0, CY26PI1: 90.6, CY26PI2: 92.3 } },
]

// -------------------------------------------------------------- utilities

const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits)

function parseThreshold(text: string | undefined): number | null {
  if (!text) return null
  const m = String(text).match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

function normalizeTier(raw: string | undefined): Tier {
  const t = (raw || '').toLowerCase()
  if (t.includes('elite')) return 'Elite'
  if (t.includes('good')) return 'Good'
  if (t.includes('fair')) return 'Fair'
  return 'Needs Improvement'
}

function parseTop7Rows(rows: Record<string, string>[]): Kpi[] {
  const kpis: Kpi[] = []
  for (const r of rows) {
    const metric = (r['Metrics'] || '').trim()
    const value = parseFloat(r['Actual Value Tooltip'])
    if (!metric || Number.isNaN(value)) continue
    kpis.push({
      metric,
      value,
      unit: (r['Agg. Symbol'] || '%').trim(),
      tier: normalizeTier(r['Tier']),
      module: (r['Module'] || 'Other').trim(),
      target: parseThreshold(r['Tier Info Good']),
      eliteTarget: parseThreshold(r['Tier Info Elite']),
      source: (r['Data Source Info'] || 'Tableau').trim(),
    })
  }
  return kpis
}

// Tolerant parser for the coverage view: finds a project-name column and any
// numeric per-PI columns; returns [] when the shape doesn't match.
function parseCoverageRows(rows: Record<string, string>[]): ProjectCoverage[] {
  if (!rows.length) return []
  const cols = Object.keys(rows[0])
  const piCols = cols.filter(c => /PI\s*\d/i.test(c))
  const projCol = cols.find(c => /project|repo|component|application/i.test(c)) || cols[0]
  if (!piCols.length || !projCol) return []
  const byProject = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const project = (r[projCol] || '').trim()
    if (!project) continue
    const entry = byProject.get(project) || {}
    for (const pc of piCols) {
      let v = parseFloat(String(r[pc]).replace('%', ''))
      if (Number.isNaN(v)) continue
      if (v <= 1) v *= 100 // ratios → percentages
      const pi = (pc.match(/CY\d+PI\d+|PI\s*\d+/i)?.[0] || pc).replace(/\s+/g, '')
      entry[pi] = v
    }
    if (Object.keys(entry).length) byProject.set(project, entry)
  }
  return Array.from(byProject.entries()).map(([project, byPi]) => ({ project, byPi }))
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ------------------------------------------------------------- components

function TierBadge({ tier, dark }: { tier: Tier; dark: boolean }) {
  const { Icon } = TIER_STYLE[tier]
  const color = dark ? TIER_STYLE[tier].dark : TIER_STYLE[tier].light
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, border: `1px solid ${color}55`, background: `${color}14` }}
    >
      <Icon className="w-3 h-3" />
      {tier}
    </span>
  )
}

function ChartTooltip({ active, payload, label, unit = '%' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span className="font-medium">{fmt(Number(p.value))}{unit}</span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, subtitle, children, actions }: {
  title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

// ------------------------------------------------------------------- main

export function TableauInsightsDashboard() {
  const { isDarkMode } = useTheme()
  const CAT = isDarkMode ? CAT_DARK : CAT_LIGHT
  const NEUTRAL = isDarkMode ? NEUTRAL_DARK : NEUTRAL_LIGHT
  const tierColor = (t: Tier) => (isDarkMode ? TIER_STYLE[t].dark : TIER_STYLE[t].light)

  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [kpis, setKpis] = useState<Kpi[]>(SAMPLE_KPIS)
  const [projects, setProjects] = useState<ProjectCoverage[]>(SAMPLE_PROJECTS)
  const [loadNote, setLoadNote] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Filters
  const [moduleFilter, setModuleFilter] = useState<string>('All')
  const [tierFilter, setTierFilter] = useState<string>('All')
  const [piFrom, setPiFrom] = useState<string>('')
  const [piTo, setPiTo] = useState<string>('')
  const [projectSearch, setProjectSearch] = useState('')
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)

  // ---------------------------------------------------------- data loading
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 90000)

    const load = async () => {
      setLoading(true)
      setLoadNote(null)
      try {
        const status = await fetch(getApiUrl('/api/tableau/status'), { signal: controller.signal })
          .then(r => r.json())
        if (!status?.configured) {
          if (!cancelled) {
            setLive(false)
            setLoadNote('Tableau is not connected — showing sample data. Connect it under Integrations → Tableau.')
          }
          return
        }

        const [top7Res, covRes] = await Promise.all([
          fetch(getApiUrl(`/api/tableau/view-data?url=${encodeURIComponent(TOP7_VIEW_URL)}`), { signal: controller.signal }).then(r => r.json()).catch(() => null),
          fetch(getApiUrl(`/api/tableau/view-data?url=${encodeURIComponent(COVERAGE_VIEW_URL)}`), { signal: controller.signal }).then(r => r.json()).catch(() => null),
        ])
        if (cancelled) return

        const top7Rows = top7Res?.data?.rows || top7Res?.rows || []
        const parsedKpis = parseTop7Rows(top7Rows)
        const covRows = covRes?.data?.rows || covRes?.rows || []
        const parsedProjects = parseCoverageRows(covRows)

        if (parsedKpis.length) {
          setKpis(parsedKpis)
          setLive(true)
          setLastUpdated(new Date())
          if (parsedProjects.length) {
            setProjects(parsedProjects)
          } else {
            setLoadNote('KPI data is live; the coverage view returned an unrecognized shape, so trend/heatmap show sample data.')
          }
        } else {
          setLive(false)
          setLoadNote('Could not read the Top 7 metrics view — showing sample data.')
        }
      } catch {
        if (!cancelled) {
          setLive(false)
          setLoadNote('Tableau request failed or timed out — showing sample data.')
        }
      } finally {
        window.clearTimeout(timer)
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer) }
  }, [refreshTick])

  // ------------------------------------------------------------- derived
  const modules = useMemo(() => ['All', ...Array.from(new Set(kpis.map(k => k.module)))], [kpis])

  const filteredKpis = useMemo(() => kpis.filter(k =>
    (moduleFilter === 'All' || k.module === moduleFilter) &&
    (tierFilter === 'All' || k.tier === tierFilter)
  ), [kpis, moduleFilter, tierFilter])

  const allPis = useMemo(() => {
    const set = new Set<string>()
    projects.forEach(p => Object.keys(p.byPi).forEach(pi => set.add(pi)))
    return Array.from(set).sort()
  }, [projects])

  const visiblePis = useMemo(() => {
    let pis = allPis
    if (piFrom) pis = pis.filter(pi => pi >= piFrom)
    if (piTo) pis = pis.filter(pi => pi <= piTo)
    return pis
  }, [allPis, piFrom, piTo])

  const latestPi = visiblePis[visiblePis.length - 1]
  const prevPi = visiblePis[visiblePis.length - 2]

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    const list = q ? projects.filter(p => p.project.toLowerCase().includes(q)) : projects
    return [...list].sort((a, b) => (b.byPi[latestPi] ?? -1) - (a.byPi[latestPi] ?? -1))
  }, [projects, projectSearch, latestPi])

  // Trend series: portfolio average + top 3 projects (fixed color order)
  const trendData: TrendPoint[] = useMemo(() => {
    const top3 = filteredProjects.slice(0, 3)
    return visiblePis.map(pi => {
      const vals = projects.map(p => p.byPi[pi]).filter(v => v !== undefined) as number[]
      const point: TrendPoint = { pi }
      point['Portfolio average'] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0
      top3.forEach(p => { if (p.byPi[pi] !== undefined) point[p.project] = +p.byPi[pi].toFixed(1) })
      return point
    })
  }, [visiblePis, projects, filteredProjects])

  const trendSeries = useMemo(
    () => ['Portfolio average', ...filteredProjects.slice(0, 3).map(p => p.project)],
    [filteredProjects]
  )

  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { 'Elite': 0, 'Good': 0, 'Fair': 0, 'Needs Improvement': 0 }
    filteredKpis.forEach(k => { counts[k.tier] += 1 })
    return counts
  }, [filteredKpis])

  // Risks / opportunities / anomalies — computed, each with an explanation
  const insights = useMemo(() => {
    const risks: string[] = []
    const opportunities: string[] = []
    const anomalies: string[] = []

    filteredKpis.forEach(k => {
      if (k.tier === 'Needs Improvement') {
        risks.push(`${k.metric} is at ${fmt(k.value)}${k.unit} — below the Good threshold${k.target !== null ? ` (${k.target}${k.unit})` : ''}. Needs a recovery plan.`)
      } else if (k.tier === 'Fair') {
        risks.push(`${k.metric} (${fmt(k.value)}${k.unit}) is Fair — trending zone; watch next PI.`)
      }
      if (k.tier === 'Good' && k.eliteTarget !== null && k.eliteTarget - k.value <= 5 && k.eliteTarget > k.value) {
        opportunities.push(`${k.metric} is ${fmt(k.eliteTarget - k.value)}${k.unit} away from Elite (${k.eliteTarget}${k.unit}) — a small push crosses the tier.`)
      }
    })

    if (latestPi && prevPi) {
      projects.forEach(p => {
        const now = p.byPi[latestPi]; const before = p.byPi[prevPi]
        if (now === undefined || before === undefined) return
        const delta = now - before
        if (delta <= -5) anomalies.push(`${p.project} coverage dropped ${fmt(Math.abs(delta))}pts (${fmt(before)}% → ${fmt(now)}%) in ${latestPi}.`)
        if (delta >= 5) opportunities.push(`${p.project} gained ${fmt(delta)}pts coverage in ${latestPi} — worth replicating their approach.`)
      })
    }
    return { risks, opportunities, anomalies }
  }, [filteredKpis, projects, latestPi, prevPi])

  // ------------------------------------------------------------- exports
  const exportCsv = () => {
    downloadCsv(
      `tableau-executive-insights-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Metric', `Actual`, 'Unit', 'Tier', 'Module', 'Good threshold', 'Elite threshold', 'Source'],
      filteredKpis.map(k => [k.metric, k.value, k.unit, k.tier, k.module, k.target ?? '', k.eliteTarget ?? '', k.source])
    )
  }

  const copySummary = async () => {
    const lines = [
      `Tableau Executive Insights — ${new Date().toLocaleDateString()} (${live ? 'live' : 'sample'} data)`,
      ...filteredKpis.map(k => `• ${k.metric}: ${fmt(k.value)}${k.unit} [${k.tier}]`),
      ...(insights.risks.length ? ['Risks:', ...insights.risks.map(r => `  - ${r}`)] : []),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setShareNote('Summary copied to clipboard')
      setTimeout(() => setShareNote(null), 2500)
    } catch {
      setShareNote('Copy failed — clipboard unavailable')
      setTimeout(() => setShareNote(null), 2500)
    }
  }

  // Heatmap cell shading: sequential single hue (gold in dark, action blue in light), light→dark
  const heatBase = isDarkMode ? '212,168,71' : '24,120,185'
  const heatRange = useMemo(() => {
    const vals = filteredProjects.flatMap(p => visiblePis.map(pi => p.byPi[pi]).filter(v => v !== undefined)) as number[]
    return { min: Math.min(...vals, 100), max: Math.max(...vals, 0) }
  }, [filteredProjects, visiblePis])

  const heatCell = (v: number | undefined) => {
    if (v === undefined) return { background: 'transparent', color: 'var(--text-muted)' }
    const t = heatRange.max === heatRange.min ? 0.5 : (v - heatRange.min) / (heatRange.max - heatRange.min)
    const alpha = 0.08 + t * 0.77
    return {
      background: `rgba(${heatBase},${alpha.toFixed(2)})`,
      color: alpha > 0.5 ? '#13151C' : 'var(--text-primary)',
    }
  }

  const barData = filteredKpis.map(k => ({
    name: k.metric.replace(' %', ''),
    Actual: +k.value.toFixed(1),
    'Good threshold': k.target,
    tier: k.tier,
  }))

  const selected = selectedMetric ? kpis.find(k => k.metric === selectedMetric) : null

  // -------------------------------------------------------------- render
  return (
    <div className="h-full overflow-y-auto p-6 space-y-5" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: isDarkMode ? 'rgba(212,168,71,0.15)' : 'var(--accent-cool-bg)' }}>
            <BarChart3 className="w-6 h-6" style={{ color: 'var(--accent-cool)' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tableau Executive Insights
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              QCOE Top 7 metrics · Engineering Efficiency
              {lastUpdated && ` · updated ${lastUpdated.toLocaleTimeString()}`}
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
            style={live
              ? { color: 'var(--accent-cool-text)', background: 'var(--accent-cool-bg)' }
              : { color: 'var(--amber)', background: 'rgba(184,119,0,0.12)', border: '1px solid rgba(184,119,0,0.35)' }}
          >
            {live ? <Database className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {live ? 'Live data' : 'Sample data'}
          </span>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          {shareNote && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{shareNote}</span>}
          <button onClick={() => setRefreshTick(t => t + 1)} disabled={loading} title="Refresh"
            className="fx-pill h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCsv} title="Export CSV"
            className="fx-pill h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={() => window.print()} title="Print / save as PDF"
            className="fx-pill h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button onClick={copySummary} title="Copy executive summary"
            className="fx-pill h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ background: 'var(--accent-cool)', color: isDarkMode ? '#13151C' : 'var(--btn-primary-fg)' }}>
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
        </div>
      </div>

      {loadNote && (
        <div className="rounded-lg px-3 py-2 text-xs"
          style={{ color: 'var(--amber)', border: '1px solid rgba(184,119,0,0.35)', background: 'rgba(184,119,0,0.08)' }}>
          {loadNote}
        </div>
      )}

      {/* Filters — one row above the charts */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-hint)' }}>Filters</label>
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
          className="h-8 rounded-lg px-2 text-xs"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          {modules.map(m => <option key={m} value={m}>{m === 'All' ? 'All modules' : m}</option>)}
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="h-8 rounded-lg px-2 text-xs"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="All">All tiers</option>
          {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={piFrom} onChange={e => setPiFrom(e.target.value)}
          className="h-8 rounded-lg px-2 text-xs"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="">From: first PI</option>
          {allPis.map(pi => <option key={pi} value={pi}>From {pi}</option>)}
        </select>
        <select value={piTo} onChange={e => setPiTo(e.target.value)}
          className="h-8 rounded-lg px-2 text-xs"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="">To: latest PI</option>
          {allPis.map(pi => <option key={pi} value={pi}>To {pi}</option>)}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Search projects…"
            className="h-8 rounded-lg pl-7 pr-2 text-xs w-44"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {filteredKpis.map(k => (
          <button key={k.metric} onClick={() => setSelectedMetric(selectedMetric === k.metric ? null : k.metric)}
            className="text-left rounded-xl p-4 transition-all hover:shadow-md"
            style={{
              background: 'var(--bg-card)',
              border: selectedMetric === k.metric
                ? `1.5px solid ${tierColor(k.tier)}`
                : '1px solid var(--border)',
            }}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>{k.metric}</span>
              <TierBadge tier={k.tier} dark={isDarkMode} />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {fmt(k.value)}<span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>{k.unit}</span>
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {k.target !== null ? `Good ≥ ${k.target}${k.unit}` : k.module}
              {k.eliteTarget !== null && ` · Elite ≥ ${k.eliteTarget}${k.unit}`}
            </div>
          </button>
        ))}
      </div>

      {/* Drill-down detail */}
      {selected && (
        <Panel
          title={`Drill-down — ${selected.metric}`}
          subtitle={`${selected.module} · source: ${selected.source} · click the tile again to close`}
          actions={
            <button onClick={() => setSelectedMetric(null)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          }
        >
          <div className="flex flex-wrap gap-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div>
              <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Current</div>
              <div className="text-xl font-semibold tabular-nums" style={{ color: tierColor(selected.tier) }}>
                {fmt(selected.value)}{selected.unit}
              </div>
              <div className="mt-1"><TierBadge tier={selected.tier} dark={isDarkMode} /></div>
            </div>
            <div>
              <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Tier thresholds</div>
              <ul className="space-y-0.5">
                {selected.eliteTarget !== null && <li>Elite ≥ {selected.eliteTarget}{selected.unit}</li>}
                {selected.target !== null && <li>Good ≥ {selected.target}{selected.unit}</li>}
                <li>Distance to next tier: {selected.eliteTarget !== null && selected.value < selected.eliteTarget
                  ? `${fmt(selected.eliteTarget - selected.value)}${selected.unit} to Elite`
                  : 'top tier reached'}</li>
              </ul>
            </div>
            {selected.metric.toLowerCase().includes('coverage') && (
              <div className="flex-1 min-w-[260px]">
                <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  Projects — latest ({latestPi})
                </div>
                <div className="max-h-40 overflow-y-auto pr-2">
                  {filteredProjects.map(p => (
                    <div key={p.project} className="flex items-center justify-between py-0.5 gap-3">
                      <span className="truncate">{p.project}</span>
                      <span className="tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                        {fmt(p.byPi[latestPi])}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Charts row: actual vs threshold + tier mix */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Panel title="Actuals vs Good threshold" subtitle="All metrics, current period">
          <ResponsiveContainer width="100%" height={filteredKpis.length * 44 + 60}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 24, top: 4 }} barGap={2}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} unit="%" stroke="var(--border)" />
              <YAxis type="category" dataKey="name" width={170} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} stroke="transparent" />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              <Bar dataKey="Actual" fill={CAT[0]} radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="Good threshold" fill={NEUTRAL} radius={[0, 4, 4, 0]} barSize={5} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Tier mix" subtitle={`${filteredKpis.length} metrics by health tier`}>
          <div className="flex h-7 w-full rounded-lg overflow-hidden" style={{ gap: 2 }}>
            {TIER_ORDER.filter(t => tierCounts[t] > 0).map(t => (
              <div key={t} title={`${t}: ${tierCounts[t]}`}
                style={{ flex: tierCounts[t], background: tierColor(t), minWidth: 24 }}
                className="flex items-center justify-center text-[11px] font-bold"
              >
                <span style={{ color: isDarkMode ? '#13151C' : '#FFFFFF' }}>{tierCounts[t]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {TIER_ORDER.map(t => {
              const { Icon } = TIER_STYLE[t]
              return (
                <div key={t} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: tierColor(t) }} />
                  <span>{t}</span>
                  <span className="ml-auto font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{tierCounts[t]}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 space-y-2">
            {insights.opportunities.slice(0, 2).map((o, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <TrendingUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: tierColor('Elite') }} />
                {o}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Trend + heatmap */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Panel title="Unit testing coverage trend" subtitle="Portfolio average and top projects by PI">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ left: 0, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis dataKey="pi" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
              <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} unit="%" stroke="transparent" width={44} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {trendSeries.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={CAT[i % CAT.length]}
                  strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Coverage heatmap" subtitle="Projects × program increments — darker is higher coverage">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="text-left font-medium py-1 pr-2" style={{ color: 'var(--text-muted)' }}>Project</th>
                  {visiblePis.map(pi => (
                    <th key={pi} className="font-medium px-1 py-1 text-center" style={{ color: 'var(--text-muted)' }}>{pi.replace('CY', '')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.slice(0, 10).map(p => (
                  <tr key={p.project}>
                    <td className="pr-2 py-0.5 truncate max-w-[150px]" style={{ color: 'var(--text-secondary)' }} title={p.project}>
                      {p.project}
                    </td>
                    {visiblePis.map(pi => (
                      <td key={pi} className="text-center rounded px-1.5 py-1 tabular-nums font-medium" style={heatCell(p.byPi[pi])}>
                        {p.byPi[pi] !== undefined ? fmt(p.byPi[pi], 0) : '·'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProjects.length > 10 && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Showing top 10 of {filteredProjects.length} projects — use search to narrow.
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* Risks & opportunities */}
      <Panel title="Risks, opportunities & anomalies" subtitle="Computed from current tiers and PI-over-PI movement">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: tierColor('Needs Improvement') }}>
              <AlertCircle className="w-3.5 h-3.5" /> Risks ({insights.risks.length})
            </div>
            <ul className="space-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {insights.risks.length ? insights.risks.map((r, i) => <li key={i}>• {r}</li>) : <li>No metric currently below Good.</li>}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: tierColor('Elite') }}>
              <TrendingUp className="w-3.5 h-3.5" /> Opportunities ({insights.opportunities.length})
            </div>
            <ul className="space-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {insights.opportunities.length ? insights.opportunities.map((o, i) => <li key={i}>• {o}</li>) : <li>No near-tier or fast-improving items detected.</li>}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--amber)' }}>
              <TrendingDown className="w-3.5 h-3.5" /> Anomalies ({insights.anomalies.length})
            </div>
            <ul className="space-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {insights.anomalies.length ? insights.anomalies.map((a, i) => <li key={i}>• {a}</li>) : <li>No sharp PI-over-PI drops detected.</li>}
            </ul>
          </div>
        </div>
      </Panel>

      <p className="text-[11px] pb-2" style={{ color: 'var(--text-hint)' }}>
        Sources: Tableau — Engineering Efficiency Top 7 View (Actuals), Unit Testing Coverage
        {live ? '' : ' · currently showing representative sample data'}
      </p>
    </div>
  )
}
