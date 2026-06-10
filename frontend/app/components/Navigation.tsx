'use client'

import { useState } from 'react'
import {
  MessageSquare,
  BarChart3,
  Crown,
  ChevronRight,
  Target,
  Activity,
  Ticket
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useTheme } from '../contexts/ThemeContext'

interface NavigationItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  /** Icon foreground color: [dark, light] */
  iconColors: [string, string]
  /** Icon container background: [dark, light] */
  iconBgs: [string, string]
}

interface NavigationProps {
  activeItem: string
  onItemClick: (itemId: string) => void
}

export function Navigation({ activeItem, onItemClick }: NavigationProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const { isDarkMode } = useTheme()

  const navigationItems: NavigationItem[] = [
    {
      id: 'chat',
      title: 'Leadership Copilot',
      description: 'AI-powered insights and analysis',
      icon: <MessageSquare style={{ width: 18, height: 18 }} />,
      iconColors: ['#93C5FD', '#2563EB'],  // dark: light-blue, light: deep-blue
      iconBgs:   ['#0D1A2E', '#EFF6FF'],   // dark: dark-blue tint, light: sky tint
    },
    {
      id: 'insights',
      title: 'Leadership Insights',
      description: 'Advanced analytics & patterns',
      icon: <BarChart3 style={{ width: 18, height: 18 }} />,
      iconColors: ['#FCD34D', '#D97706'],
      iconBgs:   ['#231A05', '#FFFBEB'],
    },
    {
      id: 'quality-metrics',
      title: 'TCOE Report',
      description: 'Defect Leakage Analysis',
      icon: <Target style={{ width: 18, height: 18 }} />,
      iconColors: ['#4ADE80', '#16A34A'],
      iconBgs:   ['#0D2818', '#F0FDF4'],
    },
    {
      id: 'qa-metrics',
      title: 'QA Metrics',
      description: 'Quality Engineering Dashboard',
      icon: <Activity style={{ width: 18, height: 18 }} />,
      iconColors: ['#93C5FD', '#2563EB'],
      iconBgs:   ['#0D1A2E', '#EFF6FF'],
    },
    {
      id: 'leadership',
      title: 'Leadership Access',
      description: 'Premium analytics & insights',
      icon: <Crown style={{ width: 18, height: 18 }} />,
      iconColors: ['#FCD34D', '#D97706'],
      iconBgs:   ['#231A05', '#FFFBEB'],
    },
    {
      id: 'salesforce-insights',
      title: 'Salesforce',
      description: 'AI ticket triage & solutions',
      icon: <Ticket style={{ width: 18, height: 18 }} />,
      iconColors: ['#93C5FD', '#2563EB'],
      iconBgs:   ['#0D1A2E', '#EFF6FF'],
    },
  ]

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
          }}
        >
          Navigation
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 12 }} />
      </motion.div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {navigationItems.map((item, index) => {
          const isActive = activeItem === item.id
          const isHovered = hoveredItem === item.id
          const iconColor = isDarkMode ? item.iconColors[0] : item.iconColors[1]
          const iconBg    = isDarkMode ? item.iconBgs[0]    : item.iconBgs[1]

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + index * 0.07 }}
              onHoverStart={() => setHoveredItem(item.id)}
              onHoverEnd={() => setHoveredItem(null)}
            >
              <button
                onClick={() => onItemClick(item.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 12,
                  cursor: 'pointer',
                  background: isActive
                    ? 'var(--bg-active)'
                    : isHovered
                    ? 'var(--bg-hover)'
                    : 'var(--bg-card)',
                  border: isActive
                    ? '1px solid var(--border-strong)'
                    : '1px solid var(--border)',
                  transition: 'background 150ms, border-color 150ms',
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Active left accent bar */}
                {isActive && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: '60%' }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    style={{
                      position: 'absolute', left: 0, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3, borderRadius: 99,
                      background: iconColor,
                    }}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Icon container */}
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: iconBg,
                      border: `1px solid ${iconColor}28`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: iconColor,
                      transition: 'background 0.2s, border-color 0.2s',
                    }}
                  >
                    {item.icon}
                  </div>

                  {/* Text */}
                  <div>
                    <p
                      style={{
                        fontSize: 13, fontWeight: 600, margin: 0,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        transition: 'color 0.15s',
                      }}
                    >
                      {item.title}
                    </p>
                    <p style={{
                      fontSize: 11, margin: '2px 0 0',
                      color: 'var(--text-muted)',
                      transition: 'color 0.15s',
                    }}>
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Chevron */}
                <motion.div
                  initial={false}
                  animate={{
                    opacity: isActive || isHovered ? 1 : 0,
                    x: isActive || isHovered ? 0 : 6,
                  }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                >
                  <ChevronRight style={{ width: 14, height: 14 }} />
                </motion.div>
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
