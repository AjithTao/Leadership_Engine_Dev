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
import { useSettings } from '../../contexts/SettingsContext'
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
  BarChart3,
  Loader2,
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
  Volume2,
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

interface NewLeadershipCopilotProps {
  hasActiveConnections: boolean
  theme: 'light' | 'dark'
  quickActionPrompt?: string | null
  onPromptSent?: () => void
}

export function NewLeadershipCopilot({ 
  hasActiveConnections, 
  theme, 
  quickActionPrompt, 
  onPromptSent 
}: NewLeadershipCopilotProps) {
  const { currentTheme, isThemeLoaded, isDarkMode } = useTheme();
  const { settings, isLoaded } = useSettings();
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

  // Initialize welcome message with current user name
  useEffect(() => {
    if (isLoaded) {
      const userName = settings.userProfile.name
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
    }
  }, [isLoaded, settings.userProfile.name])

  // Update welcome message when user data changes
  useEffect(() => {
    if (isLoaded && messages.length > 0 && messages[0].type === 'assistant') {
      setMessages(prev => [{
        ...prev[0],
        content: `Hello ${settings.userProfile.name} 👋! I'm your AI Work Buddy. I can help you analyze team performance, provide strategic insights, and answer questions about your projects. What would you like to know?`
      }, ...prev.slice(1)])
    }
  }, [isLoaded, settings.userProfile.name])


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
    const userName = isLoaded ? settings.userProfile.name : "User"
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

  const handleExportExcel = async () => {
    try {
      const messagesForExport = messages.map(msg => ({
        sender: msg.type === 'user' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        timestamp: msg.timestamp,
        confidence: msg.metadata?.confidence,
        projectContext: msg.projectContext
      }))
      
      await exportChatAsExcel(messagesForExport, `work-buddy-chat-${new Date().toISOString().split('T')[0]}.xlsx`)
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
    <div className={`h-full flex flex-col transition-colors duration-300 ${
      isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Messages */}
      <div className="flex-1 min-h-0 relative">
        
        <ScrollArea className="h-full">
          <div className="p-6 space-y-4">
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center min-h-[60vh] px-8"
              >
                {/* New Avatar Design */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.8, type: "spring", stiffness: 200 }}
                  className="relative mb-8"
                >
                  {/* Main Avatar Circle */}
                  <div 
                    className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.accent}, ${currentTheme.colors.secondary})`
                    }}
                  >
                    {/* Inner Glow */}
                    <div className="absolute inset-2 bg-gradient-to-br from-white/20 to-transparent rounded-full"></div>
                    
                    {/* Avatar Icon */}
                    <div className="relative z-10">
                      <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <Bot className="w-8 h-8 text-white drop-shadow-lg" />
                      </div>
                    </div>
                    
                    {/* Floating Elements */}
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                    </div>
                    
                    {/* Orbiting Dots */}
                    <div className="absolute -inset-4">
                      <div 
                        className="w-2 h-2 rounded-full absolute top-0 left-1/2 transform -translate-x-1/2 animate-ping"
                        style={{ backgroundColor: currentTheme.colors.primary }}
                      ></div>
                      <div 
                        className="w-2 h-2 rounded-full absolute bottom-0 right-0 animate-ping" 
                        style={{ backgroundColor: currentTheme.colors.primary, animationDelay: '0.5s' }}
                      ></div>
                      <div 
                        className="w-2 h-2 rounded-full absolute top-1/2 left-0 animate-ping" 
                        style={{ backgroundColor: currentTheme.colors.primary, animationDelay: '1s' }}
                      ></div>
                    </div>
                  </div>
                </motion.div>

                {/* Welcome Content */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-center max-w-2xl"
                >
                  <h1 className={`text-4xl font-bold mb-4 transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}>
                    Welcome to{' '}
                    <span 
                      className="bg-clip-text text-transparent"
                      style={{
                        background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
                      }}
                    >
                      Work Buddy
                    </span>
                  </h1>
                  
                  <p className={`text-xl mb-6 transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Your intelligent AI assistant for work insights
                  </p>
                  
                  <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full transition-colors duration-300 ${
                    isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                  }`}>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium">Online & Ready to Help</span>
                  </div>
                </motion.div>

                {/* Quick Start Suggestions */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl"
                >
                  {[
                    { icon: BarChart3, text: "Analyze Team Performance", color: "primary" },
                    { icon: Users, text: "Get Project Insights", color: "secondary" },
                    { icon: Target, text: "Track Goals & KPIs", color: "accent" }
                  ].map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8 + index * 0.1 }}
                      className={`p-4 rounded-2xl transition-all duration-300 cursor-pointer hover:scale-105 relative overflow-hidden group ${
                        isDarkMode 
                          ? 'bg-gray-800/50 hover:bg-gray-700/50' 
                          : 'bg-white/50 hover:bg-white/80'
                      } backdrop-blur-sm border border-gray-200/20`}
                    >
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 relative z-10"
                        style={{
                          background: `linear-gradient(135deg, ${currentTheme.colors[item.color as keyof typeof currentTheme.colors]}, ${currentTheme.colors.secondary})`
                        }}
                      >
                        <item.icon className="w-6 h-6 text-white" />
                      </div>
                      <p className={`text-sm font-medium transition-colors duration-300 relative z-10 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>{item.text}</p>
                      {/* Hover Glow Effect */}
                      <div 
                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(90deg, ${currentTheme.colors[item.color as keyof typeof currentTheme.colors]}10, ${currentTheme.colors.secondary}10)`
                        }}
                      ></div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
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
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-8`}
                  >
                    <div className={`flex items-start space-x-4 max-w-[85%] ${
                      message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}>
                      {/* New Avatar Design */}
                      <div className={`flex-shrink-0 relative ${
                        message.type === 'user' ? 'w-14 h-14' : 'w-16 h-16'
                      }`}>
                        {message.type === 'user' ? (
                          <div 
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl relative overflow-hidden"
                            style={{
                              background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
                            }}
                          >
                            <div className="absolute inset-1 bg-gradient-to-br from-white/20 to-transparent rounded-xl"></div>
                            <User className="w-7 h-7 text-white drop-shadow-lg relative z-10" />
                          </div>
                        ) : (
                          <div 
                            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl relative overflow-hidden"
                            style={{
                              background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.accent}, ${currentTheme.colors.secondary})`
                            }}
                          >
                            <div className="absolute inset-2 bg-gradient-to-br from-white/20 to-transparent rounded-xl"></div>
                            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm relative z-10">
                              <Bot className="w-6 h-6 text-white drop-shadow-lg" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div 
                        className={`rounded-3xl p-6 shadow-xl border backdrop-blur-sm transition-all duration-300 hover:shadow-2xl relative overflow-hidden group ${
                          message.type === 'user'
                            ? 'text-white'
                            : isDarkMode
                              ? 'bg-gray-800/90 text-white border-gray-700/50'
                              : 'bg-white/95 text-black border-gray-200/50'
                        }`}
                        style={message.type === 'user' ? {
                          background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                          borderColor: currentTheme.colors.primary
                        } : {}}
                      >
                        {/* Message Bubble Hover Glow */}
                        <div 
                          className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          style={message.type === 'user' ? {
                            background: `linear-gradient(90deg, ${currentTheme.colors.primary}20, ${currentTheme.colors.secondary}20)`
                          } : {
                            background: 'linear-gradient(90deg, rgba(107, 114, 128, 0.05), rgba(75, 85, 99, 0.05))'
                          }}
                        ></div>
                      <div className="text-sm leading-relaxed whitespace-pre-line">
                        {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                      </div>
                      {message.metadata && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            {message.metadata.confidence && (
                              <div className="flex items-center space-x-2">
                                <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  message.metadata.confidence >= 0.9 
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : message.metadata.confidence >= 0.8
                                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                                    : 'bg-red-100 text-red-700 border border-red-200'
                                }`}>
                                  {Math.round(message.metadata.confidence * 100)}% Confidence
                                </div>
                              </div>
                            )}
                          </div>
                          {message.metadata.sources && (
                            <div className="text-xs text-gray-500 flex items-center space-x-1">
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
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 rounded-lg relative overflow-hidden group"
                              style={{
                                color: currentTheme.colors.success
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = `${currentTheme.colors.success}10`;
                                e.currentTarget.style.color = currentTheme.colors.success;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '';
                                e.currentTarget.style.color = currentTheme.colors.success;
                              }}
                            >
                              <ThumbsUp className="w-4 h-4 relative z-10" />
                              <div 
                                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{
                                  background: `linear-gradient(90deg, ${currentTheme.colors.success}20, ${currentTheme.colors.success}30)`
                                }}
                              ></div>
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 rounded-lg relative overflow-hidden group"
                              style={{
                                color: currentTheme.colors.error
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = `${currentTheme.colors.error}10`;
                                e.currentTarget.style.color = currentTheme.colors.error;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '';
                                e.currentTarget.style.color = currentTheme.colors.error;
                              }}
                            >
                              <ThumbsDown className="w-4 h-4 relative z-10" />
                              <div 
                                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{
                                  background: `linear-gradient(90deg, ${currentTheme.colors.error}20, ${currentTheme.colors.error}30)`
                                }}
                              ></div>
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={`h-8 w-8 p-0 rounded-lg relative overflow-hidden group ${
                                copiedMessageId === message.id 
                                  ? '' 
                                  : ''
                              }`}
                              style={{
                                color: copiedMessageId === message.id ? currentTheme.colors.success : currentTheme.colors.info,
                                backgroundColor: copiedMessageId === message.id ? `${currentTheme.colors.success}10` : ''
                              }}
                              onMouseEnter={(e) => {
                                if (copiedMessageId !== message.id) {
                                  e.currentTarget.style.backgroundColor = `${currentTheme.colors.info}10`;
                                  e.currentTarget.style.color = currentTheme.colors.info;
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (copiedMessageId !== message.id) {
                                  e.currentTarget.style.backgroundColor = '';
                                  e.currentTarget.style.color = currentTheme.colors.info;
                                }
                              }}
                              onClick={() => handleCopyMessage(message.id, message.content)}
                            >
                              {copiedMessageId === message.id ? (
                                <CheckCircle className="w-4 h-4 relative z-10" />
                              ) : (
                                <Copy className="w-4 h-4 relative z-10" />
                              )}
                              <div 
                                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{
                                  background: `linear-gradient(90deg, ${currentTheme.colors.info}20, ${currentTheme.colors.info}30)`
                                }}
                              ></div>
                            </Button>
                          </div>
                        )}
                        
                        {/* Export buttons for AI responses */}
                        {message.type === 'assistant' && (
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const messagesForExport = [{
                                  sender: 'assistant',
                                  content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                                  timestamp: message.timestamp,
                                  confidence: message.metadata?.confidence,
                                  projectContext: message.projectContext
                                }];
                                exportChatAsPDF(messagesForExport, `work-buddy-message-${message.id}.pdf`);
                              }}
                              className={`h-8 px-3 rounded-xl transition-all duration-300 relative overflow-hidden group ${
                                isDarkMode
                                  ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                              }`}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = currentTheme.colors.error;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = isDarkMode ? '#9CA3AF' : '#6B7280';
                              }}
                            >
                              <FileText className="w-4 h-4 mr-1 relative z-10" />
                              <span className="relative z-10">PDF</span>
                              <div 
                                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{
                                  background: `linear-gradient(90deg, ${currentTheme.colors.error}20, ${currentTheme.colors.error}30)`
                                }}
                              ></div>
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const messagesForExport = [{
                                  sender: 'assistant',
                                  content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                                  timestamp: message.timestamp,
                                  confidence: message.metadata?.confidence,
                                  projectContext: message.projectContext
                                }];
                                exportChatAsExcel(messagesForExport, `work-buddy-message-${message.id}.xlsx`);
                              }}
                              className={`h-8 px-3 rounded-xl transition-all duration-300 relative overflow-hidden group ${
                                isDarkMode
                                  ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                              }`}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = currentTheme.colors.success;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = isDarkMode ? '#9CA3AF' : '#6B7280';
                              }}
                            >
                              <FileSpreadsheet className="w-4 h-4 mr-1 relative z-10" />
                              <span className="relative z-10">Excel</span>
                              <div 
                                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{
                                  background: `linear-gradient(90deg, ${currentTheme.colors.success}20, ${currentTheme.colors.success}30)`
                                }}
                              ></div>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
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
                  <div className="flex items-start space-x-3 max-w-[85%]">
                    <div 
                      className="w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-2xl transition-colors duration-300 relative overflow-hidden"
                      style={{
                        backgroundColor: `${currentTheme.colors.primary}20`,
                        borderColor: `${currentTheme.colors.primary}40`
                      }}
                    >
                      <Lightbulb 
                        className="w-5 h-5 relative z-10" 
                        style={{ color: currentTheme.colors.primary }}
                      />
                      {/* Icon Glow Effect */}
                      <div 
                        className="absolute inset-0 rounded-2xl opacity-30"
                        style={{
                          background: `linear-gradient(135deg, ${currentTheme.colors.primary}30, ${currentTheme.colors.secondary}30)`
                        }}
                      ></div>
                    </div>
                    <div 
                      className="rounded-2xl p-5 shadow-lg border transition-colors duration-300 relative overflow-hidden"
                      style={{
                        backgroundColor: `${currentTheme.colors.primary}05`,
                        borderColor: `${currentTheme.colors.primary}20`,
                        borderRadius: '20px 20px 20px 8px' // Different shape with rounded corners
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex space-x-1">
                          <motion.div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: currentTheme.colors.primary }}
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                          />
                          <motion.div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: currentTheme.colors.primary }}
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                          />
                          <motion.div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: currentTheme.colors.primary }}
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                          />
                        </div>
                        <span 
                          className="text-sm font-medium transition-colors duration-300"
                          style={{ color: currentTheme.colors.primary }}
                        >{loadingMessage}</span>
                      </div>
                      {/* Enhanced Glow Effect */}
                      <div 
                        className="absolute inset-0 rounded-2xl opacity-20"
                        style={{
                          background: `linear-gradient(135deg, ${currentTheme.colors.primary}20, ${currentTheme.colors.secondary}20)`,
                          borderRadius: '20px 20px 20px 8px'
                        }}
                      ></div>
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
      <div className={`flex-shrink-0 p-8 border-t backdrop-blur-sm transition-colors duration-300 ${
        isDarkMode
          ? 'bg-gray-800/90 border-gray-700/50'
          : 'bg-white/95 border-gray-200/50'
      }`}>
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Work Buddy anything about your team, projects, or work insights..."
              className={`w-full py-5 px-6 rounded-3xl resize-none min-h-[70px] max-h-[180px] text-base font-medium transition-all duration-300 border-2 focus:outline-none shadow-xl ${
                isDarkMode
                  ? 'bg-gray-700/80 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-black placeholder-gray-500'
              }`}
              style={{
                '--tw-ring-color': `${currentTheme.colors.primary}20`,
                '--tw-border-color': currentTheme.colors.primary
              } as React.CSSProperties}
              onFocus={(e) => {
                e.target.style.borderColor = currentTheme.colors.primary;
                e.target.style.boxShadow = `0 0 0 4px ${currentTheme.colors.primary}20`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = isDarkMode ? '#4B5563' : '#D1D5DB';
                e.target.style.boxShadow = '';
              }}
              disabled={isTyping}
              rows={1}
            />
            {/* Input Glow Effect */}
            <div 
              className="absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, ${currentTheme.colors.primary}10, ${currentTheme.colors.secondary}10)`
              }}
            ></div>
          </div>
          
          {/* Clear Button - Only show when there are messages */}
          {messages.length > 1 && (
            <Button
              variant="outline"
              onClick={handleClearChat}
              className="h-[70px] w-[70px] rounded-3xl transition-all duration-300 shadow-xl hover:shadow-2xl relative overflow-hidden group"
              style={{
                borderColor: currentTheme.colors.error,
                color: currentTheme.colors.error,
                backgroundColor: `${currentTheme.colors.error}10`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${currentTheme.colors.error}20`;
                e.currentTarget.style.borderColor = currentTheme.colors.error;
                e.currentTarget.style.color = currentTheme.colors.error;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${currentTheme.colors.error}10`;
                e.currentTarget.style.borderColor = currentTheme.colors.error;
                e.currentTarget.style.color = currentTheme.colors.error;
              }}
            >
              <Trash2 className="w-5 h-5 relative z-10" />
              {/* Enhanced Glow Effect */}
              <div 
                className="absolute inset-0 rounded-3xl opacity-30 group-hover:opacity-60 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(90deg, ${currentTheme.colors.error}30, ${currentTheme.colors.error}50)`
                }}
              ></div>
            </Button>
          )}
          
          {/* Voice-to-text Button */}
          {isSupported && (
            <Button
              onClick={handleVoiceToggle}
              className="h-[70px] w-[70px] rounded-3xl transition-all duration-300 shadow-xl hover:shadow-2xl relative overflow-hidden group"
              style={{
                backgroundColor: isListening ? currentTheme.colors.error : `${currentTheme.colors.info}20`,
                color: isListening ? 'white' : currentTheme.colors.info,
                borderColor: isListening ? currentTheme.colors.error : currentTheme.colors.info
              }}
              onMouseEnter={(e) => {
                if (isListening) {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.error;
                } else {
                  e.currentTarget.style.backgroundColor = `${currentTheme.colors.info}30`;
                  e.currentTarget.style.color = currentTheme.colors.info;
                }
              }}
              onMouseLeave={(e) => {
                if (isListening) {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.error;
                } else {
                  e.currentTarget.style.backgroundColor = `${currentTheme.colors.info}20`;
                  e.currentTarget.style.color = currentTheme.colors.info;
                }
              }}
            >
              {isListening ? <Square className="w-5 h-5 relative z-10" /> : <Volume2 className="w-5 h-5 relative z-10" />}
              {/* Enhanced Glow Effect */}
              <div 
                className="absolute inset-0 rounded-3xl opacity-40 group-hover:opacity-70 transition-opacity duration-300"
                style={{
                  background: isListening 
                    ? `linear-gradient(90deg, ${currentTheme.colors.error}40, ${currentTheme.colors.error}60)`
                    : `linear-gradient(90deg, ${currentTheme.colors.info}30, ${currentTheme.colors.info}50)`
                }}
              ></div>
            </Button>
          )}
          
          {/* Enhanced Send Button */}
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className={`h-[70px] px-8 rounded-3xl font-semibold text-base transition-all duration-300 shadow-xl hover:shadow-2xl relative overflow-hidden group ${
              !inputValue.trim() || isTyping
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'text-white hover:scale-105 hover:shadow-2xl'
            }`}
            style={!inputValue.trim() || isTyping ? {} : {
              background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
            }}
          >
            {!inputValue.trim() || isTyping ? (
              <Loader2 className="w-5 h-5 animate-spin relative z-10" />
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2 relative z-10" />
                <span className="relative z-10">Send</span>
              </>
            )}
            {/* Button Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            {/* Enhanced Hover Glow */}
            <div 
              className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: `linear-gradient(90deg, ${currentTheme.colors.primary}30, ${currentTheme.colors.secondary}30)`
              }}
            ></div>
          </Button>
        </div>
      </div>
    </div>
  )
}
