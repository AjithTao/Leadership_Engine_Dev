'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { 
  Home, 
  MessageCircle, 
  BarChart3, 
  Settings, 
  Users, 
  Calendar, 
  FileText, 
  Zap, 
  Star, 
  Crown, 
  Target, 
  TrendingUp, 
  Activity, 
  Shield, 
  Database, 
  Monitor, 
  Workflow,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Filter,
  Bell,
  User,
  LogOut,
  HelpCircle,
  Info,
  ExternalLink,
  Menu,
  X,
  Sun,
  Moon,
  Palette
} from 'lucide-react'

interface QuickAction {
  label: string
  prompt: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

interface FigmaLeftSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onQuickAction: (prompt: string) => void
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
  hasActiveConnections: boolean
}

export function FigmaLeftSidebar({ 
  activeTab, 
  onTabChange, 
  onQuickAction, 
  theme, 
  onThemeChange,
  hasActiveConnections 
}: FigmaLeftSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [showAboutUs, setShowAboutUs] = useState(false)
  const [userProfile, setUserProfile] = useState({
    name: "Alex Chen",
    email: "alex.chen@company.com",
    role: "Senior Engineering Manager",
    avatar: null
  })

  const quickActions: QuickAction[] = [
    {
      label: "Team Performance",
      prompt: "Analyze team performance metrics and identify areas for improvement",
      icon: TrendingUp,
      color: "from-blue-500 to-blue-600"
    },
    {
      label: "Project Status",
      prompt: "Show me the current status of all active projects",
      icon: Target,
      color: "from-green-500 to-green-600"
    },
    {
      label: "Sprint Analysis",
      prompt: "Analyze the current sprint progress and velocity",
      icon: Activity,
      color: "from-purple-500 to-purple-600"
    },
    {
      label: "Issue Trends",
      prompt: "Show me trends in issue creation and resolution",
      icon: BarChart3,
      color: "from-orange-500 to-orange-600"
    },
    {
      label: "Team Insights",
      prompt: "Provide insights about team productivity and collaboration",
      icon: Users,
      color: "from-pink-500 to-pink-600"
    },
    {
      label: "Risk Assessment",
      prompt: "Identify potential risks and blockers in current projects",
      icon: Shield,
      color: "from-red-500 to-red-600"
    }
  ]

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      color: 'text-blue-500',
      description: 'Overview and insights'
    },
    {
      id: 'workbuddy',
      label: 'Work Buddy',
      icon: MessageCircle,
      color: 'text-purple-500',
      description: 'AI assistant'
    },
    {
      id: 'insights',
      label: 'Analytics',
      icon: BarChart3,
      color: 'text-green-500',
      description: 'Data visualization'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      color: 'text-gray-500',
      description: 'Configuration'
    }
  ]

  // Load user profile from localStorage
  useEffect(() => {
    const savedProfile = localStorage.getItem('userProfile')
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile)
      setUserProfile(parsed)
    }
  }, [])

  const handleQuickAction = (action: QuickAction) => {
    onQuickAction(action.prompt)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    onThemeChange(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  const sidebarVariants = {
    expanded: { width: 280 },
    collapsed: { width: 80 }
  }

  const itemVariants = {
    expanded: { opacity: 1, x: 0 },
    collapsed: { opacity: 0, x: -20 }
  }

  return (
    <>
      {/* Main Sidebar */}
      <motion.div
        className={`relative h-full ${theme === 'dark' ? 'bg-slate-900/95' : 'bg-white/95'} backdrop-blur-xl border-r ${theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200/50'} shadow-xl`}
        variants={sidebarVariants}
        animate={isCollapsed ? 'collapsed' : 'expanded'}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-purple-500/5 to-indigo-500/5" />
        
        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              {!isCollapsed && (
                <motion.div
                  variants={itemVariants}
                  animate={isCollapsed ? 'collapsed' : 'expanded'}
                  className="flex items-center space-x-3"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Work Buddy</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">AI Leadership Assistant</p>
                  </div>
                </motion.div>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 p-4 space-y-2">
            {navigationItems.map((item, index) => (
              <motion.div
                key={item.id}
                custom={index}
                variants={itemVariants}
                initial="collapsed"
                animate={isCollapsed ? 'collapsed' : 'expanded'}
                transition={{ delay: index * 0.1 }}
              >
                <Button
                  variant={activeTab === item.id ? 'default' : 'ghost'}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full justify-start h-12 px-4 rounded-xl transition-all duration-200 ${
                    activeTab === item.id
                      ? theme === 'dark'
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                        : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                      : theme === 'dark'
                        ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                        : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-white' : item.color}`} />
                  {!isCollapsed && (
                    <div className="ml-3 text-left">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs opacity-70">{item.description}</div>
                    </div>
                  )}
                </Button>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions */}
          {!isCollapsed && (
            <motion.div
              className="p-4 border-t border-slate-200/50 dark:border-slate-700/50"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Quick Actions</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQuickActions(!showQuickActions)}
                  className="h-6 w-6 p-0"
                >
                  {showQuickActions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
              
              <AnimatePresence>
                {showQuickActions && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    {quickActions.map((action, index) => (
                      <motion.div
                        key={action.label}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Button
                          variant="ghost"
                          onClick={() => handleQuickAction(action)}
                          className={`w-full justify-start h-10 px-3 rounded-lg transition-all duration-200 hover:scale-105 ${
                            theme === 'dark'
                              ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                              : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-lg bg-gradient-to-r ${action.color} flex items-center justify-center mr-3`}>
                            <action.icon className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-medium">{action.label}</span>
                        </Button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50 space-y-3">
            {/* Connection Status */}
            <motion.div
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-100/50'}`}
              variants={itemVariants}
              animate={isCollapsed ? 'collapsed' : 'expanded'}
            >
              <div className={`w-2 h-2 rounded-full ${hasActiveConnections ? 'bg-green-500' : 'bg-red-500'}`} />
              {!isCollapsed && (
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {hasActiveConnections ? 'Connected' : 'Disconnected'}
                </span>
              )}
            </motion.div>

            {/* Theme Toggle */}
            <motion.div
              variants={itemVariants}
              animate={isCollapsed ? 'collapsed' : 'expanded'}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className={`w-full justify-start h-10 px-3 rounded-lg ${
                  theme === 'dark'
                    ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                    : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {!isCollapsed && (
                  <span className="ml-3 text-xs font-medium">
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </span>
                )}
              </Button>
            </motion.div>

            {/* About Us */}
            <motion.div
              variants={itemVariants}
              animate={isCollapsed ? 'collapsed' : 'expanded'}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAboutUs(true)}
                className={`w-full justify-start h-10 px-3 rounded-lg ${
                  theme === 'dark'
                    ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                    : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Info className="w-4 h-4" />
                {!isCollapsed && (
                  <span className="ml-3 text-xs font-medium">About Us</span>
                )}
              </Button>
            </motion.div>

            {/* User Profile */}
            <motion.div
              className={`flex items-center space-x-3 p-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-100/50'}`}
              variants={itemVariants}
              animate={isCollapsed ? 'collapsed' : 'expanded'}
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                    {userProfile.name}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {userProfile.role}
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>

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
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`max-w-md w-full ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'} rounded-2xl shadow-2xl border ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">About TAO Digital Solutions</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAboutUs(false)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    <p className="mb-3">
                      TAO Digital Solutions is a leading technology company specializing in innovative software solutions 
                      and digital transformation services.
                    </p>
                    <p className="mb-3">
                      We help organizations leverage cutting-edge technologies to improve productivity, streamline operations, 
                      and drive business growth.
                    </p>
                    <p>
                      Our Work Buddy AI assistant is designed to provide intelligent insights and recommendations to help 
                      teams work more efficiently and effectively.
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <ExternalLink className="w-4 h-4 text-blue-500" />
                    <a 
                      href="https://www.taodigitalsolutions.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Visit our website
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