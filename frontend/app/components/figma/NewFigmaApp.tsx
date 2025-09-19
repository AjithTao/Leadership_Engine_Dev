'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { NewHeader } from './NewHeader'
import { NewLeftSidebar } from './NewLeftSidebar'
import { FigmaDashboard } from './Dashboard'
import InsightsDashboard from './InsightsDashboard'
import { NewLeadershipCopilot } from './NewLeadershipCopilot'
import { FigmaConnectionSettings } from './ConnectionSettings'
import { useTheme } from '../../contexts/ThemeContext'
import { SettingsProvider } from '../../contexts/SettingsContext'

export type ActiveView = 'copilot' | 'insights' | 'leadership'
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
  const [showSettings, setShowSettings] = useState(false)
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
        return <NewLeadershipCopilot 
          hasActiveConnections={hasActiveConnections} 
          theme={isDarkMode ? 'dark' : 'light'}
          quickActionPrompt={quickActionPrompt}
          onPromptSent={clearQuickActionPrompt}
        />
      case 'insights':
        return <InsightsDashboard />
      case 'leadership':
        return <FigmaDashboard hasActiveConnections={hasActiveConnections} theme={isDarkMode ? 'dark' : 'light'} />
      default:
        return <NewLeadershipCopilot 
          hasActiveConnections={hasActiveConnections} 
          theme={isDarkMode ? 'dark' : 'light'}
          quickActionPrompt={quickActionPrompt}
          onPromptSent={clearQuickActionPrompt}
        />
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
      <div className="h-full flex">
        {/* Left Pane - Sidebar */}
        <div className="w-64 flex-shrink-0">
          <NewLeftSidebar
            activeView={activeView}
            setActiveView={setActiveView}
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
            <NewHeader theme={isDarkMode ? 'dark' : 'light'} setTheme={() => {}} />
          </div>
          
          {/* Center Pane - Main Content */}
          <main className="flex-1 min-h-0 pt-16">
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
              className="h-full w-full"
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
            theme={isDarkMode ? 'dark' : 'light'}
          />
        )}
      </div>
    </div>
  )
}
