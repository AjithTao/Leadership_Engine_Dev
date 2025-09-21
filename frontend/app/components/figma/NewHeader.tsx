'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useTheme } from '../../contexts/ThemeContext'
import { useSettings } from '../../contexts/SettingsContext'
import { 
  ChevronDown, 
  User, 
  Mail, 
  Sun, 
  MoonStar,
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

interface NewHeaderProps {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
}

export function NewHeader({ theme, setTheme }: NewHeaderProps) {
  const { currentTheme, isDarkMode, toggleDarkMode, setTheme: setThemeName, availableThemes } = useTheme();
  const { settings, updateUserProfile, isLoaded } = useSettings();
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: ""
  })

  // Load user data from settings context
  useEffect(() => {
    if (isLoaded) {
      setEditForm({
        name: settings.userProfile.name,
        email: settings.userProfile.email,
        role: settings.userProfile.role
      })
    }
  }, [isLoaded, settings.userProfile])

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
      name: settings.userProfile.name,
      email: settings.userProfile.email,
      role: settings.userProfile.role
    })
    setIsEditingProfile(true)
  }

  const handleSaveProfile = () => {
    updateUserProfile({
      name: editForm.name || settings.userProfile.name,
      email: editForm.email || settings.userProfile.email,
      role: editForm.role || settings.userProfile.role
    })
    setIsEditingProfile(false)
  }

  const handleCancelEdit = () => {
    setIsEditingProfile(false)
    setEditForm({ name: "", email: "", role: "" })
  }

  return (
    <header className={`fixed top-0 left-64 right-0 z-50 border-b shadow-sm transition-all duration-500 ease-in-out ${
      isDarkMode 
        ? 'bg-gray-900 border-gray-700' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center justify-between h-16 px-6">
        {/* Logo and Title */}
        <motion.div 
          className="flex items-center space-x-3"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: currentTheme.colors.primary }}
          >
            <img 
              src="/company-logo.png" 
              alt="TAO DIGITAL Logo" 
              className="w-6 h-6 object-contain"
            />
          </div>
             <div>
               <h1 
                 key={`header-title-${currentTheme.name}-${isDarkMode}`}
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
               >Digital Transformation Platform</h1>
             </div>
        </motion.div>

        {/* Right Section */}
        <motion.div 
          className="flex items-center space-x-4"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Status Indicator */}
          <div className="flex items-center space-x-2">
               <div className="flex items-center space-x-2 text-sm text-gray-600">
                 <Activity className="w-4 h-4 text-green-500" />
                 <span className={`hidden sm:inline transition-colors duration-300 ${
                   isDarkMode ? 'text-gray-400' : 'text-gray-600'
                 }`}>System Active</span>
               </div>
          </div>

          {/* Theme Toggle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={toggleDarkMode}
                 className={`h-8 w-8 p-0 rounded-lg transition-all duration-300 relative overflow-hidden group ${
                   isDarkMode 
                     ? 'hover:bg-gray-800 text-gray-300 hover:text-white' 
                     : 'hover:bg-gray-100 text-gray-600 hover:text-black'
                 }`}
                 style={{
                   color: currentTheme.colors.primary
                 }}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.color = currentTheme.colors.secondary;
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.color = currentTheme.colors.primary;
                 }}
               >
              {isDarkMode ? (
                <MoonStar className="w-4 h-4 relative z-10" />
              ) : (
                <Sun className="w-4 h-4 relative z-10" />
              )}
              {/* Theme Glow Effect */}
              <div 
                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(90deg, ${currentTheme.colors.primary}20, ${currentTheme.colors.secondary}20)`
                }}
              ></div>
            </Button>
          </motion.div>


          {/* User Menu */}
          <div className="relative" data-user-menu>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
                 <Button
                   variant="ghost"
                   className={`flex items-center space-x-2 h-10 px-3 rounded-lg transition-all duration-200 ${
                     isDarkMode 
                       ? 'hover:bg-gray-800 text-white' 
                       : 'hover:bg-gray-100 text-black'
                   }`}
                   onClick={() => setShowUserMenu(!showUserMenu)}
                 >
                   <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                     isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                   }`}>
                     <User className={`w-4 h-4 ${
                       isDarkMode ? 'text-gray-300' : 'text-gray-600'
                     }`} />
                   </div>
                   <div className="text-left">
                     <div className={`text-sm font-medium transition-colors duration-300 ${
                       isDarkMode ? 'text-gray-100' : 'text-gray-900'
                     }`}>{settings.userProfile.name}</div>
                     <div className={`text-xs transition-colors duration-300 ${
                       isDarkMode ? 'text-gray-400' : 'text-gray-600'
                     }`}>{settings.userProfile.role}</div>
                   </div>
                <motion.div
                  animate={{ rotate: showUserMenu ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className={`w-4 h-4 transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
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
                    className={`absolute right-0 top-full mt-2 w-72 border rounded-lg shadow-2xl z-50 transition-all duration-300 ${
                      isDarkMode 
                        ? 'bg-gray-800 border-gray-700' 
                        : 'bg-white border-gray-200'
                    }`}
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="p-4">
                      {!isEditingProfile ? (
                        <>
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                            }`}>
                              <User className={`w-5 h-5 ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-600'
                              }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className={`font-medium text-sm transition-colors duration-300 ${
                                  isDarkMode ? 'text-white' : 'text-black'
                                }`}>{settings.userProfile.name}</span>
                              </div>
                              <div className="flex items-center space-x-2 mt-1">
                                <Mail className={`w-3 h-3 ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                }`} />
                                <span className={`text-xs truncate transition-colors duration-300 ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>{settings.userProfile.email}</span>
                              </div>
                              <div className="flex items-center space-x-2 mt-1">
                                <Shield className={`w-3 h-3 ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                }`} />
                                <span className={`text-xs truncate transition-colors duration-300 ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>{settings.userProfile.role}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-black">Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 text-sm rounded border border-gray-300 bg-white text-black focus:outline-none focus:border-transparent"
                              style={{
                                '--tw-ring-color': `${currentTheme.colors.primary}40`
                              } as React.CSSProperties}
                              onFocus={(e) => {
                                e.target.style.borderColor = currentTheme.colors.primary;
                                e.target.style.boxShadow = `0 0 0 2px ${currentTheme.colors.primary}40`;
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#D1D5DB';
                                e.target.style.boxShadow = '';
                              }}
                              placeholder="Enter your name"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-black">Email</label>
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 text-sm rounded border border-gray-300 bg-white text-black focus:outline-none focus:border-transparent"
                              style={{
                                '--tw-ring-color': `${currentTheme.colors.primary}40`
                              } as React.CSSProperties}
                              onFocus={(e) => {
                                e.target.style.borderColor = currentTheme.colors.primary;
                                e.target.style.boxShadow = `0 0 0 2px ${currentTheme.colors.primary}40`;
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#D1D5DB';
                                e.target.style.boxShadow = '';
                              }}
                              placeholder="Enter your email"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-black">Role</label>
                            <input
                              type="text"
                              value={editForm.role}
                              onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 text-sm rounded border border-gray-300 bg-white text-black focus:outline-none focus:border-transparent"
                              style={{
                                '--tw-ring-color': `${currentTheme.colors.primary}40`
                              } as React.CSSProperties}
                              onFocus={(e) => {
                                e.target.style.borderColor = currentTheme.colors.primary;
                                e.target.style.boxShadow = `0 0 0 2px ${currentTheme.colors.primary}40`;
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#D1D5DB';
                                e.target.style.boxShadow = '';
                              }}
                              placeholder="Enter your role"
                            />
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={handleSaveProfile}
                              className="flex-1 h-8 text-sm text-white"
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
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="flex-1 h-8 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="p-2 space-y-1 border-t border-gray-200">
                      {!isEditingProfile && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleEditProfile}
                          className="w-full justify-start h-9 px-3 rounded-md text-gray-700 hover:text-black hover:bg-gray-100"
                        >
                          <User className="w-4 h-4 mr-3" />
                          <span className="text-sm">Edit Profile</span>
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start h-9 px-3 rounded-md text-gray-700 hover:text-black hover:bg-gray-100"
                      >
                        <Settings className="w-4 h-4 mr-3" />
                        <span className="text-sm">Settings</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start h-9 px-3 rounded-md text-gray-700 hover:text-black hover:bg-gray-100"
                      >
                        <Mail className="w-4 h-4 mr-3" />
                        <span className="text-sm">Notifications</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start h-9 px-3 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        <span className="text-sm">Sign Out</span>
                      </Button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

      </div>
    </header>
  )
}
