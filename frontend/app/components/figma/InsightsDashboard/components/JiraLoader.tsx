'use client'

import React from 'react';
import { DashboardLayout } from '../../../DashboardLayout';

// Official Jira mark (three-chevron logo), tinted to the app accent and breathing as a
// loading indicator — aligned with the GitHub Insights connecting animation.
function JiraMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'block', color: 'var(--accent-cool)', animation: 'logo-breathe 1.4s ease-in-out infinite' }}
    >
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z" />
    </svg>
  );
}

/** Full-screen Jira-logo loading animation used by the Jira-backed dashboards. */
export function JiraLoader({ message = 'Connecting to Jira…' }: { message?: string }) {
  return (
    <DashboardLayout>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <JiraMark size={48} />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
