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
  Circle,
  Zap,
  Activity,
  Sparkles,
  Wifi,
  WifiOff,
  Crown,
  Users,
  Target,
  GitBranch,
  RefreshCw,
  TrendingUp,
  Shield,
  Database,
  Cloud,
  Workflow,
  Layers,
  Command,
  Terminal,
  Monitor,
  Server,
  CheckCircle,
  X,
  Globe,
  Palette,
  Sun,
  MoonStar,
  Plug,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { ThemeSelector } from '../ui/ThemeSelector'
import { useTheme } from '../../contexts/ThemeContext'
import { useSettings } from '../../contexts/SettingsContext'

interface Connection {
  name: string
  status: 'connected' | 'disconnected'
  type: 'atlassian' | 'github' | 'slack'
}

interface NewLeftSidebarProps {
  activeView: 'copilot' | 'insights' | 'leadership'
  setActiveView: (view: 'copilot' | 'insights' | 'leadership') => void
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
  const [isClient, setIsClient] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [showConnectedPopup, setShowConnectedPopup] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showAboutUs, setShowAboutUs] = useState(false)

  const [integrationsExpanded, setIntegrationsExpanded] = useState(true)
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [showThemeSelector, setShowThemeSelector] = useState(false)
  
  // Theme context
  const { currentTheme, isDarkMode, toggleDarkMode } = useTheme()
  const { settings, isLoaded } = useSettings()

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
      color: "primary"
    },
    {
      label: "Insights",
      subtext: "Team",
      icon: Users,
      prompt: "Provide insights about team workload and collaboration patterns",
      color: "from-purple-500 to-pink-500"
    },
    {
      label: "Track",
      subtext: "Goals",
      icon: Target,
      prompt: "Track OKRs and KPIs progress across the organization",
      color: "secondary"
    },
    {
      label: "Plan",
      subtext: "Sprints",
      icon: Workflow,
      prompt: "Help organize and plan agile sprints and project timelines",
      color: "from-orange-500 to-red-500"
    }
  ]

  // Update client state
  React.useEffect(() => {
    setIsClient(true)
  }, [])

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
      <aside className={`w-64 border-r flex flex-col h-full overflow-hidden transition-all duration-500 ease-in-out ${
        isDarkMode 
          ? 'bg-gray-900 border-gray-700' 
          : 'bg-white border-gray-200'
      }`}>
        {/* Header */}
        <div className={`p-6 border-b transition-all duration-300 ${
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: currentTheme.colors.primary }}
            >
              <img 
                src="/company-logo.png" 
                alt="TAO DIGITAL Logo" 
                className="w-8 h-8 object-contain"
              />
            </div>
            <div>
              <h2 
                key={`sidebar-title-${currentTheme.name}-${isDarkMode}`}
                className="text-base font-medium transition-colors duration-300"
                style={{
                  color: currentTheme.colors.primary,
                  background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textRendering: 'optimizeLegibility',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale'
                }}
              >TAO Digital</h2>
              <p className={`text-xs transition-colors duration-300 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>Leadership Engine</p>
            </div>
          </div>
          
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
                <p className="text-sm text-gray-600">Welcome back,</p>
                <p className="text-sm font-medium text-black">{isLoaded ? settings.userProfile.name : "User"}! 👋</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Navigation */}
            <div className="space-y-2">
              <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 transition-colors duration-300 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Navigation
              </h4>
              
              {/* Work Buddy */}
       <Button
         variant={activeView === 'copilot' ? 'default' : 'ghost'}
         className={`w-full justify-start h-12 px-4 rounded-xl transition-all duration-300 ${
           activeView === 'copilot'
             ? 'text-white shadow-lg hover:shadow-xl hover:scale-[1.02]'
             : isDarkMode
               ? 'text-gray-200 hover:bg-gray-800/50 hover:text-white hover:shadow-md'
               : 'text-gray-800 hover:bg-gray-50/80 hover:shadow-md'
         }`}
         style={activeView === 'copilot' ? {
           background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
         } : {}}
         onClick={() => setActiveView('copilot')}
       >
                <div className="flex items-center space-x-3">
                  <Bot className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">Work Buddy</div>
                    <div className="text-xs opacity-80">AI Assistant</div>
                  </div>
                </div>
              </Button>

              {/* Insights */}
       <Button
         variant={activeView === 'insights' ? 'default' : 'ghost'}
         className={`w-full justify-start h-12 px-4 rounded-xl transition-all duration-300 ${
           activeView === 'insights'
             ? 'text-white shadow-lg hover:shadow-xl hover:scale-[1.02]'
             : isDarkMode
               ? 'text-gray-200 hover:bg-gray-800/50 hover:text-white hover:shadow-md'
               : 'text-gray-800 hover:bg-gray-50/80 hover:shadow-md'
         }`}
         style={activeView === 'insights' ? {
           background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
         } : {}}
         onClick={() => setActiveView('insights')}
       >
                <div className="flex items-center space-x-3">
                  <BarChart3 className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">Insights</div>
                    <div className="text-xs opacity-80">Analytics</div>
                  </div>
                </div>
              </Button>

              {/* Leadership Access */}
              <Button
                variant="ghost"
                disabled={true}
                className="w-full justify-start h-12 px-4 rounded-lg transition-all duration-200 text-gray-400 cursor-not-allowed"
                onClick={() => setActiveView('leadership')}
              >
                <div className="flex items-center space-x-3">
                  <Crown className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">Access</div>
                    <div className="text-xs opacity-80">Premium</div>
                  </div>
                  <Badge variant="outline" className={`ml-auto text-xs px-2 py-1 border transition-colors duration-300 ${
                    isDarkMode
                      ? 'bg-gray-700 text-gray-300 border-gray-600'
                      : 'bg-gray-100 text-gray-600 border-gray-300'
                  }`}>
                    Soon
                  </Badge>
                </div>
              </Button>
            </div>

            {/* Integrations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Integrations
                </h4>
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    className="h-6 w-6 p-0 rounded hover:bg-gray-100 text-gray-500 transition-colors duration-300"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = currentTheme.colors.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#6B7280';
                    }}
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowThemeSelector(true)}
                    className="h-6 w-6 p-0 rounded hover:bg-gray-100 text-gray-500 transition-colors duration-300"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = currentTheme.colors.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#6B7280';
                    }}
                  >
                    <Palette className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIntegrationsExpanded(!integrationsExpanded)}
                    className="h-6 w-6 p-0 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  >
                    {integrationsExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
              
              {integrationsExpanded && (
                <div className="space-y-1">
                  {/* Atlassian Workspace */}
                  <Button
                    variant="ghost"
                    className={`w-full h-10 flex items-center justify-between px-3 rounded-xl transition-all duration-300 relative overflow-hidden group ${
                      connections.find(c => c.type === 'atlassian')?.status === 'connected'
                        ? 'hover:shadow-lg'
                        : 'hover:shadow-md'
                    }`}
                    style={connections.find(c => c.type === 'atlassian')?.status === 'connected' ? {
                      color: currentTheme.colors.primary,
                      backgroundColor: `${currentTheme.colors.primary}10`,
                      borderColor: `${currentTheme.colors.primary}30`
                    } : {}}
                    onMouseEnter={(e) => {
                      if (connections.find(c => c.type === 'atlassian')?.status === 'connected') {
                        e.currentTarget.style.color = currentTheme.colors.primary;
                        e.currentTarget.style.backgroundColor = `${currentTheme.colors.primary}20`;
                        e.currentTarget.style.borderColor = `${currentTheme.colors.primary}50`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (connections.find(c => c.type === 'atlassian')?.status === 'connected') {
                        e.currentTarget.style.color = currentTheme.colors.primary;
                        e.currentTarget.style.backgroundColor = `${currentTheme.colors.primary}10`;
                        e.currentTarget.style.borderColor = `${currentTheme.colors.primary}30`;
                      }
                    }}
                    onClick={() => {
                      if (connections.find(c => c.type === 'atlassian')?.status !== 'connected') {
                        handleConnect('atlassian')
                      }
                    }}
                    disabled={connecting === 'atlassian'}
                  >
                    <div className="flex items-center space-x-2">
                      <Database 
                        className="w-4 h-4 transition-colors duration-300" 
                        style={{
                          color: connections.find(c => c.type === 'atlassian')?.status === 'connected' 
                            ? currentTheme.colors.primary 
                            : (isDarkMode ? '#9CA3AF' : '#6B7280')
                        }}
                      />
                      <span 
                        className="text-sm font-medium transition-colors duration-300"
                        style={{
                          color: connections.find(c => c.type === 'atlassian')?.status === 'connected' 
                            ? currentTheme.colors.primary 
                            : (isDarkMode ? '#D1D5DB' : '#374151')
                        }}
                      >Atlassian</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-2 h-2 rounded-full transition-colors duration-300" 
                        style={{
                          backgroundColor: connections.find(c => c.type === 'atlassian')?.status === 'connected' 
                            ? currentTheme.colors.success 
                            : currentTheme.colors.error
                        }}
                      />
                      {connecting === 'atlassian' && (
                        <RefreshCw 
                          className="w-3 h-3 animate-spin" 
                          style={{ color: currentTheme.colors.primary }}
                        />
                      )}
                    </div>
                    {/* Theme Glow Effect for Connected Atlassian */}
                    {connections.find(c => c.type === 'atlassian')?.status === 'connected' && (
                      <div 
                        className="absolute inset-0 rounded-xl opacity-20 group-hover:opacity-40 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(90deg, ${currentTheme.colors.primary}30, ${currentTheme.colors.secondary}30)`
                        }}
                      ></div>
                    )}
                  </Button>

                  {/* GitHub Repository */}
                  <Button
                    variant="ghost"
                    disabled
                    className={`w-full h-10 flex items-center justify-between px-3 rounded-lg transition-all duration-200 ${
                      isDarkMode
                        ? 'text-gray-500 hover:text-gray-400'
                        : 'text-gray-500 hover:text-gray-600'
                    }`}
                    style={{
                      '--hover-color': currentTheme.colors.primary
                    } as React.CSSProperties}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.color = currentTheme.colors.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.color = isDarkMode ? '#6B7280' : '#6B7280';
                      }
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <GitBranch className={`w-4 h-4 transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-400'
                      }`} />
                      <span className="text-sm font-medium">GitHub</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className={`text-xs transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-400'
                      }`}>Soon</span>
                    </div>
                  </Button>

                  {/* Slack Workspace */}
                  <Button
                    variant="ghost"
                    disabled
                    className={`w-full h-10 flex items-center justify-between px-3 rounded-lg transition-all duration-200 ${
                      isDarkMode
                        ? 'text-gray-500 hover:text-gray-400'
                        : 'text-gray-500 hover:text-gray-600'
                    }`}
                    style={{
                      '--hover-color': currentTheme.colors.primary
                    } as React.CSSProperties}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.color = currentTheme.colors.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.color = isDarkMode ? '#6B7280' : '#6B7280';
                      }
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <Activity className={`w-4 h-4 transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-400'
                      }`} />
                      <span className="text-sm font-medium">Slack</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className={`text-xs transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-400'
                      }`}>Soon</span>
                    </div>
                  </Button>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {!hasActiveConnections && (
                <Button
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className="w-full h-10 font-medium rounded-xl text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `linear-gradient(90deg, ${currentTheme.colors.secondary}, ${currentTheme.colors.primary})`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`;
                  }}
                >
                  <Plug className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              )}
              
              {hasActiveConnections && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    className={`w-full h-9 rounded-xl transition-all duration-300 shadow-md hover:shadow-lg ${
                      isDarkMode
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white hover:border-gray-500'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400'
                    }`}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Manage
                  </Button>
                  
                  {connections.some(c => c.status === 'connected') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const connectedConnections = connections.filter(c => c.status === 'connected')
                        connectedConnections.forEach(conn => {
                          handleDisconnect(conn.type)
                        })
                      }}
                      className={`w-full h-9 rounded-xl transition-all duration-300 shadow-md hover:shadow-lg ${
                        isDarkMode
                          ? 'border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300 hover:border-red-500'
                          : 'border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400'
                      }`}
                    >
                      <WifiOff className="w-4 h-4 mr-2" />
                      Disconnect All
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <h4 className={`text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Quick Actions
              </h4>
              
              <div className="space-y-1">
                {quickActions.map((action, index) => (
                  <Button
                    key={action.label}
                    variant="ghost"
                    className={`w-full h-10 flex items-center justify-start px-3 rounded-xl transition-all duration-300 ${
                      isDarkMode
                        ? 'text-white hover:bg-gray-800/50 hover:shadow-md'
                        : 'text-black hover:bg-gray-50/80 hover:shadow-md'
                    }`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = currentTheme.colors.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = isDarkMode ? '#FFFFFF' : '#000000';
                    }}
                    onClick={() => {
                      onQuickAction(action.prompt)
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                      }`}>
                        <action.icon className={`w-3.5 h-3.5 transition-colors duration-300 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`} />
                      </div>
                      <div className="text-left">
                        <div
                          className="font-medium text-sm transition-colors duration-300"
                          style={{ color: currentTheme.colors.primary }}
                        >{action.label}</div>
                        <div className={`text-xs transition-colors duration-300 ${
                          isDarkMode ? 'text-white' : 'text-gray-600'
                        }`}>{action.subtext}</div>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        
        {/* About Us Link */}
        <div className={`p-4 border-t transition-colors duration-300 ${
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <Button
            onClick={() => setShowAboutUs(true)}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200"
            style={{
              backgroundColor: isDarkMode ? currentTheme.colors.surface : `${currentTheme.colors.surface}80`,
              color: currentTheme.colors.text,
              borderColor: currentTheme.colors.border
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${currentTheme.colors.primary}20`;
              e.currentTarget.style.color = currentTheme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDarkMode ? currentTheme.colors.surface : `${currentTheme.colors.surface}80`;
              e.currentTarget.style.color = currentTheme.colors.text;
            }}
          >
            <div 
              className="p-2 rounded-lg transition-colors duration-300"
              style={{
                backgroundColor: `${currentTheme.colors.primary}20`,
                borderColor: `${currentTheme.colors.primary}40`
              }}
            >
              <Globe 
                className="w-4 h-4 transition-colors duration-300" 
                style={{ color: currentTheme.colors.primary }}
              />
            </div>
            <span 
              className="font-medium text-sm transition-colors duration-300"
              style={{ color: currentTheme.colors.text }}
            >About Us</span>
          </Button>
        </div>
      </aside>

      {/* Animated Connected Popup */}
      <AnimatePresence>
        {showConnectedPopup && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
          >
            <div className={`rounded-lg p-4 shadow-2xl border transition-colors duration-300 ${
              isDarkMode
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${
                  isDarkMode ? 'bg-green-900/30' : 'bg-green-100'
                }`}>
                  <CheckCircle className={`w-5 h-5 transition-colors duration-300 ${
                    isDarkMode ? 'text-green-400' : 'text-green-600'
                  }`} />
                </div>
                <div>
                  <h3 className={`font-semibold text-sm transition-colors duration-300 ${
                    isDarkMode ? 'text-white' : 'text-black'
                  }`}>
                    {showConnectedPopup === 'atlassian' ? 'Atlassian' : 
                     showConnectedPopup === 'github' ? 'GitHub' : 'Slack'} Connected!
                  </h3>
                  <p className={`text-xs transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Integration is now active
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* About Us Modal */}
      <AnimatePresence>
        {showAboutUs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAboutUs(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative w-full max-w-4xl max-h-[90vh] rounded-lg shadow-2xl border overflow-hidden transition-colors duration-300"
              style={{
                backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                borderColor: currentTheme.colors.border
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div 
                className="flex items-center justify-between p-6 border-b transition-colors duration-300"
                style={{
                  backgroundColor: `${currentTheme.colors.primary}10`,
                  borderColor: currentTheme.colors.border
                }}
              >
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-300"
                    style={{ backgroundColor: currentTheme.colors.primary }}
                  >
                    <span 
                      className="font-bold text-lg transition-colors duration-300"
                      style={{ color: 'white' }}
                    >T</span>
                  </div>
                  <div>
                    <h2 
                      className="text-xl font-bold transition-colors duration-300"
                      style={{ color: currentTheme.colors.text }}
                    >
                      About TAO Digital Solutions
                    </h2>
                    <p 
                      className="text-sm transition-colors duration-300"
                      style={{ color: currentTheme.colors.textSecondary }}
                    >
                      Digital Transformation Excellence
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowAboutUs(false)}
                  className="transition-colors duration-300"
                  style={{
                    color: currentTheme.colors.textSecondary
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = currentTheme.colors.text;
                    e.currentTarget.style.backgroundColor = `${currentTheme.colors.primary}10`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = currentTheme.colors.textSecondary;
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              {/* Content */}
              <div 
                className="flex-1 overflow-y-auto p-6 transition-colors duration-300"
                style={{
                  backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background
                }}
              >
                <div className="space-y-6">
                  {/* Company Overview */}
                  <div>
                    <h3 
                      className="text-lg font-semibold mb-3 transition-colors duration-300"
                      style={{ color: currentTheme.colors.text }}
                    >
                      Our Mission
                    </h3>
                    <p 
                      className="text-sm leading-relaxed transition-colors duration-300"
                      style={{ color: currentTheme.colors.textSecondary }}
                    >
                      TAO Digital Solutions specializes in assisting enterprises to develop new platforms, 
                      scale existing business models, and expand into new markets with rapid time-to-market strategies. 
                      Our name, TAO, stands for <strong>Transformation, Automation, and Optimization</strong>, 
                      reflecting our core philosophy and value proposition.
                    </p>
                  </div>

                  {/* Services */}
                  <div>
                    <h3 
                      className="text-lg font-semibold mb-3 transition-colors duration-300"
                      style={{ color: currentTheme.colors.text }}
                    >
                      Our Services
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { title: "Product Engineering", desc: "Agile services to fuel innovation and accelerate time to market" },
                        { title: "Managed Services", desc: "Outcome-based technology operations management" },
                        { title: "Cybersecurity", desc: "Strengthen IT systems and prevent disruptions" },
                        { title: "Payment Services", desc: "End-to-end digital payment solutions" },
                        { title: "Digitization", desc: "Scale data models and unlock AI value" },
                        { title: "Cloud Services", desc: "Accelerate IT modernization through cloud technologies" }
                      ].map((service, index) => (
                        <div 
                          key={index} 
                          className="p-4 rounded-lg border transition-colors duration-300"
                          style={{
                            backgroundColor: `${currentTheme.colors.primary}05`,
                            borderColor: currentTheme.colors.border
                          }}
                        >
                          <h4 
                            className="font-medium text-sm mb-2 transition-colors duration-300"
                            style={{ color: currentTheme.colors.text }}
                          >
                            {service.title}
                          </h4>
                          <p 
                            className="text-xs transition-colors duration-300"
                            style={{ color: currentTheme.colors.textSecondary }}
                          >
                            {service.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Global Presence */}
                  <div>
                    <h3 
                      className="text-lg font-semibold mb-3 transition-colors duration-300"
                      style={{ color: currentTheme.colors.text }}
                    >
                      Global Presence
                    </h3>
                    <p 
                      className="text-sm leading-relaxed mb-3 transition-colors duration-300"
                      style={{ color: currentTheme.colors.textSecondary }}
                    >
                      We operate across five international hubs:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['USA', 'Canada', 'Nigeria', 'India', 'Australia'].map((country, index) => (
                        <span 
                          key={index}
                          className="px-3 py-1 rounded-full text-xs font-medium transition-colors duration-300"
                          style={{
                            backgroundColor: `${currentTheme.colors.primary}20`,
                            color: currentTheme.colors.primary,
                            borderColor: `${currentTheme.colors.primary}40`
                          }}
                        >
                          {country}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Values */}
                  <div>
                    <h3 
                      className="text-lg font-semibold mb-3 transition-colors duration-300"
                      style={{ color: currentTheme.colors.text }}
                    >
                      Our Values
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Innovation', 'Respect', 'Customer Focus', 'Community'].map((value, index) => (
                        <div 
                          key={index} 
                          className="flex items-center space-x-2 p-2 rounded-lg transition-colors duration-300"
                          style={{
                            backgroundColor: `${currentTheme.colors.primary}05`,
                            borderColor: currentTheme.colors.border
                          }}
                        >
                          <div 
                            className="w-2 h-2 rounded-full transition-colors duration-300"
                            style={{ backgroundColor: currentTheme.colors.primary }}
                          />
                          <span 
                            className="text-sm font-medium transition-colors duration-300"
                            style={{ color: currentTheme.colors.text }}
                          >
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contact */}
                  <div 
                    className="p-4 rounded-lg border transition-colors duration-300"
                    style={{
                      backgroundColor: `${currentTheme.colors.primary}05`,
                      borderColor: currentTheme.colors.border
                    }}
                  >
                    <h3 
                      className="text-lg font-semibold mb-2 transition-colors duration-300"
                      style={{ color: currentTheme.colors.text }}
                    >
                      Learn More
                    </h3>
                    <p 
                      className="text-sm mb-3 transition-colors duration-300"
                      style={{ color: currentTheme.colors.textSecondary }}
                    >
                      Visit our website to explore our full range of services and solutions.
                    </p>
                    <a 
                      href="https://www.taodigitalsolutions.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 text-white"
                      style={{
                        backgroundColor: currentTheme.colors.primary
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = currentTheme.colors.secondary;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = currentTheme.colors.primary;
                      }}
                    >
                      <Globe className="w-4 h-4" />
                      <span>Visit Website</span>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Theme Selector */}
      <ThemeSelector 
        isOpen={showThemeSelector} 
        onClose={() => setShowThemeSelector(false)} 
      />
    </>
  )
}
