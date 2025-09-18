import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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
  FileText,
  Calendar,
  Filter,
  MoreVertical,
  ChevronDown,
  Eye,
  EyeOff,
  Settings,
  Bell,
  Search,
  Plus,
  Minus,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { exportInsightsAsPDF } from '../../utils/exportUtils';

interface Project {
  id: string;
  key: string;
  name: string;
}

interface JiraMetrics {
  totalIssues: number;
  resolvedIssues: number;
  openIssues: number;
  bugs: number;
  stories: number;
  tasks: number;
  epics: number;
  subtasks: number;
  storyPoints: number;
  sprintVelocity: number;
  avgResolutionTime: number;
  issuesByStatus: Record<string, number>;
  issuesByPriority: Record<string, number>;
  issuesByAssignee: Record<string, number>;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  user: string;
  timestamp: string;
  project: string;
}

interface Performer {
  name: string;
  issuesResolved: number;
  issuesCreated: number;
  avgResolutionTime: number;
  storyPoints: number;
  bugsFixed: number;
  tasksCompleted: number;
  performanceScore: number;
  lastActive: string;
}

export default function InsightsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [jiraMetrics, setJiraMetrics] = useState<JiraMetrics | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [bestPerformers, setBestPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, []);

  // Calculate best performers when jiraMetrics changes
  useEffect(() => {
    if (jiraMetrics && jiraMetrics.issuesByAssignee) {
      console.log('jiraMetrics changed, calculating best performers...');
      fetchBestPerformers();
    }
  }, [jiraMetrics]);

  // Load cached data on mount
  useEffect(() => {
    loadCachedData();
    fetchData();
  }, [selectedProject]);

  const loadCachedData = () => {
    try {
      const cachedProjects = localStorage.getItem('jira-projects');
      const cachedMetrics = localStorage.getItem('jira-metrics');
      const cachedActivities = localStorage.getItem('recent-activities');
      const cachedLastRefresh = localStorage.getItem('last-refresh');

      if (cachedProjects) setProjects(JSON.parse(cachedProjects));
      if (cachedMetrics) setJiraMetrics(JSON.parse(cachedMetrics));
      if (cachedActivities) setRecentActivities(JSON.parse(cachedActivities));
      if (cachedLastRefresh) setLastRefresh(new Date(cachedLastRefresh));
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/jira/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      
      const data = await response.json();
      const projectsList = Array.isArray(data) ? data : (data.projects || []);
      console.log('Fetched projects:', projectsList);
      
      setProjects(projectsList);
      localStorage.setItem('jira-projects', JSON.stringify(projectsList));
      
      return projectsList;
    } catch (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
  };

  const fetchMetrics = async (projectKey: string | null) => {
    try {
      const url = projectKey && projectKey !== 'all' 
        ? `/api/jira/metrics?project=${projectKey}` 
        : '/api/jira/metrics';
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      
      const data = await response.json();
      console.log('Fetched metrics:', data);
      
      if (data.success) {
        setJiraMetrics(data.metrics);
        localStorage.setItem('jira-metrics', JSON.stringify(data.metrics));
        return data.metrics;
      }
      return null;
    } catch (error) {
      console.error('Error fetching metrics:', error);
      return null;
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await fetch('/api/activities/recent');
      if (!response.ok) throw new Error('Failed to fetch activities');
      
      const data = await response.json();
      const activities = data.activities || [];
      setRecentActivities(activities);
      localStorage.setItem('recent-activities', JSON.stringify(activities));
      return activities;
    } catch (error) {
      console.error('Error fetching activities:', error);
      return [];
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchProjects(),
        fetchMetrics(selectedProject === 'all' ? null : selectedProject),
        fetchActivities()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data. Using cached data if available.');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchProjects(),
        fetchMetrics(selectedProject === 'all' ? null : selectedProject),
        fetchActivities()
      ]);
      setLastRefresh(new Date());
      localStorage.setItem('last-refresh', new Date().toISOString());
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Using cached data if available.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const calculateResolutionRate = () => {
    if (!jiraMetrics) return 0;
    return jiraMetrics.totalIssues > 0 ? Math.round((jiraMetrics.resolvedIssues / jiraMetrics.totalIssues) * 100) : 0;
  };

  const getTopAssignees = () => {
    if (!jiraMetrics?.issuesByAssignee) return [];
    return Object.entries(jiraMetrics.issuesByAssignee)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  };

  const getStatusDistribution = () => {
    if (!jiraMetrics?.issuesByStatus) return [];
    return Object.entries(jiraMetrics.issuesByStatus)
      .sort(([,a], [,b]) => b - a)
      .map(([status, count]) => ({ status, count }));
  };

  const getPriorityDistribution = () => {
    if (!jiraMetrics?.issuesByPriority) return [];
    return Object.entries(jiraMetrics.issuesByPriority)
      .sort(([,a], [,b]) => b - a)
      .map(([priority, count]) => ({ priority, count }));
  };

  const calculateBestPerformers = (): Performer[] => {
    if (!jiraMetrics?.issuesByAssignee) {
      console.log('No issuesByAssignee data, returning empty array');
      return [];
    }

    console.log('Calculating best performers from issuesByAssignee:', jiraMetrics.issuesByAssignee);

    const performers: Performer[] = Object.entries(jiraMetrics.issuesByAssignee).map(([name, totalIssues]) => {
      // Mock additional metrics for demonstration
      const issuesResolved = Math.floor(totalIssues * 0.7); // Assume 70% resolved
      const issuesCreated = Math.floor(totalIssues * 0.3); // Assume 30% created
      const avgResolutionTime = Math.floor(Math.random() * 5) + 1; // 1-5 days
      const storyPoints = Math.floor(totalIssues * 2.5); // Assume 2.5 story points per issue
      const bugsFixed = Math.floor(totalIssues * 0.2); // Assume 20% are bugs
      const tasksCompleted = Math.floor(totalIssues * 0.5); // Assume 50% are tasks
      
      // Calculate performance score (weighted combination)
      const performanceScore = (
        issuesResolved * 0.3 +
        storyPoints * 0.25 +
        bugsFixed * 0.2 +
        tasksCompleted * 0.15 +
        (10 - avgResolutionTime) * 0.1
      );

      return {
        name,
        issuesResolved,
        issuesCreated,
        avgResolutionTime,
        storyPoints,
        bugsFixed,
        tasksCompleted,
        performanceScore,
        lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
    });

    // Sort by performance score and return top 5
    const sortedPerformers = performers
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 5);
    
    console.log('Final sorted performers:', sortedPerformers);
    return sortedPerformers;
  };

  const fetchBestPerformers = async () => {
    try {
      console.log('Calculating best performers...');
      console.log('jiraMetrics:', jiraMetrics);
      console.log('issuesByAssignee:', jiraMetrics?.issuesByAssignee);
      
      const performers = calculateBestPerformers();
      console.log('Calculated performers:', performers);
      setBestPerformers(performers);
    } catch (error) {
      console.error('Error fetching best performers:', error);
    }
  };

  // Export dashboard as PDF
  const handleExportPDF = async () => {
    try {
      await exportInsightsAsPDF('insights-dashboard', `insights-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  if (loading && !jiraMetrics) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <RefreshCw className="h-12 w-12 mx-auto mb-6 text-blue-500 dark:text-blue-400" />
          </motion.div>
          <motion.h2 
            className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Loading Analytics
          </motion.h2>
          <motion.p 
            className="text-gray-600 dark:text-gray-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Fetching real-time data from your workspace...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return (
    <div id="insights-dashboard" className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="p-8 space-y-8">
        {/* Modern Header */}
        <motion.div 
          className="relative overflow-hidden"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-indigo-500/5" />
          
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-2">
                <motion.h1 
                  className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 dark:from-blue-400 dark:via-purple-400 dark:to-indigo-400 bg-clip-text text-transparent"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Analytics Dashboard
                </motion.h1>
                <motion.p 
                  className="text-gray-700 dark:text-gray-300 text-lg"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  Real-time insights from your Jira workspace
                </motion.p>
              </div>
              
              {/* Header Actions */}
              <motion.div 
                className="flex items-center space-x-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                {/* Project Selector */}
                <div className="relative">
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="w-64 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 shadow-lg rounded-xl">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-slate-200 dark:border-slate-700 rounded-xl">
                      <SelectItem value="all" className="text-gray-900 dark:text-gray-100">All Projects</SelectItem>
                      {Array.isArray(projects) && projects.map((project) => (
                        <SelectItem key={project.id} value={project.key} className="text-gray-900 dark:text-gray-100">
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-3">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      onClick={refreshData} 
                      disabled={isRefreshing}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg border-0 rounded-xl"
                      size="sm"
                    >
                      <motion.div
                        animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                        transition={{ duration: 1, repeat: isRefreshing ? Infinity : 0 }}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                      </motion.div>
                      Refresh
                    </Button>
                  </motion.div>
                  
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      onClick={handleExportPDF}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg border-0 rounded-xl"
                      size="sm"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Export PDF
                    </Button>
                  </motion.div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="rounded-xl"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* Error Alert */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <Alert variant="destructive" className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border-red-200 dark:border-red-800 rounded-xl">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <AlertDescription className="text-red-800 dark:text-red-200">
                      {error}. Using cached data if available.
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Last Refresh */}
            <motion.div 
              className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Clock className="h-4 w-4" />
              <span>Last updated: {lastRefresh.toLocaleString()}</span>
              {isRefreshing && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <RefreshCw className="h-4 w-4" />
                </motion.div>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* Key Metrics Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Total Issues */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Issues</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {jiraMetrics?.totalIssues?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                    +12.5% from last month
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Resolved Issues */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Resolved Issues</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {jiraMetrics?.resolvedIssues?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                    {calculateResolutionRate()}% resolution rate
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Story Points */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Story Points</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {jiraMetrics?.storyPoints?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <Star className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                    +8.2% from last sprint
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Average Resolution Time */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Resolution</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {jiraMetrics?.avgResolutionTime || 0}d
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                  <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                    +2.1 days from last month
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Issues by Status */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                  <span>Issues by Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getStatusDistribution().map((item, index) => (
                    <motion.div
                      key={item.status}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + index * 0.1 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          index === 0 ? 'bg-blue-500' :
                          index === 1 ? 'bg-green-500' :
                          index === 2 ? 'bg-yellow-500' :
                          index === 3 ? 'bg-red-500' :
                          'bg-gray-500'
                        }`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {item.status}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {item.count}
                        </span>
                        <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <motion.div
                            className={`h-2 rounded-full ${
                              index === 0 ? 'bg-blue-500' :
                              index === 1 ? 'bg-green-500' :
                              index === 2 ? 'bg-yellow-500' :
                              index === 3 ? 'bg-red-500' :
                              'bg-gray-500'
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / Math.max(...getStatusDistribution().map(s => s.count))) * 100}%` }}
                            transition={{ duration: 1, delay: 0.8 + index * 0.1 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Issues by Priority */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <PieChart className="w-5 h-5 text-purple-500" />
                  <span>Issues by Priority</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getPriorityDistribution().map((item, index) => (
                    <motion.div
                      key={item.priority}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + index * 0.1 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          index === 0 ? 'bg-red-500' :
                          index === 1 ? 'bg-orange-500' :
                          index === 2 ? 'bg-yellow-500' :
                          index === 3 ? 'bg-green-500' :
                          'bg-gray-500'
                        }`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {item.priority}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {item.count}
                        </span>
                        <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <motion.div
                            className={`h-2 rounded-full ${
                              index === 0 ? 'bg-red-500' :
                              index === 1 ? 'bg-orange-500' :
                              index === 2 ? 'bg-yellow-500' :
                              index === 3 ? 'bg-green-500' :
                              'bg-gray-500'
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / Math.max(...getPriorityDistribution().map(p => p.count))) * 100}%` }}
                            transition={{ duration: 1, delay: 0.8 + index * 0.1 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Best Performers Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 shadow-xl rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <span>Best Performers</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bestPerformers.length > 0 ? (
                <div className="space-y-4">
                  {bestPerformers.map((performer, index) => (
                    <motion.div
                      key={performer.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 + index * 0.1 }}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-600/50 rounded-xl"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                          index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400' :
                          index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                          'bg-gradient-to-r from-blue-400 to-blue-500'
                        }`}>
                          {index === 0 ? <Crown className="w-5 h-5 text-white" /> :
                           index === 1 ? <Medal className="w-5 h-5 text-white" /> :
                           index === 2 ? <Award className="w-5 h-5 text-white" /> :
                           <Star className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{performer.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {performer.issuesResolved} resolved • {performer.storyPoints} story points
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {Math.round(performer.performanceScore)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">score</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No performance data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}