'use client'
import React, { useEffect, useState } from 'react'
import type { Connection } from './NewFigmaApp'
import { SimpleTableauConnect } from '../SimpleTableauConnect'
import { connectSharedAccounts, readSharedStatuses, providers, Provider, SharedStatus } from '../../../lib/shared-integrations'
interface Props {
  connections: Connection[]
  setConnections: (connections: Connection[]) => void
  onClose: () => void
  initialTab?: 'jira' | 'confluence' | 'github' | 'slack' | 'tableau'
}
export function FigmaConnectionSettings({ onClose, initialTab }: Props) {
  const [tab, setTab] = useState<Provider | 'tableau'>(initialTab && initialTab !== 'slack' ? initialTab : 'jira')
  const [statuses, setStatuses] = useState<Partial<Record<Provider, SharedStatus>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => setStatuses(await readSharedStatuses())
  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 10000)
    window.addEventListener('integration-update', refresh)
    return () => { clearInterval(timer); window.removeEventListener('integration-update', refresh) }
  }, [])
  const retry = async () => {
    setBusy(true); setError('')
    try { await connectSharedAccounts(); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Connection failed') }
    finally { setBusy(false) }
  }
  const status = tab === 'tableau' ? undefined : statuses[tab]
  return <div role="dialog" aria-modal="true" aria-label="Connection Settings" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <section className="w-full max-w-4xl rounded-2xl border p-6 max-h-[90vh] overflow-auto" style={{background:'var(--bg-card)',color:'var(--text-primary)',borderColor:'var(--border)'}}>
      <header className="flex justify-between mb-6"><h2 className="text-xl font-bold">Connection Settings</h2><button onClick={onClose} aria-label="Close connection settings">✕</button></header>
      <div className="flex gap-6 flex-col sm:flex-row">
        <nav className="flex sm:flex-col gap-2" aria-label="Integrations">
          {[...providers, 'tableau' as const].map(name => <button key={name} onClick={() => setTab(name)} aria-pressed={tab === name} className="rounded-lg px-4 py-3 text-left capitalize" style={{background:tab === name?'var(--bg-active)':'transparent'}}>{name === 'github' ? 'GitHub' : name}</button>)}
        </nav>
        <div className="flex-1">
          {tab === 'tableau' ? <SimpleTableauConnect /> : <>
            <h3 className="text-lg font-semibold mb-3">{tab === 'github' ? 'GitHub' : tab === 'jira' ? 'TAO Jira' : 'TAO Confluence'}</h3>
            <p className="mb-4">Managed centrally using the shared TAO service account. No personal token is required.</p>
            <p role="status" className="font-semibold mb-3">{busy ? 'Connecting' : status?.state || 'Connecting'}</p>
            {status?.url && <p className="break-all mb-2">{status.url}</p>}
            {status?.account && <p className="mb-2">Account: {status.account}</p>}
            <p className="mb-4">{status?.message}</p>
            {error && <p role="alert" className="text-red-400 mb-4">{error}</p>}
            <div className="flex gap-3"><button className="border rounded-lg px-4 py-2" onClick={refresh} disabled={busy}>Refresh</button><button className="border rounded-lg px-4 py-2" onClick={retry} disabled={busy}>Retry connection</button></div>
          </>}
        </div>
      </div>
      <footer className="mt-6 text-sm" style={{color:'var(--text-secondary)'}}>Shared credentials are managed on the server and are never displayed here.</footer>
    </section>
  </div>
}
