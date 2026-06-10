'use client'

import React from 'react'
import { useAuth } from './contexts/AuthContext'
import { IntegratedLoginPage } from './components/IntegratedLoginPage'
import NewFigmaApp from './components/figma/NewFigmaApp'
import { LoadingScreen } from './components/LoadingComponents'

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <IntegratedLoginPage />
  }

  return <NewFigmaApp />
}