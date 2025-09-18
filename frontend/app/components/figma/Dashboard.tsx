'use client'

import React from 'react'
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Progress } from '../ui/progress'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Target, 
  Calendar, 
  Clock,
  Award,
  AlertCircle,
  CheckCircle,
  Zap,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Filter,
  Eye,
  Star,
  GitBranch,
  MessageCircle,
  Code,
  Timer,
  Flag,
  Crown,
  Sparkles,
  Command,
  Shield,
  Database,
  Monitor,
  Workflow,
  Layers
} from 'lucide-react'

interface FigmaDashboardProps {
  hasActiveConnections: boolean
  theme: 'light' | 'dark'
}

// Custom hook for scroll animations
const useScrollAnimation = () => {
  const ref = React.useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  return { ref, isInView }
}

// Animated counter component
const AnimatedNumber = ({ value, duration = 2 }: { value: number; duration?: number }) => {
  const motionValue = useMotionValue(0)
  const springValue = useSpring(motionValue, { duration: duration * 1000, bounce: 0 })
  const display = useTransform(springValue, (current) => Math.round(current))

  React.useEffect(() => {
    motionValue.set(value)
  }, [motionValue, value])

  return <motion.span>{display}</motion.span>
}

export function FigmaDashboard({ hasActiveConnections, theme }: FigmaDashboardProps) {
  const { ref: metricsRef, isInView: metricsInView } = useScrollAnimation()
  const { ref: chartsRef, isInView: chartsInView } = useScrollAnimation()

  const metrics = [
    {
      title: "Performance",
      value: 87,
      change: "+12%",
      trend: "up",
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Velocity",
      value: 94,
      change: "+8%",
      trend: "up",
      icon: Zap,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Quality",
      value: 91,
      change: "+5%",
      trend: "up",
      icon: Star,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Completion",
      value: 78,
      change: "-3%",
      trend: "down",
      icon: Target,
      color: "text-[var(--accent-warning)]",
      bgColor: "bg-gradient-to-r from-[var(--accent-warning)]/10 to-[var(--accent-warning)]/5",
    }
  ]

  const recentActivities = [
    {
      id: 1,
      type: "sprint",
      title: "Sprint 23 completed",
      description: "All planned features delivered on time",
      time: "2h ago",
      status: "success",
      icon: CheckCircle
    },
    {
      id: 2,
      type: "code",
      title: "Code review completed",
      description: "15 pull requests reviewed and merged",
      time: "4h ago",
      status: "success",
      icon: GitBranch
    },
    {
      id: 3,
      type: "meeting",
      title: "Team standup",
      description: "Daily sync completed with 8 team members",
      time: "6h ago",
      status: "info",
      icon: Users
    },
    {
      id: 4,
      type: "alert",
      title: "Performance alert",
      description: "Response time increased by 15%",
      time: "8h ago",
      status: "warning",
      icon: AlertCircle
    }
  ]

  const teamMembers = [
    { name: "Alex Chen", role: "Tech Lead", avatar: "AC", status: "online", tasks: 8 },
    { name: "Sarah Kim", role: "Frontend Dev", avatar: "SK", status: "online", tasks: 6 },
    { name: "Mike Johnson", role: "Backend Dev", avatar: "MJ", status: "away", tasks: 4 },
    { name: "Emma Davis", role: "QA Engineer", avatar: "ED", status: "online", tasks: 7 },
    { name: "David Wilson", role: "DevOps", avatar: "DW", status: "offline", tasks: 3 }
  ]

  return (
    <ScrollArea className="h-full">
      <div className={`p-4 space-y-4 transition-all duration-500 ease-in-out ${
        theme === 'dark' ? 'bg-[var(--bg-primary)]' : 'bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100'
      }`}>
        {/* Compact Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <motion.div
              className="w-6 h-6 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-md flex items-center justify-center"
              animate={{
                rotate: [0, 3, -3, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <TrendingUp className="w-3 h-3 text-white" />
            </motion.div>
          <div>
              <h1 className={`text-xl font-semibold ${
                theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
              }`}>Leadership Insights</h1>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'
              }`}>
                Advanced analytics and strategic intelligence
            </p>
          </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" className={`flex items-center space-x-1 h-7 px-2 ${
              theme === 'dark' 
                ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/5' 
                : 'text-gray-500 hover:text-gray-900 hover:bg-blue-50'
            }`}>
              <Filter className="w-3 h-3" />
              <span className="text-xs">Filter</span>
            </Button>
            <Button size="sm" className="flex items-center space-x-1 h-7 px-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white">
              <Download className="w-3 h-3" />
              <span className="text-xs">Export</span>
            </Button>
          </div>
        </motion.div>

        {/* Compact Metrics Grid */}
        <motion.div
          ref={metricsRef}
          initial={{ opacity: 0, y: 30 }}
          animate={metricsInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.title}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={metricsInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
              whileHover={{ scale: 1.02, y: -1 }}
            >
              <Card className={`${metric.bgColor} hover:shadow-lg transition-all duration-300 ${
                theme === 'dark' ? 'border border-[var(--border-subtle)]' : ''
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className={`text-xs font-medium ${
                        theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'
                      }`}>{metric.title}</p>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-xl font-bold ${
                          theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
                        }`}>
                          {metricsInView ? <AnimatedNumber value={metric.value} /> : 0}%
                        </span>
                        <div className={`flex items-center space-x-0.5 text-xs ${
                          metric.trend === 'up' ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {metric.trend === 'up' ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          <span>{metric.change}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`p-2 rounded-md ${metric.bgColor}`}>
                      <metric.icon className={`w-4 h-4 ${metric.color}`} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress 
                      value={metric.value} 
                      className="h-1.5"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Compact Charts and Activities */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Performance Chart */}
          <motion.div
            ref={chartsRef}
            initial={{ opacity: 0, x: -30 }}
            animate={chartsInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-2"
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className={`flex items-center space-x-2 text-base ${theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'}`}>
                  <BarChart3 className="w-4 h-4" />
                  <span>Performance Trends</span>
                </CardTitle>
                <CardDescription className={`text-xs ${theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'}`}>
                  Performance metrics over the last 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-center justify-center bg-[var(--bg-tertiary)]/20 rounded-lg">
                  <div className="text-center space-y-2">
                    <BarChart3 className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
                    <p className="text-sm text-[var(--text-muted)]">Performance chart will be rendered here</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Integration with charting library needed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Activities */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={chartsInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className={`flex items-center space-x-2 text-base ${theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'}`}>
                  <Activity className="w-4 h-4" />
                  <span>Recent Activities</span>
                </CardTitle>
                <CardDescription className={`text-xs ${theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'}`}>
                  Latest updates from your team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivities.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={chartsInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.3, delay: 0.6 + index * 0.1 }}
                      className="flex items-start space-x-2 p-2 rounded-lg hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                    >
                      <div className={`p-1.5 rounded-md ${
                        activity.status === 'success' ? 'bg-green-500/10' :
                        activity.status === 'warning' ? 'bg-orange-500/10' :
                        'bg-blue-500/10'
                      }`}>
                        <activity.icon className={`w-3 h-3 ${
                          activity.status === 'success' ? 'text-green-500' :
                          activity.status === 'warning' ? 'text-orange-500' :
                          'text-blue-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs text-[var(--text-primary)]">{activity.title}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{activity.description}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{activity.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Compact Team Members */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className={`flex items-center space-x-2 text-base ${theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'}`}>
                <Users className="w-4 h-4" />
                <span>Team Members</span>
              </CardTitle>
              <CardDescription className={`text-xs ${theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'}`}>
                Current team status and workload
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {teamMembers.map((member, index) => (
                  <motion.div
                    key={member.name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.8 + index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    className={`flex items-center space-x-2 p-3 rounded-lg transition-colors ${
                      theme === 'dark' 
                        ? 'hover:bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)]'
                        : 'hover:bg-[var(--bg-tertiary)]/50'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-[var(--accent-primary)]">{member.avatar}</span>
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${
                        member.status === 'online' ? 'bg-green-500' :
                        member.status === 'away' ? 'bg-yellow-500' :
                        'bg-gray-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-xs ${
                        theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'
                      }`}>{member.name}</p>
                      <p className={`text-xs ${
                        theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'
                      }`}>{member.role}</p>
                      <div className="flex items-center space-x-1 mt-1">
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {member.tasks} tasks
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className={`text-xs px-1 py-0 ${
                            member.status === 'online' ? 'text-green-500' :
                            member.status === 'away' ? 'text-yellow-500' :
                            theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'
                          }`}
                        >
                          {member.status}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Compact Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className={`flex items-center space-x-2 text-base ${theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'}`}>
                <Zap className="w-4 h-4" />
                <span>Quick Actions</span>
              </CardTitle>
              <CardDescription className={`text-xs ${theme === 'dark' ? 'text-[var(--text-muted)]' : 'text-gray-500'}`}>
                Common tasks and shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: MessageCircle, label: "Start Chat", color: "text-blue-500" },
                  { icon: Calendar, label: "Schedule Meeting", color: "text-green-500" },
                  { icon: Code, label: "Code Review", color: "text-purple-500" },
                  { icon: Crown, label: "Leadership Access", color: "text-yellow-500" }
                ].map((action, index) => (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 1.0 + index * 0.1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      variant="outline"
                      className="w-full h-16 flex flex-col items-center justify-center space-y-1 hover:bg-[var(--accent-primary)]/5 transition-colors"
                    >
                      <action.icon className={`w-4 h-4 ${action.color}`} />
                      <span className={`text-xs font-medium ${theme === 'dark' ? 'text-[var(--text-primary)]' : 'text-gray-900'}`}>{action.label}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </ScrollArea>
  )
}
