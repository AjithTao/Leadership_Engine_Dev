'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
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
  const [isOpen, setIsOpen] = useState(false)
  const [popup, setPopup] = useState<{
    isVisible: boolean
    isSuccess: boolean
    message: string
  }>({
    isVisible: false,
    isSuccess: false,
    message: ''
  })

  useEffect(() => {
    const initialStatuses: Record<string, IntegrationStatus> = {
      'jira-confluence': { name: 'Jira/Confluence', connected: false, loading: false },
      'github':          { name: 'GitHub',           connected: false, loading: false },
      'salesforce':      { name: 'Salesforce',       connected: false, loading: false },
    }
    setIntegrationStatuses(initialStatuses)
    fetchAllStatuses().finally(() => setIsInitialized(true))
  }, [])

  const fetchAllStatuses = async () => {
    setIsRefreshing(true)
    try {
      try {
        const jiraResponse = await fetch('http://localhost:8000/api/jira/status')
        const jiraData = await jiraResponse.json()
        const confluenceResponse = await fetch('http://localhost:8000/api/confluence/status')
        const confluenceData = await confluenceResponse.json()
        const bothConnected = (jiraData.configured || false) && (confluenceData.configured || false)
        setIntegrationStatuses(prev => ({
          ...prev,
          'jira-confluence': { name: 'Jira/Confluence', connected: bothConnected, lastChecked: new Date() }
        }))
      } catch (error) {
        console.error('Failed to fetch integration status:', error)
      }

      setIntegrationStatuses(prev => ({
        ...prev,
        'github': { name: 'GitHub', connected: false, lastChecked: new Date() }
      }))

      try {
        const sfResponse = await fetch('http://localhost:8000/api/salesforce/status')
        const sfData = await sfResponse.json()
        setIntegrationStatuses(prev => ({
          ...prev,
          'salesforce': { name: 'Salesforce', connected: sfData.connected || false, lastChecked: new Date() }
        }))
      } catch {
        // Salesforce not yet configured — keep as disconnected
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleConnect = async (integrationId: string) => {
    if (integrationId === 'github') return

    if (!userDetails.apiToken || userDetails.apiToken.trim() === '') {
      setPopup({ isVisible: true, isSuccess: false, message: 'Please set your API token in Profile Menu first!' })
      return
    }

    setIntegrationStatuses(prev => ({
      ...prev,
      [integrationId]: { ...prev[integrationId], loading: true }
    }))

    try {
      const atlassianUrl = userDetails.atlassianAccount.includes('@')
        ? `https://${userDetails.atlassianAccount.split('@')[1].split('.')[0]}.atlassian.net`
        : userDetails.atlassianAccount.startsWith('http')
          ? userDetails.atlassianAccount
          : `https://${userDetails.atlassianAccount}.atlassian.net`

      const jiraResponse = await fetch('http://localhost:8000/api/jira/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: atlassianUrl, email: userDetails.email, api_token: userDetails.apiToken, board_id: '1' })
      })

      const confluenceResponse = await fetch('http://localhost:8000/api/confluence/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: atlassianUrl, email: userDetails.email, api_token: userDetails.apiToken })
      })

      const bothSuccess = jiraResponse.ok && confluenceResponse.ok

      setIntegrationStatuses(prev => ({
        ...prev,
        [integrationId]: { ...prev[integrationId], connected: bothSuccess, loading: false, lastChecked: new Date() }
      }))

      setPopup({
        isVisible: true,
        isSuccess: bothSuccess,
        message: bothSuccess ? 'Jira/Confluence connected successfully!' : 'Connection failed. Please check your credentials.'
      })

    } catch (error) {
      console.error(`Failed to connect ${integrationId}:`, error)
      setIntegrationStatuses(prev => ({
        ...prev,
        [integrationId]: { ...prev[integrationId], connected: false, loading: false, lastChecked: new Date() }
      }))
      setPopup({
        isVisible: true,
        isSuccess: false,
        message: `Failed to connect to ${integrationId}: ${error instanceof Error ? error.message : 'Connection failed'}`
      })
    }
  }

  const StatusDot = ({ status }: { status: IntegrationStatus | undefined }) => {
    if (!status || status.name === 'GitHub') {
      return <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--bg-active)', flexShrink: 0 }} />
    }
    if (status.loading) {
      return <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FCD34D', flexShrink: 0 }} className="animate-pulse" />
    }
    if (status.connected) {
      return <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ADE80', flexShrink: 0 }} />
    }
    return <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F87171', flexShrink: 0 }} />
  }

  const getButtonText = (status: IntegrationStatus | undefined) => {
    if (!status) return 'Connect'
    if (status.loading) return 'Connecting...'
    if (status.name === 'GitHub') return 'Coming Soon'
    if (status.name === 'Salesforce') return 'Via .env'
    return 'Connect'
  }

  const isButtonDisabled = (status: IntegrationStatus | undefined) => {
    if (!status) return false
    return status.loading || status.name === 'GitHub' || status.name === 'Salesforce'
  }

  const integrationRows = [
    { id: 'jira-confluence', label: 'Jira/Confluence', subtitle: (s: IntegrationStatus | undefined) => s?.connected ? 'Connected' : 'Not connected' },
    { id: 'github',          label: 'GitHub',          subtitle: () => 'Coming soon' },
    { id: 'salesforce',      label: 'Salesforce',      subtitle: (s: IntegrationStatus | undefined) => s?.connected ? 'Connected' : 'Configure via .env' },
  ]

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {/* Accordion Header */}
        <button
          onClick={() => setIsOpen(v => !v)}
          style={{
            width: '100%', background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--border)', cursor: 'pointer',
            padding: '14px 0', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            <Settings style={{ width: 14, height: 14 }} />
            Connected Apps
          </span>
          <button
            onClick={e => { e.stopPropagation(); fetchAllStatuses() }}
            disabled={isRefreshing}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', padding: '4px', display: 'flex', borderRadius: 6,
              opacity: isRefreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw style={{ width: 14, height: 14 }} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </button>

        {/* Accordion Content */}
        {isOpen && (
          <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!isInitialized ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--blue)', borderRadius: '50%' }}
                />
              </div>
            ) : (
              integrationRows.map(({ id, label, subtitle }, index) => {
                const status = integrationStatuses[id]
                const isGitHub = id === 'github'
                const isSalesforce = id === 'salesforce'
                const isDisabled = isButtonDisabled(status)

                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.08 }}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '14px 16px',
                      opacity: isGitHub ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <StatusDot status={status} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: isGitHub ? 'var(--text-muted)' : 'var(--text-primary)', margin: 0 }}>{label}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{subtitle(status)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => !isDisabled && handleConnect(id)}
                      disabled={isDisabled}
                      style={{
                        padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        ...(isDisabled
                          ? { background: 'var(--bg-active)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                          : { background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
                        ),
                      }}
                    >
                      {getButtonText(status)}
                    </button>
                  </motion.div>
                )
              })
            )}
          </div>
        )}
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
