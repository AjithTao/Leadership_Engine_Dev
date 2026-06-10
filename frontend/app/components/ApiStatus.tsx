'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from './ui/card'
import { getApiUrl } from '../../lib/api-config'

interface ApiStatusProps {
  className?: string
}

export function ApiStatus({ className = '' }: ApiStatusProps) {
  const [status, setStatus] = useState<'online' | 'offline' | 'error'>('offline')

  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch(getApiUrl('/api/jira/status'))
        if (response.ok) {
          setStatus('online')
        } else {
          setStatus('error')
        }
      } catch (error) {
        setStatus('offline')
      }
    }

    checkApiStatus()
    // Check every 30 seconds
    const interval = setInterval(checkApiStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusDot = () => {
    switch (status) {
      case 'online':
        return <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
      case 'offline':
        return <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
      case 'error':
        return <div className="h-2.5 w-2.5 rounded-full bg-yellow-500 animate-pulse" />
      default:
        return <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'online':
        return 'API Service'
      case 'offline':
        return 'API Service'
      case 'error':
        return 'API Service'
      default:
        return 'API Service'
    }
  }

  const getStatusDescription = () => {
    switch (status) {
      case 'online':
        return 'All systems operational'
      case 'offline':
        return 'Service unavailable'
      case 'error':
        return 'Connection issues'
      default:
        return 'Status unknown'
    }
  }

  return (
    <Card className={`bg-gray-700/50 border-gray-600 backdrop-blur-sm hover:bg-gray-700/70 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg rounded-xl ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusDot()}
            <div>
              <span className="text-white font-medium text-sm">{getStatusText()}</span>
              <p className="text-xs text-gray-400 mt-0.5">{getStatusDescription()}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
