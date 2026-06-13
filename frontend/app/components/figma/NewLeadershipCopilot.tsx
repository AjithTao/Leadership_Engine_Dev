'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import {
  Send, Loader2, Trash2, Sparkles,
  BarChart3, Users, Target, Calendar, Download, FileText,
  ChevronDown, ChevronLeft, ChevronRight, Mic, Square, Copy, CheckCircle,
  BookOpen, ExternalLink, Crown, Shield, Clock,
  PenSquare, Database, FileSearch, ArrowRight, List, Hash
} from 'lucide-react'
import { ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useChat } from '../../contexts/ChatContext'
import type { Message, ChatSession } from '../../contexts/ChatContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useSettings } from '../../contexts/SettingsContext'
import { WelcomePopup } from '../WelcomePopup'
import { exportChatAsPDF, exportChatAsExcel, useVoiceToText } from '../../utils/exportUtils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { getApiUrl } from '../../../lib/api-config'

interface NewLeadershipCopilotProps {
  hasActiveConnections: boolean
  theme: 'light' | 'dark'
  quickActionPrompt?: string | null
  onPromptSent?: () => void
  integrations?: string[]
  setIntegrations?: (v: string[] | ((p: string[]) => string[])) => void
  uploadedDocReady?: boolean
  setUploadedDocReady?: (v: boolean) => void
}

// ── Time grouping ─────────────────────────────────────────────────────────────
function groupSessions(sessions: ChatSession[]): { label: string; items: ChatSession[] }[] {
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 7 * 86400000

  const sorted = [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const today = sorted.filter(s => new Date(s.updatedAt).getTime() >= todayStart)
  const yesterday = sorted.filter(s => {
    const t = new Date(s.updatedAt).getTime()
    return t >= yesterdayStart && t < todayStart
  })
  const week = sorted.filter(s => {
    const t = new Date(s.updatedAt).getTime()
    return t >= weekStart && t < yesterdayStart
  })
  const older = sorted.filter(s => new Date(s.updatedAt).getTime() < weekStart)

  const groups: { label: string; items: ChatSession[] }[] = []
  if (today.length) groups.push({ label: 'Today', items: today })
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday })
  if (week.length) groups.push({ label: 'This Week', items: week })
  if (older.length) groups.push({ label: 'Older', items: older })
  return groups
}

function formatSessionMeta(session: ChatSession): string {
  const updated = new Date(session.updatedAt)
  const now = new Date()
  const sameDay = updated.toDateString() === now.toDateString()
  const timeLabel = sameDay
    ? updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : updated.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return `${session.messages.length} msg${session.messages.length !== 1 ? 's' : ''} · ${timeLabel}`
}

// ── TypingIndicator ───────────────────────────────────────────────────────────
function TypingIndicator({ accent, loadingMsg }: { accent: string; loadingMsg: string }) {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${accent}18` }}>
        <Sparkles className="w-3 h-3" style={{ color: accent }} />
      </div>
      <div className="flex items-center gap-3 mt-[7px]">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span key={i} className="block w-1.5 h-1.5 rounded-full" style={{
              backgroundColor: accent,
              animation: 'wbPulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.18}s`,
            }} />
          ))}
        </div>
        {loadingMsg && <span className="text-xs" style={{ color: `${accent}90` }}>{loadingMsg}</span>}
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ accent, text, textSecondary, border, onSuggestion, userName }: {
  accent: string; text: string; textSecondary: string; border: string; onSuggestion: (s: string) => void; userName: string
}) {
  const suggestions = [
    { icon: BarChart3, category: 'Quality metrics', text: 'Show me the NDP project defect leakage for last week' },
    { icon: BookOpen,  category: 'Confluence docs', text: 'What is the Master Repo URL for GL Inquiry in EMT space' },
    { icon: Users,     category: 'Team bugs',       text: 'show me "Ramesh, Ajith" open bugs reported during December 2025 in NDP Project' },
    { icon: Calendar,  category: 'Jira activity',   text: 'What Jira ID is fixed yesterday for GL Enquiry Workflow in EMT space' },
    { icon: Target,    category: 'Story details',   text: 'Give me NDP-20290 story details' },
  ]
  return (
    <div className="flex flex-col items-center justify-center h-full text-center select-none px-6 py-10">
      <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-4" style={{ backgroundColor: `${accent}1A`, border: `1px solid ${accent}38` }}>
        <Sparkles className="w-[22px] h-[22px]" style={{ color: accent }} />
      </div>
      <h2 className="text-[22px] font-semibold tracking-tight mb-2" style={{ color: text }}>Work Buddy</h2>
      <p className="text-sm leading-relaxed max-w-md mb-8" style={{ color: textSecondary }}>
        {userName}, ask anything about your Jira projects, Confluence docs, or leadership insights.
      </p>

      <div className="w-full max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-left" style={{ color: `${textSecondary}99` }}>
          Suggested prompts
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {suggestions.map(({ icon: Icon, category, text: s }, idx) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className={`group relative flex items-start gap-3 text-left px-4 py-3.5 rounded-2xl border transition-all duration-150 hover:-translate-y-0.5 ${idx === suggestions.length - 1 ? 'sm:col-span-2' : ''}`}
              style={{ borderColor: `${border}`, backgroundColor: `${accent}08` }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}50`; e.currentTarget.style.backgroundColor = `${accent}12` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = `${border}`;   e.currentTarget.style.backgroundColor = `${accent}08` }}
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-[9px] flex-shrink-0" style={{ backgroundColor: `${accent}1F`, color: accent }}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex flex-col">
                <span className="text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: accent }}>{category}</span>
                <span className="text-[13px] leading-snug pr-5" style={{ color: text }}>{s}</span>
              </span>
              <ArrowRight className="w-[15px] h-[15px] absolute right-3.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: textSecondary }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── CitationFooter ────────────────────────────────────────────────────────────
function CitationFooter({ citations, accent, border, textSecondary }: {
  citations: any[]; accent: string; border: string; textSecondary: string
}) {
  const [open, setOpen] = useState(false)
  if (!citations || citations.length === 0) return null
  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: `${border}20` }}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80" style={{ color: textSecondary }}>
        <BookOpen className="w-3.5 h-3.5" />
        <span>{citations.length} source{citations.length !== 1 ? 's' : ''}</span>
        <ChevronDown className="w-3 h-3 transition-transform duration-150" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {citations.map((cite: any, idx: number) => (
            <a key={idx} href={cite.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ color: accent, backgroundColor: `${accent}0A` }}>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1 truncate">{cite.title}</span>
              <span style={{ color: textSecondary }}>{Math.round(cite.confidence * 100)}%</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ResponseBadges ────────────────────────────────────────────────────────────
function ResponseBadges({ isLeadershipMode, dataSource, accent, textSecondary }: {
  isLeadershipMode?: boolean; dataSource?: string; accent: string; textSecondary: string
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isLeadershipMode && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
          <Crown className="w-2.5 h-2.5" /> Leadership
        </span>
      )}
      {dataSource === 'live_jira_data' && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Shield className="w-2.5 h-2.5" /> Live
        </span>
      )}
      {dataSource && dataSource !== 'live_jira_data' && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${textSecondary}12`, color: textSecondary, border: `1px solid ${textSecondary}25` }}>
          <Clock className="w-2.5 h-2.5" /> Cached
        </span>
      )}
    </div>
  )
}

type AssistantVisualization = {
  kind: 'defectLeakage'
  title: string
  subtitle: string
  chartData: Array<{ name: string; value: number; fill: string }>
  metrics: Array<{ label: string; value: string }>
}

function extractPeriodLabel(query: string): string {
  const q = query.toLowerCase()
  if (q.includes('last month')) return 'Last month'
  if (q.includes('last week')) return 'Last week'
  if (q.includes('this month')) return 'This month'
  if (q.includes('this week')) return 'This week'
  if (q.includes('this quarter')) return 'This quarter'
  if (q.includes('last quarter')) return 'Last quarter'
  return 'Requested period'
}

function buildAssistantVisualization(query: string, responseText: string): AssistantVisualization | undefined {
  if (!/defect leakage/i.test(query) && !/defect leakage/i.test(responseText)) return undefined

  const rateMatch =
    responseText.match(/defect leakage(?: rate)?(?: is| at)?\s*(\d+(?:\.\d+)?)%/i) ||
    responseText.match(/(\d+(?:\.\d+)?)%\s*(?:defect leakage|leakage rate)/i)

  if (!rateMatch) return undefined

  const leakageRate = Number(rateMatch[1])
  if (Number.isNaN(leakageRate)) return undefined

  const totalIssuesMatch = responseText.match(/out of\s+(\d+)\s+total issues/i)
  const caughtMatch =
    responseText.match(/(\d+)\s+bugs?\s+were caught/i) ||
    responseText.match(/(\d+)\s+bugs?\s+caught/i)
  const escapedMatch = responseText.match(/(\d+)\s+defects?\s+escaped/i)

  const totalIssues = totalIssuesMatch ? Number(totalIssuesMatch[1]) : undefined
  const caughtBugs = caughtMatch ? Number(caughtMatch[1]) : undefined
  const escapedDefects = escapedMatch ? Number(escapedMatch[1]) : undefined
  const containmentRate = Math.max(0, Number((100 - leakageRate).toFixed(1)))

  const metrics = [
    { label: 'Leakage Rate', value: `${leakageRate.toFixed(1)}%` },
    ...(typeof totalIssues === 'number' ? [{ label: 'Total Issues', value: String(totalIssues) }] : []),
    ...(typeof escapedDefects === 'number' ? [{ label: 'Escaped', value: String(escapedDefects) }] : []),
    ...(typeof caughtBugs === 'number' ? [{ label: 'Caught Earlier', value: String(caughtBugs) }] : []),
  ]

  return {
    kind: 'defectLeakage',
    title: 'Defect Leakage Snapshot',
    subtitle: extractPeriodLabel(query),
    chartData: [
      { name: 'Leakage', value: Number(leakageRate.toFixed(1)), fill: '#D4A63F' },
      { name: 'Contained', value: containmentRate, fill: 'rgba(212,166,63,0.28)' },
    ],
    metrics,
  }
}

function VisualizationCard({
  visualization,
  accent,
  border,
  text,
  textSecondary,
}: {
  visualization: AssistantVisualization
  accent: string
  border: string
  text: string
  textSecondary: string
}) {
  if (visualization.kind !== 'defectLeakage') return null

  return (
    <div
      className="mt-4 rounded-[22px] border p-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderColor: `${border}30`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold" style={{ color: text }}>{visualization.title}</p>
          <p className="text-xs mt-1" style={{ color: textSecondary }}>{visualization.subtitle}</p>
        </div>
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: accent, backgroundColor: `${accent}12`, border: `1px solid ${accent}22` }}
        >
          <BarChart3 className="w-3 h-3" />
          Analysis View
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px] gap-4 items-start">
        <div className="h-52 rounded-2xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: `1px solid ${border}20` }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={visualization.chartData} layout="vertical" margin={{ top: 8, right: 18, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={`${border}25`} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: textSecondary, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={78}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{
                  backgroundColor: '#1F2330',
                  border: `1px solid ${border}50`,
                  borderRadius: 14,
                  color: '#E7EAF2',
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value}%`, 'Value']}
              />
              <Bar dataKey="value" radius={[0, 10, 10, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
          {visualization.metrics.map(metric => (
            <div
              key={metric.label}
              className="rounded-2xl px-3.5 py-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: `1px solid ${border}20` }}
            >
              <p className="text-[10px] uppercase tracking-wide" style={{ color: textSecondary }}>{metric.label}</p>
              <p className="text-sm font-semibold mt-1" style={{ color: text }}>{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Jira story detail ───────────────────────────────────────────────────────────
type StoryDetail = {
  key: string
  title: string
  status?: string
  fields: Array<{ label: string; value: string }>
  link?: string
  description?: string
}

function formatJiraDate(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Parse a Work Buddy story-lookup response into structured fields.
 *  Returns undefined unless it clearly looks like a single-issue readout. */
function buildStoryDetail(_query: string, text: string): StoryDetail | undefined {
  if (!text) return undefined
  const clean = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')

  const keyTitle = clean.match(/([A-Z][A-Z0-9]+-\d+)\s*[—–-]\s*([^\n]+)/)
  const key = keyTitle?.[1]
  if (!key) return undefined
  const title = (keyTitle?.[2]?.trim() || key).replace(/\*+$/, '').replace(/^#+\s*/, '').trim()

  const grab = (label: string) => {
    const m = clean.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'))
    return m?.[1]?.trim() || undefined
  }
  const status = grab('Status')
  const priority = grab('Priority')
  const reporter = grab('Reporter')
  const assignee = grab('Assignee')
  const created = grab('Created')
  const updated = grab('Updated')
  const link = grab('Link')

  const present = [status, priority, reporter, assignee, created, updated].filter(Boolean)
  if (present.length < 3) return undefined

  const fields: StoryDetail['fields'] = []
  if (priority) fields.push({ label: 'Priority', value: priority })
  if (reporter) fields.push({ label: 'Reporter', value: reporter })
  if (assignee) fields.push({ label: 'Assignee', value: assignee })
  if (created)  fields.push({ label: 'Created', value: formatJiraDate(created) })
  if (updated)  fields.push({ label: 'Updated', value: formatJiraDate(updated) })

  const fieldLine = /^\s*(Status|Priority|Reporter|Assignee|Created|Updated|Link|Type|Resolution|Sprint|Labels|Components|Fix Version)\s*:/i
  const description = clean.split('\n')
    .filter(l => !fieldLine.test(l) && !(keyTitle && l.includes(keyTitle[0])))
    .join('\n')
    .replace(/\*+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || undefined

  return {
    key,
    title,
    status,
    fields,
    link: link && /^https?:\/\//i.test(link) ? link : undefined,
    description,
  }
}

function statusTone(status: string | undefined): string {
  const s = (status || '').toLowerCase()
  if (/(done|accepted|closed|resolved|complete|fixed|passed)/.test(s)) return '#34D399'
  if (/(progress|review|testing|qa|reopen)/.test(s)) return '#60A5FA'
  if (/(block|reject|fail|cancel)/.test(s)) return '#F87171'
  return '#8B93A8'
}

function priorityTone(priority: string | undefined, accent: string): string {
  const s = (priority || '').toLowerCase()
  if (/(highest|critical|blocker)/.test(s)) return '#F87171'
  if (/high/.test(s)) return '#FB923C'
  if (/medium/.test(s)) return accent
  if (/low(est)?/.test(s)) return '#34D399'
  return '#8B93A8'
}

function StoryDetailCard({ storyDetail, accent, border, text, textSecondary, surface }: {
  storyDetail: StoryDetail; accent: string; border: string; text: string; textSecondary: string; surface: string
}) {
  const tone = statusTone(storyDetail.status)
  const cells = [...storyDetail.fields]
  if (cells.length % 2 === 1) cells.push({ label: '', value: '' })

  return (
    <div className="mt-4 max-w-2xl rounded-[18px] border overflow-hidden" style={{ backgroundColor: surface, borderColor: `${border}99`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
      {/* Header */}
      <div className="flex items-start gap-3 px-[18px] py-4" style={{ borderBottom: `1px solid ${border}80` }}>
        <span className="flex-shrink-0 font-mono text-[11.5px] font-bold px-2.5 py-1 rounded-lg" style={{ backgroundColor: `${accent}24`, border: `1px solid ${accent}55`, color: accent }}>
          {storyDetail.key}
        </span>
        <span className="flex-1 text-[15px] font-semibold leading-snug" style={{ color: text, letterSpacing: '-0.01em' }}>
          {storyDetail.title}
        </span>
        {storyDetail.status && (
          <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${tone}22`, color: tone, border: `1px solid ${tone}50` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone }} />
            {storyDetail.status}
          </span>
        )}
      </div>

      {/* Field grid */}
      <div className="grid grid-cols-2">
        {cells.map((f, i) => (
          <div
            key={i}
            className="px-[18px] py-3"
            style={{
              borderBottom: `1px solid ${border}66`,
              borderRight: i % 2 === 0 ? `1px solid ${border}66` : undefined,
            }}
          >
            {f.label && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>{f.label}</p>
                <p className="text-[13px] flex items-center gap-2" style={{ color: text }}>
                  {f.label === 'Priority' && <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: priorityTone(f.value, accent) }} />}
                  {f.value}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Description */}
      {storyDetail.description && (
        <div className="px-[18px] py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Description</p>
          <p className="text-[13px] leading-relaxed" style={{ color: text }}>{storyDetail.description}</p>
        </div>
      )}

      {/* Footer */}
      {storyDetail.link && (
        <div className="px-[18px] py-3" style={{ borderTop: `1px solid ${border}66` }}>
          <a
            href={storyDetail.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ color: accent, border: `1px solid ${accent}45`, backgroundColor: `${accent}0E` }}
          >
            Open in Jira
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  )
}

// ── Jira issue list ─────────────────────────────────────────────────────────────
type IssueListItem = { key: string; title: string; status?: string; priority?: string }
type IssueList = { count: number; items: IssueListItem[] }

/** Parse a multi-issue Work Buddy response (e.g. "Found 10 issues:" + KEY — title rows). */
function buildIssueList(_query: string, text: string): IssueList | undefined {
  if (!text) return undefined
  const clean = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
  const re = /([A-Z][A-Z0-9]+-\d+)\s*[—–-]\s*([^\n]+)/g
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(clean)) !== null) matches.push(m)
  if (matches.length < 2) return undefined

  const items: IssueListItem[] = matches.map((mat, idx) => {
    const start = mat.index + mat[0].length
    const end = idx + 1 < matches.length ? matches[idx + 1].index : clean.length
    const seg = clean.slice(start, end)
    const status = seg.match(/Status\s*:\s*([^,\n]+)/i)?.[1]?.trim()
    const priority = seg.match(/Priority\s*:\s*([^,\n]+)/i)?.[1]?.trim()
    const title = mat[2].trim().replace(/\*+$/, '').replace(/\s+$/, '')
    return { key: mat[1], title, status, priority }
  })

  const countM = clean.match(/found\s+(\d+)\s+issues?/i) || clean.match(/(\d+)\s+issues?\s+found/i)
  const count = countM ? Number(countM[1]) : items.length
  return { count, items }
}

function IssueListCard({ issueList, accent, border, text, textSecondary, surface }: {
  issueList: IssueList; accent: string; border: string; text: string; textSecondary: string; surface: string
}) {
  return (
    <div className="mt-4 max-w-2xl rounded-2xl border overflow-hidden" style={{ backgroundColor: surface, borderColor: `${border}99` }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${border}80` }}>
        <List className="w-[15px] h-[15px]" style={{ color: accent }} />
        <span className="text-[12.5px] font-semibold" style={{ color: text }}>Issues</span>
        <span className="ml-auto text-[11px]" style={{ color: textSecondary }}>{issueList.count} found</span>
      </div>
      {/* Rows */}
      <div className="overflow-y-auto wb-scroll" style={{ maxHeight: 380 }}>
        {issueList.items.map((it, i) => {
          const tone = statusTone(it.status)
          return (
            <div
              key={`${it.key}-${i}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors"
              style={{ borderBottom: i < issueList.items.length - 1 ? `1px solid ${border}59` : undefined }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${accent}0D` }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <span
                className="flex-shrink-0 font-mono text-[11px] font-bold px-2 py-1 rounded-md text-center"
                style={{ backgroundColor: `${accent}1A`, border: `1px solid ${accent}40`, color: accent, minWidth: 124 }}
              >
                {it.key}
              </span>
              <span className="flex-1 min-w-0 text-[13px] truncate" style={{ color: text }} title={it.title}>
                {it.title}
              </span>
              {it.status && (
                <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${tone}26`, color: tone }}>
                  <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: tone }} />
                  {it.status}
                </span>
              )}
              {it.priority && (
                <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: textSecondary, minWidth: 76 }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: priorityTone(it.priority, accent) }} />
                  {it.priority}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Count stat ──────────────────────────────────────────────────────────────────
type CountStatData = { count: number; label: string }

/** Parse a count-only answer ("There are 1,476 test cases in MODDWTC …") into a stat. */
function buildCountStat(_query: string, text: string): CountStatData | undefined {
  if (!text) return undefined
  const m = text.match(/^\s*There (?:are|is)\s+\*{0,2}([\d,]+)\*{0,2}\s+(.+?)\.?\s*$/i)
  if (!m) return undefined
  const count = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(count)) return undefined
  const label = m[2].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  return { count, label }
}

function CountStat({ countStat, accent, border, textSecondary }: {
  countStat: CountStatData; accent: string; border: string; textSecondary: string
}) {
  // Count-up animation on mount (easeOutCubic)
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = countStat.count
    if (!Number.isFinite(target) || target <= 0) { setDisplay(target || 0); return }
    const duration = 750
    let raf = 0
    let startTs: number | null = null
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [countStat.count])

  return (
    <div className="mt-4 w-fit flex items-center gap-4 rounded-2xl border px-5 py-4" style={{ borderColor: `${border}B3`, backgroundColor: `${accent}0D` }}>
      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: `${accent}29`, border: `1px solid ${accent}52` }}>
        <Hash className="w-[22px] h-[22px]" style={{ color: accent }} />
      </span>
      <span className="min-w-0">
        <span className="block font-bold leading-none tabular-nums" style={{ fontSize: 30, color: accent, letterSpacing: '-0.02em' }}>{display.toLocaleString()}</span>
        <span className="block mt-1.5 text-[13px] leading-snug" style={{ color: textSecondary }}>{countStat.label}</span>
      </span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function NewLeadershipCopilot({
  hasActiveConnections,
  theme,
  quickActionPrompt,
  onPromptSent,
  integrations: integrationsProp = [],
  setIntegrations: setIntegrationsProp,
  uploadedDocReady = false,
}: NewLeadershipCopilotProps) {
  const { currentTheme, isDarkMode } = useTheme()
  const { settings, isLoaded } = useSettings()
  const { primary, accent, surface, surfaceVariant, text, textSecondary, border, background } = currentTheme.colors

  // ── ChatContext: the single source of truth ────────────────────────────────
  const {
    messages, addMessage, updateMessage, clearMessages, isLoading, setIsLoading,
    sessions, currentSessionId, createNewSession, switchSession, deleteSession,
  } = useChat()

  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false)
  const [showWelcomePopup, setShowWelcomePopup] = useState(false)
  const [userHasTyped, setUserHasTyped] = useState(false)
  const [showManualRoutingPopup, setShowManualRoutingPopup] = useState(false)
  const [hasShownManualRoutingPopup, setHasShownManualRoutingPopup] = useState(false)
  const [integrationsLocal, setIntegrationsLocal] = useState<string[]>([])
  const [lastMentionedProject, setLastMentionedProject] = useState<string | null>(null)
  const [cachedProjects, setCachedProjects] = useState<Record<string, any>>({})

  const integrations = integrationsProp ?? integrationsLocal
  const setIntegrations = setIntegrationsProp ?? setIntegrationsLocal

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevIntegrationsRef = useRef<string[]>([])

  const { isListening, transcript, isSupported, startListening, stopListening, resetTranscript } = useVoiceToText()

  // Reset typing state when switching sessions
  useEffect(() => {
    setIsTyping(false)
    setIsLoading(false)
    setLoadingMessage('')
  }, [currentSessionId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Welcome popup
  useEffect(() => {
    if (isLoaded) {
      const t = setTimeout(() => setShowWelcomePopup(true), 1200)
      return () => clearTimeout(t)
    }
  }, [isLoaded])

  // Voice transcript → input
  useEffect(() => {
    if (transcript) { setInput(transcript); setUserHasTyped(true) }
  }, [transcript])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 220) + 'px'
    }
  }, [input])

  // Manual routing popup
  useEffect(() => {
    const prev = prevIntegrationsRef.current.length
    const cur = integrations.length
    if (prev === 0 && cur > 0 && !hasShownManualRoutingPopup) {
      setShowManualRoutingPopup(true)
      setHasShownManualRoutingPopup(true)
    }
    prevIntegrationsRef.current = integrations
  }, [integrations, hasShownManualRoutingPopup])

  useEffect(() => {
    if (integrations.length === 0) setHasShownManualRoutingPopup(false)
  }, [integrations.length])

  // Quick action prompt
  useEffect(() => {
    if (quickActionPrompt && onPromptSent) {
      setInput(quickActionPrompt)
      setTimeout(() => { sendMessage(quickActionPrompt); onPromptSent() }, 100)
    }
  }, [quickActionPrompt])

  // ── Project context detection ────────────────────────────────────────────
  const detectProject = (userInput: string): string | null => {
    const patterns = [/ces-?\d+/i, /ccm-?\d+/i, /hcat-?\d+/i, /project\s+(ces|ccm|hcat)/i]
    for (const p of patterns) {
      const m = userInput.match(p)
      if (m) return m[0].toUpperCase().replace(/\s+/g, '')
    }
    if (/\b(all|every|combined)\b/.test(userInput)) return 'ALL'
    if (/\b(this|that|it)\b/.test(userInput)) return lastMentionedProject
    return null
  }

  // ── Core API call (shared by sendMessage and handleSourceSearch) ──────────
  const callChatApi = useCallback(async (
    userInput: string,
    source: string,
    projectCtx: string,
    historyForApi: { role: string; content: string }[],
  ) => {
    const response = await fetch(getApiUrl(`/api/chat`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userInput,
        source,
        context: 'leadership_copilot',
        projectContext: projectCtx,
        cachedProjects,
        integrations: source === 'auto' ? [] : [source],
        messages: historyForApi,
      }),
    })
    return response
  }, [cachedProjects])

  // ── Handle Jira / Confluence button click ─────────────────────────────────
  const handleSourceSearch = useCallback(async (source: string, query: string, buttonMsgIndex: number) => {
    if (isTyping) return

    // Mark buttons as used so they become disabled
    updateMessage(buttonMsgIndex, { buttonsUsed: true })

    setIsTyping(true)
    setIsLoading(true)
    const loadingMsgs = [`Searching ${source === 'jira' ? 'Jira' : 'Confluence'}…`, 'Retrieving results…', 'Almost there…']
    let li = 0
    setLoadingMessage(loadingMsgs[0])
    const msgInterval = setInterval(() => {
      li = (li + 1) % loadingMsgs.length
      setLoadingMessage(loadingMsgs[li])
    }, 1800)

    try {
      const projectCtx = lastMentionedProject ?? 'all'
      const historyForApi = messages.slice(-6).map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))

      const response = await callChatApi(query, source, projectCtx, historyForApi)

      if (response.ok) {
        const data = await response.json()
        const isLeadershipMode = !!(data as any).auto_leadership_mode
        let contentText =
          typeof data.answer === 'string' ? data.answer :
          typeof data.response === 'string' ? data.response :
          typeof data.message === 'string' ? data.message :
          JSON.stringify(data)
        if (isLeadershipMode && (data as any).message) {
          contentText = `${(data as any).message}\n\n${contentText}`
        }
        if (data.mode === 'export' && data.export_data) {
          const { filename, data: excelData } = data.export_data
          const blob = new Blob([Uint8Array.from(atob(excelData), c => c.charCodeAt(0))], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = filename
          document.body.appendChild(a); a.click()
          document.body.removeChild(a); URL.revokeObjectURL(url)
        }
        addMessage({
          role: 'assistant',
          content: contentText,
          metadata: { visualization: buildAssistantVisualization(query, contentText), storyDetail: buildStoryDetail(query, contentText), issueList: buildIssueList(query, contentText), countStat: buildCountStat(query, contentText) },
          isLeadershipMode,
          dataSource: (data as any).data_source,
          lastUpdated: (data as any).last_updated,
          ragCitations: (data as any).rag_citations || [],
          ragContextUsed: (data as any).rag_context_used || 0,
        })
      } else {
        addMessage({ role: 'assistant', content: `Failed to fetch results from ${source}. Please try again.` })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const isNetwork = msg.includes('Failed to fetch') || msg.includes('NetworkError')
      addMessage({
        role: 'assistant',
        content: isNetwork
          ? "Can't reach the backend. Make sure the server is running on port 8000."
          : `Error: ${msg}`,
      })
    } finally {
      clearInterval(msgInterval)
      setIsTyping(false)
      setIsLoading(false)
      setLoadingMessage('')
    }
  }, [isTyping, messages, lastMentionedProject, callChatApi, addMessage, updateMessage, setIsLoading])

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideInput?: string) => {
    const userInput = (overrideInput ?? input).trim()
    if (!userInput || isTyping) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setUserHasTyped(true)
    if (isListening) { stopListening(); resetTranscript() }

    const detectedProject = detectProject(userInput)
    if (detectedProject && detectedProject !== 'ALL') setLastMentionedProject(detectedProject)

    // Add user message to ChatContext (persists automatically)
    addMessage({ role: 'user', content: userInput })

    // If an uploaded doc is ready, query it directly (no source selection needed)
    if (uploadedDocReady) {
      setIsTyping(true)
      setIsLoading(true)
      setLoadingMessage('Searching document…')
      try {
        const response = await fetch(getApiUrl(`/api/domain/qa`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userInput, k: 5 }),
        })
        if (response.ok) {
          const data = await response.json()
          const contentText =
            typeof data.answer === 'string' ? data.answer :
            typeof data.response === 'string' ? data.response :
            JSON.stringify(data)
          addMessage({
            role: 'assistant',
            content: contentText,
            metadata: { visualization: buildAssistantVisualization(userInput, contentText), storyDetail: buildStoryDetail(userInput, contentText), issueList: buildIssueList(userInput, contentText), countStat: buildCountStat(userInput, contentText) },
          })
        } else {
          addMessage({ role: 'assistant', content: 'Failed to search document. Please try again.' })
        }
      } catch {
        addMessage({ role: 'assistant', content: "Can't reach the backend. Make sure the server is running on port 8000." })
      } finally {
        setIsTyping(false)
        setIsLoading(false)
        setLoadingMessage('')
      }
      return
    }

    // If integrations are already manually selected via the subbar, use them directly
    if (integrations.length > 0) {
      setIsTyping(true)
      setIsLoading(true)
      const loadingMsgs = ['Thinking…', 'Analyzing your data…', 'Almost there…']
      let li = 0
      setLoadingMessage(loadingMsgs[0])
      const msgInterval = setInterval(() => {
        li = (li + 1) % loadingMsgs.length
        setLoadingMessage(loadingMsgs[li])
      }, 1800)
      try {
        const projectCtx = detectedProject === 'ALL' ? 'all' : (detectedProject ?? lastMentionedProject ?? 'all')
        const historyForApi = messages.slice(-6).map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }))
        const results = await Promise.all(
          integrations.map(integration =>
            fetch(getApiUrl(`/api/chat`), {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: userInput, source: integration, context: 'leadership_copilot',
                projectContext: projectCtx, cachedProjects, integrations,
                messages: historyForApi,
              }),
            })
              .then(async r => ({ integration, data: await r.json(), success: r.ok }))
              .catch(() => ({ integration, data: null, success: false }))
          )
        )
        const ok = results.filter(r => r.success && r.data)
        if (ok.length === 0) throw new Error('All integration API calls failed.')
        let contentText: string
        if (ok.length === 1) {
          const d = ok[0].data
          contentText = typeof d.answer === 'string' ? d.answer :
            typeof d.response === 'string' ? d.response :
            typeof d.message === 'string' ? d.message : JSON.stringify(d)
          addMessage({
            role: 'assistant', content: contentText,
            metadata: { visualization: buildAssistantVisualization(userInput, contentText), storyDetail: buildStoryDetail(userInput, contentText), issueList: buildIssueList(userInput, contentText), countStat: buildCountStat(userInput, contentText) },
            isLeadershipMode: !!(ok[0].data as any).auto_leadership_mode,
            dataSource: (ok[0].data as any).data_source,
            ragCitations: (ok[0].data as any).rag_citations || [],
          })
        } else {
          const parts = ok.map(({ integration, data }) => {
            const name = integration.charAt(0).toUpperCase() + integration.slice(1)
            return `\n\n**${name}:**\n${data.response || data.answer || data.message || 'No response'}`
          })
          addMessage({ role: 'assistant', content: `Results from ${ok.map(r => r.integration).join(', ')}` + parts.join('') })
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        addMessage({ role: 'assistant', content: msg.includes('Failed to fetch') ? "Can't reach the backend." : `Error: ${msg}` })
      } finally {
        clearInterval(msgInterval)
        setIsTyping(false)
        setIsLoading(false)
        setLoadingMessage('')
      }
      return
    }

    // DEFAULT: show source selection buttons — no API call yet
    addMessage({
      role: 'assistant',
      content: 'Where should I search for this?',
      actionButtons: [
        { label: 'Search Jira', source: 'jira' },
        { label: 'Search Confluence', source: 'confluence' },
      ],
      originalQuery: userInput,
    })
  }, [input, isTyping, integrations, messages, cachedProjects, lastMentionedProject, uploadedDocReady, addMessage, setIsLoading, isListening, stopListening, resetTranscript])

  const handleCopy = async (content: string, id: string) => {
    try { await navigator.clipboard.writeText(content) } catch {
      const ta = document.createElement('textarea')
      ta.value = content; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleExportPDF = () => {
    const msgs = messages.map(m => ({
      sender: m.role === 'user' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      timestamp: new Date(m.timestamp || Date.now()),
    }))
    exportChatAsPDF(msgs, `workbuddy-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const handleExportExcel = () => {
    const msgs = messages.map(m => ({
      sender: m.role === 'user' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      timestamp: new Date(m.timestamp || Date.now()),
    }))
    exportChatAsExcel(msgs, `workbuddy-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // ── Markdown renderers ────────────────────────────────────────────────────
  const mdAssistant = {
    p: ({ children }: any) => <p className="mb-3.5 last:mb-0 leading-7 text-sm" style={{ color: text }}>{children}</p>,
    strong: ({ children }: any) => <strong className="font-semibold" style={{ color: text }}>{children}</strong>,
    em: ({ children }: any) => <em className="italic" style={{ color: textSecondary }}>{children}</em>,
    h1: ({ children }: any) => <h1 className="text-base font-semibold mt-6 mb-2.5 pb-1.5 border-b tracking-tight" style={{ borderColor: `${border}30`, color: text }}>{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-[11px] font-semibold mt-5 mb-2 uppercase tracking-widest" style={{ color: accent }}>{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-4 mb-1.5" style={{ color: text }}>{children}</h3>,
    code: ({ className, children }: any) => {
      // Block code (fenced / multi-line) inherits the <pre> styling below;
      // only true inline code gets the mustard pill treatment.
      const raw = Array.isArray(children) ? children.join('') : String(children ?? '')
      const isBlock = raw.includes('\n') || /language-/.test(className || '')
      if (isBlock) {
        return <code className="font-mono" style={{ background: 'transparent', padding: 0, color: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</code>
      }
      return <code className="px-1.5 py-0.5 rounded text-[12px] font-mono" style={{ backgroundColor: `${border}30`, color: accent }}>{children}</code>
    },
    pre: ({ children }: any) => <pre className="p-4 rounded-xl text-[12.5px] my-3.5 font-mono leading-relaxed" style={{ backgroundColor: `${border}1F`, border: `1px solid ${border}40`, color: text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{children}</pre>,
    ul: ({ children }: any) => <ul className="mb-3.5 space-y-2">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-outside ml-5 mb-3.5 space-y-2">{children}</ol>,
    li: ({ children }: any) => (
      <li className="flex items-start gap-2.5 text-sm leading-6" style={{ color: text }}>
        <span className="mt-[10px] w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
        <span className="flex-1">{children}</span>
      </li>
    ),
    blockquote: ({ children }: any) => <blockquote className="border-l-2 pl-4 py-1.5 my-3.5 rounded-r-lg text-sm leading-6" style={{ borderColor: accent, backgroundColor: `${accent}08`, color: textSecondary }}>{children}</blockquote>,
    hr: () => <hr className="my-5" style={{ borderColor: `${border}30` }} />,
    a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2 transition-opacity hover:opacity-70" style={{ color: accent, textDecorationColor: `${accent}50` }}>{children}<ExternalLink className="inline w-3 h-3 ml-0.5 mb-0.5" /></a>,
    table: ({ children }: any) => <div className="overflow-x-auto my-4 rounded-xl border" style={{ borderColor: `${border}40` }}><table className="text-xs border-collapse w-full">{children}</table></div>,
    thead: ({ children }: any) => <thead style={{ backgroundColor: `${border}20` }}>{children}</thead>,
    th: ({ children }: any) => <th className="border-b px-4 py-2.5 font-semibold text-left text-[11px] uppercase tracking-wide" style={{ borderColor: `${border}40`, color: textSecondary }}>{children}</th>,
    td: ({ children }: any) => <td className="border-b px-4 py-2.5 text-xs" style={{ borderColor: `${border}20`, color: text }}>{children}</td>,
  }

  const mdUser = {
    p: ({ children }: any) => <p className="mb-1.5 last:mb-0 leading-relaxed text-sm font-medium">{children}</p>,
    strong: ({ children }: any) => <strong className="font-bold">{children}</strong>,
    code: ({ children }: any) => <code className="px-1 py-0.5 rounded text-[12px] font-mono opacity-80">{children}</code>,
  }

  const sessionGroups = groupSessions(sessions)
  const currentSession = sessions.find(s => s.id === currentSessionId)

  return (
    <>
      <style>{`
        @keyframes wbPulse {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes wbFadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wb-msg { animation: wbFadeUp 0.18s ease forwards; }
        .wb-scroll::-webkit-scrollbar { width: 4px; }
        .wb-scroll::-webkit-scrollbar-track { background: transparent; }
        .wb-scroll::-webkit-scrollbar-thumb { background: ${border}40; border-radius: 4px; }
        .wb-scroll::-webkit-scrollbar-thumb:hover { background: ${border}70; }
        .wb-chat-toolbar > div:first-child { display: none; }
      `}</style>

      <div className="h-full min-h-0 flex overflow-hidden" style={{ backgroundColor: 'var(--bg-page)', fontFamily: 'var(--font)' }}>

        {/* ═══════════════════ LEFT: Session Sidebar ═══════════════════ */}
        <div
          className={`flex-shrink-0 flex flex-col h-full min-h-0 overflow-hidden transition-all duration-200 ease-out ${isHistoryCollapsed ? 'w-0 opacity-0' : 'w-56 opacity-100'}`}
          style={{ backgroundColor: surface, borderRight: isHistoryCollapsed ? 'none' : `1px solid ${border}40` }}
        >
          {/* Header */}
          {!isHistoryCollapsed && (
            <div className="px-3 pt-4 pb-3" style={{ borderBottom: `1px solid ${border}30` }}>
              <>
                <div className="mb-3 px-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: textSecondary }}>Chat History</span>
                  <button
                    onClick={() => setIsHistoryCollapsed(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-150"
                    style={{ backgroundColor: `${border}18`, color: textSecondary, border: `1px solid ${border}28` }}
                    title="Minimize chat history"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={createNewSession}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98]"
                  style={{ backgroundColor: `${accent}15`, color: accent, border: `1px solid ${accent}25` }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${accent}25` }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = `${accent}15` }}
                >
                  <PenSquare className="w-3.5 h-3.5" />
                  New Chat
                </button>
              </>
            </div>
          )}

          {/* Session list */}
          <div className={`flex-1 min-h-0 overflow-y-auto wb-scroll ${isHistoryCollapsed ? 'py-0' : 'py-2'}`}>
            {!isHistoryCollapsed && (
              <>
                {sessionGroups.length === 0 && (
                  <p className="text-xs text-center mt-6 px-4" style={{ color: textSecondary }}>No chats yet</p>
                )}
                {sessionGroups.map(group => (
                  <div key={group.label} className="mb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest px-4 py-1.5" style={{ color: `${textSecondary}70` }}>
                      {group.label}
                    </p>
                    {group.items.map(session => {
                      const isActive = session.id === currentSessionId
                      const isHov = hoveredSessionId === session.id
                      return (
                        <div
                          key={session.id}
                          className="relative mx-2 mb-1 rounded-xl flex items-center transition-colors duration-100"
                          style={{
                            backgroundColor: isActive ? `${accent}12` : isHov ? `${border}25` : 'transparent',
                          }}
                          onMouseEnter={() => setHoveredSessionId(session.id)}
                          onMouseLeave={() => setHoveredSessionId(null)}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full" style={{ backgroundColor: accent }} />
                          )}
                          <button
                            onClick={() => switchSession(session.id)}
                            className="flex-1 px-3 py-2.5 text-left min-w-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs truncate font-medium leading-none" style={{ color: isActive ? accent : text }}>
                                {session.title}
                              </p>
                              <p className="text-[10px] mt-1 truncate" style={{ color: `${textSecondary}70` }}>
                                {formatSessionMeta(session)}
                              </p>
                            </div>
                          </button>
                          {isHov && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteSession(session.id) }}
                              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg mr-1.5 transition-colors"
                              style={{ color: `${textSecondary}60` }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.1)' }}
                              onMouseLeave={e => { e.currentTarget.style.color = `${textSecondary}60`; e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ═══════════════════ RIGHT: Chat Area ═══════════════════════ */}
	        <div className="relative flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-page)' }}>
          {isHistoryCollapsed && (
            <button
              onClick={() => setIsHistoryCollapsed(false)}
              className="absolute top-3 left-4 z-20 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold tracking-wide uppercase transition-all duration-150"
              style={{
                color: textSecondary,
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: `1px solid ${border}30`,
                backdropFilter: 'blur(12px)',
              }}
              title="Show chat history"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Show Chat History
            </button>
          )}

          {/* Chat header */}
          <div
            className="wb-chat-toolbar absolute top-3 right-4 z-20 flex items-center justify-end"
            style={{ borderBottom: 'none', backgroundColor: 'transparent' }}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: text }}>
                {currentSession?.title ?? 'WorkBuddy'}
              </p>
              <p className="text-[10px]" style={{ color: `${textSecondary}80` }}>
                AI Assistant · FalconX
              </p>
            </div>

            {messages.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Export */}
                <div className="relative">
                  <button
                    onClick={() => setShowExport(v => !v)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ color: textSecondary }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <ChevronDown className="w-3 h-3 transition-transform duration-150" style={{ transform: showExport ? 'rotate(180deg)' : 'none' }} />
                  </button>
                  {showExport && (
                    <div
                      className="absolute right-0 top-full mt-1 rounded-xl border py-1 z-30 min-w-[110px]"
                      style={{ backgroundColor: surface, borderColor: `${border}50`, boxShadow: currentTheme.shadows?.large || '0 8px 32px rgba(0,0,0,0.18)' }}
                    >
                      {[
                        { label: 'PDF', icon: FileText, action: handleExportPDF },
                        { label: 'Excel', icon: Download, action: handleExportExcel },
                      ].map(({ label, icon: Icon, action }) => (
                        <button key={label} onClick={() => { action(); setShowExport(false) }}
                          className="flex items-center gap-2 w-full text-left text-xs px-3.5 py-2 transition-opacity hover:opacity-80"
                          style={{ color: textSecondary }}>
                          <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Clear current chat */}
                <button
                  onClick={clearMessages}
                  className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{ color: textSecondary }}
                  title="Clear this chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto wb-scroll" style={{ backgroundColor: surface }}>
            {messages.length === 0 ? (
              <EmptyState
                accent={accent}
                text={text}
                textSecondary={textSecondary}
                border={border}
                userName={settings.userProfile.name || 'Tell me'}
                onSuggestion={s => { setInput(s); setTimeout(() => sendMessage(s), 50) }}
              />
            ) : (
              <div className="px-7 py-6 max-w-4xl mx-auto space-y-0 w-full">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className="wb-msg"
                    style={{
                      animationDelay: `${Math.min(i * 15, 60)}ms`,
                      display: msg.actionButtons && msg.buttonsUsed ? 'none' : undefined,
                    }}
                  >
                    {msg.role === 'user' ? (
                      /* ── User message ─────────────────────────────── */
                      <div className="flex justify-end mb-4">
                        <div className="max-w-[64%]">
                          <div className="flex justify-end items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold" style={{ color: '#CDB98C' }}>
                              {settings.userProfile.name || 'You'}
                            </span>
                            <div
                              className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: 'rgba(255,255,255,0.04)',
                                border: `1px solid ${border}35`,
                                backdropFilter: 'blur(10px)',
                              }}
                            >
                              <Users className="w-3 h-3" style={{ color: `${accent}D0` }} />
                            </div>
                          </div>
                          <div
                            className="px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed backdrop-blur-md"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.045)',
                              border: `1px solid ${border}42`,
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                              color: text
                            }}
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdUser as any}>
                              {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ── Assistant response ───────────────────────── */
                      <div className="mb-6">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}30` }}>
                            <Sparkles className="w-3.5 h-3.5" style={{ color: accent }} />
                          </div>
                          <span className="text-[13px] font-semibold" style={{ color: text }}>WorkBuddy</span>
                          {!msg.actionButtons && (
                            <ResponseBadges
                              isLeadershipMode={msg.isLeadershipMode}
                              dataSource={msg.dataSource}
                              accent={accent}
                              textSecondary={textSecondary}
                            />
                          )}
                        </div>
                        <div className="ml-[38px]">
                          {/* ── Source selection buttons ── */}
                          {msg.actionButtons && msg.originalQuery ? (
                            <div>
                              <p className="text-sm mb-4" style={{ color: textSecondary }}>
                                Where should I search for this?
                              </p>
                              <div className="flex items-center gap-3 flex-wrap">
                                {msg.actionButtons.map(btn => {
                                  const isJira = btn.source === 'jira'
                                  const Icon = isJira ? Database : FileSearch
                                  const disabled = msg.buttonsUsed || isTyping
                                  return (
                                    <button
                                      key={btn.source}
                                      onClick={() => !disabled && handleSourceSearch(btn.source, msg.originalQuery!, i)}
                                      disabled={disabled}
                                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                      style={{
                                        backgroundColor: disabled ? `${border}20` : `${accent}15`,
                                        border: `1px solid ${disabled ? border : accent}40`,
                                        color: disabled ? textSecondary : accent,
                                        boxShadow: disabled ? 'none' : `0 2px 8px ${accent}18`,
                                      }}
                                      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.backgroundColor = `${accent}28`; e.currentTarget.style.boxShadow = `0 4px 12px ${accent}28` } }}
                                      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.backgroundColor = `${accent}15`; e.currentTarget.style.boxShadow = `0 2px 8px ${accent}18` } }}
                                    >
                                      <Icon className="w-4 h-4" />
                                      {btn.label}
                                    </button>
                                  )
                                })}
                              </div>
                              {msg.buttonsUsed && (
                                <p className="text-xs mt-3" style={{ color: `${textSecondary}60` }}>Searching…</p>
                              )}
                            </div>
                          ) : (
                            <>
                              {msg.metadata?.storyDetail ? (
                                <StoryDetailCard
                                  storyDetail={msg.metadata.storyDetail as StoryDetail}
                                  accent={accent}
                                  border={border}
                                  text={text}
                                  textSecondary={textSecondary}
                                  surface={surface}
                                />
                              ) : msg.metadata?.issueList ? (
                                <IssueListCard
                                  issueList={msg.metadata.issueList as IssueList}
                                  accent={accent}
                                  border={border}
                                  text={text}
                                  textSecondary={textSecondary}
                                  surface={surface}
                                />
                              ) : msg.metadata?.countStat ? (
                                <CountStat
                                  countStat={msg.metadata.countStat as CountStatData}
                                  accent={accent}
                                  border={border}
                                  textSecondary={textSecondary}
                                />
                              ) : (
                                <div
                                  className="inline-block max-w-[88%] rounded-2xl px-5 py-3.5 backdrop-blur-md"
                                  style={{
                                    backgroundColor: 'rgba(255,255,255,0.038)',
                                    border: `1px solid ${border}32`,
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
                                  }}
                                >
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdAssistant as any}>
                                    {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                                  </ReactMarkdown>
                                </div>
                              )}
                              {msg.metadata?.visualization && (
                                <VisualizationCard
                                  visualization={msg.metadata.visualization as AssistantVisualization}
                                  accent={accent}
                                  border={border}
                                  text={text}
                                  textSecondary={textSecondary}
                                />
                              )}
                              {msg.ragCitations && msg.ragCitations.length > 0 && (
                                <CitationFooter citations={msg.ragCitations} accent={accent} border={border} textSecondary={textSecondary} />
                              )}
                              {/* Copy button */}
                              <div className="flex items-center gap-1 mt-2.5">
                                <button
                                  onClick={() => handleCopy(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content), String(i))}
                                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-all"
                                  style={{ color: copiedId === String(i) ? accent : textSecondary }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${border}20` }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                                >
                                  {copiedId === String(i) ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  {copiedId === String(i) ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && <TypingIndicator accent={accent} loadingMsg={loadingMessage} />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Composer ──────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-7 pb-4 pt-2.5" style={{ borderTop: `1px solid ${border}14`, backgroundColor: surface }}>
            <div
              className="transition-shadow duration-200 max-w-3xl mx-auto"
              style={{ border: 'none', backgroundColor: 'transparent' }}
              onFocusCapture={() => {}}
              onBlurCapture={() => {}}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); setUserHasTyped(true) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Message Work Buddy…"
                disabled={isTyping}
                rows={2}
                className="w-full text-sm resize-none outline-none leading-relaxed px-4 pt-3.5 pb-2.5 min-h-[76px] max-h-[170px] wb-scroll disabled:opacity-60 rounded-[22px] placeholder:text-[#C7CEDC]/70"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${border}38`,
                  color: '#E5E9F3',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
                  backdropFilter: 'blur(14px)',
                }}
              />
              <div className="flex items-center justify-between px-1.5 pb-0 pt-2 gap-3">
                <div className="flex items-center gap-1">
                  <p className="text-[10px]" style={{ color: `${textSecondary}55` }}>↵ Send · ⇧↵ New line</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Voice */}
                  {isSupported && (
                    <button
                      onClick={() => { if (isListening) { stopListening() } else { resetTranscript(); startListening() } }}
                      className="group relative h-11 px-3.5 flex items-center justify-center gap-2 rounded-2xl transition-all duration-150"
                      style={{
                        background: isListening
                          ? 'linear-gradient(135deg, #E35D5D 0%, #C94747 100%)'
                          : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)',
                        color: isListening ? '#fff' : '#E8D8A8',
                        border: isListening ? '1px solid rgba(227,93,93,0.9)' : `1px solid ${border}38`,
                        boxShadow: isListening
                          ? '0 10px 24px rgba(201,71,71,0.28)'
                          : '0 10px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.045)',
                      }}
                      title={isListening ? 'Stop recording' : 'Start voice input'}
                    >
                      {isListening ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-4 h-4" />}
                      <span className="text-[11px] font-semibold tracking-wide">
                        {isListening ? 'Listening' : 'Voice'}
                      </span>
                    </button>
                  )}
                  {/* Send */}
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isTyping}
                    className="group relative h-11 px-4 flex items-center justify-center gap-2 rounded-2xl transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.05) 100%)',
                      border: '1px solid rgba(227,182,77,0.24)',
                      boxShadow: '0 10px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.045)',
                    }}
                    title="Send message"
                  >
                    {isTyping ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#E3B64D' }} /> : <Send className="w-4 h-4" style={{ color: '#E3B64D' }} />}
                    <span className="text-[11px] font-semibold tracking-wide" style={{ color: '#F4E7BE' }}>
                      Send
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Welcome popup */}
      {showWelcomePopup && (
        <WelcomePopup onClose={() => setShowWelcomePopup(false)} userHasTyped={userHasTyped} />
      )}

      {/* Manual routing notice */}
      <Dialog open={showManualRoutingPopup} onOpenChange={setShowManualRoutingPopup}>
        <DialogContent style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', fontFamily: 'var(--font)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Manual Routing Enabled</DialogTitle>
            <DialogDescription style={{ color: 'var(--text-secondary)' }}>
              WorkBuddy will now query only the selected integrations. Intelligent auto-routing is paused.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowManualRoutingPopup(false)} style={{ backgroundColor: accent, color: '#000', border: 'none' }}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
