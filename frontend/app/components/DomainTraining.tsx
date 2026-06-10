'use client'

import React, { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'

type DomainStatus = {
  indexed: boolean
  name?: string
  source_path?: string
  chunks?: number
  updated_at?: string
  index_path?: string
}

export default function DomainTraining() {
  const { currentTheme, isDarkMode } = useTheme()
  const [status, setStatus] = useState<DomainStatus | null>(null)
  const [uploading, setUploading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string>('')
  const [error, setError] = useState<string>('')

  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

  const loadStatus = async () => {
    try {
      const resp = await fetch(`${base}/api/domain/status`)
      const data = await resp.json()
      setStatus(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load status')
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const onUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setAnswer('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('name', 'domain-training')
      const resp = await fetch(`${base}/api/domain/upload`, { method: 'POST', body: form })
      const data = await resp.json()
      if (!resp.ok || data?.success === false) {
        throw new Error(data?.detail || data?.error || 'Upload failed')
      }
      await loadStatus()
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      evt.target.value = ''
    }
  }

  const onAsk = async () => {
    if (!question.trim()) return
    setAsking(true)
    setError('')
    setAnswer('')
    try {
      const resp = await fetch(`${base}/api/domain/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      })
      const data = await resp.json()
      if (!resp.ok || data?.error) {
        throw new Error(data?.detail || data?.error || 'QA failed')
      }
      setAnswer(data.answer || '')
    } catch (e: any) {
      setError(e?.message || 'QA failed')
    } finally {
      setAsking(false)
    }
  }

  const onClear = () => {
    setQuestion('')
    setAnswer('')
    setError('')
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2
          className="text-xl font-semibold"
          style={{ color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text }}
        >
          Domain Training
        </h2>
        <p
          className="text-sm"
          style={{ color: isDarkMode ? currentTheme.colors.textSecondary : currentTheme.colors.textSecondary }}
        >
          Upload the onboarding/training document and ask questions about it.
        </p>
      </div>

      {error && (
        <div
          className="p-2 rounded text-sm"
          style={{ backgroundColor: isDarkMode ? '#7f1d1d33' : '#fee2e2', color: isDarkMode ? '#fecaca' : '#991b1b' }}
        >
          {error}
        </div>
      )}

      <div
        className="rounded p-4 border"
        style={{
          backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
          borderColor: currentTheme.colors.border
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium" style={{ color: currentTheme.colors.text }}>Index status</div>
            <div className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
              {status?.indexed ? 'Indexed' : 'Not indexed'}
              {status?.chunks != null && ` • ${status.chunks} chunks`}
              {status?.updated_at && ` • updated ${new Date(status.updated_at).toLocaleString()}`}
            </div>
            {status?.source_path && (
              <div className="text-xs break-all" style={{ color: currentTheme.colors.textSecondary }}>{status.source_path}</div>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="file" className="hidden" onChange={onUpload} accept=".pdf,.docx,.md,.txt" />
            <span
              className="px-3 py-1 rounded text-white"
              style={{ background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})` }}
            >
              {uploading ? 'Uploading…' : 'Upload & Index'}
            </span>
          </label>
        </div>
      </div>

      <div
        className="rounded p-4 border space-y-2"
        style={{
          backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
          borderColor: currentTheme.colors.border
        }}
      >
        <div className="text-sm font-medium" style={{ color: currentTheme.colors.text }}>Ask a question</div>
        <textarea
          className="w-full rounded p-2 text-sm border"
          rows={3}
          placeholder="e.g., What are the expectations for the first week?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{
            backgroundColor: isDarkMode ? currentTheme.colors.surface : '#fff',
            borderColor: currentTheme.colors.border,
            color: currentTheme.colors.text
          }}
        />
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded text-white"
            onClick={onAsk}
            disabled={asking}
            style={{
              opacity: asking ? 0.7 : 1,
              background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`
            }}
          >
            {asking ? 'Asking…' : 'Ask'}
          </button>
          <button
            className="px-3 py-1 rounded"
            onClick={onClear}
            style={{
              color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
              border: `1px solid ${currentTheme.colors.border}`,
              backgroundColor: isDarkMode ? currentTheme.colors.surface : '#fff'
            }}
          >
            Clear
          </button>
        </div>

        {answer && (
          <div className="mt-3 p-3 rounded text-sm whitespace-pre-wrap" style={{
            backgroundColor: isDarkMode ? `${currentTheme.colors.primary}0F` : '#f9fafb',
            border: `1px solid ${currentTheme.colors.border}`,
            color: currentTheme.colors.text
          }}>{answer}</div>
        )}
      </div>
    </div>
  )
}


