'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { FigmaHeader } from './Header'
import { FigmaLeftSidebar } from './LeftSidebar'
import { FigmaDashboard } from './Dashboard'
import InsightsDashboard from './InsightsDashboard'
import { FigmaLeadershipCopilot } from './LeadershipCopilot'
import { FigmaConnectionSettings } from './ConnectionSettings'

export type ActiveView = 'copilot' | 'insights' | 'leadership'
export type Theme = 'light' | 'dark'

export interface Connection {
  name: string
  status: 'connected' | 'disconnected'
  type: 'atlassian' | 'github' | 'slack'
}

export default function FigmaApp() {
  const [activeView, setActiveView] = useState<ActiveView>('copilot')
  const [showSettings, setShowSettings] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [quickActionPrompt, setQuickActionPrompt] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([
    { name: 'Atlassian Workspace', status: 'disconnected', type: 'atlassian' },
    { name: 'GitHub Repository', status: 'disconnected', type: 'github' },
    { name: 'Slack Workspace', status: 'disconnected', type: 'slack' }
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

  const renderContent = () => {
    switch (activeView) {
      case 'copilot':
        return <FigmaLeadershipCopilot 
          hasActiveConnections={hasActiveConnections} 
          theme={theme}
          quickActionPrompt={quickActionPrompt}
          onPromptSent={clearQuickActionPrompt}
        />
      case 'insights':
        return <InsightsDashboard />
      case 'leadership':
        return <FigmaDashboard hasActiveConnections={hasActiveConnections} theme={theme} />
      default:
        return <FigmaLeadershipCopilot 
          hasActiveConnections={hasActiveConnections} 
          theme={theme}
          quickActionPrompt={quickActionPrompt}
          onPromptSent={clearQuickActionPrompt}
        />
    }
  }

  return (
    <div className={`h-screen overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'dark' : 'light'}`}>
      <div className={`h-full ${theme === 'dark' 
        ? 'bg-[var(--bg-primary)]' 
        : 'bg-white'
      }`}>
        {/* Fixed Left Sidebar */}
        <div className="fixed left-0 top-0 w-56 min-w-[200px] max-w-[240px] h-screen z-30 flex-shrink-0">
          <FigmaLeftSidebar
            activeView={activeView}
            setActiveView={setActiveView}
            connections={connections}
            toggleConnection={toggleConnection}
            hasActiveConnections={hasActiveConnections}
            setShowSettings={setShowSettings}
            theme={theme}
            onConnect={onConnect}
            onQuickAction={handleQuickAction}
          />
        </div>
        
        {/* Fixed Header */}
        <div className="fixed top-0 right-0 left-56 min-left-[200px] max-left-[240px] h-12 z-50">
          <FigmaHeader theme={theme} setTheme={setTheme} />
        </div>
        
        {/* Main Content Area */}
        <main className="fixed top-12 right-0 left-56 min-left-[200px] max-left-[240px] bottom-0 overflow-hidden">
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
            className="h-full w-full relative z-5"
          >
            {renderContent()}
          </motion.div>
        </main>

        {/* Settings Modal */}
        {showSettings && (
          <FigmaConnectionSettings 
            connections={connections}
            setConnections={setConnections}
            onClose={() => setShowSettings(false)}
            theme={theme}
          />
        )}
      </div>
    </div>
  )
}
