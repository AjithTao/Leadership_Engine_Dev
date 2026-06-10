'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getApiUrl } from '../../lib/api-config'

interface AuthContextType {
  isAuthenticated: boolean
  user: { username: string; email: string; role: string } | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<{ username: string; email: string; role: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Don't auto-authenticate on mount - always start from login page
  // Users must login every time the app launches
  useEffect(() => {
    // Clear any existing token to force fresh login
    localStorage.removeItem('auth_token')
    setIsAuthenticated(false)
    setUser(null)
    setIsLoading(false)
  }, [])

  const verifyToken = async (token: string) => {
    try {
      const response = await fetch(getApiUrl('/api/auth/verify'), {
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

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (data.success && data.token) {
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
        
        return true
      } else {
        console.error('Login failed:', data.message)
        return false
      }
    } catch (error) {
      console.error('Login error:', error)
      return false
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

