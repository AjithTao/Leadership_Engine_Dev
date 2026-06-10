'use client'

import { useState } from 'react'
import {
  ChevronDown,
  User,
  Mail,
  Key,
  Save,
  Edit3,
  Check,
  X
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'

interface UserDetails {
  name: string
  email: string
  atlassianAccount: string
  apiToken: string
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

export function UserMenu() {
  const { userDetails, updateUserDetails } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editDetails, setEditDetails] = useState<UserDetails>({ ...userDetails })

  const handleEdit = () => {
    setIsEditing(true)
    setEditDetails({ ...userDetails })
  }

  const handleSave = () => {
    updateUserDetails(editDetails)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditDetails({ ...userDetails })
    setIsEditing(false)
  }

  const handleInputChange = (field: keyof UserDetails, value: string) => {
    setEditDetails(prev => ({ ...prev, [field]: value }))
  }

  const initials = userDetails.name
    ? userDetails.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'AK'

  return (
    <div style={{ position: 'relative', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{userDetails.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-primary)', margin: 0 }}>Principal QA Engineer</p>
        </div>
        <div
          style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--bg-active)', border: '1px solid var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{initials}</span>
        </div>
        <ChevronDown
          style={{
            width: 14, height: 14, color: 'var(--text-primary)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            onClick={() => setIsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              width: 320, zIndex: 50,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-medium)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 18px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>User Profile</span>
              {!isEditing ? (
                <button
                  onClick={handleEdit}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '5px 8px',
                    cursor: 'pointer', color: 'var(--text-primary)', display: 'flex',
                  }}
                >
                  <Edit3 style={{ width: 14, height: 14 }} />
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleSave}
                    style={{
                      background: 'var(--accent-cool-bg)', border: '1px solid var(--accent-cool)',
                      borderRadius: 8, padding: '5px 8px',
                      cursor: 'pointer', color: 'var(--accent-cool)', display: 'flex',
                    }}
                  >
                    <Check style={{ width: 14, height: 14 }} />
                  </button>
                  <button
                    onClick={handleCancel}
                    style={{
                      background: 'var(--red-bg)', border: '1px solid var(--red)',
                      borderRadius: 8, padding: '5px 8px',
                      cursor: 'pointer', color: 'var(--red)', display: 'flex',
                    }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              )}
            </div>

            {/* Fields */}
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Full Name */}
              <div>
                <label style={labelStyle}>
                  <User style={{ width: 12, height: 12 }} />
                  Full Name
                </label>
                {isEditing ? (
                  <input
                    value={editDetails.name}
                    onChange={e => handleInputChange('name', e.target.value)}
                    style={inputStyle}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>{userDetails.name}</p>
                )}
              </div>

              {/* Section separator */}
              <div style={{ background: 'var(--border)', height: 1 }} />

              {/* Email */}
              <div>
                <label style={labelStyle}>
                  <Mail style={{ width: 12, height: 12 }} />
                  Email Address
                </label>
                {isEditing ? (
                  <input
                    value={editDetails.email}
                    onChange={e => handleInputChange('email', e.target.value)}
                    style={inputStyle}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>{userDetails.email}</p>
                )}
              </div>

              {/* Atlassian Account */}
              <div>
                <label style={labelStyle}>
                  <Key style={{ width: 12, height: 12 }} />
                  Atlassian Account
                </label>
                {isEditing ? (
                  <input
                    value={editDetails.atlassianAccount}
                    onChange={e => handleInputChange('atlassianAccount', e.target.value)}
                    style={inputStyle}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>{userDetails.atlassianAccount}</p>
                )}
              </div>

              {/* API Token */}
              <div>
                <label style={labelStyle}>
                  <Key style={{ width: 12, height: 12 }} />
                  API Token
                </label>
                {isEditing ? (
                  <input
                    type="password"
                    value={editDetails.apiToken}
                    onChange={e => handleInputChange('apiToken', e.target.value)}
                    style={inputStyle}
                    placeholder="Enter your API token"
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
                      {userDetails.apiToken ? '••••••••••••••••' : 'Not set'}
                    </p>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        background: 'var(--bg-active)', color: 'var(--text-secondary)',
                        border: '1px solid var(--border)', borderRadius: 6,
                        padding: '2px 7px',
                      }}
                    >
                      Protected
                    </span>
                  </div>
                )}
              </div>

              {/* Save button when editing */}
              {isEditing && (
                <>
                  <div style={{ background: 'var(--border)', height: 1 }} />
                  <button
                    onClick={handleSave}
                    style={{
                      width: '100%', padding: '9px 0', borderRadius: 8, fontSize: 13,
                      fontWeight: 600, cursor: 'pointer',
                      background: 'var(--text-primary)', color: 'var(--bg-page)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <Save style={{ width: 14, height: 14 }} />
                    Save Changes
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
