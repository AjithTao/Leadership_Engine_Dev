'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { getApiUrl } from '../../lib/api-config'

interface IntegrationStatus {
  name: string
  connected: boolean
  loading?: boolean
  lastChecked?: Date
}

const INITIAL_STATUSES: Record<string, IntegrationStatus> = {
  jira: { name: 'TAO Jira', connected: false, loading: true },
  confluence: { name: 'TAO Confluence', connected: false, loading: true },
  github: { name: 'GitHub', connected: false, loading: true },
}

export function Integrations() {
  const [integrationStatuses, setIntegrationStatuses] = useState(INITIAL_STATUSES)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const fetchAllStatuses = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [jiraResult, confluenceResult, githubResult] = await Promise.allSettled([
        fetch(getApiUrl('/api/jira/status')).then(response => response.json()),
        fetch(getApiUrl('/api/confluence/status')).then(response => response.json()),
        fetch(getApiUrl('/api/github/status')).then(response => response.json()),
      ])

      const jira = jiraResult.status === 'fulfilled' ? jiraResult.value : null
      const confluence = confluenceResult.status === 'fulfilled' ? confluenceResult.value : null
      const github = githubResult.status === 'fulfilled' ? githubResult.value : null
      const checkedAt = new Date()

      setIntegrationStatuses({
        jira: { name: 'TAO Jira', connected: Boolean(jira?.configured), loading: false, lastChecked: checkedAt },
        confluence: { name: 'TAO Confluence', connected: Boolean(confluence?.configured), loading: false, lastChecked: checkedAt },
        github: { name: 'GitHub', connected: Boolean(github?.connected), loading: false, lastChecked: checkedAt },
      })
    } finally {
      setIsRefreshing(false)
      setIsInitialized(true)
    }
  }, [])

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      try {
        await fetch(getApiUrl('/api/auth/auto-connect-integrations'), { method: 'POST' })
      } catch {
        // Status checks below surface any unavailable integration.
      }
      if (active) await fetchAllStatuses()
    }

    bootstrap()
    const interval = window.setInterval(fetchAllStatuses, 10000)
    const handleIntegrationUpdate = () => fetchAllStatuses()
    window.addEventListener('integration-update', handleIntegrationUpdate)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('integration-update', handleIntegrationUpdate)
    }
  }, [fetchAllStatuses])

  const integrationRows = ['jira', 'confluence', 'github'] as const

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') setIsOpen(value => !value)
        }}
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
          onClick={event => { event.stopPropagation(); fetchAllStatuses() }}
          disabled={isRefreshing}
          aria-label="Refresh integration status"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: 4, display: 'flex', borderRadius: 6,
            opacity: isRefreshing ? 0.5 : 1,
          }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

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
          ) : integrationRows.map((id, index) => {
            const status = integrationStatuses[id]
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '14px 16px', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: status.loading
                        ? 'var(--status-warning)'
                        : status.connected
                          ? 'var(--status-success)'
                          : 'var(--status-danger)',
                    }}
                    className={status.loading ? 'animate-pulse' : ''}
                  />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{status.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      {status.connected ? 'Connected' : 'Unavailable'}
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: status.connected ? 'var(--status-success-bg)' : 'var(--bg-active)',
                    border: '1px solid var(--border)',
                    color: status.connected ? 'var(--status-success)' : 'var(--text-secondary)',
                  }}
                >
                  {status.connected ? 'Connected' : 'Unavailable'}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
