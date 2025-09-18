'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'
import { ScrollArea } from '../ui/scroll-area'
import { 
  ChevronDown, 
  ChevronRight, 
  Plug, 
  Bot, 
  BarChart3, 
  Settings, 
  Circle,
  Zap,
  MessageSquare,
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
  Globe
} from 'lucide-react'

interface Connection {
  name: string
  status: 'connected' | 'disconnected'
  type: 'atlassian' | 'github' | 'slack'
}

interface FigmaLeftSidebarProps {
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

export function FigmaLeftSidebar({ 
  activeView, 
  setActiveView, 
  connections, 
  toggleConnection, 
  hasActiveConnections,
  setShowSettings,
  theme,
  onConnect,
  onQuickAction
}: FigmaLeftSidebarProps) {
  const [isClient, setIsClient] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [showConnectedPopup, setShowConnectedPopup] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showAboutUs, setShowAboutUs] = useState(false)
  const [userData, setUserData] = useState({
    name: "Alex",
    email: "alex.chen@company.com",
    role: "Senior Engineering Manager"
  })

  // Load user data from localStorage
  useEffect(() => {
    const savedUserData = localStorage.getItem('userProfile')
    if (savedUserData) {
      const parsed = JSON.parse(savedUserData)
      setUserData(parsed)
    }
  }, [])

  // Listen for localStorage changes to update user data
  useEffect(() => {
    const handleStorageChange = () => {
      const savedUserData = localStorage.getItem('userProfile')
      if (savedUserData) {
        const parsed = JSON.parse(savedUserData)
        setUserData(parsed)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])
  const [integrationsExpanded, setIntegrationsExpanded] = useState(true)
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)

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
      color: "from-blue-500 to-cyan-500"
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
      color: "from-green-500 to-emerald-500"
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

  const sidebarVariants = {
    initial: { x: -300, opacity: 0 },
    animate: { 
      x: 0, 
      opacity: 1
    }
  }

  const itemVariants = {
    initial: { x: -20, opacity: 0 },
    animate: (i: number) => ({
      x: 0,
      opacity: 1
    })
  }

  return (
    <>
      <motion.aside 
        className={`w-56 min-w-[200px] max-w-[240px] flex-shrink-0 backdrop-blur-xl border-r flex flex-col h-full overflow-hidden relative transition-all duration-500 ease-in-out ${
        theme === 'dark' 
            ? 'bg-[var(--bg-secondary)]/60 border-[var(--border-subtle)]/50' 
            : 'bg-[var(--bg-secondary)]/95 border-[var(--border-subtle)]/30'
      }`}
        style={{
          background: theme === 'dark' 
            ? 'linear-gradient(135deg, rgba(26, 28, 31, 0.8) 0%, rgba(34, 37, 42, 0.6) 100%)'
            : 'linear-gradient(135deg, rgba(240, 248, 255, 0.98) 0%, rgba(219, 234, 254, 0.9) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: theme === 'dark' 
            ? '1px solid rgba(59, 130, 246, 0.1)' 
            : '1px solid rgba(30, 64, 175, 0.08)',
          boxShadow: theme === 'dark'
            ? '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
        }}
      variants={sidebarVariants}
      initial="initial"
      animate="animate"
    >
      {/* Animated Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating Particles Background */}
        {[...Array(16)].map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            className="absolute w-1.5 h-1.5 bg-blue-400/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, Math.random() * 15 - 7.5, 0],
              opacity: [0, 0.8, 0],
              scale: [0, 1.2, 0]
            }}
            transition={{
              duration: 5 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 4,
              ease: "easeInOut"
            }}
          />
        ))}
        
        {/* Gradient Orbs */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={`bg-orb-${i}`}
            className="absolute rounded-full opacity-15"
            style={{
              width: `${70 + i * 25}px`,
              height: `${70 + i * 25}px`,
              left: `${15 + i * 25}%`,
              top: `${25 + i * 15}%`,
              background: `radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(139, 92, 246, 0.3) 50%, transparent 70%)`,
              filter: "blur(25px)"
            }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.08, 0.2, 0.08],
              x: [0, 15, 0],
              y: [0, -15, 0]
            }}
            transition={{
              duration: 7 + i * 3,
              repeat: Infinity,
              delay: i * 2.5,
              ease: "easeInOut"
            }}
          />
        ))}
        
        {/* Subtle Grid Pattern */}
        <motion.div
          className="absolute inset-0 opacity-8"
          style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '25px 25px'
          }}
          animate={{
            opacity: [0.05, 0.12, 0.05]
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        {/* Rotating Light Beams */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={`beam-${i}`}
            className="absolute inset-0"
            style={{
              background: `linear-gradient(${30 + i * 60}deg, transparent 0%, rgba(59, 130, 246, 0.08) 50%, transparent 100%)`,
              transformOrigin: "center"
            }}
            animate={{
              rotate: [0, 360],
              opacity: [0, 0.15, 0]
            }}
            transition={{
              rotate: {
                duration: 25 + i * 15,
                repeat: Infinity,
                ease: "linear"
              },
              opacity: {
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
              }
            }}
          />
        ))}
        
        {/* Pulsing Border Glow */}
        <motion.div
          className="absolute inset-0 rounded-lg border border-blue-400/20"
          animate={{
            borderColor: [
              "rgba(59, 130, 246, 0.15)",
              "rgba(139, 92, 246, 0.3)",
              "rgba(59, 130, 246, 0.15)"
            ],
            boxShadow: [
              "0 0 0px rgba(59, 130, 246, 0.15)",
              "0 0 30px rgba(139, 92, 246, 0.3)",
              "0 0 0px rgba(59, 130, 246, 0.15)"
            ]
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
      {/* Compact Header */}
      <div className="p-3 relative z-10">
        <motion.div
          custom={0}
          variants={itemVariants}
          initial="initial"
          animate="animate"
          className="space-y-2"
        >
          <div className="flex items-center justify-center w-full">
            {/* TAO DIGITAL Logo with Advanced In-Code Animation */}
            <motion.div 
              className="relative w-28 h-28 rounded-full"
              style={{
                transformStyle: "preserve-3d",
                perspective: "1000px"
              }}
              whileHover={{ 
                scale: 1.12,
                transition: { duration: 0.5, ease: "easeOut" }
              }}
              whileTap={{ 
                scale: 0.92,
                transition: { duration: 0.15 }
              }}
              animate={{
                y: [0, -5, 0],
                boxShadow: [
                  "0 8px 30px rgba(59, 130, 246, 0.2)",
                  "0 15px 50px rgba(59, 130, 246, 0.35)",
                  "0 8px 30px rgba(59, 130, 246, 0.2)"
                ]
              }}
              transition={{
                y: {
                  duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
                },
                boxShadow: {
                  duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
                }
              }}
            >
              {/* Static Logo Image */}
              <motion.img 
                src="/company-logo.png" 
                alt="TAO DIGITAL Logo" 
                className="w-full h-full object-contain relative z-20 rounded-full"
                style={{
                  transformStyle: "preserve-3d",
                  backfaceVisibility: "hidden"
                }}
                animate={{
                  filter: [
                    "brightness(1) contrast(1) saturate(1)",
                    "brightness(1.25) contrast(1.2) saturate(1.4)",
                    "brightness(1) contrast(1) saturate(1)"
                  ],
                  scale: [1, 1.04, 1]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              
              {/* Background Effects Container */}
              <div className="absolute inset-0">
                {/* Static Rectangle Effect */}
                <div
                  className="absolute inset-0 rounded-full border-2 border-transparent"
                  style={{
                    background: "conic-gradient(from 0deg, transparent, rgba(59, 130, 246, 0.3), transparent, rgba(139, 92, 246, 0.3), transparent)",
                    borderRadius: "50%"
                  }}
                />
                
                {/* Floating Particles Effect */}
                {[...Array(8)].map((_, i) => (
            <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 bg-blue-400 rounded-full"
                    style={{
                      left: "50%",
                      top: "50%",
                      transformOrigin: "0 0"
                    }}
                    animate={{
                      x: [0, Math.cos(i * 45 * Math.PI / 180) * 40],
                      y: [0, Math.sin(i * 45 * Math.PI / 180) * 40],
                      opacity: [0, 1, 0],
                      scale: [0, 1.2, 0]
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      delay: i * 0.6,
                      ease: "easeInOut"
                    }}
                  />
                ))}
                
                {/* Inner Glow Circle */}
                    <motion.div
                  className="absolute inset-3 rounded-full border border-blue-400/30"
                      animate={{
                    scale: [1, 1.15, 1],
                    opacity: [0.4, 0.8, 0.4]
                      }}
                      transition={{
                    duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                />
                </div>
                
              {/* Static Pulsing Glow Effect */}
                <motion.div
                className="absolute inset-0 rounded-full opacity-50"
                style={{
                  background: "radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(139, 92, 246, 0.3) 50%, transparent 70%)",
                  filter: "blur(15px)"
                }}
                  animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{
                  duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              
              {/* Outer Static Elements */}
              <motion.div
                className="absolute inset-0 rounded-full border border-purple-400/30"
                animate={{
                  scale: [1, 1.08, 1]
                }}
                transition={{
                  scale: {
                    duration: 7,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }
                }}
              />
            </motion.div>
          </div>
          <AnimatePresence>
            {showWelcome && (
              <motion.div 
                className="space-y-1"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ 
                  opacity: 0,
                  transition: { duration: 1, ease: "easeOut" }
                }}
              >
                <h2 className={`text-sm font-semibold ${
                            theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                }`}>Welcome back,</h2>
                <h3 className="text-sm font-semibold bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
                  {userData.name}! 👋
                </h3>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden relative z-10">
        <div className="p-3 space-y-4">
          {/* Compact Navigation */}
          <motion.div
            custom={1}
            variants={itemVariants}
            initial="initial"
            animate="animate"
            className="space-y-2"
          >
            <h4 className={`text-xs font-semibold uppercase tracking-wider px-2 mb-2 ${
              theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
            }`}>
              Navigation
            </h4>
            
            {/* Leadership Copilot */}
            <motion.div
              whileHover={{ 
                scale: 1.03, 
                x: 3,
                transition: { duration: 0.2, ease: "easeOut" }
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Button
                variant={activeView === 'copilot' ? 'default' : 'ghost'}
                className={`w-full justify-start h-9 px-2 rounded-lg transition-all duration-300 relative overflow-hidden group nav-item ${
                  activeView === 'copilot' 
                    ? 'active text-white shadow-lg' 
                    : 'text-[var(--text-primary)] hover:shadow-lg hover:shadow-blue-500/20 border border-transparent'
                }`}
                onClick={() => setActiveView('copilot')}
              >
                <div className="flex items-center space-x-2 w-full relative z-10">
                  <div className="text-left flex-1 min-w-0">
                    <h4 className={`font-medium text-sm truncate ${
                      theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                    }`}>Copilot</h4>
                    <p className={`text-xs truncate ${
                      theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                    }`}>AI Assistant</p>
                  </div>
                </div>
              </Button>
            </motion.div>

            {/* Leadership Insights */}
            <motion.div
              whileHover={{ 
                scale: 1.03, 
                x: 3,
                transition: { duration: 0.2, ease: "easeOut" }
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Button
                variant={activeView === 'insights' ? 'default' : 'ghost'}
                className={`w-full justify-start h-9 px-2 rounded-lg transition-all duration-300 relative overflow-hidden group nav-item ${
                  activeView === 'insights' 
                    ? 'active text-white shadow-lg' 
                    : 'text-[var(--text-primary)] hover:shadow-lg hover:shadow-emerald-500/20 border border-transparent'
                }`}
                onClick={() => setActiveView('insights')}
              >
                <div className="flex items-center space-x-2 w-full relative z-10">
                  <div className="text-left flex-1 min-w-0">
                    <h4 className={`font-medium text-sm truncate ${
                      theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                    }`}>Insights</h4>
                    <p className={`text-xs truncate ${
                      theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                    }`}>Analytics</p>
                  </div>
                </div>
              </Button>
            </motion.div>

            {/* Leadership Access */}
            <motion.div
              whileHover={{ 
                scale: 1.03, 
                x: 3,
                transition: { duration: 0.2, ease: "easeOut" }
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Button
                variant={activeView === 'leadership' ? 'default' : 'ghost'}
                disabled={true}
                className={`w-full justify-start h-9 px-2 rounded-lg transition-all duration-300 relative overflow-hidden group nav-item ${
                  activeView === 'leadership' 
                    ? 'active text-white shadow-lg' 
                    : 'text-[var(--text-muted)] opacity-60 cursor-not-allowed border border-transparent'
                }`}
                onClick={() => setActiveView('leadership')}
              >
                <div className="flex items-center space-x-2 w-full relative z-10">
                  <div className="text-left flex-1 min-w-0">
                    <h4 className={`font-medium text-sm truncate ${
                      theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                    }`}>Access</h4>
                    <p className={`text-xs truncate ${
                      theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                    }`}>Premium</p>
                  </div>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] border-[var(--accent-secondary)]/30">
                    Soon
                  </Badge>
                </div>
              </Button>
            </motion.div>
          </motion.div>


          {/* Compact Integrations Section */}
          <motion.div
            custom={2}
            variants={itemVariants}
            initial="initial"
            animate="animate"
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-semibold uppercase tracking-wider px-2 ${
                theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
              }`}>
                Integrations
              </h4>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className="h-5 w-5 p-0 text-[var(--text-muted)] hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <Settings className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIntegrationsExpanded(!integrationsExpanded)}
                  className="h-5 w-5 p-0 text-[var(--text-muted)] hover:shadow-lg hover:shadow-blue-500/20"
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
              <div className="space-y-1 overflow-hidden max-h-48 overflow-y-auto">
                {/* Atlassian Workspace */}
               <motion.div
                  whileHover={{ 
                    scale: 1.02, 
                    x: 2,
                    transition: { duration: 0.2, ease: "easeOut" }
                  }}
                 whileTap={{ scale: 0.98 }}
                 transition={{ type: "spring", stiffness: 400, damping: 25 }}
               >
                  <div className={`h-10 flex items-center justify-between px-2 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20 border ${
                    connections.find(c => c.type === 'atlassian')?.status === 'connected'
                     ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] shadow-lg shadow-emerald-500/20'
                      : theme === 'dark' 
                        ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
                        : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
                  }`}>
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <Database className="w-4 h-4 text-[var(--accent-primary)]" />
                     </div>
                      <div className="flex items-center space-x-1 flex-1 min-w-0">
                        <span className={`text-xs font-medium text-ellipsis overflow-hidden whitespace-nowrap ${
                          theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                        }`}>Atlassian</span>
                      </div>
                 </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full status-dot ${
                        connections.find(c => c.type === 'atlassian')?.status === 'connected' 
                          ? 'bg-[var(--success)]' 
                          : 'bg-[var(--error)]'
                      }`} />
                      {connections.find(c => c.type === 'atlassian')?.status !== 'connected' && (
                        <div className="flex items-center space-x-0.5">
                     <motion.div
                            whileHover={{ 
                              scale: 1.08,
                              transition: { duration: 0.2, ease: "easeOut" }
                            }}
                            whileTap={{ scale: 0.92 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          >
                            <Button
                              size="sm"
                              onClick={() => handleConnect('atlassian')}
                              disabled={connecting === 'atlassian'}
                              className="h-6 px-3 text-xs font-medium rounded-lg backdrop-blur-xl border border-white/20 bg-gradient-to-r from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/20 hover:from-[var(--accent-primary)]/40 hover:to-[var(--accent-secondary)]/40 hover:shadow-xl hover:shadow-[var(--accent-primary)]/40 text-white shadow-lg shadow-[var(--accent-primary)]/25 flex-shrink-0 relative overflow-hidden transition-all duration-300"
                            >
                              {connecting === 'atlassian' ? (
                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Plug className="w-3 h-3 mr-1" />
                              )}
                              Connect
                            </Button>
                     </motion.div>
                     </div>
                      )}
                      {connections.find(c => c.type === 'atlassian')?.status === 'connected' && (
                        <div className="flex items-center space-x-0.5">
                     <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200 }}
                            className="w-6 h-6 bg-green-500/30 rounded-lg flex items-center justify-center"
                          >
                            <div>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </div>
                     </motion.div>
                   </div>
                      )}
                 </div>
                 </div>
          </motion.div>

                {/* GitHub Repository */}
        <motion.div
                  whileHover={{ scale: 1.01, x: 1 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <div className={`h-10 flex items-center justify-between px-2 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20 border ${
                    theme === 'dark' 
                      ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
                      : 'bg-[var(--bg-tertiary)]/50 border-[var(--border-subtle)]'
                  }`}>
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <GitBranch className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <div className="flex items-center space-x-1 flex-1 min-w-0">
                        <span className={`text-xs font-medium text-ellipsis overflow-hidden whitespace-nowrap ${
                          theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                        }`}>GitHub</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--error)] status-dot" />
                     <Button
                       size="sm"
                        disabled
                        className="h-5 px-1.5 text-xs bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] cursor-not-allowed flex-shrink-0"
                     >
                        Soon
                     </Button>
                    </div>
                  </div>
                </motion.div>

                {/* Slack Workspace */}
                <motion.div 
                  whileHover={{ scale: 1.01, x: 1 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <div className={`h-10 flex items-center justify-between px-2 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 border ${
                    theme === 'dark' 
                      ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
                      : 'bg-[var(--bg-tertiary)]/50 border-[var(--border-subtle)]'
                  }`}>
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <div className="flex items-center space-x-1 flex-1 min-w-0">
                        <span className={`text-xs font-medium text-ellipsis overflow-hidden whitespace-nowrap ${
                          theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                        }`}>Slack</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--error)] status-dot" />
                     <Button
                       size="sm"
                        disabled
                        className="h-5 px-1.5 text-xs bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] cursor-not-allowed flex-shrink-0"
                      >
                        Soon
                     </Button>
                   </div>
                  </div>
          </motion.div>
        </div>
                 )}
          </motion.div>

          {/* Compact Action Buttons */}
        <motion.div
          custom={3}
          variants={itemVariants}
          initial="initial"
          animate="animate"
            className="space-y-2"
        >
            {!hasActiveConnections && (
          <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
          >
            <motion.div
              whileHover={{ 
                scale: 1.02,
                transition: { duration: 0.2, ease: "easeOut" }
              }}
            whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <Button
                    size="sm"
              onClick={() => setShowSettings(true)}
                    className="w-full h-8 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] hover:from-[var(--accent-primary)]/90 hover:to-[var(--accent-secondary)]/90 hover:shadow-xl hover:shadow-[var(--accent-primary)]/40 text-white font-medium rounded-lg shadow-lg text-center overflow-hidden transition-all duration-300"
                  >
                  <Plug className="w-3 h-3 mr-1.5 flex-shrink-0" />
                  <span className="text-xs truncate min-w-0">Connect</span>
                </Button>
                  </motion.div>
            </motion.div>
            )}
            
            {hasActiveConnections && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ 
                    scale: 1.02,
                    transition: { duration: 0.2, ease: "easeOut" }
                  }}
                  whileTap={{ scale: 0.98 }}
            >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className={`w-full h-7 rounded-lg text-center overflow-hidden transition-all duration-300 border ${
                    theme === 'dark' 
                      ? 'text-[var(--text-muted)] hover:shadow-lg hover:shadow-blue-500/20 border-[var(--border-subtle)]' 
                      : 'text-[var(--text-muted)] hover:shadow-lg hover:shadow-blue-500/20 border-[var(--border-subtle)]'
                  }`}
                >
                  <Settings className="w-3 h-3 mr-1.5 flex-shrink-0" />
                  <span className="text-xs truncate min-w-0">Manage</span>
            </Button>
          </motion.div>
            )}

            {/* Disconnect Button */}
            {connections.some(c => c.status === 'connected') && (
          <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                whileHover={{ 
                  scale: 1.02,
                  transition: { duration: 0.2, ease: "easeOut" }
                }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const connectedConnections = connections.filter(c => c.status === 'connected')
                    connectedConnections.forEach(conn => {
                      handleDisconnect(conn.type)
                    })
                  }}
                  className={`w-full h-7 rounded-lg text-center overflow-hidden transition-all duration-300 border ${
                    theme === 'dark' 
                      ? 'text-red-400 hover:shadow-lg hover:shadow-red-500/20 border border-red-500/20' 
                      : 'text-red-600 hover:shadow-lg hover:shadow-red-500/20 border-red-200'
                  }`}
                >
                  <WifiOff className="w-3 h-3 mr-1.5 flex-shrink-0" />
                  <span className="text-xs truncate min-w-0">Disconnect All</span>
            </Button>
              </motion.div>
            )}
          </motion.div>

          {/* Quick Actions Section */}
            <motion.div
            custom={4}
            variants={itemVariants}
            initial="initial"
            animate="animate"
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-semibold uppercase tracking-wider px-2 ${
                theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
              }`}>
                Quick Actions
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuickActionsExpanded(!quickActionsExpanded)}
                className="h-5 w-5 p-0 text-[var(--text-muted)] hover:shadow-lg hover:shadow-blue-500/20"
              >
                {quickActionsExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </Button>
            </div>

            <AnimatePresence>
              {quickActionsExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="space-y-1.5 overflow-hidden"
                >
                  {quickActions.map((action, index) => (
                  <motion.div
                      key={action.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      whileHover={{ 
                        scale: 1.03, 
                        x: 3,
                        transition: { duration: 0.2, ease: "easeOut" }
                      }}
                      whileTap={{ scale: 0.97 }}
                      className="relative group"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`w-full h-8 flex items-center justify-start px-2 rounded-lg transition-all duration-300 relative overflow-hidden hover:shadow-lg border ${
                          theme === 'dark' 
                            ? 'hover:shadow-blue-500/20 border-[var(--border-subtle)]' 
                            : 'hover:shadow-blue-500/20 border-[var(--border-subtle)]'
                        }`}
                        onClick={() => {
                          onQuickAction(action.prompt)
                        }}
                      >
                        <div className={`w-5 h-5 rounded-md bg-gradient-to-r ${action.color} flex items-center justify-center mr-2 flex-shrink-0`}>
                          <action.icon className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className={`text-xs font-medium truncate ${
                            theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                          }`}>
                            {action.label}
                          </div>
                          <div className={`text-xs truncate ${
                            theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                          }`}>
                            {action.subtext}
                          </div>
                        </div>
                        
                        {/* Subtle shimmer effect */}
                      </Button>
                  </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
                  </motion.div>
        </div>
      </ScrollArea>
      
      {/* About Us Link */}
      <div className="flex-shrink-0 p-4 border-t border-[var(--border-subtle)]/30">
        <motion.button
          onClick={() => setShowAboutUs(true)}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02] ${
            theme === 'dark'
              ? 'hover:bg-slate-700/50 text-slate-300 hover:text-white'
              : 'hover:bg-blue-50 text-gray-600 hover:text-blue-700'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className={`w-4 h-4 ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-500'
          }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
          </div>
          <span className="font-medium text-sm">About Us</span>
        </motion.button>
      </div>
      </motion.aside>

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
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-4 shadow-2xl backdrop-blur-xl border border-white/20">
              <div className="flex items-center space-x-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                  className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"
                  >
                    <div>
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                </motion.div>
                <div>
                  <h3 className="text-white font-semibold text-sm">
                    {showConnectedPopup === 'atlassian' ? 'Atlassian' : 
                     showConnectedPopup === 'github' ? 'GitHub' : 'Slack'} Connected!
                  </h3>
                  <p className="text-white/80 text-xs">
                    Integration is now active
                  </p>
                </div>
              </div>
                <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="h-1 bg-white/30 rounded-full mt-2"
              />
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
              className={`relative w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border overflow-hidden ${
                theme === 'dark' 
                  ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700' 
                  : 'bg-white border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`flex items-center justify-between p-6 border-b ${
                theme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-lg">T</span>
                </div>
                  <div>
                    <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      About TAO Digital Solutions
                    </h2>
                    <p className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-500'}`}>
                      Digital Transformation Excellence
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowAboutUs(false)}
                  className={theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-700' : ''}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              {/* Content */}
              <div className={`flex-1 overflow-y-auto p-6 ${
                theme === 'dark' ? 'bg-slate-800/20' : 'bg-white'
              }`}>
                <div className="space-y-6">
                  {/* Company Overview */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      Our Mission
                    </h3>
                    <p className={`text-sm leading-relaxed ${
                      theme === 'dark' ? 'text-slate-300' : 'text-gray-600'
                    }`}>
                      TAO Digital Solutions specializes in assisting enterprises to develop new platforms, 
                      scale existing business models, and expand into new markets with rapid time-to-market strategies. 
                      Our name, TAO, stands for <strong>Transformation, Automation, and Optimization</strong>, 
                      reflecting our core philosophy and value proposition.
                    </p>
                  </div>

                  {/* Services */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
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
                        <div key={index} className={`p-4 rounded-lg border ${
                          theme === 'dark' 
                            ? 'bg-slate-700/30 border-slate-600' 
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <h4 className={`font-medium text-sm mb-2 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {service.title}
                          </h4>
                          <p className={`text-xs ${
                            theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                          }`}>
                            {service.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Global Presence */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      Global Presence
                    </h3>
                    <p className={`text-sm leading-relaxed mb-3 ${
                      theme === 'dark' ? 'text-slate-300' : 'text-gray-600'
                    }`}>
                      We operate across five international hubs:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['USA', 'Canada', 'Nigeria', 'India', 'Australia'].map((country, index) => (
                        <span key={index} className={`px-3 py-1 rounded-full text-xs font-medium ${
                          theme === 'dark' 
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                            : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}>
                          {country}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Values */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      Our Values
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Innovation', 'Respect', 'Customer Focus', 'Community'].map((value, index) => (
                        <div key={index} className={`flex items-center space-x-2 p-2 rounded-lg ${
                          theme === 'dark' ? 'bg-slate-700/30' : 'bg-gray-50'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${
                            theme === 'dark' ? 'bg-blue-400' : 'bg-blue-500'
                          }`} />
                          <span className={`text-sm font-medium ${
                            theme === 'dark' ? 'text-slate-200' : 'text-gray-700'
                          }`}>
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className={`p-4 rounded-lg border ${
                    theme === 'dark' 
                      ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20' 
                      : 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200'
                  }`}>
                    <h3 className={`text-lg font-semibold mb-2 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      Learn More
                    </h3>
                    <p className={`text-sm mb-3 ${
                      theme === 'dark' ? 'text-slate-300' : 'text-gray-600'
                    }`}>
                      Visit our website to explore our full range of services and solutions.
                    </p>
                    <a 
                      href="https://www.taodigitalsolutions.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 ${
                        theme === 'dark' 
                          ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
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
    </>
  )
}