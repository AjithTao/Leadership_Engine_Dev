'use client'
import NewFigmaApp from './components/figma/NewFigmaApp'
import { IntegratedLoginPage } from './components/IntegratedLoginPage'
import { useAuth } from './contexts/AuthContext'
export default function Home() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <div role="status" className="p-8">Checking your session…</div>
  return isAuthenticated ? <NewFigmaApp /> : <IntegratedLoginPage />
}
