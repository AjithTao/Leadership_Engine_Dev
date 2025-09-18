'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface UserDetails {
  name: string
  email: string
  atlassianAccount: string
  apiToken: string
}

interface UserContextType {
  userDetails: UserDetails
  updateUserDetails: (details: Partial<UserDetails>) => void
  saveUserDetails: () => void
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userDetails, setUserDetails] = useState<UserDetails>({
    name: 'Ajith Kumar',
    email: 'ajith.kumar@taodigital.com',
    atlassianAccount: 'ajith.kumar@taodigital.com',
    apiToken: ''
  })

  // Load user details from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('userDetails')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setUserDetails(prev => ({ ...prev, ...parsed }))
      } catch (error) {
        console.error('Failed to parse saved user details:', error)
      }
    }
  }, [])

  const updateUserDetails = (details: Partial<UserDetails>) => {
    setUserDetails(prev => {
      const updated = { ...prev, ...details }
      // Auto-save to localStorage
      localStorage.setItem('userDetails', JSON.stringify(updated))
      console.log('User details updated and saved:', updated)
      return updated
    })
  }

  const saveUserDetails = () => {
    localStorage.setItem('userDetails', JSON.stringify(userDetails))
    console.log('User details saved:', userDetails)
  }

  return (
    <UserContext.Provider value={{ userDetails, updateUserDetails, saveUserDetails }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
