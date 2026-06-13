'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
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
          const settings = localStorage.getItem('cdk-digital-settings')
          if (settings) {
            const parsed = JSON.parse(settings)
            parsed.userProfile = {
              name: data.username || data.email?.split('@')[0] || 'User',
              email: data.email || data.username || '',
              role: data.role || 'viewer'
            }
            localStorage.setItem('cdk-digital-settings', JSON.stringify(parsed))
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
        localStorage.setItem('auth_token', data.token)
        const userData = {
          username: data.username || username,
          email: data.email || `${username}@cdk.com`,
          role: data.role || 'viewer'
        }
        setIsAuthenticated(true)
        setUser(userData)
        
        // Sync with SettingsContext
        const settings = localStorage.getItem('cdk-digital-settings')
        if (settings) {
          const parsed = JSON.parse(settings)
          parsed.userProfile = {
            name: userData.username,
            email: userData.email,
            role: userData.role
          }
          localStorage.setItem('cdk-digital-settings', JSON.stringify(parsed))
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
          localStorage.setItem('cdk-digital-settings', JSON.stringify(newSettings))
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

