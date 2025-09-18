'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { ScrollArea } from '../ui/scroll-area'
import { Badge } from '../ui/badge'
import { exportChatAsPDF, exportChatAsExcel, useVoiceToText } from '../../utils/exportUtils'
import { useTheme } from '../../contexts/ThemeContext'
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
  Square
} from 'lucide-react'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string | object  // Allow both string and object content
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
  const { currentTheme, isThemeLoaded } = useTheme();
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
        content: `Hello ${userName} 👋! I'm your AI Work Buddy. I can help you analyze team performance, provide strategic insights, and answer questions about your projects. What would you like to know?`,
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
        content: `Hello ${userData.name} 👋! I'm your AI Work Buddy. I can help you analyze team performance, provide strategic insights, and answer questions about your projects. What would you like to know?`
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

  // Auto-send message when voice transcript is complete and user stops speaking
  useEffect(() => {
    if (transcript && !isListening && inputValue.trim()) {
      // Small delay to allow user to see the transcript before auto-sending
      const timer = setTimeout(() => {
        if (inputValue.trim() === transcript.trim()) {
          handleSendMessage()
        }
      }, 2000) // Wait 2 seconds after stopping to speak
      
      return () => clearTimeout(timer)
    }
  }, [transcript, isListening, inputValue])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 100) + 'px'
    }
  }, [inputValue])

  // Function to detect project context from user input
  const detectProjectContext = (userInput: string, previousMessages: Message[]): string | null => {
    const input = userInput.toLowerCase()
    
    // Check for explicit project mentions
    const projectPatterns = [
      /ces-?\d+/i,
      /ccm-?\d+/i,
      /hcat-?\d+/i,
      /project\s+ces/i,
      /project\s+ccm/i,
      /project\s+hcat/i,
      /ces\s+project/i,
      /ccm\s+project/i,
      /hcat\s+project/i
    ]
    
    for (const pattern of projectPatterns) {
      const match = input.match(pattern)
      if (match) {
        const projectKey = match[0].toUpperCase().replace(/\s+/g, '')
        return projectKey
      }
    }
    
    // Check for "all" projects
    if (input.includes('all') || input.includes('every') || input.includes('combined')) {
      return 'ALL'
    }
    
    // Check for "this" or "that" - use last mentioned project
    if (input.includes('this') || input.includes('that') || input.includes('it')) {
      return lastMentionedProject
    }
    
    // Check previous messages for project context
    for (let i = previousMessages.length - 1; i >= 0; i--) {
      const msg = previousMessages[i]
      if (msg.type === 'user' && msg.projectContext) {
        return msg.projectContext
      }
    }
    
    return null
  }

  // Function to cache project details
  const cacheProjectDetails = async (projectKey: string) => {
    if (cachedProjects[projectKey]) {
      return cachedProjects[projectKey]
    }
    
    try {
      const response = await fetch('http://localhost:8000/api/jira/project-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectKey }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setCachedProjects(prev => ({
          ...prev,
          [projectKey]: data
        }))
        return data
      }
    } catch (error) {
      console.error('Error caching project details:', error)
    }
    
    return null
  }

  // Function to get project context for search
  const getProjectContextForSearch = (detectedProject: string | null): string => {
    if (detectedProject === 'ALL') {
      return 'all'
    } else if (detectedProject && detectedProject !== 'ALL') {
      return detectedProject
    } else if (lastMentionedProject) {
      return lastMentionedProject
    }
    return 'all'
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return

    // Detect project context
    const detectedProject = detectProjectContext(inputValue, messages)

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
      projectContext: detectedProject || undefined
    }

    // Update last mentioned project
    if (detectedProject && detectedProject !== 'ALL') {
      setLastMentionedProject(detectedProject)
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    
    // Reset voice state after sending message
    resetVoiceState()
    
    // Small delay to ensure user message appears first
    setTimeout(async () => {
    setIsTyping(true)
      setShowAvatarAnimation(true)
      
      // Set conversational loading messages
      const loadingMessages = [
        "I am thinking...",
        "Answering in few seconds",
        "Thanks for the Patience"
      ]
      
      // Cycle through loading messages
      let messageIndex = 0
      const messageInterval = setInterval(() => {
        setLoadingMessage(loadingMessages[messageIndex])
        messageIndex = (messageIndex + 1) % loadingMessages.length
      }, 1500)
      
      // Set initial message
      setLoadingMessage(loadingMessages[0])

      try {
        // Cache project details if needed
        if (detectedProject && detectedProject !== 'ALL') {
          await cacheProjectDetails(detectedProject)
        }

        const projectContextForSearch = getProjectContextForSearch(detectedProject)
        
      // Call the real backend API
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
            context: 'leadership_copilot',
            projectContext: projectContextForSearch,
            cachedProjects: cachedProjects,
            conversation_history: messages.slice(-5).map(msg => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            }))
        })
      })

      if (response.ok) {
        const data = await response.json()
          console.log('Backend response data:', data) // Debug logging
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
            content: typeof data.response === 'string' ? data.response : 
                     typeof data.message === 'string' ? data.message :
                     typeof data.response === 'object' && data.response.content ? data.response.content :
                     JSON.stringify(data.response) || 'I received your message but couldn\'t generate a response.',
          timestamp: new Date(),
            projectContext: detectedProject || undefined,
          metadata: {
              type: data.type || 'analysis',
              confidence: data.confidence || 0.9,
            sources: ['AI Engine', 'Jira Data']
          }
        }

        setMessages(prev => [...prev, assistantMessage])
      } else {
        throw new Error('Failed to get response from backend')
      }
    } catch (error) {
      console.error('Error calling backend API:', error)
      
      // Fallback to simulated response if backend is not available
      const responses = [
        {
          content: "I'm having trouble connecting to the backend API. Please make sure the backend server is running on port 8000. For now, here's a simulated response: Based on your team's current sprint data, I can see that velocity has increased by 12% compared to last sprint.",
          metadata: { type: 'analysis' as const, confidence: 0.88, sources: ['Simulated Data', 'Fallback Response'] }
        },
        {
          content: "Backend connection failed. Please check if the server is running. Simulated recommendation: Focus on the code review process to optimize your workflow.",
          metadata: { type: 'recommendation' as const, confidence: 0.92, sources: ['Fallback Response'] }
        }
      ]

      const randomResponse = responses[Math.floor(Math.random() * responses.length)]
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: randomResponse.content,
        timestamp: new Date(),
        metadata: randomResponse.metadata
      }

      setMessages(prev => [...prev, assistantMessage])
    } finally {
        clearInterval(messageInterval)
      setIsTyping(false)
        setLoadingMessage('')
        
        // Show "done" animation briefly
        setTimeout(() => {
          setShowAvatarAnimation(false)
        }, 1000)
      }
    }, 100)
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
      content: `Hello ${userData.name} 👋! I'm your AI Work Buddy. I can help you analyze team performance, provide strategic insights, and answer questions about your projects. What would you like to know?`,
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

  // Reset voice state after sending message
  const resetVoiceState = () => {
    if (isListening) {
      stopListening()
    }
    resetTranscript()
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

  // Auto-send quick action prompt
  React.useEffect(() => {
    if (quickActionPrompt && onPromptSent) {
      setInputValue(quickActionPrompt)
      // Small delay to ensure the input is set before sending
      setTimeout(() => {
        handleSendMessage()
        onPromptSent() // Clear the prompt after sending
      }, 100)
    }
  }, [quickActionPrompt, onPromptSent])

  const quickActions = [
    { icon: TrendingUp, label: "Performance", prompt: "Analyze our team's performance metrics for this sprint", subtext: "Track productivity trends" },
    { icon: Users, label: "Team Insights", prompt: "Provide insights about team collaboration and communication", subtext: "Understand team workload" },
    { icon: Target, label: "Goal Tracking", prompt: "How are we progressing towards our quarterly goals?", subtext: "Monitor OKRs & KPIs" },
    { icon: Calendar, label: "Sprint Planning", prompt: "Help me plan the next sprint based on current capacity", subtext: "Organize agile sprints" }
  ]

  return (
    <div 
      className="h-full flex flex-col transition-all duration-500 ease-in-out"
      style={{ backgroundColor: currentTheme?.colors?.background || '#ffffff' }}
    >
      {/* Compact Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex-shrink-0 p-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <motion.div
              className="relative p-3 rounded-2xl shadow-xl backdrop-blur-sm"
              style={{
                background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary}, ${currentTheme.colors.accent})`
              }}
              animate={{
                rotate: [0, 8, -8, 0],
                scale: [1, 1.08, 1]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                repeatDelay: 3,
                ease: "easeInOut"
              }}
              whileHover={{ 
                scale: 1.1,
                rotate: [0, 5, -5, 0],
                transition: { duration: 0.3 }
              }}
            >
              <motion.div
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <Command 
                className="w-4 h-4 relative z-10" 
                style={{ color: currentTheme.colors.background }}
              />
            </motion.div>
            <div className="space-y-1">
               <motion.h1 
                 className="text-xl font-bold"
                 style={{
                   color: currentTheme?.colors?.primary || '#3b82f6'
                 }}
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: 0.2, duration: 0.6 }}
               >
                 Work Buddy
               </motion.h1>
               <motion.p 
                 className="text-sm font-medium"
                 style={{ color: currentTheme.colors.textSecondary }}
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: 0.4, duration: 0.6 }}
               >
                 Your intelligent AI assistant for work insights
               </motion.p>
          </div>
        </div>

          {/* Clear Chat Button */}
          {messages.length > 1 && (
      <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearChat}
                className={`flex items-center space-x-2 px-3 py-2 h-8 text-xs font-medium transition-all duration-200 hover:scale-105 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 ${
                  theme === 'dark' 
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300' 
                    : 'bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700'
                }`}
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Trash2 className="w-3 h-3" />
                </motion.div>
                <span>Clear Chat</span>
              </Button>
            </motion.div>
          )}

          {/* Export Buttons */}
          {messages.length > 1 && (
              <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex space-x-2"
              >
                <Button
                variant="ghost"
                size="sm"
                onClick={handleExportPDF}
                className={`flex items-center space-x-2 px-3 py-2 h-8 text-xs font-medium transition-all duration-200 hover:scale-105 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 ${
                  theme === 'dark' 
                    ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300' 
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>PDF</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportExcel}
                className={`flex items-center space-x-2 px-3 py-2 h-8 text-xs font-medium transition-all duration-200 hover:scale-105 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 ${
                  theme === 'dark' 
                    ? 'bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300' 
                    : 'bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-700'
                }`}
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>Excel</span>
                </Button>
              </motion.div>
          )}
        </div>
      </motion.div>

      {/* Messages */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-3">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    duration: 0.5, 
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 100
                  }}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start space-x-3 max-w-[85%] ${
                    message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}>
                    <motion.div 
                      className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-full shadow-lg"
                      style={{
                        background: message.type === 'user' 
                          ? `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
                          : `linear-gradient(135deg, ${currentTheme.colors.secondary}, ${currentTheme.colors.accent})`,
                        color: currentTheme.colors.background
                      }}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      {message.type === 'user' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </motion.div>
                    <motion.div 
                      className="rounded-2xl p-4 transition-all duration-300 shadow-xl backdrop-blur-xl border"
                      style={{
                        background: message.type === 'user'
                          ? `linear-gradient(135deg, ${currentTheme.colors.primary}CC, ${currentTheme.colors.secondary}CC)`
                          : `linear-gradient(135deg, ${currentTheme.colors.surface}CC, ${currentTheme.colors.background}CC)`,
                        borderColor: message.type === 'user' 
                          ? `${currentTheme.colors.primary}40`
                          : `${currentTheme.colors.border}40`,
                        boxShadow: message.type === 'user'
                          ? `0 8px 25px ${currentTheme.colors.primary}30`
                          : `0 8px 25px ${currentTheme.colors.primary}20`,
                        color: message.type === 'user' 
                          ? currentTheme.colors.background 
                          : currentTheme.colors.text
                      }}
                      whileHover={{ 
                        scale: 1.02,
                        y: -2,
                        transition: { duration: 0.2 }
                      }}
                    >
                      <div 
                        className="text-sm leading-relaxed whitespace-pre-line"
                        style={{ 
                          color: message.type === 'user' 
                            ? currentTheme.colors.background 
                            : currentTheme.colors.text 
                        }}
                      >
                        {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                    </div>
                      {message.metadata && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            {message.metadata.confidence && (
                          <div className="flex items-center space-x-2">
                                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                  message.metadata.confidence >= 0.9 
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : message.metadata.confidence >= 0.8
                                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}>
                                  {Math.round(message.metadata.confidence * 100)}% Confidence
                                </div>
                              </div>
                            )}
                          </div>
                          {message.metadata.sources && (
                            <div className="text-xs text-[var(--text-muted)] flex items-center space-x-1">
                              <Database className="w-3 h-3" />
                              <span className="font-medium">Sources:</span> 
                              <span>{message.metadata.sources.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        {message.type === 'assistant' && (
                          <div className="flex items-center space-x-2">
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className={`h-9 w-9 p-0 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 ${
                                  theme === 'dark' 
                                    ? 'bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300' 
                                    : 'bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-700'
                                }`}
                              >
                                <motion.div
                                  animate={{ rotate: [0, 5, -5, 0] }}
                                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                </motion.div>
                            </Button>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className={`h-9 w-9 p-0 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 ${
                                  theme === 'dark' 
                                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300' 
                                    : 'bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700'
                                }`}
                              >
                                <motion.div
                                  animate={{ rotate: [0, -5, 5, 0] }}
                                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                </motion.div>
                            </Button>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className={`h-9 w-9 p-0 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 ${
                                  copiedMessageId === message.id 
                                    ? 'text-blue-500 bg-blue-500/10' 
                                    : theme === 'dark' 
                                      ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300' 
                                      : 'bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700'
                                }`}
                                onClick={() => handleCopyMessage(message.id, message.content)}
                              >
                                <motion.div
                                  animate={{ rotate: copiedMessageId === message.id ? [0, 360] : [0, 10, -10, 0] }}
                                  transition={{ duration: copiedMessageId === message.id ? 0.5 : 2, repeat: Infinity, repeatDelay: 4 }}
                                >
                                  {copiedMessageId === message.id ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </motion.div>
                            </Button>
                            </motion.div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing Indicator */}
            <AnimatePresence>
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex justify-start"
                >
                  <div className="flex items-start space-x-2 max-w-[85%]">
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                      <motion.div
                        className="w-6 h-6 flex items-center justify-center"
                        animate={showAvatarAnimation ? {
                          scale: [1, 1.1, 1],
                          boxShadow: [
                            "0 0 0px rgba(251, 191, 36, 0)",
                            "0 0 12px rgba(251, 191, 36, 0.8)",
                            "0 0 0px rgba(251, 191, 36, 0)"
                          ]
                        } : {
                          scale: [1.2, 1]
                        }}
                        transition={{
                          duration: 2,
                          repeat: showAvatarAnimation ? Infinity : 0,
                          ease: "easeInOut"
                        }}
                      >
                        <Lightbulb className="w-4 h-4 text-yellow-400" />
                      </motion.div>
                    </div>
                    <div className={`rounded-2xl p-4 transition-all duration-300 shadow-lg ${
                      theme === 'dark' 
                        ? 'bg-gradient-to-br from-slate-800/90 to-slate-700/90 border border-slate-600/30 backdrop-blur-sm shadow-slate-900/50'
                        : 'bg-gradient-to-br from-white to-gray-50/90 border border-gray-200/60 backdrop-blur-sm shadow-gray-200/50'
                    }`}>
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <motion.div
                            className="w-2 h-2 bg-yellow-400 rounded-full"
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                          />
                          <motion.div
                            className="w-2 h-2 bg-yellow-400 rounded-full"
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                          />
                          <motion.div
                            className="w-2 h-2 bg-yellow-400 rounded-full"
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                          />
                        </div>
                        <span className="text-sm text-[var(--text-muted)] font-medium">{loadingMessage}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Enhanced Input Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex-shrink-0 p-4"
      >
        <div className="flex items-end space-x-3">
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
                className="w-full py-4 px-5 rounded-2xl resize-none min-h-[52px] max-h-[140px] text-sm font-medium transition-all duration-300 backdrop-blur-xl border-2 shadow-xl focus:outline-none focus:ring-4"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.surface}CC, ${currentTheme.colors.background}CC)`,
                  borderColor: `${currentTheme.colors.border}80`,
                  color: currentTheme.colors.text,
                  boxShadow: `0 8px 25px ${currentTheme.colors.primary}20`
                }}
              disabled={isTyping}
                rows={1}
              />
              <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.primary}05, ${currentTheme.colors.secondary}05, ${currentTheme.colors.accent}05)`
                }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </motion.div>
          </div>
          
          {/* Voice-to-text Button */}
          {isSupported && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={handleVoiceToggle}
                className="h-[52px] w-[52px] rounded-2xl transition-all duration-300 backdrop-blur-xl border-2 shadow-xl"
                style={{
                  background: isListening
                    ? `linear-gradient(135deg, ${currentTheme.colors.error}, ${currentTheme.colors.accent})`
                    : `linear-gradient(135deg, ${currentTheme.colors.border}, ${currentTheme.colors.textSecondary})`,
                  borderColor: isListening 
                    ? `${currentTheme.colors.error}60`
                    : `${currentTheme.colors.border}60`,
                  color: currentTheme.colors.background,
                  boxShadow: isListening
                    ? `0 8px 25px ${currentTheme.colors.error}30`
                    : `0 8px 25px ${currentTheme.colors.primary}20`
                }}
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
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isTyping}
              className="h-[52px] px-6 rounded-2xl font-semibold text-sm transition-all duration-300 backdrop-blur-xl border-2 shadow-xl"
              style={{
                background: !inputValue.trim() || isTyping
                  ? `${currentTheme.colors.border}50`
                  : `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                borderColor: !inputValue.trim() || isTyping
                  ? `${currentTheme.colors.border}50`
                  : `${currentTheme.colors.primary}60`,
                color: !inputValue.trim() || isTyping
                  ? currentTheme.colors.textSecondary
                  : currentTheme.colors.background,
                boxShadow: !inputValue.trim() || isTyping
                  ? `0 8px 25px ${currentTheme.colors.border}20`
                  : `0 8px 25px ${currentTheme.colors.primary}30`,
                cursor: !inputValue.trim() || isTyping ? 'not-allowed' : 'pointer'
              }}
            >
              <motion.div
                animate={isTyping ? { rotate: 360 } : { rotate: 0 }}
                transition={{ duration: 1, repeat: isTyping ? Infinity : 0 }}
              >
                <Zap className="w-4 h-4 mr-2" />
              </motion.div>
              Send
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
