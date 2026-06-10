'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { useTheme } from '../../contexts/ThemeContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { CDKLogo } from '../ui/FalconXLogo'
import {
  ChevronDown,
  User,
  Mail,
  Activity,
  Settings,
  LogOut,
  Shield,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import { ThemeToggle } from '../ThemeToggle'

interface NewHeaderProps {
  theme?: 'light' | 'dark'
  setTheme?: (theme: 'light' | 'dark') => void
  integrations?: string[]
  setIntegrations?: (v: string[] | ((p: string[]) => string[])) => void
  uploadedDocReady?: boolean
  setUploadedDocReady?: (v: boolean) => void
  activeView?: string
}

export function NewHeader({
  theme,
  setTheme,
  integrations = [],
  setIntegrations = () => {},
  uploadedDocReady = false,
  setUploadedDocReady = () => {},
  activeView = 'copilot',
}: NewHeaderProps) {
  const { currentTheme } = useTheme()
  const c = currentTheme.colors
  const { settings, updateUserProfile, isLoaded } = useSettings()
  const { logout } = useAuth()
  const router = useRouter()

  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '' })

  useEffect(() => {
    if (isLoaded) {
      setEditForm({
        name: settings.userProfile.name,
        email: settings.userProfile.email,
        role: settings.userProfile.role,
      })
    }
  }, [isLoaded, settings.userProfile])

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
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  const handleSaveProfile = () => {
    updateUserProfile({
      name: editForm.name || settings.userProfile.name,
      email: editForm.email || settings.userProfile.email,
      role: editForm.role || settings.userProfile.role,
    })
    setIsEditingProfile(false)
  }

  const isAutoMode = integrations.length === 0

  return (
    <header
      className="fixed top-0 left-64 right-0 z-50"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        fontFamily: 'var(--font)',
      }}
    >
      {/* Row 1: Logo, Status, User */}
      <div className="flex items-center justify-between h-14 px-6">

        {/* CDK Logo — top-left of content area */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <CDKLogo size={24} />
        </motion.div>

        {/* Right section */}
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* System status — cool blue (no green) */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Activity className="w-3.5 h-3.5" style={{ color: 'var(--accent-cool)' }} />
            <span className="hidden sm:inline">System Active</span>
          </div>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User menu */}
          <div className="relative" data-user-menu>
            <UserMenuTrigger
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              isLoaded={isLoaded}
              settings={settings}
              primary={c.primary}
            />

            <AnimatePresence>
              {showUserMenu && (
                <>
                  {/* Invisible backdrop to catch outside clicks */}
                  <motion.div
                    className="fixed inset-0 z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowUserMenu(false)}
                  />

                  {/* Dropdown panel — border only, no box-shadow */}
                  <motion.div
                    className="absolute right-0 top-full mt-2 w-72 rounded-2xl z-50 overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-strong)',
                    }}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    {/* Profile section */}
                    <div className="p-4">
                      {!isEditingProfile ? (
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: 'var(--bg-active)' }}
                          >
                            <User className="w-5 h-5" style={{ color: c.primary }} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {settings.userProfile.name}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                {settings.userProfile.email}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Shield className="w-3 h-3 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                {settings.userProfile.role}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {[
                            { label: 'Name',  key: 'name',  type: 'text',  placeholder: 'Enter your name'  },
                            { label: 'Email', key: 'email', type: 'email', placeholder: 'Enter your email' },
                            { label: 'Role',  key: 'role',  type: 'text',  placeholder: 'Enter your role'  },
                          ].map(({ label, key, type, placeholder }) => (
                            <div key={key}>
                              <label
                                className="text-xs font-medium"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {label}
                              </label>
                              <input
                                type={type}
                                value={editForm[key as keyof typeof editForm]}
                                onChange={(e) => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder={placeholder}
                                className="w-full mt-1 px-3 py-2 text-sm rounded-xl focus:outline-none"
                                style={{
                                  backgroundColor: 'var(--bg-card)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-primary)',
                                }}
                                onFocus={(e) => {
                                  e.target.style.borderColor = c.primary
                                }}
                                onBlur={(e) => {
                                  e.target.style.borderColor = 'var(--border)'
                                }}
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={handleSaveProfile}
                              className="flex-1 h-8 text-xs font-semibold rounded-full transition-opacity duration-150 hover:opacity-80"
                              style={{ backgroundColor: c.primary, color: '#000000' }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setIsEditingProfile(false)}
                              className="flex-1 h-8 text-xs font-semibold rounded-full transition-colors duration-150"
                              style={{
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                                backgroundColor: 'transparent',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Menu items */}
                    <div style={{ borderTop: '1px solid var(--border)' }} className="p-2 space-y-0.5">
                      {!isEditingProfile && (
                        <MenuBtn
                          icon={<User className="w-4 h-4" />}
                          label="Edit Profile"
                          c={c}
                          onClick={() => setIsEditingProfile(true)}
                        />
                      )}
                      <MenuBtn icon={<Settings className="w-4 h-4" />} label="Settings"      c={c} onClick={() => {}} />
                      <MenuBtn icon={<Mail className="w-4 h-4" />}     label="Notifications" c={c} onClick={() => {}} />
                      <MenuBtn
                        icon={<LogOut className="w-4 h-4" />}
                        label="Sign Out"
                        c={c}
                        danger
                        onClick={() => { logout(); router.push('/') }}
                      />
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Row 2: Integration filters — only on WorkBuddy page */}
      {(activeView === 'copilot' || activeView === undefined) && <div
        className="flex items-center justify-between px-6 py-2.5 gap-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-surface) 35%, var(--bg-card) 70%, var(--border) 100%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative flex items-center justify-between flex-1 gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Integrations:
          </span>
          <div className="flex items-center gap-3">
            {['jira', 'confluence'].map((id) => {
              const selected = integrations.includes(id)
              const isComingSoon = false
              const label = id.charAt(0).toUpperCase() + id.slice(1)
              return (
                <label
                  key={id}
                  className={`flex items-center gap-1.5 text-xs select-none ${isComingSoon ? 'opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={isComingSoon}
                    onChange={() => {
                      setIntegrations((prev) =>
                        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                      )
                    }}
                    className="rounded"
                    style={{ accentColor: 'var(--accent-cool)' }}
                  />
                  <span style={{ color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {label}
                    {isComingSoon && <span className="ml-1 opacity-60">(Soon)</span>}
                  </span>
                </label>
              )
            })}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.md,.txt"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const form = new FormData()
                    form.append('file', file)
                    form.append('name', 'workbuddy-domain')
                    const resp = await fetch(
                      `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/domain/upload`,
                      { method: 'POST', body: form }
                    )
                    const data = await resp.json()
                    if (!resp.ok || data?.success === false)
                      throw new Error(data?.detail || data?.error || 'Upload failed')
                    setUploadedDocReady(true)
                  } catch (err) {
                    console.error('Upload failed', err)
                  } finally {
                    if (e.target) (e.target as HTMLInputElement).value = ''
                  }
                }}
              />
              <span
                className="px-2 py-1 rounded-lg inline-flex items-center gap-1 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Upload Doc
              </span>
              {uploadedDocReady && (
                <span className="text-[10px]" style={{ color: 'var(--accent-cool)' }}>
                  Indexed
                </span>
              )}
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{
              backgroundColor: isAutoMode ? 'var(--accent-cool-bg)' : 'var(--bg-surface)',
              border: `1px solid ${isAutoMode ? 'rgba(212,168,71,0.3)' : 'var(--border)'}`,
            }}
          >
            <Sparkles
              className="w-3.5 h-3.5"
              style={{ color: isAutoMode ? 'var(--accent-cool)' : 'var(--text-secondary)' }}
            />
            <span
              className="text-xs font-semibold"
              style={{ color: isAutoMode ? 'var(--accent-cool)' : 'var(--text-secondary)' }}
            >
              Auto Mode
            </span>
          </div>
        </div>
        </div>
      </div>}
    </header>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Avatar + name/role trigger button */
function UserMenuTrigger({
  showUserMenu,
  setShowUserMenu,
  isLoaded,
  settings,
  primary,
}: {
  showUserMenu: boolean
  setShowUserMenu: (v: boolean) => void
  isLoaded: boolean
  settings: { userProfile: { name: string; role: string } }
  primary: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={() => setShowUserMenu(!showUserMenu)}
      className="flex items-center gap-2 h-9 px-3 rounded-full transition-colors duration-150"
      style={{
        color: 'var(--text-primary)',
        backgroundColor: hovered ? 'var(--bg-hover)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-active)' }}
      >
        <User className="w-3.5 h-3.5" style={{ color: primary }} />
      </div>
      <div className="text-left hidden sm:block">
        <div className="text-xs font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
          {isLoaded ? settings.userProfile.name : 'User'}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isLoaded ? settings.userProfile.role : ''}
        </div>
      </div>
      <motion.div animate={{ rotate: showUserMenu ? 180 : 0 }} transition={{ duration: 0.2 }}>
        <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
      </motion.div>
    </button>
  )
}

/** Dropdown menu row */
function MenuBtn({
  icon,
  label,
  c,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  c: Record<string, string>
  danger?: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const textColor = danger ? 'var(--red)' : 'var(--text-primary)'
  const iconColor = danger ? 'var(--red)' : 'var(--text-secondary)'
  const hoverBg   = danger ? 'rgba(248,113,113,0.08)' : 'var(--bg-hover)'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 h-9 px-3 rounded-xl text-sm transition-colors duration-150"
      style={{
        color: textColor,
        backgroundColor: hovered ? hoverBg : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ color: iconColor }}>{icon}</span>
      {label}
    </button>
  )
}
