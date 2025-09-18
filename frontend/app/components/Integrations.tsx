'use client'

import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion'
import { RefreshCw, Settings, Sparkles } from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { ConnectionPopup } from './ConnectionPopup'
import { motion } from 'framer-motion'

interface IntegrationStatus {
  name: string
  connected: boolean
  loading?: boolean
  lastChecked?: Date
}

export function Integrations() {
  const { userDetails } = useUser()
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, IntegrationStatus>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [popup, setPopup] = useState<{
    isVisible: boolean
    isSuccess: boolean
    message: string
  }>({
    isVisible: false,
    isSuccess: false,
    message: ''
  })

  // Initialize integration statuses
  useEffect(() => {
    const initialStatuses: Record<string, IntegrationStatus> = {
      'jira-confluence': {
        name: 'Jira/Confluence',
        connected: false,
        loading: false
      },
      'github': {
        name: 'GitHub',
        connected: false,
        loading: false
      }
    }
    setIntegrationStatuses(initialStatuses)
    fetchAllStatuses().finally(() => setIsInitialized(true))
  }, [])

  const fetchAllStatuses = async () => {
    setIsRefreshing(true)
    try {
      // Fetch Jira status
      try {
        const jiraResponse = await fetch('http://localhost:8000/api/jira/status')
        const jiraData = await jiraResponse.json()
        
        // Fetch Confluence status
        const confluenceResponse = await fetch('http://localhost:8000/api/confluence/status')
        const confluenceData = await confluenceResponse.json()
        
        // Consider both connected if either is connected
        const bothConnected = (jiraData.configured || false) && (confluenceData.configured || false)
        
        setIntegrationStatuses(prev => ({
          ...prev,
          'jira-confluence': {
            name: 'Jira/Confluence',
            connected: bothConnected,
            lastChecked: new Date()
          }
        }))
      } catch (error) {
        console.error('Failed to fetch integration status:', error)
      }

      // GitHub is not implemented yet
      setIntegrationStatuses(prev => ({
        ...prev,
        'github': {
          name: 'GitHub',
          connected: false,
          lastChecked: new Date()
        }
      }))
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleConnect = async (integrationId: string) => {
    if (integrationId === 'github') {
      return // GitHub is disabled
    }

    // Check if user has set their API token
    if (!userDetails.apiToken || userDetails.apiToken.trim() === '') {
      setPopup({
        isVisible: true,
        isSuccess: false,
        message: 'Please set your API token in Profile Menu first!'
      })
      return
    }

    setIntegrationStatuses(prev => ({
      ...prev,
      [integrationId]: {
        ...prev[integrationId],
        loading: true
      }
    }))

    try {
      // Connect both Jira and Confluence
      const jiraResponse = await fetch('http://localhost:8000/api/jira/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: userDetails.atlassianAccount.includes('@') ? 
            `https://${userDetails.atlassianAccount.split('@')[1].split('.')[0]}.atlassian.net` : 
            userDetails.atlassianAccount.startsWith('http') ? userDetails.atlassianAccount : `https://${userDetails.atlassianAccount}.atlassian.net`,
          email: userDetails.email,
          api_token: userDetails.apiToken,
          board_id: '1'
        })
      })

      const confluenceResponse = await fetch('http://localhost:8000/api/confluence/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: userDetails.atlassianAccount.includes('@') ? 
            `https://${userDetails.atlassianAccount.split('@')[1].split('.')[0]}.atlassian.net` : 
            userDetails.atlassianAccount.startsWith('http') ? userDetails.atlassianAccount : `https://${userDetails.atlassianAccount}.atlassian.net`,
          email: userDetails.email,
          api_token: userDetails.apiToken
        })
      })

      const jiraSuccess = jiraResponse.ok
      const confluenceSuccess = confluenceResponse.ok
      const bothSuccess = jiraSuccess && confluenceSuccess

      setIntegrationStatuses(prev => ({
        ...prev,
        [integrationId]: {
          ...prev[integrationId],
          connected: bothSuccess,
          loading: false,
          lastChecked: new Date()
        }
      }))

      setPopup({
        isVisible: true,
        isSuccess: bothSuccess,
        message: bothSuccess 
          ? 'Jira/Confluence connected successfully!' 
          : 'Connection failed. Please check your credentials.'
      })
      
    } catch (error) {
      console.error(`Failed to connect ${integrationId}:`, error)
      setIntegrationStatuses(prev => ({
        ...prev,
        [integrationId]: {
          ...prev[integrationId],
          connected: false,
          loading: false,
          lastChecked: new Date()
        }
      }))
      
      setPopup({
        isVisible: true,
        isSuccess: false,
        message: `Failed to connect to ${integrationId}: ${error instanceof Error ? error.message : 'Connection failed'}`
      })
    }
  }

  const getStatusDot = (status: IntegrationStatus | undefined) => {
    if (!status) {
      return <div className="h-3 w-3 rounded-full bg-gray-400/50" />
    }
    if (status.loading) {
      return <div className="h-3 w-3 rounded-full status-loading animate-pulse-glow" />
    }
    if (status.connected) {
      return <div className="h-3 w-3 rounded-full status-online" />
    }
    if (status.name === 'GitHub') {
      return <div className="h-3 w-3 rounded-full bg-gray-400/50" />
    }
    return <div className="h-3 w-3 rounded-full status-offline" />
  }

  const getButtonText = (status: IntegrationStatus | undefined) => {
    if (!status) return 'Connect'
    if (status.loading) return 'Connecting...'
    if (status.name === 'GitHub') return 'Coming Soon'
    return 'Connect'
  }

  const isButtonDisabled = (status: IntegrationStatus | undefined) => {
    if (!status) return false
    return status.loading || status.name === 'GitHub'
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="space-y-4"
      >
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="integrations" className="border-gray-700/50">
            <AccordionTrigger className="text-white/80 hover:text-white hover:no-underline py-4 group">
              <span className="flex items-center justify-between w-full">
                <span className="premium-caption text-white/80 tracking-wider flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Connected Apps
                </span>
                <motion.div
                  whileHover={{ rotate: 180 }}
                  transition={{ duration: 0.3 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      fetchAllStatuses()
                    }}
                    disabled={isRefreshing}
                    className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </motion.div>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {!isInitialized ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full"
                  />
                </div>
              ) : (
                <>
                  {/* Jira/Confluence Row */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card className="premium-card cursor-pointer group relative overflow-hidden">
                      {/* Background Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      
                      {/* Shimmer Effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-premium"></div>
                      
                      <CardContent className="p-5 relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {getStatusDot(integrationStatuses['jira-confluence'])}
                            <div>
                              <span className="premium-subheading text-white text-sm">Jira/Confluence</span>
                              <p className="premium-text text-xs text-white/50 mt-0.5">
                                {integrationStatuses['jira-confluence']?.connected ? 'Connected' : 'Not connected'}
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleConnect('jira-confluence')}
                            disabled={isButtonDisabled(integrationStatuses['jira-confluence'])}
                            className="premium-button px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
                          >
                            {getButtonText(integrationStatuses['jira-confluence'])}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* GitHub Row */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card className="premium-card group relative overflow-hidden opacity-60">
                      {/* Background Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-r from-gray-500/10 to-gray-600/10"></div>
                      
                      <CardContent className="p-5 relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {getStatusDot(integrationStatuses['github'])}
                            <div>
                              <span className="premium-subheading text-white/60 text-sm">GitHub</span>
                              <p className="premium-text text-xs text-white/30 mt-0.5">Coming soon</p>
                            </div>
                          </div>
                          <Button
                            disabled={true}
                            className="px-4 py-2 rounded-lg bg-gray-600/50 text-gray-400 text-sm font-medium cursor-not-allowed"
                          >
                            Coming Soon
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </motion.div>

      <ConnectionPopup
        isVisible={popup.isVisible}
        isSuccess={popup.isSuccess}
        message={popup.message}
        onClose={() => setPopup(prev => ({ ...prev, isVisible: false }))}
      />
    </>
  )
}