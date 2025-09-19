'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { 
  RefreshCw, 
  TrendingUp, 
  Users, 
  Clock, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  BarChart3, 
  PieChart, 
  Activity, 
  Zap, 
  Sparkles, 
  ArrowUpRight, 
  Trophy, 
  Crown, 
  Star, 
  Medal, 
  Award, 
  Download, 
  FileText 
} from 'lucide-react'
import { exportInsightsAsPDF } from '../../utils/exportUtils'
import { useTheme } from '../../contexts/ThemeContext'

interface Project {
  id: string
  key: string
  name: string
}

interface JiraMetrics {
  totalIssues: number
  resolvedIssues: number
  openIssues: number
  bugs: number
  stories: number
  tasks: number
  epics: number
  subtasks: number
  storyPoints: number
  sprintVelocity: number
  avgResolutionTime: number
  issuesByStatus: Record<string, number>
  issuesByPriority: Record<string, number>
  issuesByAssignee: Record<string, number>
}

interface RecentActivity {
  id: string
  type: string
  title: string
  user: string
  timestamp: string
  project: string
}

interface Performer {
  name: string
  issuesResolved: number
  issuesCreated: number
  avgResolutionTime: number
  storyPoints: number
  efficiency: number
}

export function NewInsightsDashboard() {
  const { currentTheme, isDarkMode } = useTheme()
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [projects, setProjects] = useState<Project[]>([])
  const [metrics, setMetrics] = useState<JiraMetrics | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [topPerformers, setTopPerformers] = useState<Performer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Mock data for demonstration
  const mockMetrics: JiraMetrics = {
    totalIssues: 156,
    resolvedIssues: 98,
    openIssues: 58,
    bugs: 23,
    stories: 89,
    tasks: 44,
    epics: 12,
    subtasks: 8,
    storyPoints: 234,
    sprintVelocity: 45,
    avgResolutionTime: 3.2,
    issuesByStatus: {
      'To Do': 15,
      'In Progress': 28,
      'Done': 98,
      'Blocked': 5
    },
    issuesByPriority: {
      'High': 12,
      'Medium': 34,
      'Low': 12
    },
    issuesByAssignee: {
      'Alex Chen': 23,
      'Sarah Johnson': 18,
      'Mike Wilson': 15,
      'Lisa Brown': 12
    }
  }

  const mockRecentActivity: RecentActivity[] = [
    {
      id: '1',
      type: 'issue_created',
      title: 'Implement user authentication',
      user: 'Alex Chen',
      timestamp: '2 hours ago',
      project: 'CES-123'
    },
    {
      id: '2',
      type: 'issue_resolved',
      title: 'Fix login bug',
      user: 'Sarah Johnson',
      timestamp: '4 hours ago',
      project: 'CES-124'
    },
    {
      id: '3',
      type: 'comment_added',
      title: 'Added comments to API design',
      user: 'Mike Wilson',
      timestamp: '6 hours ago',
      project: 'CES-125'
    }
  ]

  const mockTopPerformers: Performer[] = [
    {
      name: 'Alex Chen',
      issuesResolved: 23,
      issuesCreated: 15,
      avgResolutionTime: 2.1,
      storyPoints: 67,
      efficiency: 95
    },
    {
      name: 'Sarah Johnson',
      issuesResolved: 18,
      issuesCreated: 12,
      avgResolutionTime: 2.8,
      storyPoints: 54,
      efficiency: 88
    },
    {
      name: 'Mike Wilson',
      issuesResolved: 15,
      issuesCreated: 8,
      avgResolutionTime: 3.2,
      storyPoints: 43,
      efficiency: 82
    }
  ]

  useEffect(() => {
    loadData()
  }, [selectedProject])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setMetrics(mockMetrics)
      setRecentActivity(mockRecentActivity)
      setTopPerformers(mockTopPerformers)
      setLastUpdated(new Date())
    } catch (err) {
      setError('Failed to load insights data')
      console.error('Error loading insights:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    try {
      const insightsData = {
        metrics,
        recentActivity,
        topPerformers,
        project: selectedProject,
        lastUpdated
      }
      
      await exportInsightsAsPDF(insightsData, `insights-report-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (error) {
      console.error('Failed to export PDF:', error)
    }
  }

  const StatCard = ({ title, value, icon: Icon, trend, color = "blue" }: {
    title: string
    value: string | number
    icon: React.ComponentType<{ className?: string }>
    trend?: { value: number; isPositive: boolean }
    color?: string
  }) => (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-black">{value}</p>
            {trend && (
              <div className={`flex items-center mt-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <ArrowUpRight className={`w-4 h-4 mr-1 ${
                  trend.isPositive ? 'rotate-0' : 'rotate-180'
                }`} />
                {trend.value}%
              </div>
            )}
          </div>
          <div className={`p-3 rounded-lg bg-${color}-100`}>
            <Icon className={`w-6 h-6 text-${color}-600`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="h-full bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-black">Insights Dashboard</h1>
            <p className="text-gray-600 mt-1">Analytics and performance metrics for your team</p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-48 bg-white border-gray-300">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="ces">CES Project</SelectItem>
                <SelectItem value="ccm">CCM Project</SelectItem>
                <SelectItem value="hcat">HCAT Project</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={loadData}
              disabled={loading}
              className="bg-[#FF4500] hover:bg-[#E03E00] text-white"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Grid */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Issues"
              value={metrics.totalIssues}
              icon={BarChart3}
              trend={{ value: 12, isPositive: true }}
              color="blue"
            />
            <StatCard
              title="Resolved Issues"
              value={metrics.resolvedIssues}
              icon={CheckCircle}
              trend={{ value: 8, isPositive: true }}
              color="green"
            />
            <StatCard
              title="Story Points"
              value={metrics.storyPoints}
              icon={Target}
              trend={{ value: 15, isPositive: true }}
              color="purple"
            />
            <StatCard
              title="Sprint Velocity"
              value={metrics.sprintVelocity}
              icon={TrendingUp}
              trend={{ value: 5, isPositive: true }}
              color="orange"
            />
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Recent Activity */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-black flex items-center">
                <Activity className="w-5 h-5 mr-2 text-[#FF4500]" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50">
                    <div className="w-8 h-8 bg-[#FF4500] rounded-full flex items-center justify-center flex-shrink-0">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black">{activity.title}</p>
                      <p className="text-xs text-gray-600">
                        {activity.user} • {activity.timestamp} • {activity.project}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Performers */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-black flex items-center">
                <Trophy className="w-5 h-5 mr-2 text-[#FF4500]" />
                Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="space-y-4">
                {topPerformers.map((performer, index) => (
                  <div key={performer.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600">
                          {performer.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-black">{performer.name}</p>
                        <p className="text-xs text-gray-600">{performer.issuesResolved} issues resolved</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {performer.efficiency}% efficiency
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Issue Status Breakdown */}
        {metrics && (
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-black flex items-center">
                <PieChart className="w-5 h-5 mr-2 text-[#FF4500]" />
                Issue Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(metrics.issuesByStatus).map(([status, count]) => (
                  <div key={status} className="text-center p-4 rounded-lg bg-gray-50">
                    <div className="text-2xl font-bold text-black">{count}</div>
                    <div className="text-sm text-gray-600">{status}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Last Updated */}
        {lastUpdated && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Last updated: {lastUpdated.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  )
}
