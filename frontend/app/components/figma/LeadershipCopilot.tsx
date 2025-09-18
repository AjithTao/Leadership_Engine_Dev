'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { ScrollArea } from '../ui/scroll-area'
import { Badge } from '../ui/badge'
import { exportChatAsPDF, exportChatAsExcel, useVoiceToText } from '../../utils/exportUtils'
import { 
  Bot, 
  User, 
  Sparkles, 
  Zap, 
  Brain, 
  MessageCircle, 
  TrendingUp,
  Target,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Settings,
  Crown,
  Star,
  Activity,
  Command,
  Shield,
  Lightbulb,
  Database,
  Monitor,
  Workflow,
  Trash2,
  FileText,
  FileSpreadsheet,
  Mic,
  MicOff,
  Square,
  Send,
  MoreVertical,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Volume2,
  VolumeX
} from 'lucide-react'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string | object
  timestamp: Date
  projectContext?: string
  metadata?: {
    type: 'analysis' | 'recommendation' | 'insight' | 'summary'
    confidence?: number
    sources?: string[]
  }
}

interface ProjectContext {
  projectKey: string
  projectName: string
  lastMentioned: Date
  isActive: boolean
}

interface FigmaLeadershipCopilotProps {
  hasActiveConnections: boolean
  theme: 'light' | 'dark'
  quickActionPrompt?: string | null
  onPromptSent?: () => void
}

export function FigmaLeadershipCopilot({ 
  hasActiveConnections, 
  theme, 
  quickActionPrompt, 
  onPromptSent 
}: FigmaLeadershipCopilotProps) {
  const [userData, setUserData] = useState({
    name: "Alex",
    email: "alex.chen@company.com",
    role: "Senior Engineering Manager"
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [showAvatarAnimation, setShowAvatarAnimation] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [projectContext, setProjectContext] = useState<ProjectContext[]>([])
  const [lastMentionedProject, setLastMentionedProject] = useState<string | null>(null)
  const [cachedProjects, setCachedProjects] = useState<Record<string, any>>({})
  const [isExpanded, setIsExpanded] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  
  // Voice-to-text functionality
  const { isListening, transcript, isSupported, startListening, stopListening, resetTranscript } = useVoiceToText()

  // Load user data from localStorage and initialize welcome message
  useEffect(() => {
    const savedUserData = localStorage.getItem('userProfile')
    if (savedUserData) {
      const parsed = JSON.parse(savedUserData)
      setUserData(parsed)
    }
    
    // Initialize welcome message with current user name
    const userName = savedUserData ? JSON.parse(savedUserData).name : "Alex"
    setMessages([{
      id: '1',
      type: 'assistant',
      content: `Hello ${userName}! 👋 I'm your AI Work Buddy, ready to help you with team insights, project analysis, and strategic recommendations. What would you like to explore today?`,
      timestamp: new Date(),
      metadata: {
        type: 'insight',
        confidence: 0.95
      }
    }])
  }, [])

  // Update welcome message when user data changes
  useEffect(() => {
    if (messages.length > 0 && messages[0].type === 'assistant') {
      setMessages(prev => [{
        ...prev[0],
        content: `Hello ${userData.name}! 👋 I'm your AI Work Buddy, ready to help you with team insights, project analysis, and strategic recommendations. What would you like to explore today?`
      }, ...prev.slice(1)])
    }
  }, [userData.name])

  // Listen for localStorage changes to update user data
  useEffect(() => {
    const handleStorageChange = () => {
      const savedUserData = localStorage.getItem('userProfile')
      if (savedUserData) {
        const parsed = JSON.parse(savedUserData)
        setUserData(parsed)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Update input when voice transcript changes
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript)
    }
  }, [transcript])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px'
    }
  }, [inputValue])

  // Auto-send quick action prompt
  React.useEffect(() => {
    if (quickActionPrompt && onPromptSent) {
      setInputValue(quickActionPrompt)
      handleSendMessage()
      onPromptSent()
    }
  }, [quickActionPrompt, onPromptSent])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
      projectContext: lastMentionedProject || undefined
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)
    setLoadingMessage('Analyzing your request...')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          project_context: lastMentionedProject
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.response || 'I apologize, but I encountered an issue processing your request.',
        timestamp: new Date(),
        metadata: {
          type: data.intent || 'analysis',
          confidence: data.confidence || 0.8,
          sources: data.sources || []
        }
      }

      setMessages(prev => [...prev, assistantMessage])
      setShowAvatarAnimation(true)
      setTimeout(() => setShowAvatarAnimation(false), 2000)

    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I apologize, but I encountered an issue processing your request. Please try again.',
        timestamp: new Date(),
        metadata: {
          type: 'analysis',
          confidence: 0.1
        }
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
      setLoadingMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClearChat = () => {
    setMessages([{
      id: '1',
      type: 'assistant',
      content: `Hello ${userData.name}! 👋 I'm your AI Work Buddy, ready to help you with team insights, project analysis, and strategic recommendations. What would you like to explore today?`,
      timestamp: new Date(),
      metadata: {
        type: 'insight',
        confidence: 0.95
      }
    }])
  }

  // Export functions
  const handleExportPDF = async () => {
    try {
      const messagesForExport = messages.map(msg => ({
        sender: msg.type === 'user' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        timestamp: msg.timestamp,
        confidence: msg.metadata?.confidence,
        projectContext: msg.projectContext
      }))
      
      await exportChatAsPDF(messagesForExport, `work-buddy-chat-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (error) {
      console.error('Failed to export PDF:', error)
    }
  }

  const handleExportExcel = () => {
    try {
      const messagesForExport = messages.map(msg => ({
        sender: msg.type === 'user' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        timestamp: msg.timestamp,
        confidence: msg.metadata?.confidence,
        projectContext: msg.projectContext
      }))
      
      exportChatAsExcel(messagesForExport, `work-buddy-chat-${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Failed to export Excel:', error)
    }
  }

  // Voice control functions
  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening()
    } else {
      resetTranscript()
      startListening()
    }
  }

  const handleCopyMessage = async (messageId: string, content: string | object) => {
    try {
      const textContent = typeof content === 'string' ? content : JSON.stringify(content)
      await navigator.clipboard.writeText(textContent)
      setCopiedMessageId(messageId)
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedMessageId(null)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy message:', err)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = typeof content === 'string' ? content : JSON.stringify(content)
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      setCopiedMessageId(messageId)
      setTimeout(() => {
        setCopiedMessageId(null)
      }, 2000)
    }
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    if (confidence >= 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  }

  const getConfidenceText = (confidence?: number) => {
    if (!confidence) return 'Unknown'
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.6) return 'Medium'
    return 'Low'
  }

  return (
    <div className={`h-full flex flex-col ${theme === 'dark' ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100'}`}>
      {/* Modern Header */}
      <motion.div 
        className={`relative overflow-hidden ${theme === 'dark' ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur-xl border-b ${theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200/50'} shadow-lg`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-indigo-500/5" />
        
        <div className="relative px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left Section */}
            <div className="flex items-center space-x-4">
              <motion.div
                className="relative"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <div className={`w-12 h-12 rounded-2xl ${theme === 'dark' ? 'bg-gradient-to-br from-blue-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'} flex items-center justify-center shadow-lg`}>
                  <motion.div
                    animate={showAvatarAnimation ? { rotate: [0, 10, -10, 0] } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    <Bot className="w-6 h-6 text-white" />
                  </motion.div>
                </div>
                <motion.div
                  className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-slate-900"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.div>
              
              <div>
                <motion.h1 
                  className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Work Buddy
                </motion.h1>
                <motion.p 
                  className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  AI-powered work insights & analysis
                </motion.p>
              </div>
            </div>

            {/* Right Section - Actions */}
            <div className="flex items-center space-x-3">
              {/* Export Menu */}
              {messages.length > 1 && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className={`h-10 px-4 ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                  
                  <AnimatePresence>
                    {showExportMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className={`absolute right-0 top-full mt-2 w-48 ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-xl border ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'} backdrop-blur-xl z-50`}
                      >
                        <div className="p-2">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              handleExportPDF()
                              setShowExportMenu(false)
                            }}
                            className="w-full justify-start h-10"
                          >
                            <FileText className="w-4 h-4 mr-3 text-blue-500" />
                            Export as PDF
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              handleExportExcel()
                              setShowExportMenu(false)
                            }}
                            className="w-full justify-start h-10"
                          >
                            <FileSpreadsheet className="w-4 h-4 mr-3 text-green-500" />
                            Export as Excel
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Clear Chat */}
              {messages.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearChat}
                  className={`h-10 px-4 ${theme === 'dark' ? 'hover:bg-red-900/20 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-600 hover:text-red-700'}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}

              {/* Connection Status */}
              <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-100/50'}`}>
                <div className={`w-2 h-2 rounded-full ${hasActiveConnections ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {hasActiveConnections ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Messages Area */}
      <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    duration: 0.4,
                    delay: index * 0.1
                  }}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                    {/* Message Bubble */}
                    <motion.div
                      className={`relative p-4 rounded-2xl shadow-lg backdrop-blur-sm ${
                        message.type === 'user'
                          ? theme === 'dark'
                            ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                            : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                          : theme === 'dark'
                            ? 'bg-slate-800/80 border border-slate-700/50 text-slate-100'
                            : 'bg-white/80 border border-slate-200/50 text-slate-900'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Message Content */}
                      <div className="prose prose-sm max-w-none">
                        <p className={`whitespace-pre-wrap ${theme === 'dark' ? 'prose-invert' : ''}`}>
                          {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                        </p>
                      </div>

                      {/* Message Metadata */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center space-x-3">
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getConfidenceColor(message.metadata?.confidence)}`}
                          >
                            {getConfidenceText(message.metadata?.confidence)}
                          </Badge>
                          <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyMessage(message.id, message.content)}
                            className={`h-8 w-8 p-0 ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                          >
                            {copiedMessageId === message.id ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          
                          {message.type === 'assistant' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>

                    {/* User Avatar */}
                    {message.type === 'user' && (
                      <motion.div
                        className="flex items-center justify-end mt-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        <div className={`w-8 h-8 rounded-full ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} flex items-center justify-center`}>
                          <User className="w-4 h-4" />
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing Indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-slate-800/80 border border-slate-700/50' : 'bg-white/80 border border-slate-200/50'} shadow-lg backdrop-blur-sm`}>
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <motion.div
                        className="w-2 h-2 bg-blue-500 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      />
                      <motion.div
                        className="w-2 h-2 bg-blue-500 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      />
                      <motion.div
                        className="w-2 h-2 bg-blue-500 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      />
                    </div>
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      {loadingMessage}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Modern Input Area */}
      <motion.div
        className={`relative ${theme === 'dark' ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur-xl border-t ${theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200/50'} shadow-lg`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="p-6">
          <div className="flex items-end space-x-4">
            {/* Input Container */}
            <div className="flex-1 relative">
              <motion.div
                className="relative"
                whileFocus={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask Work Buddy anything about your team, projects, or work insights..."
                  className={`w-full py-4 px-6 rounded-2xl resize-none min-h-[56px] max-h-[140px] text-sm font-medium transition-all duration-300 backdrop-blur-xl border-2 shadow-xl ${
                    theme === 'dark' 
                      ? 'bg-slate-800/50 border-slate-600/60 text-white placeholder:text-slate-400 focus:border-blue-400/80 focus:outline-none focus:ring-4 focus:ring-blue-400/20' 
                      : 'bg-white/50 border-slate-200/80 text-slate-900 placeholder:text-slate-500 focus:border-blue-500/80 focus:outline-none focus:ring-4 focus:ring-blue-500/20'
                  }`}
                  disabled={isTyping}
                  rows={1}
                />
                
                {/* Animated Background */}
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-indigo-500/5 pointer-events-none"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              </motion.div>
            </div>

            {/* Voice Button */}
            {isSupported && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={handleVoiceToggle}
                  className={`h-14 w-14 rounded-2xl transition-all duration-300 backdrop-blur-xl border-2 shadow-xl ${
                    isListening
                      ? theme === 'dark'
                        ? 'bg-gradient-to-r from-red-500 to-pink-600 border-red-400/60 text-white hover:from-red-600 hover:to-pink-700 shadow-red-500/25'
                        : 'bg-gradient-to-r from-red-500 to-pink-600 border-red-400/60 text-white hover:from-red-600 hover:to-pink-700 shadow-red-500/25'
                      : theme === 'dark'
                        ? 'bg-slate-700/50 border-slate-600/60 text-slate-300 hover:bg-slate-600/50'
                        : 'bg-slate-200/50 border-slate-300/60 text-slate-600 hover:bg-slate-300/50'
                  }`}
                >
                  <motion.div
                    animate={isListening ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 1, repeat: isListening ? Infinity : 0 }}
                  >
                    {isListening ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </motion.div>
                </Button>
              </motion.div>
            )}

            {/* Send Button */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isTyping}
                className={`h-14 px-8 rounded-2xl font-semibold text-sm transition-all duration-300 backdrop-blur-xl border-2 shadow-xl ${
                  !inputValue.trim() || isTyping
                    ? theme === 'dark'
                      ? 'bg-slate-700/50 border-slate-600/50 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-200/50 border-slate-300/50 text-slate-400 cursor-not-allowed'
                    : theme === 'dark'
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 border-blue-400/60 text-white hover:from-blue-600 hover:to-purple-700 shadow-blue-500/25'
                      : 'bg-gradient-to-r from-blue-500 to-purple-600 border-blue-400/60 text-white hover:from-blue-600 hover:to-purple-700 shadow-blue-500/25'
                }`}
              >
                <motion.div
                  animate={isTyping ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ duration: 1, repeat: isTyping ? Infinity : 0 }}
                >
                  <Send className="w-5 h-5" />
                </motion.div>
              </Button>
            </motion.div>
          </div>

          {/* Input Footer */}
          <motion.div
            className="flex items-center justify-between mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              Press Enter to send, Shift+Enter for new line
            </div>
            
            {isSupported && (
              <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                {isListening ? 'Listening...' : 'Click mic to speak'}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}