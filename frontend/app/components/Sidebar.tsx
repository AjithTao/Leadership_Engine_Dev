'use client'

import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Integrations } from './Integrations'
import { Navigation } from './Navigation'
import { ApiStatus } from './ApiStatus'
import { Crown, Zap, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useTheme } from '../contexts/ThemeContext'

interface SidebarProps {
  activeItem: string
  onItemClick: (itemId: string) => void
}

export function Sidebar({ activeItem, onItemClick }: SidebarProps) {
  const router = useRouter()
  const { currentTheme } = useTheme()

  return (
    <aside
      className="h-screen pt-20 border-r p-8 space-y-8 overflow-y-auto premium-scrollbar transition-all duration-500"
      style={{
        background: `linear-gradient(to bottom, ${currentTheme.colors.background}, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`,
        borderColor: 'var(--border)',
      }}
    >
      {/* Company Branding */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center p-6 premium-card relative overflow-hidden group"
      >
        {/* Background gradient overlay */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `linear-gradient(to right, ${currentTheme.colors.primary}18, ${currentTheme.colors.accent}18)`,
          }}
        />

        {/* Shimmer effect */}
        <div className="absolute inset-0 animate-shimmer-premium" />

        <div className="relative z-10">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', bounce: 0.4 }}
            className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${currentTheme.colors.accent}, ${currentTheme.colors.primary})`,
            }}
          >
            <Sparkles className="w-6 h-6" style={{ color: 'var(--bg-card)' }} />
          </motion.div>
          <h3
            className="premium-heading text-xl mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            FalconX
          </h3>
          <p className="premium-caption" style={{ color: 'var(--text-muted)' }}>
            Integration Hub
          </p>
        </div>
      </motion.div>

      {/* Navigation */}
      <Navigation activeItem={activeItem} onItemClick={onItemClick} />

      {/* Integrations */}
      <Integrations />

      {/* API Status */}
      <ApiStatus />

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h3
            className="premium-caption tracking-wider flex items-center gap-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Zap className="w-4 h-4" />
            Quick Actions
          </h3>
          <div
            className="w-12 h-px"
            style={{
              background: `linear-gradient(to right, transparent, var(--border-strong), transparent)`,
            }}
          />
        </div>
        <div className="space-y-3">
          {[
            { emoji: '📊', label: 'Sprint Analytics',  colorVar: 'var(--accent-cool)' },
            { emoji: '🔍', label: 'QA Metrics',        colorVar: 'var(--blue)' },
            { emoji: '📈', label: 'Team Performance',  colorVar: 'var(--text-muted)' },
          ].map(({ emoji, label, colorVar }) => (
            <motion.div key={label} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                className="w-full justify-between premium-card"
                style={{ color: 'var(--text-secondary)' }}
                disabled
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">{emoji}</span>
                  <span className="premium-text">{label}</span>
                </span>
                <span
                  className="premium-caption"
                  style={{ color: colorVar, opacity: 0.7 }}
                >
                  Coming soon
                </span>
              </Button>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="pt-8 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <p className="text-center premium-caption" style={{ color: 'var(--text-hint)' }}>
          Powered by FalconX Solutions
        </p>
      </motion.div>
    </aside>
  )
}
