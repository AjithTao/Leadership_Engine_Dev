// Migrate display preferences only; never copy saved integration credentials.
export function migratePreferences() {
  const safe = (value: any): any => {
    if (Array.isArray(value)) return value.map(safe)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/token|password|secret|credential/i.test(key))
      .map(([key, child]) => [key, safe(child)]))
  }
  Object.keys(localStorage).filter(key => key.startsWith('cdk-')).forEach(key => {
    const target = key.replace(/^cdk-/, 'tao-')
    try {
      if (!/token|password|secret|credential/i.test(key) && !localStorage.getItem(target)) {
        const raw = localStorage.getItem(key) || ''
        let value = raw
        try { value = JSON.stringify(safe(JSON.parse(raw))) } catch { /* Plain text preference. */ }
        localStorage.setItem(target, value)
      }
      localStorage.removeItem(key)
    } catch { /* Ignore malformed legacy settings. */ }
  })
  ;['jira_config', 'confluence_config', 'github_config', 'atlassian-config', 'github-config'].forEach(key => localStorage.removeItem(key))
}
