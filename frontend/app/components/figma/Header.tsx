'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useTheme } from '../../contexts/ThemeContext'
import { 
  ChevronDown, 
  User, 
  Mail, 
  Sun, 
  Moon,
  Sparkles,
  Activity,
  Settings,
  LogOut,
  Monitor,
  Zap,
  Shield,
  Menu,
  Database
} from 'lucide-react'

interface HeaderProps {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
}

export function FigmaHeader({ theme, setTheme }: HeaderProps) {
  const { currentTheme, isDarkMode, toggleDarkMode } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [userData, setUserData] = useState({
    name: "Alex Chen",
    email: "alex.chen@company.com",
    role: "Senior Engineering Manager",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex"
  })
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: ""
  })

  // Load user data from localStorage on component mount
  useEffect(() => {
    const savedUserData = localStorage.getItem('userProfile')
    if (savedUserData) {
      const parsed = JSON.parse(savedUserData)
      setUserData(parsed)
    }
  }, [])

  // Save user data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('userProfile', JSON.stringify(userData))
  }, [userData])

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu) {
        const target = event.target as HTMLElement
        if (!target.closest('[data-user-menu]')) {
          setShowUserMenu(false)
          setIsEditingProfile(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  const handleEditProfile = () => {
    setEditForm({
      name: userData.name,
      email: userData.email,
      role: userData.role
    })
    setIsEditingProfile(true)
  }

  const handleSaveProfile = () => {
    setUserData(prev => ({
      ...prev,
      name: editForm.name || prev.name,
      email: editForm.email || prev.email,
      role: editForm.role || prev.role
    }))
    setIsEditingProfile(false)
  }

  const handleCancelEdit = () => {
    setIsEditingProfile(false)
    setEditForm({ name: "", email: "", role: "" })
  }

  return (
    <motion.header 
        className="fixed top-0 left-56 right-0 z-50 backdrop-blur-xl border-b shadow-sm transition-all duration-500 ease-in-out"
        style={{
          background: `linear-gradient(135deg, ${currentTheme.colors.surface}CC, ${currentTheme.colors.background}CC)`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${currentTheme.colors.border}40`,
          boxShadow: `0 8px 32px ${currentTheme.colors.primary}20, inset 0 1px 0 ${currentTheme.colors.surface}80`
        }}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* Animated Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Enhanced Floating Particles Background */}
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={`header-particle-${i}`}
            className="absolute w-2 h-2 bg-blue-400/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -25, 0],
              x: [0, Math.random() * 15 - 7.5, 0],
              opacity: [0, 0.8, 0],
              scale: [0, 1.3, 0]
            }}
            transition={{
              duration: 5 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 4,
              ease: "easeInOut"
            }}
          />
        ))}
        
        {/* Enhanced Gradient Orbs */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={`header-orb-${i}`}
            className="absolute rounded-full opacity-15"
            style={{
              width: `${50 + i * 25}px`,
              height: `${50 + i * 25}px`,
              left: `${20 + i * 30}%`,
              top: `${10 + i * 20}%`,
              background: `radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(139, 92, 246, 0.3) 50%, transparent 70%)`,
              filter: "blur(20px)"
            }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.08, 0.2, 0.08],
              x: [0, 15, 0],
              y: [0, -15, 0]
            }}
            transition={{
              duration: 7 + i * 2,
              repeat: Infinity,
              delay: i * 2.5,
              ease: "easeInOut"
            }}
          />
        ))}
        
        {/* Enhanced Grid Pattern */}
        <motion.div
          className="absolute inset-0 opacity-8"
          style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }}
          animate={{
            opacity: [0.03, 0.1, 0.03]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        {/* Enhanced Rotating Light Beams */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={`header-beam-${i}`}
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
                duration: 20 + i * 15,
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
        
        {/* Enhanced Pulsing Border Glow */}
        <motion.div
          className="absolute inset-0 border border-blue-400/20"
          animate={{
            borderColor: [
              "rgba(59, 130, 246, 0.15)",
              "rgba(139, 92, 246, 0.3)",
              "rgba(59, 130, 246, 0.15)"
            ],
            boxShadow: [
              "0 0 0px rgba(59, 130, 246, 0.15)",
              "0 0 25px rgba(139, 92, 246, 0.3)",
              "0 0 0px rgba(59, 130, 246, 0.15)"
            ]
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        {/* Additional Motion Glow Effects */}
        <motion.div
          className="absolute inset-0 rounded-lg"
          style={{
            background: "radial-gradient(ellipse at center, rgba(59, 130, 246, 0.1) 0%, transparent 60%)",
            filter: "blur(30px)"
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
      
      <div className="flex items-center justify-between h-12 px-4 relative z-10">
        {/* Compact Logo and Tool Name */}
        <motion.div 
          className="flex items-center space-x-2"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <motion.div 
            className="relative w-8 h-8 flex items-center justify-center"
            whileHover={{ 
              scale: 1.05,
              transition: { duration: 0.4 }
            }}
          >
            <img 
              src="/company-logo.png" 
              alt="TAO DIGITAL Logo" 
              className="w-full h-full object-contain"
            />
          </motion.div>
          <div>
            <h1 className={`font-semibold text-sm ${
              theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
            }`}>TAO Leadership Engine</h1>
          </div>
        </motion.div>

        {/* Compact Right Section */}
        <motion.div 
          className="flex items-center space-x-2"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Compact Status Indicator */}
          <div className="flex items-center space-x-1">
            <div className={`flex items-center space-x-1 text-xs ${
              theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'
            }`}>
              <Activity className="w-2.5 h-2.5 text-[var(--success)]" />
              <span className="hidden sm:inline">Active</span>
            </div>
          </div>

          {/* Modern Theme Toggle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <motion.div
              className="relative w-12 h-6 rounded-full cursor-pointer transition-all duration-300"
              style={{
                background: isDarkMode 
                  ? `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})` 
                  : currentTheme.colors.border
              }}
              onClick={toggleDarkMode}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute top-0.5 w-5 h-5 rounded-full shadow-lg flex items-center justify-center"
                style={{ backgroundColor: currentTheme.colors.background }}
                animate={{
                  x: isDarkMode ? 26 : 2,
                }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30
                }}
            >
              <motion.div
                  className="flex items-center justify-center w-full h-full"
                  animate={{
                    rotate: isDarkMode ? 0 : 180,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: "easeInOut"
                  }}
                >
                  {isDarkMode ? (
                    <Moon 
                      className="w-3 h-3" 
                      style={{ color: currentTheme.colors.textSecondary }}
                    />
                  ) : (
                    <Sun 
                      className="w-3 h-3" 
                      style={{ color: currentTheme.colors.accent }}
                    />
                )}
              </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Compact User Menu */}
          <div className="relative" data-user-menu>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <Button
                variant="ghost"
                className="flex items-center space-x-1.5 h-8 px-2 rounded-md hover:bg-[var(--bg-surface)]/50 transition-all duration-200"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <Menu className={`w-4 h-4 transition-all duration-200 ${
                    theme === 'dark' 
                      ? 'text-white drop-shadow-lg shadow-white/50' 
                      : 'text-[var(--text-primary)]'
                  }`} />
                </div>
                <motion.div
                  animate={{ rotate: showUserMenu ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className={`w-3 h-3 transition-all duration-200 ${
                    theme === 'dark' 
                      ? 'text-white drop-shadow-lg shadow-white/50' 
                      : 'text-[var(--text-primary)]'
                  }`} />
                </motion.div>
              </Button>
            </motion.div>

            <AnimatePresence>
              {showUserMenu && (
                <>
                  <motion.div
                    className="fixed inset-0 z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowUserMenu(false)}
                  />
                  <motion.div
                    className={`absolute right-0 top-full mt-1 w-56 backdrop-blur-xl border rounded-lg shadow-2xl z-50 ${
                      theme === 'dark' 
                        ? 'bg-[var(--bg-tertiary)]/95 border-[var(--border-subtle)]' 
                        : 'bg-white/95 border-gray-200'
                    }`}
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="p-3">
                      {!isEditingProfile ? (
                        <>
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 flex items-center justify-center bg-[var(--accent-primary)]/10 rounded-full ring-2 ring-[var(--accent-primary)]/20">
                              <Menu className="w-4 h-4 text-[var(--accent-primary)]" />
                            </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1">
                                <User className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
                                <span className={`font-medium text-xs truncate ${
                                  theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
                                }`}>{userData.name}</span>
                              </div>
                              <div className="flex items-center space-x-1 mt-0.5">
                                <Mail className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
                                <span className={`text-xs truncate ${
                                  theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-600'
                                }`}>{userData.email}</span>
                          </div>
                          <div className="flex items-center space-x-1 mt-0.5">
                                <Shield className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
                                <span className={`text-xs truncate ${
                                  theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-600'
                                }`}>{userData.role}</span>
                          </div>
                        </div>
                      </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className={`text-xs font-medium ${
                              theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
                            }`}>Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              className={`w-full mt-1 px-2 py-1 text-xs rounded border ${
                                theme === 'dark' 
                                  ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)]' 
                                  : 'bg-white border-gray-200 text-gray-900'
                              }`}
                              placeholder="Enter your name"
                            />
                          </div>
                          <div>
                            <label className={`text-xs font-medium ${
                              theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
                            }`}>Email</label>
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                              className={`w-full mt-1 px-2 py-1 text-xs rounded border ${
                                theme === 'dark' 
                                  ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)]' 
                                  : 'bg-white border-gray-200 text-gray-900'
                              }`}
                              placeholder="Enter your email"
                            />
                          </div>
                          <div>
                            <label className={`text-xs font-medium ${
                              theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
                            }`}>Role</label>
                            <input
                              type="text"
                              value={editForm.role}
                              onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                              className={`w-full mt-1 px-2 py-1 text-xs rounded border ${
                                theme === 'dark' 
                                  ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)]' 
                                  : 'bg-white border-gray-200 text-gray-900'
                              }`}
                              placeholder="Enter your role"
                            />
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={handleSaveProfile}
                              className="flex-1 h-6 text-xs bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="flex-1 h-6 text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="p-1.5 space-y-0.5">
                      {!isEditingProfile && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleEditProfile}
                          className={`w-full justify-start h-7 px-2 rounded-md ${
                            theme === 'dark' 
                              ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/10' 
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          <User className="w-3 h-3 mr-2" />
                          <span className="text-xs">Edit Profile</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className={`w-full justify-start h-7 px-2 rounded-md ${
                        theme === 'dark' 
                          ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/10' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}>
                        <Settings className="w-3 h-3 mr-2" />
                        <span className="text-xs">Settings</span>
                      </Button>
                      <Button variant="ghost" size="sm" className={`w-full justify-start h-7 px-2 rounded-md ${
                        theme === 'dark' 
                          ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/10' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}>
                        <Mail className="w-3 h-3 mr-2" />
                        <span className="text-xs">Notifications</span>
                      </Button>
                      <Button variant="ghost" size="sm" className={`w-full justify-start h-7 px-2 rounded-md ${
                        theme === 'dark' 
                          ? 'text-[var(--error)] hover:text-red-300 hover:bg-red-500/10' 
                          : 'text-red-600 hover:text-red-700 hover:bg-red-50'
                      }`}>
                        <LogOut className="w-3 h-3 mr-2" />
                        <span className="text-xs">Sign Out</span>
                      </Button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </motion.header>
  )
}
