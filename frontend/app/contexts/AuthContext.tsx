'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { connectSharedAccounts, readSharedStatuses, providers } from '../../lib/shared-integrations'
import { migratePreferences } from '../../lib/preferences'
import { getApiUrl, fetchWithTimeout } from '../../lib/api-config'

export interface LoginResult {
  success: boolean
  /** 'network' = server unreachable, 'rejected' = credentials refused, 'server-error' = backend failure */
  reason?: 'network' | 'rejected' | 'server-error'
  message?: string
}

interface AuthContextType {
  isAuthenticated: boolean
  user: { username: string; email: string; role: string } | null
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<{ username: string; email: string; role: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Every application data request uses the same JWT. Installing the wrapper
  // once here protects direct fetch() calls across the existing dashboards
  // without duplicating authorization logic in every component.
  useEffect(() => {
    migratePreferences()
    const nativeFetch = window.fetch.bind(window)
    const apiBase = getApiUrl('')

    window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
      const headers = new Headers(input instanceof Request ? input.headers : undefined)
      new Headers(init.headers).forEach((value, key) => headers.set(key, value))
      const token = localStorage.getItem('auth_token')
      if (token && requestUrl.startsWith(apiBase) && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return nativeFetch(input, { ...init, headers }).then(response => {
        if (response.status === 401 && requestUrl.startsWith(apiBase) && !requestUrl.endsWith('/api/auth/login')) {
          localStorage.removeItem('auth_token')
          sessionStorage.setItem('auth_notice', 'Your session expired. Please sign in again.')
          setIsAuthenticated(false); setUser(null)
        }
        return response
      })
    }

    return () => { window.fetch = nativeFetch }
  }, [])

  // Restore the session on load: verify a saved token instead of forcing a
  // fresh login on every refresh. verifyToken() clears the token and resets
  // state if it is missing, invalid, or expired.
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      verifyToken(token)
    } else {
      setIsAuthenticated(false)
      setUser(null)
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    let stopped = false
    let checking = false
    const ensureConnected = async () => {
      if (checking || stopped) return
      checking = true
      try {
        const statuses = await readSharedStatuses()
        if (!stopped && localStorage.getItem('auth_token') && providers.some(p => statuses[p].state === 'Connection failed')) await connectSharedAccounts()
      } catch { /* Connection settings displays retry and provider status. */ }
      finally { checking = false }
    }
    ensureConnected()
    const timer = window.setInterval(ensureConnected, 60000)
    return () => { stopped = true; clearInterval(timer) }
  }, [isAuthenticated])

  const verifyToken = async (token: string) => {
    try {
      // Timeout so an unreachable backend can't freeze the whole app on the
      // full-screen auth LoadingScreen — on timeout we drop to the login page.
      const response = await fetchWithTimeout(getApiUrl('/api/auth/verify'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setIsAuthenticated(true)
          setUser({ 
            username: data.username || data.email?.split('@')[0] || 'User', 
            email: data.email || data.username || '', 
            role: data.role || 'viewer'
          })
          // Sync with SettingsContext
          const settings = localStorage.getItem('tao-digital-settings')
          if (settings) {
            const parsed = JSON.parse(settings)
            parsed.userProfile = {
              name: data.username || data.email?.split('@')[0] || 'User',
              email: data.email || data.username || '',
              role: data.role || 'viewer'
            }
            localStorage.setItem('tao-digital-settings', JSON.stringify(parsed))
          }
        } else {
          localStorage.removeItem('auth_token')
        }
      } else {
        localStorage.removeItem('auth_token')
      }
    } catch (error) {
      console.error('Token verification failed:', error)
      localStorage.removeItem('auth_token')
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (username: string, password: string): Promise<LoginResult> => {
    let response: Response
    try {
      response = await fetchWithTimeout(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })
    } catch (error) {
      console.error('Login error:', error)
      return {
        success: false,
        reason: 'network',
        message: "Can't reach the FalconX server. Check that the backend is running and reachable, then try again."
      }
    }

    let data: any = null
    try {
      data = await response.json()
    } catch { /* non-JSON response (e.g. proxy error page) */ }

    if (data?.success && data?.token) {
        sessionStorage.removeItem('auth_notice')
        localStorage.setItem('auth_token', data.token)
        const userData = {
          username: data.username || username,
          email: data.email || `${username}@tao.local`,
          role: data.role || 'viewer'
        }
        setIsAuthenticated(true)
        setUser(userData)
        
        // Sync with SettingsContext
        const settings = localStorage.getItem('tao-digital-settings')
        if (settings) {
          const parsed = JSON.parse(settings)
          parsed.userProfile = {
            name: userData.username,
            email: userData.email,
            role: userData.role
          }
          localStorage.setItem('tao-digital-settings', JSON.stringify(parsed))
        } else {
          // Create new settings with user profile
          const newSettings = {
            jiraUrl: '',
            jiraEmail: '',
            jiraToken: '',
            confluenceUrl: '',
            githubToken: '',
            slackToken: '',
            slackChannel: '',
            userProfile: {
              name: userData.username,
              email: userData.email,
              role: userData.role
            }
          }
          localStorage.setItem('tao-digital-settings', JSON.stringify(newSettings))
        }
        
        return { success: true }
      }

    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : (data?.message || `HTTP ${response.status}`)
      return {
        success: false,
        reason: 'server-error',
        message: `Sign-in failed on the server: ${String(detail).slice(0, 160)}`
      }
    }

    console.error('Login failed:', data?.message)
    return {
      success: false,
      reason: 'rejected',
      message: data?.message || 'Invalid username or password'
    }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setIsAuthenticated(false)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

