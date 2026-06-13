'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Send, Loader2, Download, FileText, Presentation,
  Sparkles, Trash2, ChevronDown, ChevronRight,
  BookOpen, ExternalLink, Crown, Shield, Clock,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useChat, Message } from '../contexts/ChatContext'
import { useTheme } from '../contexts/ThemeContext'
import { getApiUrl } from '../../lib/api-config'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatResponse {
  response: string
  error?: string
  jql?: string
  data?: any[]
  intent?: string
  success?: boolean
  decision: string
  metadata?: { type: string; decision: string }
  mode?: string
  export_data?: { filename: string; data: string }
  data_source?: string
  last_updated?: string
}

// ── TypingIndicator ───────────────────────────────────────────────────────────
function TypingIndicator({ accent }: { accent: string }) {
  return (
    <div className="flex items-start gap-3 py-6">
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${accent}1A` }}
      >
        <Sparkles className="w-3 h-3" style={{ color: accent }} />
      </div>
      <div className="flex items-center gap-1.5 mt-[9px]">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="block w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: accent,
              animation: 'wbPulse 1.3s ease-in-out infinite',
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({
  accent, text, textSecondary, border, surface,
}: {
  accent: string; text: string; textSecondary: string; border: string; surface: string
}) {
  const prompts = [
    'Show open bugs in HCAT sprint',
    'Who is the reporter for HCAT-2034?',
    'Show sprint velocity for last 3 sprints',
    'Leadership insights for Q1',
  ]
  return (
    <div className="flex flex-col items-center justify-center h-full text-center select-none px-6 py-16">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
        style={{
          backgroundColor: `${accent}14`,
          border: `1px solid ${accent}28`,
        }}
      >
        <Sparkles className="w-6 h-6" style={{ color: accent }} />
      </div>
      <h3 className="text-lg font-semibold tracking-tight mb-2" style={{ color: text }}>
        WorkBuddy
      </h3>
      <p className="text-sm leading-relaxed max-w-[260px] mb-8" style={{ color: textSecondary }}>
        Ask anything about Jira, Confluence, or get AI-powered leadership insights.
      </p>
      <div className="grid grid-cols-1 gap-2 w-full max-w-[320px]">
        {prompts.map(p => (
          <div
            key={p}
            className="text-left text-xs px-3 py-2 rounded-xl border cursor-default transition-colors"
            style={{
              borderColor: `${border}80`,
              backgroundColor: surface,
              color: textSecondary,
            }}
          >
            {p}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CitationFooter ────────────────────────────────────────────────────────────
function CitationFooter({
  citations, accent, border, textSecondary,
}: {
  citations: any[]; accent: string; border: string; textSecondary: string
}) {
  const [open, setOpen] = useState(false)
  if (!citations || citations.length === 0) return null
  return (
    <div className="mt-5 pt-4 border-t" style={{ borderColor: `${border}28` }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-90"
        style={{ color: textSecondary }}
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>{citations.length} source{citations.length !== 1 ? 's' : ''}</span>
        <ChevronRight
          className="w-3 h-3 transition-transform duration-150"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-1">
          {citations.map((cite: any, idx: number) => (
            <a
              key={idx}
              href={cite.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ color: accent, backgroundColor: `${accent}0A` }}
            >
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
function ResponseBadges({
  isLeadershipMode, dataSource, ragContextUsed, accent, textSecondary,
}: {
  isLeadershipMode?: boolean; dataSource?: string; ragContextUsed?: number; accent: string; textSecondary: string
}) {
  const badges: React.ReactNode[] = []

  if (isLeadershipMode) {
    badges.push(
      <span
        key="leadership"
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
      >
        <Crown className="w-2.5 h-2.5" /> Leadership
      </span>
    )
  }
  if (dataSource === 'live_jira_data') {
    badges.push(
      <span
        key="live"
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      >
        <Shield className="w-2.5 h-2.5" /> Live
      </span>
    )
  } else if (dataSource) {
    badges.push(
      <span
        key="cached"
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${textSecondary}12`, color: textSecondary, border: `1px solid ${textSecondary}25` }}
      >
        <Clock className="w-2.5 h-2.5" /> Cached
      </span>
    )
  }

  if (badges.length === 0) return null
  return <div className="flex items-center gap-1.5 flex-wrap">{badges}</div>
}

// ── Main component ─────────────────────────────────────────────────────────────
export const ChatInterface = forwardRef<{ sendQuickMessage: (message: string) => void }, {}>((props, ref) => {
  const {
    messages, addMessage, clearMessages, isLoading, setIsLoading,
    chatInterfaceRef, lastIssueDetails, setLastIssueDetails,
    lastProjectKey, setLastProjectKey,
  } = useChat()
  const { currentTheme } = useTheme()
  const {
    primary, secondary, accent, surface, surfaceVariant, text, textSecondary, border, background,
  } = currentTheme.colors

  const [input, setInput] = useState('')
  const [showExport, setShowExport] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/

  const augmentMessageWithLastIssue = (original: string): string => {
    const trimmed = original.trim().toLowerCase()
    const isPropertyFollowUp =
      /^(assignee|reporter|status|priority|type|summary|description|who|owner|open\s+link|url)\b/.test(trimmed) ||
      /(assignee|reporter)\s+(for|of)\s+(this\s+)?(ticket|issue|story)\b/.test(trimmed) ||
      /reporter name|assignee name/.test(trimmed)
    if (!isPropertyFollowUp) return original
    if (ISSUE_KEY_RE.test(original)) return original
    if (lastIssueDetails?.key) return `${original} for ${lastIssueDetails.key}`
    return original
  }

  const augmentMessageWithLastProject = (original: string): string => {
    const trimmed = original.trim().toLowerCase()
    const isAnalyticsQuery = /(open|closed|in\s+progress|bugs|stories|tasks|issues|show|list|count)/.test(trimmed)
    if (!isAnalyticsQuery) return original
    const projectKeyMatch = original.match(/\b([A-Z]{2,5})\b/)
    if (projectKeyMatch) return original
    if (lastProjectKey) return `${original} in project ${lastProjectKey}`
    return original
  }

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

  const sendMessageDirectly = async (message: string) => {
    if (isLoading) return
    setIsLoading(true)
    addMessage({ role: 'user', content: message })
    try {
      let finalMessage = augmentMessageWithLastIssue(message)
      finalMessage = augmentMessageWithLastProject(finalMessage)
      const response = await fetch(getApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalMessage }),
      })
      const data: ChatResponse = await response.json()
      if (response.ok) {
        const isAutoLeadershipMode = (data as any).auto_leadership_mode || false
        const isRAGResponse = (data as any).source === 'rag' || (data as any).rag_citations
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.response || data.error || 'No response received',
          isLeadershipMode: isAutoLeadershipMode,
          dataSource: (data as any).data_source,
          lastUpdated: (data as any).last_updated,
          ragCitations: (data as any).rag_citations || [],
          ragContextUsed: (data as any).rag_context_used || 0,
        }
        if (isAutoLeadershipMode && (data as any).message) {
          assistantMessage.content = `${(data as any).message}\n\n${data.response || data.error || 'No response received'}`
        }
        addMessage(assistantMessage)
        const responseText = typeof data.response === 'string' ? data.response : JSON.stringify(data.response)
        const match = !isAutoLeadershipMode && !isRAGResponse ? responseText?.match(ISSUE_KEY_RE) : null
        const key = Array.isArray(match) ? match[1] : null
        if (key) {
          try {
            const dresp = await fetch(getApiUrl(`/api/jira/issue/${key}`))
            const djson = await dresp.json()
            if (dresp.ok && djson.issue) {
              setLastIssueDetails({ key, data: djson.issue, fetchedAt: new Date().toISOString() })
              if (djson.issue?.project) setLastProjectKey(djson.issue.project)
            }
          } catch {}
        }
      } else {
        addMessage({ role: 'assistant', content: `Error: ${data.error || data.response || 'Failed to get response'}` })
      }
      if (data.mode === 'export' && data.export_data) {
        const { filename, data: excelData } = data.export_data
        const blob = new Blob([Uint8Array.from(atob(excelData), c => c.charCodeAt(0))], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = filename
        document.body.appendChild(link); link.click()
        document.body.removeChild(link); URL.revokeObjectURL(url)
      }
    } catch (error) {
      addMessage({ role: 'assistant', content: `Network error: ${error}` })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { scrollToBottom() }, [messages])

  useImperativeHandle(ref, () => ({ sendQuickMessage: (message: string) => { sendMessageDirectly(message) } }))

  useEffect(() => {
    const refObj = { sendQuickMessage: sendMessageDirectly } as { sendQuickMessage: (message: string) => void }
    // @ts-expect-error allow setting from provider
    chatInterfaceRef.current = refObj
  }, [sendMessageDirectly])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return
    const userMessage = input.trim()
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)
    addMessage({ role: 'user', content: userMessage })
    try {
      const isPropertyFollowUp = /^(assignee|reporter|status|priority|type|summary|description|url|link|open)$/i.test(userMessage.trim()) || /reporter name|assignee name/i.test(userMessage)
      const asksIssueDetails = /(details|info|summary).*\b(ccm|hcat|[A-Z]{2,5})-\d+/i.test(userMessage)
      const asksProjectDetails = /project (details|summary|info)/i.test(userMessage)

      if ((isPropertyFollowUp || asksIssueDetails) && lastIssueDetails) {
        const issue = lastIssueDetails.data
        let reply = `${lastIssueDetails.key}: ${issue?.summary || ''}\nStatus: ${issue?.status || 'Unknown'}  Type: ${issue?.type || 'Unknown'}  Priority: ${issue?.priority || 'Unknown'}\nAssignee: ${issue?.assignee?.name || 'Unassigned'}  Reporter: ${issue?.reporter?.name || 'Unknown'}  Project: ${issue?.project || 'Unknown'}`
        if (/^assignee/i.test(userMessage)) reply = `Assignee: ${issue?.assignee?.name || 'Unassigned'}`
        if (/^reporter/i.test(userMessage) || /reporter name/i.test(userMessage)) {
          const rn = issue?.reporter?.name || 'Unknown'
          const re = issue?.reporter?.email || ''
          reply = `${rn} is the reporter for ${lastIssueDetails.key}. ${re ? `You can reach them at ${re} for context.` : `They initiated ${issue?.summary || 'this issue'}.`}`
        }
        if (/^status/i.test(userMessage)) reply = `Status: ${issue?.status || 'Unknown'}`
        if (/^priority/i.test(userMessage)) reply = `Priority: ${issue?.priority || 'Unknown'}`
        if (/^type/i.test(userMessage)) reply = `Type: ${issue?.type || 'Unknown'}`
        if (/^(url|link|open)/i.test(userMessage)) reply = issue?.url ? `Open: ${issue.url}` : 'No URL available'
        addMessage({ role: 'assistant', content: reply })
        setIsLoading(false)
        return
      }
      if (asksProjectDetails && lastProjectKey) {
        addMessage({ role: 'assistant', content: `Project: ${lastProjectKey}. Ask me to list open issues, stories, bugs, or sprint analytics for this project.` })
        setIsLoading(false)
        return
      }
    } catch {}

    try {
      let finalMessage = augmentMessageWithLastIssue(userMessage)
      finalMessage = augmentMessageWithLastProject(finalMessage)
      const response = await fetch(getApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalMessage }),
      })
      const data: ChatResponse = await response.json()
      if (response.ok) {
        const isAutoLeadershipMode = (data as any).auto_leadership_mode || false
        const isRAGResponse = (data as any).source === 'rag' || (data as any).rag_citations
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.response || data.error || 'No response received',
          isLeadershipMode: isAutoLeadershipMode,
          dataSource: (data as any).data_source,
          lastUpdated: (data as any).last_updated,
          ragCitations: (data as any).rag_citations || [],
          ragContextUsed: (data as any).rag_context_used || 0,
        }
        if (isAutoLeadershipMode && (data as any).message) {
          assistantMessage.content = `${(data as any).message}\n\n${data.response || data.error || 'No response received'}`
        }
        addMessage(assistantMessage)
        const responseText = typeof data.response === 'string' ? data.response : JSON.stringify(data.response)
        const match = !isAutoLeadershipMode && !isRAGResponse ? responseText?.match(ISSUE_KEY_RE) : null
        const key = Array.isArray(match) ? match[1] : null
        if (key) {
          try {
            const dresp = await fetch(getApiUrl(`/api/jira/issue/${key}`))
            const djson = await dresp.json()
            if (dresp.ok && djson.issue) {
              setLastIssueDetails({ key, data: djson.issue, fetchedAt: new Date().toISOString() })
              if (djson.issue?.project) setLastProjectKey(djson.issue.project)
            }
          } catch {}
        }
      } else {
        addMessage({ role: 'assistant', content: `Error: ${data.error || data.response || 'Failed to get response'}` })
      }
    } catch (error) {
      addMessage({ role: 'assistant', content: `Network error: ${error}` })
    } finally {
      setIsLoading(false)
    }
  }

  const exportToPDF = async () => {
    try {
      const response = await fetch(getApiUrl('/api/export/pdf'), { method: 'POST' })
      if (response.ok) window.open(getApiUrl('/api/export/download/pdf'), '_blank')
    } catch {}
  }

  const exportToPowerPoint = async () => {
    try {
      const response = await fetch(getApiUrl('/api/export/powerpoint'), { method: 'POST' })
      if (response.ok) window.open(getApiUrl('/api/export/download/powerpoint'), '_blank')
    } catch {}
  }

  const exportToExcel = async () => {
    try {
      const resp = await fetch(getApiUrl('/api/jira/export/excel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await resp.json()
      if (resp.ok && data?.data && data?.filename) {
        const blob = new Blob([Uint8Array.from(atob(data.data), c => c.charCodeAt(0))], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = data.filename
        document.body.appendChild(link); link.click()
        document.body.removeChild(link); URL.revokeObjectURL(url)
      }
    } catch {}
  }

  const clearChat = async () => {
    try {
      await fetch(getApiUrl('/api/chat/clear'), { method: 'POST' })
      clearMessages()
    } catch {}
  }

  // ── Markdown components for assistant responses ──────────────────────────
  const assistantMarkdown = {
    p: ({ children }: any) => (
      <p className="mb-4 last:mb-0 leading-7 text-sm" style={{ color: text }}>{children}</p>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold" style={{ color: text }}>{children}</strong>
    ),
    em: ({ children }: any) => <em className="italic" style={{ color: textSecondary }}>{children}</em>,
    h1: ({ children }: any) => (
      <h1 className="text-base font-semibold mt-7 mb-3 pb-2 border-b tracking-tight" style={{ borderColor: `${border}40`, color: text }}>
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-[11px] font-semibold mt-6 mb-2.5 uppercase tracking-widest" style={{ color: accent }}>
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-sm font-semibold mt-5 mb-2" style={{ color: text }}>{children}</h3>
    ),
    code: ({ children }: any) => (
      <code
        className="px-1.5 py-0.5 rounded text-[12px] font-mono"
        style={{ backgroundColor: `${border}35`, color: accent }}
      >
        {children}
      </code>
    ),
    pre: ({ children }: any) => (
      <pre
        className="p-4 rounded-xl overflow-x-auto text-[12px] my-4 font-mono leading-relaxed"
        style={{ backgroundColor: `${border}22`, border: `1px solid ${border}50`, color: textSecondary }}
      >
        {children}
      </pre>
    ),
    ul: ({ children }: any) => (
      <ul className="mb-4 space-y-2 ml-0">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside ml-5 mb-4 space-y-2">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="flex items-start gap-2.5 text-sm leading-6" style={{ color: text }}>
        <span className="mt-[9px] w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
        <span className="flex-1">{children}</span>
      </li>
    ),
    blockquote: ({ children }: any) => (
      <blockquote
        className="border-l-[2px] pl-4 pr-3 py-2 rounded-r-lg my-4 text-sm leading-6"
        style={{ borderColor: accent, backgroundColor: `${accent}0C`, color: textSecondary }}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-6" style={{ borderColor: `${border}40` }} />,
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 transition-opacity hover:opacity-75"
        style={{ color: accent, textDecorationColor: `${accent}60` }}
      >
        {children}
        <ExternalLink className="w-3 h-3 flex-shrink-0 ml-0.5" />
      </a>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-5 rounded-xl border" style={{ borderColor: `${border}50` }}>
        <table className="text-xs border-collapse w-full">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead style={{ backgroundColor: `${border}28` }}>{children}</thead>
    ),
    th: ({ children }: any) => (
      <th
        className="border-b px-4 py-2.5 font-semibold text-left text-[11px] uppercase tracking-wide"
        style={{ borderColor: `${border}50`, color: textSecondary }}
      >
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td
        className="border-b px-4 py-2.5 text-xs"
        style={{ borderColor: `${border}30`, color: text }}
      >
        {children}
      </td>
    ),
  }

  // ── Markdown components for user messages ────────────────────────────────
  const userMarkdown = {
    p: ({ children }: any) => (
      <p className="mb-2 last:mb-0 leading-relaxed text-sm">{children}</p>
    ),
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: any) => <em className="italic opacity-80">{children}</em>,
    code: ({ children }: any) => (
      <code className="px-1 py-0.5 rounded text-[12px] font-mono opacity-80">{children}</code>
    ),
    ul: ({ children }: any) => <ul className="mb-2 space-y-1">{children}</ul>,
    li: ({ children }: any) => (
      <li className="flex items-start gap-2 text-sm leading-relaxed">
        <span className="mt-2 w-1 h-1 rounded-full flex-shrink-0 opacity-60" style={{ backgroundColor: 'currentColor' }} />
        <span>{children}</span>
      </li>
    ),
  }

  return (
    <>
      <style>{`
        @keyframes wbPulse {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30%            { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes wbFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wb-msg { animation: wbFadeUp 0.2s ease forwards; }
        textarea::placeholder {
          color: currentColor;
          opacity: 0.75 !important;
        }
        textarea::-webkit-input-placeholder {
          color: currentColor;
          opacity: 0.75 !important;
        }
        textarea::-moz-placeholder {
          color: currentColor;
          opacity: 0.75 !important;
        }
      `}</style>

      <div
        className="h-full min-h-0 flex flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: surface, border: `1px solid ${border}50` }}
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: `${border}40`, backgroundColor: surface }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}28` }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight" style={{ color: text }}>WorkBuddy</p>
              <p className="text-[10px] leading-tight" style={{ color: text }}>AI Assistant · FalconX</p>
            </div>
          </div>

          {messages.length > 0 && (
            <div className="flex items-center gap-1">
              {/* Export */}
              <div className="relative">
                <button
                  onClick={() => setShowExport(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ color: text }}
                  title="Export"
                >
                  <Download className="w-3.5 h-3.5" />
                  <ChevronDown
                    className="w-3 h-3 transition-transform duration-150"
                    style={{ transform: showExport ? 'rotate(180deg)' : 'none' }}
                  />
                </button>
                {showExport && (
                  <div
                    className="absolute right-0 top-full mt-1 rounded-xl border py-1 z-20 min-w-[120px]"
                    style={{ backgroundColor: surface, borderColor: `${border}60`, boxShadow: currentTheme.shadows.large }}
                  >
                    {[
                      { label: 'PDF', icon: FileText, action: exportToPDF },
                      { label: 'Excel', icon: Download, action: exportToExcel },
                      { label: 'PowerPoint', icon: Presentation, action: exportToPowerPoint },
                    ].map(({ label, icon: Icon, action }) => (
                      <button
                        key={label}
                        onClick={() => { action(); setShowExport(false) }}
                        className="flex items-center gap-2 w-full text-left text-xs px-3.5 py-2 transition-colors hover:opacity-80"
                        style={{ color: text }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Clear */}
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: text }}
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Messages ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto premium-scrollbar" style={{ backgroundColor: background }}>
          {messages.length === 0 ? (
            <EmptyState
              accent={accent}
              text={text}
              textSecondary={textSecondary}
              border={border}
              surface={surface}
            />
          ) : (
            <div className="px-6 py-6 space-y-0">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className="wb-msg"
                  style={{ animationDelay: `${Math.min(index * 20, 80)}ms` }}
                >
                  {message.role === 'user' ? (
                    /* ── User message ────────────────────────────────────── */
                    <div className="flex justify-end mb-6">
                      <div
                        className="max-w-[58%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed"
                        style={{
                          backgroundColor: surfaceVariant,
                          border: `1px solid ${border}60`,
                          color: text,
                        }}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={userMarkdown as any}
                        >
                          {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    /* ── Assistant response ──────────────────────────────── */
                    <div className="mb-8 pb-8 border-b last:border-b-0 last:mb-0 last:pb-0" style={{ borderColor: `${border}20` }}>
                      {/* Icon + label row */}
                      <div className="flex items-center gap-2.5 mb-4">
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}25` }}
                        >
                          <Sparkles className="w-3 h-3" style={{ color: accent }} />
                        </div>
                        <span className="text-xs font-medium" style={{ color: text }}>WorkBuddy</span>
                        <ResponseBadges
                          isLeadershipMode={message.isLeadershipMode}
                          dataSource={message.dataSource}
                          ragContextUsed={message.ragContextUsed}
                          accent={accent}
                          textSecondary={textSecondary}
                        />
                      </div>

                      {/* Content */}
                      <div className="ml-[34px]">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={assistantMarkdown as any}
                        >
                          {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                        </ReactMarkdown>

                        {/* Citation footer */}
                        {message.ragCitations && message.ragCitations.length > 0 && (
                          <CitationFooter
                            citations={message.ragCitations}
                            accent={accent}
                            border={border}
                            textSecondary={textSecondary}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && <TypingIndicator accent={accent} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Composer ───────────────────────────────────────────────────── */}
        <div
          className="shrink-0 px-4 py-4 border-t"
          style={{ borderColor: `${border}35`, backgroundColor: surface }}
        >
          <div
            className="rounded-2xl transition-shadow duration-200"
            style={{
              border: `1px solid ${border}70`,
              backgroundColor: background,
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
              placeholder="Ask anything about Jira, Confluence…"
              disabled={isLoading}
              rows={1}
              className="w-full bg-transparent text-sm resize-none outline-none leading-relaxed min-h-[24px] max-h-[140px] premium-scrollbar px-4 pt-3.5 pb-2"
              style={{ color: text }}
            />
            {/* Action bar */}
            <div className="flex items-center justify-between px-3 pb-3">
              <p className="text-[10px]" style={{ color: text }}>
                ↵ Send · ⇧↵ New line
              </p>
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="flex items-center justify-center w-7 h-7 rounded-xl disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-150 hover:opacity-85 active:scale-95"
                style={{ backgroundColor: accent }}
              >
                {isLoading
                  ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  : <Send className="w-3.5 h-3.5 text-white" />}
              </button>
            </div>
          </div>
        </div>

      </div>
    </>
  )
})

ChatInterface.displayName = 'ChatInterface'
