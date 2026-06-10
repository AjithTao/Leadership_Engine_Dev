'use client'

import React from 'react'

/** Shared layout wrapper for all Insights/Metrics dashboards - ensures consistent theme, scroll, and fit */
export function DashboardLayout({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`h-full min-h-0 flex flex-col overflow-auto ${className}`}
      style={{
        backgroundColor: 'var(--bg-page)',
        fontFamily: 'var(--font)',
      }}
    >
      {children}
    </div>
  )
}
