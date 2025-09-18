'use client'

import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion'
import { 
  Database, 
  FileText, 
  Github, 
  Settings, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Zap
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

interface IntegrationStatus {
  name: string
  connected: boolean
  loading?: boolean
  lastChecked?: Date
}

interface Integration {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  color: string
}

const integrations: Integration[] = [
  {
    id: 'jira',
    name: 'Jira',
    icon: <Database className="w-5 h-5" />,
    description: 'Project Management & Issue Tracking',
    color: 'bg-blue-500'
  },
  {
    id: 'confluence',
    name: 'Confluence',
    icon: <FileText className="w-5 h-5" />,
    description: 'Knowledge Management & Documentation',
    color: 'bg-green-500'
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: <Github className="w-5 h-5" />,
    description: 'Code Repository & Version Control',
    color: 'bg-gray-800'
  }
]

export function IntegrationsDropdown() {
  const { userDetails } = useUser()
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, IntegrationStatus>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Initialize integration statuses
  useEffect(() => {
    const initialStatuses: Record<string, IntegrationStatus> = {}
    integrations.forEach(integration => {
      initialStatuses[integration.id] = {
        name: integration.name,
        connected: false,
        loading: false
      }
    })
    setIntegrationStatuses(initialStatuses)
    fetchAllStatuses()
  }, [])

  const fetchAllStatuses = async () => {
    setIsRefreshing(true)
    try {
      // Fetch Jira status
      try {
        const jiraResponse = await fetch('http://localhost:8000/api/jira/status')
        const jiraData = await jiraResponse.json()
        setIntegrationStatuses(prev => ({
          ...prev,
          jira: {
            name: 'Jira',
            connected: jiraData.configured || false,
            lastChecked: new Date()
          }
        }))
      } catch (error) {
        console.error('Failed to fetch Jira status:', error)
      }

      // Fetch Confluence status
      try {
        const confluenceResponse = await fetch('http://localhost:8000/api/confluence/status')
        const confluenceData = await confluenceResponse.json()
        setIntegrationStatuses(prev => ({
          ...prev,
          confluence: {
            name: 'Confluence',
            connected: confluenceData.configured || false,
            lastChecked: new Date()
          }
        }))
      } catch (error) {
        console.error('Failed to fetch Confluence status:', error)
      }

      // GitHub is not implemented yet
      setIntegrationStatuses(prev => ({
        ...prev,
        github: {
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
    // Check if user has set their API token
    if (!userDetails.apiToken || userDetails.apiToken.trim() === '') {
      alert('Please set your API token in the Profile Menu first!')
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
      let response
      if (integrationId === 'jira') {
        response = await fetch('http://localhost:8000/api/jira/configure', {
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
            board_id: '1' // Default board ID, can be made configurable later
          })
        })
      } else if (integrationId === 'confluence') {
        response = await fetch('http://localhost:8000/api/confluence/configure', {
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
      } else if (integrationId === 'github') {
        // GitHub integration not implemented yet
        throw new Error('GitHub integration coming soon')
      }

      if (response && response.ok) {
        const data = await response.json()
        setIntegrationStatuses(prev => ({
          ...prev,
          [integrationId]: {
            ...prev[integrationId],
            connected: data.success || data.configured || false,
            loading: false,
            lastChecked: new Date()
          }
        }))
      } else {
        throw new Error('Connection failed')
      }
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
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      alert(`Failed to connect to ${integrationId}: ${errorMessage}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center">
          <Settings className="w-4 h-4 mr-2" />
          Integrations
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchAllStatuses}
          disabled={isRefreshing}
          className="p-1 text-gray-300 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="integrations" className="border-gray-700">
          <AccordionTrigger className="text-gray-300 hover:text-white hover:no-underline py-3">
            <span className="flex items-center">
              <Zap className="w-4 h-4 mr-2" />
              Connected Apps
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            {integrations.map((integration) => {
              const status = integrationStatuses[integration.id]
              return (
                <Card 
                  key={integration.id} 
                  className="bg-gray-700/50 border-gray-600 backdrop-blur-sm hover:bg-gray-700/70 transition-all duration-200"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${integration.color} text-white`}>
                          {integration.icon}
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{integration.name}</h4>
                          <p className="text-sm text-gray-300">{integration.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {status?.connected ? (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-500/20 text-red-400 border-red-500/30">
                            <XCircle className="w-3 h-3 mr-1" />
                            Not Connected
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => handleConnect(integration.id)}
                      disabled={status?.loading || !userDetails.apiToken}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {status?.loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Connect
                        </>
                      )}
                    </Button>
                    
                    {!userDetails.apiToken && (
                      <p className="text-xs text-yellow-400 mt-2 text-center">
                        ⚠️ Please set your API token in Profile Menu first
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
