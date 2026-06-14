'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RefreshCw, TrendingUp, Users, Clock, Target, AlertTriangle, CheckCircle, BarChart3, PieChart, Activity, Zap, Sparkles, ArrowUpRight, Trophy, Crown, Star, Medal, Award, Download, FileText, Brain, Lightbulb, Info, X, TrendingDown, LineChart, Settings, Maximize2, Minimize2, ChevronDown, ChevronUp, Calendar, Layers, Eye, EyeOff, Search } from 'lucide-react';
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, Scatter } from 'recharts';
import { exportInsightsAsPDF } from '../../utils/exportUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { getApiUrl } from '../../../lib/api-config';
import { DashboardLayout } from '../DashboardLayout';
import { JiraLoader } from './InsightsDashboard/components/JiraLoader';

interface Project {
  id: string;
  key: string;
  name: string;
}

interface PIRange {
  value: string;
  label: string;
  pi: string;
  year: string;
  startDate: string;
  endDate: string;
}

interface SprintInfo {
  sprintName: string;
  startDate: string;
  endDate: string;
  committedPoints?: number;
  completedPoints?: number;
  velocity?: number;
  sprintGoal?: string;
}

interface PeriodContext {
  current_pi: PIRange | null;
  all_pis: PIRange[];
  current_sprint: SprintInfo | null;
  recent_sprints: SprintInfo[];
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
  totalIssuesAll?: number;
  filters?: {
    projectKey?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  };
}

// Enhanced interfaces for new features
interface SprintVelocity {
  sprintName: string;
  startDate: string;
  endDate: string;
  committedPoints: number;
  completedPoints: number;
  velocity: number;
}

interface BurndownData {
  sprintName: string;
  dates: string[];
  idealBurndown: number[];
  actualBurndown: number[];
  remainingWork: number[];
}

interface PredictiveAnalytics {
  sprintCompletionDate: string;
  completionConfidence: number;
  velocityTrend: 'increasing' | 'decreasing' | 'stable';
  forecastedVelocity: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

interface BottleneckAnalysis {
  status: string;
  avgTimeInStatus: number;
  issuesStuck: number;
  isBottleneck: boolean;
  severity: 'low' | 'medium' | 'high';
}

interface TeamCapacity {
  assignee: string;
  capacity: number;
  currentWorkload: number;
  utilizationPercentage: number;
  status: 'underutilized' | 'optimal' | 'overloaded';
}

interface HistoricalComparison {
  period: string;
  totalIssues: number;
  completedIssues: number;
  completionRate: number;
  avgResolutionTime: number;
  velocity: number;
}

interface IssueAgeItem {
  range: string;
  count: number;
}

interface DueDateRiskItem {
  key: string;
  summary: string;
  dueDate: string;
  assignee: string;
  status: string;
  priority: string;
  isOverdue: boolean;
}

interface BlockerIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string;
  project: string;
  url: string;
  priority?: string;
  labels?: string[];
}

interface Performer {
  name: string;
  issuesResolved: number;
  storyPoints: number;
  bugsFixed: number;
  tasksCompleted: number;
  performanceScore: number;
  rank: number;
  achievements: string[];
}

interface EnhancedJiraMetrics extends JiraMetrics {
  sprintVelocityTrends: SprintVelocity[];
  burndownData: BurndownData[];
  predictiveAnalytics: PredictiveAnalytics;
  bottleneckAnalysis: BottleneckAnalysis[];
  teamCapacity: TeamCapacity[];
  historicalComparison: HistoricalComparison[];
  monthlyTrends: {
    months: string[];
    issues: number[];
    velocity: number[];
    completionRate: number[];
  };
  issueAgeDistribution?: IssueAgeItem[];
  dueDateRisk?: DueDateRiskItem[];
  latestSprintGoal?: string;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  user: string;
  timestamp: string;
  project: string;
}


interface AISuggestion {
  component: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
}

interface AITooltip {
  id: string;
  component: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
}

export default function InsightsDashboard() {
  const { currentTheme, isThemeLoaded, isDarkMode } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  // Default to first filtered project instead of 'all'
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const defaultEndDate = new Date();
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultEndDate.getDate() - 13);
  const [dateFrom, setDateFrom] = useState<string>(defaultStartDate.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(defaultEndDate.toISOString().split('T')[0]);
  const [jiraMetrics, setJiraMetrics] = useState<JiraMetrics | null>(null);
  const [enhancedMetrics, setEnhancedMetrics] = useState<EnhancedJiraMetrics>(() => createMockEnhancedMetrics());
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Blockers, performers, drill-down
  const [blockers, setBlockers] = useState<{ blocked: BlockerIssue[]; flagged: BlockerIssue[] } | null>(null);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const [performersLoading, setPerformersLoading] = useState(false);

  // New state for enhanced features
  const [selectedChartView, setSelectedChartView] = useState<'velocity' | 'burndown' | 'capacity' | 'historical'>('velocity');
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [drillDownData, setDrillDownData] = useState<any>(null);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv' | 'json'>('pdf');
  const [widgetLayout, setWidgetLayout] = useState({
    velocity: true,
    burndown: true,
    capacity: true,
    historical: true,
    predictive: true,
    bottlenecks: true
  });

  const [activeInfoTooltip, setActiveInfoTooltip] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const [periodContext, setPeriodContext] = useState<PeriodContext | null>(null);

  const applyAlpha = (hexColor: string, alpha: number) => {
    if (!hexColor) return `rgba(0,0,0,${alpha})`;
    const sanitized = hexColor.replace('#', '');
    if (sanitized.length !== 6) {
      return hexColor;
    }
    const r = parseInt(sanitized.substring(0, 2), 16);
    const g = parseInt(sanitized.substring(2, 4), 16);
    const b = parseInt(sanitized.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Auto-refresh every 15 minutes (ONLY after initial fetch)
  useEffect(() => {
    if (!initialFetchRef.current) return; // Don't auto-refresh until user clicks Get Insights

    const interval = setInterval(() => {
      console.log('🔄 15-minute auto-refresh triggered');
      refreshData();
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, []);


  const hasLoadedCacheRef = React.useRef(false);
  const initialFetchRef = React.useRef(false);

  // Only load cached data on mount - DO NOT auto-fetch
  // User must click "Get Insights" button to fetch fresh data
  useEffect(() => {
    if (hasLoadedCacheRef.current) return;

    // Load cached data immediately if available
    loadCachedData(false);
    hasLoadedCacheRef.current = true;

    console.log('📊 Insights page loaded - NO AUTO FETCH - waiting for user to click Get Insights');
  }, []);

  // Re-fetch data ONLY when user deliberately changes filters AFTER initial fetch
  useEffect(() => {
    if (!hasLoadedCacheRef.current) return;
    if (!initialFetchRef.current) return; // Only fetch after user clicked "Get Insights" once
    if (!dateFrom || !dateTo) return;

    console.log('🔄 Filters changed after initial fetch - refreshing data...');
    fetchData();
  }, [selectedProject, dateFrom, dateTo]);

  // Close project dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
        setProjectSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch Sprint and PI context for date range presets
  useEffect(() => {
    const fetchPeriodContext = async () => {
      try {
        const res = await fetch(getApiUrl('/api/jira/period-context'));
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          setPeriodContext({
            current_pi: data.current_pi || null,
            all_pis: data.all_pis || [],
            current_sprint: data.current_sprint || null,
            recent_sprints: data.recent_sprints || [],
          });
        }
      } catch (e) {
        console.warn('Could not load period context:', e);
      }
    };
    fetchPeriodContext();
  }, []);

  const loadCachedData = (initialize: boolean = false) => {
    try {
      const cachedProjects = localStorage.getItem('jira-projects');
      const cachedActivities = localStorage.getItem('recent-activities');
      const cachedLastRefresh = localStorage.getItem('last-refresh');
      const cachedRange = localStorage.getItem('metrics-date-range');
      const cachedMetrics = localStorage.getItem('jira-metrics');
      const cachedEnhancedMetrics = localStorage.getItem('enhanced-metrics');

      if (cachedProjects) setProjects(JSON.parse(cachedProjects));
      if (cachedActivities) setRecentActivities(JSON.parse(cachedActivities));
      if (cachedLastRefresh) setLastRefresh(new Date(cachedLastRefresh));

      // Load cached metrics to show data immediately
      if (cachedMetrics) {
        try {
          const parsedMetrics = JSON.parse(cachedMetrics);
          setJiraMetrics(parsedMetrics);
          console.log('✅ Loaded cached metrics:', parsedMetrics);
        } catch (error) {
          console.error('Error parsing cached metrics:', error);
        }
      }

      // Load cached enhanced metrics
      if (cachedEnhancedMetrics) {
        try {
          const parsedEnhancedMetrics = JSON.parse(cachedEnhancedMetrics);
          setEnhancedMetrics(parsedEnhancedMetrics);
          console.log('✅ Loaded cached enhanced metrics:', parsedEnhancedMetrics);
        } catch (error) {
          console.error('Error parsing cached enhanced metrics:', error);
        }
      }

      if (cachedRange) {
        try {
          const parsedRange = JSON.parse(cachedRange);
          if (initialize) {
            if (parsedRange?.dateFrom) setDateFrom(parsedRange.dateFrom);
            if (parsedRange?.dateTo) setDateTo(parsedRange.dateTo);
            if (parsedRange?.projectKey) setSelectedProject(parsedRange.projectKey);
          }
        } catch (error) {
          console.error('Error parsing cached range:', error);
        }
      }

      // Log cache staleness for debugging
      if (cachedLastRefresh && initialize) {
        const lastRefreshDate = new Date(cachedLastRefresh);
        const minutesSinceRefresh = (new Date().getTime() - lastRefreshDate.getTime()) / (1000 * 60);
        if (minutesSinceRefresh > 15) {
          console.log('🔄 Cached data is stale (>15 minutes old), will auto-fetch fresh data');
        } else {
          console.log(`✅ Cached data is fresh (${minutesSinceRefresh.toFixed(1)} minutes old)`);
        }
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  };

  const cacheData = (projects: Project[], metrics: JiraMetrics, activities: RecentActivity[], enhanced: EnhancedJiraMetrics) => {
    try {
      localStorage.setItem('jira-projects', JSON.stringify(projects));
      localStorage.setItem('recent-activities', JSON.stringify(activities));
      localStorage.setItem('last-refresh', new Date().toISOString());
      // Cache metrics to show immediately on next load
      if (metrics) {
        localStorage.setItem('jira-metrics', JSON.stringify(metrics));
      }
      if (enhanced) {
        localStorage.setItem('enhanced-metrics', JSON.stringify(enhanced));
      }
      localStorage.setItem('metrics-date-range', JSON.stringify({
        dateFrom,
        dateTo,
        projectKey: selectedProject || null,
      }));
    } catch (error) {
      console.error('Error caching data:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      console.log('📋 Fetching projects from:', getApiUrl('/api/jira/projects'));
      // Request detailed project list for dropdown
      const response = await fetch(getApiUrl('/api/jira/projects?maxResults=500&minimal=false'));
      console.log('📋 Projects response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Projects API error:', errorText);
        throw new Error(`Failed to fetch projects: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      console.log('📋 Projects API response:', {
        success: data.success,
        hasProjects: !!data.projects,
        hasDetailed: !!data.projects?.detailed,
        detailedLength: data.projects?.detailed?.length,
        summaryTotal: data.projects?.summary?.total
      });

      if (!data.success) {
        console.error('❌ Projects API returned success=false:', data.error);
        throw new Error(data.error || 'Projects API returned error');
      }

      // Prefer detailed list; fall back to summary values if detailed missing
      let projectsList = data.projects?.detailed || [];
      if ((!projectsList || projectsList.length === 0) && data.projects?.summary?.values) {
        projectsList = data.projects.summary.values.map((p: any) => ({
          id: p.id,
          key: p.key || p.name || 'UNKNOWN',
          name: p.name || p.key || 'Unknown Project'
        }));
      }

      console.log(`📋 Setting ${projectsList.length} projects in state`);
      setProjects(projectsList);

      // Auto-select first project if none selected yet
      if (!selectedProject && projectsList.length > 0) {
        setSelectedProject(projectsList[0].key);
        console.log(`📋 Auto-selected first project: ${projectsList[0].key}`);
      }

      if (projectsList.length > 0) {
        console.log('📋 First project sample:', projectsList[0]);
      } else {
        console.warn('⚠️ Projects list is empty!');
      }

      return projectsList;
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      setError(`Failed to load projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  const fetchMetrics = async (projectKey: string | null, fromDate: string, toDate: string) => {
    try {
      console.log('📊 Fetching metrics for project:', projectKey);
      console.log('📊 Metrics URL:', getApiUrl('/api/jira/metrics'));
      const response = await fetch(getApiUrl('/api/jira/metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey, dateFrom: fromDate, dateTo: toDate })
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

  const fetchBlockers = async () => {
    setBlockersLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/jira/blockers'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setBlockers({ blocked: data.data?.blocked_issues || [], flagged: data.data?.flagged_issues || [] });
      }
    } catch (e) {
      console.error('Blockers fetch error:', e);
    } finally {
      setBlockersLoading(false);
    }
  };

  const fetchPerformers = async (projectKey: string | null) => {
    setPerformersLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/jira/best-performers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setPerformers(data.performers || []);
    } catch (e) {
      console.error('Performers fetch error:', e);
    } finally {
      setPerformersLoading(false);
    }
  };

  const fetchEnhancedMetrics = async (projectKey: string | null, fromDate: string, toDate: string) => {
    try {
      console.log('🚀 Fetching enhanced metrics for project:', projectKey);
      const response = await fetch(getApiUrl('/api/jira/enhanced-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey, dateFrom: fromDate, dateTo: toDate })
      });

      if (!response.ok) {
        console.warn('Enhanced metrics not available, using mock data');
        return createMockEnhancedMetrics(jiraMetrics);
      }

      const data = await response.json();
      console.log('🚀 Enhanced metrics data:', data);
      if (data.success) {
        return data.metrics;
      }

      console.warn('Enhanced metrics API returned failure, using mock data');
      return createMockEnhancedMetrics(jiraMetrics);
    } catch (error) {
      console.error('❌ Error fetching enhanced metrics:', error);
      return createMockEnhancedMetrics(jiraMetrics);
    }
  };

  function createMockEnhancedMetrics(metricsOverride?: JiraMetrics | null): EnhancedJiraMetrics {
    const baseMetrics = metricsOverride ?? jiraMetrics ?? {
      totalIssues: 0,
      resolvedIssues: 0,
      openIssues: 0,
      bugs: 0,
      stories: 0,
      tasks: 0,
      epics: 0,
      subtasks: 0,
      storyPoints: 0,
      sprintVelocity: 0,
      avgResolutionTime: 0,
      issuesByStatus: {},
      issuesByPriority: {},
      issuesByAssignee: {}
    };

    return {
      ...baseMetrics,
      sprintVelocityTrends: [
        { sprintName: 'Sprint 1', startDate: '2024-01-01', endDate: '2024-01-14', committedPoints: 45, completedPoints: 42, velocity: 42 },
        { sprintName: 'Sprint 2', startDate: '2024-01-15', endDate: '2024-01-28', committedPoints: 48, completedPoints: 45, velocity: 45 },
        { sprintName: 'Sprint 3', startDate: '2024-01-29', endDate: '2024-02-11', committedPoints: 50, completedPoints: 47, velocity: 47 },
        { sprintName: 'Sprint 4', startDate: '2024-02-12', endDate: '2024-02-25', committedPoints: 52, completedPoints: 49, velocity: 49 },
        { sprintName: 'Sprint 5', startDate: '2024-02-26', endDate: '2024-03-10', committedPoints: 55, completedPoints: 52, velocity: 52 }
      ],
      burndownData: [{
        sprintName: 'Current Sprint',
        dates: ['2024-03-01', '2024-03-02', '2024-03-03', '2024-03-04', '2024-03-05', '2024-03-06', '2024-03-07'],
        idealBurndown: [50, 42.5, 35, 27.5, 20, 12.5, 5],
        actualBurndown: [50, 48, 42, 35, 28, 18, 8],
        remainingWork: [50, 48, 42, 35, 28, 18, 8]
      }],
      predictiveAnalytics: {
        sprintCompletionDate: '2024-03-12',
        completionConfidence: 85,
        velocityTrend: 'increasing',
        forecastedVelocity: 54,
        riskLevel: 'low',
        recommendations: [
          'Current velocity trend is positive',
          'Consider increasing sprint commitment by 2-3 points',
          'Team capacity utilization is optimal'
        ]
      },
      bottleneckAnalysis: [
        { status: 'In Review', avgTimeInStatus: 3.2, issuesStuck: 5, isBottleneck: true, severity: 'high' },
        { status: 'In Progress', avgTimeInStatus: 2.1, issuesStuck: 2, isBottleneck: false, severity: 'low' },
        { status: 'To Do', avgTimeInStatus: 1.5, issuesStuck: 1, isBottleneck: false, severity: 'low' }
      ],
      teamCapacity: [
        { assignee: 'John Doe', capacity: 10, currentWorkload: 8, utilizationPercentage: 80, status: 'optimal' },
        { assignee: 'Jane Smith', capacity: 10, currentWorkload: 12, utilizationPercentage: 120, status: 'overloaded' },
        { assignee: 'Bob Johnson', capacity: 10, currentWorkload: 6, utilizationPercentage: 60, status: 'underutilized' }
      ],
      historicalComparison: [
        { period: 'Last Month', totalIssues: 45, completedIssues: 42, completionRate: 93, avgResolutionTime: 3.2, velocity: 42 },
        { period: 'This Month', totalIssues: 52, completedIssues: 47, completionRate: 90, avgResolutionTime: 2.8, velocity: 47 }
      ],
      monthlyTrends: {
        months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        issues: [40, 45, 52, 48, 55, 50],
        velocity: [38, 42, 47, 45, 52, 49],
        completionRate: [95, 93, 90, 94, 92, 91]
      }
    };
  }

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setBlockers(null);
    setPerformers([]);

    console.log('🔄 Starting data fetch...');
    console.log('📡 API URL:', getApiUrl('/api/jira/projects'));

    if (!dateFrom || !dateTo) {
      setLoading(false);
      setError('Please select a valid date range.');
      return;
    }

    if (new Date(dateFrom) > new Date(dateTo)) {
      setLoading(false);
      setError('Start date cannot be after end date.');
      return;
    }

    const projectFilter = selectedProject === 'ALL' || !selectedProject ? null : selectedProject;

    try {
      const [projectsData, metricsData, activitiesData, enhancedData] = await Promise.all([
        fetchProjects(),
        fetchMetrics(projectFilter, dateFrom, dateTo),
        fetchActivities(),
        fetchEnhancedMetrics(projectFilter, dateFrom, dateTo)
      ]);

      // Fire blockers + performers in parallel (non-blocking — don't await)
      fetchBlockers();
      fetchPerformers(projectFilter);

      console.log('✅ Data fetched successfully:', {
        projects: projectsData?.length || 0,
        metrics: metricsData ? 'loaded' : 'failed',
        activities: activitiesData?.length || 0,
        enhanced: enhancedData ? 'loaded' : 'failed'
      });

      const normalizedEnhanced = enhancedData ?? createMockEnhancedMetrics(jiraMetrics);
      setEnhancedMetrics(normalizedEnhanced);
      cacheData(projectsData, metricsData, activitiesData, normalizedEnhanced);
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

  const handleGetInsights = async () => {
    // Mark that user has clicked Get Insights - enables auto-refresh on filter changes
    initialFetchRef.current = true;

    console.log('👆 User clicked Get Insights - loading data...');
    setLoading(true);
    await fetchData();
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
    // Only return top 3 statuses for performance
    return Object.entries(jiraMetrics.issuesByStatus)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
  };

  const handleEnhancedExport = async () => {
    try {
      const exportData = {
        basicMetrics: jiraMetrics,
        enhancedMetrics,
        timestamp: new Date().toISOString(),
        filters: {
          project: selectedProject,
          dateFrom,
          dateTo
        }
      };

      let blob: Blob;
      let filename: string;

      switch (exportFormat) {
        case 'json':
          blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          filename = `insights-enhanced-${new Date().toISOString().split('T')[0]}.json`;
          break;

        case 'csv':
          const csvContent = generateCSV(exportData);
          blob = new Blob([csvContent], { type: 'text/csv' });
          filename = `insights-enhanced-${new Date().toISOString().split('T')[0]}.csv`;
          break;

        case 'excel':
          const excelData = generateExcelData(exportData);
          blob = new Blob([excelData], { type: 'application/vnd.ms-excel' });
          filename = `insights-enhanced-${new Date().toISOString().split('T')[0]}.xls`;
          break;

        default: // pdf
          await exportInsightsAsPDF('insights-dashboard', `insights-enhanced-${new Date().toISOString().split('T')[0]}.pdf`);
          return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      setError('Failed to export data');
    }
  };

  const generateCSV = (data: any): string => {
    const rows = [];

    // Headers
    rows.push(['Metric', 'Value', 'Period']);

    // Basic metrics
    if (data.basicMetrics) {
      rows.push(['Total Issues', data.basicMetrics.totalIssues || 0, '']);
      rows.push(['Resolved Issues', data.basicMetrics.resolvedIssues || 0, '']);
      rows.push(['Completion Rate', `${getCompletionRate()}%`, '']);
      rows.push(['Sprint Velocity', data.basicMetrics.sprintVelocity || 0, '']);
    }

    // Enhanced metrics
    if (data.enhancedMetrics?.sprintVelocityTrends) {
      rows.push(['', '', '']); // Empty row
      rows.push(['Sprint', 'Velocity', 'Committed']);
      data.enhancedMetrics.sprintVelocityTrends.forEach((sprint: any) => {
        rows.push([sprint.sprintName, sprint.velocity, sprint.committedPoints]);
      });
    }

    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  };

  const generateExcelData = (data: any): string => {
    // Simple Excel format
    let content = '<html><body><table border="1">';

    // Basic metrics
    content += '<tr><th colspan="3">Basic Metrics</th></tr>';
    content += `<tr><td>Total Issues</td><td>${data.basicMetrics?.totalIssues || 0}</td><td></td></tr>`;
    content += `<tr><td>Resolved Issues</td><td>${data.basicMetrics?.resolvedIssues || 0}</td><td></td></tr>`;
    content += `<tr><td>Completion Rate</td><td>${getCompletionRate()}%</td><td></td></tr>`;

    // Enhanced metrics
    if (data.enhancedMetrics?.sprintVelocityTrends) {
      content += '<tr><th colspan="3">Sprint Velocity Trends</th></tr>';
      content += '<tr><th>Sprint</th><th>Velocity</th><th>Committed</th></tr>';
      data.enhancedMetrics.sprintVelocityTrends.forEach((sprint: any) => {
        content += `<tr><td>${sprint.sprintName}</td><td>${sprint.velocity}</td><td>${sprint.committedPoints}</td></tr>`;
      });
    }

    content += '</table></body></html>';
    return content;
  };

  const getPriorityDistribution = () => {
    if (!jiraMetrics?.issuesByPriority) return [];
    return Object.entries(jiraMetrics.issuesByPriority)
      .sort(([,a], [,b]) => b - a);
  };

  const topAssignees = React.useMemo(() => getTopAssignees(), [jiraMetrics]);
  const statusDistribution = React.useMemo(() => getStatusDistribution(), [jiraMetrics]);
  const priorityDistribution = React.useMemo(() => getPriorityDistribution(), [jiraMetrics]);

  const maxAssigneeCount = topAssignees.length > 0
    ? Math.max(...topAssignees.map(([, count]) => count))
    : 0;

  const maxStatusCount = statusDistribution.length > 0
    ? Math.max(...statusDistribution.map(([, count]) => count))
    : 0;

  const maxPriorityCount = priorityDistribution.length > 0
    ? Math.max(...priorityDistribution.map(([, count]) => count))
    : 0;

const totalAssigneeIssues = topAssignees.reduce((sum, [, count]) => sum + count, 0);
const avgIssuesPerMember = topAssignees.length > 0
  ? Math.round(totalAssigneeIssues / topAssignees.length)
  : 0;

  const formatDateLabel = (value: string | null | undefined) => {
    if (!value) return '—';
    const dateObj = new Date(value);
    if (Number.isNaN(dateObj.getTime())) return value;
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const appliedFilters = jiraMetrics?.filters || {};
  const appliedDateFrom = appliedFilters.dateFrom || dateFrom;
  const appliedDateTo = appliedFilters.dateTo || dateTo;
  const dateRangeLabel = `${formatDateLabel(appliedDateFrom)} → ${formatDateLabel(appliedDateTo)}`;
  const issuesInRange = typeof jiraMetrics?.totalIssues === 'number' ? jiraMetrics.totalIssues : null;

  const handleDateFromChange = (value: string) => {
    if (!value) return;
    const newFrom = new Date(value);
    const currentTo = new Date(dateTo);
    if (dateTo && newFrom > currentTo) {
      setDateTo(value);
    }
    setDateFrom(value);
  };

  const handleDateToChange = (value: string) => {
    if (!value) return;
    const newTo = new Date(value);
    const currentFrom = new Date(dateFrom);
    if (dateFrom && newTo < currentFrom) {
      setDateFrom(value);
    }
    setDateTo(value);
  };


  // Export dashboard as PDF
  const handleExportPDF = async () => {
    try {
      await exportInsightsAsPDF('insights-dashboard', `insights-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  // Generate AI-powered insights
  const generateAIInsights = async () => {
    if (!jiraMetrics) return;

    setIsGeneratingInsights(true);

    try {
      // Simulate AI processing time
      await new Promise(resolve => setTimeout(resolve, 1500));

      const suggestions: AISuggestion[] = [];

      // Analyze workload distribution
      if (jiraMetrics.issuesByAssignee) {
        const assignees = Object.entries(jiraMetrics.issuesByAssignee);

        if (assignees.length > 0) {
          const counts = assignees.map(([_, count]) => count);
          const maxWorkload = Math.max(...counts);
          const minWorkload = Math.min(...counts);
          const workloadDifference = maxWorkload - minWorkload;

          if (workloadDifference > 5) {
            const overloadedPerson = assignees.find(([_, count]) => count === maxWorkload)?.[0];
            const underloadedPerson = assignees.find(([_, count]) => count === minWorkload)?.[0];

            if (overloadedPerson && underloadedPerson) {
              suggestions.push({
                component: 'workload',
                suggestion: `Workload imbalance detected! ${overloadedPerson} has ${maxWorkload} issues while ${underloadedPerson} has only ${minWorkload}. Consider redistributing 2-3 issues from ${overloadedPerson} to ${underloadedPerson} to balance the team workload.`,
                priority: 'high',
                actionable: true
              });
            }
          }
        }
      }

      // Analyze priority distribution
      if (jiraMetrics.issuesByPriority) {
        const priorities = Object.entries(jiraMetrics.issuesByPriority);
        const highPriority = priorities.find(([priority]) => priority.toLowerCase().includes('high'))?.[1] || 0;
        const totalIssues = jiraMetrics.totalIssues;
        const highPriorityPercentage = (highPriority / totalIssues) * 100;

        if (highPriorityPercentage > 20) {
          suggestions.push({
            component: 'priority',
            suggestion: `High priority overload! ${highPriorityPercentage.toFixed(1)}% of issues are high priority (${highPriority}/${totalIssues}). This may indicate scope creep or insufficient planning. Consider reviewing and potentially downgrading some high-priority issues to medium priority.`,
            priority: 'high',
            actionable: true
          });
        }
      }

      // Analyze completion rate
      const completionRate = (jiraMetrics.resolvedIssues / jiraMetrics.totalIssues) * 100;
      if (completionRate < 60) {
        suggestions.push({
          component: 'completion',
          suggestion: `Low completion rate detected (${completionRate.toFixed(1)}%). This suggests potential bottlenecks in the development process. Consider implementing daily standups, breaking down large tasks, or reviewing the current workflow to identify and remove blockers.`,
          priority: 'high',
          actionable: true
        });
      }

      // Analyze average resolution time
      if (jiraMetrics.avgResolutionTime > 5) {
        suggestions.push({
          component: 'resolution',
          suggestion: `Long resolution times detected (${jiraMetrics.avgResolutionTime} days average). This impacts team velocity and customer satisfaction. Consider implementing better task estimation, clearer requirements, or additional resources for complex issues.`,
          priority: 'medium',
          actionable: true
        });
      }

      // Analyze bug-to-story ratio
      const bugRatio = (jiraMetrics.bugs / jiraMetrics.stories) * 100;
      if (bugRatio > 30) {
        suggestions.push({
          component: 'quality',
          suggestion: `High bug ratio detected (${bugRatio.toFixed(1)}% bugs vs stories). This indicates potential quality issues. Consider implementing better testing practices, code reviews, or allocating more time for quality assurance in the development process.`,
          priority: 'medium',
          actionable: true
        });
      }

      setAiSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate AI insights:', error);
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Toggle AI insights
  const toggleAIInsights = async () => {
    if (!aiInsightsEnabled) {
      await generateAIInsights();
    }
    setAiInsightsEnabled(!aiInsightsEnabled);
  };

  // Get AI suggestion for a specific component
  const getAISuggestion = (component: string): AISuggestion | null => {
    return aiSuggestions.find(suggestion => suggestion.component === component) || null;
  };

  // AI Tooltip Component
  const AITooltip = ({ component, children }: { component: string; children: React.ReactNode }) => {
    const suggestion = getAISuggestion(component);

    if (!aiInsightsEnabled || !suggestion) {
      return <>{children}</>;
    }

    return (
      <div className="relative group">
        {children}
        <div className="absolute -top-2 -right-2 z-50">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
            <Button
              size="sm"
              className="h-6 w-6 p-0 rounded-full"
              style={{
                backgroundColor: suggestion.priority === 'high' ? 'var(--red)' : suggestion.priority === 'medium' ? 'var(--amber)' : 'var(--accent-cool)',
              }}
              onClick={() => setActiveTooltip(activeTooltip === component ? null : component)}
            >
              <Lightbulb className="h-3 w-3" style={{ color: 'var(--bg-page)' }} />
            </Button>

            {activeTooltip === component && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute top-8 right-0 w-80 p-4 rounded-xl shadow-2xl border-2 z-50"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: suggestion.priority === 'high'
                    ? 'var(--red)'
                    : suggestion.priority === 'medium'
                      ? 'var(--amber)'
                      : 'var(--accent-cool)'
                }}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{
                      color: suggestion.priority === 'high'
                        ? 'var(--red)'
                        : suggestion.priority === 'medium'
                          ? 'var(--amber)'
                          : 'var(--accent-cool)',
                      backgroundColor: suggestion.priority === 'high'
                        ? applyAlpha('var(--red)', isDarkMode ? 0.25 : 0.15)
                        : suggestion.priority === 'medium'
                          ? applyAlpha('var(--amber)', isDarkMode ? 0.25 : 0.15)
                          : applyAlpha('var(--accent-cool)', isDarkMode ? 0.25 : 0.15)
                    }}
                  >
                    <Brain className="h-4 w-4" style={{ color: 'inherit' }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span
                        className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{
                          color: suggestion.priority === 'high'
                            ? 'var(--red)'
                            : suggestion.priority === 'medium'
                              ? 'var(--amber)'
                              : 'var(--accent-cool)',
                          backgroundColor: suggestion.priority === 'high'
                            ? applyAlpha('var(--red)', isDarkMode ? 0.3 : 0.18)
                            : suggestion.priority === 'medium'
                              ? applyAlpha('var(--amber)', isDarkMode ? 0.3 : 0.18)
                              : applyAlpha('var(--accent-cool)', isDarkMode ? 0.3 : 0.18)
                        }}
                      >
                        {suggestion.priority.toUpperCase()} PRIORITY
                      </span>
                      {suggestion.actionable && (
                        <span
                          className="text-xs font-medium px-2 py-1 rounded-full"
                          style={{
                            color: 'var(--accent-cool)',
                            backgroundColor: applyAlpha('var(--accent-cool)', isDarkMode ? 0.25 : 0.15)
                          }}
                        >
                          ACTIONABLE
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {suggestion.suggestion}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>AI Insight</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setActiveTooltip(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    );
  };

  // Show the Jira logo loading animation while initial data loads (no metrics yet)
  if (loading && !jiraMetrics) {
    return <JiraLoader />;
  }

  // ─── Shared input style helper ────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 500,
    width: '100%',
    cursor: 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 4,
    display: 'block',
  };

  // ─── Chart data helpers ───────────────────────────────────────────────────
  const velocityChartData = enhancedMetrics?.sprintVelocityTrends?.map(item => ({
    sprint: item.sprintName,
    velocity: item.velocity,
    committed: item.committedPoints,
    completed: item.completedPoints,
  })) || [];

  const burndownChartData = enhancedMetrics?.burndownData?.[0]?.dates?.map((date, index) => ({
    date,
    ideal: enhancedMetrics.burndownData[0].idealBurndown[index],
    actual: enhancedMetrics.burndownData[0].actualBurndown[index],
    remaining: enhancedMetrics.burndownData[0].remainingWork[index],
  })) || [];

  const capacityChartData = enhancedMetrics?.teamCapacity?.map(item => ({
    assignee: item.assignee.split(' ')[0],
    utilization: item.utilizationPercentage,
  })) || [];

  const historicalChartData = enhancedMetrics?.monthlyTrends?.months?.map((month, index) => ({
    month,
    issues: enhancedMetrics.monthlyTrends.issues[index],
    velocity: enhancedMetrics.monthlyTrends.velocity[index],
    completion: enhancedMetrics.monthlyTrends.completionRate[index],
  })) || [];

  // ─── Issue type total ─────────────────────────────────────────────────────
  const issueTypeTotal = (jiraMetrics?.bugs || 0) + (jiraMetrics?.stories || 0) + (jiraMetrics?.tasks || 0) + (jiraMetrics?.epics || 0);
  const issueTypes = [
    { label: 'Bugs',    value: jiraMetrics?.bugs || 0,    color: 'var(--red)',         pct: issueTypeTotal > 0 ? Math.round(((jiraMetrics?.bugs || 0) / issueTypeTotal) * 100) : 0 },
    { label: 'Stories', value: jiraMetrics?.stories || 0, color: 'var(--accent-cool)', pct: issueTypeTotal > 0 ? Math.round(((jiraMetrics?.stories || 0) / issueTypeTotal) * 100) : 0 },
    { label: 'Tasks',   value: jiraMetrics?.tasks || 0,   color: 'var(--green)',        pct: issueTypeTotal > 0 ? Math.round(((jiraMetrics?.tasks || 0) / issueTypeTotal) * 100) : 0 },
    { label: 'Epics',   value: jiraMetrics?.epics || 0,   color: 'var(--amber)',        pct: issueTypeTotal > 0 ? Math.round(((jiraMetrics?.epics || 0) / issueTypeTotal) * 100) : 0 },
  ];

  // ─── 6 KPI summary stats ──────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total Issues',    value: jiraMetrics?.totalIssues ?? '—',    color: 'var(--accent-cool)', bar: jiraMetrics ? 80 : 0 },
    { label: 'Open Issues',     value: jiraMetrics?.openIssues ?? '—',     color: 'var(--amber)',        bar: jiraMetrics && jiraMetrics.totalIssues > 0 ? Math.round((jiraMetrics.openIssues / jiraMetrics.totalIssues) * 100) : 0 },
    { label: 'Resolved',        value: jiraMetrics?.resolvedIssues ?? '—', color: 'var(--green)',        bar: getCompletionRate() },
    { label: 'Bugs',            value: jiraMetrics?.bugs ?? '—',           color: 'var(--red)',          bar: jiraMetrics && jiraMetrics.totalIssues > 0 ? Math.round(((jiraMetrics.bugs || 0) / jiraMetrics.totalIssues) * 100) : 0 },
    { label: 'Stories',         value: jiraMetrics?.stories ?? '—',        color: 'var(--accent-cool)', bar: jiraMetrics && jiraMetrics.totalIssues > 0 ? Math.round(((jiraMetrics.stories || 0) / jiraMetrics.totalIssues) * 100) : 0 },
    { label: 'Story Points',    value: jiraMetrics?.storyPoints ?? '—',    color: 'var(--text-primary)', bar: 60 },
  ];

  // ─── Section title style ──────────────────────────────────────────────────
  const sectionTitle = (label: string, icon: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{label}</span>
    </div>
  );

  // ─── Divider ──────────────────────────────────────────────────────────────
  const divider = <div style={{ height: 1, background: 'var(--border)', margin: '0 0 28px' }} />;

  // ─── Date presets (real Sprint/PI dates when context is loaded) ────────────
  interface DatePreset {
    key: string;
    label: string;
    tip: string;
    startDate?: string;
    endDate?: string;
    days?: number;
  }

  const DATE_PRESETS: DatePreset[] = useMemo(() => {
    const sprint = periodContext?.current_sprint;
    const pi = periodContext?.current_pi;

    const sprintLabel = sprint?.sprintName
      ? (sprint.sprintName.length > 16 ? sprint.sprintName.slice(0, 16) + '…' : sprint.sprintName)
      : 'Sprint';
    const sprintTip = sprint
      ? `${sprint.sprintName} · ${sprint.startDate} → ${sprint.endDate}`
      : '1 Sprint · 2 weeks';

    const piLabel = pi ? `${pi.pi} · ${pi.year}` : 'PI';
    const piTip = pi
      ? `${pi.label} · ${pi.startDate} → ${pi.endDate}`
      : 'Program Increment · 5 Sprints · 10 weeks';

    return [
      { key: 'week',    label: 'Week',      tip: 'Last 7 days',              days: 7 },
      { key: 'sprint',  label: sprintLabel, tip: sprintTip,
        ...(sprint ? { startDate: sprint.startDate, endDate: sprint.endDate } : { days: 14 }) },
      { key: 'month',   label: 'Month',     tip: 'Last 30 days',             days: 30 },
      { key: 'pi',      label: piLabel,     tip: piTip,
        ...(pi ? { startDate: pi.startDate, endDate: pi.endDate } : { days: 70 }) },
      { key: 'quarter', label: 'Quarter',   tip: 'Last 90 days · 1 Quarter', days: 90 },
      { key: 'year',    label: 'Year',      tip: 'Last 12 months',           days: 365 },
    ];
  }, [periodContext]);

  const applyDatePreset = (preset: DatePreset) => {
    if (preset.startDate && preset.endDate) {
      setDateFrom(preset.startDate);
      setDateTo(preset.endDate);
    } else if (preset.days) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - (preset.days - 1));
      setDateTo(end.toISOString().split('T')[0]);
      setDateFrom(start.toISOString().split('T')[0]);
    }
  };

  const daysDiff = dateFrom && dateTo
    ? Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : null;

  const activePresetKey = useMemo((): string | null => {
    if (!dateFrom || !dateTo) return null;
    for (const p of DATE_PRESETS) {
      if (p.startDate && p.endDate && dateFrom === p.startDate && dateTo === p.endDate) return p.key;
      if (!p.startDate && p.days && daysDiff === p.days) return p.key;
    }
    return null;
  }, [dateFrom, dateTo, DATE_PRESETS, daysDiff]);

  // ─── Info Tooltip ─────────────────────────────────────────────────────────
  const InfoTooltip = ({ id, text, width = 240 }: { id: string; text: string; width?: number }) => (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button
        onMouseEnter={() => setActiveInfoTooltip(id)}
        onMouseLeave={() => setActiveInfoTooltip(null)}
        style={{ background: 'none', border: 'none', padding: '0 0 0 5px', cursor: 'default', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', lineHeight: 1 }}
      >
        <Info size={11} />
      </button>
      {activeInfoTooltip === id && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 9,
          padding: '9px 12px', width, zIndex: 9999, boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
          pointerEvents: 'none',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{text}</p>
          <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />
        </div>
      )}
    </div>
  );

  // ─── Searchable Project Select ────────────────────────────────────────────
  const SearchableProjectSelect = () => {
    const q = projectSearch.toLowerCase();
    const filtered = projects.filter(p => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));
    const selectedObj = projects.find(p => p.key === selectedProject);
    const displayName = selectedProject === 'ALL' || !selectedProject ? 'All Projects' : (selectedObj?.name || selectedProject);

    return (
      <div ref={projectDropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setProjectDropdownOpen(v => !v)}
          style={{
            width: '100%', height: 36,
            background: 'var(--bg-surface)', border: `1px solid ${projectDropdownOpen ? 'var(--accent-cool)' : 'var(--border)'}`,
            borderRadius: 10, padding: '0 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
          }}
        >
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, flex: 1 }}>{displayName}</span>
            {selectedObj && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-cool)18', color: 'var(--accent-cool)', borderRadius: 5, padding: '1px 6px', flexShrink: 0, letterSpacing: '0.04em' }}>
                {selectedObj.key}
              </span>
            )}
          </div>
          <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: projectDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {projectDropdownOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 28px rgba(0,0,0,0.2)', overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', borderRadius: 8, padding: '5px 9px' }}>
                <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  autoFocus
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  placeholder="Search by name or key…"
                  style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', width: '100%' }}
                />
                {projectSearch && (
                  <button onClick={() => setProjectSearch('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              <button
                onClick={() => { setSelectedProject('ALL'); setProjectDropdownOpen(false); setProjectSearch(''); }}
                style={{ width: '100%', padding: '8px 12px', background: selectedProject === 'ALL' ? 'var(--accent-cool)10' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontSize: 13, color: selectedProject === 'ALL' ? 'var(--accent-cool)' : 'var(--text-primary)', fontWeight: selectedProject === 'ALL' ? 600 : 400 }}>All Projects</span>
              </button>
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProject(p.key); setProjectDropdownOpen(false); setProjectSearch(''); }}
                  style={{ width: '100%', padding: '8px 12px', background: selectedProject === p.key ? 'var(--accent-cool)10' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: selectedProject === p.key ? 'var(--accent-cool)' : 'var(--text-primary)', fontWeight: selectedProject === p.key ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-cool)18', color: 'var(--accent-cool)', borderRadius: 5, padding: '1px 6px', flexShrink: 0, letterSpacing: '0.04em' }}>{p.key}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No projects match "{projectSearch}"</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── KPI tooltip copy ─────────────────────────────────────────────────────
  const KPI_TOOLTIPS: Record<string, string> = {
    'Total Issues': 'Total number of Jira issues active within the selected date range and project — includes all types (bugs, stories, tasks, epics).',
    'Open Issues': 'Issues currently open and not yet resolved. A rising open count may indicate backlog growth or delivery bottlenecks.',
    'Resolved': 'Issues successfully closed within the date range — a direct measure of team throughput and delivery pace.',
    'Bugs': 'Reported defects and errors in the system. A growing bug count relative to stories may signal quality risks needing attention.',
    'Stories': 'User stories representing planned feature work. Tracks new development commitments and feature delivery.',
    'Story Points': 'Team-assigned effort units used to size work items. Helps measure sprint velocity and forecast delivery capacity.',
  };

  return (
    <DashboardLayout>
      <div
        id="insights-dashboard"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '28px 28px 48px',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* ── HEADER ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <p style={{ color: 'var(--accent-cool)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Jira Integration
              </p>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 4px' }}>
                Jira Insights
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Real-time project intelligence for engineering leaders
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* AI toggle */}
              <button
                onClick={toggleAIInsights}
                disabled={isGeneratingInsights || !jiraMetrics}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: aiInsightsEnabled ? 'var(--accent-cool)18' : 'var(--bg-card)',
                  border: `1px solid ${aiInsightsEnabled ? 'var(--accent-cool)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  color: aiInsightsEnabled ? 'var(--accent-cool)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                  opacity: (!jiraMetrics || isGeneratingInsights) ? 0.5 : 1,
                }}
              >
                <Brain size={13} />
                {isGeneratingInsights ? 'Analyzing…' : 'AI Insights'}
              </button>

              {/* Refresh */}
              <button
                onClick={refreshData}
                disabled={isRefreshing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                  opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.15s',
                }}
              >
                <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                Refresh
              </button>

              {/* Export PDF */}
              <button
                onClick={handleExportPDF}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                }}
              >
                <FileText size={13} />
                Export PDF
              </button>

              {/* Export CSV */}
              <button
                onClick={() => { setExportFormat('csv'); setTimeout(() => handleEnhancedExport(), 0); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                }}
              >
                <Download size={13} />
                Export CSV
              </button>
            </div>
          </div>

          {/* ── ERROR BANNER ─────────────────────────────────────────────── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: 'var(--red)12', border: '1px solid var(--red)40',
                  borderRadius: 12, padding: '14px 18px', marginBottom: 20,
                }}
              >
                <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>
                  {error} — using cached data where available.
                </div>
                <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── FILTER BAR ───────────────────────────────────────────────── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 168px 168px auto', gap: 16, alignItems: 'end' }}>
              {/* Project dropdown — searchable with name + key */}
              <div>
                <span style={labelStyle}>Project</span>
                <SearchableProjectSelect />
              </div>

              {/* Date from */}
              <div>
                <span style={labelStyle}>From</span>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
                  <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo}
                    onChange={e => handleDateFromChange(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Date to */}
              <div>
                <span style={labelStyle}>To</span>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
                  <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={e => handleDateToChange(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Get Insights button */}
              <button
                onClick={handleGetInsights}
                disabled={loading}
                style={{
                  background: 'var(--accent-cool)', color: '#000',
                  border: 'none', borderRadius: 10, padding: '0 22px',
                  fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  height: 36, display: 'flex', alignItems: 'center', gap: 7,
                  opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {loading
                  ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Zap size={13} />
                }
                {loading ? 'Loading…' : 'Get Insights'}
              </button>
            </div>

            {/* Date preset quick-picks */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2 }}>Period:</span>
              {DATE_PRESETS.map(p => {
                const active = activePresetKey === p.key;
                return (
                  <div key={p.key} style={{ position: 'relative' }}>
                    <button
                      onClick={() => applyDatePreset(p)}
                      onMouseEnter={() => setActiveInfoTooltip(`preset-${p.key}`)}
                      onMouseLeave={() => setActiveInfoTooltip(null)}
                      style={{
                        background: active ? 'var(--accent-cool)' : 'var(--bg-surface)',
                        color: active ? '#000' : 'var(--text-secondary)',
                        border: `1px solid ${active ? 'var(--accent-cool)' : 'var(--border)'}`,
                        borderRadius: 7, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
                      }}
                    >
                      {p.label}
                    </button>
                    {activeInfoTooltip === `preset-${p.key}` && (
                      <div style={{
                        position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7,
                        padding: '5px 10px', whiteSpace: 'nowrap', zIndex: 999,
                        fontSize: 11, color: 'var(--text-secondary)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.16)', pointerEvents: 'none',
                      }}>
                        {p.tip}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active filter pills */}
            {jiraMetrics && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing data for</span>
                {(() => {
                  const selObj = projects.find(p => p.key === selectedProject);
                  return selObj ? (
                    <span style={{ fontSize: 11, background: 'var(--accent-cool)18', color: 'var(--accent-cool)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                      {selObj.name} · {selObj.key}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, background: 'var(--accent-cool)18', color: 'var(--accent-cool)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                      All Projects
                    </span>
                  );
                })()}
                <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 6, padding: '2px 8px' }}>
                  {dateRangeLabel}
                </span>
                {daysDiff !== null && (
                  <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-muted)', borderRadius: 6, padding: '2px 8px' }}>
                    {daysDiff} days
                  </span>
                )}
                {issuesInRange !== null && (
                  <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 6, padding: '2px 8px' }}>
                    {issuesInRange} issues
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {/* ── LOADING INLINE ───────────────────────────────────────────── */}
          {loading && jiraMetrics && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--accent-cool)10', border: '1px solid var(--accent-cool)30', borderRadius: 10, marginBottom: 24, fontSize: 13, color: 'var(--accent-cool)' }}>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Refreshing data…
            </div>
          )}

          {/* ── EMPTY STATE ──────────────────────────────────────────────── */}
          {!jiraMetrics && !loading && (
            <div style={{ textAlign: 'center', padding: '80px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <BarChart3 size={28} style={{ color: 'var(--accent-cool)' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>No Data Yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 28px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                Connect Jira and click "Get Insights" to load your team's project analytics.
              </p>
              <button
                onClick={handleGetInsights}
                style={{ background: 'var(--accent-cool)', color: '#000', border: 'none', borderRadius: 10, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Get Insights
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* DATA SECTIONS — only rendered when jiraMetrics is available   */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {jiraMetrics && (
            <>
              {/* ── AI SUGGESTIONS PANEL ──────────────────────────────── */}
              <AnimatePresence>
                {aiInsightsEnabled && aiSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden', marginBottom: 28 }}
                  >
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Brain size={16} style={{ color: 'var(--accent-cool)' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>AI Insights</span>
                        <span style={{ fontSize: 11, background: 'var(--accent-cool)20', color: 'var(--accent-cool)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                          {aiSuggestions.length} suggestion{aiSuggestions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {aiSuggestions.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 12,
                              background: s.priority === 'high' ? 'var(--red)08' : s.priority === 'medium' ? 'var(--amber)08' : 'var(--accent-cool)08',
                              border: `1px solid ${s.priority === 'high' ? 'var(--red)30' : s.priority === 'medium' ? 'var(--amber)30' : 'var(--accent-cool)30'}`,
                              borderRadius: 10, padding: '12px 14px',
                            }}
                          >
                            <Lightbulb size={14} style={{ color: s.priority === 'high' ? 'var(--red)' : s.priority === 'medium' ? 'var(--amber)' : 'var(--accent-cool)', flexShrink: 0, marginTop: 1 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.priority === 'high' ? 'var(--red)' : s.priority === 'medium' ? 'var(--amber)' : 'var(--accent-cool)' }}>
                                  {s.priority}
                                </span>
                                {s.actionable && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>• actionable</span>}
                              </div>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{s.suggestion}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── KPI SUMMARY ROW ──────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
                {kpiCards.map((kpi, i) => (
                  <div
                    key={kpi.label}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '16px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                        {kpi.label}
                      </div>
                      {KPI_TOOLTIPS[kpi.label] && (
                        <InfoTooltip id={`kpi-${kpi.label}`} text={KPI_TOOLTIPS[kpi.label]} width={220} />
                      )}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                      {kpi.value}
                    </div>
                    <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, kpi.bar)}%`, background: kpi.color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* ── QUICK STATS ROW ──────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
                {/* Completion rate */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle size={20} style={{ color: 'var(--green)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Completion Rate</div>
                      <InfoTooltip id="qs-completion" text="Percentage of total issues that have been resolved (Resolved ÷ Total Issues). A healthy, high-performing team typically sustains 85%+ completion within a sprint." width={260} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.03em' }}>{getCompletionRate()}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{jiraMetrics.resolvedIssues} of {jiraMetrics.totalIssues} resolved</div>
                  </div>
                </div>

                {/* Sprint velocity */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-cool)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TrendingUp size={20} style={{ color: 'var(--accent-cool)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Sprint Velocity</div>
                      <InfoTooltip id="qs-velocity" text="Average story points delivered per sprint. Rising velocity signals growing team capacity; a falling trend may indicate blockers, scope creep, or team overload." width={260} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-cool)', letterSpacing: '-0.03em' }}>{jiraMetrics.sprintVelocity || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts · {jiraMetrics.storyPoints || 0} total story pts</div>
                  </div>
                </div>

                {/* Avg resolution */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--amber)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Clock size={20} style={{ color: 'var(--amber)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Avg Resolution</div>
                      <InfoTooltip id="qs-resolution" text="Average time in days from when an issue is created to when it is resolved. Lower values indicate fewer process bottlenecks and faster delivery cycles." width={260} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)', letterSpacing: '-0.03em' }}>{jiraMetrics.avgResolutionTime || 0}d</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>days to close · lower is better</div>
                  </div>
                </div>
              </div>

              {/* ── CHARTS SECTION ───────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 28 }}>
                {/* Main velocity / chart card */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                  {/* Sprint Goal banner */}
                  {enhancedMetrics?.latestSprintGoal && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--accent-cool)10', border: '1px solid var(--accent-cool)30', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                      <Target size={14} style={{ color: 'var(--accent-cool)', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-cool)', marginRight: 8 }}>Sprint Goal</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{enhancedMetrics.latestSprintGoal}</span>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const CHART_TOOLTIPS: Record<string, string> = {
                      velocity: 'Sprint-over-sprint view of committed vs. completed story points. The gap between the two lines shows over- or under-delivery trends.',
                      burndown: 'Remaining work (story points) per sprint day. The ideal line shows target pace; the blue line shows actual progress — deviation signals risk.',
                      capacity: 'Each team member\'s current workload as % of their capacity. 70–90% = optimal zone; >100% = overloaded; <70% = underutilized.',
                      historical: 'Month-over-month issue volume and velocity — helps identify seasonal patterns, growth trends, or delivery slowdowns over time.',
                    };
                    const chartTitles: Record<string, string> = {
                      velocity: 'Sprint Velocity Trends',
                      burndown: 'Burndown Chart',
                      capacity: 'Team Capacity',
                      historical: 'Historical Trends',
                    };
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <TrendingUp size={15} style={{ color: 'var(--accent-cool)' }} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{chartTitles[selectedChartView]}</span>
                          <InfoTooltip id={`chart-${selectedChartView}`} text={CHART_TOOLTIPS[selectedChartView]} width={280} />
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['velocity', 'burndown', 'capacity', 'historical'] as const).map(v => (
                            <button
                              key={v}
                              onClick={() => setSelectedChartView(v)}
                              style={{
                                background: selectedChartView === v ? 'var(--accent-cool)' : 'var(--bg-surface)',
                                color: selectedChartView === v ? '#000' : 'var(--text-secondary)',
                                border: `1px solid ${selectedChartView === v ? 'var(--accent-cool)' : 'var(--border)'}`,
                                borderRadius: 8, padding: '4px 11px', fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', textTransform: 'capitalize', letterSpacing: '0.03em',
                              }}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {selectedChartView === 'velocity' ? (
                        <ComposedChart data={velocityChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="sprint" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                          <Bar dataKey="committed" fill="var(--bg-surface)" radius={[4, 4, 0, 0]} />
                          <Line type="monotone" dataKey="velocity" stroke="var(--accent-cool)" strokeWidth={2.5} dot={{ fill: 'var(--accent-cool)', r: 3 }} />
                          <Line type="monotone" dataKey="completed" stroke="var(--green)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                        </ComposedChart>
                      ) : selectedChartView === 'burndown' ? (
                        <ComposedChart data={burndownChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                          <Area type="monotone" dataKey="remaining" fill="var(--amber)" fillOpacity={0.12} stroke="none" />
                          <Line type="monotone" dataKey="ideal" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                          <Line type="monotone" dataKey="actual" stroke="var(--accent-cool)" strokeWidth={2.5} dot={{ fill: 'var(--accent-cool)', r: 3 }} />
                        </ComposedChart>
                      ) : selectedChartView === 'capacity' ? (
                        <ComposedChart data={capacityChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="assignee" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={36} unit="%" />
                          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                          <Bar dataKey="utilization" radius={[6, 6, 0, 0]} fill="var(--accent-cool)" />
                        </ComposedChart>
                      ) : (
                        <ComposedChart data={historicalChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                          <Bar yAxisId="left" dataKey="issues" fill="var(--accent-cool)" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="velocity" stroke="var(--green)" strokeWidth={2.5} dot={{ fill: 'var(--green)', r: 3 }} />
                        </ComposedChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Issue type breakdown */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <PieChart size={15} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Issue Breakdown</span>
                    <InfoTooltip id="issue-breakdown" text="Distribution of issue types (Bugs, Stories, Tasks, Epics) created in the selected period. A high bug-to-story ratio may indicate quality debt accumulating faster than new development." width={270} />
                  </div>

                  {/* Horizontal stacked bar */}
                  <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 20 }}>
                    {issueTypes.map(t => (
                      <div key={t.label} style={{ width: `${t.pct}%`, background: t.color, transition: 'width 0.6s ease' }} />
                    ))}
                  </div>

                  {/* List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {issueTypes.map(t => (
                      <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{t.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.value}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>{t.pct}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                  {/* Status distribution */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Activity size={13} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Status</span>
                    <InfoTooltip id="status-dist" text="Current spread of issues across workflow stages. A large 'To Do' count signals backlog growth; many 'In Progress' items may cause context-switching and reduced focus." width={260} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {statusDistribution.length > 0 ? statusDistribution.map(([status, count]) => {
                      const pct = maxStatusCount > 0 ? Math.round((count / maxStatusCount) * 100) : 0;
                      const color = status === 'Done' ? 'var(--green)' : status === 'In Progress' ? 'var(--accent-cool)' : 'var(--amber)';
                      return (
                        <div key={status}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{status}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
                          </div>
                          <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      );
                    }) : (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No status data</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── TEAM CAPACITY + BOTTLENECKS ───────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                {/* Team capacity */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users size={15} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Team Capacity</span>
                    <InfoTooltip id="team-capacity" text="Each team member's current workload as a % of their available capacity. Red = overloaded (>100%), Green = optimal (70–90%), Yellow = underutilized (<70%). Balancing workloads improves both output and team health." width={280} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {enhancedMetrics?.teamCapacity?.length > 0
                      ? enhancedMetrics.teamCapacity.slice(0, 5).map(member => (
                        <div
                          key={member.assignee}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)40' }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-cool)20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent-cool)', flexShrink: 0 }}>
                            {member.assignee.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {member.assignee}
                          </span>
                          <div style={{ width: 100, height: 5, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(100, member.utilizationPercentage)}%`,
                              background: member.status === 'overloaded' ? 'var(--red)' : member.status === 'optimal' ? 'var(--green)' : 'var(--amber)',
                              borderRadius: 3,
                              transition: 'width 0.6s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: member.status === 'overloaded' ? 'var(--red)' : member.status === 'optimal' ? 'var(--green)' : 'var(--amber)', minWidth: 38, textAlign: 'right' }}>
                            {Math.round(member.utilizationPercentage)}%
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 7px', background: 'var(--bg-surface)', borderRadius: 4, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                            {member.status}
                          </span>
                        </div>
                      ))
                      : <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No capacity data available.</p>
                    }
                  </div>

                  {/* Top assignees by issues */}
                  {topAssignees.length > 0 && (
                    <>
                      <div style={{ height: 1, background: 'var(--border)', margin: '20px 0 16px' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Issue Distribution</span>
                        <InfoTooltip id="issue-dist" text="Number of issues currently assigned to each team member in the selected project and date range. Uneven bars signal workload imbalance that may affect delivery pace." width={260} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {topAssignees.map(([assignee, count]) => (
                          <div key={assignee} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee}</span>
                            <div style={{ width: 80, height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${maxAssigneeCount > 0 ? (count / maxAssigneeCount) * 100 : 0}%`, background: 'var(--accent-cool)', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Bottlenecks + Predictive */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Bottlenecks */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--amber)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Process Bottlenecks</span>
                      <InfoTooltip id="bottlenecks" text="Workflow stages where issues stall longer than average. A high 'stuck' count at a specific stage (e.g. 'In Review') signals friction that slows the entire delivery pipeline." width={270} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {enhancedMetrics?.bottleneckAnalysis?.length > 0
                        ? enhancedMetrics.bottleneckAnalysis.slice(0, 5).map((b, i) => {
                          const color = b.severity === 'high' ? 'var(--red)' : b.severity === 'medium' ? 'var(--amber)' : 'var(--green)';
                          return (
                            <div
                              key={i}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px', borderRadius: 10,
                                background: `${color}0d`,
                                border: `1px solid ${color}30`,
                                borderLeft: `3px solid ${color}`,
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                  {b.status}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {b.issuesStuck} stuck · avg {b.avgTimeInStatus}d
                                </div>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color, padding: '3px 8px', background: `${color}18`, borderRadius: 6 }}>
                                {b.severity}
                              </span>
                              {b.isBottleneck && (
                                <AlertTriangle size={13} style={{ color }} />
                              )}
                            </div>
                          );
                        })
                        : <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No bottlenecks detected.</p>
                      }
                    </div>
                  </div>

                  {/* Predictive analytics mini card */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Sparkles size={15} style={{ color: 'var(--accent-cool)' }} />
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Predictive Analytics</span>
                      <InfoTooltip id="predictive" text="AI-powered sprint forecast derived from historical velocity patterns. Completion confidence = probability the current sprint will deliver its committed story points on time." width={270} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Completion</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-cool)' }}>
                          {enhancedMetrics?.predictiveAnalytics?.completionConfidence ?? '—'}%
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>confidence</div>
                      </div>
                      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Forecast Vel.</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {enhancedMetrics?.predictiveAnalytics?.forecastedVelocity ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>story pts</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, textTransform: 'capitalize',
                        color: enhancedMetrics?.predictiveAnalytics?.velocityTrend === 'increasing' ? 'var(--green)' : enhancedMetrics?.predictiveAnalytics?.velocityTrend === 'decreasing' ? 'var(--red)' : 'var(--amber)',
                        background: enhancedMetrics?.predictiveAnalytics?.velocityTrend === 'increasing' ? 'var(--green)18' : enhancedMetrics?.predictiveAnalytics?.velocityTrend === 'decreasing' ? 'var(--red)18' : 'var(--amber)18',
                      }}>
                        {enhancedMetrics?.predictiveAnalytics?.velocityTrend ?? 'stable'} trend
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, textTransform: 'capitalize',
                        color: enhancedMetrics?.predictiveAnalytics?.riskLevel === 'high' ? 'var(--red)' : enhancedMetrics?.predictiveAnalytics?.riskLevel === 'medium' ? 'var(--amber)' : 'var(--green)',
                        background: enhancedMetrics?.predictiveAnalytics?.riskLevel === 'high' ? 'var(--red)18' : enhancedMetrics?.predictiveAnalytics?.riskLevel === 'medium' ? 'var(--amber)18' : 'var(--green)18',
                      }}>
                        {enhancedMetrics?.predictiveAnalytics?.riskLevel ?? 'low'} risk
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── HISTORICAL COMPARISON ─────────────────────────────────── */}
              {enhancedMetrics?.historicalComparison?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Calendar size={15} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Month-over-Month Comparison</span>
                    <InfoTooltip id="historical" text="Side-by-side comparison across periods — Total Issues (scope), Completion Rate (delivery %), and Velocity (story points done). An upward velocity trend over consecutive months signals a maturing, high-performing team." width={300} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${enhancedMetrics.historicalComparison.length}, 1fr)`, gap: 16 }}>
                    {enhancedMetrics.historicalComparison.map((c, i) => (
                      <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>{c.period}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-cool)', letterSpacing: '-0.03em' }}>{c.totalIssues}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Total Issues</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.03em' }}>{c.completionRate}%</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Completion</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          {c.velocity > (enhancedMetrics.historicalComparison[0]?.velocity || 0) && i > 0
                            ? <TrendingUp size={13} style={{ color: 'var(--green)' }} />
                            : i === 0
                            ? <Activity size={13} style={{ color: 'var(--text-muted)' }} />
                            : <TrendingDown size={13} style={{ color: 'var(--red)' }} />
                          }
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Velocity: <strong style={{ color: 'var(--text-primary)' }}>{c.velocity}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── BLOCKERS & FLAGGED ────────────────────────────────────── */}
              {blockers !== null && ((blockers.blocked.length > 0) || (blockers.flagged.length > 0)) && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--red)40', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--red)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Blockers & Flagged Issues</span>
                    <span style={{ fontSize: 11, background: 'var(--red)18', color: 'var(--red)', borderRadius: 6, padding: '2px 9px', fontWeight: 700, marginLeft: 4 }}>
                      {blockers.blocked.length + blockers.flagged.length} items
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: blockers.blocked.length > 0 && blockers.flagged.length > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>
                    {blockers.blocked.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 10 }}>
                          Blocked ({blockers.blocked.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {blockers.blocked.slice(0, 6).map(issue => (
                            <div key={issue.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--red)08', border: '1px solid var(--red)20', borderRadius: 9 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.key}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.summary}</div>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{issue.assignee}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {blockers.flagged.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 10 }}>
                          Flagged / High Priority ({blockers.flagged.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {blockers.flagged.slice(0, 6).map(issue => (
                            <div key={issue.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--amber)08', border: '1px solid var(--amber)20', borderRadius: 9 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.key}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.summary}</div>
                              </div>
                              <span style={{ fontSize: 10, padding: '2px 7px', background: 'var(--amber)20', color: 'var(--amber)', borderRadius: 5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{issue.priority}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {blockersLoading && !blockers && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 24px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                  <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  Loading blockers…
                </div>
              )}

              {/* ── DUE DATE RISK ─────────────────────────────────────────── */}
              {enhancedMetrics?.dueDateRisk && enhancedMetrics.dueDateRisk.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--amber)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock size={15} style={{ color: 'var(--amber)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Due Date Risk</span>
                    <InfoTooltip id="due-date-risk" text="Issues approaching their due date or already overdue. 'Overdue' items need immediate attention; 'Due Soon' items should be reviewed in the next standup to prevent slippage." width={270} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {enhancedMetrics.dueDateRisk.map(item => {
                      const isOverdue = item.isOverdue;
                      const color = isOverdue ? 'var(--red)' : 'var(--amber)';
                      return (
                        <div
                          key={item.key}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `${isOverdue ? 'var(--red)' : 'var(--amber)'}08`, border: `1px solid ${isOverdue ? 'var(--red)' : 'var(--amber)'}25`, borderRadius: 10, borderLeft: `3px solid ${color}` }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color }}>{item.key}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.summary}</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {item.assignee} · {item.status}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color }}>{item.dueDate}</div>
                            <div style={{ fontSize: 10, padding: '2px 7px', background: `${color}18`, color, borderRadius: 5, fontWeight: 700, marginTop: 2 }}>
                              {isOverdue ? 'OVERDUE' : 'DUE SOON'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ISSUE AGE DISTRIBUTION ────────────────────────────────── */}
              {enhancedMetrics?.issueAgeDistribution && enhancedMetrics.issueAgeDistribution.some(a => a.count > 0) && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Layers size={15} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Open Issue Age Distribution</span>
                    <InfoTooltip id="issue-age" text="Breakdown of open issues by how long they've been open. Issues older than 30 days are considered stale — they often indicate forgotten work, unclear ownership, or dependency blockers." width={280} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(() => {
                      const maxAge = Math.max(...(enhancedMetrics.issueAgeDistribution?.map(a => a.count) || [1]));
                      const colors = ['var(--green)', 'var(--accent-cool)', 'var(--amber)', 'var(--red)'];
                      return enhancedMetrics.issueAgeDistribution?.map((item, i) => (
                        <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 56, flexShrink: 0, fontWeight: 500 }}>{item.range}</span>
                          <div style={{ flex: 1, height: 10, background: 'var(--bg-surface)', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${maxAge > 0 ? (item.count / maxAge) * 100 : 0}%`, background: colors[i] || 'var(--accent-cool)', borderRadius: 5, transition: 'width 0.8s ease' }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: colors[i] || 'var(--text-primary)', minWidth: 28, textAlign: 'right' }}>{item.count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)' }}>
                    Stale open issues (30d+): <strong style={{ color: 'var(--amber)' }}>{(enhancedMetrics.issueAgeDistribution?.find(a => a.range === '31-90d')?.count || 0) + (enhancedMetrics.issueAgeDistribution?.find(a => a.range === '90d+')?.count || 0)}</strong>
                  </div>
                </div>
              )}

              {/* ── BEST PERFORMERS ───────────────────────────────────────── */}
              {performers.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--amber)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Trophy size={15} style={{ color: 'var(--amber)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Best Performers</span>
                    <InfoTooltip id="performers" text="Team members ranked by performance score — a composite of issues resolved, story points delivered, and bugs fixed within the selected period. Recognition data helps leadership identify top contributors." width={290} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {performers.slice(0, 6).map((p, i) => {
                      const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)';
                      const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank}`;
                      return (
                        <div key={p.name} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '14px 16px', border: i < 3 ? `1px solid ${rankColor}40` : '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: i < 3 ? `${rankColor}20` : 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i < 3 ? 16 : 13, fontWeight: 700, color: i < 3 ? rankColor : 'var(--accent-cool)', flexShrink: 0 }}>
                              {i < 3 ? rankIcon : p.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: i < 3 ? rankColor : 'var(--text-muted)', fontWeight: 600 }}>Rank #{p.rank}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                            <div style={{ background: 'var(--bg-card)', borderRadius: 7, padding: '6px 8px' }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)' }}>{p.issuesResolved}</div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolved</div>
                            </div>
                            <div style={{ background: 'var(--bg-card)', borderRadius: 7, padding: '6px 8px' }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-cool)' }}>{p.storyPoints}</div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Story Pts</div>
                            </div>
                          </div>
                          {p.achievements.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {p.achievements.slice(0, 2).map(a => (
                                <span key={a} style={{ fontSize: 9, padding: '2px 6px', background: 'var(--amber)15', color: 'var(--amber)', borderRadius: 4, fontWeight: 600 }}>{a}</span>
                              ))}
                            </div>
                          )}
                          {/* Score bar */}
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{p.performanceScore}</span>
                            </div>
                            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, p.performanceScore)}%`, background: i < 3 ? rankColor : 'var(--accent-cool)', borderRadius: 2, transition: 'width 0.8s ease' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {performersLoading && performers.length === 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                      <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      Loading performers…
                    </div>
                  )}
                </div>
              )}

              {/* ── AI RECOMMENDATIONS ────────────────────────────────────── */}
              {enhancedMetrics?.predictiveAnalytics?.recommendations?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Brain size={15} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>AI Recommendations</span>
                    <InfoTooltip id="ai-recs" text="Actionable recommendations generated from your team's velocity, bottleneck, and completion data. These are starting points for retrospective conversations — not prescriptions." width={280} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {enhancedMetrics.predictiveAnalytics.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)' }}
                      >
                        <Lightbulb size={14} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── RECENT ACTIVITY ───────────────────────────────────────── */}
              {recentActivities.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Activity size={15} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Recent Activity</span>
                    <InfoTooltip id="recent-activity" text="Latest Jira actions from your team — issue updates, status transitions, comments, and assignments. Reflects activity across the connected project(s) in near real-time." width={270} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {recentActivities.slice(0, 8).map((activity, i) => (
                      <div
                        key={activity.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < Math.min(7, recentActivities.length - 1) ? '1px solid var(--border)30' : 'none' }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Zap size={13} style={{ color: 'var(--accent-cool)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {activity.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            {activity.user} · {activity.project}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {activity.timestamp}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── FOOTER EXPORT ROW ─────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Export as:</span>
                <Select value={exportFormat} onValueChange={v => setExportFormat(v as typeof exportFormat)}>
                  <SelectTrigger style={{ width: 110, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12, color: 'var(--text-primary)', height: 34 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={handleEnhancedExport}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <Download size={13} />
                  Download
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                  Last updated {lastRefresh.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CSS keyframes for spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </DashboardLayout>
  );
}
