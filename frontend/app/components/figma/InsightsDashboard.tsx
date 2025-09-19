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
import { getApiUrl } from '../../../lib/api-config';

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
  const { currentTheme, isThemeLoaded, isDarkMode } = useTheme();
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
      console.log('📋 Fetching projects from:', getApiUrl('/api/jira/projects'));
      const response = await fetch(getApiUrl('/api/jira/projects'));
      console.log('📋 Projects response status:', response.status);
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      console.log('📋 Projects data:', data);
      const projectsList = data.projects?.detailed || [];
      setProjects(projectsList);
      return projectsList;
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      throw error;
    }
  };

  const fetchMetrics = async (projectKey: string | null) => {
    try {
      console.log('📊 Fetching metrics for project:', projectKey);
      console.log('📊 Metrics URL:', getApiUrl('/api/jira/metrics'));
      const response = await fetch(getApiUrl('/api/jira/metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey })
      });
      console.log('📊 Metrics response status:', response.status);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      console.log('📊 Metrics data:', data);
      if (data.success) {
        setJiraMetrics(data.metrics);
        return data.metrics;
      }
      throw new Error(data.message || 'Failed to fetch metrics');
    } catch (error) {
      console.error('❌ Error fetching metrics:', error);
      throw error;
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await fetch(getApiUrl('/api/activities/recent'));
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
    
    console.log('🔄 Starting data fetch...');
    console.log('📡 API URL:', getApiUrl('/api/jira/projects'));
    
    try {
      const [projectsData, metricsData, activitiesData] = await Promise.all([
        fetchProjects(),
        fetchMetrics(selectedProject === 'all' ? null : selectedProject),
        fetchActivities()
      ]);
      
      console.log('✅ Data fetched successfully:', {
        projects: projectsData?.length || 0,
        metrics: metricsData ? 'loaded' : 'failed',
        activities: activitiesData?.length || 0
      });
      
      // Fetch best performers after metrics are loaded
      await fetchBestPerformers();
      
      cacheData(projectsData, metricsData, activitiesData);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
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
      <div className={`h-full flex items-center justify-center transition-colors duration-300 ${
        isDarkMode ? 'bg-gray-900' : 'bg-white'
      }`}>
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
            <RefreshCw 
              className="h-12 w-12 mx-auto mb-6" 
              style={{ color: currentTheme.colors.primary }}
            />
          </motion.div>
          <motion.h2 
            className={`text-xl font-semibold mb-2 transition-colors duration-300 ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Loading Analytics
          </motion.h2>
          <motion.p 
            className={`transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}
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
      className={`h-full overflow-auto transition-all duration-300 ${
        isDarkMode ? 'bg-gray-900' : 'bg-white'
      }`}
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
           key={`dashboard-title-${currentTheme.name}-${isDarkMode}`}
           className="text-4xl font-bold tracking-tight transition-colors duration-300"
              style={{
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
             color: currentTheme.colors.primary,
             background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
             WebkitBackgroundClip: 'text',
             WebkitTextFillColor: 'transparent',
             backgroundClip: 'text',
             textRendering: 'optimizeLegibility',
             WebkitFontSmoothing: 'antialiased',
             MozOsxFontSmoothing: 'grayscale',
                textShadow: '0 4px 8px rgba(0,0,0,0.1)'
              }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              Analytics Dashboard
            </motion.h1>
            <motion.p 
           className={`text-xl font-medium tracking-wide transition-colors duration-300 ${
             isDarkMode ? 'text-gray-300' : 'text-gray-700'
           }`}
              style={{ 
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
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
                <SelectTrigger 
                  className={`w-56 backdrop-blur-xl border-2 shadow-xl hover:shadow-2xl transition-all duration-300 rounded-2xl font-semibold ${
                    isDarkMode
                      ? 'bg-gray-800/90 border-gray-600/50 text-white'
                      : 'bg-white/90 border-gray-300/50 text-black'
                  }`}
                >
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent 
                  className={`backdrop-blur-xl border-2 shadow-2xl rounded-2xl transition-colors duration-300 ${
                    isDarkMode
                      ? 'bg-gray-800/95 border-gray-600/50'
                      : 'bg-white/95 border-gray-300/50'
                  }`}
                >
                  <SelectItem 
                    value="all" 
                    className={`font-medium rounded-xl mx-2 my-1 transition-colors duration-300 ${
                      isDarkMode
                        ? 'text-gray-100 hover:bg-gray-700 hover:text-white'
                        : 'text-gray-900 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    All Projects
                  </SelectItem>
                  {Array.isArray(projects) && projects.map((project) => (
                    <SelectItem 
                      key={project.id} 
                      value={project.key} 
                      className={`font-medium rounded-xl mx-2 my-1 transition-colors duration-300 ${
                        isDarkMode
                          ? 'text-gray-100 hover:bg-gray-700 hover:text-white'
                          : 'text-gray-900 hover:bg-gray-50 hover:text-black'
                      }`}
                    >
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
                className="text-white shadow-xl border-0 rounded-2xl font-semibold px-6 py-3 hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
                style={{
                  backgroundColor: currentTheme.colors.primary,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.secondary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.primary;
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
                className="text-white shadow-xl border-0 rounded-2xl font-semibold px-6 py-3 hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
                style={{
                  backgroundColor: currentTheme.colors.accent,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.primary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.accent;
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
          {/* Total Issues - Professional Animation */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card 
              className={`shadow-xl hover:shadow-2xl transition-all duration-500 rounded-3xl border backdrop-blur-sm relative overflow-hidden ${
                isDarkMode 
                  ? 'bg-gray-800/95 border-gray-700/60' 
                  : 'bg-white/98 border-gray-200/60'
              }`}
              style={{
                boxShadow: `0 25px 50px ${currentTheme.colors.primary}20, 0 0 0 1px ${currentTheme.colors.primary}10`
              }}
            >
              {/* Theme-colored background effect */}
              <div 
                className="absolute inset-0 opacity-15 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.primary}25, ${currentTheme.colors.secondary}25)`
                }}
              ></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle 
                 className={`text-sm font-bold tracking-wide transition-colors duration-300 ${
                   isDarkMode ? 'text-gray-200' : 'text-gray-700'
                 }`}
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  Total Issues
                </CardTitle>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <BarChart3 
                    className="h-6 w-6" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent className="relative z-10">
                <motion.div 
                 className={`text-4xl font-black tracking-tight transition-colors duration-300 ${
                   isDarkMode ? 'text-gray-100' : 'text-gray-900'
                 }`}
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 15 }}
                >
                  {jiraMetrics?.totalIssues || 0}
                </motion.div>
                <p 
                  className="text-xs mt-2 flex items-center font-medium"
                  style={{ 
                    color: currentTheme.colors.textSecondary,
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  <Zap className="h-3 w-3 mr-1" />
                  Across all projects
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Completion Rate - Professional Animation */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card className={`shadow-xl hover:shadow-2xl transition-all duration-500 rounded-3xl border backdrop-blur-sm relative overflow-hidden ${
              isDarkMode 
                ? 'bg-gray-800/95 border-gray-700/60' 
                : 'bg-white/98 border-gray-200/60'
            }`}
            style={{
              boxShadow: `0 25px 50px ${currentTheme.colors.success}20, 0 0 0 1px ${currentTheme.colors.success}10`
            }}>
              {/* Theme-colored background effect */}
              <div 
                className="absolute inset-0 opacity-15 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.success}25, ${currentTheme.colors.accent}25)`
                }}
              ></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle                  className={`text-sm font-bold tracking-wide transition-colors duration-300 ${
                   isDarkMode ? 'text-gray-200' : 'text-gray-700'
                 }`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Completion Rate</CardTitle>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CheckCircle 
                    className="h-6 w-6" 
                    style={{ color: currentTheme.colors.success }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent className="relative z-10">
                <motion.div 
                  className="text-4xl font-black tracking-tight transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.success,
                    background: `linear-gradient(90deg, ${currentTheme.colors.success}, ${currentTheme.colors.accent})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 1.4, type: "spring", stiffness: 200, damping: 15 }}
                >
                  {getCompletionRate()}%
                </motion.div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 flex items-center font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {jiraMetrics?.resolvedIssues || 0} of {jiraMetrics?.totalIssues || 0} resolved
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Story Points - Professional Animation */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card 
              className={`shadow-lg hover:shadow-xl transition-all duration-500 rounded-2xl border relative overflow-hidden ${
                isDarkMode 
                  ? 'bg-gray-800/95 border-gray-700/60' 
                  : 'bg-white/98 border-gray-200/60'
              }`}
              style={{
                boxShadow: `0 20px 40px ${currentTheme.colors.secondary}20, 0 0 0 1px ${currentTheme.colors.secondary}10`
              }}
            >
              {/* Theme-colored background effect */}
              <div 
                className="absolute inset-0 opacity-15 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.secondary}25, ${currentTheme.colors.accent}25)`
                }}
              ></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle 
                 className={`text-sm font-bold tracking-wide transition-colors duration-300 ${
                   isDarkMode ? 'text-gray-200' : 'text-gray-700'
                 }`}
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  Story Points
                </CardTitle>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <Target 
                    className="h-6 w-6" 
                    style={{ color: currentTheme.colors.secondary }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent className="relative z-10">
                <motion.div 
                  className="text-4xl font-black tracking-tight transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.secondary,
                    background: `linear-gradient(90deg, ${currentTheme.colors.secondary}, ${currentTheme.colors.accent})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                  initial={{ scale: 0, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 1.6, type: "spring", stiffness: 200, damping: 15 }}
                >
                  {jiraMetrics?.storyPoints || 0}
                </motion.div>
                <p 
                  className="text-xs mt-2 flex items-center font-medium"
                  style={{ 
                    color: currentTheme.colors.textSecondary,
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Sprint velocity: {jiraMetrics?.sprintVelocity || 0}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Avg Resolution Time - Professional Animation */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card 
              className={`shadow-lg hover:shadow-xl transition-all duration-500 rounded-2xl border relative overflow-hidden ${
                isDarkMode 
                  ? 'bg-gray-800/95 border-gray-700/60' 
                  : 'bg-white/98 border-gray-200/60'
              }`}
              style={{
                boxShadow: `0 20px 40px ${currentTheme.colors.warning}20, 0 0 0 1px ${currentTheme.colors.warning}10`
              }}
            >
              {/* Theme-colored background effect */}
              <div 
                className="absolute inset-0 opacity-15 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, ${currentTheme.colors.warning}25, ${currentTheme.colors.accent}25)`
                }}
              ></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle 
                 className={`text-sm font-bold tracking-wide transition-colors duration-300 ${
                   isDarkMode ? 'text-gray-200' : 'text-gray-700'
                 }`}
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  Avg Resolution
                </CardTitle>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <Clock 
                    className="h-6 w-6" 
                    style={{ color: currentTheme.colors.warning }}
                  />
                </motion.div>
              </CardHeader>
              <CardContent className="relative z-10">
                <motion.div 
                  className="text-4xl font-black tracking-tight transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.warning,
                    background: `linear-gradient(90deg, ${currentTheme.colors.warning}, ${currentTheme.colors.accent})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 1.8, type: "spring", stiffness: 200, damping: 15 }}
                >
                  {jiraMetrics?.avgResolutionTime || 0}d
                </motion.div>
                <p 
                  className="text-xs mt-2 flex items-center font-medium"
                  style={{ 
                    color: currentTheme.colors.textSecondary,
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
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
            whileHover={{ scale: 1.01, rotate: 0.5 }}
            animate={{ 
              y: [0, -2, 0],
              rotate: [0, 0.5, -0.5, 0]
            }}
            transition={{ 
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Card 
              className={`shadow-lg hover:shadow-xl transition-all duration-500 rounded-2xl border ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200'
              }`}
            >
              <CardHeader>
                <CardTitle 
                 key={`issue-types-${currentTheme.name}-${isDarkMode}`}
                 className="flex items-center text-lg font-semibold tracking-wide transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.primary,
                    background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}
                >
                  <PieChart 
                    className="h-5 w-5 mr-3" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                  Issue Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center space-y-6">
                  {/* Circular Progress Chart */}
                  <div className="relative w-48 h-48">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* Background Circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-gray-200 dark:text-gray-700"
                      />
                      {/* Tasks Arc */}
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={currentTheme.colors.primary}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(jiraMetrics?.tasks || 0) * 2.51} 251`}
                        initial={{ strokeDasharray: "0 251" }}
                        animate={{ strokeDasharray: `${(jiraMetrics?.tasks || 0) * 2.51} 251` }}
                        transition={{ delay: 2.2, duration: 1.5, ease: "easeOut" }}
                      />
                      {/* Stories Arc */}
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={currentTheme.colors.secondary}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(jiraMetrics?.stories || 0) * 2.51} 251`}
                        strokeDashoffset={`-${(jiraMetrics?.tasks || 0) * 2.51}`}
                        initial={{ strokeDasharray: "0 251" }}
                        animate={{ strokeDasharray: `${(jiraMetrics?.stories || 0) * 2.51} 251` }}
                        transition={{ delay: 2.4, duration: 1.5, ease: "easeOut" }}
                      />
                      {/* Bugs Arc */}
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={currentTheme.colors.error}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(jiraMetrics?.bugs || 0) * 2.51} 251`}
                        strokeDashoffset={`-${((jiraMetrics?.tasks || 0) + (jiraMetrics?.stories || 0)) * 2.51}`}
                        initial={{ strokeDasharray: "0 251" }}
                        animate={{ strokeDasharray: `${(jiraMetrics?.bugs || 0) * 2.51} 251` }}
                        transition={{ delay: 2.6, duration: 1.5, ease: "easeOut" }}
                      />
                      {/* Epics Arc */}
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={currentTheme.colors.warning}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(jiraMetrics?.epics || 0) * 2.51} 251`}
                        strokeDashoffset={`-${((jiraMetrics?.tasks || 0) + (jiraMetrics?.stories || 0) + (jiraMetrics?.bugs || 0)) * 2.51}`}
                        initial={{ strokeDasharray: "0 251" }}
                        animate={{ strokeDasharray: `${(jiraMetrics?.epics || 0) * 2.51} 251` }}
                        transition={{ delay: 2.8, duration: 1.5, ease: "easeOut" }}
                      />
                    </svg>
                    {/* Center Total */}
                    <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div 
                        className="text-center"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 3, type: "spring", stiffness: 200 }}
                      >
                        <div className="text-2xl font-black text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          {((jiraMetrics?.tasks || 0) + (jiraMetrics?.stories || 0) + (jiraMetrics?.bugs || 0) + (jiraMetrics?.epics || 0))}
                    </div>
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          Total
                        </div>
                      </motion.div>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <motion.div 
                      className={`flex items-center space-x-2 p-2 rounded-xl transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 3.2 }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: currentTheme.colors.primary }}
                      ></div>
                      <span className={`text-xs font-semibold transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Tasks</span>
                      <span 
                        className="text-xs font-bold ml-auto" 
                        style={{ 
                          color: currentTheme.colors.primary,
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' 
                        }}
                      >{jiraMetrics?.tasks || 0}</span>
                  </motion.div>
                  <motion.div 
                      className={`flex items-center space-x-2 p-2 rounded-xl transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 3.4 }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: currentTheme.colors.secondary }}
                      ></div>
                      <span className={`text-xs font-semibold transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Stories</span>
                      <span 
                        className="text-xs font-bold ml-auto" 
                        style={{ 
                          color: currentTheme.colors.secondary,
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' 
                        }}
                      >{jiraMetrics?.stories || 0}</span>
                  </motion.div>
                  <motion.div 
                      className={`flex items-center space-x-2 p-2 rounded-xl transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 3.6 }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: currentTheme.colors.error }}
                      ></div>
                      <span className={`text-xs font-semibold transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Bugs</span>
                      <span 
                        className="text-xs font-bold ml-auto" 
                        style={{ 
                          color: currentTheme.colors.error,
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' 
                        }}
                      >{jiraMetrics?.bugs || 0}</span>
                  </motion.div>
                  <motion.div 
                      className={`flex items-center space-x-2 p-2 rounded-xl transition-colors duration-300 ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 3.8 }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: currentTheme.colors.warning }}
                      ></div>
                      <span className={`text-xs font-semibold transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Epics</span>
                      <span 
                        className="text-xs font-bold ml-auto" 
                        style={{ 
                          color: currentTheme.colors.warning,
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' 
                        }}
                      >{jiraMetrics?.epics || 0}</span>
                  </motion.div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Status Distribution - Slide Animation */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card className={`shadow-xl hover:shadow-2xl transition-all duration-500 rounded-3xl border backdrop-blur-sm ${
              isDarkMode 
                ? 'bg-gray-800/90 border-gray-700/50' 
                : 'bg-white/95 border-gray-200/50'
            }`}>
              <CardHeader>
                <CardTitle 
                  key={`status-distribution-${currentTheme.name}-${isDarkMode}`}
                  className="flex items-center text-lg font-semibold tracking-wide transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.primary,
                    background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}
                >
                  <Activity 
                    className="h-5 w-5 mr-3" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Timeline Design */}
                  <div className="relative">
                    {/* Timeline Line */}
                    <div 
                      className="absolute left-6 top-0 bottom-0 w-0.5 transition-colors duration-300"
                      style={{
                        background: `linear-gradient(to bottom, ${currentTheme.colors.success}, ${currentTheme.colors.info}, ${currentTheme.colors.warning})`
                      }}
                    ></div>
                    
                    {getStatusDistribution().map(([status, count], index) => {
                      const statusConfig = {
                        'Done': { 
                          color: currentTheme.colors.success, 
                          bg: currentTheme.colors.success, 
                          text: currentTheme.colors.success, 
                          icon: '✓' 
                        },
                        'In Progress': { 
                          color: currentTheme.colors.info, 
                          bg: currentTheme.colors.info, 
                          text: currentTheme.colors.info, 
                          icon: '⚡' 
                        },
                        'To Do': { 
                          color: currentTheme.colors.warning, 
                          bg: currentTheme.colors.warning, 
                          text: currentTheme.colors.warning, 
                          icon: '📋' 
                        },
                        'default': { 
                          color: currentTheme.colors.textSecondary, 
                          bg: currentTheme.colors.textSecondary, 
                          text: currentTheme.colors.textSecondary, 
                          icon: '⏳' 
                        }
                      };
                      const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.default;
                      
                      return (
                     <motion.div 
                       key={status} 
                          className="relative flex items-center space-x-4 py-4"
                          initial={{ opacity: 0, x: -30 }}
                       animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 2.2 + index * 0.2, type: "spring", stiffness: 300 }}
                        >
                          {/* Timeline Dot */}
                          <div 
                            className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg transition-colors duration-300"
                            style={{ backgroundColor: config.bg }}
                          >
                            {config.icon}
                      </div>
                          
                          {/* Content */}
                          <div className="flex-1 flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                {status}
                              </h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                {count} issues
                              </p>
                            </div>
                            
                            {/* Progress Bar */}
                            <div 
                              className="w-24 h-2 rounded-full overflow-hidden transition-colors duration-300"
                              style={{ backgroundColor: isDarkMode ? currentTheme.colors.surface : `${currentTheme.colors.border}40` }}
                            >
                              <motion.div
                                className="h-full rounded-full transition-colors duration-300"
                                style={{ backgroundColor: config.bg }}
                                initial={{ width: 0 }}
                                animate={{ width: `${(count / Math.max(...getStatusDistribution().map(([,c]) => c))) * 100}%` }}
                                transition={{ delay: 2.4 + index * 0.2, duration: 1, ease: "easeOut" }}
                              />
                            </div>
                            
                            {/* Count Badge */}
                            <div className={`px-3 py-1 rounded-full ${config.bg} text-white text-sm font-bold`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                              {count}
                            </div>
                          </div>
                    </motion.div>
                      );
                    })}
                  </div>
                  
                  {/* Summary Stats */}
                  <div 
                    className="grid grid-cols-3 gap-4 pt-4 border-t transition-colors duration-300"
                    style={{ borderColor: currentTheme.colors.border }}
                  >
                    <div className="text-center">
                      <div 
                        className="text-2xl font-black transition-colors duration-300" 
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.success
                        }}
                      >
                        {getStatusDistribution().find(([status]) => status === 'Done')?.[1] || 0}
                      </div>
                      <div 
                        className="text-xs font-semibold transition-colors duration-300" 
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.textSecondary
                        }}
                      >
                        Completed
                      </div>
                    </div>
                    <div className="text-center">
                      <div 
                        className="text-2xl font-black transition-colors duration-300" 
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.info
                        }}
                      >
                        {getStatusDistribution().find(([status]) => status === 'In Progress')?.[1] || 0}
                      </div>
                      <div 
                        className="text-xs font-semibold transition-colors duration-300" 
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.textSecondary
                        }}
                      >
                        Active
                      </div>
                    </div>
                    <div className="text-center">
                      <div 
                        className="text-2xl font-black transition-colors duration-300" 
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.warning
                        }}
                      >
                        {getStatusDistribution().find(([status]) => status === 'To Do')?.[1] || 0}
                      </div>
                      <div 
                        className="text-xs font-semibold transition-colors duration-300" 
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.textSecondary
                        }}
                      >
                        Pending
                      </div>
                    </div>
                  </div>
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
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card className={`shadow-xl hover:shadow-2xl transition-all duration-500 rounded-3xl border backdrop-blur-sm ${
              isDarkMode 
                ? 'bg-gray-800/90 border-gray-700/50' 
                : 'bg-white/95 border-gray-200/50'
            }`}>
              <CardHeader>
                <CardTitle 
                  key={`team-workload-${currentTheme.name}-${isDarkMode}`}
                  className="flex items-center text-lg font-semibold tracking-wide transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.primary,
                    background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}
                >
                  <Users 
                    className="h-5 w-5 mr-3" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                  Team Workload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Leaderboard Header */}
                  <div 
                    className="flex items-center justify-between p-3 rounded-2xl border transition-colors duration-300"
                    style={{
                      background: `linear-gradient(90deg, ${currentTheme.colors.primary}10, ${currentTheme.colors.secondary}10)`,
                      borderColor: `${currentTheme.colors.primary}20`
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <Trophy 
                        className="h-5 w-5" 
                        style={{ color: currentTheme.colors.accent }}
                      />
                      <span 
                        className="text-sm font-bold transition-colors duration-300"
                        style={{ 
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          color: currentTheme.colors.text
                        }}
                      >
                        Team Leaderboard
                      </span>
                    </div>
                    <div 
                      className="text-xs font-semibold transition-colors duration-300"
                      style={{ 
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        color: currentTheme.colors.textSecondary
                      }}
                    >
                      Issues Assigned
                    </div>
                  </div>
                  
                  {/* Leaderboard Items */}
                  {getTopAssignees().map(([assignee, count], index) => {
                    const rankColors = {
                      0: { 
                        bg: `linear-gradient(135deg, ${currentTheme.colors.accent}, ${currentTheme.colors.warning})`, 
                        border: `${currentTheme.colors.accent}40`, 
                        text: currentTheme.colors.text, 
                        rank: '🥇' 
                      },
                      1: { 
                        bg: `linear-gradient(135deg, ${currentTheme.colors.secondary}, ${currentTheme.colors.primary})`, 
                        border: `${currentTheme.colors.secondary}40`, 
                        text: currentTheme.colors.text, 
                        rank: '🥈' 
                      },
                      2: { 
                        bg: `linear-gradient(135deg, ${currentTheme.colors.warning}, ${currentTheme.colors.accent})`, 
                        border: `${currentTheme.colors.warning}40`, 
                        text: currentTheme.colors.text, 
                        rank: '🥉' 
                      },
                      default: { 
                        bg: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`, 
                        border: `${currentTheme.colors.primary}40`, 
                        text: currentTheme.colors.text, 
                        rank: `${index + 1}` 
                      }
                    };
                    const rankConfig = rankColors[index as keyof typeof rankColors] || rankColors.default;
                    
                    return (
                     <motion.div 
                       key={assignee} 
                        className="relative flex items-center space-x-4 p-4 rounded-2xl border-2 shadow-lg transition-all duration-300"
                        style={{
                          background: rankConfig.bg,
                          borderColor: rankConfig.border,
                          color: rankConfig.text
                        }}
                        whileHover={{ scale: 1.01 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                       transition={{ delay: 2.7 + index * 0.1, type: "spring", stiffness: 300 }}
                     >
                        {/* Rank Badge */}
                        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-colors duration-300 ${
                          isDarkMode ? 'bg-gray-700 text-white' : 'bg-white/20 text-black'
                        }`}>
                          {rankConfig.rank}
                        </div>
                        
                        {/* Avatar */}
                        <motion.div 
                          className="w-12 h-12 bg-white/30 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-lg"
                          whileHover={{ rotate: 5, scale: 1.05 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          {assignee.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </motion.div>
                        
                        {/* Name and Stats */}
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                            {assignee}
                          </h3>
                          <div className="flex items-center space-x-4 mt-1">
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                              <span className="text-sm font-semibold text-white/90" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {count} issues
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                              <span className="text-sm font-semibold text-white/90" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                Rank #{index + 1}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Progress Ring */}
                        <div className="relative w-16 h-16">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle
                              cx="50"
                              cy="50"
                              r="30"
                              fill="none"
                              stroke="rgba(255,255,255,0.2)"
                              strokeWidth="6"
                            />
                            <motion.circle
                              cx="50"
                              cy="50"
                              r="30"
                              fill="none"
                              stroke="white"
                              strokeWidth="6"
                              strokeLinecap="round"
                              strokeDasharray={`${(count / Math.max(...getTopAssignees().map(([,c]) => c))) * 188.4} 188.4`}
                              initial={{ strokeDasharray: "0 188.4" }}
                              animate={{ strokeDasharray: `${(count / Math.max(...getTopAssignees().map(([,c]) => c))) * 188.4} 188.4` }}
                              transition={{ delay: 2.9 + index * 0.1, duration: 1.5, ease: "easeOut" }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-white" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                              {Math.round((count / Math.max(...getTopAssignees().map(([,c]) => c))) * 100)}%
                            </span>
                          </div>
                        </div>
                    </motion.div>
                    );
                  })}
                  
                  {/* Team Stats Footer */}
                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="text-lg font-bold text-slate-600 dark:text-slate-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {getTopAssignees().length}
                      </div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-500" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        Team Members
                      </div>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="text-lg font-bold text-slate-600 dark:text-slate-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {getTopAssignees().reduce((sum, [,count]) => sum + count, 0)}
                      </div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-500" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        Total Issues
                      </div>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="text-lg font-bold text-slate-600 dark:text-slate-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {Math.round(getTopAssignees().reduce((sum, [,count]) => sum + count, 0) / getTopAssignees().length)}
                      </div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-500" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        Avg per Member
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Priority Distribution - Shake Animation */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            transition={{ 
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <Card className={`shadow-xl hover:shadow-2xl transition-all duration-500 rounded-3xl border backdrop-blur-sm ${
              isDarkMode 
                ? 'bg-gray-800/90 border-gray-700/50' 
                : 'bg-white/95 border-gray-200/50'
            }`}>
              <CardHeader>
                <CardTitle 
                  key={`priority-distribution-${currentTheme.name}-${isDarkMode}`}
                  className="flex items-center text-lg font-semibold tracking-wide transition-colors duration-300"
                  style={{ 
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: currentTheme.colors.primary,
                    background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}
                >
                  <TrendingUp 
                    className="h-5 w-5 mr-3" 
                    style={{ color: currentTheme.colors.primary }}
                  />
                  Priority Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Heatmap Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {getPriorityDistribution().map(([priority, count], index) => {
                      const priorityConfig = {
                        'High': { 
                          color: currentTheme.colors.error,
                          bg: currentTheme.colors.error,
                          text: currentTheme.colors.error, 
                          icon: '🔥', 
                          intensity: 'High',
                          gradient: `linear-gradient(135deg, ${currentTheme.colors.error}, ${currentTheme.colors.warning})`,
                          border: `${currentTheme.colors.error}40`
                        },
                        'Medium': { 
                          color: currentTheme.colors.warning,
                          bg: currentTheme.colors.warning,
                          text: currentTheme.colors.warning, 
                          icon: '⚠️', 
                          intensity: 'Medium',
                          gradient: `linear-gradient(135deg, ${currentTheme.colors.warning}, ${currentTheme.colors.accent})`,
                          border: `${currentTheme.colors.warning}40`
                        },
                        'Low': { 
                          color: currentTheme.colors.success,
                          bg: currentTheme.colors.success,
                          text: currentTheme.colors.success, 
                          icon: '✅', 
                          intensity: 'Low',
                          gradient: `linear-gradient(135deg, ${currentTheme.colors.success}, ${currentTheme.colors.secondary})`,
                          border: `${currentTheme.colors.success}40`
                        },
                        'default': { 
                          color: currentTheme.colors.primary,
                          bg: currentTheme.colors.primary,
                          text: currentTheme.colors.primary, 
                          icon: '📋', 
                          intensity: 'Unknown',
                          gradient: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                          border: `${currentTheme.colors.primary}40`
                        }
                      };
                      const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.default;
                      const maxCount = Math.max(...getPriorityDistribution().map(([,c]) => c));
                      const intensity = (count / maxCount) * 100;
                      
                      return (
                     <motion.div 
                       key={priority} 
                          className="relative overflow-hidden rounded-2xl border-2 shadow-lg transition-all duration-300"
                          style={{
                            background: config.gradient,
                            borderColor: config.border,
                            color: 'white'
                          }}
                          whileHover={{ scale: 1.01 }}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 2.9 + index * 0.2, type: "spring", stiffness: 300 }}
                        >
                          {/* Intensity Overlay */}
                          <div 
                            className="absolute inset-0 opacity-20"
                            style={{ 
                              background: `radial-gradient(circle at center, rgba(255,255,255,${intensity/100}) 0%, transparent 70%)`
                            }}
                          />
                          
                          {/* Content */}
                          <div className="relative p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-3">
                                <div className="text-2xl">{config.icon}</div>
                                <div>
                                  <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                    {priority}
                                  </h3>
                                  <p className="text-sm text-white/80 font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                    {config.intensity} Priority
                                  </p>
                      </div>
                              </div>
                              <div className="text-right">
                                <div className="text-3xl font-black text-white" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                  {count}
                                </div>
                                <div className="text-xs text-white/80 font-semibold" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                  issues
                                </div>
                              </div>
                            </div>
                            
                            {/* Intensity Bar */}
                            <div className={`w-full rounded-full h-2 overflow-hidden transition-colors duration-300 ${
                              isDarkMode ? 'bg-gray-700' : 'bg-white/20'
                            }`}>
                              <motion.div
                                className={`h-full rounded-full transition-colors duration-300 ${
                                  isDarkMode ? 'bg-gray-500' : 'bg-white'
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${intensity}%` }}
                                transition={{ delay: 3.1 + index * 0.2, duration: 1.5, ease: "easeOut" }}
                              />
                            </div>
                            
                            {/* Intensity Percentage */}
                            <div className="mt-2 text-right">
                              <span className="text-xs font-bold text-white/90" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                                {Math.round(intensity)}% intensity
                              </span>
                            </div>
                          </div>
                    </motion.div>
                      );
                    })}
                  </div>
                  
                  {/* Priority Summary */}
                  <div className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800 dark:to-gray-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          Priority Distribution Summary
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`text-center p-2 rounded-xl border transition-colors duration-300 ${
                        isDarkMode 
                          ? 'bg-gray-700 border-red-800' 
                          : 'bg-white/60 border-red-200'
                      }`}>
                        <div className="text-lg font-bold text-red-600 dark:text-red-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          {getPriorityDistribution().find(([priority]) => priority === 'High')?.[1] || 0}
                        </div>
                        <div className="text-xs font-semibold text-red-600 dark:text-red-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          High Priority
                        </div>
                      </div>
                      <div className={`text-center p-2 rounded-xl border transition-colors duration-300 ${
                        isDarkMode 
                          ? 'bg-gray-700 border-amber-800' 
                          : 'bg-white/60 border-amber-200'
                      }`}>
                        <div className="text-lg font-bold text-amber-600 dark:text-amber-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          {getPriorityDistribution().find(([priority]) => priority === 'Medium')?.[1] || 0}
                        </div>
                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          Medium Priority
                        </div>
                      </div>
                      <div className={`text-center p-2 rounded-xl border transition-colors duration-300 ${
                        isDarkMode 
                          ? 'bg-gray-700 border-emerald-800' 
                          : 'bg-white/60 border-emerald-200'
                      }`}>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          {getPriorityDistribution().find(([priority]) => priority === 'Low')?.[1] || 0}
                        </div>
                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          Low Priority
                        </div>
                      </div>
                    </div>
                  </div>
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
             <h2 
               key={`best-performers-${currentTheme.name}-${isDarkMode}`}
               className="text-2xl font-bold tracking-tight flex items-center"
               style={{ 
                 fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                 color: currentTheme.colors.primary,
                 background: `linear-gradient(90deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                 WebkitBackgroundClip: 'text',
                 WebkitTextFillColor: 'transparent',
                 backgroundClip: 'text',
                 textRendering: 'optimizeLegibility',
                 WebkitFontSmoothing: 'antialiased',
                 MozOsxFontSmoothing: 'grayscale'
               }}
             >
               <motion.div
                 animate={{ rotate: [0, 10, -10, 0] }}
                 transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
               >
                 <Trophy 
                   className="h-6 w-6 mr-3" 
                   style={{ color: currentTheme.colors.accent }}
                 />
               </motion.div>
               Best Performers
             </h2>
             <p className="text-lg text-gray-600 dark:text-gray-400 mt-2 font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
                   <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border-2 border-white/30 dark:border-slate-700/50 shadow-2xl hover:shadow-3xl transition-all duration-500 rounded-3xl h-full">
                     <CardHeader className="pb-3">
                       <div className="flex items-center justify-between">
                         <CardTitle className="text-sm font-bold tracking-wide text-gray-800 dark:text-gray-200 flex items-center" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                           <motion.div
                             animate={{ rotate: [0, 5, -5, 0] }}
                             transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
                             className={`p-3 rounded-2xl bg-gradient-to-r ${rankConfig.bg} mr-3 shadow-lg`}
                           >
                             <IconComponent className="h-5 w-5 text-white" />
                           </motion.div>
                           #{performer.rank} Performer
                         </CardTitle>
                         <Badge 
                           variant="secondary" 
                           className={`px-3 py-1 rounded-xl font-bold text-white ${rankConfig.text} bg-gradient-to-r ${rankConfig.bg}`}
                           style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
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
                           <div className={`w-16 h-16 rounded-3xl bg-gradient-to-br ${rankConfig.bg} flex items-center justify-center text-white text-xl font-black shadow-2xl`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                             {performer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                           </div>
                           <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-3 border-white flex items-center justify-center shadow-lg">
                             <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                           </div>
                         </motion.div>
                         <div className="flex-1">
                           <h3 className="text-xl font-black tracking-wide text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{performer.name}</h3>
                           <div className="flex items-center space-x-2">
                             <span className={`text-sm font-semibold ${rankConfig.text}`} style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                               {performer.streak} day streak
                             </span>
                           </div>
                         </div>
                       </div>

                       {/* Performance Score Bar */}
                       <div className="space-y-3">
                         <div className="flex items-center justify-between">
                           <span className="text-sm font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Performance</span>
                           <span className="text-lg font-black text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{performer.performanceScore}%</span>
                         </div>
                         <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-inner">
                           <motion.div
                             className={`h-full bg-gradient-to-r ${rankConfig.bg} rounded-full shadow-lg`}
                             initial={{ width: 0 }}
                             animate={{ width: `${performer.performanceScore}%` }}
                             transition={{ delay: 3.5 + index * 0.1, duration: 1.5, ease: "easeOut" }}
                           />
                         </div>
                       </div>

                       {/* Stats Grid */}
                       <div className="grid grid-cols-2 gap-3">
                         <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/50 border border-gray-200/50 dark:border-gray-700/50">
                           <div className="text-xl font-black text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{performer.issuesResolved}</div>
                           <div className="text-xs font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Resolved</div>
                         </div>
                         <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/50 border border-gray-200/50 dark:border-gray-700/50">
                           <div className="text-xl font-black text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{performer.bugsFixed}</div>
                           <div className="text-xs font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Bugs Fixed</div>
                         </div>
                         <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/50 border border-gray-200/50 dark:border-gray-700/50">
                           <div className="text-xl font-black text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{performer.storyPoints}</div>
                           <div className="text-xs font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Story Points</div>
                         </div>
                         <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/50 border border-gray-200/50 dark:border-gray-700/50">
                           <div className="text-xl font-black text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{performer.avgResolutionTime}h</div>
                           <div className="text-xs font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Avg Time</div>
                         </div>
                       </div>

                       {/* Achievements */}
                       {performer.achievements.length > 0 && (
                         <div className="space-y-3">
                           <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Achievements</h4>
                           <div className="flex flex-wrap gap-2">
                             {performer.achievements.slice(0, 3).map((achievement, idx) => (
                               <motion.div
                                 key={achievement}
                                 className="flex items-center space-x-2 px-3 py-2 rounded-2xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 border border-blue-200/50 dark:border-blue-700/50"
                                 initial={{ opacity: 0, scale: 0 }}
                                 animate={{ opacity: 1, scale: 1 }}
                                 transition={{ delay: 3.8 + idx * 0.1 }}
                                 whileHover={{ scale: 1.05 }}
                               >
                                 <Star className="h-4 w-4 text-yellow-500" />
                                 <span className="text-xs font-semibold text-gray-700 dark:text-gray-300" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{achievement}</span>
                               </motion.div>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* Last Active */}
                       <div className="text-xs text-gray-500 dark:text-gray-500 text-center pt-3 border-t border-gray-200 dark:border-gray-700 font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border-2 border-white/30 dark:border-slate-700/50 shadow-2xl rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center text-xl font-bold tracking-wide text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <Activity className="h-6 w-6 mr-3 text-indigo-500 dark:text-indigo-400" />
                  Recent Activities
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivities.length > 0 ? (
                  <div className="space-y-4">
                    {recentActivities.slice(0, 5).map((activity, index) => (
                       <motion.div 
                         key={activity.id} 
                         className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/50"
                         whileHover={{ x: 5, scale: 1.02 }}
                         initial={{ opacity: 0, y: 20 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ delay: 4.2 + index * 0.1, type: "spring", stiffness: 300 }}
                       >
                        <div className="flex items-center">
                          <motion.div 
                            className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-2xl flex items-center justify-center text-white text-sm font-bold mr-4 shadow-lg"
                            whileHover={{ rotate: 10, scale: 1.05 }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            {activity.user.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </motion.div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{activity.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                              <span className="mr-2">{activity.user}</span>
                              <span className="mx-2">•</span>
                              <span className="mr-2">{activity.project}</span>
                              <span className="mx-2">•</span>
                              <span>{new Date(activity.timestamp).toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="px-3 py-1 rounded-xl font-semibold bg-indigo-100 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
                      <Activity className="h-20 w-20 mx-auto mb-6 opacity-50" />
                    </motion.div>
                    <p className="text-xl font-bold mb-2" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>No recent activities found</p>
                    <p className="text-sm mt-2 font-medium" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Activities will appear here as they happen</p>
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
