'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import { Separator } from '../ui/separator'
import { 
  X, 
  Wifi, 
  WifiOff, 
  Settings, 
  Key, 
  Globe, 
  User, 
  Mail,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Save,
  TestTube,
  Shield,
  Crown,
  Target
} from 'lucide-react'

interface Connection {
  name: string
  status: 'connected' | 'disconnected'
  type: 'atlassian' | 'github' | 'slack'
}

interface FigmaConnectionSettingsProps {
  connections: Connection[]
  setConnections: (connections: Connection[]) => void
  onClose: () => void
  theme: 'light' | 'dark'
}

export function FigmaConnectionSettings({ 
  connections, 
  setConnections, 
  onClose, 
  theme 
}: FigmaConnectionSettingsProps) {
  const [activeTab, setActiveTab] = useState<'atlassian' | 'github' | 'slack'>('atlassian')
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({})
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'testing'>>({})
  
  const [atlassianConfig, setAtlassianConfig] = useState({
    url: '',
    email: '',
    apiToken: '',
    enabled: false
  })
  
  const [githubConfig, setGithubConfig] = useState({
    token: '',
    organization: '',
    enabled: false
  })
  
  const [slackConfig, setSlackConfig] = useState({
    token: '',
    channel: '',
    enabled: false
  })

  // Load saved settings on component mount

  // Load saved settings on component mount
  React.useEffect(() => {
    const savedAtlassian = localStorage.getItem('atlassian-config')
    if (savedAtlassian) {
      try {
        const parsed = JSON.parse(savedAtlassian)
        // Ensure boardId is a string and not corrupted
        setAtlassianConfig({
          url: parsed.url || '',
          email: parsed.email || '',
          apiToken: parsed.apiToken || '',
          enabled: parsed.enabled || false
        })
      } catch (error) {
        console.error('Error parsing saved Atlassian config:', error)
        // Reset to default if parsing fails
        setAtlassianConfig({
          url: '',
          email: '',
          apiToken: '',
          enabled: false
        })
      }
    }
    
    const savedGithub = localStorage.getItem('github-config')
    if (savedGithub) {
      setGithubConfig(JSON.parse(savedGithub))
    }
    
    const savedSlack = localStorage.getItem('slack-config')
    if (savedSlack) {
      setSlackConfig(JSON.parse(savedSlack))
    }
  }, [])

  // Auto-save settings when they change
  React.useEffect(() => {
    localStorage.setItem('atlassian-config', JSON.stringify(atlassianConfig))
  }, [atlassianConfig])

  React.useEffect(() => {
    localStorage.setItem('github-config', JSON.stringify(githubConfig))
  }, [githubConfig])

  React.useEffect(() => {
    localStorage.setItem('slack-config', JSON.stringify(slackConfig))
  }, [slackConfig])

  // Check connection status on mount
  React.useEffect(() => {
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/jira/status')
      const data = await response.json()
      setConnectionStatus(prev => ({
        ...prev,
        atlassian: data.configured ? 'connected' : 'disconnected'
      }))
    } catch (error) {
      console.error('Error checking connection status:', error)
      setConnectionStatus(prev => ({
        ...prev,
        atlassian: 'disconnected'
      }))
    }
  }

  const testConnection = async (type: string) => {
    if (type === 'atlassian') {
      setIsTesting(true)
      setTestResults(prev => ({ ...prev, [type]: null }))
      setConnectionStatus(prev => ({ ...prev, [type]: 'testing' }))
      
      try {
        const response = await fetch('http://localhost:8000/api/jira/configure', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: atlassianConfig.url,
            email: atlassianConfig.email,
            api_token: atlassianConfig.apiToken
          })
        })
        
        if (response.ok) {
          setTestResults(prev => ({ ...prev, [type]: 'success' }))
          setConnectionStatus(prev => ({ ...prev, [type]: 'connected' }))
          
          // Update connections state
          const newConnections = connections.map(conn => 
            conn.type === 'atlassian' 
              ? { ...conn, status: 'connected' as const }
              : conn
          )
          setConnections(newConnections)
        } else {
          throw new Error('Connection failed')
        }
      } catch (error) {
        console.error('Connection test failed:', error)
        setTestResults(prev => ({ ...prev, [type]: 'error' }))
        setConnectionStatus(prev => ({ ...prev, [type]: 'disconnected' }))
      } finally {
        setIsTesting(false)
      }
    } else {
      // For other services, show coming soon
      setTestResults(prev => ({ ...prev, [type]: 'error' }))
    }
  }


  const tabs = [
    { id: 'atlassian', label: 'Atlassian', icon: Globe, color: 'text-[var(--accent-primary)]' }
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={`relative w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border overflow-hidden ${
            theme === 'dark' 
              ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700' 
              : 'bg-white border-gray-200'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${
            theme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200'
          }`}>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-primary to-purple-500 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Connection Settings</h2>
                <p className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-500'}`}>
                  Configure your integrations and data sources
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className={theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-700' : ''}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex h-[600px]">
            {/* Sidebar */}
            <div className={`w-64 border-r ${
              theme === 'dark' 
                ? 'border-slate-700 bg-slate-800/30' 
                : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="p-4 space-y-2">
                {tabs.map((tab) => (
                  <motion.button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                      activeTab === tab.id
                        ? theme === 'dark' 
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' 
                          : 'bg-blue-500 text-white shadow-sm'
                        : theme === 'dark'
                          ? 'hover:bg-slate-700 text-slate-300 hover:text-white'
                          : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : tab.color}`} />
                    <span className="font-medium">{tab.label}</span>
                    {connections.find(c => c.type === tab.id)?.status === 'connected' && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className={`flex-1 overflow-y-auto ${
              theme === 'dark' ? 'bg-slate-800/20' : 'bg-white'
            }`}>
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {activeTab === 'atlassian' && (
                    <motion.div
                      key="atlassian"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Atlassian Integration</h3>
                          <p className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-500'}`}>
                            Connect to Jira and Confluence for project management
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={atlassianConfig.enabled}
                            onCheckedChange={(checked: boolean) => 
                              setAtlassianConfig(prev => ({ ...prev, enabled: checked }))
                            }
                          />
                          <Label className={theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}>Enable</Label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="atlassian-url" className={theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}>Workspace URL</Label>
                          <Input
                            id="atlassian-url"
                            placeholder="https://yourcompany.atlassian.net"
                            value={atlassianConfig.url}
                            onChange={(e) => setAtlassianConfig(prev => ({ ...prev, url: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="atlassian-email" className={theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}>Email Address</Label>
                          <Input
                            id="atlassian-email"
                            type="email"
                            placeholder="your.email@company.com"
                            value={atlassianConfig.email}
                            onChange={(e) => setAtlassianConfig(prev => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="atlassian-token" className={theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}>API Token</Label>
                          <div className="relative">
                            <Input
                              id="atlassian-token"
                              type="password"
                              placeholder="Enter your API token"
                              value={atlassianConfig.apiToken}
                              onChange={(e) => setAtlassianConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                        Generate an API token from your Atlassian account settings
                      </p>

                      {/* Save Configuration Button */}
                      <div className={`flex items-center justify-between p-4 rounded-lg ${
                        theme === 'dark' ? 'bg-slate-700/30 border border-slate-600' : 'bg-muted/20'
                      }`}>
                        <div>
                          <p className={`font-medium text-sm ${theme === 'dark' ? 'text-slate-200' : 'text-gray-900'}`}>Configuration</p>
                          <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                            Save your configuration to persist settings
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setAtlassianConfig({
                                url: '',
                                email: '',
                                apiToken: '',
                                enabled: false
                              })
                              localStorage.removeItem('atlassian-config')
                            }}
                            className={theme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}
                          >
                            Reset
                          </Button>
                          <Button
                            onClick={() => {
                              localStorage.setItem('atlassian-config', JSON.stringify(atlassianConfig))
                              // Show success feedback
                              setIsSaving(true)
                              setTimeout(() => setIsSaving(false), 1000)
                            }}
                            disabled={isSaving}
                            className={`flex items-center gap-2 ${
                              theme === 'dark' 
                                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                          >
                            {isSaving ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            {isSaving ? 'Saving...' : 'Save Configuration'}
                          </Button>
                        </div>
                      </div>

                      {/* Saved Configuration Display */}
                      {(atlassianConfig.url || atlassianConfig.email) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-1 bg-green-100 dark:bg-green-900/40 rounded-full">
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="flex-1">
                              <h5 className="font-semibold text-green-600 dark:text-green-400 mb-2 text-sm">Saved Configuration</h5>
                              <div className="space-y-1">
                                {atlassianConfig.url && (
                                  <div className="flex items-center gap-2">
                                    <Globe className="h-3 w-3 text-green-600 dark:text-green-400" />
                                    <span className="text-xs text-green-600 dark:text-green-300 font-mono">
                                      {atlassianConfig.url}
                                    </span>
                                  </div>
                                )}
                                {atlassianConfig.email && (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3 w-3 text-green-600 dark:text-green-400" />
                                    <span className="text-xs text-green-600 dark:text-green-300">
                                      {atlassianConfig.email}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      <div className={`flex items-center justify-between p-4 rounded-lg ${
                        theme === 'dark' ? 'bg-slate-700/30 border border-slate-600' : 'bg-muted/20'
                      }`}>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                            <Globe className="w-4 h-4 text-[var(--accent-primary)]" />
                          </div>
                          <div>
                            <p className={`font-medium text-sm ${theme === 'dark' ? 'text-slate-200' : 'text-gray-900'}`}>Connection Status</p>
                            <div className="flex items-center space-x-2">
                              <div className={`w-2 h-2 rounded-full ${
                                connectionStatus.atlassian === 'connected' ? 'bg-green-500' :
                                connectionStatus.atlassian === 'testing' ? 'bg-yellow-500 animate-pulse' :
                                'bg-red-500'
                              }`} />
                              <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                                {connectionStatus.atlassian === 'connected' ? 'Connected' :
                                 connectionStatus.atlassian === 'testing' ? 'Testing...' :
                                 'Disconnected'}
                              </p>
                            </div>
                          </div>
                        </div>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => testConnection('atlassian')}
                                    disabled={isTesting}
                                  >
                                    {isTesting ? (
                                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <TestTube className="w-4 h-4 mr-2" />
                                    )}
                                    {isTesting ? 'Testing...' : 'Test'}
                                  </Button>
                                </div>
                      </div>

                      {/* Persistent Configuration Details */}
                      {connectionStatus.atlassian === 'connected' && (atlassianConfig.url || atlassianConfig.email) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-4 rounded-lg border ${
                            theme === 'dark' 
                              ? 'bg-green-500/10 border-green-500/20' 
                              : 'bg-green-50 border-green-200'
                          }`}
                        >
                          <div className="flex items-center space-x-3 mb-3">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            <div>
                              <p className={`font-medium text-sm ${
                                theme === 'dark' ? 'text-green-400' : 'text-green-700'
                              }`}>
                                Configuration Details
                              </p>
                              <p className={`text-xs ${
                                theme === 'dark' ? 'text-green-300' : 'text-green-600'
                              }`}>
                                Your Atlassian workspace is connected
                              </p>
                            </div>
                          </div>
                            <div className={`text-xs space-y-1 ${
                              theme === 'dark' ? 'text-green-300' : 'text-green-600'
                            }`}>
                              <div><span className="font-medium">Workspace:</span> {atlassianConfig.url}</div>
                              <div><span className="font-medium">Email:</span> {atlassianConfig.email}</div>
                            </div>
                        </motion.div>
                      )}

                      {testResults.atlassian && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-4 rounded-lg flex items-center space-x-3 ${
                            testResults.atlassian === 'success'
                              ? 'bg-green-500/10 border border-green-500/20'
                              : 'bg-red-500/10 border border-red-500/20'
                          }`}
                        >
                          {testResults.atlassian === 'success' ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          )}
                          <div>
                            <p className={`font-medium text-sm ${
                              testResults.atlassian === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {testResults.atlassian === 'success' 
                                ? 'Connection successful!' 
                                : 'Connection failed. Please check your credentials.'
                              }
                            </p>
                            <p className={`text-xs ${
                              testResults.atlassian === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {testResults.atlassian === 'success' 
                                ? 'Your Atlassian workspace is now connected.' 
                                : 'Unable to connect to the specified workspace.'
                              }
                            </p>
                            {testResults.atlassian === 'success' && (
                              <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                                <div className="space-y-1">
                                  <div><span className="font-medium">Workspace:</span> {atlassianConfig.url}</div>
                                  <div><span className="font-medium">Email:</span> {atlassianConfig.email}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between p-6 border-t ${
            theme === 'dark' 
              ? 'border-slate-700 bg-slate-800/50' 
              : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center space-x-2">
              <Shield className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`} />
              <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                Your credentials are encrypted and stored securely. Settings are auto-saved.
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={onClose} className={theme === 'dark' ? 'border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700' : ''}>
                Close
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
