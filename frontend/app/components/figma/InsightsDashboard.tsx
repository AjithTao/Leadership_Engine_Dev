import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RefreshCw, TrendingUp, Users, Clock, Target, AlertTriangle, CheckCircle, BarChart3, PieChart, Activity, Zap, Sparkles, ArrowUpRight, Trophy, Crown, Star, Medal, Award, Download, FileText } from 'lucide-react';
import { exportInsightsAsPDF } from '../../utils/exportUtils';
import { useTheme } from '../../contexts/ThemeContext';

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
  rank: number;
  achievements: string[];
  streak: number;
  lastActive: string;
}

export default function InsightsDashboard() {
  const { currentTheme } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [jiraMetrics, setJiraMetrics] = useState<JiraMetrics | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [bestPerformers, setBestPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const cacheData = (projects: Project[], metrics: JiraMetrics, activities: RecentActivity[]) => {
    try {
      localStorage.setItem('jira-projects', JSON.stringify(projects));
      localStorage.setItem('jira-metrics', JSON.stringify(metrics));
      localStorage.setItem('recent-activities', JSON.stringify(activities));
      localStorage.setItem('last-refresh', new Date().toISOString());
    } catch (error) {
      console.error('Error caching data:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jira/projects`);
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      const projectsList = data.projects?.detailed || [];
      setProjects(projectsList);
      return projectsList;
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  };

  const fetchMetrics = async (projectKey: string | null) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jira/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey })
      });
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      if (data.success) {
        setJiraMetrics(data.metrics);
        return data.metrics;
      }
      throw new Error(data.message || 'Failed to fetch metrics');
    } catch (error) {
      console.error('Error fetching metrics:', error);
      throw error;
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/activities/recent`);
      if (!response.ok) throw new Error('Failed to fetch activities');
      const data = await response.json();
      setRecentActivities(data.activities || []);
      return data.activities || [];
    } catch (error) {
      console.error('Error fetching activities:', error);
      return [];
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [projectsData, metricsData, activitiesData] = await Promise.all([
        fetchProjects(),
        fetchMetrics(selectedProject === 'all' ? null : selectedProject),
        fetchActivities()
      ]);
      
      // Fetch best performers after metrics are loaded
      await fetchBestPerformers();
      
      cacheData(projectsData, metricsData, activitiesData);
      setLastRefresh(new Date());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const getCompletionRate = () => {
    if (!jiraMetrics) return 0;
    return jiraMetrics.totalIssues > 0 ? Math.round((jiraMetrics.resolvedIssues / jiraMetrics.totalIssues) * 100) : 0;
  };

  const getTopAssignees = () => {
    if (!jiraMetrics?.issuesByAssignee) return [];
    return Object.entries(jiraMetrics.issuesByAssignee)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
  };

  const getStatusDistribution = () => {
    if (!jiraMetrics?.issuesByStatus) return [];
    return Object.entries(jiraMetrics.issuesByStatus)
      .sort(([,a], [,b]) => b - a);
  };

  const getPriorityDistribution = () => {
    if (!jiraMetrics?.issuesByPriority) return [];
    return Object.entries(jiraMetrics.issuesByPriority)
      .sort(([,a], [,b]) => b - a);
  };

  // Calculate Best Performers
  const calculateBestPerformers = () => {
    console.log('calculateBestPerformers called');
    console.log('jiraMetrics:', jiraMetrics);
    console.log('issuesByAssignee:', jiraMetrics?.issuesByAssignee);
    
    if (!jiraMetrics?.issuesByAssignee) {
      console.log('No issuesByAssignee data, returning empty array');
      return [];
    }

    console.log('Processing assignees:', Object.entries(jiraMetrics.issuesByAssignee));
    const performers: Performer[] = Object.entries(jiraMetrics.issuesByAssignee).map(([name, totalIssues], index) => {
      // Mock additional metrics for demonstration
      const issuesResolved = Math.floor(totalIssues * 0.7 + Math.random() * 10);
      const bugsFixed = Math.floor(totalIssues * 0.3 + Math.random() * 5);
      const storyPoints = Math.floor(totalIssues * 2 + Math.random() * 20);
      const avgResolutionTime = Math.floor(Math.random() * 24 + 2); // 2-26 hours
      const streak = Math.floor(Math.random() * 30 + 1); // 1-30 days
      
      // Calculate performance score based on multiple factors
      const performanceScore = Math.min(100, Math.floor(
        (issuesResolved * 0.3) + 
        (bugsFixed * 0.2) + 
        (storyPoints * 0.1) + 
        ((24 - avgResolutionTime) * 0.2) + 
        (streak * 0.2)
      ));

      // Generate achievements based on performance
      const achievements: string[] = [];
      if (bugsFixed > 10) achievements.push('Bug Hunter');
      if (issuesResolved > 20) achievements.push('Task Master');
      if (storyPoints > 50) achievements.push('Code Wizard');
      if (avgResolutionTime < 8) achievements.push('Speed Demon');
      if (streak > 15) achievements.push('Team Player');
      if (performanceScore > 80) achievements.push('Quality King');

      return {
        name,
        issuesResolved,
        issuesCreated: totalIssues,
        avgResolutionTime,
        storyPoints,
        bugsFixed,
        tasksCompleted: issuesResolved - bugsFixed,
        performanceScore,
        rank: index + 1,
        achievements,
        streak,
        lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
      };
    });

    // Sort by performance score and return top 5
    const sortedPerformers = performers
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 5)
      .map((performer, index) => ({ ...performer, rank: index + 1 }));
    
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
    <div 
      id="insights-dashboard" 
      className="h-full overflow-auto transition-all duration-300"
      style={{ 
        background: `linear-gradient(135deg, ${currentTheme.colors.background}, ${currentTheme.colors.surface})`
      }}
    >
      <div className="p-6 space-y-8">
        {/* Header with Glassmorphism */}
        <motion.div 
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="space-y-2">
            <motion.h1 
              className="text-4xl font-bold bg-clip-text text-transparent"
              style={{
                background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary}, ${currentTheme.colors.accent})`
              }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              Analytics Dashboard
            </motion.h1>
            <motion.p 
              className="text-lg"
              style={{ color: currentTheme.colors.textSecondary }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              Real-time insights from your Jira workspace
            </motion.p>
          </div>
          <motion.div 
            className="flex items-center space-x-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="relative">
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-56 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 shadow-lg">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                  <SelectItem value="all" className="text-gray-900 dark:text-gray-100">All Projects</SelectItem>
                  {Array.isArray(projects) && projects.map((project) => (
                    <SelectItem key={project.id} value={project.key} className="text-gray-900 dark:text-gray-100">
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                onClick={refreshData} 
                disabled={isRefreshing}
                className="text-white shadow-lg border-0"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                  boxShadow: `0 4px 14px 0 ${currentTheme.colors.primary}40`
                }}
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
                className="text-white shadow-lg border-0"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.success}, ${currentTheme.colors.accent})`,
                  boxShadow: `0 4px 14px 0 ${currentTheme.colors.success}40`
                }}
                size="sm"
              >
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Error Alert with Animation */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Alert variant="destructive" className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border-red-200 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertDescription className="text-red-800 dark:text-red-200">
                  {error}. Using cached data if available.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Last Refresh with Animation */}
        <motion.div 
          className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <Sparkles className="h-4 w-4" />
          <span>Last updated: {lastRefresh.toLocaleString()}</span>
        </motion.div>

        {/* Key Metrics Grid with Modern Cards */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {/* Total Issues */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card 
              className="backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300"
              style={{
                backgroundColor: `${currentTheme.colors.surface}CC`,
                borderColor: `${currentTheme.colors.border}80`,
                boxShadow: `0 10px 25px ${currentTheme.colors.primary}20`
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle 
                  className="text-sm font-semibold"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  Total Issues
                </CardTitle>
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <BarChart3 
                    className="h-5 w-5" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent>
                <motion.div 
                  className="text-3xl font-bold"
                  style={{ color: currentTheme.colors.text }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.2, type: "spring", stiffness: 200 }}
                >
                  {jiraMetrics?.totalIssues || 0}
                </motion.div>
                <p 
                  className="text-xs mt-2 flex items-center"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  <Zap className="h-3 w-3 mr-1" />
                  Across all projects
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Completion Rate */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border-white/20 dark:border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">Completion Rate</CardTitle>
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
                >
                  <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400" />
                </motion.div>
              </CardHeader>
              <CardContent>
                <motion.div 
                  className="text-3xl font-bold text-gray-900 dark:text-white"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.4, type: "spring", stiffness: 200 }}
                >
                  {getCompletionRate()}%
                </motion.div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 flex items-center">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {jiraMetrics?.resolvedIssues || 0} of {jiraMetrics?.totalIssues || 0} resolved
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Story Points */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card 
              className="backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300"
              style={{
                backgroundColor: `${currentTheme.colors.surface}CC`,
                borderColor: `${currentTheme.colors.border}80`,
                boxShadow: `0 10px 25px ${currentTheme.colors.secondary}20`
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle 
                  className="text-sm font-semibold"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  Story Points
                </CardTitle>
                <motion.div
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                >
                  <Target 
                    className="h-5 w-5" 
                    style={{ color: currentTheme.colors.secondary }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent>
                <motion.div 
                  className="text-3xl font-bold"
                  style={{ color: currentTheme.colors.text }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.6, type: "spring", stiffness: 200 }}
                >
                  {jiraMetrics?.storyPoints || 0}
                </motion.div>
                <p 
                  className="text-xs mt-2 flex items-center"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Sprint velocity: {jiraMetrics?.sprintVelocity || 0}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Avg Resolution Time */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card 
              className="backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300"
              style={{
                backgroundColor: `${currentTheme.colors.surface}CC`,
                borderColor: `${currentTheme.colors.border}80`,
                boxShadow: `0 10px 25px ${currentTheme.colors.warning}20`
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle 
                  className="text-sm font-semibold"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  Avg Resolution
                </CardTitle>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                >
                  <Clock 
                    className="h-5 w-5" 
                    style={{ color: currentTheme.colors.warning }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent>
                <motion.div 
                  className="text-3xl font-bold"
                  style={{ color: currentTheme.colors.text }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.8, type: "spring", stiffness: 200 }}
                >
                  {jiraMetrics?.avgResolutionTime || 0}d
                </motion.div>
                <p 
                  className="text-xs mt-2 flex items-center"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  <Activity className="h-3 w-3 mr-1" />
                  Days to resolve
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Issue Type Breakdown with Modern Cards */}
        <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2, duration: 0.6 }}
        >
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card 
              className="backdrop-blur-xl shadow-xl"
              style={{
                backgroundColor: `${currentTheme.colors.surface}CC`,
                borderColor: `${currentTheme.colors.border}80`,
                boxShadow: `0 10px 25px ${currentTheme.colors.primary}20`
              }}
            >
              <CardHeader>
                <CardTitle 
                  className="flex items-center"
                  style={{ color: currentTheme.colors.text }}
                >
                  <PieChart 
                    className="h-5 w-5 mr-2" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                  Issue Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: `${currentTheme.colors.primary}10` }}
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: currentTheme.colors.primary }}
                      ></div>
                      <span 
                        className="text-sm font-medium"
                        style={{ color: currentTheme.colors.text }}
                      >
                        Tasks
                      </span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      style={{
                        backgroundColor: `${currentTheme.colors.primary}20`,
                        color: currentTheme.colors.primary
                      }}
                    >
                      {jiraMetrics?.tasks || 0}
                    </Badge>
                  </motion.div>
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: `${currentTheme.colors.success}10` }}
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: currentTheme.colors.success }}
                      ></div>
                      <span 
                        className="text-sm font-medium"
                        style={{ color: currentTheme.colors.text }}
                      >
                        Stories
                      </span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      style={{
                        backgroundColor: `${currentTheme.colors.success}20`,
                        color: currentTheme.colors.success
                      }}
                    >
                      {jiraMetrics?.stories || 0}
                    </Badge>
                  </motion.div>
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: `${currentTheme.colors.error}10` }}
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: currentTheme.colors.error }}
                      ></div>
                      <span 
                        className="text-sm font-medium"
                        style={{ color: currentTheme.colors.text }}
                      >
                        Bugs
                      </span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      style={{
                        backgroundColor: `${currentTheme.colors.error}20`,
                        color: currentTheme.colors.error
                      }}
                    >
                      {jiraMetrics?.bugs || 0}
                    </Badge>
                  </motion.div>
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: `${currentTheme.colors.secondary}10` }}
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: currentTheme.colors.secondary }}
                      ></div>
                      <span 
                        className="text-sm font-medium"
                        style={{ color: currentTheme.colors.text }}
                      >
                        Epics
                      </span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      style={{
                        backgroundColor: `${currentTheme.colors.secondary}20`,
                        color: currentTheme.colors.secondary
                      }}
                    >
                      {jiraMetrics?.epics || 0}
                    </Badge>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Status Distribution */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center text-gray-800 dark:text-gray-200">
                  <Activity className="h-5 w-5 mr-2 text-green-500 dark:text-green-400" />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getStatusDistribution().map(([status, count], index) => (
                     <motion.div 
                       key={status} 
                       className="flex items-center justify-between p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/50"
                       whileHover={{ x: 5 }}
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: 2.2 + index * 0.1, type: "spring", stiffness: 300 }}
                     >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full mr-3 ${
                          status === 'Done' ? 'bg-green-500' :
                          status === 'In Progress' ? 'bg-blue-500' :
                          status === 'To Do' ? 'bg-gray-500' :
                          'bg-yellow-500'
                        }`}></div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{status}</span>
                      </div>
                      <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">{count}</Badge>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Team Performance with Modern Cards */}
        <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5, duration: 0.6 }}
        >
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center text-gray-800 dark:text-gray-200">
                  <Users className="h-5 w-5 mr-2 text-purple-500 dark:text-purple-400" />
                  Team Workload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getTopAssignees().map(([assignee, count], index) => (
                     <motion.div 
                       key={assignee} 
                       className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-900/20 dark:to-blue-900/20"
                       whileHover={{ x: 5, scale: 1.02 }}
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: 2.7 + index * 0.1, type: "spring", stiffness: 300 }}
                     >
                      <div className="flex items-center">
                        <motion.div 
                          className="w-10 h-10 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3"
                          whileHover={{ rotate: 5 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          {assignee.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </motion.div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{assignee}</span>
                      </div>
                      <Badge variant="outline" className="bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700">
                        {count} issues
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Priority Distribution */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center text-gray-800 dark:text-gray-200">
                  <TrendingUp className="h-5 w-5 mr-2 text-orange-500 dark:text-orange-400" />
                  Priority Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getPriorityDistribution().map(([priority, count], index) => (
                     <motion.div 
                       key={priority} 
                       className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-orange-50/50 to-red-50/50 dark:from-orange-900/20 dark:to-red-900/20"
                       whileHover={{ x: 5, scale: 1.02 }}
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: 2.9 + index * 0.1, type: "spring", stiffness: 300 }}
                     >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full mr-3 ${
                          priority === 'High' ? 'bg-red-500' :
                          priority === 'Medium' ? 'bg-yellow-500' :
                          priority === 'Low' ? 'bg-green-500' :
                          'bg-gray-500'
                        }`}></div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{priority}</span>
                      </div>
                      <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200">{count}</Badge>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
         </motion.div>

         {/* Best Performers Section */}
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 2.8, duration: 0.6 }}
         >
           <motion.div
             className="mb-6"
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 3 }}
           >
             <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 flex items-center">
               <motion.div
                 animate={{ rotate: [0, 10, -10, 0] }}
                 transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
               >
                 <Trophy className="h-6 w-6 mr-3 text-yellow-500 dark:text-yellow-400" />
               </motion.div>
               Best Performers
             </h2>
             <p className="text-gray-600 dark:text-gray-400 mt-1">
               Top performing team members this period
             </p>
           </motion.div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {bestPerformers.length > 0 ? bestPerformers.map((performer, index) => {
               const rankColors = {
                 1: { bg: "from-yellow-400 to-yellow-600", text: "text-yellow-600 dark:text-yellow-400", icon: Crown },
                 2: { bg: "from-gray-300 to-gray-500", text: "text-gray-500 dark:text-gray-400", icon: Medal },
                 3: { bg: "from-orange-400 to-orange-600", text: "text-orange-600 dark:text-orange-400", icon: Award }
               };
               
               const rankConfig = rankColors[performer.rank as keyof typeof rankColors] || rankColors[3];
               const IconComponent = rankConfig.icon;

               return (
                 <motion.div
                   key={performer.name}
                   initial={{ opacity: 0, y: 20, scale: 0.9 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   transition={{ delay: 3.2 + index * 0.1, duration: 0.6 }}
                   whileHover={{ scale: 1.02, y: -5 }}
                 >
                   <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border-white/20 dark:border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 h-full">
                     <CardHeader className="pb-3">
                       <div className="flex items-center justify-between">
                         <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                           <motion.div
                             animate={{ rotate: [0, 5, -5, 0] }}
                             transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
                             className={`p-2 rounded-lg bg-gradient-to-r ${rankConfig.bg} mr-3`}
                           >
                             <IconComponent className="h-4 w-4 text-white" />
                           </motion.div>
                           #{performer.rank} Performer
                         </CardTitle>
                         <Badge 
                           variant="secondary" 
                           className={`${rankConfig.text} bg-gradient-to-r ${rankConfig.bg} text-white`}
                         >
                           {performer.performanceScore}/100
                         </Badge>
                       </div>
                     </CardHeader>
                     <CardContent className="space-y-4">
                       {/* Avatar and Name */}
                       <div className="flex items-center space-x-3">
                         <motion.div
                           className="relative"
                           whileHover={{ scale: 1.1, rotate: 5 }}
                           transition={{ type: "spring", stiffness: 300 }}
                         >
                           <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${rankConfig.bg} flex items-center justify-center text-white text-lg font-bold shadow-lg`}>
                             {performer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                           </div>
                           <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                             <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                           </div>
                         </motion.div>
                         <div className="flex-1">
                           <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">{performer.name}</h3>
                           <div className="flex items-center space-x-2">
                             <span className={`text-xs font-medium ${rankConfig.text}`}>
                               {performer.streak} day streak
                             </span>
                           </div>
                         </div>
                       </div>

                       {/* Performance Score Bar */}
                       <div className="space-y-2">
                         <div className="flex items-center justify-between">
                           <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Performance</span>
                           <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{performer.performanceScore}%</span>
                         </div>
                         <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                           <motion.div
                             className={`h-full bg-gradient-to-r ${rankConfig.bg} rounded-full`}
                             initial={{ width: 0 }}
                             animate={{ width: `${performer.performanceScore}%` }}
                             transition={{ delay: 3.5 + index * 0.1, duration: 1.5, ease: "easeOut" }}
                           />
                         </div>
                       </div>

                       {/* Stats Grid */}
                       <div className="grid grid-cols-2 gap-3">
                         <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                           <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{performer.issuesResolved}</div>
                           <div className="text-xs text-gray-600 dark:text-gray-400">Resolved</div>
                         </div>
                         <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                           <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{performer.bugsFixed}</div>
                           <div className="text-xs text-gray-600 dark:text-gray-400">Bugs Fixed</div>
                         </div>
                         <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                           <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{performer.storyPoints}</div>
                           <div className="text-xs text-gray-600 dark:text-gray-400">Story Points</div>
                         </div>
                         <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                           <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{performer.avgResolutionTime}h</div>
                           <div className="text-xs text-gray-600 dark:text-gray-400">Avg Time</div>
                         </div>
                       </div>

                       {/* Achievements */}
                       {performer.achievements.length > 0 && (
                         <div className="space-y-2">
                           <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">Achievements</h4>
                           <div className="flex flex-wrap gap-1">
                             {performer.achievements.slice(0, 3).map((achievement, idx) => (
                               <motion.div
                                 key={achievement}
                                 className="flex items-center space-x-1 px-2 py-1 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20"
                                 initial={{ opacity: 0, scale: 0 }}
                                 animate={{ opacity: 1, scale: 1 }}
                                 transition={{ delay: 3.8 + idx * 0.1 }}
                                 whileHover={{ scale: 1.05 }}
                               >
                                 <Star className="h-3 w-3 text-yellow-500" />
                                 <span className="text-xs text-gray-700 dark:text-gray-300">{achievement}</span>
                               </motion.div>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* Last Active */}
                       <div className="text-xs text-gray-500 dark:text-gray-500 text-center pt-2 border-t border-gray-200 dark:border-gray-700">
                         Last active: {new Date(performer.lastActive).toLocaleDateString()}
                       </div>
                     </CardContent>
                   </Card>
                 </motion.div>
               );
             }) : (
               <motion.div
                 className="col-span-full text-center py-12"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 transition={{ delay: 3.5 }}
               >
                 <motion.div
                   animate={{ rotate: [0, 10, -10, 0] }}
                   transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                 >
                   <Trophy className="h-16 w-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                 </motion.div>
                 <p className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                   No performers data available
                 </p>
                 <p className="text-sm text-gray-500 dark:text-gray-500">
                   Best performers will appear here when team data is available
                 </p>
                 <div className="mt-4 text-xs text-gray-400 dark:text-gray-600">
                   Debug: bestPerformers.length = {bestPerformers.length}
                 </div>
               </motion.div>
             )}
           </div>
         </motion.div>

         {/* Recent Activities with Modern Styling */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 4, duration: 0.6 }}
        >
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center text-gray-800 dark:text-gray-200">
                  <Activity className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
                  Recent Activities
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivities.length > 0 ? (
                  <div className="space-y-4">
                    {recentActivities.slice(0, 5).map((activity, index) => (
                       <motion.div 
                         key={activity.id} 
                         className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800"
                         whileHover={{ x: 5, scale: 1.02 }}
                         initial={{ opacity: 0, y: 20 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ delay: 4.2 + index * 0.1, type: "spring", stiffness: 300 }}
                       >
                        <div className="flex items-center">
                          <motion.div 
                            className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold mr-4"
                            whileHover={{ rotate: 10 }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            {activity.user.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </motion.div>
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{activity.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center">
                              <span className="mr-2">{activity.user}</span>
                              <span className="mx-2">•</span>
                              <span className="mr-2">{activity.project}</span>
                              <span className="mx-2">•</span>
                              <span>{new Date(activity.timestamp).toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700">
                          {activity.type}
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div 
                    className="text-center py-12 text-gray-500 dark:text-gray-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                     transition={{ delay: 4.5 }}
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <Activity className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    </motion.div>
                    <p className="text-lg font-medium">No recent activities found</p>
                    <p className="text-sm mt-2">Activities will appear here as they happen</p>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
