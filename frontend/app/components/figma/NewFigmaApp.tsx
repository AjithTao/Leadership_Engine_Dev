'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { NewHeader } from './NewHeader'
import { NewLeftSidebar } from './NewLeftSidebar'
import { FigmaDashboard } from './Dashboard'
import InsightsDashboard from './InsightsDashboard'
import { NewLeadershipCopilot } from './NewLeadershipCopilot'
import { FigmaConnectionSettings } from './ConnectionSettings'
import { DefectLeakageAnalyzer } from '../DefectLeakageAnalyzer'
import { TCOEDashboard } from '../TCOEDashboard'
import { QAMetricsDashboard } from '../QAMetricsDashboard'
import { KPIMetricsDashboard } from '../KPIMetricsDashboard'
import { GitHubInsightsDashboard } from '../GitHubInsightsDashboard'
import { ServicesDashboard } from '../ServicesDashboard'
import { ServicesModDashboard } from '../ServicesModDashboard'
import { useTheme } from '../../contexts/ThemeContext'
import { SettingsProvider } from '../../contexts/SettingsContext'

export type ActiveView = 'copilot' | 'insights' | 'github-insights' | 'leadership' | 'tcoe-report' | 'tcoe-dashboard' | 'qa-metrics' | 'kpi-metrics' | 'salesforce-insights' | 'services-dashboard' | 'services-mod-dashboard' | 'services-modern'
export type Theme = 'light' | 'dark'

export interface Connection {
  name: string
  status: 'connected' | 'disconnected'
  type: 'atlassian' | 'github' | 'slack'
}

export default function NewFigmaApp() {
  return (
    <SettingsProvider>
      <NewFigmaAppContent />
    </SettingsProvider>
  )
}

function NewFigmaAppContent() {
  const { currentTheme, isDarkMode } = useTheme();
  const [activeView, setActiveView] = useState<ActiveView>('copilot')
  const [integrations, setIntegrations] = useState<string[]>([])
  const [uploadedDocReady, setUploadedDocReady] = useState(false)
  
  // Handler for view change
  const handleViewChange = (view: ActiveView) => {
    setActiveView(view as ActiveView);
  };
  const [showSettings, setShowSettings] = useState(false)
  const [quickActionPrompt, setQuickActionPrompt] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([
    { name: 'Jira',       status: 'disconnected', type: 'atlassian' },
    { name: 'Confluence', status: 'disconnected', type: 'atlassian' },
    { name: 'GitHub',     status: 'disconnected', type: 'github'    },
  ])

  const toggleConnection = (index: number) => {
    setConnections(prev => prev.map((conn, i) => 
      i === index 
        ? { ...conn, status: conn.status === 'connected' ? 'disconnected' : 'connected' }
        : conn
    ))
  }

  const hasActiveConnections = connections.some(conn => conn.status === 'connected')

  const handleQuickAction = (prompt: string) => {
    setQuickActionPrompt(prompt)
    setActiveView('copilot') // Switch to copilot view
  }

  const clearQuickActionPrompt = () => {
    setQuickActionPrompt(null)
  }

  const onConnect = async (connectionType: string) => {
    try {
      // Get saved settings from localStorage
      const savedConfig = localStorage.getItem(`${connectionType}-config`)
      if (!savedConfig) {
        throw new Error('Please configure settings first')
      }

      const config = JSON.parse(savedConfig)
      
      if (connectionType === 'atlassian') {
        // Make API call to configure Jira
        const response = await fetch('http://localhost:8000/api/jira/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: config.url,
            email: config.email,
            api_token: config.apiToken,
            board_id: config.boardId || '1' // Default to '1' if empty
          })
        })

        if (!response.ok) {
          throw new Error('Failed to connect to Jira')
        }

        // Update connection status
        setConnections(prev => prev.map(conn => 
          conn.type === 'atlassian' 
            ? { ...conn, status: 'connected' }
            : conn
        ))
      } else {
        // For GitHub and Slack, just toggle the status for now
        setConnections(prev => prev.map(conn => 
          conn.type === connectionType 
            ? { ...conn, status: 'connected' }
            : conn
        ))
      }
    } catch (error) {
      console.error('Connection failed:', error)
      throw error
    }
  }

  // Welcome popup is now handled in NewLeadershipCopilot component
  // No need to show it here anymore

  // Poll backend status and update sidebar dots
  React.useEffect(() => {
    let mounted = true

    const refreshStatuses = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
        const jiraRes = await fetch(`${apiBase}/api/jira/status`).then(r => r.json()).catch(() => null)
        const confRes = await fetch(`${apiBase}/api/confluence/status`).then(r => r.json()).catch(() => null)
        const githubRes = await fetch(`${apiBase}/api/github/status`).then(r => r.json()).catch(() => null)

        if (!mounted) return

        setConnections(prev => prev.map(c => {
          if (c.name === 'Jira') {
            return { ...c, status: jiraRes && jiraRes.configured ? 'connected' as const : 'disconnected' as const }
          }
          if (c.name === 'Confluence') {
            return { ...c, status: confRes && confRes.configured ? 'connected' as const : 'disconnected' as const }
          }
          if (c.name === 'GitHub') {
            return { ...c, status: githubRes && githubRes.connected ? 'connected' as const : 'disconnected' as const }
          }
          return c
        }))
      } catch {
        // ignore network errors; keep current indicators
      }
    }

    // Initial fetch with a small delay to ensure auto-connect has completed
    // (auto-connect happens during login, so we give it 2 seconds to complete)
    setTimeout(() => {
      refreshStatuses()
    }, 2000)
    
    // Poll every 10 seconds to keep status updated
    const id = window.setInterval(refreshStatuses, 10000) // 10 seconds
    
    // Listen for integration update events (triggered after auto-connect)
    const handleIntegrationUpdate = () => {
      refreshStatuses()
    }
    window.addEventListener('integration-update', handleIntegrationUpdate)
    
    return () => { 
      mounted = false
      window.clearInterval(id)
      window.removeEventListener('integration-update', handleIntegrationUpdate)
    }
  }, [])

  const renderContent = () => {
    switch (activeView) {
      case 'copilot':
        return <NewLeadershipCopilot 
          hasActiveConnections={hasActiveConnections} 
          theme={isDarkMode ? 'dark' : 'light'}
          quickActionPrompt={quickActionPrompt}
          onPromptSent={clearQuickActionPrompt}
          integrations={integrations}
          setIntegrations={setIntegrations}
          uploadedDocReady={uploadedDocReady}
          setUploadedDocReady={setUploadedDocReady}
        />
      case 'tcoe-report':
        return <DefectLeakageAnalyzer />
      case 'tcoe-dashboard':
        return <TCOEDashboard />
      case 'qa-metrics':
        return <QAMetricsDashboard />
      case 'kpi-metrics':
        return <KPIMetricsDashboard />
      case 'insights':
        return <InsightsDashboard />
      case 'github-insights':
        return <GitHubInsightsDashboard />
      case 'salesforce-insights':
        return (
          <div className="h-full flex flex-col items-center justify-center gap-5">
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
              </svg>
            </div>
            <div className="text-center" style={{ maxWidth: 340 }}>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Salesforce CRM Insights
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Salesforce CRM insights are under development and not yet available. Check back soon for deal pipeline, lead conversion, and account health data.
              </p>
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
              padding: '5px 12px',
              borderRadius: 999,
              color: 'var(--accent-cool-text)',
              background: 'var(--accent-cool-bg)',
              border: '1px solid color-mix(in srgb, var(--accent-cool) 35%, transparent)',
            }}>
              Coming Soon
            </span>
          </div>
        )
      case 'leadership':
        return <FigmaDashboard hasActiveConnections={hasActiveConnections} theme={isDarkMode ? 'dark' : 'light'} />
      case 'services-dashboard':
        return <ServicesDashboard />
      case 'services-mod-dashboard':
        return <ServicesModDashboard />
      case 'services-modern':
        return (
          <div className="h-full flex flex-col items-center justify-center gap-5">
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
              </svg>
            </div>
            <div className="text-center" style={{ maxWidth: 340 }}>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Services Modern Enablement
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                This feature is currently under development. Check back soon for modern services enablement insights and tooling.
              </p>
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
              padding: '5px 12px',
              borderRadius: 999,
              color: 'var(--accent-cool-text)',
              background: 'var(--accent-cool-bg)',
              border: '1px solid color-mix(in srgb, var(--accent-cool) 35%, transparent)',
            }}>
              Coming Soon
            </span>
          </div>
        )
      default:
        return <NewLeadershipCopilot 
          hasActiveConnections={hasActiveConnections} 
          theme={isDarkMode ? 'dark' : 'light'}
          quickActionPrompt={quickActionPrompt}
          onPromptSent={clearQuickActionPrompt}
          integrations={integrations}
          setIntegrations={setIntegrations}
          uploadedDocReady={uploadedDocReady}
          setUploadedDocReady={setUploadedDocReady}
        />
    }
  }

  return (
    <div className="h-screen overflow-hidden" style={{ backgroundColor: currentTheme.colors.background }}>
      <div className="h-full flex">
        {/* Left Pane - Sidebar */}
        <div className="w-64 flex-shrink-0">
          <NewLeftSidebar
            activeView={activeView}
            setActiveView={handleViewChange}
            connections={connections}
            toggleConnection={toggleConnection}
            hasActiveConnections={hasActiveConnections}
            setShowSettings={setShowSettings}
            theme={isDarkMode ? 'dark' : 'light'}
            onConnect={onConnect}
            onQuickAction={handleQuickAction}
          />
        </div>
        
        {/* Right Pane - Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header Pane */}
          <div className="flex-shrink-0">
            <NewHeader
            theme={isDarkMode ? 'dark' : 'light'}
            setTheme={() => {}}
            integrations={integrations}
            setIntegrations={setIntegrations}
            uploadedDocReady={uploadedDocReady}
            setUploadedDocReady={setUploadedDocReady}
            activeView={activeView}
          />
          </div>
          
          {/* Center Pane - Main Content */}
          <main className={`flex-1 min-h-0 overflow-hidden ${activeView === 'copilot' || !activeView ? 'pt-24' : 'pt-14'}`}>
            <motion.div
              key={activeView}
              initial={{ opacity: 0, x: 30, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30, scale: 0.98 }}
              transition={{ 
                type: "spring",
                damping: 25,
                stiffness: 200,
                duration: 0.6
              }}
              className="h-full w-full overflow-hidden"
            >
              {renderContent()}
            </motion.div>
          </main>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <FigmaConnectionSettings 
            connections={connections}
            setConnections={setConnections}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  )
}
