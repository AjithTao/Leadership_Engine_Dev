'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChatInterface } from './ChatInterface'
import { LeadershipInsights } from './LeadershipInsights'
import { ArrowLeft, Sparkles, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'

interface FullPageContentProps {
  activeItem: string
  onBack: () => void
}

export function FullPageContent({ activeItem, onBack }: FullPageContentProps) {
  const getPageTitle = (itemId: string) => {
    switch (itemId) {
      case 'chat': return 'Leadership Copilot'
      case 'insights': return 'Leadership Insights'
      case 'leadership': return 'Leadership Access'
      default: return 'Dashboard'
    }
  }

  const getPageDescription = (itemId: string) => {
    switch (itemId) {
      case 'chat': return 'AI-powered insights and analysis for leadership decisions'
      case 'insights': return 'Advanced analytics and patterns for team performance'
      case 'leadership': return 'Premium analytics and strategic insights'
      default: return 'Comprehensive leadership management'
    }
  }

  const getPageIcon = (itemId: string) => {
    switch (itemId) {
      case 'chat': return '💬'
      case 'insights': return '📊'
      case 'leadership': return '👑'
      default: return '🚀'
    }
  }

  const getPageGradient = (itemId: string) => {
    switch (itemId) {
      case 'chat': return 'from-blue-500/20 to-purple-500/20'
      case 'insights': return 'from-purple-500/20 to-pink-500/20'
      case 'leadership': return 'from-yellow-500/20 to-orange-500/20'
      default: return 'from-blue-500/20 to-purple-500/20'
    }
  }

  const renderContent = () => {
    switch (activeItem) {
      case 'chat':
        return <ChatInterface />
      case 'insights':
        return <LeadershipInsights />
      case 'leadership':
        return <LeadershipInsights />
      default:
        return <ChatInterface />
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
    >
      {/* Premium Header */}
      <div className="flex-shrink-0 relative overflow-hidden">
        {/* Background Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-r ${getPageGradient(activeItem)} opacity-30`}></div>
        
        {/* Shimmer Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-premium"></div>
        
        <div className="relative z-10 bg-gray-800/80 backdrop-blur-xl border-b border-gray-700/50 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", bounce: 0.4 }}
                whileHover={{ scale: 1.05 }}
                className="flex items-center space-x-4"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl p-3 transition-all duration-300 group"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform duration-300" />
                </Button>
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center space-x-4"
              >
                <div className={`p-4 rounded-2xl bg-gradient-to-r ${getPageGradient(activeItem)} backdrop-blur-sm border border-white/10 shadow-lg`}>
                  <span className="text-2xl">{getPageIcon(activeItem)}</span>
                </div>
                <div>
                  <h1 className="premium-heading text-3xl text-white flex items-center gap-3">
                    <Sparkles className="w-7 h-7 text-blue-400" />
                    {getPageTitle(activeItem)}
                  </h1>
                  <p className="premium-text text-white/70 mt-2 text-lg">{getPageDescription(activeItem)}</p>
                </div>
              </motion.div>
            </div>
          </div>
          
          {/* Premium Breadcrumb */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center space-x-3 text-sm"
          >
            <span className="premium-caption text-white/60">Leadership Management</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
            <span className="premium-caption text-white">{getPageTitle(activeItem)}</span>
          </motion.div>
        </div>
      </div>

      {/* Premium Content */}
      <div className="flex-1 min-h-0 p-8 overflow-y-auto premium-scrollbar">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="h-full"
        >
          {renderContent()}
        </motion.div>
      </div>
    </motion.div>
  )
}
