'use client'
import { useAuth } from '../contexts/AuthContext'
import { IntegratedLoginPage } from './IntegratedLoginPage'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Checking your session…</div>
  return isAuthenticated ? <>{children}</> : <IntegratedLoginPage />
}
