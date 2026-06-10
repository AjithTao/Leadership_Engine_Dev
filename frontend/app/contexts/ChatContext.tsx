'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  metadata?: any
  isLeadershipMode?: boolean
  dataSource?: string
  lastUpdated?: string
  ragCitations?: Array<{
    title: string
    url: string
    confidence: number
    source_type: string
  }>
  ragContextUsed?: number
  actionButtons?: Array<{ label: string; source: string }>
  originalQuery?: string
  buttonsUsed?: boolean
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

interface CachedIssueDetails {
  key: string
  data: any
  fetchedAt: string
}

interface ChatContextType {
  messages: Message[]
  addMessage: (message: Message) => void
  updateMessage: (index: number, update: Partial<Message>) => void
  clearMessages: () => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  chatInterfaceRef: React.RefObject<{ sendQuickMessage: (message: string) => void }>
  lastIssueDetails: CachedIssueDetails | null
  setLastIssueDetails: (details: CachedIssueDetails | null) => void
  lastProjectKey: string | null
  setLastProjectKey: (project: string | null) => void
  sessions: ChatSession[]
  currentSessionId: string
  createNewSession: () => void
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

// ── helpers ────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function generateTitle(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 45 ? trimmed.slice(0, 45) + '…' : trimmed
}

function newSession(messages: Message[] = []): ChatSession {
  const now = new Date().toISOString()
  return { id: generateId(), title: 'New Chat', messages, createdAt: now, updatedAt: now }
}

function readLS<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeLS(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function removeLS(key: string) {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(key) } catch {}
}

// ── state initializers (run synchronously — no race condition) ──────────────

function initSessions(): ChatSession[] {
  // Try the new key first
  const saved = readLS<ChatSession[]>('chat-sessions')
  if (saved && Array.isArray(saved) && saved.length > 0) return saved

  // Migrate legacy flat messages
  const legacy = readLS<Message[]>('chat-messages')
  if (legacy && legacy.length > 0) {
    removeLS('chat-messages')
    const session = newSession(legacy)
    const firstUser = legacy.find(m => m.role === 'user')
    if (firstUser) session.title = generateTitle(firstUser.content)
    return [session]
  }

  // Fresh start
  return [newSession()]
}

function initCurrentSessionId(sessions: ChatSession[]): string {
  const saved = typeof window !== 'undefined' ? localStorage.getItem('chat-current-session-id') : null
  if (saved && sessions.find(s => s.id === saved)) return saved
  return sessions[sessions.length - 1].id
}

// ── provider ───────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  // State is initialised synchronously from localStorage — no race condition
  const [sessions, setSessions] = useState<ChatSession[]>(initSessions)
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    () => initCurrentSessionId(sessions)
  )
  const [isLoading, setIsLoading] = useState(false)
  const chatInterfaceRef = useRef<{ sendQuickMessage: (message: string) => void }>(null)
  const [lastIssueDetails, setLastIssueDetails] = useState<CachedIssueDetails | null>(
    () => readLS<CachedIssueDetails>('chat-last-issue')
  )
  const [lastProjectKey, setLastProjectKey] = useState<string | null>(
    () => typeof window !== 'undefined' ? localStorage.getItem('chat-last-project') : null
  )

  // ── persistence effects (write-only, always safe to fire) ──────────────

  useEffect(() => {
    writeLS('chat-sessions', sessions)
  }, [sessions])

  useEffect(() => {
    localStorage.setItem('chat-current-session-id', currentSessionId)
  }, [currentSessionId])

  useEffect(() => {
    if (lastIssueDetails) {
      writeLS('chat-last-issue', lastIssueDetails)
    } else {
      removeLS('chat-last-issue')
    }
  }, [lastIssueDetails])

  useEffect(() => {
    if (lastProjectKey) {
      localStorage.setItem('chat-last-project', lastProjectKey)
    } else {
      removeLS('chat-last-project')
    }
  }, [lastProjectKey])

  // ── derived ────────────────────────────────────────────────────────────

  const messages = sessions.find(s => s.id === currentSessionId)?.messages ?? []

  // ── actions ────────────────────────────────────────────────────────────

  const addMessage = useCallback((message: Message) => {
    const msg: Message = { ...message, timestamp: message.timestamp ?? new Date().toISOString() }
    setSessions(prev => prev.map(session => {
      if (session.id !== currentSessionId) return session
      const msgs = [...session.messages, msg]
      const title = session.title === 'New Chat' && msg.role === 'user'
        ? generateTitle(msg.content)
        : session.title
      return { ...session, messages: msgs, title, updatedAt: new Date().toISOString() }
    }))
  }, [currentSessionId])

  const updateMessage = useCallback((index: number, update: Partial<Message>) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== currentSessionId) return session
      const msgs = session.messages.map((m, i) => i === index ? { ...m, ...update } : m)
      return { ...session, messages: msgs, updatedAt: new Date().toISOString() }
    }))
  }, [currentSessionId])

  const clearMessages = useCallback(() => {
    setSessions(prev => prev.map(s =>
      s.id === currentSessionId
        ? { ...s, messages: [], title: 'New Chat', updatedAt: new Date().toISOString() }
        : s
    ))
    setLastIssueDetails(null)
    setLastProjectKey(null)
  }, [currentSessionId])

  const createNewSession = useCallback(() => {
    const session = newSession()
    setSessions(prev => [...prev, session])
    setCurrentSessionId(session.id)
  }, [])

  const switchSession = useCallback((id: string) => {
    setCurrentSessionId(id)
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== id)
      if (remaining.length === 0) {
        const fresh = newSession()
        setCurrentSessionId(fresh.id)
        return [fresh]
      }
      // If we're deleting the active session, switch to the most recent remaining
      if (id === currentSessionId) {
        setCurrentSessionId(remaining[remaining.length - 1].id)
      }
      return remaining
    })
  }, [currentSessionId])

  return (
    <ChatContext.Provider value={{
      messages,
      addMessage,
      updateMessage,
      clearMessages,
      isLoading,
      setIsLoading,
      chatInterfaceRef,
      lastIssueDetails,
      setLastIssueDetails,
      lastProjectKey,
      setLastProjectKey,
      sessions,
      currentSessionId,
      createNewSession,
      switchSession,
      deleteSession,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
