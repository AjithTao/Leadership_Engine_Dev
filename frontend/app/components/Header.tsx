'use client'

import { UserMenu } from './UserMenu'

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gray-800/95 backdrop-blur-xl border-b border-gray-700 px-6 py-4 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">📊</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Leadership Management Tool</h1>
              <p className="text-sm text-gray-300">Connect • Analyze • Lead</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
