"use client"

import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { 
  Crown, 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { getApiUrl } from '../../lib/api-config'

interface ServiceAccountConfig {
  email: string
  token: string
  url: string
}

interface LeadershipStatus {
  success: boolean
  leadership_access_available: boolean
  shared_service_account: boolean
  cached_data_available: boolean
  cache_valid: boolean
  last_cache_update: string | null
  message: string
}

export function SimpleFalconXConnect() {
  const [status, setStatus] = useState<LeadershipStatus | null>(null)
  const [config, setConfig] = useState<ServiceAccountConfig>({
    email: '',
    token: '',
    url: ''
  })
  const [loading, setLoading] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [savedConfig, setSavedConfig] = useState<ServiceAccountConfig | null>(null)
  const [connectionResult, setConnectionResult] = useState<string | null>(null)

  // Load saved configuration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('leadership_config')
    if (saved) {
      try {
        const parsedConfig = JSON.parse(saved)
        setSavedConfig(parsedConfig)
        setConfig(parsedConfig)
      } catch (error) {
        console.error('Failed to load saved config:', error)
      }
    }
  }, [])

  // Check current status
  const checkStatus = async () => {
    try {
      const response = await fetch(getApiUrl('/api/leadership/status'))
      const data = await response.json()
      setStatus(data)
      return data
    } catch (error) {
      console.error('Failed to check leadership status:', error)
      return null
    }
  }

  // Save configuration to localStorage and backend
  const saveConfiguration = async () => {
    try {
      // Save to localStorage
      localStorage.setItem('leadership_config', JSON.stringify(config))
      setSavedConfig(config)
      
      // Note: In a real app, you'd send this to backend to update config.env
      // For now, we'll show instructions to update backend/config.env
      return true
    } catch (error) {
      console.error('Failed to save configuration:', error)
      return false
    }
  }

  // One-click connect
  const handleConnect = async () => {
    try {
      setLoading(true)
      setConnectionResult(null)
      
      // Check if we have saved configuration
      if (!savedConfig || !savedConfig.email || !savedConfig.token || !savedConfig.url) {
        setConnectionResult("❌ No saved connection details found. Please enter connection details first.")
        setShowManualEntry(true)
        return
      }
      
      // Try to connect using saved configuration
      const response = await fetch(getApiUrl('/api/leadership/enable'), {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        setConnectionResult(`✅ Connected successfully! Cached ${data.cached_projects || 0} projects for leadership access.`)
        await checkStatus()
      } else {
        setConnectionResult(`❌ Connection failed: ${data.error}. Please check your connection details.`)
        setShowManualEntry(true)
      }
    } catch (error) {
      setConnectionResult(`❌ Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      if (!config.email || !config.token || !config.url) {
        setConnectionResult("❌ Please fill in all connection details.")
        return
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

  const getStatusBadge = () => {
    if (!status) return null

    if (status.shared_service_account) {
      return (
        <Badge variant="default" className="bg-[var(--status-success-bg)] dark:bg-green-900 text-[var(--status-success)] dark:text-green-200 border-[color-mix(in_srgb,var(--success)_30%,transparent)] dark:border-green-700">
          <Shield className="w-3 h-3 mr-1" />
          Connected
        </Badge>
      )
    } else if (status.cached_data_available) {
      return (
        <Badge variant="secondary" className="bg-[var(--accent-cool-bg)] dark:bg-blue-900 text-[var(--accent-cool-text)] dark:text-blue-200 border-[color-mix(in_srgb,var(--accent-cool)_30%,transparent)] dark:border-blue-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          Cached Data
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="bg-[var(--bg-surface)] dark:bg-gray-800 text-[var(--text-muted)] dark:text-gray-300 border-[var(--border)] dark:border-gray-600">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Not Connected
        </Badge>
      )
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-[var(--accent-indigo)] dark:text-purple-600" />
            <CardTitle>Leadership Access</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          One-click connection for executive insights without individual Jira tokens
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Connect Button */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleConnect}
            disabled={loading}
            size="lg"
            className="fx-pill flex items-center gap-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--accent-cool-hover)] text-[var(--btn-primary-fg)] dark:bg-purple-600 dark:hover:bg-purple-700 dark:text-white"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {loading ? 'Connecting...' : 'Connect Leadership Access'}
          </Button>

          {/* Manual Entry Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Enter Connection Details
            {showManualEntry ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {/* Connection Status */}
        {savedConfig && (
          <Alert className="border-[color-mix(in_srgb,var(--accent-cool)_30%,transparent)] dark:border-blue-800 bg-[var(--accent-cool-bg)] dark:bg-blue-900/20">
            <CheckCircle className="h-4 w-4 text-[var(--accent-cool-text)] dark:text-blue-400" />
            <AlertTitle className="text-[var(--accent-cool-text)] dark:text-blue-200">Saved Configuration Found</AlertTitle>
            <AlertDescription className="text-[var(--accent-cool-text)] dark:text-blue-300">
              Ready to connect with: {savedConfig.email} → {savedConfig.url}
            </AlertDescription>
          </Alert>
        )}

        {/* Connection Result */}
        {connectionResult && (
          <Alert className={connectionResult.startsWith('✅') ?
            "border-[color-mix(in_srgb,var(--success)_30%,transparent)] dark:border-green-800 bg-[var(--status-success-bg)] dark:bg-green-900/20" :
            "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] dark:border-red-800 bg-[var(--status-danger-bg)] dark:bg-red-900/20"
          }>
            <AlertDescription className={connectionResult.startsWith('✅') ?
              "text-[var(--status-success)] dark:text-green-300" :
              "text-[var(--status-danger)] dark:text-red-300"
            }>
              {connectionResult}
            </AlertDescription>
          </Alert>
        )}

        {/* Manual Entry Form */}
        {showManualEntry && (
          <div className="space-y-4 border-t border-[var(--border)] dark:border-gray-700 pt-4">
            <h4 className="font-medium text-sm text-[var(--text-primary)] dark:text-gray-300">Connection Details</h4>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="service-email" className="text-xs text-[var(--text-secondary)] dark:text-gray-400">Service Account Email</Label>
                <Input
                  id="service-email"
                  type="email"
                  placeholder="service-leadership@company.com"
                  value={config.email}
                  onChange={(e) => setConfig(prev => ({ ...prev, email: e.target.value }))}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="service-token" className="text-xs text-[var(--text-secondary)] dark:text-gray-400">API Token</Label>
                <div className="relative">
                  <Input
                    id="service-token"
                    type={showToken ? "text" : "password"}
                    placeholder="your-service-account-api-token"
                    value={config.token}
                    onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
                    className="text-sm pr-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-3 w-3 text-[var(--text-muted)] dark:text-gray-500" />
                    ) : (
                      <Eye className="h-3 w-3 text-[var(--text-muted)] dark:text-gray-500" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="service-url" className="text-xs text-[var(--text-secondary)] dark:text-gray-400">Jira URL</Label>
                <Input
                  id="service-url"
                  type="url"
                  placeholder="https://company.atlassian.net"
                  value={config.url}
                  onChange={(e) => setConfig(prev => ({ ...prev, url: e.target.value }))}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveAndConnect}
                disabled={loading}
                className="fx-pill flex items-center gap-2"
              >
                {loading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )}
                Save & Connect
              </Button>
              
              <Button
                variant="outline"
                onClick={() => setShowManualEntry(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>

            {/* Backend Configuration Note */}
            {savedConfig && (
              <Alert className="border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] dark:border-orange-800 bg-[var(--status-warning-bg)] dark:bg-orange-900/20">
                <Settings className="h-4 w-4 text-[var(--status-warning)] dark:text-orange-400" />
                <AlertTitle className="text-[var(--status-warning)] dark:text-orange-200">Backend Configuration Required</AlertTitle>
                <AlertDescription className="space-y-2 text-[var(--status-warning)] dark:text-orange-300">
                  <p>Add these to your <code className="bg-[var(--bg-surface)] dark:bg-gray-800 px-1 rounded text-xs">backend/config.env</code> file:</p>
                  <div className="bg-[var(--bg-surface)] dark:bg-gray-800 p-2 rounded text-xs font-mono text-[var(--text-primary)] dark:text-gray-200">
                    JIRA_SHARED_EMAIL={config.email}<br/>
                    JIRA_SHARED_TOKEN={config.token}<br/>
                    JIRA_SHARED_URL={config.url}
                  </div>
                  <p className="text-xs">Then restart your backend server.</p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Quick Status */}
        {status && (
          <div className="text-xs text-[var(--text-secondary)] dark:text-gray-400 border-t border-[var(--border)] dark:border-gray-700 pt-3">
            <div className="flex justify-between items-center">
              <span>Status:</span>
              <span className="font-medium">{status.message}</span>
            </div>
            {status.last_cache_update && (
              <div className="flex justify-between items-center mt-1">
                <span>Last Updated:</span>
                <span>{new Date(status.last_cache_update).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
