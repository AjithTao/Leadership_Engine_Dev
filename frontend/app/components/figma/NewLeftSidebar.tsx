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
  const [showAboutUs, setShowAboutUs] = useState(false)

  const [integrationsExpanded, setIntegrationsExpanded] = useState(true)
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [mercuryExpanded, setMercuryExpanded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const showLegacyAboutContent = false

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

  React.useEffect(() => {
    if (['services-dashboard', 'services-modern'].includes(activeView)) {
      setMercuryExpanded(true)
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

              {/* Project Mercury — Collapsible */}
              <div className="space-y-0.5">
                {(() => {
                  const mercuryActive = activeView === 'services-dashboard' || activeView === 'services-mod-dashboard' || activeView === 'services-modern'
                  return (
                    <>
                      <NavButton
                        active={mercuryActive}
                        onClick={() => setMercuryExpanded(!mercuryExpanded)}
                        primary={primary}
                      >
                        <Rocket className="w-4 h-4 flex-shrink-0" style={{ color: mercuryActive ? 'var(--chrome-accent)' : 'var(--sidebar-text-muted)' }} />
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm font-medium leading-none">Project Mercury</div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--sidebar-subtext)' }}>T&L Execution</div>
                        </div>
                        {mercuryExpanded
                          ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-subtext)' }} />
                          : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-subtext)' }} />
                        }
                      </NavButton>

                      {mercuryExpanded && (
                        <div
                          className="ml-7 pl-3 space-y-0.5 overflow-hidden"
                          style={{ borderLeft: '1px solid var(--sidebar-item-border)' }}
                        >
                          <SubNavButton
                            active={activeView === 'services-dashboard'}
                            onClick={() => setActiveView('services-dashboard')}
                            primary={primary}
                          >
                            <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="min-w-0 truncate text-left">
                              DMS Modern Enablement
                            </span>
                          </SubNavButton>

                          <SubNavButton
                            active={activeView === 'services-mod-dashboard'}
                            onClick={() => setActiveView('services-mod-dashboard')}
                            primary={primary}
                          >
                            <LayoutDashboard className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="min-w-0 truncate text-left">
                              Module Test Status
                            </span>
                          </SubNavButton>

                          <SubNavButton
                            active={activeView === 'services-modern'}
                            onClick={() => setActiveView('services-modern')}
                            primary={primary}
                          >
                            <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="min-w-0 truncate text-left">
                              Services Modern Enablement
                            </span>
                            <span style={{
                              fontSize: 8,
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase' as const,
                              lineHeight: 1,
                              padding: '2px 5px',
                              borderRadius: 999,
                              color: 'var(--chrome-accent)',
                              background: 'var(--chrome-accent-dim)',
                              border: '1px solid var(--chrome-accent-border)',
                              flexShrink: 0,
                              whiteSpace: 'nowrap' as const,
                            }}>
                              Soon
                            </span>
                          </SubNavButton>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Salesforce — Separate top-level (last) */}
              <NavButton
                active={activeView === 'salesforce-insights'}
                onClick={() => setActiveView('salesforce-insights')}
                primary={primary}
              >
                <Cloud className="w-4 h-4 flex-shrink-0" style={{ color: activeView === 'salesforce-insights' ? 'var(--chrome-accent)' : 'var(--sidebar-text-muted)' }} />
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium leading-none">Salesforce</span>
                    <span
                      title="Salesforce CRM insights are under development and not yet available."
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
                      Coming Soon
                    </span>
                  </div>
                </div>
              </NavButton>

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
                  {connections.some(c => c.status === 'connected') && (
                    <button
                      onClick={async () => {
                        try { await fetch(getApiUrl('/api/jira/disconnect'), { method: 'POST' }) } catch {}
                        try { await fetch(getApiUrl('/api/confluence/disconnect'), { method: 'POST' }) } catch {}
                        try { toggleConnection(-1) } catch {}
                      }}
                      className="fx-pill w-full h-9 flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200 active:scale-[0.98]"
                      style={{
                        border: '1px solid var(--chrome-danger)',
                        color: 'var(--chrome-danger)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <WifiOff className="w-3.5 h-3.5" />
                      Disconnect All
                    </button>
                  )}
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

        {/* Footer */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--sidebar-item-border)' }}>
          <button
            onClick={() => setShowAboutUs(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200"
            style={{ color: 'var(--sidebar-text-muted)', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">About Us</span>
          </button>
        </div>
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

      {/* FalconX About Modal */}
      <AnimatePresence>
        {showAboutUs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowAboutUs(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-2xl max-h-[88vh] rounded-2xl overflow-hidden flex flex-col"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header — no gradient */}
              <div
                className="flex items-center justify-between p-6 shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <motion.div
                  className="flex items-center space-x-3"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: primary }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3L21 12L13 14L10 21L3 3Z" fill={isDarkMode ? '#000000' : 'var(--surface)'} />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>FalconX</h2>
                    <p className="text-xs font-medium" style={{ color: primary }}>Leadership Engine - AI Leadership Platform</p>
                  </div>
                </motion.div>
                <button
                  onClick={() => setShowAboutUs(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.5 }}
                  className="p-5 rounded-2xl"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: primary, letterSpacing: '0.07em' }}>
                    In simple English
                  </p>
                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    FalconX helps leaders understand work faster.
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    FalconX brings team information into one place. It looks at tools like Jira and Confluence, then shows clear answers about progress, risks, quality, and where help is needed.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22, duration: 0.5 }}
                >
                  <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    What FalconX Is Used For
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { Icon: Bot, title: 'Ask work questions', desc: 'Ask what is happening, what is blocked, and what needs attention.' },
                      { Icon: BarChart3, title: 'See team progress', desc: 'View sprint, delivery, and workload updates without building reports by hand.' },
                      { Icon: Shield, title: 'Understand quality', desc: 'Find defect trends and see where production issues are coming from.' },
                      { Icon: Users, title: 'Help teams focus', desc: 'Spot overloaded teams, missed goals, and decisions leaders should make next.' },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.28 + i * 0.06, duration: 0.4 }}
                        className="p-4 rounded-xl"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: 'var(--bg-active)',
                              color: primary,
                            }}
                          >
                            <item.Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{item.title}</h4>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="p-5 rounded-2xl"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Why teams use it</h3>
                  <div className="space-y-3">
                    {[
                      'To avoid jumping between many tools for basic status.',
                      'To see risks earlier, before they become bigger problems.',
                      'To make weekly updates and leadership reviews easier.',
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-3">
                        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: primary }} />
                        <span className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{text}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {showLegacyAboutContent && (
                  <>

                {/* Why FalconX */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.5 }}
                >
                  <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Why FalconX?
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    FalconX is an <strong style={{ color: primary }}>AI-powered leadership &amp; productivity intelligence</strong> platform
                    built on the Leadership Engine platform. It transforms how engineering teams operate — replacing manual
                    reporting with real-time data, predictive analytics, and actionable insights that flow directly
                    into how leaders make decisions.
                  </p>
                </motion.div>

                {/* Benefits grid */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22, duration: 0.5 }}
                >
                  <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    What FalconX Delivers
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { icon: '⚡', title: 'Real-Time Insights', desc: 'Live sprint, velocity, and burndown data from Jira — no manual exports.' },
                      { icon: '🔗', title: 'Jira & Confluence Integration', desc: 'Seamless sync with your existing project management and docs toolchain.' },
                      { icon: '🐞', title: 'Defect Leakage Analysis', desc: 'Identify escape defects early, track trends, and reduce production bugs.' },
                      { icon: '📊', title: 'Sprint Analytics', desc: 'Completion rates, carry-over risk, and predictive sprint health scores.' },
                      { icon: '👥', title: 'Team Capacity Tracking', desc: 'Balance workload across individuals with AI-assisted capacity planning.' },
                      { icon: '🔮', title: 'Predictive Analytics', desc: 'ML models forecast delivery risk and surface bottlenecks before they block.' },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.28 + i * 0.06, duration: 0.4 }}
                        className="p-4 rounded-2xl"
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl leading-none mt-0.5">{item.icon}</span>
                          <div>
                            <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{item.title}</h4>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* Value proposition — no gradient, use bg-card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65, duration: 0.5 }}
                  className="p-5 rounded-2xl"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Value Proposition</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Faster Decisions', detail: 'Leadership dashboards consolidate data from multiple tools in one view.' },
                      { label: 'Reduced Manual Reporting', detail: 'Automated report generation saves hours of weekly data preparation.' },
                      { label: 'Data-Driven Leadership', detail: 'Move from gut-feel management to evidence-based, AI-assisted decision making.' },
                    ].map((vp) => (
                      <div key={vp.label} className="flex items-start gap-3">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ backgroundColor: primary }}
                        >
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke={isDarkMode ? '#000000' : 'var(--surface)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div>
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{vp.label} — </span>
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{vp.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75, duration: 0.4 }}
                  className="flex justify-center pb-2"
                >
                  <a
                    href="https://www.cdkdigitalsolutions.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-opacity duration-200 hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-fg)',
                    }}
                  >
                    <Globe className="w-4 h-4" />
                    Learn More at CDK Digital Solutions
                  </a>
                </motion.div>
                  </>
                )}
              </div>
            </motion.div>
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
