'use client'

import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
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

export function UserMenu() {
  const { userDetails, updateUserDetails, saveUserDetails } = useUser()
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

  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{userDetails.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Principal QA Engineer</p>
        </div>
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">AK</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50">
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  User Profile
                </CardTitle>
                {!isEditing ? (
                  <Button variant="ghost" size="sm" onClick={handleEdit}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                ) : (
                  <div className="flex space-x-1">
                    <Button variant="ghost" size="sm" onClick={handleSave}>
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancel}>
                      <X className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* User Name */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  Full Name
                </Label>
                {isEditing ? (
                  <Input
                    value={editDetails.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                  />
                ) : (
                  <p className="text-sm text-gray-900 dark:text-white">{userDetails.name}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Address
                </Label>
                {isEditing ? (
                  <Input
                    value={editDetails.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                  />
                ) : (
                  <p className="text-sm text-gray-900 dark:text-white">{userDetails.email}</p>
                )}
              </div>

              {/* Atlassian Account */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <Key className="w-4 h-4 mr-2" />
                  Atlassian Account
                </Label>
                {isEditing ? (
                  <Input
                    value={editDetails.atlassianAccount}
                    onChange={(e) => handleInputChange('atlassianAccount', e.target.value)}
                    className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                  />
                ) : (
                  <p className="text-sm text-gray-900 dark:text-white">{userDetails.atlassianAccount}</p>
                )}
              </div>

              {/* API Token */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <Key className="w-4 h-4 mr-2" />
                  API Token
                </Label>
                {isEditing ? (
                  <Input
                    type="password"
                    value={editDetails.apiToken}
                    onChange={(e) => handleInputChange('apiToken', e.target.value)}
                    className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                    placeholder="Enter your API token"
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900 dark:text-white">
                      {userDetails.apiToken ? '••••••••••••••••' : 'Not set'}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      Protected
                    </Badge>
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <Button 
                    onClick={handleSave} 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
