"use client"

import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import {
  Github,
  CheckCircle,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  ChevronDown,
  ChevronUp,
  KeyRound
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getApiUrl } from '../../lib/api-config'

interface GithubConfig {
  apiToken: string
  email: string
}

interface GithubStatus {
  connected: boolean
  user?: string
  email?: string
  error?: string
  config?: {
    org?: string
    base_url?: string
  }
}

export function SimpleGithubConnect() {
  const { currentTheme } = useTheme()
  const [status, setStatus] = useState<GithubStatus | null>(null)
  const [config, setConfig] = useState<GithubConfig>({
    apiToken: '',
    email: ''
  })
  const [loading, setLoading] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [savedConfig, setSavedConfig] = useState<GithubConfig | null>(null)
  const [connectionResult, setConnectionResult] = useState<string | null>(null)

  // Load saved configuration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('github_config')
    if (saved) {
      try {
        const parsedConfig = JSON.parse(saved)
        setSavedConfig(parsedConfig)
        setConfig(parsedConfig)
      } catch (error) {
        console.error('Failed to load saved GitHub config:', error)
      }
    }
  }, [])

  // Check current status
  const checkStatus = async () => {
    try {
      const response = await fetch(getApiUrl('/api/github/status'))
      const data = await response.json()
      setStatus(data)
      return data
    } catch (error) {
      console.error('Failed to check GitHub status:', error)
      setStatus({
        connected: false,
        error: 'Failed to check status'
      })
      return null
    }
  }

  // Save configuration to localStorage
  const saveConfiguration = async () => {
    try {
      localStorage.setItem('github_config', JSON.stringify(config))
      setSavedConfig(config)
      return true
    } catch (error) {
      console.error('Failed to save GitHub configuration:', error)
      return false
    }
  }

  // Remove stale saved credentials so Connect can't replay them
  const clearSavedDetails = () => {
    localStorage.removeItem('github_config')
    setSavedConfig(null)
    setConfig({ apiToken: '', email: '' })
    setConnectionResult('✅ Saved connection details cleared.')
  }

  // One-click connect
  const handleConnect = async () => {
    try {
      setLoading(true)
      setConnectionResult(null)

      if (!savedConfig || !savedConfig.apiToken) {
        setConnectionResult("❌ No saved connection details found. Please enter connection details first.")
        setShowManualEntry(true)
        return
      }

      const response = await fetch(getApiUrl('/api/github/configure'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_token: savedConfig.apiToken,
          email: savedConfig.email || ''
        }),
      })

      const data = await response.json()

      if (data.success) {
        const user = data.data?.user
        setConnectionResult(`✅ Connected successfully!${user ? ` Authenticated as ${user}.` : ''}`)
        await checkStatus()
      } else {
        const rawErr = typeof data.detail === 'string'
          ? data.detail
          : (data.details || data.error || data.message || `HTTP ${response.status}`)
        setConnectionResult(`❌ Connection failed: ${String(rawErr).slice(0, 180)}. Please check your token.`)
        setShowManualEntry(true)
      }
    } catch (error) {
      console.error('Connection error:', error)
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

      if (!config.apiToken) {
        setConnectionResult("❌ Please enter your personal access token.")
        return
      }

      const saved = await saveConfiguration()
      if (!saved) {
        setConnectionResult("❌ Failed to save configuration.")
        return
      }

      setConnectionResult("✅ Configuration saved! Now attempting connection...")

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
    <Card className="h-full shadow-lg border-0 bg-gradient-to-br from-white/80 to-slate-50/50 dark:from-gray-800 dark:to-slate-900/20 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'rgba(212,168,71,0.15)' }}>
              <Github className="w-6 h-6" style={{ color: '#D4A847' }} />
            </div>
            <div>
              <CardTitle className="text-xl" style={{ color: currentTheme.colors.text }}>GitHub Integration</CardTitle>
              <p className="text-sm mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                Connect to GitHub for repository, PR, and CI/CD insights
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main Connect Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button
            onClick={handleConnect}
            disabled={loading}
            size="lg"
            className="flex items-center gap-2 shadow-lg hover:shadow-xl hover:opacity-90 transition-all duration-200 transform hover:scale-105"
            style={{ backgroundColor: '#D4A847', color: '#13151C' }}
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {loading ? 'Connecting...' : 'Connect to GitHub'}
          </Button>

          {/* Manual Entry Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="flex items-center gap-2 transition-all duration-200"
            style={{
              borderColor: currentTheme.colors.border,
              color: currentTheme.colors.text,
              backgroundColor: 'transparent'
            }}
          >
            <Settings className="w-4 h-4" />
            Enter Connection Details
            {showManualEntry ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
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

        {/* Manual Entry Form */}
        {showManualEntry && (
          <div className="space-y-4 border-t pt-4" style={{ borderColor: currentTheme.colors.border }}>
            <h4 className="font-medium text-sm" style={{ color: currentTheme.colors.text }}>GitHub Connection Details</h4>

            {/* Saved Configuration Display */}
            {savedConfig && savedConfig.apiToken && (
              <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-1 bg-green-100 dark:bg-green-900/40 rounded-full">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-green-800 dark:text-green-200 mb-1 text-sm">Saved Configuration Found</h5>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Personal access token saved{savedConfig.email ? <> for: <span className="font-medium">{savedConfig.email}</span></> : ''}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="github-token" className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>Personal Access Token</Label>
                <div className="relative">
                  <Input
                    id="github-token"
                    type={showToken ? "text" : "password"}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={config.apiToken}
                    onChange={(e) => setConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                    className="text-sm pr-8 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <Eye className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="github-email" className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>Email (Optional)</Label>
                <Input
                  id="github-email"
                  type="email"
                  placeholder="your.email@company.com"
                  value={config.email}
                  onChange={(e) => setConfig(prev => ({ ...prev, email: e.target.value }))}
                  className="text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveAndConnect}
                disabled={loading}
                className="flex items-center gap-2"
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

              {savedConfig && savedConfig.apiToken && (
                <Button
                  variant="outline"
                  onClick={clearSavedDetails}
                  disabled={loading}
                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                >
                  Clear Saved Details
                </Button>
              )}
            </div>

            {/* Help Information */}
            <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">How to create a token</AlertTitle>
              <AlertDescription className="space-y-2 text-xs text-blue-700 dark:text-blue-300">
                <p>Go to GitHub → <strong>Settings → Developer settings → Personal access tokens</strong> and generate a token.</p>
                <p>Grant read access to <strong>repositories, pull requests, and actions</strong> so FalconX can build insights.</p>
              </AlertDescription>
            </Alert>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
