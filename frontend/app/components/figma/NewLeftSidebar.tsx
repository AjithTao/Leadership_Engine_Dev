'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import {
  Bot,
  BarChart3,
  Settings,
  Zap,
  Sparkles,
  WifiOff,
  Users,
  Target,
  TrendingUp,
  Shield,
  Database,
  Workflow,
  CheckCircle,
  X,
  Globe,
  Plug,
  ChevronDown,
  ChevronRight,
  FileText,
  Code,
  GitBranch,
  Ticket,
  Github,
  KanbanSquare,
  LayoutDashboard,
  FileBarChart,
  MessagesSquare,
  LineChart,
  Cloud,
  Rocket,
  FolderOpen,
  Layers
} from 'lucide-react'
import { FalconXLogo } from '../ui/FalconXLogo'
import { getApiUrl } from '../../../lib/api-config'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../contexts/ThemeContext'
import { useSettings } from '../../contexts/SettingsContext'
import type { ActiveView } from './NewFigmaApp'

interface Connection {
  name: string
  status: 'connected' | 'disconnected'
  type: 'atlassian' | 'github' | 'slack' | 'tableau'
}

interface NewLeftSidebarProps {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  connections: Connection[]
  toggleConnection: (index: number) => void
  hasActiveConnections: boolean
  setShowSettings: (show: boolean) => void
  theme: 'light' | 'dark'
  onConnect: (connectionType: string) => Promise<void>
  onQuickAction: (prompt: string) => void
}

export function NewLeftSidebar({
  activeView,
  setActiveView,
  connections,
  toggleConnection,
  hasActiveConnections,
  setShowSettings,
  theme,
  onConnect,
  onQuickAction
}: NewLeftSidebarProps) {
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [showConnectedPopup, setShowConnectedPopup] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const [integrationsExpanded, setIntegrationsExpanded] = useState(true)
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)

  // Theme context
  const { currentTheme, isDarkMode, toggleDarkMode } = useTheme()
  const { settings, isLoaded } = useSettings()
  const { primary, secondary, surface, text, textSecondary, border, background, error } = currentTheme.colors

  // Initialize client-side state
  useEffect(() => {
    setIsClient(true)
  }, [])


  // Fade out welcome message after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // Quick Actions Data
  const quickActions = [
    {
      label: "Analyze",
      subtext: "Performance",
      icon: BarChart3,
      prompt: "Analyze team performance metrics and productivity trends",
    },
    {
      label: "Insights",
      subtext: "Team",
      icon: Users,
      prompt: "Provide insights about team workload and collaboration patterns",
    },
    {
      label: "Track",
      subtext: "Goals",
      icon: Target,
      prompt: "Track OKRs and KPIs progress across the organization",
    },
    {
      label: "Plan",
      subtext: "Sprints",
      icon: Workflow,
      prompt: "Help organize and plan agile sprints and project timelines",
    }
  ]

  // Update client state
  React.useEffect(() => {
    setIsClient(true)
  }, [])

  React.useEffect(() => {
    if (['insights', 'github-insights', 'tcoe-dashboard', 'tcoe-report'].includes(activeView)) {
      setInsightsExpanded(true)
    }
  }, [activeView])


  const handleConnect = async (connectionType: string) => {
    setConnecting(connectionType)
    try {
      await onConnect(connectionType)
      // Show animated popup
      setShowConnectedPopup(connectionType)
      setTimeout(() => {
        setShowConnectedPopup(null)
      }, 2000) // Hide popup after 2 seconds
    } catch (error) {
      console.error('Connection failed:', error)
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (connectionType: string) => {
    setConnecting(connectionType)
    try {
      // Find the connection index and toggle it to disconnected
      const connectionIndex = connections.findIndex(conn => conn.type === connectionType)
      if (connectionIndex !== -1) {
        toggleConnection(connectionIndex)
      }

      // Clear saved configuration from localStorage
      const configKey = `${connectionType}-config`
      localStorage.removeItem(configKey)

      // Show success message
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (error) {
      console.error('Disconnection failed:', error)
    } finally {
      setConnecting(null)
    }
  }

  return (
    <>
      {/* Sidebar — dark indigo panel in light mode, unchanged card panel in dark */}
      <aside
        className="w-64 flex flex-col h-full min-h-0 overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          backgroundColor: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-item-border)',
          fontFamily: 'var(--font)',
        }}
      >
        {/* Header */}
        <div className="p-5" style={{ borderBottom: '1px solid var(--sidebar-item-border)' }}>
          <FalconXLogo size={28} color="var(--chrome-accent)" textColor="var(--sidebar-text)" xColor="var(--chrome-accent)" showText={true} />
          <p
            className="mt-1 ml-9 font-medium tracking-wider uppercase"
            style={{ color: 'var(--chrome-accent)', opacity: 0.9, fontSize: '10px', letterSpacing: '0.08em' }}
          >
            LEADERSHIP ENGINE
          </p>

          <AnimatePresence>
            {showWelcome && (
              <motion.div
                className="mt-4"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: 1, ease: "easeOut" }
                }}
              >
                <p className="text-sm" style={{ color: 'var(--sidebar-text-muted)' }}>Welcome back,</p>
                <p className="text-sm font-medium" style={{ color: 'var(--sidebar-text)' }}>
                  {isLoaded ? settings.userProfile.name : "User"}! 👋
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ScrollArea className="sidebar-nav-scroll flex-1 min-h-0">
          <div className="p-4 pb-6 space-y-5">
            {/* Navigation */}
            <div className="space-y-1.5">
              {/* Section label: text-hint, uppercase, 11px, letter-spacing 0.07em */}
              <h4
                className="font-semibold uppercase px-1"
                style={{
                  color: 'var(--sidebar-section-label)',
                  fontSize: '11px',
                  letterSpacing: '0.07em',
                  marginBottom: '8px',
                }}
              >
                Navigation
              </h4>

              {/* Work Buddy */}
              <NavButton
                active={activeView === 'copilot'}
                onClick={() => setActiveView('copilot')}
                primary={primary}
              >
                <MessagesSquare className="w-4 h-4 flex-shrink-0" style={{ color: activeView === 'copilot' ? 'var(--chrome-accent)' : 'var(--sidebar-text-muted)' }} />
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium leading-none">Work Buddy</span>
                    <span
                      title="Work Buddy is in beta — it's still being trained, so responses may occasionally be inaccurate."
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        lineHeight: 1,
                        padding: '2px 6px',
                        borderRadius: 999,
                        color: 'var(--chrome-accent)',
                        background: 'var(--chrome-accent-dim)',
                        border: '1px solid var(--chrome-accent-border)',
                        flexShrink: 0
                      }}
                    >
                      Beta
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--sidebar-subtext)' }}>AI Assistant</div>
                </div>
              </NavButton>

              {/* Insights — Collapsible */}
              <div className="space-y-0.5">
                {(() => {
                  const insightsActive =
                    activeView === 'insights' ||
                    activeView === 'github-insights' ||
                    activeView === 'tcoe-dashboard' ||
                    activeView === 'tcoe-report'
                  return (
                    <>
                      <NavButton
                        active={insightsActive}
                        onClick={() => setInsightsExpanded(!insightsExpanded)}
                        primary={primary}
                      >
                        <LineChart className="w-4 h-4 flex-shrink-0" style={{ color: insightsActive ? 'var(--chrome-accent)' : 'var(--sidebar-text-muted)' }} />
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm font-medium leading-none">Insights</div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--sidebar-subtext)' }}>Analytics</div>
                        </div>
                        {insightsExpanded
                          ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-subtext)' }} />
                          : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-subtext)' }} />
                        }
                      </NavButton>

                      {insightsExpanded && (
                        <div
                          className="ml-7 pl-3 space-y-0.5"
                          style={{ borderLeft: '1px solid var(--sidebar-item-border)' }}
                        >
                          <SubNavButton
                            active={activeView === 'insights'}
                            onClick={() => setActiveView('insights')}
                            primary={primary}
                          >
                            <KanbanSquare className="w-3.5 h-3.5 flex-shrink-0" />
                            Jira Insights
                          </SubNavButton>

                          <SubNavButton
                            active={activeView === 'github-insights'}
                            onClick={() => setActiveView('github-insights')}
                            primary={primary}
                          >
                            <Github className="w-3.5 h-3.5 flex-shrink-0" />
                            GitHub Insights
                          </SubNavButton>

                          <SubNavButton
                            active={activeView === 'tableau-insights'}
                            onClick={() => setActiveView('tableau-insights')}
                            primary={primary}
                          >
                            <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" />
                            Tableau
                          </SubNavButton>

                          <SubNavButton
                            active={activeView === 'tcoe-dashboard'}
                            onClick={() => setActiveView('tcoe-dashboard')}
                            primary={primary}
                          >
                            <LayoutDashboard className="w-3.5 h-3.5 flex-shrink-0" />
                            QCOE Dashboard
                          </SubNavButton>

                          <SubNavButton
                            active={activeView === 'tcoe-report'}
                            onClick={() => setActiveView('tcoe-report')}
                            primary={primary}
                          >
                            <FileBarChart className="w-3.5 h-3.5 flex-shrink-0" />
                            QCOE Metrics
                          </SubNavButton>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>


            </div>

            {/* Integrations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4
                  className="font-semibold uppercase"
                  style={{
                    color: 'var(--sidebar-section-label)',
                    fontSize: '11px',
                    letterSpacing: '0.07em',
                  }}
                >
                  Integrations
                </h4>
                <button
                  onClick={() => setIntegrationsExpanded(!integrationsExpanded)}
                  className="h-5 w-5 flex items-center justify-center rounded transition-colors"
                  style={{ color: 'var(--sidebar-text-muted)' }}
                >
                  {integrationsExpanded
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />
                  }
                </button>
              </div>

              {integrationsExpanded && (
                <div className="space-y-1">
                  {[
                    { name: 'Jira',       label: 'Project Management', icon: Database,  coming: false },
                    { name: 'Confluence', label: 'Documentation',       icon: FileText,  coming: false },
                    { name: 'GitHub',     label: 'Code & CI/CD',        icon: Github,    coming: false },
                    { name: 'Tableau',    label: 'BI & Analytics',      icon: BarChart3, coming: false },
                  ].map(({ name, label, icon: Icon, coming }) => {
                    const conn = connections.find(c => c.name === name)
                    const isConnected = conn?.status === 'connected'
                    return (
                      <IntegrationRow
                        key={name}
                        name={name}
                        label={label}
                        Icon={Icon}
                        isConnected={isConnected}
                        coming={coming}
                        primary={primary}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5">
              {!hasActiveConnections && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="fx-pill w-full h-9 flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-opacity duration-200 active:scale-[0.98] hover:opacity-90"
                  style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
                >
                  <Plug className="w-3.5 h-3.5" />
                  Connect Integrations
                </button>
              )}
              {hasActiveConnections && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="fx-pill w-full h-9 flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200 active:scale-[0.98]"
                    style={{
                      border: '1px solid var(--sidebar-item-border)',
                      color: 'var(--sidebar-text)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Manage
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <h4
                className="font-semibold uppercase px-1"
                style={{
                  color: 'var(--sidebar-section-label)',
                  fontSize: '11px',
                  letterSpacing: '0.07em',
                }}
              >
                Quick Actions
              </h4>
              <div className="space-y-0.5">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => onQuickAction(action.prompt)}
                    className="w-full flex items-center gap-3 h-10 px-3 rounded-xl text-left transition-colors duration-200"
                    style={{ color: 'var(--sidebar-text)', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: isDarkMode ? 'var(--bg-surface)' : 'var(--sidebar-hover-bg)' }}
                    >
                      <action.icon className="w-3.5 h-3.5" style={{ color: isDarkMode ? primary : 'var(--chrome-accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-none truncate">{action.label}</div>
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--sidebar-text-muted)' }}>{action.subtext}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

      </aside>

      {/* Animated Connected Popup — border only, no shadow */}
      <AnimatePresence>
        {showConnectedPopup && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
          >
            <div
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--green-bg)',
                  border: '1px solid var(--green)',
                }}
              >
                <CheckCircle className="w-5 h-5" style={{ color: 'var(--green)' }} />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {showConnectedPopup === 'atlassian' ? 'Atlassian' :
                   showConnectedPopup === 'github' ? 'GitHub' : 'Integration'} Connected
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Integration is now active</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Top-level nav button: active = bg-active, hover = bg-hover, active indicator stripe */
function NavButton({
  active,
  onClick,
  primary,
  children,
}: {
  active: boolean
  onClick: () => void
  primary: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  const bg = active
    ? 'var(--sidebar-active-bg)'
    : hovered
    ? 'var(--sidebar-hover-bg)'
    : 'transparent'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 h-11 px-3 rounded-xl transition-colors duration-150 relative"
      style={{
        backgroundColor: bg,
        color: active ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {active && (
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{ left: 5, width: 3, height: 18, backgroundColor: 'var(--chrome-accent)' }}
        />
      )}
      {children}
    </button>
  )
}

/** Sub-nav button (inside collapsed section) */
function SubNavButton({
  active,
  onClick,
  primary,
  children,
}: {
  active: boolean
  onClick: () => void
  primary: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  const bg = active
    ? 'var(--sidebar-active-bg)'
    : hovered
    ? 'var(--sidebar-hover-bg)'
    : 'transparent'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 h-9 px-2 rounded-lg text-sm transition-colors duration-150 overflow-hidden"
      style={{
        backgroundColor: bg,
        color: active ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  )
}

/** Integration row with status dot */
function IntegrationRow({
  name,
  label,
  Icon,
  isConnected,
  coming,
  primary,
}: {
  name: string
  label: string
  Icon: React.ElementType
  isConnected: boolean | undefined
  coming: boolean
  primary: string
}) {
  const [hovered, setHovered] = useState(false)

  // Status dot color: green = connected, red = disconnected, gray = coming-soon
  const dotColor = coming
    ? 'var(--sidebar-subtext)'
    : isConnected
    ? 'var(--chrome-success)'
    : 'var(--chrome-danger)'

  return (
    <div
      className="flex items-center justify-between px-3 h-11 rounded-xl transition-colors duration-150"
      style={{
        opacity: coming ? 0.4 : 1,
        cursor: coming ? 'default' : 'default',
        backgroundColor: hovered && !coming ? 'var(--sidebar-hover-bg)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon
          className="w-4 h-4 flex-shrink-0"
          style={{ color: isConnected ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)' }}
        />
        <div className="min-w-0">
          <div
            className="text-sm font-medium truncate"
            style={{ color: 'var(--sidebar-text)' }}
          >
            {name}
          </div>
          <div className="text-[11px] truncate" style={{ color: 'var(--sidebar-text-muted)' }}>{label}</div>
        </div>
      </div>
      {coming ? (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{
            border: '1px solid var(--sidebar-item-border)',
            color: 'var(--sidebar-text-muted)',
          }}
        >
          Soon
        </span>
      ) : (
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      )}
    </div>
  )
}
