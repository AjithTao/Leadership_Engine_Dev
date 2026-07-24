'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertCircle, Sparkles } from 'lucide-react'

interface ConnectionPopupProps {
  isVisible: boolean
  isSuccess: boolean
  message: string
  onClose: () => void
}

export function ConnectionPopup({ isVisible, isSuccess, message, onClose }: ConnectionPopupProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isVisible, onClose])

  const getStatusIcon = () => {
    if (isSuccess) {
      return <CheckCircle className="w-6 h-6 text-[var(--status-success)] dark:text-emerald-400" />
    } else {
      return <XCircle className="w-6 h-6 text-[var(--status-danger)] dark:text-red-400" />
    }
  }

  const getStatusGradient = () => {
    if (isSuccess) {
      return 'from-[var(--status-success-bg)] to-[var(--status-success-bg)] dark:from-emerald-500/20 dark:to-green-500/20'
    } else {
      return 'from-[var(--status-danger-bg)] to-[var(--status-danger-bg)] dark:from-red-500/20 dark:to-rose-500/20'
    }
  }

  const getStatusBorder = () => {
    if (isSuccess) {
      return 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] dark:border-emerald-500/30'
    } else {
      return 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] dark:border-red-500/30'
    }
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: -20 }}
          transition={{ 
            type: "spring", 
            duration: 0.6,
            bounce: 0.2
          }}
          className="fixed top-24 right-8 z-[9999] w-96"
        >
          <div className={`premium-card relative overflow-hidden group ${getStatusBorder()}`}>
            {/* Background Gradient */}
            <div className={`absolute inset-0 bg-gradient-to-r ${getStatusGradient()} opacity-50`}></div>
            
            {/* Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-premium"></div>
            
            {/* Content */}
            <div className="relative z-10 p-6">
              <div className="flex items-start space-x-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", bounce: 0.4 }}
                  className={`p-3 rounded-xl bg-gradient-to-r ${getStatusGradient()} backdrop-blur-sm border ${getStatusBorder()} shadow-lg`}
                >
                  {getStatusIcon()}
                </motion.div>
                
                <div className="flex-1">
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center space-x-2 mb-2"
                  >
                    <Sparkles className="w-4 h-4 text-[var(--link)] dark:text-blue-400" />
                    <h4 className="premium-subheading text-[var(--text-primary)] dark:text-white text-sm">
                      {isSuccess ? 'Connection Successful' : 'Connection Failed'}
                    </h4>
                  </motion.div>
                  
                  <motion.p
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="premium-text text-[var(--text-secondary)] dark:text-white/80 text-sm leading-relaxed"
                  >
                    {message}
                  </motion.p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 3, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-[var(--accent-cool)] to-[var(--accent-indigo)] dark:from-blue-500 dark:to-purple-500 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
