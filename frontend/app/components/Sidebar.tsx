'use client'

import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Integrations } from './Integrations'
import { Navigation } from './Navigation'
import { ApiStatus } from './ApiStatus'
import { Crown, Zap, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

interface SidebarProps {
  activeItem: string
  onItemClick: (itemId: string) => void
}

export function Sidebar({ activeItem, onItemClick }: SidebarProps) {
  const router = useRouter()

  return (
    <aside className="h-screen pt-20 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 border-r border-gray-700/50 p-8 space-y-8 overflow-y-auto premium-scrollbar transition-all duration-500">
      {/* Company Branding */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center p-6 premium-card relative overflow-hidden group"
      >
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-50"></div>
        
        {/* Shimmer Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-premium"></div>
        
        <div className="relative z-10">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", bounce: 0.4 }}
            className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20"
          >
            <Sparkles className="w-6 h-6 text-white" />
          </motion.div>
          <h3 className="premium-heading text-xl text-white mb-2">TAO DIGITAL</h3>
          <p className="premium-caption text-white/60">Integration Hub</p>
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
          <h3 className="premium-caption text-white/80 tracking-wider flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Quick Actions
          </h3>
          <div className="w-12 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        </div>
        <div className="space-y-3">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              variant="outline" 
              className="w-full justify-between premium-card hover:bg-emerald-500/10 border-emerald-500/20 text-white/80 hover:text-white group" 
              disabled
            >
              <span className="flex items-center gap-3">
                <span className="text-lg">📊</span>
                <span className="premium-text">Sprint Analytics</span>
              </span>
              <span className="premium-caption text-emerald-400/60">Coming soon</span>
            </Button>
          </motion.div>
          
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              variant="outline" 
              className="w-full justify-between premium-card hover:bg-blue-500/10 border-blue-500/20 text-white/80 hover:text-white group" 
              disabled
            >
              <span className="flex items-center gap-3">
                <span className="text-lg">🔍</span>
                <span className="premium-text">QA Metrics</span>
              </span>
              <span className="premium-caption text-blue-400/60">Coming soon</span>
            </Button>
          </motion.div>
          
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              variant="outline" 
              className="w-full justify-between premium-card hover:bg-purple-500/10 border-purple-500/20 text-white/80 hover:text-white group" 
              disabled
            >
              <span className="flex items-center gap-3">
                <span className="text-lg">📈</span>
                <span className="premium-text">Team Performance</span>
              </span>
              <span className="premium-caption text-purple-400/60">Coming soon</span>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="pt-8 border-t border-gray-700/50"
      >
        <p className="text-center premium-caption text-white/40">
          Powered by TAO Digital Solutions
        </p>
      </motion.div>
    </aside>
  )
}