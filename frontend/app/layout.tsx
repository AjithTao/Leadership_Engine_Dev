import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ChatProvider } from './contexts/ChatContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { UserProvider } from './contexts/UserContext'
import { AuthProvider } from './contexts/AuthContext'
import { LoadingScreen } from './components/LoadingComponents'
import { QueryProvider } from './providers/QueryProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Leadership Management Tool - FalconX Solutions',
  description: 'Connect • Analyze • Lead - AI-powered leadership analytics platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        Flash-of-wrong-theme prevention: runs synchronously before first paint.
        Reads the persisted preference (default: dark) and applies .dark immediately,
        so :root CSS vars resolve to the correct palette before React hydrates.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('falconx-theme');if(s==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <ErrorBoundary>
          <QueryProvider>
            <ThemeProvider>
              <AuthProvider>
                <UserProvider>
                  <ChatProvider>
                    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-page)' }}>
                      {/* Main Content Area */}
                      <main>
                        {children}
                      </main>
                    </div>
                  </ChatProvider>
                </UserProvider>
              </AuthProvider>
            </ThemeProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
