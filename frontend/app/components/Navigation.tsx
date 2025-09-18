'use client'

import { useState } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { 
  MessageSquare, 
  BarChart3, 
  Crown, 
  ChevronRight,
  Sparkles,
  Users,
  FileText
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface NavigationItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  accentColor: string
}

interface NavigationProps {
  activeItem: string
  onItemClick: (itemId: string) => void
}

export function Navigation({ activeItem, onItemClick }: NavigationProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  const navigationItems: NavigationItem[] = [
    {
      id: 'chat',
      title: 'Leadership Copilot',
      description: 'AI-powered insights and analysis',
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'text-blue-400',
      gradient: 'from-blue-500/20 to-purple-500/20',
      accentColor: 'border-blue-500/30'
    },
    {
      id: 'insights',
      title: 'Leadership Insights',
      description: 'Advanced analytics & patterns',
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'text-purple-400',
      gradient: 'from-purple-500/20 to-pink-500/20',
      accentColor: 'border-purple-500/30'
    },
    {
      id: 'leadership',
      title: 'Leadership Access',
      description: 'Premium analytics & insights',
      icon: <Crown className="w-5 h-5" />,
      color: 'text-yellow-400',
      gradient: 'from-yellow-500/20 to-orange-500/20',
      accentColor: 'border-yellow-500/30'
    }
  ]

  return (
    <div className="space-y-4">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="flex items-center justify-between mb-6"
      >
        <h3 className="premium-caption text-white/80 tracking-wider">Navigation</h3>
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
      </motion.div>
      
      <div className="space-y-3">
        {navigationItems.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onHoverStart={() => setHoveredItem(item.id)}
            onHoverEnd={() => setHoveredItem(null)}
          >
            <Card 
              className={`premium-card cursor-pointer group relative overflow-hidden ${
                activeItem === item.id 
                  ? 'ring-2 ring-blue-500/50 shadow-xl shadow-blue-500/20' 
                  : 'hover:ring-1 hover:ring-white/20'
              }`}
              onClick={() => onItemClick(item.id)}
            >
              {/* Background Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-r ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
              
              {/* Shimmer Effect */}
              {hoveredItem === item.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer-premium"></div>
              )}
              
              <CardContent className="p-5 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <motion.div 
                      className={`p-3 rounded-xl bg-gradient-to-r ${item.gradient} backdrop-blur-sm border ${item.accentColor} ${
                        activeItem === item.id ? 'shadow-lg shadow-blue-500/20' : ''
                      }`}
                      whileHover={{ rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={item.color}>
                        {item.icon}
                      </div>
                    </motion.div>
                    <div className="flex-1">
                      <h4 className={`premium-subheading text-base ${
                        activeItem === item.id ? 'text-white' : 'text-white/90'
                      }`}>
                        {item.title}
                      </h4>
                      <p className={`premium-text text-sm mt-1 ${
                        activeItem === item.id ? 'text-white/70' : 'text-white/50'
                      }`}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                  
                  <motion.div
                    initial={false}
                    animate={{ 
                      opacity: activeItem === item.id || hoveredItem === item.id ? 1 : 0,
                      x: activeItem === item.id || hoveredItem === item.id ? 0 : 10,
                      scale: activeItem === item.id ? 1.1 : 1
                    }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="text-white/60"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </motion.div>
                </div>
                
                {/* Active Indicator */}
                {activeItem === item.id && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
