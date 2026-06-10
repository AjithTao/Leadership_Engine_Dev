'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface SettingsData {
  jiraUrl: string
  jiraEmail: string
  jiraToken: string
  confluenceUrl: string
  githubToken: string
  slackToken: string
  slackChannel: string
  salesforceInstanceUrl: string
  salesforceClientId: string
  userProfile: {
    name: string
    email: string
    role: string
  }
}

interface SettingsContextType {
  settings: SettingsData
  updateSettings: (newSettings: Partial<SettingsData>) => void
  updateUserProfile: (profile: Partial<SettingsData['userProfile']>) => void
  isLoaded: boolean
}

const defaultSettings: SettingsData = {
  jiraUrl: '',
  jiraEmail: '',
  jiraToken: '',
  confluenceUrl: '',
  githubToken: '',
  slackToken: '',
  slackChannel: '',
  salesforceInstanceUrl: '',
  salesforceClientId: '',
  userProfile: {
    name: 'Alex Chen',
    email: 'alex.chen@company.com',
    role: 'Senior Engineering Manager'
  }
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

interface SettingsProviderProps {
  children: React.ReactNode
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsData>(defaultSettings)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('cdk-digital-settings')
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings)
        setSettings({ ...defaultSettings, ...parsedSettings })
      }
    } catch (error) {
      console.error('Error loading settings from localStorage:', error)
    } finally {
      setIsLoaded(true)
    }
  }, [])

  // Sync user profile with AuthContext when user logs in
  useEffect(() => {
    const authUser = localStorage.getItem('auth_token')
    if (authUser) {
      // User profile is synced by AuthContext during login
      // This effect ensures SettingsContext picks it up
      const savedSettings = localStorage.getItem('cdk-digital-settings')
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          if (parsed.userProfile) {
            setSettings(prev => ({
              ...prev,
              userProfile: parsed.userProfile
            }))
          }
        } catch (error) {
          console.error('Error syncing user profile:', error)
        }
      }
    }
  }, [])

  // Save settings to localStorage whenever settings change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem('cdk-digital-settings', JSON.stringify(settings))
      } catch (error) {
        console.error('Error saving settings to localStorage:', error)
      }
    }
  }, [settings, isLoaded])

  const updateSettings = (newSettings: Partial<SettingsData>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }

  const updateUserProfile = (profile: Partial<SettingsData['userProfile']>) => {
    setSettings(prev => ({
      ...prev,
      userProfile: { ...prev.userProfile, ...profile }
    }))
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      updateUserProfile,
      isLoaded
    }}>
      {children}
    </SettingsContext.Provider>
  )
}
