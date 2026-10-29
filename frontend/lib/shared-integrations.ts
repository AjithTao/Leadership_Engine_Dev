import { fetchWithTimeout, getApiUrl } from './api-config'
export type Provider = 'jira' | 'confluence' | 'github'
export type ConnectionState = 'Connecting' | 'Connected' | 'Not configured' | 'Connection failed'
export interface SharedStatus { state: ConnectionState; message: string; url?: string; account?: string }
export const providers: Provider[] = ['jira', 'confluence', 'github']
let pending: Promise<any> | null = null
let results: any = {}
export function connectSharedAccounts() {
  if (!pending) {
    pending = fetchWithTimeout(getApiUrl('/api/auth/auto-connect-integrations'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    }, 180000).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Please sign in again.' : 'Connection service unavailable.')
      const data = await response.json()
      results = data.results || {}
      return results
    }).finally(() => {
      pending = null
      window.dispatchEvent(new Event('integration-update'))
    })
  }
  return pending
}
export async function readSharedStatuses(): Promise<Record<Provider, SharedStatus>> {
  const entries = await Promise.all(providers.map(async provider => {
    try {
      const response = await fetchWithTimeout(getApiUrl(`/api/${provider}/status`), {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
      }, 90000)
      if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Please sign in again.' : 'Unable to check connection.')
      const data = await response.json()
      const connected = provider === 'github' ? data.connected : data.configured
      const result = results[provider]
      return [provider, {
        state: connected ? 'Connected' : pending ? 'Connecting' : data.credentials_available === false ? 'Not configured' : 'Connection failed',
        message: connected ? 'Using the shared TAO service account.' : data.credentials_available === false ? 'Shared service credentials are not configured on the server. Contact your administrator.' : result?.message || 'Shared connection unavailable. Retry or contact your administrator.',
        url: data.config?.url, account: data.config?.email,
      }] as const
    } catch (error) {
      return [provider, { state: 'Connection failed', message: error instanceof Error ? error.message : 'Unable to check connection.' }] as const
    }
  }))
  return Object.fromEntries(entries) as Record<Provider, SharedStatus>
}
