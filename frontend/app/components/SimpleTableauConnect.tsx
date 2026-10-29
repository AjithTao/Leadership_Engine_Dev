"use client"

import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import {
  BarChart3,
  CheckCircle,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Unplug
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getApiUrl } from '../../lib/api-config'

// Non-secret fields only — the PAT secret is deliberately never persisted
// in localStorage; it lives encrypted in the backend's .env or is entered
// fresh here and held in memory for the one configure call.
interface TableauConfig {
  serverUrl: string
  siteId: string
  patName: string
}

interface TableauStatus {
  configured: boolean
  config?: {
    server_url?: string
    site?: string
  } | null
}

export function SimpleTableauConnect() {
  const { currentTheme, isDarkMode } = useTheme()
  const [status, setStatus] = useState<TableauStatus | null>(null)
  const [config, setConfig] = useState<TableauConfig>({
    serverUrl: '',
    siteId: '',
    patName: ''
  })
  const [patSecret, setPatSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [connectionResult, setConnectionResult] = useState<string | null>(null)

  // Load saved (non-secret) configuration
  useEffect(() => {
    const saved = localStorage.getItem('tableau_config')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setConfig({
          serverUrl: parsed.serverUrl || '',
          siteId: parsed.siteId || '',
          patName: parsed.patName || ''
        })
      } catch (error) {
        console.error('Failed to load saved Tableau config:', error)
      }
    }
  }, [])

  const checkStatus = async () => {
    try {
      const response = await fetch(getApiUrl('/api/tableau/status'))
      const data = await response.json()
      setStatus(data)
      return data
    } catch (error) {
      console.error('Failed to check Tableau status:', error)
      setStatus({ configured: false })
      return null
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  const handleSaveAndConnect = async () => {
    try {
      setLoading(true)
      setConnectionResult(null)

      if (!config.serverUrl || !config.patName || !patSecret) {
        setConnectionResult('❌ Please enter the server URL, token name, and token secret.')
        return
      }

      // Persist only non-secret fields
      localStorage.setItem('tableau_config', JSON.stringify(config))

      const response = await fetch(getApiUrl('/api/tableau/configure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_url: config.serverUrl,
          site_id: config.siteId,
          pat_name: config.patName,
          pat_secret: patSecret
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setConnectionResult(
          `✅ Connected to site '${data.config?.site || 'default'}'. ${data.views?.toLocaleString?.() || data.views || 0} views visible.`
        )
        setPatSecret('')
        setShowManualEntry(false)
        await checkStatus()
        window.dispatchEvent(new CustomEvent('integration-update'))
      } else {
        const rawErr = typeof data.detail === 'string'
          ? data.detail
          : (data.details || data.error || data.message || `HTTP ${response.status}`)
        setConnectionResult(`❌ Connection failed: ${String(rawErr).slice(0, 180)}`)
      }
    } catch (error) {
      console.error('Tableau connection error:', error)
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        setConnectionResult('❌ Server returned invalid response. Please check if the backend server is running.')
      } else {
        setConnectionResult(`❌ Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setLoading(true)
      setConnectionResult(null)
      const response = await fetch(getApiUrl('/api/tableau/disconnect'), { method: 'POST' })
      const data = await response.json()
      if (data.success) {
        setConnectionResult('✅ Tableau disconnected.')
        await checkStatus()
        window.dispatchEvent(new CustomEvent('integration-update'))
      } else {
        setConnectionResult('❌ Disconnect failed.')
      }
    } catch (error) {
      setConnectionResult(`❌ Disconnect error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="h-full shadow-lg border-0 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-card)] dark:from-gray-800 dark:to-slate-900/20 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: isDarkMode ? 'rgba(212,168,71,0.15)' : 'var(--accent-cool-bg)' }}>
              <BarChart3 className="w-6 h-6" style={{ color: isDarkMode ? '#D4A847' : 'var(--accent-cool)' }} />
            </div>
            <div>
              <CardTitle className="text-xl" style={{ color: currentTheme.colors.text }}>Tableau Integration</CardTitle>
              <p className="text-sm mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                Connect to Tableau Server for executive dashboards and BI insights
              </p>
            </div>
          </div>
          {status?.configured && (
            <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ color: 'var(--accent-cool-text)', background: 'var(--accent-cool-bg)' }}>
              <CheckCircle className="w-3.5 h-3.5" />
              Connected
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connected summary */}
        {status?.configured && status.config && (
          <div className="p-3 rounded-lg text-sm" style={{ border: '1px solid var(--border)', color: currentTheme.colors.textSecondary }}>
            <div><span className="font-medium" style={{ color: currentTheme.colors.text }}>Server:</span> {status.config.server_url}</div>
            <div><span className="font-medium" style={{ color: currentTheme.colors.text }}>Site:</span> {status.config.site}</div>
            <p className="text-xs mt-2" style={{ color: currentTheme.colors.textSecondary }}>
              Tableau connects automatically at login using the service credentials in the backend.
              Use the form below only to switch to different credentials.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button
            onClick={() => setShowManualEntry(!showManualEntry)}
            size="lg"
            className="fx-pill flex items-center gap-2 shadow-lg hover:shadow-xl hover:opacity-90 transition-all duration-200 transform hover:scale-105"
            style={{ backgroundColor: isDarkMode ? '#D4A847' : 'var(--btn-primary-bg)', color: isDarkMode ? '#13151C' : 'var(--btn-primary-fg)' }}
          >
            <Settings className="w-4 h-4" />
            {status?.configured ? 'Reconfigure Connection' : 'Enter Connection Details'}
            {showManualEntry ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>

          {status?.configured && (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center gap-2"
              style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
            >
              <Unplug className="w-4 h-4" />
              Disconnect
            </Button>
          )}
        </div>

        {connectionResult && (
          <Alert className={connectionResult.startsWith('✅') ?
            'border-[color-mix(in_srgb,var(--success)_30%,transparent)] dark:border-green-800 bg-[var(--status-success-bg)] dark:bg-green-900/20' :
            'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] dark:border-red-800 bg-[var(--status-danger-bg)] dark:bg-red-900/20'
          }>
            <AlertDescription className={connectionResult.startsWith('✅') ?
              'text-[var(--status-success)] dark:text-green-300' :
              'text-[var(--danger)] dark:text-red-300'
            }>
              {connectionResult}
            </AlertDescription>
          </Alert>
        )}

        {showManualEntry && (
          <div className="space-y-4 border-t pt-4" style={{ borderColor: currentTheme.colors.border }}>
            <h4 className="font-medium text-sm" style={{ color: currentTheme.colors.text }}>Tableau Connection Details</h4>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="tableau-server" className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>Server URL</Label>
                <Input
                  id="tableau-server"
                  type="text"
                  placeholder="https://tableau.yourcompany.com"
                  value={config.serverUrl}
                  onChange={(e) => setConfig(prev => ({ ...prev, serverUrl: e.target.value }))}
                  className="text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tableau-site" className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>
                  Site Name <span className="opacity-60">(the word after /site/ in Tableau URLs; leave empty for the default site)</span>
                </Label>
                <Input
                  id="tableau-site"
                  type="text"
                  placeholder="Your site ID"
                  value={config.siteId}
                  onChange={(e) => setConfig(prev => ({ ...prev, siteId: e.target.value }))}
                  className="text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tableau-pat-name" className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>
                  Token Name <span className="opacity-60">(must match Tableau exactly — case and spaces)</span>
                </Label>
                <Input
                  id="tableau-pat-name"
                  type="text"
                  placeholder="FalconX Integration"
                  value={config.patName}
                  onChange={(e) => setConfig(prev => ({ ...prev, patName: e.target.value }))}
                  className="text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tableau-pat-secret" className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>Token Secret</Label>
                <div className="relative">
                  <Input
                    id="tableau-pat-secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Paste the secret shown when the token was created"
                    value={patSecret}
                    onChange={(e) => setPatSecret(e.target.value)}
                    className="text-sm pr-8 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? (
                      <EyeOff className="h-3 w-3 text-[var(--text-muted)] dark:text-gray-500" />
                    ) : (
                      <Eye className="h-3 w-3 text-[var(--text-muted)] dark:text-gray-500" />
                    )}
                  </Button>
                </div>
                <p className="text-[11px]" style={{ color: currentTheme.colors.textSecondary }}>
                  The secret is sent once to the backend and never stored in this browser.
                </p>
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
                  <Zap className="w-3 h-3" />
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

            <Alert className="border-[color-mix(in_srgb,var(--accent-cool)_30%,transparent)] dark:border-blue-800 bg-[var(--accent-cool-bg)] dark:bg-blue-900/20">
              <KeyRound className="h-4 w-4 text-[var(--accent-cool-text)] dark:text-blue-400" />
              <AlertTitle className="text-[var(--accent-cool-text)] dark:text-blue-200">How to create a token</AlertTitle>
              <AlertDescription className="space-y-2 text-xs text-[var(--accent-cool-text)] dark:text-blue-300">
                <p>In Tableau, click your profile picture → <strong>My Account Settings</strong> → <strong>Personal Access Tokens</strong>.</p>
                <p>Create a token and copy the secret using the <strong>copy button</strong> in the popup — it is shown only once.</p>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
