import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ChatProvider } from './contexts/ChatContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { UserProvider } from './contexts/UserContext'
import { LoadingScreen } from './components/LoadingComponents'

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Leadership Management Tool - TAO Digital Solutions',
  description: 'Connect • Analyze • Lead - AI-powered leadership analytics platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider>
          <UserProvider>
            <ChatProvider>
              <div className="min-h-screen bg-gray-900 transition-colors duration-200">
                {/* Main Content Area */}
                <main>
                  {children}
                </main>
              </div>
            </ChatProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
