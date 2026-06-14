'use client'

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, TrendingUp, Users, Clock, AlertTriangle, CheckCircle, BarChart3, PieChart, Activity, Zap, Sparkles, Trophy, Download, FileText, Info, X, TrendingDown, ChevronDown, Calendar, Layers, Search, Flame, Loader2, SlidersHorizontal, ExternalLink } from 'lucide-react';
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart } from 'recharts';
import { exportInsightsAsPDF } from '../../utils/exportUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { getApiUrl } from '../../../lib/api-config';
import { DashboardLayout } from '../DashboardLayout';
import { JiraLoader } from './InsightsDashboard/components/JiraLoader';

interface Project {
  id: string;
  key: string;
  name: string;
  categoryName?: string;
}

interface AdvancedFilters {
  priority: string[];
  issueType: string[];
  statusCategory: string[];
  assignee: string;
  label: string;
}
const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = { priority: [], issueType: [], statusCategory: [], assignee: '', label: '' };

interface QeMetrics {
  testTotal: number;
  lifecycle: Record<string, number>;
  automation: Record<string, number>;
  testType: Record<string, number>;
  defects: { total: number; open: number };
  automated: number;
  requiresAutomation: number;
  automationCoverage: number;
  accepted: number;
  acceptanceRate: number;
  abandoned: number;
  defectDensity: number;
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
  issuesByType?: Record<string, number>;
  qeMetrics?: QeMetrics | null;
  totalIssuesAll?: number;
  jiraTotal?: number;
  fetchedCount?: number;
  truncated?: boolean;
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


// ─── Searchable project combobox ──────────────────────────────────────────
function SearchableProjectSelect({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  const selected = value === 'ALL' ? null : projects.find(p => p.key === value);
  const filtered = query
    ? projects.filter(p => {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) ||
               p.key.toLowerCase().includes(q) ||
               (p.categoryName || '').toLowerCase().includes(q);
      })
    : projects;

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '0 12px', height: 36, width: '100%',
          cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
          {selected ? selected.name : 'All Projects'}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 40, left: 0, right: 0, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
          maxHeight: 320,
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', borderRadius: 8, padding: '6px 10px' }}>
              <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search projects…"
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', width: '100%' }}
              />
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 260 }}>
            <button
              type="button"
              onClick={() => { onChange('ALL'); setOpen(false); setQuery(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
                background: value === 'ALL' ? 'var(--accent-cool)12' : 'none',
                border: 'none', cursor: 'pointer', fontSize: 13,
                color: value === 'ALL' ? 'var(--accent-cool)' : 'var(--text-primary)',
                fontWeight: value === 'ALL' ? 600 : 400,
              }}
            >
              All Projects
            </button>
            {filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.key); setOpen(false); setQuery(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
                  background: value === p.key ? 'var(--accent-cool)12' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  color: value === p.key ? 'var(--accent-cool)' : 'var(--text-primary)',
                  fontWeight: value === p.key ? 600 : 400,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-muted)', marginRight: 8 }}>{p.key}</span>
                {p.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No projects match &ldquo;{query}&rdquo;</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Explainability info tooltip ──────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4 }}>
      <Info
        size={13}
        style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 9,
          padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
          width: 220, boxShadow: '0 4px 18px rgba(0,0,0,0.15)', zIndex: 200, whiteSpace: 'normal',
          pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Bottleneck severity: derived from actual data, not stored field ───────
function calcBottleneckSeverity(b: BottleneckAnalysis): 'low' | 'medium' | 'high' {
  if (b.avgTimeInStatus >= 30 || b.issuesStuck >= 20) return 'high';
  if (b.avgTimeInStatus >= 7  || b.issuesStuck >= 5)  return 'medium';
  return 'low';
}

const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const ISSUE_TYPE_OPTIONS = ['Bug', 'Story', 'Task', 'Epic', 'Sub-task', 'Improvement', 'New Feature'];
const STATUS_CATEGORY_OPTIONS = ['To Do', 'In Progress', 'Done'];

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
  const [usingMockEnhancedMetrics, setUsingMockEnhancedMetrics] = useState(false);
  const [firstActionDate, setFirstActionDate] = useState<string | null>(null);
  const [firstActionLoading, setFirstActionLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(DEFAULT_ADVANCED_FILTERS);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string | null>(null);

  // Blockers, performers
  const [blockers, setBlockers] = useState<{ blocked: BlockerIssue[]; flagged: BlockerIssue[] } | null>(null);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const [performersLoading, setPerformersLoading] = useState(false);

  const [selectedChartView, setSelectedChartView] = useState<'velocity' | 'burndown' | 'capacity' | 'historical'>('velocity');

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
  // Scope (project|from|to|filters) we last loaded/fetched for — lets the
  // filter-change effect tell a real user change apart from the mount-time
  // cache scope restore settling into state.
  const lastScopeRef = React.useRef<string | null>(null);
  // Monotonic fetch token — a slower, superseded response (e.g. an all-projects
  // fetch that resolves after a newer single-project one) must never overwrite
  // the latest scope's metrics.
  const fetchSeqRef = React.useRef(0);

  // Only load cached data on mount - DO NOT auto-fetch
  // User must click "Get Insights" button to fetch fresh data
  useEffect(() => {
    if (hasLoadedCacheRef.current) return;

    // Load cached data immediately if available, restoring the cached filter
    // scope so the dropdown, date range, and displayed metrics stay coherent.
    loadCachedData(true);
    hasLoadedCacheRef.current = true;

    // Fetch Jira base URL for drilldown links
    fetch(getApiUrl('/api/jira/status'))
      .then(r => r.json())
      .then(d => { if (d.config?.url) setJiraBaseUrl(d.config.url); })
      .catch(() => {});

    console.log('📊 Insights page loaded - NO AUTO FETCH - waiting for user to click Get Insights');
  }, []);

  // Re-fetch whenever the user changes a filter (project / date / advanced).
  // We skip only the very first run after mount, so the deliberate
  // "no auto-fetch on load — show cached data" behavior still holds; any later
  // change is an explicit user action and must reload data for the new scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const advancedFiltersKey = JSON.stringify(advancedFilters);
  const filtersInitializedRef = React.useRef(false);
  useEffect(() => {
    if (!hasLoadedCacheRef.current) return;
    const currentScope = `${selectedProject}|${dateFrom}|${dateTo}|${advancedFiltersKey}`;

    // First run after mount: establish the baseline scope and never fetch, so the
    // deliberate "no auto-fetch on load" behavior holds.
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      if (lastScopeRef.current === null) lastScopeRef.current = currentScope;
      return;
    }

    // Scope unchanged from what we last reconciled — e.g. the mount-time cache
    // scope restore settling into state. Not a user action, so do nothing.
    if (currentScope === lastScopeRef.current) return;

    if (!dateFrom || !dateTo) return;

    // A genuine user filter change. Drop the now-stale metrics first so a
    // mismatched scope (e.g. an all-projects total) can never render under the
    // new selection, then refetch for the new scope.
    console.log('🔄 Filters changed - reloading data for the new scope...');
    lastScopeRef.current = currentScope;
    setJiraMetrics(null);
    initialFetchRef.current = true;
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, dateFrom, dateTo, advancedFiltersKey]);

  // Fetch earliest Jira issue date for the selected project (for "Since 1st action" preset)
  useEffect(() => {
    const projectParam = selectedProject && selectedProject !== 'ALL'
      ? `?project=${encodeURIComponent(selectedProject)}`
      : '';
    setFirstActionDate(null);
    setFirstActionLoading(true);
    fetch(getApiUrl(`/api/jira/first-action-date${projectParam}`))
      .then(r => r.json())
      .then(data => setFirstActionDate(data.first_action_date || null))
      .catch(() => setFirstActionDate(null))
      .finally(() => setFirstActionLoading(false));
  }, [selectedProject]);

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

      // Restore the cached filter scope (project + date range) FIRST so the
      // dropdown / date pickers stay coherent with the metrics we display below.
      let scopeProject = selectedProject;
      let scopeFrom = dateFrom;
      let scopeTo = dateTo;
      if (cachedRange) {
        try {
          const parsedRange = JSON.parse(cachedRange);
          if (initialize) {
            if (parsedRange?.dateFrom) { setDateFrom(parsedRange.dateFrom); scopeFrom = parsedRange.dateFrom; }
            if (parsedRange?.dateTo) { setDateTo(parsedRange.dateTo); scopeTo = parsedRange.dateTo; }
            if (parsedRange?.projectKey) { setSelectedProject(parsedRange.projectKey); scopeProject = parsedRange.projectKey; }
          }
        } catch (error) {
          console.error('Error parsing cached range:', error);
        }
      }

      // Baseline the scope ref to whatever we just restored so the filter-change
      // effect treats the restore re-render as already-reconciled (no auto-fetch).
      if (initialize) {
        lastScopeRef.current = `${scopeProject}|${scopeFrom}|${scopeTo}|${JSON.stringify(advancedFilters)}`;
      }

      // Show cached metrics immediately — but ONLY when their scope matches the
      // (just-restored) selection. Otherwise a previously-cached all-projects blob
      // would render under a single-project selection (and vice-versa), showing
      // the wrong totals — exactly the "5100 issues for one project" bug.
      let scopeMatches = false;
      if (cachedMetrics) {
        try {
          const parsedMetrics = JSON.parse(cachedMetrics);
          const cachedProject = parsedMetrics?.filters?.projectKey ?? null;
          const effectiveProject = scopeProject === 'ALL' || !scopeProject ? null : scopeProject;
          const cachedFrom = parsedMetrics?.filters?.dateFrom ?? null;
          const cachedTo = parsedMetrics?.filters?.dateTo ?? null;
          scopeMatches = cachedProject === effectiveProject &&
            (!cachedFrom || cachedFrom === scopeFrom) &&
            (!cachedTo || cachedTo === scopeTo);
          if (scopeMatches) {
            setJiraMetrics(parsedMetrics);
            console.log('✅ Loaded cached metrics (scope matches current selection):', parsedMetrics);
          } else {
            console.log('ℹ️ Cached metrics scope differs from current selection — skipping stale display');
          }
        } catch (error) {
          console.error('Error parsing cached metrics:', error);
        }
      }

      // Load cached enhanced metrics only when the headline metrics matched scope
      if (scopeMatches && cachedEnhancedMetrics) {
        try {
          const parsedEnhancedMetrics = JSON.parse(cachedEnhancedMetrics);
          setEnhancedMetrics(parsedEnhancedMetrics);
          console.log('✅ Loaded cached enhanced metrics:', parsedEnhancedMetrics);
        } catch (error) {
          console.error('Error parsing cached enhanced metrics:', error);
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

  const fetchMetrics = async (projectKey: string | null, fromDate: string, toDate: string, af: AdvancedFilters = advancedFilters) => {
    try {
      console.log('📊 Fetching metrics for project:', projectKey);
      console.log('📊 Metrics URL:', getApiUrl('/api/jira/metrics'));
      const response = await fetch(getApiUrl('/api/jira/metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey, dateFrom: fromDate, dateTo: toDate, advancedFilters: af })
      });
      console.log('📊 Metrics response status:', response.status);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      console.log('📊 Metrics data:', data);
      if (data.success) {
        // NOTE: state is applied by the caller (fetchData) under a sequence
        // guard so a superseded response can't overwrite newer metrics.
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

  const fetchBlockers = async (projectKey: string | null) => {
    setBlockersLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/jira/blockers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey }),
      });
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

  const fetchPerformers = async (projectKey: string | null, fromDate: string, toDate: string) => {
    setPerformersLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/jira/best-performers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey, dateFrom: fromDate, dateTo: toDate }),
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

  const fetchEnhancedMetrics = async (projectKey: string | null, fromDate: string, toDate: string, af: AdvancedFilters = advancedFilters): Promise<{ data: EnhancedJiraMetrics; isMock: boolean }> => {
    try {
      const response = await fetch(getApiUrl('/api/jira/enhanced-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey, dateFrom: fromDate, dateTo: toDate, advancedFilters: af })
      });

      if (!response.ok) {
        return { data: createMockEnhancedMetrics(jiraMetrics), isMock: true };
      }

      const data = await response.json();
      if (data.success) {
        return { data: data.metrics, isMock: false };
      }

      return { data: createMockEnhancedMetrics(jiraMetrics), isMock: true };
    } catch {
      return { data: createMockEnhancedMetrics(jiraMetrics), isMock: true };
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

    // Reconcile the scope this fetch covers (so the filter-change effect won't
    // redundantly refetch the same scope) and tag this fetch so a superseded,
    // slower response can't overwrite newer metrics.
    lastScopeRef.current = `${selectedProject}|${dateFrom}|${dateTo}|${JSON.stringify(advancedFilters)}`;
    const seq = ++fetchSeqRef.current;

    try {
      const [projectsData, metricsData, activitiesData, enhancedResult] = await Promise.all([
        fetchProjects(),
        fetchMetrics(projectFilter, dateFrom, dateTo),
        fetchActivities(),
        fetchEnhancedMetrics(projectFilter, dateFrom, dateTo)
      ]);

      // A newer fetch started while this one was in flight — drop these results
      // so the wrong scope's numbers never land.
      if (seq !== fetchSeqRef.current) {
        console.log('↩️ Discarding superseded metrics fetch');
        return;
      }

      setJiraMetrics(metricsData);

      // Fire blockers + performers in parallel (non-blocking — don't await)
      fetchBlockers(projectFilter);
      fetchPerformers(projectFilter, dateFrom, dateTo);

      const normalizedEnhanced = enhancedResult.data ?? createMockEnhancedMetrics(metricsData);
      setEnhancedMetrics(normalizedEnhanced);
      setUsingMockEnhancedMetrics(enhancedResult.isMock ?? false);
      cacheData(projectsData, metricsData, activitiesData, normalizedEnhanced);
      setLastRefresh(new Date());
    } catch (error) {
      if (seq !== fetchSeqRef.current) return; // superseded — ignore its error too
      console.error('❌ Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
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
    return Object.entries(jiraMetrics.issuesByStatus)
      .sort(([,a], [,b]) => b - a);
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
  const displayTotal = jiraMetrics ? (jiraMetrics.jiraTotal ?? jiraMetrics.totalIssues) : null;
  // ─── Phase 8: Jira drilldown helpers ─────────────────────────────────────
  const buildBaseJql = (): string => {
    const parts: string[] = [];
    if (selectedProject && selectedProject !== 'ALL') parts.push(`project = "${selectedProject}"`);
    if (dateFrom) parts.push(`updated >= "${dateFrom}"`);
    if (dateTo) parts.push(`updated <= "${dateTo} 23:59"`);
    if (advancedFilters.priority.length > 0) parts.push(`priority in (${advancedFilters.priority.map(p => `"${p}"`).join(', ')})`);
    if (advancedFilters.issueType.length > 0) parts.push(`issuetype in (${advancedFilters.issueType.map(t => `"${t}"`).join(', ')})`);
    if (advancedFilters.statusCategory.length > 0) parts.push(`statusCategory in (${advancedFilters.statusCategory.map(s => `"${s}"`).join(', ')})`);
    if (advancedFilters.assignee) parts.push(`assignee = "${advancedFilters.assignee}"`);
    if (advancedFilters.label) {
      const lbls = advancedFilters.label.split(',').map(l => l.trim()).filter(Boolean);
      if (lbls.length) parts.push(`labels in (${lbls.map(l => `"${l}"`).join(', ')})`);
    }
    return parts.join(' AND ') || 'project IS NOT EMPTY';
  };
  const buildJiraUrl = (extraJql?: string): string | null => {
    if (!jiraBaseUrl) return null;
    const base = buildBaseJql();
    const full = extraJql ? `${base} AND ${extraJql}` : base;
    return `${jiraBaseUrl}/issues/?jql=${encodeURIComponent(full)} ORDER BY updated DESC`;
  };
  const openInJira = (extraJql?: string) => {
    const url = buildJiraUrl(extraJql);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  const drillProps = (extraJql?: string) => jiraBaseUrl ? {
    onClick: () => openInJira(extraJql),
    style: { cursor: 'pointer' } as React.CSSProperties,
    title: 'Open matching issues in Jira ↗',
  } : {};
  // Age distribution drills omit the updated date range (stale open issues pre-date it)
  const buildProjectOnlyJql = (): string => {
    const parts: string[] = [];
    if (selectedProject && selectedProject !== 'ALL') parts.push(`project = "${selectedProject}"`);
    if (advancedFilters.priority.length > 0) parts.push(`priority in (${advancedFilters.priority.map(p => `"${p}"`).join(', ')})`);
    if (advancedFilters.issueType.length > 0) parts.push(`issuetype in (${advancedFilters.issueType.map(t => `"${t}"`).join(', ')})`);
    if (advancedFilters.assignee) parts.push(`assignee = "${advancedFilters.assignee}"`);
    if (advancedFilters.label) {
      const lbls = advancedFilters.label.split(',').map(l => l.trim()).filter(Boolean);
      if (lbls.length) parts.push(`labels in (${lbls.map(l => `"${l}"`).join(', ')})`);
    }
    return parts.join(' AND ') || 'project IS NOT EMPTY';
  };
  const openAgeInJira = (ageJql: string) => {
    if (!jiraBaseUrl) return;
    const base = buildProjectOnlyJql();
    const full = `${base} AND ${ageJql}`;
    window.open(`${jiraBaseUrl}/issues/?jql=${encodeURIComponent(full)} ORDER BY created ASC`, '_blank', 'noopener,noreferrer');
  };
  const AGE_BUCKET_JQL: Record<string, string> = {
    '0-7d':   'statusCategory != Done AND created >= "-7d"',
    '8-30d':  'statusCategory != Done AND created >= "-30d" AND created < "-7d"',
    '31-90d': 'statusCategory != Done AND created >= "-90d" AND created < "-30d"',
    '90d+':   'statusCategory != Done AND created < "-90d"',
  };
  // Converts "Jun 2026" → JQL updated range for that calendar month
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthPeriodJql = (label: string): string | null => {
    const [mon, yr] = label.split(' ');
    const mi = MONTH_ABBR.indexOf(mon);
    const y = parseInt(yr, 10);
    if (mi < 0 || isNaN(y)) return null;
    const mm = String(mi + 1).padStart(2, '0');
    const last = new Date(y, mi + 1, 0).getDate();
    return `updated >= "${y}-${mm}-01" AND updated <= "${y}-${mm}-${String(last).padStart(2, '0')} 23:59"`;
  };

  const activeDuration = firstActionDate ? (() => {
    const diffDays = Math.floor((Date.now() - new Date(firstActionDate).getTime()) / 86400000);
    if (diffDays < 30) return `${diffDays}d`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
    const y = Math.floor(diffDays / 365);
    const m = Math.floor((diffDays % 365) / 30);
    return m > 0 ? `${y}y ${m}mo` : `${y}y`;
  })() : null;

  const handleDateFromChange = (value: string) => {
    if (!value) return;
    setActivePreset(null);
    const newFrom = new Date(value);
    const currentTo = new Date(dateTo);
    if (dateTo && newFrom > currentTo) {
      setDateTo(value);
    }
    setDateFrom(value);
  };

  const handleDateToChange = (value: string) => {
    if (!value) return;
    setActivePreset(null);
    const newTo = new Date(value);
    const currentFrom = new Date(dateFrom);
    if (dateFrom && newTo < currentFrom) {
      setDateFrom(value);
    }
    setDateTo(value);
  };


  const handleExportPDF = async () => {
    try {
      await exportInsightsAsPDF('insights-dashboard', `insights-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  const handleExportCSV = () => {
    if (!jiraMetrics) return;
    const rows: string[][] = [
      ['Metric', 'Value'],
      ['Total Issues', String(jiraMetrics.totalIssues)],
      ['Resolved Issues', String(jiraMetrics.resolvedIssues)],
      ['Open Issues', String(jiraMetrics.openIssues)],
      ['Completion Rate', `${getCompletionRate()}%`],
      ['Bugs', String(jiraMetrics.bugs)],
      ['Stories', String(jiraMetrics.stories)],
      ['Tasks', String(jiraMetrics.tasks)],
      ['Epics', String(jiraMetrics.epics)],
      ['Story Points', String(jiraMetrics.storyPoints)],
      ['Sprint Velocity', String(jiraMetrics.sprintVelocity)],
      ['Avg Resolution Time (days)', String(jiraMetrics.avgResolutionTime)],
    ];
    if (enhancedMetrics?.sprintVelocityTrends?.length) {
      rows.push(['', '']);
      rows.push(['Sprint', 'Velocity', 'Committed', 'Completed']);
      enhancedMetrics.sprintVelocityTrends.forEach(s => {
        rows.push([s.sprintName, String(s.velocity), String(s.committedPoints), String(s.completedPoints)]);
      });
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jira-insights-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  // ─── Issue type breakdown ──────────────────────────────────────────────────
  // Use the full per-type distribution from the backend so the breakdown
  // reconciles with the total (a test-case project is mostly "Test"-type
  // issues, not just Bug/Story/Task/Epic). Falls back to the four legacy
  // buckets if the backend hasn't supplied issuesByType yet.
  const TYPE_COLORS: Record<string, string> = {
    bug: 'var(--red)', story: 'var(--accent-cool)', task: 'var(--green)', epic: 'var(--amber)',
  };
  const TYPE_PALETTE = ['var(--accent-cool)', 'var(--amber)', 'var(--green)', 'var(--red)', '#a78bfa', '#22d3ee', '#f472b6', '#94a3b8'];
  const rawTypeEntries: Array<{ label: string; value: number }> =
    jiraMetrics?.issuesByType && Object.keys(jiraMetrics.issuesByType).length > 0
      ? Object.entries(jiraMetrics.issuesByType).map(([label, value]) => ({ label, value: Number(value) || 0 }))
      : [
          { label: 'Bug',   value: jiraMetrics?.bugs || 0 },
          { label: 'Story', value: jiraMetrics?.stories || 0 },
          { label: 'Task',  value: jiraMetrics?.tasks || 0 },
          { label: 'Epic',  value: jiraMetrics?.epics || 0 },
        ];
  const issueTypeTotal = rawTypeEntries.reduce((s, t) => s + t.value, 0);
  const issueTypes: Array<{ label: string; value: number; color: string; pct: number; jqlType: string | null }> =
    rawTypeEntries
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((t, i) => ({
        label: t.label,
        value: t.value,
        color: TYPE_COLORS[t.label.toLowerCase()] ?? (t.label === 'Other' ? 'var(--text-muted)' : TYPE_PALETTE[i % TYPE_PALETTE.length]),
        pct: issueTypeTotal > 0 ? Math.round((t.value / issueTypeTotal) * 100) : 0,
        jqlType: t.label === 'Other' ? null : t.label,
      }));

  // ─── Quality Engineering metrics (test-case projects) ──────────────────────
  const qe = jiraMetrics?.qeMetrics ?? null;
  const qeCards = qe ? [
    { label: 'Test Cases', value: qe.testTotal.toLocaleString(), color: 'var(--accent-cool)', bar: 100,
      sub: 'in selected range', extraJql: 'issuetype = Test',
      tooltip: 'Total Jira issues of type Test matching the current project + date filter. The denominator for the QE rates below.' },
    { label: 'Automated', value: qe.automated.toLocaleString(), color: 'var(--green)', bar: qe.automationCoverage,
      sub: `${qe.automationCoverage}% automation coverage`, extraJql: 'issuetype = Test AND "Test Status" = "Automated"',
      tooltip: 'Test cases whose Test Status = Automated. Coverage = Automated ÷ automatable tests (excludes "Automation Not Required").' },
    { label: 'Requires Automation', value: qe.requiresAutomation.toLocaleString(), color: 'var(--amber)',
      bar: qe.testTotal > 0 ? Math.round((qe.requiresAutomation / qe.testTotal) * 100) : 0, sub: 'automation backlog',
      extraJql: 'issuetype = Test AND "Test Status" = "Requires Automation"',
      tooltip: 'Test cases flagged as needing automation but not yet automated — the QE automation backlog.' },
    { label: 'Accepted', value: qe.accepted.toLocaleString(), color: 'var(--green)', bar: qe.acceptanceRate,
      sub: `${qe.acceptanceRate}% of tests`, extraJql: 'issuetype = Test AND status = "Accepted"',
      tooltip: 'Test cases that reached the Accepted workflow status (reviewed/approved). Acceptance rate = Accepted ÷ total tests.' },
    { label: 'Open Defects', value: qe.defects.open.toLocaleString(), color: 'var(--red)',
      bar: qe.defects.total > 0 ? Math.round((qe.defects.open / qe.defects.total) * 100) : 0, sub: `of ${qe.defects.total} total`,
      extraJql: 'issuetype in (Bug, Defect) AND statusCategory != Done',
      tooltip: 'Bug/Defect issues not in a Done status category, within the current filter. The live quality risk.' },
    { label: 'Defect Density', value: qe.defectDensity, color: 'var(--text-primary)',
      bar: Math.min(100, qe.defectDensity * 10), sub: 'defects per 100 tests', extraJql: 'issuetype in (Bug, Defect)',
      tooltip: 'Defects ÷ test cases × 100. A low value can mean high quality OR low defect logging — read alongside Open Defects.' },
  ] : [];

  const QE_DIST_PALETTE = ['var(--green)', 'var(--accent-cool)', 'var(--amber)', '#a78bfa', '#22d3ee', '#f472b6', 'var(--red)', '#94a3b8'];
  const qeDistRows = (obj: Record<string, number>) => {
    const entries = Object.entries(obj).map(([label, value]) => ({ label, value: Number(value) || 0 }));
    const total = entries.reduce((s, e) => s + e.value, 0);
    return entries.sort((a, b) => b.value - a.value).map((e, i) => ({
      label: e.label,
      value: e.value,
      pct: total > 0 ? Math.round((e.value / total) * 100) : 0,
      color: e.label === 'Unspecified' ? 'var(--text-muted)' : QE_DIST_PALETTE[i % QE_DIST_PALETTE.length],
    }));
  };

  // Renders one QE distribution card (stacked bar + drillable list).
  const renderQeDist = (title: string, icon: React.ReactNode, tip: string, obj: Record<string, number>,
                        drillFor: (label: string) => string | null) => {
    const rows = qeDistRows(obj);
    return (
      <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
        {sectionTitle(title, icon, tip)}
        <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 18 }}>
          {rows.map(r => <div key={r.label} style={{ width: `${r.pct}%`, background: r.color, transition: 'width 0.6s ease' }} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => {
            const jql = drillFor(r.label);
            return (
              <div key={r.label} {...(jql ? drillProps(jql) : {})} style={{ display: 'flex', alignItems: 'center', gap: 10, ...(jiraBaseUrl && jql ? { cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px' } : {}) }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: r.color, fontVariantNumeric: 'tabular-nums' }}>{r.value.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>{r.pct}%</span>
                {jiraBaseUrl && jql && <ExternalLink size={9} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── 6 KPI summary stats ──────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total Issues',  value: jiraMetrics ? (jiraMetrics.jiraTotal ?? jiraMetrics.totalIssues) : '—', color: 'var(--accent-cool)', bar: jiraMetrics ? 80 : 0,
      tooltip: 'Count of all Jira issues matching the current project + date filter. Source: updated field. Bar shows a fixed 80% reference.',
      extraJql: '' },
    { label: 'Open Issues',   value: jiraMetrics?.openIssues ?? '—',     color: 'var(--amber)',        bar: jiraMetrics && jiraMetrics.totalIssues > 0 ? Math.round((jiraMetrics.openIssues / jiraMetrics.totalIssues) * 100) : 0,
      tooltip: 'Issues whose status category is not "Done". Bar = open ÷ total. High % means significant work still in flight.',
      extraJql: 'statusCategory != Done' },
    { label: 'Resolved',      value: jiraMetrics?.resolvedIssues ?? '—', color: 'var(--green)',        bar: getCompletionRate(),
      tooltip: 'Issues in a Done status category within the date range. Bar = resolved ÷ total (same as Completion Rate).',
      extraJql: 'statusCategory = Done' },
    { label: 'Bugs',          value: jiraMetrics?.bugs ?? '—',           color: 'var(--red)',          bar: jiraMetrics && jiraMetrics.totalIssues > 0 ? Math.round(((jiraMetrics.bugs || 0) / jiraMetrics.totalIssues) * 100) : 0,
      tooltip: 'Issues with issue type = Bug. Bar = bugs ÷ total. >30% is a risk signal — see Project Health score.',
      extraJql: 'issuetype = Bug' },
    { label: 'Stories',       value: jiraMetrics?.stories ?? '—',        color: 'var(--accent-cool)', bar: jiraMetrics && jiraMetrics.totalIssues > 0 ? Math.round(((jiraMetrics.stories || 0) / jiraMetrics.totalIssues) * 100) : 0,
      tooltip: 'Issues with issue type = Story. Bar = stories ÷ total. Stories represent user-facing feature work.',
      extraJql: 'issuetype = Story' },
    { label: 'Story Points',  value: jiraMetrics?.storyPoints ?? '—',    color: 'var(--text-primary)', bar: jiraMetrics && jiraMetrics.sprintVelocity > 0 ? Math.min(100, Math.round((jiraMetrics.storyPoints / (jiraMetrics.sprintVelocity * 6)) * 100)) : 0,
      tooltip: 'Sum of story point field values (custom field, auto-detected) across all issues in range. Bar = points ÷ (velocity × 6 sprints).',
      extraJql: 'issuetype in (Story, Epic)' },
  ];

  // ─── Phase 6: Composite Scores ───────────────────────────────────────────
  const completionRate6 = jiraMetrics ? getCompletionRate() : 0;
  const bugRatio6 = jiraMetrics && jiraMetrics.totalIssues > 0 ? (jiraMetrics.bugs || 0) / jiraMetrics.totalIssues : 0;
  const stale30dCount = (enhancedMetrics.issueAgeDistribution?.find(b => b.range === '31-90d')?.count || 0) +
                        (enhancedMetrics.issueAgeDistribution?.find(b => b.range === '90d+')?.count || 0);
  const staleRatio6 = jiraMetrics && jiraMetrics.totalIssues > 0 ? stale30dCount / jiraMetrics.totalIssues : 0;
  const blockedCount6 = (blockers?.blocked.length || 0) + (blockers?.flagged.length || 0);
  const blockedRatio6 = jiraMetrics && jiraMetrics.openIssues > 0 ? blockedCount6 / jiraMetrics.openIssues : 0;
  const projectHealthScore = jiraMetrics ? Math.min(100, Math.round(
    completionRate6 * 0.30 +
    Math.max(0, 100 - bugRatio6 * 300) * 0.20 +
    Math.max(0, 100 - staleRatio6 * 200) * 0.25 +
    Math.max(0, 100 - blockedRatio6 * 500) * 0.25
  )) : 0;

  const velocityTrend6 = enhancedMetrics.predictiveAnalytics?.velocityTrend || 'stable';
  const velocityScore6 = velocityTrend6 === 'increasing' ? 100 : velocityTrend6 === 'stable' ? 65 : 25;
  const aiConfidence6 = enhancedMetrics.predictiveAnalytics?.completionConfidence || 50;
  const deliveryConfidenceScore = jiraMetrics ? Math.min(100, Math.round(
    velocityScore6 * 0.40 + completionRate6 * 0.35 + aiConfidence6 * 0.25
  )) : 0;

  const utilizations6 = (enhancedMetrics.teamCapacity || []).map(m => m.utilizationPercentage || 0);
  const avgUtil6 = utilizations6.length > 0 ? utilizations6.reduce((a, b) => a + b, 0) / utilizations6.length : 75;
  const utilBalanceScore6 = avgUtil6 >= 70 && avgUtil6 <= 90 ? 100 : avgUtil6 < 70 ? (avgUtil6 * 100 / 70) : Math.max(0, 100 - (avgUtil6 - 90) * 3);
  const avgPerfScore6 = performers.length > 0 ? performers.reduce((sum, p) => sum + (p.performanceScore || 0), 0) / performers.length : 50;
  const teamPerformanceIndex = jiraMetrics ? Math.min(100, Math.round(avgPerfScore6 * 0.60 + utilBalanceScore6 * 0.40)) : 0;

  const variance6 = utilizations6.length > 1 ? utilizations6.reduce((sum, u) => sum + (u - avgUtil6) ** 2, 0) / utilizations6.length : 0;
  const workloadBalanceScore = utilizations6.length > 0 ? Math.round(Math.max(0, 100 - Math.sqrt(variance6) * 2)) : 100;

  const scoreColor = (s: number) => s >= 75 ? 'var(--green)' : s >= 50 ? 'var(--amber)' : 'var(--red)';
  const compositeScores = [
    { label: 'Project Health', score: projectHealthScore,
      desc: 'Completion rate · bug density · stale issues · blockers',
      tooltip: 'Formula: completion_rate×0.30 + (100−bug_ratio×300)×0.20 + (100−stale_ratio×200)×0.25 + (100−blocked_ratio×500)×0.25. ≥75 Good, 50–74 Fair, <50 Needs attention. Data: resolved %, bug count, 30d+ open issues, blocked/flagged count.' },
    { label: 'Delivery Confidence', score: deliveryConfidenceScore,
      desc: 'Velocity trend · completion rate · AI forecast confidence',
      tooltip: 'Formula: velocity_trend_score×0.40 + completion_rate×0.35 + ai_confidence×0.25. Velocity trend: increasing=100, stable=65, decreasing=25. Reflects your ability to sustain delivery momentum into the next period.' },
    { label: 'Team Performance', score: teamPerformanceIndex,
      desc: 'Performer scores · utilization balance',
      tooltip: 'Formula: avg_performer_score×0.60 + utilization_fit×0.40. Utilization fit: 70–90% = 100, below=scaled down, above=penalized. Performer score = composite of resolved, story pts, bugs fixed, tasks. Team health proxy — not an individual review tool.' },
    { label: 'Workload Balance', score: workloadBalanceScore,
      desc: 'Std deviation of assignee utilization %',
      tooltip: 'Formula: max(0, 100 − stddev(utilization%) × 2). Low std dev = even distribution = high score. Score <50 signals significant imbalance: some members overloaded, others underutilized. Source: Jira assignee + open issue count.' },
  ];

  // ─── Phase 6: Executive Summary ──────────────────────────────────────────
  const overdueCount6 = (enhancedMetrics.dueDateRisk || []).filter(r => r.isOverdue).length;
  const execWins: string[] = [];
  const execRisks: string[] = [];
  const execRecs: string[] = [];
  if (jiraMetrics) {
    if (completionRate6 >= 70) execWins.push(`${completionRate6}% completion rate`);
    if (velocityTrend6 === 'increasing') execWins.push('Sprint velocity trending up');
    if (projectHealthScore >= 75) execWins.push(`Project health: ${projectHealthScore}/100`);
    if (blockedCount6 === 0 && jiraMetrics.openIssues > 0) execWins.push('No blocked issues');
    if (bugRatio6 < 0.1 && jiraMetrics.bugs > 0) execWins.push(`Low bug density (${Math.round(bugRatio6 * 100)}%)`);
    if (execWins.length === 0 && completionRate6 > 0) execWins.push(`${completionRate6}% of issues resolved`);

    if (completionRate6 < 40) execRisks.push(`Low completion rate: ${completionRate6}%`);
    if (velocityTrend6 === 'decreasing') execRisks.push('Sprint velocity declining');
    if (blockedCount6 > 0) execRisks.push(`${blockedCount6} blocked/flagged issue${blockedCount6 > 1 ? 's' : ''}`);
    if (bugRatio6 > 0.3) execRisks.push(`High bug density: ${Math.round(bugRatio6 * 100)}% bugs`);
    if (stale30dCount > 5) execRisks.push(`${stale30dCount} stale issues (30+ days)`);
    if (overdueCount6 > 0) execRisks.push(`${overdueCount6} overdue item${overdueCount6 > 1 ? 's' : ''}`);

    if (blockedCount6 > 0) execRecs.push('Unblock issues to restore delivery flow');
    if (bugRatio6 > 0.2) execRecs.push('Schedule a bug-fixing sprint to reduce tech debt');
    if (stale30dCount > 10) execRecs.push('Triage and close stale tickets');
    if (avgUtil6 > 90) execRecs.push('Team may be over-capacity — redistribute work');
    if (completionRate6 < 50) execRecs.push('Review sprint scope and commitments');
    if (overdueCount6 > 0) execRecs.push('Address overdue items or revise due dates');
    if (execRecs.length === 0) execRecs.push('Maintain current delivery cadence');
  }

  // ─── Section title style ──────────────────────────────────────────────────
  const sectionTitle = (label: string, icon: React.ReactNode, tooltip?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{label}</span>
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  );

  // ─── Divider ──────────────────────────────────────────────────────────────
  const divider = <div style={{ height: 1, background: 'var(--border)', margin: '0 0 28px' }} />;

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
        <div className="ji-page">

          {/* ── HEADER ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <p style={{ color: 'var(--accent-cool)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Jira Integration
              </p>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', margin: '0 0 4px', lineHeight: 1.15 }}>
                Jira Insights
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Engineering leadership command center
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                onClick={handleExportCSV}
                disabled={!jiraMetrics}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                  opacity: !jiraMetrics ? 0.5 : 1,
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

          {/* ── MOCK DATA WARNING ────────────────────────────────────────── */}
          <AnimatePresence>
            {usingMockEnhancedMetrics && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: 'var(--amber)10', border: '1px solid var(--amber)40',
                  borderRadius: 12, padding: '12px 18px', marginBottom: 16,
                }}
              >
                <AlertTriangle size={15} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--amber)' }}>Showing sample data.</strong> The enhanced metrics API could not be reached — velocity trends, burndown, and predictive analytics reflect placeholder values, not live Jira data.
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── TRUNCATION WARNING ───────────────────────────────────────── */}
          <AnimatePresence>
            {jiraMetrics?.truncated && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: 'var(--amber)10', border: '1px solid var(--amber)40',
                  borderRadius: 12, padding: '12px 18px', marginBottom: 16,
                }}
              >
                <AlertTriangle size={15} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--amber)' }}>Results capped at 5,000 issues.</strong> This project has more issues than the retrieval limit. All metrics reflect only the most recently updated 5,000 issues — totals, percentages, and averages may be understated.
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── FILTER BAR ───────────────────────────────────────────────── */}
          <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px auto', gap: 16, alignItems: 'end' }}>
              {/* Project searchable combobox */}
              <div>
                <span style={labelStyle}>Project</span>
                <SearchableProjectSelect
                  projects={projects}
                  value={selectedProject}
                  onChange={setSelectedProject}
                />
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

            {/* Date presets */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Quick:</span>
              {[
                { label: 'Last 7d',    apply: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 7); setDateFrom(f.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]); } },
                { label: 'Last 30d',   apply: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 30); setDateFrom(f.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]); } },
                { label: 'Last 90d',   apply: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 90); setDateFrom(f.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]); } },
                { label: 'This Month', apply: () => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth(), 1); setDateFrom(f.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]); } },
                { label: 'Last Month', apply: () => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth() - 1, 1); const e = new Date(t.getFullYear(), t.getMonth(), 0); setDateFrom(f.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
                { label: 'This Year',  apply: () => { const t = new Date(); const f = new Date(t.getFullYear(), 0, 1); setDateFrom(f.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]); } },
              ].map(preset => {
                const isActive = activePreset === preset.label;
                return (
                  <button
                    key={preset.label}
                    onClick={() => { preset.apply(); setActivePreset(preset.label); }}
                    style={{
                      background: isActive ? 'var(--accent-cool)18' : 'var(--bg-surface)',
                      border: `1px solid ${isActive ? 'var(--accent-cool)' : 'var(--border)'}`,
                      borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                      color: isActive ? 'var(--accent-cool)' : 'var(--text-secondary)',
                      cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {firstActionDate && (
                <button
                  onClick={() => { setDateFrom(firstActionDate); setDateTo(new Date().toISOString().split('T')[0]); setActivePreset('since-first'); }}
                  style={{
                    background: activePreset === 'since-first' ? 'var(--accent-cool)18' : 'var(--accent-cool)0F',
                    border: `1px solid ${activePreset === 'since-first' ? 'var(--accent-cool)' : 'var(--accent-cool)55'}`,
                    borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                    color: 'var(--accent-cool)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  title={`Set date range from the earliest Jira issue: ${firstActionDate}`}
                >
                  <Flame size={11} /> Since 1st action ({firstActionDate})
                </button>
              )}
              {firstActionLoading && <Loader2 size={13} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
              <button
                onClick={() => setShowAdvancedFilters(v => !v)}
                style={{
                  marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: showAdvancedFilters ? 'var(--accent-cool)18' : 'var(--bg-surface)',
                  border: `1px solid ${showAdvancedFilters ? 'var(--accent-cool)' : 'var(--border)'}`,
                  borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  color: showAdvancedFilters ? 'var(--accent-cool)' : 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                <SlidersHorizontal size={11} />
                Filters
                {(advancedFilters.priority.length + advancedFilters.issueType.length + advancedFilters.statusCategory.length + (advancedFilters.assignee ? 1 : 0) + (advancedFilters.label ? 1 : 0)) > 0 && (
                  <span style={{ background: 'var(--accent-cool)', color: '#000', borderRadius: '50%', width: 14, height: 14, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {advancedFilters.priority.length + advancedFilters.issueType.length + advancedFilters.statusCategory.length + (advancedFilters.assignee ? 1 : 0) + (advancedFilters.label ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>

            {/* Advanced filters panel */}
            <AnimatePresence>
              {showAdvancedFilters && (
                <motion.div
                  key="adv-filters"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Priority */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 72, fontWeight: 600 }}>Priority</span>
                      {PRIORITY_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAdvancedFilters(f => ({ ...f, priority: f.priority.includes(opt) ? f.priority.filter(v => v !== opt) : [...f.priority, opt] }))}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 6, cursor: 'pointer',
                            background: advancedFilters.priority.includes(opt) ? 'var(--accent-cool)18' : 'var(--bg-surface)',
                            border: `1px solid ${advancedFilters.priority.includes(opt) ? 'var(--accent-cool)' : 'var(--border)'}`,
                            color: advancedFilters.priority.includes(opt) ? 'var(--accent-cool)' : 'var(--text-secondary)',
                          }}
                        >{opt}</button>
                      ))}
                    </div>
                    {/* Issue Type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 72, fontWeight: 600 }}>Issue Type</span>
                      {ISSUE_TYPE_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAdvancedFilters(f => ({ ...f, issueType: f.issueType.includes(opt) ? f.issueType.filter(v => v !== opt) : [...f.issueType, opt] }))}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 6, cursor: 'pointer',
                            background: advancedFilters.issueType.includes(opt) ? 'var(--accent-cool)18' : 'var(--bg-surface)',
                            border: `1px solid ${advancedFilters.issueType.includes(opt) ? 'var(--accent-cool)' : 'var(--border)'}`,
                            color: advancedFilters.issueType.includes(opt) ? 'var(--accent-cool)' : 'var(--text-secondary)',
                          }}
                        >{opt}</button>
                      ))}
                    </div>
                    {/* Status Category */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 72, fontWeight: 600 }}>Status</span>
                      {STATUS_CATEGORY_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAdvancedFilters(f => ({ ...f, statusCategory: f.statusCategory.includes(opt) ? f.statusCategory.filter(v => v !== opt) : [...f.statusCategory, opt] }))}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 6, cursor: 'pointer',
                            background: advancedFilters.statusCategory.includes(opt) ? 'var(--accent-cool)18' : 'var(--bg-surface)',
                            border: `1px solid ${advancedFilters.statusCategory.includes(opt) ? 'var(--accent-cool)' : 'var(--border)'}`,
                            color: advancedFilters.statusCategory.includes(opt) ? 'var(--accent-cool)' : 'var(--text-secondary)',
                          }}
                        >{opt}</button>
                      ))}
                    </div>
                    {/* Assignee + Label */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Assignee</span>
                        <input
                          value={advancedFilters.assignee}
                          onChange={e => setAdvancedFilters(f => ({ ...f, assignee: e.target.value }))}
                          placeholder="display name…"
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', width: 160 }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Labels</span>
                        <input
                          value={advancedFilters.label}
                          onChange={e => setAdvancedFilters(f => ({ ...f, label: e.target.value }))}
                          placeholder="comma-separated…"
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', width: 180 }}
                        />
                      </div>
                      {JSON.stringify(advancedFilters) !== JSON.stringify(DEFAULT_ADVANCED_FILTERS) && (
                        <button
                          onClick={() => setAdvancedFilters(DEFAULT_ADVANCED_FILTERS)}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--red)55', background: 'var(--red)0D', color: 'var(--red)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <X size={10} /> Clear all
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Active filter pills */}
            {jiraMetrics && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing:</span>
                <span style={{ fontSize: 11, background: 'var(--accent-cool)18', color: 'var(--accent-cool)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                  {dateRangeLabel}
                </span>
                {issuesInRange !== null && (
                  <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 6, padding: '2px 8px' }}>
                    {(jiraMetrics?.jiraTotal ?? issuesInRange).toLocaleString()} issues
                    {jiraMetrics?.truncated && <span style={{ color: 'var(--amber)', marginLeft: 4 }} title="Results were capped — metrics are based on the first 5,000 fetched issues">({issuesInRange.toLocaleString()} sampled)</span>}
                  </span>
                )}
                {firstActionDate && activeDuration && (
                  <>
                    <span style={{ fontSize: 11, background: 'var(--accent-cool)12', color: 'var(--accent-cool)', borderRadius: 6, padding: '2px 8px' }}
                      title={`Earliest Jira issue: ${firstActionDate}`}>
                      1st action {firstActionDate}
                    </span>
                    <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-muted)', borderRadius: 6, padding: '2px 8px' }}
                      title="Time since first Jira issue for this filter">
                      Active {activeDuration}
                    </span>
                  </>
                )}
                {advancedFilters.priority.length > 0 && (
                  <span style={{ fontSize: 11, background: 'var(--amber)12', color: 'var(--amber)', borderRadius: 6, padding: '2px 8px' }}>
                    Priority: {advancedFilters.priority.join(', ')}
                  </span>
                )}
                {advancedFilters.issueType.length > 0 && (
                  <span style={{ fontSize: 11, background: 'var(--green)12', color: 'var(--green)', borderRadius: 6, padding: '2px 8px' }}>
                    Type: {advancedFilters.issueType.join(', ')}
                  </span>
                )}
                {advancedFilters.statusCategory.length > 0 && (
                  <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 6, padding: '2px 8px' }}>
                    Status: {advancedFilters.statusCategory.join(', ')}
                  </span>
                )}
                {advancedFilters.assignee && (
                  <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 6, padding: '2px 8px' }}>
                    Assignee: {advancedFilters.assignee}
                  </span>
                )}
                {advancedFilters.label && (
                  <span style={{ fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: 6, padding: '2px 8px' }}>
                    Labels: {advancedFilters.label}
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
              {/* ── KPI SUMMARY ROW ──────────────────────────────────────── */}
              <div className="ji-kpi-grid">
                {kpiCards.map((kpi, i) => (
                  <div
                    key={kpi.label}
                    {...drillProps(kpi.extraJql || undefined)}
                    data-drill={jiraBaseUrl ? '1' : undefined}
                    className="ji-shadow"
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '16px 14px',
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>{kpi.label}{kpi.tooltip && <InfoTooltip text={kpi.tooltip} />}</span>
                      {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {kpi.value}
                    </div>
                    <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, kpi.bar)}%`, background: kpi.color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* ── QUALITY ENGINEERING ──────────────────────────────────── */}
              {qe && (
                <div style={{ marginBottom: 24 }}>
                  {sectionTitle('Quality Engineering', <CheckCircle size={15} style={{ color: 'var(--accent-cool)' }} />, 'Test-case quality metrics for this project, computed from live Jira counts (exact, not sampled) and scoped to the current project + date filter. Covers test volume, automation, acceptance, and defects.')}

                  {/* QE KPI cards */}
                  <div className="ji-kpi-grid">
                    {qeCards.map(c => (
                      <div
                        key={c.label}
                        {...drillProps(c.extraJql)}
                        data-drill={jiraBaseUrl ? '1' : undefined}
                        className="ji-shadow"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 14px' }}
                      >
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center' }}>{c.label}<InfoTooltip text={c.tooltip} /></span>
                          {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }} />}
                        </div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {c.value}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{c.sub}</div>
                        <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, c.bar)}%`, background: c.color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* QE distributions: automation, test type, lifecycle */}
                  <div className="ji-exec-grid" style={{ marginBottom: 0 }}>
                    {renderQeDist('Automation Status', <Zap size={15} style={{ color: 'var(--accent-cool)' }} />,
                      'Distribution of test cases across the Test Status field (Automated, Requires Automation, Automation Not Required, etc.). Counts sum to total test cases.',
                      qe.automation, (label) => label === 'Unspecified' ? null : `issuetype = Test AND "Test Status" = "${label}"`)}
                    {renderQeDist('Test Type', <Layers size={15} style={{ color: 'var(--accent-cool)' }} />,
                      'Distribution of test cases by Test Type (Functional, Regression, Integration, etc.). Counts sum to total test cases.',
                      qe.testType, (label) => label === 'Unspecified' ? null : `issuetype = Test AND "Test Type" = "${label}"`)}
                    {renderQeDist('Test Lifecycle', <Activity size={15} style={{ color: 'var(--accent-cool)' }} />,
                      'Test cases by workflow status — Accepted (reviewed/approved), Test (in progress), Abandoned (dropped). Counts sum to total test cases.',
                      qe.lifecycle, (label) => `issuetype = Test AND status = "${label}"`)}
                  </div>
                </div>
              )}

              {/* ── QUICK STATS ROW ──────────────────────────────────────── */}
              <div className="ji-stat-grid">
                {/* Completion rate */}
                <div {...drillProps('statusCategory = Done')} data-drill={jiraBaseUrl ? '1' : undefined} className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle size={20} style={{ color: 'var(--green)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>Completion Rate<InfoTooltip text="Resolved issues ÷ total issues in the selected date range. Measures what fraction of in-scope work has been closed." /></span>
                      {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{getCompletionRate()}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{jiraMetrics.resolvedIssues} of {jiraMetrics.jiraTotal ?? jiraMetrics.totalIssues} resolved</div>
                  </div>
                </div>

                {/* Sprint velocity */}
                <div {...drillProps('issuetype in (Story, Epic) AND statusCategory = Done')} data-drill={jiraBaseUrl ? '1' : undefined} className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-cool)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TrendingUp size={20} style={{ color: 'var(--accent-cool)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>Sprint Velocity<InfoTooltip text="Story points completed per sprint, averaged across sprints in the selected range. Higher is not always better — stability matters more than peak." /></span>
                      {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-cool)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{jiraMetrics.sprintVelocity || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>pts · {jiraMetrics.storyPoints || 0} total story pts</div>
                  </div>
                </div>

                {/* Avg resolution */}
                <div {...drillProps('statusCategory = Done')} data-drill={jiraBaseUrl ? '1' : undefined} className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--amber)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Clock size={20} style={{ color: 'var(--amber)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>Avg Resolution<InfoTooltip text="Mean calendar days from issue created → last updated (for resolved issues only). Formula: avg(updatedDate − createdDate) across all Done issues. Source: Jira created & updated fields. Outliers (very old issues) raise this number." /></span>
                      {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{jiraMetrics.avgResolutionTime || 0}d</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>days to close</div>
                  </div>
                </div>
              </div>

              {/* ── COMPOSITE SCORES ─────────────────────────────────────── */}
              <div className="ji-score-grid">
                {compositeScores.map(({ label, score, desc, tooltip }) => {
                  const r = 28; const circ = 2 * Math.PI * r;
                  const fill = circ * Math.min(1, score / 100);
                  const col = scoreColor(score);
                  return (
                    <div key={label} className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <svg width="68" height="68" style={{ flexShrink: 0 }}>
                        <circle cx="34" cy="34" r={r} stroke="var(--border)" strokeWidth="6" fill="none" />
                        <circle cx="34" cy="34" r={r} stroke={col} strokeWidth="6" fill="none"
                          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
                          transform="rotate(-90 34 34)" />
                        <text x="34" y="35" textAnchor="middle" dominantBaseline="middle"
                          style={{ fontSize: 16, fontWeight: 800, fill: 'var(--text-primary)' } as React.CSSProperties}>{score}</text>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3, display: 'flex', alignItems: 'center' }}>{label}<InfoTooltip text={tooltip} /></div>
                        <div style={{ fontSize: 10, color: col, fontWeight: 700, marginBottom: 4 }}>
                          {score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'Needs attention'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── EXECUTIVE SUMMARY ────────────────────────────────────── */}
              {(execWins.length > 0 || execRisks.length > 0) && (
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={14} style={{ color: 'var(--accent-cool)' }} />
                    </div>
                    Executive Summary
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>— derived from current filter · no AI</span>
                  </div>
                  <div className="ji-exec-grid">
                    {/* Key Wins */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Key Wins</div>
                      {execWins.length > 0 ? execWins.map((w, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <CheckCircle size={12} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{w}</span>
                        </div>
                      )) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No wins flagged yet</span>}
                    </div>
                    {/* Key Risks */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Key Risks</div>
                      {execRisks.length > 0 ? execRisks.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <AlertTriangle size={12} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{r}</span>
                        </div>
                      )) : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle size={12} style={{ color: 'var(--green)' }} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No critical risks detected</span>
                      </div>}
                    </div>
                    {/* Recommendations */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cool)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Recommendations</div>
                      {execRecs.map((rec, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <Activity size={12} style={{ color: 'var(--accent-cool)', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── CHARTS SECTION ───────────────────────────────────────── */}
              <div className="ji-chart-grid">
                {/* Main velocity / chart card */}
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    {sectionTitle(
                      selectedChartView === 'velocity' ? 'Sprint Velocity Trends'
                        : selectedChartView === 'burndown' ? 'Burndown Chart'
                        : selectedChartView === 'capacity' ? 'Team Capacity'
                        : 'Historical Trends',
                      <TrendingUp size={15} style={{ color: 'var(--accent-cool)' }} />,
                      selectedChartView === 'velocity'
                        ? 'Story points completed per sprint (blue bars). Orange line = committed points; green line = completed points. Source: Jira sprint data + story point field. Consistent gap between committed and completed indicates over-commitment.'
                        : selectedChartView === 'burndown'
                        ? 'Ideal vs actual remaining work across a sprint. Ideal line = linear burndown from total to zero. Actual line = real remaining. Below ideal = ahead; above ideal = at risk. Source: Jira sprint start/end + issue resolution timestamps.'
                        : selectedChartView === 'capacity'
                        ? 'Utilization % per team member. Formula: open_issues / (team_max_open × assumed_capacity). 70–90% optimal. Red = overloaded (>90%). Source: Jira assignee + open issue count within selected filters.'
                        : '6-month issue and velocity trends anchored to the selected date range end. Bar = total issues updated that month; line = story points resolved. Source: Jira updated + story point fields grouped by calendar month.'
                    )}
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
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                  {sectionTitle('Issue Breakdown', <PieChart size={15} style={{ color: 'var(--accent-cool)' }} />, 'Distribution across every Jira issue type as % of total. Source: Jira issuetype field. Counts sum to the total issues in range; for very large projects the smallest types are grouped as "Other".')}

                  {/* Horizontal stacked bar */}
                  <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 20 }}>
                    {issueTypes.map(t => (
                      <div key={t.label} style={{ width: `${t.pct}%`, background: t.color, transition: 'width 0.6s ease' }} />
                    ))}
                  </div>

                  {/* List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {issueTypes.map(t => (
                      <div key={t.label} {...(t.jqlType ? drillProps(`issuetype = "${t.jqlType}"`) : {})} style={{ display: 'flex', alignItems: 'center', gap: 10, ...(jiraBaseUrl && t.jqlType ? { cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px' } : {}) }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{t.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.color, fontVariantNumeric: 'tabular-nums' }}>{t.value.toLocaleString()}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>{t.pct}%</span>
                        {jiraBaseUrl && t.jqlType && <ExternalLink size={9} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

                  {/* Status distribution */}
                  {sectionTitle('Status', <Activity size={14} style={{ color: 'var(--accent-cool)' }} />, 'Count of all issues in each Jira workflow status. Source: Jira status field. Large "stuck" counts in non-Done statuses indicate process bottlenecks.')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {statusDistribution.length > 0 ? statusDistribution.map(([status, count]) => {
                      const pct = maxStatusCount > 0 ? Math.round((count / maxStatusCount) * 100) : 0;
                      const color = status === 'Done' ? 'var(--green)' : status === 'In Progress' ? 'var(--accent-cool)' : 'var(--amber)';
                      return (
                        <div key={status} {...drillProps(`status = "${status}"`)} style={jiraBaseUrl ? { cursor: 'pointer' } : {}}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{status}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
                              {jiraBaseUrl && <ExternalLink size={9} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                            </div>
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
              <div className="ji-chart-grid">
                {/* Team capacity */}
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                  {sectionTitle('Team Capacity', <Users size={15} style={{ color: 'var(--accent-cool)' }} />, 'Estimated utilization per assignee: utilization% = open_issues / (max_open_issues_in_team × assumed_capacity). Optimal: 70–90%. Overloaded (>90%) risks burnout; underutilized (<50%) may indicate blocked work or mis-assignment. Source: Jira assignee + open issue count.')}
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
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                        Issue Distribution
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {topAssignees.map(([assignee, count]) => (
                          <div key={assignee} {...drillProps(`assignee = "${assignee}"`)} style={{ display: 'flex', alignItems: 'center', gap: 10, ...(jiraBaseUrl ? { cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px' } : {}) }}>
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee}</span>
                            <div style={{ width: 80, height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${maxAssigneeCount > 0 ? (count / maxAssigneeCount) * 100 : 0}%`, background: 'var(--accent-cool)', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>{count}</span>
                            {jiraBaseUrl && <ExternalLink size={9} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Bottlenecks + Predictive */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Bottlenecks */}
                  <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', flex: 1 }}>
                    {sectionTitle('Process Bottlenecks', <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />, 'Workflow statuses where issues accumulate. Severity: High = avg time ≥30d or ≥20 issues stuck; Medium = ≥7d or ≥5 stuck; Low otherwise. Source: Jira status transitions. High-severity bottlenecks block delivery velocity.')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {enhancedMetrics?.bottleneckAnalysis?.length > 0
                        ? enhancedMetrics.bottleneckAnalysis.slice(0, 5).map((b, i) => {
                          const sev = calcBottleneckSeverity(b);
                          const color = sev === 'high' ? 'var(--red)' : sev === 'medium' ? 'var(--amber)' : 'var(--green)';
                          return (
                            <div
                              key={i}
                              {...drillProps(`status = "${b.status}"`)}
                              data-drill={jiraBaseUrl ? '1' : undefined}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px', borderRadius: 10,
                                background: `${color}0d`,
                                border: `1px solid ${color}30`,
                                borderLeft: `3px solid ${color}`,
                                ...(jiraBaseUrl ? { cursor: 'pointer' } : {}),
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
                                {sev}
                              </span>
                              {b.isBottleneck && (
                                <AlertTriangle size={13} style={{ color }} />
                              )}
                              {jiraBaseUrl && <ExternalLink size={11} style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }} />}
                            </div>
                          );
                        })
                        : <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No bottlenecks detected.</p>
                      }
                    </div>
                  </div>

                  {/* Predictive analytics mini card */}
                  <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
                    {sectionTitle('Predictive Analytics', <Sparkles size={15} style={{ color: 'var(--accent-cool)' }} />, 'Heuristic forecasts based on historical velocity and completion patterns — not AI. Completion confidence = resolved% weighted by trend direction. Forecasted velocity = recent sprint average ± trend adjustment. These are estimates: treat as directional, not commitments.')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center' }}>Completion<InfoTooltip text="Heuristic confidence that open issues will be resolved at current velocity. Formula: resolved% × velocity_trend_multiplier. Not a statistical model — treat as a directional signal." /></div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-cool)' }}>
                          {enhancedMetrics?.predictiveAnalytics?.completionConfidence ?? '—'}%
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>confidence</div>
                      </div>
                      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center' }}>Forecast Vel.<InfoTooltip text="Estimated story points for the next sprint. Formula: recent_sprint_avg ± trend_adjustment. Source: sprint velocity history. Useful for rough capacity planning — not a commitment." /></div>
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
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                  {sectionTitle('Month-over-Month Comparison', <Calendar size={15} style={{ color: 'var(--accent-cool)' }} />, 'Compares the two calendar months surrounding the selected date range end. Period labels are the actual month names (e.g. May 2026 / Jun 2026). Source: Jira updated field grouped by calendar month. Velocity = sum of story points resolved in that month.')}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${enhancedMetrics.historicalComparison.length}, 1fr)`, gap: 16 }}>
                    {enhancedMetrics.historicalComparison.map((c, i) => {
                      const periodJql = monthPeriodJql(c.period);
                      return (
                      <div
                        key={i}
                        onClick={() => { if (jiraBaseUrl && periodJql) openInJira(periodJql); }}
                        title={jiraBaseUrl && periodJql ? 'Open issues updated in this period in Jira ↗' : undefined}
                        style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '16px 18px', ...(jiraBaseUrl && periodJql ? { cursor: 'pointer' } : {}) }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{c.period}</span>
                          {jiraBaseUrl && periodJql && <ExternalLink size={9} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                        </div>
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
                          {i === 0
                            ? <Activity size={13} style={{ color: 'var(--text-muted)' }} />
                            : c.velocity > (enhancedMetrics.historicalComparison[i - 1]?.velocity || 0)
                            ? <TrendingUp size={13} style={{ color: 'var(--green)' }} />
                            : <TrendingDown size={13} style={{ color: 'var(--red)' }} />
                          }
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Velocity: <strong style={{ color: 'var(--text-primary)' }}>{c.velocity}</strong></span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── BLOCKERS & FLAGGED ────────────────────────────────────── */}
              {blockers !== null && ((blockers.blocked.length > 0) || (blockers.flagged.length > 0)) && (
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--red)40', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--red)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Blockers & Flagged Issues</span>
                    <InfoTooltip text="Blocked: issues in a 'Blocked' or 'Waiting' status. Flagged: issues with priority=Highest or label=flagged. Source: Jira status + priority + labels fields, scoped to the selected project. These directly impact team throughput — act on them first." />
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
                            <div
                              key={issue.key}
                              onClick={() => jiraBaseUrl && window.open(`${jiraBaseUrl}/browse/${issue.key}`, '_blank', 'noopener,noreferrer')}
                              title={jiraBaseUrl ? `Open ${issue.key} in Jira ↗` : undefined}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--red)08', border: '1px solid var(--red)20', borderRadius: 9, ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}
                            >
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.key}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.summary}</div>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{issue.assignee}</span>
                              {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--red)', opacity: 0.6, flexShrink: 0 }} />}
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
                            <div
                              key={issue.key}
                              onClick={() => jiraBaseUrl && window.open(`${jiraBaseUrl}/browse/${issue.key}`, '_blank', 'noopener,noreferrer')}
                              title={jiraBaseUrl ? `Open ${issue.key} in Jira ↗` : undefined}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--amber)08', border: '1px solid var(--amber)20', borderRadius: 9, ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}
                            >
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.key}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.summary}</div>
                              </div>
                              <span style={{ fontSize: 10, padding: '2px 7px', background: 'var(--amber)20', color: 'var(--amber)', borderRadius: 5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{issue.priority}</span>
                              {jiraBaseUrl && <ExternalLink size={10} style={{ color: 'var(--amber)', opacity: 0.6, flexShrink: 0 }} />}
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
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                  {sectionTitle('Due Date Risk', <Clock size={15} style={{ color: 'var(--amber)' }} />, 'Open issues with a due date in Jira that are either past due (OVERDUE) or due within 3 days (DUE SOON). Source: Jira duedate field. Only issues with a populated due date appear here — issues without due dates are excluded.')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {enhancedMetrics.dueDateRisk.map(item => {
                      const isOverdue = item.isOverdue;
                      const color = isOverdue ? 'var(--red)' : 'var(--amber)';
                      return (
                        <div
                          key={item.key}
                          onClick={() => jiraBaseUrl && window.open(`${jiraBaseUrl}/browse/${item.key}`, '_blank', 'noopener,noreferrer')}
                          title={jiraBaseUrl ? `Open ${item.key} in Jira ↗` : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `${isOverdue ? 'var(--red)' : 'var(--amber)'}08`, border: `1px solid ${isOverdue ? 'var(--red)' : 'var(--amber)'}25`, borderRadius: 10, borderLeft: `3px solid ${color}`, ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}
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
                          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color }}>{item.dueDate}</div>
                              <div style={{ fontSize: 10, padding: '2px 7px', background: `${color}18`, color, borderRadius: 5, fontWeight: 700, marginTop: 2 }}>
                                {isOverdue ? 'OVERDUE' : 'DUE SOON'}
                              </div>
                            </div>
                            {jiraBaseUrl && <ExternalLink size={10} style={{ color, opacity: 0.6 }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ISSUE AGE DISTRIBUTION ────────────────────────────────── */}
              {enhancedMetrics?.issueAgeDistribution && enhancedMetrics.issueAgeDistribution.some(a => a.count > 0) && (
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                  {sectionTitle('Open Issue Age Distribution', <Layers size={15} style={{ color: 'var(--accent-cool)' }} />, 'Age of currently open (non-Done) issues, measured from created date to today. Buckets: 0–7d (new), 8–30d (active), 31–90d (stale), 90d+ (very stale). Source: Jira created field. 30d+ count feeds the Project Health score stale-issues penalty.')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(() => {
                      const maxAge = Math.max(...(enhancedMetrics.issueAgeDistribution?.map(a => a.count) || [1]));
                      const colors = ['var(--green)', 'var(--accent-cool)', 'var(--amber)', 'var(--red)'];
                      return enhancedMetrics.issueAgeDistribution?.map((item, i) => (
                        <div
                          key={item.range}
                          onClick={() => jiraBaseUrl && AGE_BUCKET_JQL[item.range] && openAgeInJira(AGE_BUCKET_JQL[item.range])}
                          title={jiraBaseUrl ? 'Open matching issues in Jira ↗' : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, ...(jiraBaseUrl && AGE_BUCKET_JQL[item.range] ? { cursor: 'pointer' } : {}) }}
                        >
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 56, flexShrink: 0, fontWeight: 500 }}>{item.range}</span>
                          <div style={{ flex: 1, height: 10, background: 'var(--bg-surface)', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${maxAge > 0 ? (item.count / maxAge) * 100 : 0}%`, background: colors[i] || 'var(--accent-cool)', borderRadius: 5, transition: 'width 0.8s ease' }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: colors[i] || 'var(--text-primary)', minWidth: 28, textAlign: 'right' }}>{item.count}</span>
                          {jiraBaseUrl && AGE_BUCKET_JQL[item.range] && <ExternalLink size={9} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
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
                <div className="ji-shadow" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-cool)15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Trophy size={15} style={{ color: 'var(--amber)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Best Performers</span>
                    <InfoTooltip text="Ranked by a composite score: issues resolved (40%), story points (30%), bugs fixed (20%), tasks completed (10%). Data source: Jira resolution history in the selected range. Individual metrics are noisy proxies — use as a conversation starter, not a performance review input." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {performers.slice(0, 6).map((p, i) => {
                      const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)';
                      const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank}`;
                      return (
                        <div
                          key={p.name}
                          {...drillProps(`assignee = "${p.name}" AND statusCategory = Done`)}
                          data-drill={jiraBaseUrl ? '1' : undefined}
                          style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '14px 16px', border: i < 3 ? `1px solid ${rankColor}40` : '1px solid var(--border)', ...(jiraBaseUrl ? { cursor: 'pointer' } : {}) }}
                        >
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

              {/* ── LAST UPDATED ──────────────────────────────────────────── */}
              <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
