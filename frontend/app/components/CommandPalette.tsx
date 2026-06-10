'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from './ui/input'
import { Card } from './ui/card'

interface Command {
  id: string
  title: string
  description?: string
  category: 'navigation' | 'action' | 'search' | 'export'
  icon?: React.ReactNode
  keywords: string[]
  onSelect: () => void
  hotkey?: string
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: Command[]
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filteredCommands, setFilteredCommands] = useState<Command[]>(commands)

  // Filter commands based on search
  useEffect(() => {
    if (!search) {
      setFilteredCommands(commands)
      setSelectedIndex(0)
      return
    }

    const searchLower = search.toLowerCase()
    const filtered = commands.filter(cmd =>
      cmd.title.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords.some(k => k.toLowerCase().includes(searchLower))
    )

    setFilteredCommands(filtered)
    setSelectedIndex(0)
  }, [search, commands])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => (i + 1) % filteredCommands.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length)
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].onSelect()
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-2xl shadow-xl">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search commands..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border-0 bg-transparent focus-visible:ring-0"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No commands found for "{search}"
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                className={`px-4 py-3 cursor-pointer transition-colors border-b border-border/50 last:border-0 ${
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => {
                  cmd.onSelect()
                  onClose()
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {cmd.icon && <span className="mt-1">{cmd.icon}</span>}
                    <div>
                      <div className="font-medium">{cmd.title}</div>
                      {cmd.description && (
                        <div className="text-sm text-muted-foreground">{cmd.description}</div>
                      )}
                    </div>
                  </div>
                  {cmd.hotkey && (
                    <div className="text-xs text-muted-foreground ml-4 mt-1">{cmd.hotkey}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/50">
          <span>↑ ↓ Navigate • Enter Select • Esc Close</span>
        </div>
      </Card>
    </div>
  )
}
