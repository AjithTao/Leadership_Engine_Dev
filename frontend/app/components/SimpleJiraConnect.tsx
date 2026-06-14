"use client"

import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { 
  Database, 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  ChevronDown,
  ChevronUp,
  User
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { useTheme } from '../contexts/ThemeContext'
import { getApiUrl } from '../../lib/api-config'

interface JiraConfig {
  url: string
  email: string
  apiToken: string
  boardId?: string
}

interface JiraStatus {
  success: boolean
  configured: boolean
  message: string
  projects?: number
  currentSprint?: string
}

export function SimpleJiraConnect() {
  const { userDetails } = useUser()
  const { currentTheme, isDarkMode } = useTheme()
  const [status, setStatus] = useState<JiraStatus | null>(null)
  const [config, setConfig] = useState<JiraConfig>({
    url: '',
    email: userDetails.email,
    apiToken: userDetails.apiToken,
    boardId: ''
  })
  const [loading, setLoading] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [savedConfig, setSavedConfig] = useState<JiraConfig | null>(null)
  const [connectionResult, setConnectionResult] = useState<string | null>(null)

  // Load saved configuration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('jira_config')
    if (saved) {
      try {
        const parsedConfig = JSON.parse(saved)
        setSavedConfig(parsedConfig)
        setConfig(parsedConfig)
      } catch (error) {
        console.error('Failed to load saved Jira config:', error)
      }
    }
  }, [])

  // Check current status
  const checkStatus = async () => {
    try {
      const response = await fetch(getApiUrl('/api/jira/status'))
      const data = await response.json()
      setStatus(data)
      return data
    } catch (error) {
      console.error('Failed to check Jira status:', error)
      setStatus({
        success: false,
        configured: false,
        message: 'Failed to check status'
      })
      return null
    }
  }

  // Save configuration to localStorage
  const saveConfiguration = async () => {
    try {
      // Save to localStorage
      localStorage.setItem('jira_config', JSON.stringify(config))
      setSavedConfig(config)
      return true
    } catch (error) {
      console.error('Failed to save Jira configuration:', error)
      return false
    }
  }

  // Remove stale saved credentials so Connect can't replay them
  const clearSavedDetails = () => {
    localStorage.removeItem('jira_config')
    setSavedConfig(null)
    setConfig({ url: '', email: '', apiToken: '', boardId: '' })
    setConnectionResult('✅ Saved connection details cleared.')
  }

  // One-click connect
  const handleConnect = async () => {
    try {
      setLoading(true)
      setConnectionResult(null)
      
      // Check if we have saved configuration
      if (!savedConfig || !savedConfig.url || !savedConfig.email || !savedConfig.apiToken) {
        setConnectionResult("❌ No saved connection details found. Please enter connection details first.")
        setShowManualEntry(true)
        return
      }
      
      // Try to connect using saved configuration
      const response = await fetch(getApiUrl('/api/jira/configure'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: savedConfig.url,
          email: savedConfig.email,
          api_token: savedConfig.apiToken,
          board_id: savedConfig.boardId || ''
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setConnectionResult(`✅ Connected successfully! Found ${data.projects || 0} projects. ${data.current_sprint ? `Current sprint: ${data.current_sprint}` : ''}`)
        await checkStatus()
      } else {
        const rawErr = typeof data.detail === 'string'
          ? data.detail
          : (data.details || data.error || data.message || `HTTP ${response.status}`)
        setConnectionResult(`❌ Connection failed: ${String(rawErr).slice(0, 180)}. Please check your connection details.`)
        setShowManualEntry(true)
      }
    } catch (error) {
      console.error('Connection error:', error)
      // Handle JSON parsing errors
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        setConnectionResult("❌ Server returned invalid response. Please check if the backend server is running.")
      } else {
        setConnectionResult(`❌ Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
      setShowManualEntry(true)
    } finally {
      setLoading(false)
    }
  }

  // Save and connect with manual details
  const handleSaveAndConnect = async () => {
    try {
      setLoading(true)
      setConnectionResult(null)
      
      // Validate inputs
      if (!config.url || !config.email || !config.apiToken) {
        setConnectionResult("❌ Please fill in URL, email, and API token.")
        return
      }
      
              // Accept any valid URL; add https:// if missing
              if (config.url && !config.url.startsWith('http://') && !config.url.startsWith('https://')) {
                setConfig(prev => ({ ...prev, url: `https://${config.url}` }))
              }
      
      // Save configuration
      const saved = await saveConfiguration()
      if (!saved) {
        setConnectionResult("❌ Failed to save configuration.")
        return
      }
      
      setConnectionResult("✅ Configuration saved! Now attempting connection...")
      
      // Wait a moment then try to connect
      setTimeout(async () => {
        await handleConnect()
        setShowManualEntry(false)
      }, 1000)
      
    } catch (error) {
      setConnectionResult(`❌ Save error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Initial status check
  useEffect(() => {
    checkStatus()
  }, [])

  return (
    <Card className="h-full shadow-lg border-0 bg-gradient-to-br from-white/80 to-blue-50/50 dark:from-gray-800 dark:to-blue-900/20 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'rgba(212,168,71,0.15)' }}>
              <Database className="w-6 h-6" style={{ color: '#D4A847' }} />
            </div>
            <div>
              <CardTitle className="text-xl" style={{ color: currentTheme.colors.text }}>Jira Integration</CardTitle>
              <p className="text-sm mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                Connect to your Jira instance for project management insights
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Connect Button */}
        <div className="flex items-center gap-3">
          {status?.configured ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#22C55E' }} />
              <span className="text-sm font-semibold" style={{ color: '#22C55E' }}>Connected</span>
            </div>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={loading}
              size="lg"
              className="flex items-center gap-2 hover:opacity-90 transition-all duration-200"
              style={{ backgroundColor: '#D4A847', color: '#13151C' }}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? 'Connecting...' : 'Connect to Jira'}
            </Button>
          )}
        </div>


        {/* Connection Result */}
        {connectionResult && (
          <Alert className={connectionResult.startsWith('✅') ? 
            "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20" : 
            "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
          }>
            <AlertDescription className={connectionResult.startsWith('✅') ? 
              "text-green-700 dark:text-green-300" : 
              "text-red-700 dark:text-red-300"
            }>
              {connectionResult}
            </AlertDescription>
          </Alert>
        )}


      </CardContent>
    </Card>
  )
}
