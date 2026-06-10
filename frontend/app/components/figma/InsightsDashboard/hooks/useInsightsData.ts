'use client'

import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../../../../../lib/api-config';

export interface Project {
  id: string;
  key: string;
  name: string;
}

export interface JiraMetrics {
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

export interface RecentActivity {
  id: string;
  type: string;
  title: string;
  user: string;
  timestamp: string;
  project: string;
}

export function useInsightsData(
  selectedProject: string,
  dateFrom: string,
  dateTo: string
) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [jiraMetrics, setJiraMetrics] = useState<JiraMetrics | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasLoadedCacheRef = useRef(false);
  const initialFetchRef = useRef(false);

  const loadCachedData = (initialize: boolean = false) => {
    try {
      const cachedProjects = localStorage.getItem('jira-projects');
      const cachedActivities = localStorage.getItem('recent-activities');
      const cachedLastRefresh = localStorage.getItem('last-refresh');
      const cachedRange = localStorage.getItem('metrics-date-range');
      const cachedMetrics = localStorage.getItem('jira-metrics');

      if (cachedProjects) setProjects(JSON.parse(cachedProjects));
      if (cachedActivities) setRecentActivities(JSON.parse(cachedActivities));
      if (cachedLastRefresh) setLastRefresh(new Date(cachedLastRefresh));
      
      if (cachedMetrics) {
        try {
          const parsedMetrics = JSON.parse(cachedMetrics);
          setJiraMetrics(parsedMetrics);
          console.log('✅ Loaded cached metrics:', parsedMetrics);
        } catch (error) {
          console.error('Error parsing cached metrics:', error);
        }
      }

      if (cachedRange && initialize) {
        try {
          const parsedRange = JSON.parse(cachedRange);
          // Return the cached range for parent component to use
          return parsedRange;
        } catch (error) {
          console.error('Error parsing cached range:', error);
        }
      }
      
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

  const cacheData = (projects: Project[], metrics: JiraMetrics, activities: RecentActivity[]) => {
    try {
      localStorage.setItem('jira-projects', JSON.stringify(projects));
      localStorage.setItem('recent-activities', JSON.stringify(activities));
      localStorage.setItem('last-refresh', new Date().toISOString());
      if (metrics) {
        localStorage.setItem('jira-metrics', JSON.stringify(metrics));
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
      const response = await fetch(getApiUrl('/api/jira/projects?maxResults=1000'));
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
      
      const projectsList = data.projects?.detailed || [];

      console.log(`📋 Setting ${projectsList.length} projects in state`);
      setProjects(projectsList);
      return projectsList;
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      return [];
    }
  };

  const fetchMetrics = async (projectKey: string | null, from: string, to: string) => {
    try {
      const body: any = { dateFrom: from, dateTo: to };
      if (projectKey && projectKey !== 'ALL') {
        body.projectKey = projectKey;
      }

      console.log('📊 Fetching metrics with:', body);
      const response = await fetch(getApiUrl('/api/jira/metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.log('📊 Metrics response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Metrics API error:', errorText);
        throw new Error(`Failed to fetch metrics: ${response.status}`);
      }

      const data = await response.json();
      console.log('📊 Metrics API response:', {
        success: data.success,
        hasMetrics: !!data.metrics,
        totalIssues: data.metrics?.totalIssues
      });

      if (!data.success) {
        console.error('❌ Metrics API returned success=false');
        throw new Error(data.error || 'Failed to load metrics');
      }

      setJiraMetrics(data.metrics);
      return data.metrics;
    } catch (error) {
      console.error('❌ Error fetching metrics:', error);
      throw error;
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await fetch(getApiUrl('/api/jira/recent-activity'));
      if (!response.ok) throw new Error('Failed to fetch activities');
      const data = await response.json();
      if (data.success && data.activities) {
        setRecentActivities(data.activities);
        return data.activities;
      }
      return [];
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
      const [projectsData, metricsData, activitiesData] = await Promise.all([
        fetchProjects(),
        fetchMetrics(projectFilter, dateFrom, dateTo),
        fetchActivities()
      ]);

      console.log('✅ Data fetched successfully:', {
        projects: projectsData?.length || 0,
        metrics: metricsData ? 'loaded' : 'failed',
        activities: activitiesData?.length || 0
      });

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

  // Load cached data on mount and auto-fetch fresh data
  useEffect(() => {
    if (hasLoadedCacheRef.current) return;
    
    loadCachedData(true);
    hasLoadedCacheRef.current = true;
    
    setTimeout(() => {
      if (!initialFetchRef.current && dateFrom && dateTo) {
        initialFetchRef.current = true;
        fetchData();
      }
    }, 500);
  }, []);

  // Re-fetch data when filters change (after initial load)
  useEffect(() => {
    if (!hasLoadedCacheRef.current) return;
    if (!initialFetchRef.current) return;
    if (!dateFrom || !dateTo) return;
    
    fetchData();
  }, [selectedProject, dateFrom, dateTo]);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, []);

  return {
    projects,
    jiraMetrics,
    recentActivities,
    loading,
    error,
    lastRefresh,
    isRefreshing,
    fetchData,
    refreshData,
    loadCachedData
  };
}

