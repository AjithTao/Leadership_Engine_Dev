'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  AlertTriangle,
  RefreshCw, Calendar, Activity,
  FileText, Download, Info, Zap, Check,
  TrendingUp, TrendingDown, Minus, Sparkles, BarChart3,
  ArrowUp, ArrowDown, Equal, Table2, Mail, Send, Pencil, FileImage
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getApiUrl } from '../../lib/api-config';
import { useTheme } from '../contexts/ThemeContext';
import { createTcoeReportPDFBlob, exportQcoeReportAsJPG, exportTcoeReportAsPDF, exportTcoeReportAsExcel, exportTcoeReportAsExcelMulti } from '../utils/exportUtils';
import { buildTcoeTableSpecs } from '../utils/tcoeDashboardTables';
import { QcoeMetricTable } from './QcoeMetricTable';
import { jobTracker } from '../utils/jobTracker';
import { DashboardLayout } from './DashboardLayout';
import {
  PI_DATE_RANGES,
  buildPIDateWindow,
  compareMetricByDate,
  formatPICompact,
  formatPISpaced,
  getPIByDate,
} from '../utils/piDateUtils';
import type { PIContext, PIDateWindow } from '../utils/piDateUtils';

interface WeekMetrics {
  bugs_count: number;
  defects_count: number;
  leakage_percentage: number;
  total_issues: number;
  date_range: string;
  bugs_list?: any[];
  defects_list?: any[];
  bugs_keys?: string[];
  defects_keys?: string[];
  bugs_jql?: string;
  defects_jql?: string;
  cy25_defects?: number;
  cy26_defects?: number;
  defect_inflow_percentage?: number;
  cy25_jql?: string;
  cy26_jql?: string;
  pi_context?: PIContext;
}

interface Comparison {
  leakage_change: number;
  leakage_change_percentage: number;
  bugs_change: number;
  defects_change: number;
  trend: 'improving' | 'worsening' | 'stable';
  severity: 'critical' | 'warning' | 'attention' | 'normal';
}

interface PeriodMetrics {
  from: string;
  to: string;
  pi_context?: PIContext;
  automated_count?: number;
  manual_count?: number;
  automation_percentage?: number;
  // Automation breakdown fields (matching PDF structure)
  automated?: number;
  requires_automation?: number;
  automation_not_required?: number;
  automation_percentage_total?: number;
  automation_percentage_automatable?: number;
  automatable?: number;
  total?: number;
  // Test Coverage fields
  stories_with_tests?: number;
  stories_without_tests?: number;
  coverage_percentage?: number;
  // Test Story Ratio fields
  total_test_cases?: number;
  total_stories?: number;
  ratio?: number;
  // Bug Ratio fields
  bugs_found?: number;
  test_cases_executed?: number;
  // Test Review Status fields
  reviewed_yes?: number;
  reviewed_no?: number;
  not_set?: number;
  review_percentage?: number;
  // JQL queries used for this period (temporary feature)
  jql_queries?: string[];
}

interface RegressionProgress {
  percentage_change?: number;
  new_automated_tests?: number;
  trend: 'improving' | 'declining' | 'stable';
  // Additional progress fields
  ratio_change?: number;
  new_stories_with_tests?: number;
  new_reviewed?: number;
  bugs_change?: number;
  tests_change?: number;
  stories_change?: number;
  wow_progress_pct?: number;
}

interface Analysis {
  portfolio: string;
  current_week: WeekMetrics;
  previous_week: WeekMetrics;
  comparison: Comparison;
  ai_insights: string;
  generated_at: string;
  project_key?: string;
  projects?: string[];
  project_filter?: string;
  project_label?: string;
  portfolio_display?: string;
  metric?: string;
  metric_label?: string;
  pi_context?: PIContext;
  previous_pi_context?: PIContext;
  comparison_note?: string;
  metric_header?: string;
  projects_count?: number;
  total_projects?: number;
  reviewed_yes_p1?: number;
  total_stories_p1?: number;
  reviewed_yes_p2?: number;
  total_stories_p2?: number;
  concerning_areas?: string[];
  on_track_areas?: string[];
  project_breakdown?: any[];
  concerning_portfolios?: string[];
  improving_portfolios?: string[];
  ai_metadata?: {
    is_ai_generated?: boolean;
    model?: string;
    provider?: string;
    generated_at?: string;
  };
  // Regression/Overall automation fields
  total_regression_tests?: number;
  total_test_cases?: number;
  total_stories?: number; // For test_coverage, test_review_status, test_story_ratio
  period1?: PeriodMetrics; // Only present when comparison enabled
  period2?: PeriodMetrics; // Only present when comparison enabled
  period?: PeriodMetrics; // Only present when single period mode
  progress?: RegressionProgress; // Only present when comparison enabled
  ai_analysis?: string;
  table_a?: any;
  table_b?: any;
  has_data?: boolean;
  warning?: string;
  invalid_projects?: string[];
  invalid_projects_by_portfolio?: Array<{ portfolio: string; projects: string[] }>;
  // JQL queries used for this analysis (temporary feature for debugging)
  jql_queries?: string[];
}

interface InvalidProjectWarningGroup {
  portfolio: string;
  projects: string[];
}

interface DebugBreakdownItem {
  projectKey: string;
  projectLabel: string;
  current: { bugs: number; defects: number; total: number };
  previous: { bugs: number; defects: number; total: number };
}

interface MetricOption {
  value: string;
  label: string;
  description: string;
  disabled?: boolean;
}

// KPI-style dropdown options
interface DropdownOptions {
  portfolios: string[];
  project_keys: string[];
  project_names: string[];
  projectKeyToPortfolio: Record<string, string>;
  projectKeyToName: Record<string, string>;
}

interface QcoeProjectOption {
  id: string;
  key: string;
  name: string;
}

interface QcoePortfolioOption {
  category_id: string | null;
  name: string;
  projects: QcoeProjectOption[];
}

const METRIC_OPTIONS: MetricOption[] = [
  // Metric 1 - Stories to Test Cases Mapping (Dual-Table: Cumulative + selected PI)
  { value: 'test_coverage', label: 'Stories to Test Cases Mapping', description: 'Every story should have at least 1 test case mapped to ensure optimal coverage', disabled: false },

  // Metric 2 - Test Cases Review Status (Single-Table)
  { value: 'test_review_status', label: 'Test Cases Review Status', description: 'Closed Dev stories with test case review filled in selected PI', disabled: false },

  // Metric 3 - Test:Story Ratio (Single-Table)
  { value: 'test_story_ratio', label: 'Test:Story Ratio', description: 'Total # of Tests Created per closed Dev story', disabled: false },

  // Metric 4 - Bugs/Test Case (Single-Table)
  { value: 'bug_ratio', label: 'Bugs/Test Case', description: 'Indicates the quality of test cases and testing team along with a view of code quality', disabled: false },

  // Metric 5 - Weekly Defect Inflow (YoY) (Single-Table)
  { value: 'defect_leakage', label: 'Weekly Defect Inflow (YoY)', description: '[(CY26 Defects - CY25 Defects) / CY25 Defects] for the reporting period', disabled: false },

  // Metric 6 - Overall Automation Status (Dual-Table: Automated/Total, Automated/Automatable)
  { value: 'overall_automation', label: 'Overall Automation Status', description: 'Automated test cases against the overall test cases volume', disabled: false },

  // Metric 7 - Regression Automation Status (Dual-Table)
  { value: 'regression_automation', label: 'Regression Automation Status', description: 'Automated regression test cases against the overall regression test cases volume', disabled: false },

  // Disabled metrics - kept for future use
  { value: 'unit_test_coverage', label: 'Unit Test Coverage', description: 'Unit test coverage from code analysis', disabled: true },
  { value: 'performance_status', label: 'Performance Test Status', description: 'Performance test execution status', disabled: true },
  { value: 'env_data_status', label: 'Environment & Data Availability', description: 'Test environment and data readiness status', disabled: true },
];

const HIDDEN_TCOE_METRIC_VALUES = new Set(['defect_leakage']);
const VISIBLE_METRIC_OPTIONS = METRIC_OPTIONS.filter(option => !HIDDEN_TCOE_METRIC_VALUES.has(option.value));
const onlyVisibleTcoeMetrics = (metrics: string[]) => metrics.filter(metric => !HIDDEN_TCOE_METRIC_VALUES.has(metric));

const PI_SCOPED_RESET_METRICS = new Set(['test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status']);

// Date filter modes
type DateFilterMode = 'today' | 'custom' | 'pi' | 'sprint' | 'month' | 'weekly';

type TcoeReportSnapshotStatus = 'processing' | 'completed' | 'failed';

interface TcoeReportSnapshotFilters {
  selectedPortfolio: string;
  selectedPortfolios: string[];
  selectedProjectKey: string;
  selectedProjectKeys: string[];
  selectedProjectName: string;
  selectedMetric: string;
  selectedMetrics: string[];
  usePortfolioMultiSelect: boolean;
  useMultiSelect: boolean;
  useMetricMultiSelect: boolean;
  aggregateByPortfolio: boolean;
  dateFilterMode: DateFilterMode;
  enableComparison: boolean;
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  selectedPI: string;
  comparisonPI: string;
  selectedSprint: string;
  comparisonSprint: string;
}

interface TcoeReportSnapshot {
  status: TcoeReportSnapshotStatus;
  analysis: Analysis | null;
  rows: Analysis[] | null;
  rawRows: Analysis[] | null;
  debugBreakdown: DebugBreakdownItem[] | null;
  reportGenerationTime: number | null;
  error: string | null;
  filters: TcoeReportSnapshotFilters | null;
  startedAt: number;
  updatedAt: string;
  completedAt?: string;
}

type TcoeReportSnapshotUpdate = Partial<Pick<
  TcoeReportSnapshot,
  'analysis' | 'rows' | 'rawRows' | 'debugBreakdown' | 'reportGenerationTime' | 'error' | 'filters' | 'startedAt' | 'completedAt'
>>;

const TCOE_REPORT_SNAPSHOT_KEY = 'tcoe_report_snapshot_v1';
const TCOE_REPORT_SNAPSHOT_POLL_MS = 1000;

const getTcoeReportStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
};

const compactWeekMetricsForSnapshot = (metrics: WeekMetrics | undefined): WeekMetrics => {
  if (!metrics) {
    return { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' };
  }

  const { bugs_list, defects_list, ...compactMetrics } = metrics;
  return compactMetrics;
};

const compactAnalysisForSnapshot = (row: Analysis): Analysis => {
  const rowWithDetails = row as Analysis & { _projectDetails?: any[] };
  return {
    ...rowWithDetails,
    project_breakdown: undefined,
    current_week: compactWeekMetricsForSnapshot(row.current_week),
    previous_week: compactWeekMetricsForSnapshot(row.previous_week),
  } as Analysis;
};

const compactReportSnapshot = (snapshot: TcoeReportSnapshot): TcoeReportSnapshot => ({
  ...snapshot,
  analysis: snapshot.analysis ? compactAnalysisForSnapshot(snapshot.analysis) : null,
  rows: snapshot.rows ? snapshot.rows.map(compactAnalysisForSnapshot) : null,
  rawRows: snapshot.rawRows ? snapshot.rawRows.map(compactAnalysisForSnapshot) : null,
});

const readTcoeReportSnapshot = (): TcoeReportSnapshot | null => {
  const storage = getTcoeReportStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(TCOE_REPORT_SNAPSHOT_KEY);
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as TcoeReportSnapshot;
    if (!['processing', 'completed', 'failed'].includes(snapshot.status)) {
      storage.removeItem(TCOE_REPORT_SNAPSHOT_KEY);
      return null;
    }

    return snapshot;
  } catch (error) {
    storage.removeItem(TCOE_REPORT_SNAPSHOT_KEY);
    console.warn('Unable to restore cached TCOE report:', error);
    return null;
  }
};

const writeTcoeReportSnapshot = (snapshot: TcoeReportSnapshot) => {
  const storage = getTcoeReportStorage();
  if (!storage) return;

  try {
    storage.setItem(TCOE_REPORT_SNAPSHOT_KEY, JSON.stringify(compactReportSnapshot(snapshot)));
  } catch (error) {
    try {
      const compactSnapshot = compactReportSnapshot(snapshot);
      storage.setItem(TCOE_REPORT_SNAPSHOT_KEY, JSON.stringify({ ...compactSnapshot, rawRows: null }));
    } catch (retryError) {
      console.warn('Unable to persist TCOE report snapshot:', retryError || error);
    }
  }
};

const DEFAULT_PREVIOUS_WEEK_END = '2026-03-13';
const DEFAULT_CURRENT_WEEK_END = '2026-04-03';
const DEFAULT_CURRENT_PI_WINDOW = buildPIDateWindow(DEFAULT_CURRENT_WEEK_END);
const DEFAULT_PREVIOUS_PI_WINDOW = buildPIDateWindow(DEFAULT_PREVIOUS_WEEK_END);

const PI_OPTIONS = PI_DATE_RANGES.map((pi) => ({
  ...pi,
  commitStart: pi.startDate,
  commitEnd: pi.endDate,
  reportEnd: pi.reportEndDate || pi.endDate,
}));

// Sprint Options - 2-week sprints within each PI for TCOE metrics
// Each PI has approximately 5 sprints (10 weeks / 2 weeks per sprint)
const SPRINT_OPTIONS = [
  // PI1_CY25 Sprints
  { value: 'S1_PI1_CY25', label: 'Sprint 1 - PI1 CY25 (Jan 15 - Jan 28, 2025)', startDate: '2025-01-15', endDate: '2025-01-28', pi: 'PI1_CY25' },
  { value: 'S2_PI1_CY25', label: 'Sprint 2 - PI1 CY25 (Jan 29 - Feb 11, 2025)', startDate: '2025-01-29', endDate: '2025-02-11', pi: 'PI1_CY25' },
  { value: 'S3_PI1_CY25', label: 'Sprint 3 - PI1 CY25 (Feb 12 - Feb 25, 2025)', startDate: '2025-02-12', endDate: '2025-02-25', pi: 'PI1_CY25' },
  { value: 'S4_PI1_CY25', label: 'Sprint 4 - PI1 CY25 (Feb 26 - Mar 11, 2025)', startDate: '2025-02-26', endDate: '2025-03-11', pi: 'PI1_CY25' },
  { value: 'S5_PI1_CY25', label: 'Sprint 5 - PI1 CY25 (Mar 12 - Mar 25, 2025)', startDate: '2025-03-12', endDate: '2025-03-25', pi: 'PI1_CY25' },

  // PI2_CY25 Sprints
  { value: 'S1_PI2_CY25', label: 'Sprint 1 - PI2 CY25 (Apr 16 - Apr 29, 2025)', startDate: '2025-04-16', endDate: '2025-04-29', pi: 'PI2_CY25' },
  { value: 'S2_PI2_CY25', label: 'Sprint 2 - PI2 CY25 (Apr 30 - May 13, 2025)', startDate: '2025-04-30', endDate: '2025-05-13', pi: 'PI2_CY25' },
  { value: 'S3_PI2_CY25', label: 'Sprint 3 - PI2 CY25 (May 14 - May 27, 2025)', startDate: '2025-05-14', endDate: '2025-05-27', pi: 'PI2_CY25' },
  { value: 'S4_PI2_CY25', label: 'Sprint 4 - PI2 CY25 (May 28 - Jun 10, 2025)', startDate: '2025-05-28', endDate: '2025-06-10', pi: 'PI2_CY25' },
  { value: 'S5_PI2_CY25', label: 'Sprint 5 - PI2 CY25 (Jun 11 - Jun 24, 2025)', startDate: '2025-06-11', endDate: '2025-06-24', pi: 'PI2_CY25' },

  // PI3_CY25 Sprints
  { value: 'S1_PI3_CY25', label: 'Sprint 1 - PI3 CY25 (Jul 16 - Jul 29, 2025)', startDate: '2025-07-16', endDate: '2025-07-29', pi: 'PI3_CY25' },
  { value: 'S2_PI3_CY25', label: 'Sprint 2 - PI3 CY25 (Jul 30 - Aug 12, 2025)', startDate: '2025-07-30', endDate: '2025-08-12', pi: 'PI3_CY25' },
  { value: 'S3_PI3_CY25', label: 'Sprint 3 - PI3 CY25 (Aug 13 - Aug 26, 2025)', startDate: '2025-08-13', endDate: '2025-08-26', pi: 'PI3_CY25' },
  { value: 'S4_PI3_CY25', label: 'Sprint 4 - PI3 CY25 (Aug 27 - Sep 09, 2025)', startDate: '2025-08-27', endDate: '2025-09-09', pi: 'PI3_CY25' },
  { value: 'S5_PI3_CY25', label: 'Sprint 5 - PI3 CY25 (Sep 10 - Sep 23, 2025)', startDate: '2025-09-10', endDate: '2025-09-23', pi: 'PI3_CY25' },

  // PI4_CY25 Sprints
  { value: 'S1_PI4_CY25', label: 'Sprint 1 - PI4 CY25 (Oct 15 - Oct 28, 2025)', startDate: '2025-10-15', endDate: '2025-10-28', pi: 'PI4_CY25' },
  { value: 'S2_PI4_CY25', label: 'Sprint 2 - PI4 CY25 (Oct 29 - Nov 11, 2025)', startDate: '2025-10-29', endDate: '2025-11-11', pi: 'PI4_CY25' },
  { value: 'S3_PI4_CY25', label: 'Sprint 3 - PI4 CY25 (Nov 12 - Nov 25, 2025)', startDate: '2025-11-12', endDate: '2025-11-25', pi: 'PI4_CY25' },
  { value: 'S4_PI4_CY25', label: 'Sprint 4 - PI4 CY25 (Nov 26 - Dec 09, 2025)', startDate: '2025-11-26', endDate: '2025-12-09', pi: 'PI4_CY25' },
  { value: 'S5_PI4_CY25', label: 'Sprint 5 - PI4 CY25 (Dec 10 - Dec 23, 2025)', startDate: '2025-12-10', endDate: '2025-12-23', pi: 'PI4_CY25' },

  // PI1_CY26 Sprints
  { value: 'S1_PI1_CY26', label: 'Sprint 1 - PI1 CY26 (Jan 14 - Jan 27, 2026)', startDate: '2026-01-14', endDate: '2026-01-27', pi: 'PI1_CY26' },
  { value: 'S2_PI1_CY26', label: 'Sprint 2 - PI1 CY26 (Jan 28 - Feb 10, 2026)', startDate: '2026-01-28', endDate: '2026-02-10', pi: 'PI1_CY26' },
  { value: 'S3_PI1_CY26', label: 'Sprint 3 - PI1 CY26 (Feb 11 - Feb 24, 2026)', startDate: '2026-02-11', endDate: '2026-02-24', pi: 'PI1_CY26' },
  { value: 'S4_PI1_CY26', label: 'Sprint 4 - PI1 CY26 (Feb 25 - Mar 10, 2026)', startDate: '2026-02-25', endDate: '2026-03-10', pi: 'PI1_CY26' },
  { value: 'S5_PI1_CY26', label: 'Sprint 5 - PI1 CY26 (Mar 11 - Mar 24, 2026)', startDate: '2026-03-11', endDate: '2026-03-24', pi: 'PI1_CY26' },

  // PI2_CY26 Sprints
  { value: 'S1_PI2_CY26', label: 'Sprint 1 - PI2 CY26 (Apr 15 - Apr 28, 2026)', startDate: '2026-04-15', endDate: '2026-04-28', pi: 'PI2_CY26' },
  { value: 'S2_PI2_CY26', label: 'Sprint 2 - PI2 CY26 (Apr 29 - May 12, 2026)', startDate: '2026-04-29', endDate: '2026-05-12', pi: 'PI2_CY26' },
  { value: 'S3_PI2_CY26', label: 'Sprint 3 - PI2 CY26 (May 13 - May 26, 2026)', startDate: '2026-05-13', endDate: '2026-05-26', pi: 'PI2_CY26' },
  { value: 'S4_PI2_CY26', label: 'Sprint 4 - PI2 CY26 (May 27 - Jun 09, 2026)', startDate: '2026-05-27', endDate: '2026-06-09', pi: 'PI2_CY26' },
  { value: 'S5_PI2_CY26', label: 'Sprint 5 - PI2 CY26 (Jun 10 - Jun 23, 2026)', startDate: '2026-06-10', endDate: '2026-06-23', pi: 'PI2_CY26' },

  // PI3_CY26 Sprints
  { value: 'S1_PI3_CY26', label: 'Sprint 1 - PI3 CY26 (Jul 15 - Jul 28, 2026)', startDate: '2026-07-15', endDate: '2026-07-28', pi: 'PI3_CY26' },
  { value: 'S2_PI3_CY26', label: 'Sprint 2 - PI3 CY26 (Jul 29 - Aug 11, 2026)', startDate: '2026-07-29', endDate: '2026-08-11', pi: 'PI3_CY26' },
  { value: 'S3_PI3_CY26', label: 'Sprint 3 - PI3 CY26 (Aug 12 - Aug 25, 2026)', startDate: '2026-08-12', endDate: '2026-08-25', pi: 'PI3_CY26' },
  { value: 'S4_PI3_CY26', label: 'Sprint 4 - PI3 CY26 (Aug 26 - Sep 08, 2026)', startDate: '2026-08-26', endDate: '2026-09-08', pi: 'PI3_CY26' },
  { value: 'S5_PI3_CY26', label: 'Sprint 5 - PI3 CY26 (Sep 09 - Sep 22, 2026)', startDate: '2026-09-09', endDate: '2026-09-22', pi: 'PI3_CY26' },

  // PI4_CY26 Sprints
  { value: 'S1_PI4_CY26', label: 'Sprint 1 - PI4 CY26 (Oct 14 - Oct 27, 2026)', startDate: '2026-10-14', endDate: '2026-10-27', pi: 'PI4_CY26' },
  { value: 'S2_PI4_CY26', label: 'Sprint 2 - PI4 CY26 (Oct 28 - Nov 10, 2026)', startDate: '2026-10-28', endDate: '2026-11-10', pi: 'PI4_CY26' },
  { value: 'S3_PI4_CY26', label: 'Sprint 3 - PI4 CY26 (Nov 11 - Nov 24, 2026)', startDate: '2026-11-11', endDate: '2026-11-24', pi: 'PI4_CY26' },
  { value: 'S4_PI4_CY26', label: 'Sprint 4 - PI4 CY26 (Nov 25 - Dec 08, 2026)', startDate: '2026-11-25', endDate: '2026-12-08', pi: 'PI4_CY26' },
  { value: 'S5_PI4_CY26', label: 'Sprint 5 - PI4 CY26 (Dec 09 - Dec 22, 2026)', startDate: '2026-12-09', endDate: '2026-12-22', pi: 'PI4_CY26' },
];

// Generate year options
const YEAR_OPTIONS = [2024, 2025, 2026];
const MONTH_OPTIONS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

export function DefectLeakageAnalyzer() {
  const { currentTheme, isDarkMode } = useTheme();
  const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayDateRange = () => {
    const today = formatDateInput(new Date());
    return { from: today, to: today };
  };

  const normalizeToWeekEndingFriday = (dateStr: string) => {
    if (!dateStr) return dateStr;
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr;
    const daysUntilFriday = (5 - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysUntilFriday);
    return formatDateInput(date);
  };

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // rows → table data (can be aggregated); rawRows → always project-level for graphs
  const [rows, setRows] = useState<Analysis[] | null>(null);
  const [rawRows, setRawRows] = useState<Analysis[] | null>(null);
  const [reportGenerationTime, setReportGenerationTime] = useState<number | null>(null);
  const [debugBreakdown, setDebugBreakdown] = useState<DebugBreakdownItem[] | null>(null);

  const [projectCatalog, setProjectCatalog] = useState<QcoePortfolioOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [options, setOptions] = useState<DropdownOptions>({
    portfolios: ['All'],
    project_keys: ['All'],
    project_names: ['All'],
    projectKeyToPortfolio: {},
    projectKeyToName: {},
  });

  // Selected filters – same pattern as KPI
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('All');
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('All');
  const [selectedProjectName, setSelectedProjectName] = useState<string>('All');

  // Multi-select for portfolios
  const [portfolioMultiSelectOpen, setPortfolioMultiSelectOpen] = useState(false);
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>([]);
  const [tempSelectedPortfolios, setTempSelectedPortfolios] = useState<string[]>([]); // Temporary selections before Apply
  const [usePortfolioMultiSelect, setUsePortfolioMultiSelect] = useState(false);

  // Multi-select for project keys
  const [multiSelectOpen, setMultiSelectOpen] = useState(false);
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<string[]>([]);
  const [tempSelectedProjectKeys, setTempSelectedProjectKeys] = useState<string[]>([]); // Temporary selections before Apply
  const [selectedProjectNames, setSelectedProjectNames] = useState<string[]>([]);
  const [useMultiSelect, setUseMultiSelect] = useState(false);

  // Aggregation setting (tables aggregated by portfolio by default; graphs use raw rows)
  const [aggregateByPortfolio, setAggregateByPortfolio] = useState(true);

  // Date filter mode and comparison
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('weekly');
  const [enableComparison, setEnableComparison] = useState(true);

  // View mode toggle (table/graph) - per metric
  const [viewMode, setViewMode] = useState<Record<string, 'table' | 'graph'>>({});
  // Show JQL toggle - per metric (temporary feature for debugging)
  const [showJql, setShowJql] = useState<Record<string, boolean>>({});
  // Graph portfolio selection per metric (when multiple portfolios selected)
  const [graphPortfolioSelection, setGraphPortfolioSelection] = useState<Record<string, string>>({});

  // PI selection
  const [selectedPI, setSelectedPI] = useState<string>(DEFAULT_CURRENT_PI_WINDOW.piContext.value);
  const [comparisonPI, setComparisonPI] = useState<string>(DEFAULT_PREVIOUS_PI_WINDOW.piContext.value);

  // Sprint selection
  const [selectedSprint, setSelectedSprint] = useState<string>('All');
  const [comparisonSprint, setComparisonSprint] = useState<string>('All');

  // Month/Year selection
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [comparisonYear, setComparisonYear] = useState<number>(2025);
  const [comparisonMonth, setComparisonMonth] = useState<number>(new Date().getMonth() + 1);

  const defaultMetric = VISIBLE_METRIC_OPTIONS.find(option => option.value === 'test_review_status') || VISIBLE_METRIC_OPTIONS.find(option => !option.disabled) || VISIBLE_METRIC_OPTIONS[0];
  const [selectedMetric, setSelectedMetric] = useState<string>('test_review_status');
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingJPG, setExportingJPG] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailCc, setMailCc] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailStatus, setMailStatus] = useState<string | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);

  // Multi-select for metrics
  const [metricMultiSelectOpen, setMetricMultiSelectOpen] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [tempSelectedMetrics, setTempSelectedMetrics] = useState<string[]>([]);
  const [useMetricMultiSelect, setUseMetricMultiSelect] = useState(false);

  // Search filters for each dropdown
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [metricSearch, setMetricSearch] = useState('');

  // Calculate current week dates (Monday to Sunday)
  const getCurrentWeekDates = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
      currentFrom: formatDateInput(monday),
      currentTo: formatDateInput(sunday),
      previousFrom: formatDateInput(new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)),
      previousTo: formatDateInput(new Date(sunday.getTime() - 7 * 24 * 60 * 60 * 1000))
    };
  };

  const currentWeek = getCurrentWeekDates();
  const todayRange = getTodayDateRange();

  // Date states - PI start is derived from the selected report date.
  // Comparison dates remain available for non-today modes.
  const [currentFrom, setCurrentFrom] = useState(DEFAULT_CURRENT_PI_WINDOW.piStartDate);
  const [currentTo, setCurrentTo] = useState(DEFAULT_CURRENT_WEEK_END);
  const [previousFrom, setPreviousFrom] = useState(DEFAULT_PREVIOUS_PI_WINDOW.piStartDate);
  const [previousTo, setPreviousTo] = useState(DEFAULT_PREVIOUS_WEEK_END);
  const [isCurrentRangeEditable, setIsCurrentRangeEditable] = useState(false);
  const [isPreviousRangeEditable, setIsPreviousRangeEditable] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);  // For partial success (some portfolios have no data)
  const [warningDetails, setWarningDetails] = useState<InvalidProjectWarningGroup[]>([]);
  const [warningExpanded, setWarningExpanded] = useState(false);

  const buildReportSnapshotFilters = (): TcoeReportSnapshotFilters => ({
    selectedPortfolio,
  selectedPortfolios,
  selectedProjectKey,
  selectedProjectKeys,
  selectedProjectName,
  selectedMetric: HIDDEN_TCOE_METRIC_VALUES.has(selectedMetric) ? defaultMetric.value : selectedMetric,
  selectedMetrics: onlyVisibleTcoeMetrics(selectedMetrics),
  usePortfolioMultiSelect,
  useMultiSelect,
  useMetricMultiSelect: useMetricMultiSelect && onlyVisibleTcoeMetrics(selectedMetrics).length > 0,
    aggregateByPortfolio,
    dateFilterMode,
    enableComparison,
    currentFrom,
    currentTo,
    previousFrom,
    previousTo,
    selectedPI,
    comparisonPI,
    selectedSprint,
    comparisonSprint,
  });

  const persistReportSnapshot = (
    status: TcoeReportSnapshotStatus,
    update: TcoeReportSnapshotUpdate = {}
  ) => {
    writeTcoeReportSnapshot({
      status,
      analysis: update.analysis ?? null,
      rows: update.rows ?? null,
      rawRows: update.rawRows ?? null,
      debugBreakdown: update.debugBreakdown ?? null,
      reportGenerationTime: update.reportGenerationTime ?? null,
      error: update.error ?? null,
      filters: update.filters ?? buildReportSnapshotFilters(),
      startedAt: update.startedAt ?? Date.now(),
      updatedAt: new Date().toISOString(),
      completedAt: update.completedAt ?? (status === 'completed' ? new Date().toISOString() : undefined),
    });
  };

  useEffect(() => {
    const applySnapshot = (snapshot: TcoeReportSnapshot) => {
      if (snapshot.filters) {
        setSelectedPortfolio(snapshot.filters.selectedPortfolio);
        setSelectedPortfolios(snapshot.filters.selectedPortfolios);
        setSelectedProjectKey(snapshot.filters.selectedProjectKey);
        setSelectedProjectKeys(snapshot.filters.selectedProjectKeys);
        setSelectedProjectName(snapshot.filters.selectedProjectName);
        const restoredSelectedMetric = HIDDEN_TCOE_METRIC_VALUES.has(snapshot.filters.selectedMetric)
          ? defaultMetric.value
          : snapshot.filters.selectedMetric;
        const restoredSelectedMetrics = onlyVisibleTcoeMetrics(snapshot.filters.selectedMetrics);
        setSelectedMetric(restoredSelectedMetric);
        setSelectedMetrics(restoredSelectedMetrics);
        setUsePortfolioMultiSelect(snapshot.filters.usePortfolioMultiSelect);
        setUseMultiSelect(snapshot.filters.useMultiSelect);
        setUseMetricMultiSelect(snapshot.filters.useMetricMultiSelect && restoredSelectedMetrics.length > 0);
        setAggregateByPortfolio(snapshot.filters.aggregateByPortfolio);
        setDateFilterMode(snapshot.filters.dateFilterMode);
        setEnableComparison(snapshot.filters.enableComparison);
        setCurrentFrom(snapshot.filters.currentFrom);
        setCurrentTo(snapshot.filters.currentTo);
        setPreviousFrom(snapshot.filters.previousFrom);
        setPreviousTo(snapshot.filters.previousTo);
        setSelectedPI(snapshot.filters.selectedPI);
        setComparisonPI(snapshot.filters.comparisonPI);
        setSelectedSprint(snapshot.filters.selectedSprint);
        setComparisonSprint(snapshot.filters.comparisonSprint);
      }

      setAnalysis(snapshot.analysis);
      setRows(snapshot.rows);
      setRawRows(snapshot.rawRows);
      setDebugBreakdown(snapshot.debugBreakdown);
      setReportGenerationTime(snapshot.reportGenerationTime);
      setError(snapshot.error);
      setLoading(snapshot.status === 'processing');
    };

    const initialSnapshot = readTcoeReportSnapshot();
    if (!initialSnapshot) return;

    applySnapshot(initialSnapshot);
    if (initialSnapshot.status !== 'processing') return;

    const pollId = window.setInterval(() => {
      const latestSnapshot = readTcoeReportSnapshot();
      if (!latestSnapshot) return;

      applySnapshot(latestSnapshot);
      if (latestSnapshot.status !== 'processing') {
        window.clearInterval(pollId);
      }
    }, TCOE_REPORT_SNAPSHOT_POLL_MS);

    return () => window.clearInterval(pollId);
  }, []);

  const tryBuildPIDateWindow = (reportDate: string): PIDateWindow | null => {
    try {
      return buildPIDateWindow(reportDate);
    } catch {
      return null;
    }
  };

  const piStartForReportDate = (reportDate: string, fallback: string) => {
    return tryBuildPIDateWindow(reportDate)?.piStartDate || fallback;
  };

  const selectDateFilterMode = (mode: DateFilterMode) => {
    setDateFilterMode(mode);
    if (mode === 'weekly') {
      setIsCurrentRangeEditable(false);
      setIsPreviousRangeEditable(false);
      const normalizedCurrentTo = normalizeToWeekEndingFriday(currentTo || DEFAULT_CURRENT_WEEK_END);
      const normalizedPreviousTo = normalizeToWeekEndingFriday(previousTo || DEFAULT_PREVIOUS_WEEK_END);
      setCurrentFrom(piStartForReportDate(normalizedCurrentTo, currentFrom));
      setCurrentTo(normalizedCurrentTo);
      setPreviousFrom(piStartForReportDate(normalizedPreviousTo, previousFrom));
      setPreviousTo(normalizedPreviousTo);
    }
    if (mode === 'custom') {
      setIsCurrentRangeEditable(true);
      setIsPreviousRangeEditable(true);
    }
  };

  const getReportPIContext = (): PIContext | null => {
    const firstRowWithPI = rows?.find(row => row.pi_context);
    return analysis?.pi_context || firstRowWithPI?.pi_context || getPIByDate(currentTo);
  };

  const getPreviousReportPIContext = (): PIContext | null => {
    const firstRowWithPreviousPI = rows?.find(row => row.previous_pi_context);
    return analysis?.previous_pi_context || firstRowWithPreviousPI?.previous_pi_context || getPIByDate(previousTo);
  };

  const getComparisonPINote = () => {
    if (!enableComparison) return null;
    const explicitNote = analysis?.comparison_note || rows?.find(row => row.comparison_note)?.comparison_note;
    if (explicitNote) return explicitNote;

    const currentPI = getReportPIContext();
    const previousPI = getPreviousReportPIContext();
    if (!currentPI || !previousPI || currentPI.value === previousPI.value) return null;
    return `Previous comparison date belongs to ${formatPISpaced(previousPI)}; current report date belongs to ${formatPISpaced(currentPI)}.`;
  };

  const isCrossPIComparison = () => {
    if (!enableComparison) return false;
    const currentPI = getReportPIContext();
    const previousPI = getPreviousReportPIContext();
    return Boolean(currentPI && previousPI && currentPI.value !== previousPI.value);
  };

  // Auto-apply portfolio selections when dropdown closes
  useEffect(() => {
    if (!portfolioMultiSelectOpen && tempSelectedPortfolios.length > 0) {
      // Dropdown closed - auto-apply the temporary selections if they changed
      const hasChanges = JSON.stringify(tempSelectedPortfolios.sort()) !== JSON.stringify(selectedPortfolios.sort());
      if (hasChanges) {
        setSelectedPortfolios([...tempSelectedPortfolios]);
        setUsePortfolioMultiSelect(true);
        setSelectedPortfolio('All');
      }
    }
  }, [portfolioMultiSelectOpen, tempSelectedPortfolios, selectedPortfolios]);

  // Auto-apply project key selections when dropdown closes
  useEffect(() => {
    if (!multiSelectOpen && tempSelectedProjectKeys.length > 0) {
      // Dropdown closed - auto-apply the temporary selections if they changed
      const hasChanges = JSON.stringify(tempSelectedProjectKeys.sort()) !== JSON.stringify(selectedProjectKeys.sort());
      if (hasChanges) {
        setSelectedProjectKeys([...tempSelectedProjectKeys]);
        setUseMultiSelect(true);
        setSelectedProjectKey('All');
        const tempNames = tempSelectedProjectKeys.map(key => findProjectNameForKey(key)).filter((name): name is string => name !== null);
        if (tempNames.length === 1) {
          setSelectedProjectName(tempNames[0]);
        } else if (tempNames.length > 1) {
          setSelectedProjectName('All');
        }
      }
    }
  }, [multiSelectOpen, tempSelectedProjectKeys, selectedProjectKeys]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        // Auto-apply before closing
        if (portfolioMultiSelectOpen && tempSelectedPortfolios.length > 0) {
          const hasChanges = JSON.stringify(tempSelectedPortfolios.sort()) !== JSON.stringify(selectedPortfolios.sort());
          if (hasChanges) {
            setSelectedPortfolios([...tempSelectedPortfolios]);
            setUsePortfolioMultiSelect(true);
            setSelectedPortfolio('All');
          }
        }
        if (multiSelectOpen && tempSelectedProjectKeys.length > 0) {
          const hasChanges = JSON.stringify(tempSelectedProjectKeys.sort()) !== JSON.stringify(selectedProjectKeys.sort());
          if (hasChanges) {
            setSelectedProjectKeys([...tempSelectedProjectKeys]);
            setUseMultiSelect(true);
            setSelectedProjectKey('All');
            const tempNames = tempSelectedProjectKeys.map(key => findProjectNameForKey(key)).filter((name): name is string => name !== null);
            if (tempNames.length === 1) {
              setSelectedProjectName(tempNames[0]);
            } else if (tempNames.length > 1) {
              setSelectedProjectName('All');
            }
          }
        }
        setPortfolioMultiSelectOpen(false);
        setMultiSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [portfolioMultiSelectOpen, multiSelectOpen, tempSelectedPortfolios, tempSelectedProjectKeys, selectedPortfolios, selectedProjectKeys]);

  const activeMetricOption = VISIBLE_METRIC_OPTIONS.find(option => option.value === selectedMetric) || defaultMetric;

  // Update dropdown options from the Jira-backed catalog.
  const updateDropdownOptions = (portfolios?: string[]) => {
    const selected = new Set((portfolios || []).filter(portfolio => portfolio !== 'All'));
    const visiblePortfolios = selected.size
      ? projectCatalog.filter(portfolio => selected.has(portfolio.name))
      : projectCatalog;
    const visibleProjects = visiblePortfolios.flatMap(portfolio => portfolio.projects);
    const projectKeyToPortfolio: Record<string, string> = {};
    const projectKeyToName: Record<string, string> = {};
    projectCatalog.forEach(portfolio => portfolio.projects.forEach(project => {
      projectKeyToPortfolio[project.key] = portfolio.name;
      projectKeyToName[project.key] = project.name;
    }));
    setOptions({
      portfolios: ['All', ...projectCatalog.map(portfolio => portfolio.name)],
      project_keys: ['All', ...visibleProjects.map(project => project.key)],
      project_names: ['All', ...Array.from(new Set(visibleProjects.map(project => project.name)))],
      projectKeyToPortfolio,
      projectKeyToName,
    });
  };

  // Build the selected key-to-portfolio mapping from Jira data.
  const buildPortfolioMapping = (portfoliosToUse?: string[]): Record<string, string> => {
    const filteredMapping: Record<string, string> = {};
    const selected = new Set((portfoliosToUse || []).filter(portfolio => portfolio !== 'All'));
    projectCatalog.forEach(portfolio => {
      if (selected.size === 0 || selected.has(portfolio.name)) {
        portfolio.projects.forEach(project => { filteredMapping[project.key] = portfolio.name; });
      }
    });
    return filteredMapping;
  };

  // Load the authoritative catalog directly from Jira through the backend.
  useEffect(() => {
    let mounted = true;
    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const response = await fetch(getApiUrl('/api/quality/qcoe-projects'));
        const payload = await response.json();
        if (!response.ok || !payload.success || !Array.isArray(payload.portfolios)) {
          throw new Error(payload.detail || payload.error || 'Unable to load QCOE projects from Jira.');
        }
        if (mounted) setProjectCatalog(payload.portfolios);
      } catch (catalogFailure) {
        if (mounted) {
          setProjectCatalog([]);
          setCatalogError(catalogFailure instanceof Error ? catalogFailure.message : 'Unable to load QCOE projects from Jira.');
        }
      } finally {
        if (mounted) setCatalogLoading(false);
      }
    };
    loadCatalog();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    updateDropdownOptions();
    if (!projectCatalog.length) return;
    const validPortfolios = new Set(projectCatalog.map(portfolio => portfolio.name));
    const validProjects = new Set(projectCatalog.flatMap(portfolio => portfolio.projects.map(project => project.key)));
    const validProjectNames = new Set(projectCatalog.flatMap(portfolio => portfolio.projects.map(project => project.name)));
    setSelectedPortfolio(current => current === 'All' || validPortfolios.has(current) ? current : 'All');
    setSelectedPortfolios(current => current.filter(portfolio => validPortfolios.has(portfolio)));
    setTempSelectedPortfolios(current => current.filter(portfolio => validPortfolios.has(portfolio)));
    setSelectedProjectKey(current => current === 'All' || validProjects.has(current) ? current : 'All');
    setSelectedProjectKeys(current => current.filter(project => validProjects.has(project)));
    setTempSelectedProjectKeys(current => current.filter(project => validProjects.has(project)));
    setSelectedProjectName(current => current === 'All' || validProjectNames.has(current) ? current : 'All');
    setSelectedProjectNames(current => current.filter(project => validProjectNames.has(project)));
  }, [projectCatalog]);

  // Handle sprint selection - update dates when sprint changes
  // Update dates when sprint is selected in sprint mode
  useEffect(() => {
    if (dateFilterMode === 'today') {
      const today = getTodayDateRange();
      setCurrentFrom(piStartForReportDate(today.to, today.from));
      setCurrentTo(today.to);
      if (enableComparison) {
        setEnableComparison(false);
      }
    }
  }, [dateFilterMode, enableComparison]);

  useEffect(() => {
    if (dateFilterMode === 'weekly') {
      const normalizedCurrentTo = normalizeToWeekEndingFriday(currentTo || DEFAULT_CURRENT_WEEK_END);
      const normalizedPreviousTo = normalizeToWeekEndingFriday(previousTo || DEFAULT_PREVIOUS_WEEK_END);
      const nextCurrentFrom = isCurrentRangeEditable
        ? currentFrom
        : piStartForReportDate(normalizedCurrentTo, currentFrom);
      const nextPreviousFrom = isPreviousRangeEditable
        ? previousFrom
        : piStartForReportDate(normalizedPreviousTo, previousFrom);

      if (!enableComparison) {
        setEnableComparison(true);
      }
      if (!isCurrentRangeEditable && currentFrom !== nextCurrentFrom) {
        setCurrentFrom(nextCurrentFrom);
      }
      if (!isPreviousRangeEditable && previousFrom !== nextPreviousFrom) {
        setPreviousFrom(nextPreviousFrom);
      }
      if (currentTo !== normalizedCurrentTo) {
        setCurrentTo(normalizedCurrentTo);
      }
      if (previousTo !== normalizedPreviousTo) {
        setPreviousTo(normalizedPreviousTo);
      }
    }
  }, [dateFilterMode, enableComparison, currentFrom, currentTo, previousFrom, previousTo, isCurrentRangeEditable, isPreviousRangeEditable]);

  useEffect(() => {
    if (dateFilterMode === 'sprint' && selectedSprint !== 'All') {
      const sprint = SPRINT_OPTIONS.find(s => s.value === selectedSprint);
      if (sprint) {
        setCurrentFrom(sprint.startDate);
        setCurrentTo(sprint.endDate);
      }
    }
  }, [selectedSprint, dateFilterMode]);

  // Handle comparison sprint selection
  // Update comparison dates when comparison sprint is selected in sprint mode
  useEffect(() => {
    if (enableComparison && dateFilterMode === 'sprint' && comparisonSprint !== 'All') {
      const sprint = SPRINT_OPTIONS.find(s => s.value === comparisonSprint);
      if (sprint) {
        setPreviousFrom(sprint.startDate);
        setPreviousTo(sprint.endDate);
      }
    }
  }, [comparisonSprint, enableComparison, dateFilterMode]);

  // When portfolio changes, update project key options
  useEffect(() => {
    if (selectedPortfolios.length > 0) {
      updateDropdownOptions(selectedPortfolios);
    } else if (selectedPortfolio && selectedPortfolio !== 'All') {
      updateDropdownOptions([selectedPortfolio]);
    } else {
      updateDropdownOptions();
    }
    // Reset project filters on portfolio change
    setSelectedProjectKey('All');
    setSelectedProjectName('All');
    setSelectedProjectKeys([]);
    setSelectedProjectNames([]);
    setUseMultiSelect(false);
  }, [selectedPortfolio, selectedPortfolios, projectCatalog]);

  // Helper: Find matching Jira project name for a project key.
  const findProjectNameForKey = (key: string): string | null => {
    if (!key || key === 'All') return null;
    return options.projectKeyToName[key] || null;
  };

  // Helper: Find matching project names for multiple keys
  const findProjectNamesForKeys = (keys: string[]): string[] => {
    const names: string[] = [];
    keys.forEach(key => {
      const name = findProjectNameForKey(key);
      if (name && !names.includes(name)) {
        names.push(name);
      }
    });
    return names;
  };

  // Auto-select project name when project key changes
  useEffect(() => {
    if (selectedProjectKey && selectedProjectKey !== 'All' && !useMultiSelect) {
      const matchingName = findProjectNameForKey(selectedProjectKey);
      if (matchingName) {
        setSelectedProjectName(matchingName);
      } else {
        // If no match found, keep current selection or set to 'All'
        // Don't force a selection if we can't find a match
        if (selectedProjectName === 'All' || !options.project_names.includes(selectedProjectName)) {
          // Only reset if current selection doesn't make sense
        }
      }
    } else if (selectedProjectKey === 'All' && !useMultiSelect) {
      setSelectedProjectName('All');
    }
  }, [selectedProjectKey, options.project_names]);

  const handleMetricChange = (value: string) => {
    if (value === 'all') {
      setSelectedMetric('all');
      setUseMetricMultiSelect(false);
      setSelectedMetrics([]);
    } else {
      const option = VISIBLE_METRIC_OPTIONS.find(item => item.value === value);
      if (option && !option.disabled) {
        setSelectedMetric(option.value);
        setUseMetricMultiSelect(false);
        setSelectedMetrics([]);
      }
    }
  };

  // Metric multi-select functions
  const toggleMetric = (metric: string) => {
    if (metric === 'all') return;
    setTempSelectedMetrics(prev =>
      prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
    );
  };

  const selectAllMetrics = () => {
    const allMetrics = VISIBLE_METRIC_OPTIONS.filter(m => !m.disabled).map(m => m.value);
    setTempSelectedMetrics(allMetrics);
  };

  const clearMetricMultiSelect = () => {
    setTempSelectedMetrics([]);
  };

  const applyMetricMultiSelect = () => {
    setMetricSearch('');
    const visibleTempMetrics = onlyVisibleTcoeMetrics(tempSelectedMetrics);
    if (visibleTempMetrics.length > 0) {
      setSelectedMetrics(visibleTempMetrics);
      setUseMetricMultiSelect(true);
      setSelectedMetric('all'); // Reset single select
    } else {
      setSelectedMetrics([]);
      setUseMetricMultiSelect(false);
    }
    setMetricMultiSelectOpen(false);
  };

  const cancelMetricMultiSelect = () => {
    setTempSelectedMetrics(onlyVisibleTcoeMetrics(selectedMetrics));
    setMetricMultiSelectOpen(false);
    setMetricSearch('');
  };

  // Toggle project key in multi-select - work with temporary selections
  const toggleProjectKey = (key: string) => {
    if (key === 'All') return;
    setTempSelectedProjectKeys(prev => {
      return prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
    });
  };

  // Select all project keys - work with temporary selections
  const selectAllProjectKeys = () => {
    const allKeys = options.project_keys.filter(k => k !== 'All');
    setTempSelectedProjectKeys(allKeys);
  };

  // Clear multi-select - clear temporary selections
  const clearMultiSelect = () => {
    setTempSelectedProjectKeys([]);
  };

  // Apply multi-select - apply temporary selections
  const applyMultiSelect = () => {
    setProjectSearch('');
    if (tempSelectedProjectKeys.length > 0) {
      setSelectedProjectKeys([...tempSelectedProjectKeys]); // Apply temporary selections
      setUseMultiSelect(true);
      setSelectedProjectKey('All'); // Reset single select
      // Set display project name based on multi-selection
      const tempNames = tempSelectedProjectKeys.map(key => findProjectNameForKey(key)).filter((name): name is string => name !== null);
      if (tempNames.length === 1) {
        setSelectedProjectName(tempNames[0]);
      } else if (tempNames.length > 1) {
        setSelectedProjectName('All'); // Show "All" when multiple selected
      }
    } else {
      // If no selections, clear everything
      setSelectedProjectKeys([]);
      setUseMultiSelect(false);
    }
    setMultiSelectOpen(false);
  };

  // Cancel multi-select - reset temporary selections to current applied
  const cancelMultiSelect = () => {
    setTempSelectedProjectKeys([...selectedProjectKeys]); // Reset to current applied selections
    setMultiSelectOpen(false);
    setProjectSearch('');
  };

  // Portfolio multi-select functions - work with temporary selections
  const togglePortfolio = (portfolio: string) => {
    if (portfolio === 'All') return;
    setTempSelectedPortfolios(prev =>
      prev.includes(portfolio) ? prev.filter(p => p !== portfolio) : [...prev, portfolio]
    );
  };

  const selectAllPortfolios = () => {
    const allPortfolios = options.portfolios.filter(p => p !== 'All');
    setTempSelectedPortfolios(allPortfolios);
  };

  const clearPortfolioMultiSelect = () => {
    setTempSelectedPortfolios([]);
  };

  const applyPortfolioMultiSelect = () => {
    setPortfolioSearch('');
    if (tempSelectedPortfolios.length > 0) {
      setSelectedPortfolios([...tempSelectedPortfolios]); // Apply temporary selections
      setUsePortfolioMultiSelect(true);
      setSelectedPortfolio('All');
    } else {
      // If no selections, clear everything
      setSelectedPortfolios([]);
      setUsePortfolioMultiSelect(false);
    }
    setPortfolioMultiSelectOpen(false);
  };

  // Cancel portfolio multi-select - reset temporary selections to current applied
  const cancelPortfolioMultiSelect = () => {
    setTempSelectedPortfolios([...selectedPortfolios]); // Reset to current applied selections
    setPortfolioMultiSelectOpen(false);
    setPortfolioSearch('');
  };

  const analyzeLeakage = async () => {
    if (catalogLoading || catalogError || projectCatalog.length === 0) {
      setError(catalogError || 'QCOE projects are still loading from Jira.');
      return;
    }
    const startTime = Date.now();
    setLoading(true);
    setError(null);
    setWarning(null);  // Clear any previous warning
    setWarningDetails([]);
    setWarningExpanded(false);
    setAnalysis(null);
    setRows(null);
    setRawRows(null);
    setDebugBreakdown(null);
    setReportGenerationTime(null);
    persistReportSnapshot('processing', { startedAt: startTime });

    const stopWithError = (message: string) => {
      setError(message);
      persistReportSnapshot('failed', { error: message, startedAt: startTime });
      setLoading(false);
    };

    try {
      // STEP 1: Determine which portfolios to use for mapping
      let portfoliosForMapping: string[] = [];

      if (selectedPortfolios.length > 0) {
        // User selected specific portfolios via multi-select
        portfoliosForMapping = selectedPortfolios;
      } else if (selectedPortfolio && selectedPortfolio !== 'All') {
        // User selected a single portfolio
        portfoliosForMapping = [selectedPortfolio];
      }
      // If no portfolios selected (All), portfoliosForMapping stays empty and we'll use all

      // STEP 2: Build the selected mapping from the Jira project catalog.
      console.log('📋 Getting portfolio mapping for:', portfoliosForMapping.length > 0 ? portfoliosForMapping : 'ALL');
      const portfolioMapping = buildPortfolioMapping(portfoliosForMapping.length > 0 ? portfoliosForMapping : undefined);
      console.log('📋 Portfolio mapping ready:', portfolioMapping);

      console.log('🔍 Analyzing defect leakage...', {
        portfolio: selectedPortfolio,
        portfolios_multi: selectedPortfolios,
        project_key: selectedProjectKey,
        project_name: selectedProjectName,
        multi_select: useMultiSelect,
        selected_keys: selectedProjectKeys,
        aggregate: aggregateByPortfolio,
        mapping: portfolioMapping,
      });

      // Determine which project keys to run
      let projectsToRun: string[] = [];

      if (useMultiSelect && selectedProjectKeys.length > 0) {
        // Use multi-selected keys
        projectsToRun = selectedProjectKeys;
      } else if (selectedProjectKey === 'All') {
        // Run for all project keys (excluding 'All' itself)
        projectsToRun = options.project_keys.filter(k => k && k !== 'All');
      } else if (selectedProjectKey && selectedProjectKey !== 'All') {
        // Single project key selected
        projectsToRun = [selectedProjectKey];
      }

      if (!projectsToRun.length) {
        stopWithError('No project keys available for the selected filters.');
        return;
      }

      let currentPIWindow: PIDateWindow;
      let previousPIWindow: PIDateWindow | null = null;
      try {
        currentPIWindow = buildPIDateWindow(currentTo);
        previousPIWindow = enableComparison ? buildPIDateWindow(previousTo) : null;
      } catch (piError) {
        stopWithError(piError instanceof Error ? piError.message : 'Selected report date is outside the configured PI calendar.');
        return;
      }

      const comparisonPIResult = enableComparison && previousPIWindow
        ? compareMetricByDate(currentTo, previousTo)
        : null;
      const currentUsesCustomStart = dateFilterMode === 'custom' || isCurrentRangeEditable;
      const previousUsesCustomStart = dateFilterMode === 'custom' || isPreviousRangeEditable;
      const useCustomDateRange = currentUsesCustomStart || (enableComparison && previousUsesCustomStart);
      const previousBaseWindow = comparisonPIResult?.previous || previousPIWindow;
      const currentBaseWindow = comparisonPIResult?.current || currentPIWindow;
      const currentWindow = {
        ...currentBaseWindow,
        piStartDate: currentUsesCustomStart ? currentFrom : currentBaseWindow.piStartDate,
        dateFrom: currentUsesCustomStart ? currentFrom : currentBaseWindow.piStartDate,
      };
      const previousWindow = previousBaseWindow
        ? {
            ...previousBaseWindow,
            piStartDate: previousUsesCustomStart ? previousFrom : previousBaseWindow.piStartDate,
            dateFrom: previousUsesCustomStart ? previousFrom : previousBaseWindow.piStartDate,
          }
        : null;

      if (currentWindow.piStartDate > currentWindow.reportDate) {
        stopWithError('Current period start date cannot be after the selected week ending date.');
        return;
      }
      if (enableComparison && previousWindow && previousWindow.piStartDate > previousWindow.reportDate) {
        stopWithError('Comparison period start date cannot be after the selected week ending date.');
        return;
      }

      // Helper to build payload - project key and metric are passed here
        const payload = (projectKey: string, metric: string) => {
          // All new metrics use period-based payload
          const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];

          if (periodBasedMetrics.includes(metric)) {
            // For period-based metrics, check if comparison is enabled
            if (enableComparison) {
              // Comparison mode - use period1 and period2
              return {
                portfolio: projectKey,
                period1_from: previousWindow?.piStartDate || previousFrom,
                period1_to: previousWindow?.reportDate || previousTo,
                period2_from: currentWindow.piStartDate,
                period2_to: currentWindow.reportDate,
                enable_comparison: true,
                metric: metric,
                pi_context: currentWindow.piContext,
                previous_pi_context: previousWindow?.piContext,
                comparison_note: comparisonPIResult?.comparisonNote || undefined,
                use_custom_date_range: useCustomDateRange,
              };
            } else {
              // Single period mode - only use current period
              return {
                portfolio: projectKey,
                period_from: currentWindow.piStartDate,
                period_to: currentWindow.reportDate,
                enable_comparison: false,
                metric: metric,
                pi_context: currentWindow.piContext,
                use_custom_date_range: useCustomDateRange,
              };
            }
          } else {
            // Defect leakage supports both single-period and comparison modes
            if (enableComparison) {
              return {
                portfolio: projectKey,
                current_week_from: currentWindow.piStartDate,
                current_week_to: currentWindow.reportDate,
                previous_week_from: previousWindow?.piStartDate || previousFrom,
                previous_week_to: previousWindow?.reportDate || previousTo,
                enable_comparison: true,
                metric: metric,
                pi_context: currentWindow.piContext,
                previous_pi_context: previousWindow?.piContext,
                comparison_note: comparisonPIResult?.comparisonNote || undefined,
                use_custom_date_range: useCustomDateRange,
              };
            }

            return {
              portfolio: projectKey,
              date_from: currentWindow.piStartDate,
              date_to: currentWindow.reportDate,
              enable_comparison: false,
              metric: metric,
              pi_context: currentWindow.piContext,
              use_custom_date_range: useCustomDateRange,
            };
          }
        };

      // Determine which metrics to analyze
      let metricsToAnalyze: string[] = [];
      if (useMetricMultiSelect && onlyVisibleTcoeMetrics(selectedMetrics).length > 0) {
        metricsToAnalyze = onlyVisibleTcoeMetrics(selectedMetrics);
      } else if (selectedMetric === 'all') {
        // Get all enabled metrics
        metricsToAnalyze = VISIBLE_METRIC_OPTIONS.filter(opt => !opt.disabled).map(opt => opt.value);
      } else {
        metricsToAnalyze = HIDDEN_TCOE_METRIC_VALUES.has(selectedMetric) ? [defaultMetric.value] : [selectedMetric];
      }

      // Helper function to analyze a single metric
      const analyzeSingleMetric = async (metric: string): Promise<Analysis[]> => {
        const metricOption = METRIC_OPTIONS.find(opt => opt.value === metric);
        const apiEndpoint = metric === 'regression_automation'
          ? '/api/quality/regression-automation-analysis'
          : metric === 'overall_automation'
          ? '/api/quality/overall-automation-analysis'
          : metric === 'test_coverage'
          ? '/api/quality/test-coverage-analysis'
          : metric === 'test_story_ratio'
          ? '/api/quality/test-story-ratio-analysis'
          : metric === 'bug_ratio'
          ? '/api/quality/bug-ratio-analysis'
          : metric === 'test_review_status'
          ? '/api/quality/test-case-review-status-analysis'
          : metric === 'defect_leakage' && !enableComparison
          ? '/api/quality/analyze-single-week'
          : '/api/quality/defect-leakage-analysis';

        if (projectsToRun.length > 1) {
          // Multi-project case - use background jobs so processing continues even if user navigates away

          // SPECIAL HANDLING FOR TEST_REVIEW_STATUS: Send all projects together for portfolio grouping
          if (metric === 'test_review_status') {
            // Build consolidated payload with all projects as an array
            const consolidatedPayload = {
              projects: projectsToRun,  // Send all projects together!
              period1_from: previousWindow?.piStartDate || previousFrom,
              period1_to: previousWindow?.reportDate || previousTo,
              period2_from: currentWindow.piStartDate,
              period2_to: currentWindow.reportDate,
              enable_comparison: enableComparison,
              metric: metric,
              pi_context: currentWindow.piContext,
              previous_pi_context: previousWindow?.piContext,
              comparison_note: comparisonPIResult?.comparisonNote || undefined,
              use_custom_date_range: useCustomDateRange,
            };

            // Start single background job for all projects
            const jobResponse = await fetch(getApiUrl('/api/quality/tcoe-report-background'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(consolidatedPayload)
            });

            if (!jobResponse.ok) {
              throw new Error('Failed to start portfolio group analysis job');
            }

            const jobData = await jobResponse.json();
            const jobId = jobData.job_id;

            // Store only small resume metadata; full results are fetched by the tracker.
            jobTracker.trackJobMetadata({
              job_id: jobId,
              status: 'pending',
              projects: projectsToRun,
              metric: metric,
              created_at: new Date().toISOString()
            });

            // Poll for job completion
            return new Promise<Analysis[]>((resolve, reject) => {
              jobTracker.startJob(jobId, (status: any) => {
                if (status.status === 'completed' && status.result) {
                  const res = status.result;
                  const analysisPayload =
                    res?.analysis?.analyses || res?.analysis?.grand_total
                      ? res.analysis
                      : res?.analysis?.analysis?.analyses || res?.analysis?.analysis?.grand_total
                      ? res.analysis.analysis
                      : res?.analyses || res?.grand_total
                      ? res
                      : null;

                  console.log('📊 Portfolio group response received:', JSON.stringify(res, null, 2));

                  if (res.success && analysisPayload) {
                    // Parse portfolio group response (new format)
                    if (analysisPayload.analyses && Array.isArray(analysisPayload.analyses)) {
                      console.log('Portfolio group analyses:', analysisPayload.analyses);

                      // Portfolio groups response
                      const builtRows: Analysis[] = analysisPayload.analyses.map((portfolioGroup: any) => {
                        console.log(`📦 Mapping portfolio ${portfolioGroup.portfolio}:`, portfolioGroup);
                        console.log(`   period1_reviewed_yes: ${portfolioGroup.period1_reviewed_yes}, period1_total: ${portfolioGroup.period1_total}`);
                        console.log(`   period2_reviewed_yes: ${portfolioGroup.period2_reviewed_yes}, period2_total: ${portfolioGroup.period2_total}`);
                        console.log(`   period1_percentage: ${portfolioGroup.period1_percentage}, period2_percentage: ${portfolioGroup.period2_percentage}`);

                        const mappedRow = {
                          portfolio: portfolioGroup.portfolio,
                          projects: portfolioGroup.projects || [],
                          project_filter: portfolioGroup.project_filter,
                          progress: {
                            percentage_change: portfolioGroup.progress || 0,
                            wow_progress_pct: portfolioGroup.progress || 0,
                            new_reviewed: (portfolioGroup.period2_reviewed_yes || 0) - (portfolioGroup.period1_reviewed_yes || 0),
                            trend: (portfolioGroup.progress || 0) > 0 ? 'improving' : (portfolioGroup.progress || 0) < 0 ? 'declining' : 'stable'
                          },
                          ai_analysis: portfolioGroup.ai_analysis,
                          jql_queries: portfolioGroup.jql_queries || [],
                          projects_count: portfolioGroup.projects_count,
                          concerning_areas: portfolioGroup.concerning_areas,
                          on_track_areas: portfolioGroup.on_track_areas,
                          project_breakdown: portfolioGroup.project_breakdown,
                          ai_insights: portfolioGroup.ai_analysis || '',
                          // Map to nested structure expected by UI
                          period1: {
                            from: previousWindow?.piStartDate || previousFrom,
                            to: previousWindow?.reportDate || previousTo,
                            pi_context: previousWindow?.piContext,
                            review_percentage: portfolioGroup.period1_percentage || 0,
                            reviewed_yes: portfolioGroup.period1_reviewed_yes || 0,
                            reviewed_no: 0,
                            not_set: portfolioGroup.period1_total ? (portfolioGroup.period1_total - (portfolioGroup.period1_reviewed_yes || 0)) : 0,
                            jql_queries: (portfolioGroup.jql_queries || []).slice(0, 2)
                          },
                          period2: {
                            from: currentWindow.piStartDate,
                            to: currentWindow.reportDate,
                            pi_context: currentWindow.piContext,
                            review_percentage: portfolioGroup.period2_percentage || 0,
                            reviewed_yes: portfolioGroup.period2_reviewed_yes || 0,
                            reviewed_no: 0,
                            not_set: portfolioGroup.period2_total ? (portfolioGroup.period2_total - (portfolioGroup.period2_reviewed_yes || 0)) : 0,
                            jql_queries: (portfolioGroup.jql_queries || []).slice(2)
                          },
                          total_stories: portfolioGroup.period2_total || 0,
                          metric: metric,
                          metric_label: metricOption?.label || 'Test Case Review Status',
                          pi_context: currentWindow.piContext,
                          previous_pi_context: previousWindow?.piContext,
                          comparison_note: comparisonPIResult?.comparisonNote || undefined,
                          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' },
                          generated_at: new Date().toISOString()
                        };

                        console.log(`   ✅ Mapped row period1:`, mappedRow.period1);
                        console.log(`   ✅ Mapped row period2:`, mappedRow.period2);
                        console.log(`   ✅ Mapped row total_stories:`, mappedRow.total_stories);

                        return mappedRow;
                      });

                      console.log('✅ Built rows from portfolio groups:', builtRows);

                      // Add grand total as a separate row if it exists
                      if (analysisPayload.grand_total) {
                        console.log('Adding grand total:', analysisPayload.grand_total);
                        const grandProgress = analysisPayload.grand_total.progress || 0;
                        builtRows.push({
                          portfolio: 'Grand Total',
                          progress: {
                            percentage_change: grandProgress,
                            wow_progress_pct: grandProgress,
                            new_reviewed: (analysisPayload.grand_total.reviewed_yes_p2 || 0) - (analysisPayload.grand_total.reviewed_yes_p1 || 0),
                            trend: grandProgress > 0 ? 'improving' : grandProgress < 0 ? 'declining' : 'stable'
                          },
                          ai_analysis: analysisPayload.grand_total.ai_analysis,
                          total_projects: analysisPayload.grand_total.total_projects,
                          reviewed_yes_p1: analysisPayload.grand_total.reviewed_yes_p1,
                          total_stories_p1: analysisPayload.grand_total.total_stories_p1,
                          reviewed_yes_p2: analysisPayload.grand_total.reviewed_yes_p2,
                          total_stories_p2: analysisPayload.grand_total.total_stories_p2,
                          concerning_portfolios: analysisPayload.grand_total.concerning_portfolios,
                          improving_portfolios: analysisPayload.grand_total.improving_portfolios,
                          jql_queries: analysisPayload.grand_total.jql_queries || [],
                          // Map to nested structure expected by UI
                          period1: {
                            from: previousWindow?.piStartDate || previousFrom,
                            to: previousWindow?.reportDate || previousTo,
                            pi_context: previousWindow?.piContext,
                            review_percentage: analysisPayload.grand_total.period1_percentage,
                            reviewed_yes: analysisPayload.grand_total.reviewed_yes_p1 || 0,
                            reviewed_no: 0,
                            not_set: analysisPayload.grand_total.total_stories_p1 ? (analysisPayload.grand_total.total_stories_p1 - analysisPayload.grand_total.reviewed_yes_p1) : 0
                          },
                          period2: {
                            from: currentWindow.piStartDate,
                            to: currentWindow.reportDate,
                            pi_context: currentWindow.piContext,
                            review_percentage: analysisPayload.grand_total.period2_percentage,
                            reviewed_yes: analysisPayload.grand_total.reviewed_yes_p2 || 0,
                            reviewed_no: 0,
                            not_set: analysisPayload.grand_total.total_stories_p2 ? (analysisPayload.grand_total.total_stories_p2 - analysisPayload.grand_total.reviewed_yes_p2) : 0
                          },
                          total_stories: analysisPayload.grand_total.total_stories_p2 || 0,
                          metric: metric,
                          metric_label: 'Grand Total',
                          pi_context: currentWindow.piContext,
                          previous_pi_context: previousWindow?.piContext,
                          comparison_note: comparisonPIResult?.comparisonNote || undefined,
                          ai_insights: analysisPayload.grand_total.ai_analysis || '',
                          generated_at: new Date().toISOString(),
                          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
                        });
                      }

                      resolve(builtRows);
                    } else {
                      // Fallback to single response format (shouldn't happen but just in case)
                      resolve([{
                        ...analysisPayload,
                        metric: metric,
                        metric_label: metricOption?.label || 'Test Case Review Status',
                        pi_context: analysisPayload?.pi_context || currentWindow.piContext,
                        previous_pi_context: analysisPayload?.previous_pi_context || previousWindow?.piContext,
                        comparison_note: analysisPayload?.comparison_note || comparisonPIResult?.comparisonNote || undefined,
                        generated_at: new Date().toISOString()
                      }]);
                    }
                  } else {
                    reject(new Error('Invalid response format'));
                  }
                } else if (status.status === 'failed') {
                  reject(new Error(status.error || 'Portfolio group analysis failed'));
                }
              });
            });
          }

          // For other metrics, use individual project requests
          const jobPromises = projectsToRun.map(async (pk) => {
            const requestPayload = payload(pk, metric);
            requestPayload.metric = metric; // Ensure metric is included

            // Start background job
            const jobResponse = await fetch(getApiUrl('/api/quality/tcoe-report-background'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestPayload)
            });

            if (!jobResponse.ok) {
              throw new Error(`Failed to start background job for ${pk}`);
            }

            const jobData = await jobResponse.json();
            const jobId = jobData.job_id;

            // Store only small resume metadata; full results are fetched by the tracker.
            jobTracker.trackJobMetadata({
              job_id: jobId,
              status: 'pending',
              project_key: pk,
              metric: metric,
              created_at: new Date().toISOString()
            });

            // Poll for job completion - this will continue even if component unmounts
            return new Promise<{ res: any; pk: string }>((resolve, reject) => {
              jobTracker.startJob(jobId, (status: any) => {
                if (status.status === 'completed' && status.result) {
                  resolve({ res: status.result, pk });
                } else if (status.status === 'failed') {
                  reject(new Error(status.error || 'Job failed'));
                }
              });
            });
          });

          const responses = await Promise.all(jobPromises);

          const builtRows: Analysis[] = responses
            .map(({ res, pk }) => ({ res, pk }))
            .filter(({ res }) => res?.success)
            .map(({ res, pk }) => {
              const projectName = options.project_names.find(n => n.includes(pk)) || pk;
              // Use the portfolioMapping we built at the start (guaranteed to be ready)
              const actualPortfolio = portfolioMapping[pk] || res.analysis?.portfolio || 'Unknown';
              console.log(`🔗 Project ${pk} → Portfolio: ${actualPortfolio}`);

              // Map period-based metrics response to Analysis format
              const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
              if (periodBasedMetrics.includes(metric) && res.analysis) {
                console.log(`📊 ${metricOption?.label} Response for ${pk}:`, res.analysis);
                console.log(`📊 Period data:`, { period: res.analysis.period, period1: res.analysis.period1, period2: res.analysis.period2 });
                // Preserve all data from backend response, then add frontend-specific fields
                const mappedRow = {
                  ...res.analysis, // Spread all backend data first
                  portfolio: res.analysis.portfolio || pk,
                  project_key: pk,
                  project_label: projectName,
                  portfolio_display: actualPortfolio,
                  metric: metric,
                  metric_label: metricOption?.label || 'Metric',
                  pi_context: res.analysis?.pi_context || currentWindow.piContext,
                  previous_pi_context: res.analysis?.previous_pi_context || previousWindow?.piContext,
                  comparison_note: res.analysis?.comparison_note || comparisonPIResult?.comparisonNote || undefined,
                  // Ensure these fields are set (may already be in res.analysis)
                  total_regression_tests: res.analysis.total_regression_tests || res.analysis.total_test_cases || 0,
                  total_test_cases: res.analysis.total_test_cases || res.analysis.total_regression_tests || 0,
                  total_stories: res.analysis.total_stories || 0,
                  period1: res.analysis.period1, // Only present if comparison enabled
                  period2: res.analysis.period2, // Only present if comparison enabled
                  period: res.analysis.period, // Only present if single period mode
                  progress: res.analysis.progress, // Only present if comparison enabled
                  ai_analysis: res.analysis.ai_analysis || '',
                  ai_insights: res.analysis.ai_analysis || res.analysis.ai_insights || '',
                  generated_at: res.analysis.generated_at || new Date().toISOString(),
                  // Dummy fields for compatibility (only if not already present)
                  current_week: res.analysis.current_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                  previous_week: res.analysis.previous_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                  comparison: res.analysis.comparison || { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
                } as Analysis;
                console.log(`📊 Mapped row for ${pk}:`, {
                  total_stories: mappedRow.total_stories,
                  period: mappedRow.period,
                  period1: mappedRow.period1,
                  period2: mappedRow.period2
                });
                console.log(`✅ Mapped row for ${pk}:`, {
                  total_regression_tests: mappedRow.total_regression_tests,
                  total_test_cases: mappedRow.total_test_cases,
                  period: mappedRow.period,
                  period1: mappedRow.period1,
                  period2: mappedRow.period2
                });
                return mappedRow;
              } else {
                return {
                  ...res.analysis,
                  project_key: pk,
                  project_label: projectName,
                  portfolio_display: actualPortfolio,
                  metric: metric,
                  metric_label: metricOption?.label || 'Defect Leakage Rate',
                  pi_context: res.analysis?.pi_context || currentWindow.piContext,
                  previous_pi_context: res.analysis?.previous_pi_context || previousWindow?.piContext,
                  comparison_note: res.analysis?.comparison_note || comparisonPIResult?.comparisonNote || undefined
                } as Analysis;
              }
            });

          return builtRows;
        } else {
          // Single project key case
          const pk = projectsToRun[0];
          const response = await fetch(getApiUrl(apiEndpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload(pk, metric))
          });
          const data = await response.json();
          if (data.success) {
            const projectName = options.project_names.find(n => n.includes(pk)) || pk;
            // Use the portfolioMapping we built at the start
            const actualPortfolio = portfolioMapping[pk] || data.analysis?.portfolio || 'Unknown';
            console.log(`🔗 Single project ${pk} → Portfolio: ${actualPortfolio}`);

            // Map period-based metrics response to Analysis format
            const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
            if (periodBasedMetrics.includes(metric) && data.analysis) {
              console.log(`📊 Single ${metricOption?.label} Response for ${pk}:`, data.analysis);
              console.log(`📊 Period data:`, { period: data.analysis.period, period1: data.analysis.period1, period2: data.analysis.period2 });
              // Preserve all data from backend response, then add frontend-specific fields
              const mappedAnalysis = {
                ...data.analysis, // Spread all backend data first
                portfolio: data.analysis.portfolio || pk,
                project_key: pk,
                project_label: projectName,
                portfolio_display: actualPortfolio,
                metric: metric,
                metric_label: metricOption?.label || 'Metric',
                pi_context: data.analysis?.pi_context || currentWindow.piContext,
                previous_pi_context: data.analysis?.previous_pi_context || previousWindow?.piContext,
                comparison_note: data.analysis?.comparison_note || comparisonPIResult?.comparisonNote || undefined,
                // Ensure these fields are set (may already be in data.analysis)
                total_regression_tests: data.analysis.total_regression_tests || data.analysis.total_test_cases || 0,
                total_test_cases: data.analysis.total_test_cases || data.analysis.total_regression_tests || 0,
                total_stories: data.analysis.total_stories || 0,
                period1: data.analysis.period1, // Only present if comparison enabled
                period2: data.analysis.period2, // Only present if comparison enabled
                period: data.analysis.period, // Only present if single period mode
                progress: data.analysis.progress, // Only present if comparison enabled
                ai_analysis: data.analysis.ai_analysis || '',
                ai_insights: data.analysis.ai_analysis || data.analysis.ai_insights || '',
                generated_at: data.analysis.generated_at || new Date().toISOString(),
                // Dummy fields for compatibility (only if not already present)
                current_week: data.analysis.current_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                previous_week: data.analysis.previous_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                comparison: data.analysis.comparison || { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
              } as Analysis;
              console.log(`📊 Mapped analysis for ${pk}:`, {
                total_stories: mappedAnalysis.total_stories,
                period: mappedAnalysis.period,
                period1: mappedAnalysis.period1,
                period2: mappedAnalysis.period2
              });
              return [mappedAnalysis];
            } else {
              return [{
                ...data.analysis,
                project_key: pk,
                project_label: projectName,
                portfolio_display: actualPortfolio,
                metric: metric,
                metric_label: metricOption?.label || 'Defect Leakage Rate',
                pi_context: data.analysis?.pi_context || currentWindow.piContext,
                previous_pi_context: data.analysis?.previous_pi_context || previousWindow?.piContext,
                comparison_note: data.analysis?.comparison_note || comparisonPIResult?.comparisonNote || undefined
              } as Analysis];
            }
          } else {
            throw new Error(data.error || 'Analysis failed');
          }
        }
      };

      // Analyze all metrics
      const allResults: Analysis[] = [];
      const metricErrors: string[] = [];
      for (const metric of metricsToAnalyze) {
        try {
          const metricResults = await analyzeSingleMetric(metric);
          allResults.push(...metricResults);
        } catch (error) {
          console.error(`❌ Failed to analyze metric ${metric}:`, error);
          const metricLabel = METRIC_OPTIONS.find(opt => opt.value === metric)?.label || metric;
          const message = error instanceof Error ? error.message : 'Unknown error';
          metricErrors.push(`${metricLabel}: ${message}`);
          // Continue with other metrics even if one fails
        }
      }

      // Filter out rows with has_data === false (portfolios with no valid projects)
      // and collect warnings from them
      const portfolioWarnings: string[] = [];
      const warningGroups = new Map<string, Set<string>>();
      const addWarningProjects = (portfolioName: string, projects: string[]) => {
        const normalizedPortfolio = portfolioName || 'Unknown';
        if (!warningGroups.has(normalizedPortfolio)) {
          warningGroups.set(normalizedPortfolio, new Set<string>());
        }
        const projectSet = warningGroups.get(normalizedPortfolio)!;
        projects.filter(Boolean).forEach((project) => projectSet.add(project));
      };

      const validResults = allResults.filter(row => {
        const rowAny = row as any;
        if (rowAny.has_data === false) {
          const warning = rowAny.warning || `No valid projects found for portfolio '${rowAny.portfolio || 'Unknown'}'`;
          if (!portfolioWarnings.includes(warning)) {
            portfolioWarnings.push(warning);
          }

          const groupedDetails = Array.isArray(rowAny.invalid_projects_by_portfolio)
            ? rowAny.invalid_projects_by_portfolio
            : [];
          if (groupedDetails.length > 0) {
            groupedDetails.forEach((group: any) => {
              const projects = Array.isArray(group?.projects) ? group.projects : [];
              addWarningProjects(group?.portfolio || rowAny.portfolio_display || rowAny.portfolio || 'Unknown', projects);
            });
          } else {
            const fallbackPortfolio = rowAny.portfolio_display || rowAny.portfolio || 'Unknown';
            const fallbackProjects = Array.isArray(rowAny.invalid_projects) && rowAny.invalid_projects.length > 0
              ? rowAny.invalid_projects
              : [rowAny.project_key || rowAny.portfolio || 'Unknown'];
            addWarningProjects(fallbackPortfolio, fallbackProjects);
          }

          console.warn(`⚠️ Filtering out row with no data: ${warning}`);
          return false;
        }
        return true;
      });

      const warningDetailsList: InvalidProjectWarningGroup[] = Array.from(warningGroups.entries())
        .map(([portfolio, projects]) => ({ portfolio, projects: Array.from(projects).sort() }))
        .sort((a, b) => a.portfolio.localeCompare(b.portfolio));

      // Log warnings for portfolios with no valid projects
      if (portfolioWarnings.length > 0) {
        console.warn(`⚠️ Portfolios with no valid projects:`, portfolioWarnings);
      }

      if (validResults.length === 0) {
        const warningMessage = portfolioWarnings.length > 0 
          ? portfolioWarnings.join(' | ')
          : '';
        const message = metricErrors.length > 0
          ? `No results obtained for any metric. ${metricErrors.join(' | ')}${warningMessage ? ' | ' + warningMessage : ''}`
          : (warningMessage || 'No results obtained for any metric.');
        stopWithError(message);
        return;
      }

      // If we have valid results but also warnings, show the warning banner
      if (portfolioWarnings.length > 0) {
        setWarning('Some projects were not found in Jira and were skipped.');
        setWarningDetails(warningDetailsList);
        setWarningExpanded(false);
      }

      // Use the filtered results (valid rows only)
      const builtRows = validResults;

      // Aggregation helper
      const aggregateRows = (rowsToAgg: Analysis[], portfolioName: string, projectKeys: string[]): Analysis => {
        const base: any = {
          portfolio: portfolioName,
          current_week: { bugs_count: 0, defects_count: 0, total_issues: 0, leakage_percentage: 0 },
          previous_week: { bugs_count: 0, defects_count: 0, total_issues: 0, leakage_percentage: 0 },
          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' },
          ai_insights: (rowsToAgg[0]?.ai_insights || ''),
          ai_metadata: rowsToAgg[0]?.ai_metadata,
          project_key: projectKeys.join(', '),
          project_label: `${rowsToAgg.length} projects combined`,
          portfolio_display: portfolioName,
          metric: rowsToAgg[0]?.metric,
          metric_label: rowsToAgg[0]?.metric_label,
          pi_context: rowsToAgg[0]?.pi_context || currentWindow.piContext,
          previous_pi_context: rowsToAgg[0]?.previous_pi_context || previousWindow?.piContext,
          comparison_note: rowsToAgg[0]?.comparison_note || comparisonPIResult?.comparisonNote || undefined
        };

        // Check metric type so we can aggregate correctly
        const metricKey = rowsToAgg[0]?.metric;
        const isAutomationMetric = metricKey === 'regression_automation' || metricKey === 'overall_automation';
        const isTestCoverageMetric = metricKey === 'test_coverage';
        const isTestStoryRatioMetric = metricKey === 'test_story_ratio';
        const isBugRatioMetric = metricKey === 'bug_ratio';
        const isTestReviewStatusMetric = metricKey === 'test_review_status';

        if (isAutomationMetric) {
          // Aggregate regression/overall automation fields
          base.total_regression_tests = 0;
          base.total_test_cases = 0;
          base.period = { from: '', to: '', automated_count: 0, manual_count: 0, automation_percentage: 0 };
          base.period1 = { from: '', to: '', automated_count: 0, manual_count: 0, automation_percentage: 0 };
          base.period2 = { from: '', to: '', automated_count: 0, manual_count: 0, automation_percentage: 0 };
          base.ai_analysis = '';
          base.ai_insights = '';

          // Combine AI analysis from all projects
          const aiAnalyses: string[] = [];

          rowsToAgg.forEach((row) => {
            // Sum total regression tests (for regression automation) or total test cases (for overall automation)
            base.total_regression_tests += row.total_regression_tests || row.total_test_cases || 0;
            base.total_test_cases += row.total_test_cases || row.total_regression_tests || 0;

            // Aggregate period data (single period mode)
            if (row.period) {
              base.period.automated_count += row.period.automated_count || 0;
              base.period.manual_count += row.period.manual_count || 0;
              if (!base.period.from) base.period.from = row.period.from || '';
              if (!base.period.to) base.period.to = row.period.to || '';
            }

            // Aggregate period1 data (comparison mode)
            if (row.period1) {
              base.period1.automated_count += row.period1.automated_count || 0;
              base.period1.manual_count += row.period1.manual_count || 0;
              if (!base.period1.from) base.period1.from = row.period1.from || '';
              if (!base.period1.to) base.period1.to = row.period1.to || '';
            }

            // Aggregate period2 data (comparison mode)
            if (row.period2) {
              base.period2.automated_count += row.period2.automated_count || 0;
              base.period2.manual_count += row.period2.manual_count || 0;
              if (!base.period2.from) base.period2.from = row.period2.from || '';
              if (!base.period2.to) base.period2.to = row.period2.to || '';
            }

            // Collect AI analyses
            if (row.ai_analysis) {
              aiAnalyses.push(row.ai_analysis);
            }
          });

          // Calculate aggregated percentages
          const totalCount = base.total_test_cases || base.total_regression_tests;
          if (totalCount > 0) {
            if (base.period.automated_count > 0 || base.period.manual_count > 0) {
              base.period.automation_percentage = (base.period.automated_count / totalCount) * 100;
            }
            if (base.period1.automated_count > 0 || base.period1.manual_count > 0) {
              base.period1.automation_percentage = (base.period1.automated_count / totalCount) * 100;
            }
            if (base.period2.automated_count > 0 || base.period2.manual_count > 0) {
              base.period2.automation_percentage = (base.period2.automated_count / totalCount) * 100;
            }
          }

          // Calculate progress (percentage change) for comparison mode
          if (!base.progress) {
            base.progress = { percentage_change: 0, new_automated_tests: 0, trend: 'stable' };
          }
          // Calculate percentage change if we have both periods
          if (base.period1 && base.period2 &&
              base.period1.automation_percentage !== undefined &&
              base.period2.automation_percentage !== undefined) {
            const p1Pct = base.period1.automation_percentage || 0;
            const p2Pct = base.period2.automation_percentage || 0;
            const deltaPct = p2Pct - p1Pct;
            base.progress.percentage_change = deltaPct;
            base.progress.new_automated_tests = (base.period2.automated_count || 0) - (base.period1.automated_count || 0);
            base.progress.trend = deltaPct > 0 ? 'improving' : deltaPct < 0 ? 'declining' : 'stable';
          }

          // Combine AI analyses
          base.ai_analysis = aiAnalyses.join('\n\n');
          base.ai_insights = base.ai_analysis;

          // Store individual project data for portfolio insights
          base._projectDetails = rowsToAgg.map(r => ({
            project_label: r.project_label || r.project_key || 'Unknown',
            project_key: r.project_key || '',
            period: r.period,
            period1: r.period1,
            period2: r.period2,
            total_regression_tests: r.total_regression_tests || r.total_test_cases || 0,
            total_test_cases: r.total_test_cases || r.total_regression_tests || 0
          }));
        } else {
          // New period-based metrics aggregation
          if (isTestCoverageMetric) {
            // Test Coverage: stories with tests / total stories
            base.total_stories = 0;
            base.total_test_cases = 0;
            base.period = { from: '', to: '', total_stories: 0, total_test_cases: 0, stories_with_tests: 0, stories_without_tests: 0, coverage_percentage: 0 };
            base.period1 = { from: '', to: '', total_stories: 0, total_test_cases: 0, stories_with_tests: 0, stories_without_tests: 0, coverage_percentage: 0 };
            base.period2 = { from: '', to: '', total_stories: 0, total_test_cases: 0, stories_with_tests: 0, stories_without_tests: 0, coverage_percentage: 0 };
            base.progress = { percentage_change: 0, new_stories_with_tests: 0, trend: 'stable' };
            const aiAnalyses: string[] = [];

            rowsToAgg.forEach((row) => {
              base.total_stories += row.total_stories || 0;
              base.total_test_cases += row.total_test_cases || 0;

              if (row.period) {
                base.period.total_stories += row.period.total_stories || ((row.period.stories_with_tests || 0) + (row.period.stories_without_tests || 0));
                base.period.total_test_cases += row.period.total_test_cases || 0;
                base.period.stories_with_tests += row.period.stories_with_tests || 0;
                base.period.stories_without_tests += row.period.stories_without_tests || 0;
                if (!base.period.from) base.period.from = row.period.from || '';
                if (!base.period.to) base.period.to = row.period.to || '';
              }

              if (row.period1) {
                base.period1.total_stories += row.period1.total_stories || ((row.period1.stories_with_tests || 0) + (row.period1.stories_without_tests || 0));
                base.period1.total_test_cases += row.period1.total_test_cases || 0;
                base.period1.stories_with_tests += row.period1.stories_with_tests || 0;
                base.period1.stories_without_tests += row.period1.stories_without_tests || 0;
                if (!base.period1.from) base.period1.from = row.period1.from || '';
                if (!base.period1.to) base.period1.to = row.period1.to || '';
              }

              if (row.period2) {
                base.period2.total_stories += row.period2.total_stories || ((row.period2.stories_with_tests || 0) + (row.period2.stories_without_tests || 0));
                base.period2.total_test_cases += row.period2.total_test_cases || 0;
                base.period2.stories_with_tests += row.period2.stories_with_tests || 0;
                base.period2.stories_without_tests += row.period2.stories_without_tests || 0;
                if (!base.period2.from) base.period2.from = row.period2.from || '';
                if (!base.period2.to) base.period2.to = row.period2.to || '';
              }

              if (row.progress) {
                base.progress.new_stories_with_tests += row.progress.new_stories_with_tests || 0;
              }

              if (row.ai_analysis) {
                aiAnalyses.push(row.ai_analysis);
              }
            });

            const totalStoriesCurrent = base.period.total_stories || base.period.stories_with_tests + base.period.stories_without_tests || base.total_stories || 0;
            if (totalStoriesCurrent > 0) {
              base.period.coverage_percentage = (base.period.stories_with_tests / totalStoriesCurrent) * 100;
            }

            // For comparison mode, calculate percentages from aggregated totals
            const totalStoriesP1 = base.period1.total_stories || base.period1.stories_with_tests + base.period1.stories_without_tests || base.total_stories || 0;
            const totalStoriesP2 = base.period2.total_stories || base.period2.stories_with_tests + base.period2.stories_without_tests || base.total_stories || 0;
            const p1Pct = totalStoriesP1 > 0 ? (base.period1.stories_with_tests / totalStoriesP1) * 100 : 0;
            const p2Pct = totalStoriesP2 > 0 ? (base.period2.stories_with_tests / totalStoriesP2) * 100 : 0;
            if (totalStoriesP1 > 0 || totalStoriesP2 > 0) {
              base.period1.coverage_percentage = p1Pct;
              base.period2.coverage_percentage = p2Pct;
              const deltaPct = p2Pct - p1Pct;
              base.progress.percentage_change = deltaPct;
              base.progress.trend = deltaPct > 0 ? 'improving' : deltaPct < 0 ? 'declining' : 'stable';
            }

            base.ai_analysis = aiAnalyses.join('\n\n');
            base.ai_insights = base.ai_analysis;
          } else if (isTestStoryRatioMetric) {
            // Test to Story Ratio: test cases per story
            base.total_test_cases = 0;
            base.total_stories = 0;
            base.period = { from: '', to: '', total_test_cases: 0, total_stories: 0, ratio: 0 };
            base.period1 = { from: '', to: '', total_test_cases: 0, total_stories: 0, ratio: 0 };
            base.period2 = { from: '', to: '', total_test_cases: 0, total_stories: 0, ratio: 0 };
            base.progress = { ratio_change: 0, test_cases_change: 0, stories_change: 0, trend: 'stable' };
            const aiAnalyses: string[] = [];

            rowsToAgg.forEach((row) => {
              base.total_test_cases += row.total_test_cases || 0;
              base.total_stories += row.total_stories || 0;

              if (row.period) {
                base.period.total_test_cases += row.period.total_test_cases || 0;
                base.period.total_stories += row.period.total_stories || 0;
                if (!base.period.from) base.period.from = row.period.from || '';
                if (!base.period.to) base.period.to = row.period.to || '';
              }

              if (row.period1) {
                base.period1.total_test_cases += row.period1.total_test_cases || 0;
                base.period1.total_stories += row.period1.total_stories || 0;
                if (!base.period1.from) base.period1.from = row.period1.from || '';
                if (!base.period1.to) base.period1.to = row.period1.to || '';
              }

              if (row.period2) {
                base.period2.total_test_cases += row.period2.total_test_cases || 0;
                base.period2.total_stories += row.period2.total_stories || 0;
                if (!base.period2.from) base.period2.from = row.period2.from || '';
                if (!base.period2.to) base.period2.to = row.period2.to || '';
              }

              if (row.progress) {
                // Re‑use generic tests_change/stories_change fields for this metric
                base.progress.tests_change = (base.progress.tests_change || 0) + (row.progress.tests_change || 0);
                base.progress.stories_change = (base.progress.stories_change || 0) + (row.progress.stories_change || 0);
              }

              if (row.ai_analysis) {
                aiAnalyses.push(row.ai_analysis);
              }
            });

            const totalStoriesCurrent = base.period.total_stories || 0;
            if (totalStoriesCurrent > 0) {
              base.period.ratio = base.period.total_test_cases / totalStoriesCurrent;
            }

            const storiesP1 = base.period1.total_stories || 0;
            const storiesP2 = base.period2.total_stories || 0;
            const ratio1 = storiesP1 > 0 ? base.period1.total_test_cases / storiesP1 : 0;
            const ratio2 = storiesP2 > 0 ? base.period2.total_test_cases / storiesP2 : 0;
            if (storiesP1 > 0 || storiesP2 > 0) {
              base.period1.ratio = ratio1;
              base.period2.ratio = ratio2;
              const ratioDelta = ratio2 - ratio1;
              base.progress.ratio_change = ratioDelta;
              base.progress.trend = ratioDelta > 0 ? 'improving' : ratioDelta < 0 ? 'declining' : 'stable';
            }

            base.ai_analysis = aiAnalyses.join('\n\n');
            base.ai_insights = base.ai_analysis;
          } else if (isBugRatioMetric) {
            // Bug Discovery Ratio: bugs found per test executed
            base.period = { from: '', to: '', bugs_found: 0, test_cases_executed: 0, ratio: 0 };
            base.period1 = { from: '', to: '', bugs_found: 0, test_cases_executed: 0, ratio: 0 };
            base.period2 = { from: '', to: '', bugs_found: 0, test_cases_executed: 0, ratio: 0 };
            base.progress = { ratio_change: 0, bugs_change: 0, tests_change: 0, trend: 'stable' };
            const aiAnalyses: string[] = [];

            rowsToAgg.forEach((row) => {
              if (row.period) {
                base.period.bugs_found += row.period.bugs_found || 0;
                base.period.test_cases_executed += row.period.test_cases_executed || 0;
                if (!base.period.from) base.period.from = row.period.from || '';
                if (!base.period.to) base.period.to = row.period.to || '';
              }

              if (row.period1) {
                base.period1.bugs_found += row.period1.bugs_found || 0;
                base.period1.test_cases_executed += row.period1.test_cases_executed || 0;
                if (!base.period1.from) base.period1.from = row.period1.from || '';
                if (!base.period1.to) base.period1.to = row.period1.to || '';
              }

              if (row.period2) {
                base.period2.bugs_found += row.period2.bugs_found || 0;
                base.period2.test_cases_executed += row.period2.test_cases_executed || 0;
                if (!base.period2.from) base.period2.from = row.period2.from || '';
                if (!base.period2.to) base.period2.to = row.period2.to || '';
              }

              if (row.progress) {
                base.progress.bugs_change += row.progress.bugs_change || 0;
                base.progress.tests_change += row.progress.tests_change || 0;
              }

              if (row.ai_analysis) {
                aiAnalyses.push(row.ai_analysis);
              }
            });

            if (base.period.test_cases_executed > 0) {
              base.period.ratio = base.period.bugs_found / base.period.test_cases_executed;
            }

            const testsP1 = base.period1.test_cases_executed || 0;
            const testsP2 = base.period2.test_cases_executed || 0;
            const ratio1 = testsP1 > 0 ? base.period1.bugs_found / testsP1 : 0;
            const ratio2 = testsP2 > 0 ? base.period2.bugs_found / testsP2 : 0;
            if (testsP1 > 0 || testsP2 > 0) {
              base.period1.ratio = ratio1;
              base.period2.ratio = ratio2;
              const ratioDelta = ratio2 - ratio1;
              base.progress.ratio_change = ratioDelta;
              // Note: lower ratio is better for bug discovery metric
              base.progress.trend = ratioDelta < 0 ? 'improving' : ratioDelta > 0 ? 'declining' : 'stable';
            }

            base.ai_analysis = aiAnalyses.join('\n\n');
            base.ai_insights = base.ai_analysis;
          } else if (isTestReviewStatusMetric) {
            // Test Case Review Status: reviewed_yes / total stories
            base.total_stories = 0;
            base.period = { from: '', to: '', reviewed_yes: 0, reviewed_no: 0, not_set: 0, review_percentage: 0 };
            base.period1 = { from: '', to: '', reviewed_yes: 0, reviewed_no: 0, not_set: 0, review_percentage: 0 };
            base.period2 = { from: '', to: '', reviewed_yes: 0, reviewed_no: 0, not_set: 0, review_percentage: 0 };
            base.progress = { percentage_change: 0, new_reviewed: 0, trend: 'stable' };
            const aiAnalyses: string[] = [];

            rowsToAgg.forEach((row) => {
              base.total_stories += row.total_stories || 0;

              if (row.period) {
                base.period.reviewed_yes += row.period.reviewed_yes || 0;
                base.period.reviewed_no += row.period.reviewed_no || 0;
                base.period.not_set += row.period.not_set || 0;
                if (!base.period.from) base.period.from = row.period.from || '';
                if (!base.period.to) base.period.to = row.period.to || '';
              }

              if (row.period1) {
                base.period1.reviewed_yes += row.period1.reviewed_yes || 0;
                base.period1.reviewed_no += row.period1.reviewed_no || 0;
                base.period1.not_set += row.period1.not_set || 0;
                if (!base.period1.from) base.period1.from = row.period1.from || '';
                if (!base.period1.to) base.period1.to = row.period1.to || '';
              }

              if (row.period2) {
                base.period2.reviewed_yes += row.period2.reviewed_yes || 0;
                base.period2.reviewed_no += row.period2.reviewed_no || 0;
                base.period2.not_set += row.period2.not_set || 0;
                if (!base.period2.from) base.period2.from = row.period2.from || '';
                if (!base.period2.to) base.period2.to = row.period2.to || '';
              }

              if (row.progress) {
                base.progress.new_reviewed += row.progress.new_reviewed || 0;
              }

              if (row.ai_analysis) {
                aiAnalyses.push(row.ai_analysis);
              }
            });

            const totalStoriesCurrent = base.period.reviewed_yes + base.period.reviewed_no + base.period.not_set || base.total_stories || 0;
            if (totalStoriesCurrent > 0) {
              base.period.review_percentage = (base.period.reviewed_yes / totalStoriesCurrent) * 100;
            }

            // For comparison mode, calculate percentages from aggregated totals
            const totalStoriesP1 = base.period1.reviewed_yes + base.period1.reviewed_no + base.period1.not_set || base.total_stories || 0;
            const totalStoriesP2 = base.period2.reviewed_yes + base.period2.reviewed_no + base.period2.not_set || base.total_stories || 0;
            const p1Pct = totalStoriesP1 > 0 ? (base.period1.reviewed_yes / totalStoriesP1) * 100 : 0;
            const p2Pct = totalStoriesP2 > 0 ? (base.period2.reviewed_yes / totalStoriesP2) * 100 : 0;
            if (totalStoriesP1 > 0 || totalStoriesP2 > 0) {
              base.period1.review_percentage = p1Pct;
              base.period2.review_percentage = p2Pct;
              const deltaPct = p2Pct - p1Pct;
              base.progress.percentage_change = deltaPct;
              base.progress.trend = deltaPct > 0 ? 'improving' : deltaPct < 0 ? 'declining' : 'stable';
            }

            base.ai_analysis = aiAnalyses.join('\n\n');
            base.ai_insights = base.ai_analysis;
        } else {
          // Original defect leakage aggregation
          rowsToAgg.forEach((row) => {
            base.current_week.bugs_count += row.current_week.bugs_count || 0;
            base.current_week.defects_count += row.current_week.defects_count || 0;
            base.current_week.total_issues += row.current_week.total_issues || 0;
            base.previous_week.bugs_count += row.previous_week.bugs_count || 0;
            base.previous_week.defects_count += row.previous_week.defects_count || 0;
            base.previous_week.total_issues += row.previous_week.total_issues || 0;
          });
          const currTotal = base.current_week.bugs_count + base.current_week.defects_count;
          const prevTotal = base.previous_week.bugs_count + base.previous_week.defects_count;
          const currLeak = metricKey === 'defect_leakage'
            ? (base.current_week.bugs_count > 0 ? ((base.current_week.defects_count - base.current_week.bugs_count) / base.current_week.bugs_count) * 100 : (base.current_week.defects_count > 0 ? 100 : 0))
            : (currTotal > 0 ? (base.current_week.defects_count / currTotal) * 100 : 0);
          const prevLeak = metricKey === 'defect_leakage'
            ? (base.previous_week.bugs_count > 0 ? ((base.previous_week.defects_count - base.previous_week.bugs_count) / base.previous_week.bugs_count) * 100 : (base.previous_week.defects_count > 0 ? 100 : 0))
            : (prevTotal > 0 ? (base.previous_week.defects_count / prevTotal) * 100 : 0);
          base.current_week.leakage_percentage = Number(currLeak.toFixed(1));
          base.current_week.defect_inflow_percentage = Number(currLeak.toFixed(1));
          base.current_week.cy25_defects = base.current_week.bugs_count;
          base.current_week.cy26_defects = base.current_week.defects_count;
          base.previous_week.leakage_percentage = Number(prevLeak.toFixed(1));
          base.previous_week.defect_inflow_percentage = Number(prevLeak.toFixed(1));
          base.previous_week.cy25_defects = base.previous_week.bugs_count;
          base.previous_week.cy26_defects = base.previous_week.defects_count;
          base.period1 = base.previous_week;
          base.period2 = base.current_week;
          const delta = Number((currLeak - prevLeak).toFixed(1));
          base.comparison.leakage_change = delta;
          base.progress = { percentage_change: delta, wow_progress_pct: delta, trend: delta < 0 ? 'improving' : delta > 0 ? 'worsening' : 'stable' };
          base.comparison.leakage_change_percentage = Number((prevLeak ? (delta / prevLeak) * 100 : 0).toFixed(1));
          base.comparison.bugs_change = base.current_week.bugs_count - base.previous_week.bugs_count;
          base.comparison.defects_change = base.current_week.defects_count - base.previous_week.defects_count;
          base.comparison.trend = delta > 2 ? 'worsening' : delta < -2 ? 'improving' : 'stable';
          base.comparison.severity = (currLeak > 50 || delta > 15) ? 'critical' : (currLeak > 40 || delta > 10) ? 'warning' : (currLeak > 30 || delta > 5) ? 'attention' : 'normal';
          }
        }

        return base as Analysis;
      };

      // Build debug breakdown (only for defect leakage metrics)
      let nextDebugBreakdown: DebugBreakdownItem[] | null = null;
      const defectLeakageRows = builtRows.filter(r => r.metric === 'defect_leakage');
      if (defectLeakageRows.length > 0) {
        const breakdown: DebugBreakdownItem[] = defectLeakageRows.map(r => ({
          projectKey: r.project_key || '',
          projectLabel: r.project_label || (r.project_key || ''),
          current: {
            bugs: r.current_week.bugs_count || 0,
            defects: r.current_week.defects_count || 0,
            total: (r.current_week.bugs_count || 0) + (r.current_week.defects_count || 0)
          },
          previous: {
            bugs: r.previous_week.bugs_count || 0,
            defects: r.previous_week.defects_count || 0,
            total: (r.previous_week.bugs_count || 0) + (r.previous_week.defects_count || 0)
          }
        }));
        nextDebugBreakdown = breakdown;
        setDebugBreakdown(breakdown);
      }

      // Handle results display
      let nextAnalysis: Analysis | null = null;
      let nextRows: Analysis[] | null = null;
      let nextRawRows: Analysis[] | null = null;
      if (selectedMetric === 'all' || projectsToRun.length > 1 || builtRows.length > 1) {
        // Show individual rows for each project/metric combination
        // Aggregate by portfolio if needed
        if (aggregateByPortfolio && builtRows.length > 0) {
          console.log('📊 Aggregating by portfolio...');

          // Group by portfolio and metric
          const portfolioGroups: Record<string, Analysis[]> = {};
          builtRows.forEach(row => {
            const portfolio = row.portfolio_display || row.portfolio || 'Unknown';
            const key = `${portfolio}_${row.metric}`;
            console.log(`  → Grouping ${row.project_key} under "${portfolio}" for metric "${row.metric}"`);
            if (!portfolioGroups[key]) {
              portfolioGroups[key] = [];
            }
            portfolioGroups[key].push(row);
          });

          console.log('📊 Portfolio groups:', Object.keys(portfolioGroups));

          // Create aggregated rows - one per portfolio/metric combination
          const aggregatedRows: Analysis[] = [];

          // Process each portfolio/metric group (using for...of to support await)
          for (const [key, portfolioRows] of Object.entries(portfolioGroups)) {
            // Get portfolio name and metric directly from row data (not from parsing key)
            // This is necessary because metric names can contain underscores (e.g., "overall_automation")
            const portfolioName = portfolioRows[0]?.portfolio_display || portfolioRows[0]?.portfolio || 'Unknown';
            const metricKey = portfolioRows[0]?.metric || '';
            const projectKeys = portfolioRows.map(r => r.project_key || '').filter(Boolean);
            console.log(`📊 Processing "${portfolioName}" with ${portfolioRows.length} projects for metric "${metricKey}"`);

            let portfolioLevelAnalysisUsed = false;

            // If portfolio has 2+ projects, get portfolio-level analysis from backend
            if (portfolioRows.length >= 2) {
              const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];

              if (periodBasedMetrics.includes(metricKey) && metricKey !== 'test_review_status') {
                try {
                  // Prepare project_metrics for backend
                  const projectMetrics = portfolioRows.map(row => ({
                    project_key: row.project_key,
                    project_name: row.project_label || row.project_key,
                    total_test_cases: row.total_test_cases || row.total_regression_tests || 0,
                    total_regression_tests: row.total_regression_tests || row.total_test_cases || 0,
                    total_stories: row.total_stories || 0,
                    automation_percentage: enableComparison
                      ? (row.period2?.automation_percentage || row.period?.automation_percentage || 0)
                      : (row.period?.automation_percentage || 0),
                    period1_percentage: row.period1?.automation_percentage || row.period1?.coverage_percentage || 0,
                    period2_percentage: row.period2?.automation_percentage || row.period2?.coverage_percentage || row.period?.automation_percentage || row.period?.coverage_percentage || 0,
                    period: row.period,
                    period1: row.period1,
                    period2: row.period2
                  }));

                  // Determine API endpoint
                  const apiEndpoint = metricKey === 'regression_automation'
                    ? '/api/quality/regression-automation-analysis'
                    : metricKey === 'overall_automation'
                    ? '/api/quality/overall-automation-analysis'
                    : metricKey === 'test_coverage'
                    ? '/api/quality/test-coverage-analysis'
                    : metricKey === 'test_story_ratio'
                    ? '/api/quality/test-story-ratio-analysis'
                    : metricKey === 'bug_ratio'
                    ? '/api/quality/bug-ratio-analysis'
                    : metricKey === 'test_review_status'
                    ? '/api/quality/test-case-review-status-analysis'
                    : null;

                  if (apiEndpoint) {
                    // Use portfolio display name (e.g., "Data Solutions") for the API call
                    // The backend will resolve this to the correct project key
                    const portfolioForApi = portfolioName; // Use the portfolio display name

                    // Prepare payload with project_metrics
                    const portfolioPayload = enableComparison ? {
                      portfolio: portfolioForApi,
                      period1_from: previousWindow?.piStartDate || previousFrom,
                      period1_to: previousWindow?.reportDate || previousTo,
                      period2_from: currentWindow.piStartDate,
                      period2_to: currentWindow.reportDate,
                      enable_comparison: true,
                      project_metrics: projectMetrics,
                      pi_context: currentWindow.piContext,
                      previous_pi_context: previousWindow?.piContext,
                      comparison_note: comparisonPIResult?.comparisonNote || undefined,
                      use_custom_date_range: useCustomDateRange,
                    } : {
                      portfolio: portfolioForApi,
                      period_from: currentWindow.piStartDate,
                      period_to: currentWindow.reportDate,
                      enable_comparison: false,
                      project_metrics: projectMetrics,
                      pi_context: currentWindow.piContext,
                      use_custom_date_range: useCustomDateRange,
                    };

                    console.log(`📊 Requesting portfolio-level analysis for "${portfolioName}" (${portfolioForApi}) with ${projectMetrics.length} projects`);
                    console.log(`📊 Payload:`, JSON.stringify(portfolioPayload, null, 2));

                    try {
                      const portfolioResponse = await fetch(getApiUrl(apiEndpoint), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(portfolioPayload)
                      });

                      if (!portfolioResponse.ok) {
                        const errorText = await portfolioResponse.text();
                        throw new Error(`API returned ${portfolioResponse.status}: ${portfolioResponse.statusText}. Response: ${errorText}`);
                      }

                      const portfolioData = await portfolioResponse.json();
                      console.log(`📊 Portfolio API response for ${portfolioName}:`, portfolioData);

                      if (portfolioData.success && portfolioData.analysis) {
                        // Build aggregated row from portfolio-level response (don't use aggregateRows which joins individual analyses)
                        const portfolioAnalysis = portfolioData.analysis;
                        const aggregatedRow: Analysis = {
                          ...portfolioAnalysis,
                          portfolio: portfolioName,
                          portfolio_display: portfolioName,
                          project_key: projectKeys.join(', '),
                          project_label: `${portfolioRows.length} projects combined`,
                          metric: metricKey,
                          metric_label: portfolioRows[0]?.metric_label || '',
                          pi_context: portfolioAnalysis.pi_context || currentWindow.piContext,
                          previous_pi_context: portfolioAnalysis.previous_pi_context || previousWindow?.piContext,
                          comparison_note: portfolioAnalysis.comparison_note || comparisonPIResult?.comparisonNote || undefined,
                          // Use portfolio-level AI analysis (not individual project analyses)
                          ai_analysis: portfolioAnalysis.ai_analysis || '',
                          ai_insights: portfolioAnalysis.ai_analysis || '',
                          // Preserve period data from portfolio response
                          total_test_cases: portfolioAnalysis.total_test_cases || 0,
                          total_regression_tests: portfolioAnalysis.total_regression_tests || portfolioAnalysis.total_test_cases || 0,
                          total_stories: portfolioAnalysis.total_stories || 0,
                          period: portfolioAnalysis.period,
                          period1: portfolioAnalysis.period1,
                          period2: portfolioAnalysis.period2,
                          progress: portfolioAnalysis.progress,
                          // Dummy fields for compatibility
                          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
                        } as Analysis;

                        aggregatedRows.push(aggregatedRow);
                        portfolioLevelAnalysisUsed = true;
                        console.log(`✅ Got portfolio-level analysis for ${portfolioName}:`, portfolioAnalysis.ai_analysis?.substring(0, 100));
                      } else {
                        console.warn(`⚠️ Portfolio-level analysis failed or not returned for ${portfolioName}. Response:`, portfolioData);
                      }
                    } catch (error) {
                      console.error(`❌ Failed to get portfolio-level analysis for ${portfolioName}:`, error);
                      // Will fall back to frontend aggregation below
                    }
                  }
                } catch (error) {
                  console.error(`❌ Error in portfolio-level analysis logic for ${portfolioName}:`, error);
                  // Fall back to frontend aggregation
                }
              } else if (metricKey === 'defect_leakage') {
                // Handle defect_leakage with portfolio-level backend analysis
                try {
                  // Prepare project_metrics for defect leakage (uses current_week and previous_week)
                  const projectMetrics = portfolioRows.map(row => ({
                    project_key: row.project_key,
                    project_name: row.project_label || row.project_key,
                    current_week: row.current_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                    previous_week: row.previous_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' }
                  }));

                  const apiEndpoint = '/api/quality/defect-leakage-analysis';
                  const portfolioForApi = portfolioName; // Use the portfolio display name

                  // Prepare payload with project_metrics (defect leakage uses current_week/previous_week structure)
                  const portfolioPayload = {
                    portfolio: portfolioForApi,
                    current_week_from: currentWindow.piStartDate,
                    current_week_to: currentWindow.reportDate,
                    previous_week_from: previousWindow?.piStartDate || previousFrom,
                    previous_week_to: previousWindow?.reportDate || previousTo,
                    metric: 'defect_leakage',
                    project_metrics: projectMetrics,
                    pi_context: currentWindow.piContext,
                    previous_pi_context: previousWindow?.piContext,
                    comparison_note: comparisonPIResult?.comparisonNote || undefined,
                    use_custom_date_range: useCustomDateRange,
                  };

                  console.log(`📊 Requesting portfolio-level defect leakage analysis for "${portfolioName}" (${portfolioForApi}) with ${projectMetrics.length} projects`);
                  console.log(`📊 Payload:`, JSON.stringify(portfolioPayload, null, 2));

                  try {
                    const portfolioResponse = await fetch(getApiUrl(apiEndpoint), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(portfolioPayload)
                    });

                    if (!portfolioResponse.ok) {
                      const errorText = await portfolioResponse.text();
                      throw new Error(`API returned ${portfolioResponse.status}: ${portfolioResponse.statusText}. Response: ${errorText}`);
                    }

                    const portfolioData = await portfolioResponse.json();
                    console.log(`📊 Portfolio API response for ${portfolioName}:`, portfolioData);

                    if (portfolioData.success && portfolioData.analysis) {
                      // Build aggregated row from portfolio-level response
                      const portfolioAnalysis = portfolioData.analysis;
                      const aggregatedRow: Analysis = {
                        ...portfolioAnalysis,
                        portfolio: portfolioName,
                        portfolio_display: portfolioName,
                        project_key: projectKeys.join(', '),
                        project_label: `${portfolioRows.length} projects combined`,
                        metric: 'defect_leakage',
                        metric_label: portfolioRows[0]?.metric_label || 'Defect Leakage Rate',
                        pi_context: portfolioAnalysis.pi_context || currentWindow.piContext,
                        previous_pi_context: portfolioAnalysis.previous_pi_context || previousWindow?.piContext,
                        comparison_note: portfolioAnalysis.comparison_note || comparisonPIResult?.comparisonNote || undefined,
                        // Use portfolio-level AI analysis
                        ai_analysis: portfolioAnalysis.ai_analysis || '',
                        ai_insights: portfolioAnalysis.ai_analysis || portfolioAnalysis.ai_insights || '',
                        // Preserve defect leakage data from portfolio response
                        current_week: portfolioAnalysis.current_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                        previous_week: portfolioAnalysis.previous_week || { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
                        comparison: portfolioAnalysis.comparison || { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' },
                        // Dummy fields for compatibility with period-based metrics
                        total_test_cases: 0,
                        total_regression_tests: 0,
                        total_stories: 0
                      } as Analysis;

                      aggregatedRows.push(aggregatedRow);
                      portfolioLevelAnalysisUsed = true;
                      console.log(`✅ Got portfolio-level defect leakage analysis for ${portfolioName}:`, portfolioAnalysis.ai_analysis?.substring(0, 100));
                    } else {
                      console.warn(`⚠️ Portfolio-level defect leakage analysis failed or not returned for ${portfolioName}. Response:`, portfolioData);
                    }
                  } catch (error) {
                    console.error(`❌ Failed to get portfolio-level defect leakage analysis for ${portfolioName}:`, error);
                    // Will fall back to frontend aggregation below
                  }
                } catch (error) {
                  console.error(`❌ Error in portfolio-level defect leakage analysis logic for ${portfolioName}:`, error);
                  // Fall back to frontend aggregation
                }
              }
            }

            // Fallback: Use frontend aggregation (for single project, non-period-based metrics, or if portfolio-level API call failed)
            if (!portfolioLevelAnalysisUsed) {
              console.log(`📊 Creating aggregated row for "${portfolioName}" with keys: ${projectKeys.join(', ')} (using frontend aggregation)`);
            aggregatedRows.push(aggregateRows(portfolioRows, portfolioName, projectKeys));
            }
          }

          console.log(`📊 Final output: ${aggregatedRows.length} rows`);
          nextRows = aggregatedRows;
          nextRawRows = builtRows;
          setRows(aggregatedRows);
          setRawRows(builtRows);
        } else {
          // Show individual rows for each project/metric
          nextRows = builtRows;
          nextRawRows = builtRows;
          setRows(builtRows);
          setRawRows(builtRows);
        }
      } else {
        // Single result - set as analysis
        if (builtRows.length === 1) {
          nextAnalysis = builtRows[0];
          nextRawRows = builtRows;
          setAnalysis(builtRows[0]);
          setRawRows(builtRows);
        } else if (builtRows.length > 1) {
          nextRows = builtRows;
          nextRawRows = builtRows;
          setRows(builtRows);
          setRawRows(builtRows);
        } else {
          stopWithError('No results obtained.');
          return;
        }
      }

      // Calculate and set report generation time (in seconds with full precision)
      const endTime = Date.now();
      const elapsedTime = (endTime - startTime) / 1000;
      setReportGenerationTime(elapsedTime);
      persistReportSnapshot('completed', {
        analysis: nextAnalysis,
        rows: nextRows,
        rawRows: nextRawRows,
        debugBreakdown: nextDebugBreakdown,
        reportGenerationTime: elapsedTime,
        startedAt: startTime,
      });
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(message);
      persistReportSnapshot('failed', { error: message, startedAt: startTime });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatWeekEndingShort = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr;
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${month}/${day}`;
  };

  const formatMonthYearLabel = (month: number, year: number) => {
    const monthOption = MONTH_OPTIONS.find((option) => option.value === month);
    return monthOption ? `${monthOption.label} ${year}` : `${month}/${year}`;
  };

  const getMonthLabel = (month: number) => {
    const monthOption = MONTH_OPTIONS.find((option) => option.value === month);
    return monthOption?.label || month.toString();
  };

  // PDF Export Formatting Helpers
  const formatNumber = (value?: number | null): string => {
    if (value === undefined || value === null || Number.isNaN(value)) return '0';
    return Math.round(value).toString();
  };

  const formatPercentage = (value?: number | null): string => {
    if (value === undefined || value === null || Number.isNaN(value)) return '0.0%';
    const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
    return `${rounded.toFixed(1)}%`;
  };

  const formatRatio = (value?: number | null, decimals: number = 4): string => {
    if (value === undefined || value === null || Number.isNaN(value)) return '0.0000';
    return Number(value).toFixed(decimals);
  };

  const formatChange = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(value)) return '0.0%';
    const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
  };

  // Get metric title for PDF (enterprise terminology)
  const getMetricTitleForPDF = (metricKey: string): string => {
    const titles: Record<string, string> = {
      'overall_automation': 'Automation Coverage (Overall)',
      'regression_automation': 'Regression Automation Coverage',
      'test_coverage': 'Functional Test Coverage',
      'bug_ratio': 'Bug Discovery Effectiveness',
      'defect_leakage': 'Defect Leakage Overview',
      'test_story_ratio': 'Test-to-Story Completeness',
      'test_review_status': 'Test Case Review Compliance'
    };
    return titles[metricKey] || metricKey;
  };

  const createBadgeStyle = (baseColor: string) => ({
    backgroundColor: `${baseColor}20`,
    color: baseColor,
    fontWeight: 600,
    borderRadius: '9999px',
    padding: '4px 12px',
    display: 'inline-block'
  });

  const getLeakageStyle = (value: number) => {
    if (value >= 60) return createBadgeStyle(currentTheme.colors.error);
    if (value >= 40) return createBadgeStyle(currentTheme.colors.warning);
    return createBadgeStyle(currentTheme.colors.success);
  };

  const getWoWStyle = (value: number) => {
    if (value > 0.1) return createBadgeStyle(currentTheme.colors.error);
    if (value < -0.1) return createBadgeStyle(currentTheme.colors.success);
    return createBadgeStyle(currentTheme.colors.info);
  };

  const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

  const buildProjection = (prev: number, curr: number) => {
    const delta = (curr || 0) - (prev || 0);
    const projected = clamp((curr || 0) + delta);
    const volatility = Math.abs(delta);
    const confidence = volatility < 5 ? 'high' : volatility < 12 ? 'medium' : 'low';
    return { projected, confidence };
  };

  const buildSeverity = (curr: number, delta: number) => {
    if (curr > 50 || delta > 15) return 'Critical';
    if (curr > 40 || delta > 10) return 'Warning';
    if (curr > 30 || delta > 5) return 'Attention';
    return 'Normal';
  };

  // Generate professional AI-style comment with analysis and recommendations
  const buildCommentText = (row: Analysis, _metricLabel: string): string => {
    const prevLeak = Number(row.previous_week.leakage_percentage ?? 0);
    const currLeak = Number(row.current_week.leakage_percentage ?? 0);
    const delta = enableComparison ? Number(row.comparison.leakage_change ?? (currLeak - prevLeak)) : 0;
    const absDelta = Math.abs(delta);
    const defects = row.current_week.defects_count ?? 0;
    const bugs = row.current_week.bugs_count ?? 0;
    const total = bugs + defects;

    let analysis = '';
    let recommendation = '';

    // Single analysis mode (no comparison)
    if (!enableComparison) {
      if (currLeak === 0) {
        analysis = `Achieved 0% defect leakage with ${bugs} bugs caught in lower environments and no production defects.`;
        recommendation = `Excellent quality! Continue current testing practices.`;
      } else if (currLeak <= 10) {
        analysis = `Maintained healthy defect leakage at ${currLeak.toFixed(1)}% with ${defects} defects from ${total} total issues.`;
        recommendation = `Good performance. Focus on automation to maintain quality.`;
      } else if (currLeak <= 25) {
        analysis = `Defect leakage at ${currLeak.toFixed(1)}% - ${defects} production defects detected from ${total} issues.`;
        recommendation = `Review test coverage for high-risk areas. Consider adding more integration tests.`;
      } else if (currLeak <= 40) {
        analysis = `Elevated defect leakage at ${currLeak.toFixed(1)}% with ${defects} escaped defects requiring attention.`;
        recommendation = `Conduct RCA on escaped defects. Strengthen pre-release validation.`;
      } else {
        analysis = `Critical defect leakage at ${currLeak.toFixed(1)}% - ${defects} defects escaped to production.`;
        recommendation = `Immediate action required: Review testing process, add gate checks, and improve test coverage.`;
      }
    }
    // Comparison mode
    else {
      if (currLeak === 0 && prevLeak === 0) {
        analysis = `Maintained 0% defect leakage across periods, demonstrating strong quality practices.`;
        recommendation = `Continue current testing strategies.`;
      } else if (delta < -10) {
        analysis = `Achieved significant ${absDelta.toFixed(0)}% reduction in defect leakage (${prevLeak.toFixed(0)}% to ${currLeak.toFixed(0)}%).`;
        recommendation = `Share learnings with other teams.`;
      } else if (delta < -5) {
        analysis = `Saw healthy ${absDelta.toFixed(0)}% dip in defect leakage.`;
        recommendation = `Keep momentum with test automation.`;
      } else if (delta < 0) {
        analysis = `Showed improvement with leakage down ${absDelta.toFixed(1)}%.`;
        recommendation = `Focus on regression coverage.`;
      } else if (delta > 15) {
        analysis = `Concerning ${absDelta.toFixed(0)}% spike with ${defects} production defects.`;
        recommendation = `Conduct RCA, strengthen pre-release gates.`;
      } else if (delta > 5) {
        analysis = `Elevated leakage at ${currLeak.toFixed(0)}% (up ${absDelta.toFixed(0)}%).`;
        recommendation = `Review failure patterns, add smoke tests.`;
      } else if (delta > 0) {
        analysis = `Slight ${absDelta.toFixed(1)}% increase in defect leakage.`;
        recommendation = `Monitor closely next sprint.`;
      } else {
        analysis = `Stable defect leakage at ${currLeak.toFixed(0)}%.`;
        recommendation = `Focus on incremental improvements.`;
      }
    }

    // Check if we have meaningful AI insights from the backend
    const aiSummary = (row.ai_insights || '').split('\n').map(s => s.trim()).filter(Boolean)[0];
    if (aiSummary && aiSummary.length > 20 && !aiSummary.includes('Summary not available')) {
      return aiSummary + ` Recommendation: ${recommendation}`;
    }

    return `${analysis} Recommendation: ${recommendation}`;
  };

  // Generate unique AI analysis for Grand Total based on aggregated data
  const generateGrandTotalAnalysis = (
    totalTests: number,
    periodAutomated: number,
    periodManual: number,
    periodPercentage: number,
    period1Automated?: number,
    period1Manual?: number,
    period1Percentage?: number,
    period2Automated?: number,
    period2Manual?: number,
    period2Percentage?: number,
    periodTo?: string,
    metricType?: string
  ): string => {
    const isRegression = metricType === 'regression_automation';
    const metricLabel = isRegression ? 'Regression automation' : 'Overall automation';
    const testLabel = isRegression ? 'regression tests' : 'test cases';

    if (enableComparison && period1Automated !== undefined && period2Automated !== undefined) {
      // Comparison mode - AI-style natural analysis
      const percentageChange = (period2Percentage || 0) - (period1Percentage || 0);
      const newAutomated = period2Automated - period1Automated;
      const absChange = Math.abs(percentageChange);

      if (percentageChange > 5) {
        return `Across all portfolios, ${metricLabel} has shown strong improvement, rising from ${(period1Percentage || 0).toFixed(1)}% to ${(period2Percentage || 0).toFixed(1)}%—a gain of ${absChange.toFixed(1)} percentage points. ${newAutomated > 0 ? `With ${newAutomated} additional ${testLabel} now automated, ` : ''}the current state stands at ${period2Automated} of ${totalTests} ${testLabel} automated. This momentum positions us well toward the 80%+ industry benchmark. Recommendation: maintain focus on high-impact automation initiatives to sustain this trajectory.`;
      } else if (percentageChange < -5) {
        return `A concerning decline in ${metricLabel} has been observed across portfolios, dropping from ${(period1Percentage || 0).toFixed(1)}% to ${(period2Percentage || 0).toFixed(1)}% (${percentageChange.toFixed(1)} percentage points). Currently, ${period2Automated} of ${totalTests} ${testLabel} are automated, leaving ${period2Manual} requiring manual execution. Immediate action needed: conduct root cause analysis to identify factors driving this regression and prioritize re-automation of critical test scenarios to restore coverage.`;
      } else if (percentageChange > 0) {
        return `${metricLabel} demonstrates modest progress, advancing from ${(period1Percentage || 0).toFixed(1)}% to ${(period2Percentage || 0).toFixed(1)}% (+${absChange.toFixed(1)}pp) across portfolios. The current footprint shows ${period2Automated} automated ${testLabel} out of ${totalTests} total. To accelerate toward the 80%+ target, prioritize automation of the remaining ${period2Manual} manual ${testLabel}, focusing on high-impact scenarios that will strengthen overall coverage.`;
      } else {
        return `${metricLabel} remains relatively stable at ${(period2Percentage || 0).toFixed(1)}% across portfolios, with ${period2Automated} of ${totalTests} ${testLabel} automated and ${period2Manual} still manual. While stability is positive, there's a clear opportunity to enhance CI/CD readiness by increasing automation investment. Strategic focus on the remaining manual ${testLabel} will reduce testing overhead and improve deployment velocity.`;
      }
    } else {
      // Single period mode - AI-style natural analysis
      if (periodPercentage >= 90) {
        return `${metricLabel} across portfolios is excellent at ${periodPercentage.toFixed(1)}%, with ${periodAutomated} of ${totalTests} ${testLabel} automated. This high automation rate reflects strong CI/CD maturity and readiness. The remaining ${periodManual} manual ${testLabel} should be reviewed to determine automation feasibility or intentional exclusion from automation scope.`;
      } else if (periodPercentage >= 80) {
        return `${metricLabel} is strong at ${periodPercentage.toFixed(1)}% across portfolios (${periodAutomated}/${totalTests} ${testLabel} automated), meeting the industry standard for automation coverage. To further strengthen our position, evaluate the remaining ${periodManual} manual ${testLabel} for automation potential, particularly those critical to regression coverage.`;
      } else if (periodPercentage >= 60) {
        return `${metricLabel} stands at ${periodPercentage.toFixed(1)}% across portfolios, with ${periodAutomated} of ${totalTests} ${testLabel} automated. While this represents solid progress, there's meaningful opportunity to reach the 80%+ industry benchmark. Recommendation: prioritize automation of high-impact tests from the remaining ${periodManual} manual ${testLabel} to enhance CI/CD readiness and reduce manual testing burden.`;
      } else if (periodPercentage >= 40) {
        return `${metricLabel} is moderate at ${periodPercentage.toFixed(1)}% across portfolios (${periodAutomated}/${totalTests} ${testLabel} automated). The ${periodManual} remaining manual ${testLabel} represent a significant opportunity to strengthen coverage and improve CI/CD readiness. Strategic investment in automation will reduce manual overhead and enhance deployment confidence.`;
      } else {
        return `${metricLabel} requires attention at ${periodPercentage.toFixed(1)}% across portfolios, with ${periodAutomated} of ${totalTests} ${testLabel} automated. The ${periodManual} remaining manual ${testLabel} represent a critical gap that impacts production risk. Immediate priority: automate core regression scenarios to enhance test coverage, improve CI/CD readiness, and mitigate the risk of missed issues in production.`;
      }
    }
  };

  // Calculate grand totals from all rows
  const calculateGrandTotal = (dataRows: Analysis[]): Analysis => {
    const metric = dataRows[0]?.metric;
    const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
    const isPeriodBasedMetric = metric && periodBasedMetrics.includes(metric);
    const isAutomationMetric = metric === 'regression_automation' || metric === 'overall_automation';

    if (isPeriodBasedMetric) {
      if (isAutomationMetric) {
      // Calculate regression/overall automation totals
      let totalRegressionTests = 0;
      let totalTestCases = 0;
      let periodAutomated = 0;
      let periodManual = 0;
      let period1Automated = 0;
      let period1Manual = 0;
      let period2Automated = 0;
      let period2Manual = 0;

      dataRows.forEach(row => {
        totalRegressionTests += row.total_regression_tests || row.total_test_cases || 0;
        totalTestCases += row.total_test_cases || row.total_regression_tests || 0;

        // Single period mode
        if (row.period) {
          periodAutomated += row.period.automated_count || 0;
          periodManual += row.period.manual_count || 0;
        }

        // Comparison mode
        if (row.period1) {
          period1Automated += row.period1.automated_count || 0;
          period1Manual += row.period1.manual_count || 0;
        }
        if (row.period2) {
          period2Automated += row.period2.automated_count || 0;
          period2Manual += row.period2.manual_count || 0;
        }
      });

      // Calculate percentages
      const totalCount = totalTestCases || totalRegressionTests;
      const periodPercentage = totalCount > 0
        ? (periodAutomated / totalCount) * 100
        : 0;
      const period1Percentage = totalCount > 0
        ? (period1Automated / totalCount) * 100
        : 0;
      const period2Percentage = totalCount > 0
        ? (period2Automated / totalCount) * 100
        : 0;

      // Calculate progress (percentage change) for comparison mode
      let progress: RegressionProgress | undefined = undefined;
      if (enableComparison && period1Percentage !== undefined && period2Percentage !== undefined) {
        const deltaPct = period2Percentage - period1Percentage;
        progress = {
          percentage_change: deltaPct,
          new_automated_tests: period2Automated - period1Automated,
          trend: deltaPct > 0 ? 'improving' : deltaPct < 0 ? 'declining' : 'stable'
        };
      }

      const metricType = dataRows[0]?.metric || 'regression_automation';
      const metricLabel = dataRows[0]?.metric_label || (metricType === 'regression_automation' ? 'Regression Automation %' : 'Overall Automation %');

      // Generate unique AI analysis based on aggregated totals
      const uniqueAnalysis = generateGrandTotalAnalysis(
        totalCount,
        periodAutomated,
        periodManual,
        periodPercentage,
        period1Automated,
        period1Manual,
        period1Percentage,
        period2Automated,
        period2Manual,
        period2Percentage,
        enableComparison ? dataRows[0]?.period2?.to : dataRows[0]?.period?.to,
        metricType
      );

      return {
        portfolio: 'Grand Total',
        portfolio_display: 'Grand Total',
        project_key: '',
        metric: metricType,
        metric_label: metricLabel,
        total_regression_tests: totalRegressionTests,
        total_test_cases: totalTestCases,
        period: {
          from: dataRows[0]?.period?.from || '',
          to: dataRows[0]?.period?.to || '',
          automated_count: periodAutomated,
          manual_count: periodManual,
          automation_percentage: Number(periodPercentage.toFixed(1))
        },
        period1: enableComparison ? {
          from: dataRows[0]?.period1?.from || '',
          to: dataRows[0]?.period1?.to || '',
          automated_count: period1Automated,
          manual_count: period1Manual,
          automation_percentage: Number(period1Percentage.toFixed(1))
        } : undefined,
        period2: enableComparison ? {
          from: dataRows[0]?.period2?.from || '',
          to: dataRows[0]?.period2?.to || '',
          automated_count: period2Automated,
          manual_count: period2Manual,
          automation_percentage: Number(period2Percentage.toFixed(1))
        } : undefined,
        progress: progress,
        ai_analysis: uniqueAnalysis,
        ai_insights: uniqueAnalysis,
        generated_at: new Date().toISOString(),
        // Dummy fields for compatibility
        current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
        previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
        comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
      } as Analysis;
      } else if (metric === 'test_coverage') {
        // Test Coverage grand total
        let totalStories = 0;
        let totalTestCases = 0;
        let periodTestCases = 0;
        let period1TestCases = 0;
        let period2TestCases = 0;
        let periodStoriesWithTests = 0;
        let periodStoriesWithoutTests = 0;
        let period1StoriesWithTests = 0;
        let period1StoriesWithoutTests = 0;
        let period2StoriesWithTests = 0;
        let period2StoriesWithoutTests = 0;

        dataRows.forEach(row => {
          totalStories += row.total_stories || 0;
          totalTestCases += row.total_test_cases || 0;
          // Single period mode
          if (row.period) {
            periodTestCases += row.period.total_test_cases || 0;
            periodStoriesWithTests += row.period.stories_with_tests || 0;
            periodStoriesWithoutTests += row.period.stories_without_tests || 0;
          }
          // Comparison mode
          if (row.period1) {
            period1TestCases += row.period1.total_test_cases || 0;
            period1StoriesWithTests += row.period1.stories_with_tests || 0;
            period1StoriesWithoutTests += row.period1.stories_without_tests || 0;
          }
          if (row.period2) {
            period2TestCases += row.period2.total_test_cases || 0;
            period2StoriesWithTests += row.period2.stories_with_tests || 0;
            period2StoriesWithoutTests += row.period2.stories_without_tests || 0;
          }
        });

        const totalStoriesCurrent = periodStoriesWithTests + periodStoriesWithoutTests || totalStories || 0;
        const totalStoriesP1 = period1StoriesWithTests + period1StoriesWithoutTests || totalStories || 0;
        const totalStoriesP2 = period2StoriesWithTests + period2StoriesWithoutTests || totalStories || 0;
        const currentPct = totalStoriesCurrent > 0 ? (periodStoriesWithTests / totalStoriesCurrent) * 100 : 0;
        const p1Pct = totalStoriesP1 > 0 ? (period1StoriesWithTests / totalStoriesP1) * 100 : 0;
        const p2Pct = totalStoriesP2 > 0 ? (period2StoriesWithTests / totalStoriesP2) * 100 : 0;
        const deltaPct = p2Pct - p1Pct;

        return {
          portfolio: 'Grand Total',
          portfolio_display: 'Grand Total',
          project_key: '',
          metric: 'test_coverage',
          metric_label: 'Test Coverage',
          total_stories: totalStories,
          total_test_cases: totalTestCases,
          period: {
            from: dataRows[0]?.period?.from || '',
            to: dataRows[0]?.period?.to || '',
            total_stories: totalStoriesCurrent,
            total_test_cases: periodTestCases,
            stories_with_tests: periodStoriesWithTests,
            stories_without_tests: periodStoriesWithoutTests,
            coverage_percentage: Number(currentPct.toFixed(1))
          },
          period1: enableComparison ? {
            from: dataRows[0]?.period1?.from || '',
            to: dataRows[0]?.period1?.to || '',
            total_stories: totalStoriesP1,
            total_test_cases: period1TestCases,
            stories_with_tests: period1StoriesWithTests,
            stories_without_tests: period1StoriesWithoutTests,
            coverage_percentage: Number(p1Pct.toFixed(1))
          } : undefined,
          period2: enableComparison ? {
            from: dataRows[0]?.period2?.from || '',
            to: dataRows[0]?.period2?.to || '',
            total_stories: totalStoriesP2,
            total_test_cases: period2TestCases,
            stories_with_tests: period2StoriesWithTests,
            stories_without_tests: period2StoriesWithoutTests,
            coverage_percentage: Number(p2Pct.toFixed(1))
          } : undefined,
          progress: enableComparison ? {
            percentage_change: deltaPct,
            new_stories_with_tests: period2StoriesWithTests - period1StoriesWithTests,
            trend: deltaPct > 0 ? 'improving' : deltaPct < 0 ? 'declining' : 'stable'
          } : undefined,
          ai_analysis: enableComparison
            ? (() => {
                const change = deltaPct > 0 ? 'improved' : deltaPct < 0 ? 'declined' : 'remained stable';
                const changeText = deltaPct > 0 ? `rising from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (+${deltaPct.toFixed(1)}pp)` : deltaPct < 0 ? `dropping from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (${deltaPct.toFixed(1)}pp)` : `maintaining at ${p2Pct.toFixed(1)}%`;
                const recommendation = deltaPct < 0 ? 'Immediate action: investigate coverage gaps and prioritize test case creation for uncovered stories to restore quality assurance standards.' : deltaPct > 0 ? 'Recommendation: continue expanding test coverage initiatives to further strengthen quality assurance and reduce risk exposure.' : 'Focus area: increase test coverage for the remaining uncovered stories to enhance overall quality assurance posture.';
                return `Test coverage across portfolios has ${change}, ${changeText}. Currently, ${period2StoriesWithTests} of ${totalStoriesP2} stories have associated test cases. ${recommendation}`;
              })()
            : (() => {
                const status = currentPct < 50 ? 'requires attention' : currentPct < 75 ? 'shows progress' : 'demonstrates strong coverage';
                const recommendation = currentPct < 50 ? 'Priority: create test cases for uncovered stories to improve quality assurance and reduce risk.' : currentPct < 75 ? 'Next step: continue expanding test coverage to reach the 75%+ target and enhance quality assurance.' : 'Maintenance: review remaining uncovered stories to ensure comprehensive coverage is maintained.';
                return `Test coverage across portfolios ${status} at ${currentPct.toFixed(1)}%, with ${periodStoriesWithTests} of ${totalStoriesCurrent} stories having test cases and ${periodStoriesWithoutTests} without. ${recommendation}`;
              })(),
          ai_insights: enableComparison
            ? (() => {
                const change = deltaPct > 0 ? 'improved' : deltaPct < 0 ? 'declined' : 'remained stable';
                const changeText = deltaPct > 0 ? `rising from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (+${deltaPct.toFixed(1)}pp)` : deltaPct < 0 ? `dropping from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (${deltaPct.toFixed(1)}pp)` : `maintaining at ${p2Pct.toFixed(1)}%`;
                const recommendation = deltaPct < 0 ? 'Immediate action: investigate coverage gaps and prioritize test case creation for uncovered stories to restore quality assurance standards.' : deltaPct > 0 ? 'Recommendation: continue expanding test coverage initiatives to further strengthen quality assurance and reduce risk exposure.' : 'Focus area: increase test coverage for the remaining uncovered stories to enhance overall quality assurance posture.';
                return `Test coverage across portfolios has ${change}, ${changeText}. Currently, ${period2StoriesWithTests} of ${totalStoriesP2} stories have associated test cases. ${recommendation}`;
              })()
            : (() => {
                const status = currentPct < 50 ? 'requires attention' : currentPct < 75 ? 'shows progress' : 'demonstrates strong coverage';
                const recommendation = currentPct < 50 ? 'Priority: create test cases for uncovered stories to improve quality assurance and reduce risk.' : currentPct < 75 ? 'Next step: continue expanding test coverage to reach the 75%+ target and enhance quality assurance.' : 'Maintenance: review remaining uncovered stories to ensure comprehensive coverage is maintained.';
                return `Test coverage across portfolios ${status} at ${currentPct.toFixed(1)}%, with ${periodStoriesWithTests} of ${totalStoriesCurrent} stories having test cases and ${periodStoriesWithoutTests} without. ${recommendation}`;
              })(),
          generated_at: new Date().toISOString(),
          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
        } as Analysis;
      } else if (metric === 'test_story_ratio') {
        // Test to Story Ratio grand total
        let totalTestCases = 0;
        let totalStories = 0;
        let periodTestCases = 0;
        let periodStories = 0;
        let period1TestCases = 0;
        let period1Stories = 0;
        let period2TestCases = 0;
        let period2Stories = 0;

        dataRows.forEach(row => {
          totalTestCases += row.total_test_cases || 0;
          totalStories += row.total_stories || 0;
          // Single period mode
          if (row.period) {
            periodTestCases += row.period.total_test_cases || 0;
            periodStories += row.period.total_stories || 0;
          }
          // Comparison mode
          if (row.period1) {
            period1TestCases += row.period1.total_test_cases || 0;
            period1Stories += row.period1.total_stories || 0;
          }
          if (row.period2) {
            period2TestCases += row.period2.total_test_cases || 0;
            period2Stories += row.period2.total_stories || 0;
          }
        });

        const currentRatio = periodStories > 0 ? periodTestCases / periodStories : 0;
        const ratio1 = period1Stories > 0 ? period1TestCases / period1Stories : 0;
        const ratio2 = period2Stories > 0 ? period2TestCases / period2Stories : 0;
        const ratioDelta = ratio2 - ratio1;

        return {
          portfolio: 'Grand Total',
          portfolio_display: 'Grand Total',
          project_key: '',
          metric: 'test_story_ratio',
          metric_label: 'Test to Story Ratio',
          total_test_cases: totalTestCases,
          total_stories: totalStories,
          period: {
            from: dataRows[0]?.period?.from || '',
            to: dataRows[0]?.period?.to || '',
            total_test_cases: periodTestCases,
            total_stories: periodStories,
            ratio: Number(currentRatio.toFixed(2))
          },
          period1: enableComparison ? {
            from: dataRows[0]?.period1?.from || '',
            to: dataRows[0]?.period1?.to || '',
            total_test_cases: period1TestCases,
            total_stories: period1Stories,
            ratio: Number(ratio1.toFixed(2))
          } : undefined,
          period2: enableComparison ? {
            from: dataRows[0]?.period2?.from || '',
            to: dataRows[0]?.period2?.to || '',
            total_test_cases: period2TestCases,
            total_stories: period2Stories,
            ratio: Number(ratio2.toFixed(2))
          } : undefined,
          progress: enableComparison ? {
            ratio_change: ratioDelta,
            tests_change: period2TestCases - period1TestCases,
            stories_change: period2Stories - period1Stories,
            trend: ratioDelta > 0 ? 'improving' : ratioDelta < 0 ? 'declining' : 'stable'
          } : undefined,
          ai_analysis: enableComparison
            ? (() => {
                const change = ratioDelta > 0 ? 'improved' : ratioDelta < 0 ? 'declined' : 'remained stable';
                const changeText = ratioDelta > 0 ? `rising from ${ratio1.toFixed(2)} to ${ratio2.toFixed(2)} (+${ratioDelta.toFixed(2)})` : ratioDelta < 0 ? `dropping from ${ratio1.toFixed(2)} to ${ratio2.toFixed(2)} (${ratioDelta.toFixed(2)})` : `maintaining at ${ratio2.toFixed(2)}`;
                const recommendation = ratioDelta < 0 ? 'Recommendation: increase test case creation to improve test coverage per story and strengthen quality assurance.' : ratioDelta > 0 ? 'This positive trend indicates good progress. Continue maintaining the test-to-story ratio while ensuring test quality remains high.' : 'Focus area: maintain the current ratio while prioritizing test case quality and comprehensive coverage.';
                return `The test-to-story ratio across portfolios has ${change}, ${changeText}. The current state shows ${period2TestCases} test cases for ${period2Stories} stories. ${recommendation}`;
              })()
            : (() => {
                const status = currentRatio < 1.0 ? 'is below target' : currentRatio < 1.5 ? 'shows good progress' : 'demonstrates strong coverage';
                const recommendation = currentRatio < 1.0 ? 'Priority: increase test case creation to improve coverage, targeting 1.0+ tests per story to enhance quality assurance.' : currentRatio < 1.5 ? 'Next step: continue expanding test coverage to reach the 1.5+ target and further strengthen quality assurance.' : 'Maintenance: focus on maintaining quality and comprehensive coverage while preserving the strong ratio achieved.';
                return `Test-to-story ratio across portfolios ${status} at ${currentRatio.toFixed(2)}, with ${periodTestCases} test cases for ${periodStories} stories. ${recommendation}`;
              })(),
          ai_insights: enableComparison
            ? (() => {
                const change = ratioDelta > 0 ? 'improved' : ratioDelta < 0 ? 'declined' : 'remained stable';
                const changeText = ratioDelta > 0 ? `rising from ${ratio1.toFixed(2)} to ${ratio2.toFixed(2)} (+${ratioDelta.toFixed(2)})` : ratioDelta < 0 ? `dropping from ${ratio1.toFixed(2)} to ${ratio2.toFixed(2)} (${ratioDelta.toFixed(2)})` : `maintaining at ${ratio2.toFixed(2)}`;
                const recommendation = ratioDelta < 0 ? 'Recommendation: increase test case creation to improve test coverage per story and strengthen quality assurance.' : ratioDelta > 0 ? 'This positive trend indicates good progress. Continue maintaining the test-to-story ratio while ensuring test quality remains high.' : 'Focus area: maintain the current ratio while prioritizing test case quality and comprehensive coverage.';
                return `The test-to-story ratio across portfolios has ${change}, ${changeText}. The current state shows ${period2TestCases} test cases for ${period2Stories} stories. ${recommendation}`;
              })()
            : (() => {
                const status = currentRatio < 1.0 ? 'is below target' : currentRatio < 1.5 ? 'shows good progress' : 'demonstrates strong coverage';
                const recommendation = currentRatio < 1.0 ? 'Priority: increase test case creation to improve coverage, targeting 1.0+ tests per story to enhance quality assurance.' : currentRatio < 1.5 ? 'Next step: continue expanding test coverage to reach the 1.5+ target and further strengthen quality assurance.' : 'Maintenance: focus on maintaining quality and comprehensive coverage while preserving the strong ratio achieved.';
                return `Test-to-story ratio across portfolios ${status} at ${currentRatio.toFixed(2)}, with ${periodTestCases} test cases for ${periodStories} stories. ${recommendation}`;
              })(),
          generated_at: new Date().toISOString(),
          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
        } as Analysis;
      } else if (metric === 'bug_ratio') {
        // Bug Discovery Ratio grand total
        let periodBugs = 0;
        let periodTests = 0;
        let period1Bugs = 0;
        let period1Tests = 0;
        let period2Bugs = 0;
        let period2Tests = 0;

        dataRows.forEach(row => {
          // Single period mode
          if (row.period) {
            periodBugs += row.period.bugs_found || 0;
            periodTests += row.period.test_cases_executed || 0;
          }
          // Comparison mode
          if (row.period1) {
            period1Bugs += row.period1.bugs_found || 0;
            period1Tests += row.period1.test_cases_executed || 0;
          }
          if (row.period2) {
            period2Bugs += row.period2.bugs_found || 0;
            period2Tests += row.period2.test_cases_executed || 0;
          }
        });

        const currentRatio = periodTests > 0 ? periodBugs / periodTests : 0;
        const ratio1 = period1Tests > 0 ? period1Bugs / period1Tests : 0;
        const ratio2 = period2Tests > 0 ? period2Bugs / period2Tests : 0;
        const ratioDelta = ratio2 - ratio1;

        return {
          portfolio: 'Grand Total',
          portfolio_display: 'Grand Total',
          project_key: '',
          metric: 'bug_ratio',
          metric_label: 'Bug Discovery Ratio',
          period: {
            from: dataRows[0]?.period?.from || '',
            to: dataRows[0]?.period?.to || '',
            bugs_found: periodBugs,
            test_cases_executed: periodTests,
            ratio: Number(currentRatio.toFixed(4))
          },
          period1: enableComparison ? {
            from: dataRows[0]?.period1?.from || '',
            to: dataRows[0]?.period1?.to || '',
            bugs_found: period1Bugs,
            test_cases_executed: period1Tests,
            ratio: Number(ratio1.toFixed(4))
          } : undefined,
          period2: enableComparison ? {
            from: dataRows[0]?.period2?.from || '',
            to: dataRows[0]?.period2?.to || '',
            bugs_found: period2Bugs,
            test_cases_executed: period2Tests,
            ratio: Number(ratio2.toFixed(4))
          } : undefined,
          progress: enableComparison ? {
            ratio_change: ratioDelta,
            bugs_change: period2Bugs - period1Bugs,
            tests_change: period2Tests - period1Tests,
            trend: ratioDelta < 0 ? 'improving' : ratioDelta > 0 ? 'declining' : 'stable' // Lower is better
          } : undefined,
          ai_analysis: enableComparison
            ? (() => {
                const change = ratioDelta < 0 ? 'improved' : ratioDelta > 0 ? 'increased' : 'remained stable';
                const changeText = ratioDelta < 0 ? `declining from ${ratio1.toFixed(4)} to ${ratio2.toFixed(4)} (${ratioDelta.toFixed(4)})` : ratioDelta > 0 ? `rising from ${ratio1.toFixed(4)} to ${ratio2.toFixed(4)} (+${ratioDelta.toFixed(4)})` : `maintaining at ${ratio2.toFixed(4)}`;
                const recommendation = ratioDelta > 0 ? 'Immediate action: investigate root causes of increased bug discovery, review test effectiveness, and assess product quality trends to identify areas requiring attention.' : ratioDelta < 0 ? 'This positive trend reflects effective quality practices. Continue maintaining quality standards and test effectiveness to sustain this improvement.' : 'Monitoring: track bug discovery patterns and maintain test quality standards to ensure consistent product quality.';
                return `Bug discovery ratio across portfolios has ${change}, ${changeText}. During this period, ${period2Bugs} bugs were discovered across ${period2Tests} executed tests. ${recommendation}`;
              })()
            : (() => {
                const status = currentRatio > 0.1 ? 'indicates elevated bug discovery' : currentRatio > 0.05 ? 'shows moderate bug discovery' : 'reflects low bug discovery';
                const recommendation = currentRatio > 0.1 ? 'Priority: investigate root causes and implement quality improvements to reduce bug discovery rate and enhance product stability.' : currentRatio > 0.05 ? 'Monitoring: track patterns and maintain test effectiveness while continuing to monitor product quality trends.' : 'Maintenance: the low ratio indicates strong product quality. Continue maintaining these standards and test effectiveness.';
                return `Bug discovery ratio across portfolios ${status} at ${currentRatio.toFixed(4)}, with ${periodBugs} bugs found across ${periodTests} executed tests. ${recommendation}`;
              })(),
          ai_insights: enableComparison
            ? (() => {
                const change = ratioDelta < 0 ? 'improved' : ratioDelta > 0 ? 'increased' : 'remained stable';
                const changeText = ratioDelta < 0 ? `declining from ${ratio1.toFixed(4)} to ${ratio2.toFixed(4)} (${ratioDelta.toFixed(4)})` : ratioDelta > 0 ? `rising from ${ratio1.toFixed(4)} to ${ratio2.toFixed(4)} (+${ratioDelta.toFixed(4)})` : `maintaining at ${ratio2.toFixed(4)}`;
                const recommendation = ratioDelta > 0 ? 'Immediate action: investigate root causes of increased bug discovery, review test effectiveness, and assess product quality trends to identify areas requiring attention.' : ratioDelta < 0 ? 'This positive trend reflects effective quality practices. Continue maintaining quality standards and test effectiveness to sustain this improvement.' : 'Monitoring: track bug discovery patterns and maintain test quality standards to ensure consistent product quality.';
                return `Bug discovery ratio across portfolios has ${change}, ${changeText}. During this period, ${period2Bugs} bugs were discovered across ${period2Tests} executed tests. ${recommendation}`;
              })()
            : (() => {
                const status = currentRatio > 0.1 ? 'indicates elevated bug discovery' : currentRatio > 0.05 ? 'shows moderate bug discovery' : 'reflects low bug discovery';
                const recommendation = currentRatio > 0.1 ? 'Priority: investigate root causes and implement quality improvements to reduce bug discovery rate and enhance product stability.' : currentRatio > 0.05 ? 'Monitoring: track patterns and maintain test effectiveness while continuing to monitor product quality trends.' : 'Maintenance: the low ratio indicates strong product quality. Continue maintaining these standards and test effectiveness.';
                return `Bug discovery ratio across portfolios ${status} at ${currentRatio.toFixed(4)}, with ${periodBugs} bugs found across ${periodTests} executed tests. ${recommendation}`;
              })(),
          generated_at: new Date().toISOString(),
          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
        } as Analysis;
      } else if (metric === 'test_review_status') {
        // Test Case Review Status grand total
        let totalStories = 0;
        let periodReviewedYes = 0;
        let periodReviewedNo = 0;
        let periodNotSet = 0;
        let period1ReviewedYes = 0;
        let period1ReviewedNo = 0;
        let period1NotSet = 0;
        let period2ReviewedYes = 0;
        let period2ReviewedNo = 0;
        let period2NotSet = 0;

        dataRows.forEach(row => {
          totalStories += row.total_stories || 0;
          // Single period mode
          if (row.period) {
            periodReviewedYes += row.period.reviewed_yes || 0;
            periodReviewedNo += row.period.reviewed_no || 0;
            periodNotSet += row.period.not_set || 0;
          }
          // Comparison mode
          if (row.period1) {
            period1ReviewedYes += row.period1.reviewed_yes || 0;
            period1ReviewedNo += row.period1.reviewed_no || 0;
            period1NotSet += row.period1.not_set || 0;
          }
          if (row.period2) {
            period2ReviewedYes += row.period2.reviewed_yes || 0;
            period2ReviewedNo += row.period2.reviewed_no || 0;
            period2NotSet += row.period2.not_set || 0;
          }
        });

        const totalStoriesCurrent = periodReviewedYes + periodReviewedNo + periodNotSet || totalStories || 0;
        const totalStoriesP1 = period1ReviewedYes + period1ReviewedNo + period1NotSet || totalStories || 0;
        const totalStoriesP2 = period2ReviewedYes + period2ReviewedNo + period2NotSet || totalStories || 0;
        const currentPct = totalStoriesCurrent > 0 ? (periodReviewedYes / totalStoriesCurrent) * 100 : 0;
        const p1Pct = totalStoriesP1 > 0 ? (period1ReviewedYes / totalStoriesP1) * 100 : 0;
        const p2Pct = totalStoriesP2 > 0 ? (period2ReviewedYes / totalStoriesP2) * 100 : 0;
        const deltaPct = p2Pct - p1Pct;

        return {
          portfolio: 'Grand Total',
          portfolio_display: 'Grand Total',
          project_key: '',
          metric: 'test_review_status',
          metric_label: 'Test Case Review Status',
          total_stories: totalStories,
          period: {
            from: dataRows[0]?.period?.from || '',
            to: dataRows[0]?.period?.to || '',
            reviewed_yes: periodReviewedYes,
            reviewed_no: periodReviewedNo,
            not_set: periodNotSet,
            review_percentage: Number(currentPct.toFixed(1))
          },
          period1: enableComparison ? {
            from: dataRows[0]?.period1?.from || '',
            to: dataRows[0]?.period1?.to || '',
            reviewed_yes: period1ReviewedYes,
            reviewed_no: period1ReviewedNo,
            not_set: period1NotSet,
            review_percentage: Number(p1Pct.toFixed(1))
          } : undefined,
          period2: enableComparison ? {
            from: dataRows[0]?.period2?.from || '',
            to: dataRows[0]?.period2?.to || '',
            reviewed_yes: period2ReviewedYes,
            reviewed_no: period2ReviewedNo,
            not_set: period2NotSet,
            review_percentage: Number(p2Pct.toFixed(1))
          } : undefined,
          progress: enableComparison ? {
            percentage_change: deltaPct,
            new_reviewed: period2ReviewedYes - period1ReviewedYes,
            trend: deltaPct > 0 ? 'improving' : deltaPct < 0 ? 'declining' : 'stable'
          } : undefined,
          ai_analysis: enableComparison
            ? (() => {
                const change = deltaPct > 0 ? 'improved' : deltaPct < 0 ? 'declined' : 'remained stable';
                const changeText = deltaPct > 0 ? `rising from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (+${deltaPct.toFixed(1)}pp)` : deltaPct < 0 ? `dropping from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (${deltaPct.toFixed(1)}pp)` : `maintaining at ${p2Pct.toFixed(1)}%`;
                const recommendation = deltaPct < 0 ? 'Immediate action: prioritize test case reviews to ensure quality standards are maintained and coverage gaps are addressed.' : deltaPct > 0 ? 'This positive trend demonstrates good review discipline. Continue maintaining review practices to sustain quality assurance standards.' : 'Focus area: complete reviews for the remaining unreviewed stories to enhance overall quality assurance and ensure comprehensive coverage.';
                return `Test review status across portfolios has ${change}, ${changeText}. Currently, ${period2ReviewedYes} of ${totalStoriesP2} stories have been reviewed, with ${period2ReviewedNo} pending review. ${recommendation}`;
              })()
            : (() => {
                const status = currentPct < 70 ? 'requires attention' : currentPct < 90 ? 'shows good progress' : 'demonstrates strong review coverage';
                const recommendation = currentPct < 70 ? 'Priority: prioritize test case reviews to ensure quality standards and comprehensive coverage are maintained across all stories.' : currentPct < 90 ? 'Next step: complete reviews for remaining stories to reach the 90%+ target and further strengthen quality assurance.' : 'Maintenance: excellent review coverage achieved. Continue maintaining review discipline and address the remaining unreviewed stories.';
                return `Test review status across portfolios ${status} at ${currentPct.toFixed(1)}%, with ${periodReviewedYes} of ${totalStoriesCurrent} stories reviewed and ${periodReviewedNo} not yet reviewed. ${recommendation}`;
              })(),
          ai_insights: enableComparison
            ? (() => {
                const change = deltaPct > 0 ? 'improved' : deltaPct < 0 ? 'declined' : 'remained stable';
                const changeText = deltaPct > 0 ? `rising from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (+${deltaPct.toFixed(1)}pp)` : deltaPct < 0 ? `dropping from ${p1Pct.toFixed(1)}% to ${p2Pct.toFixed(1)}% (${deltaPct.toFixed(1)}pp)` : `maintaining at ${p2Pct.toFixed(1)}%`;
                const recommendation = deltaPct < 0 ? 'Immediate action: prioritize test case reviews to ensure quality standards are maintained and coverage gaps are addressed.' : deltaPct > 0 ? 'This positive trend demonstrates good review discipline. Continue maintaining review practices to sustain quality assurance standards.' : 'Focus area: complete reviews for the remaining unreviewed stories to enhance overall quality assurance and ensure comprehensive coverage.';
                return `Test review status across portfolios has ${change}, ${changeText}. Currently, ${period2ReviewedYes} of ${totalStoriesP2} stories have been reviewed, with ${period2ReviewedNo} pending review. ${recommendation}`;
              })()
            : (() => {
                const status = currentPct < 70 ? 'requires attention' : currentPct < 90 ? 'shows good progress' : 'demonstrates strong review coverage';
                const recommendation = currentPct < 70 ? 'Priority: prioritize test case reviews to ensure quality standards and comprehensive coverage are maintained across all stories.' : currentPct < 90 ? 'Next step: complete reviews for remaining stories to reach the 90%+ target and further strengthen quality assurance.' : 'Maintenance: excellent review coverage achieved. Continue maintaining review discipline and address the remaining unreviewed stories.';
                return `Test review status across portfolios ${status} at ${currentPct.toFixed(1)}%, with ${periodReviewedYes} of ${totalStoriesCurrent} stories reviewed and ${periodReviewedNo} not yet reviewed. ${recommendation}`;
              })(),
          generated_at: new Date().toISOString(),
          current_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          previous_week: { bugs_count: 0, defects_count: 0, leakage_percentage: 0, total_issues: 0, date_range: '' },
          comparison: { leakage_change: 0, leakage_change_percentage: 0, bugs_change: 0, defects_change: 0, trend: 'stable', severity: 'normal' }
        } as Analysis;
      }
    }

    // Original defect leakage calculation
    const totals = {
      bugs: 0,
      defects: 0,
      prevBugs: 0,
      prevDefects: 0,
    };

    dataRows.forEach(row => {
      totals.bugs += row.current_week.bugs_count ?? 0;
      totals.defects += row.current_week.defects_count ?? 0;
      totals.prevBugs += row.previous_week.bugs_count ?? 0;
      totals.prevDefects += row.previous_week.defects_count ?? 0;
    });

    const currTotal = totals.bugs + totals.defects;
    const prevTotal = totals.prevBugs + totals.prevDefects;
    const currLeakage = currTotal > 0 ? (totals.defects / currTotal) * 100 : 0;
    const prevLeakage = prevTotal > 0 ? (totals.prevDefects / prevTotal) * 100 : 0;
    const delta = currLeakage - prevLeakage;

    return {
      portfolio: 'Grand Total',
      portfolio_display: 'Grand Total',
      project_key: '',
      current_week: {
        bugs_count: totals.bugs,
        defects_count: totals.defects,
        leakage_percentage: Number(currLeakage.toFixed(2)),
        total_issues: currTotal,
        date_range: '',
      },
      previous_week: {
        bugs_count: totals.prevBugs,
        defects_count: totals.prevDefects,
        leakage_percentage: Number(prevLeakage.toFixed(2)),
        total_issues: prevTotal,
        date_range: '',
      },
      comparison: {
        leakage_change: Number(delta.toFixed(2)),
        leakage_change_percentage: prevLeakage > 0 ? Number(((delta / prevLeakage) * 100).toFixed(2)) : 0,
        bugs_change: totals.bugs - totals.prevBugs,
        defects_change: totals.defects - totals.prevDefects,
        trend: delta > 2 ? 'worsening' : delta < -2 ? 'improving' : 'stable',
        severity: 'normal',
      },
      ai_insights: enableComparison
      ? (() => {
          const absDelta = Math.abs(delta);
          if (delta < -10) {
            return `Leakage improved by ${absDelta.toFixed(1)}% (${prevLeakage.toFixed(1)}% to ${currLeakage.toFixed(1)}%). Positive movement. Continue reuse of automation framework and expand coverage.`;
          } else if (delta > 15) {
            return `Leakage increased sharply by ${absDelta.toFixed(1)}% (${totals.defects} defect${totals.defects !== 1 ? 's' : ''} leaked). High-risk module. Recommendation: Strengthen regression suite, perform RCA, review unit test coverage.`;
          } else if (delta > 0) {
            return `Defect leakage has increased by ~${absDelta.toFixed(0)}% compared to previous period. Conduct RCA, strengthen pre-release gates.`;
          } else if (delta < 0) {
            return `Defect leakage has reduced by ~${absDelta.toFixed(0)}% compared to previous period. Positive movement. Continue current testing strategies.`;
          } else {
            return `Defect leakage has remained stable at ${currLeakage.toFixed(1)}% compared to previous period.`;
          }
        })()
      : `Overall defect leakage for the period is ${currLeakage.toFixed(1)}% with ${totals.defects} defect${totals.defects !== 1 ? 's' : ''} from ${currTotal} total issues.`,
      generated_at: new Date().toISOString(),
    };
  };

  const extractWeekEnding = (range?: string) => {
    if (!range) return '';
    const parts = range.split('to');
    const raw = (parts.length > 1 ? parts[1] : parts[0]).trim();
    return formatDate(raw);
  };

  // Helper to extract date labels from report data (frozen at generation time)
  // This ensures headers don't change when date filters are modified after report generation
  const getDateLabelsFromReportData = () => {
    if (dateFilterMode === 'weekly') {
      const firstRow = rows && rows.length > 0 ? rows[0] : null;
      return {
        current: formatWeekEndingShort(
          analysis?.period2?.to || analysis?.period?.to || firstRow?.period2?.to || firstRow?.period?.to || currentTo
        ),
        previous: formatWeekEndingShort(
          analysis?.period1?.to || firstRow?.period1?.to || previousTo
        )
      };
    }

    if (dateFilterMode === 'month') {
      return {
        current: formatMonthYearLabel(selectedMonth, selectedYear),
        previous: enableComparison
          ? formatMonthYearLabel(comparisonMonth, comparisonYear)
          : formatMonthYearLabel(selectedMonth, selectedYear)
      };
    }

    // For single analysis (defect leakage)
    if (analysis) {
      // Check if it's defect leakage with date_range
      if (analysis.current_week?.date_range) {
        return {
          current: extractWeekEnding(analysis.current_week.date_range),
          previous: analysis.previous_week?.date_range
            ? extractWeekEnding(analysis.previous_week.date_range)
            : formatDate(previousTo)
        };
      }
      // For period-based metrics, use period.to dates
      if (analysis.period?.to) {
        return {
          current: formatDate(analysis.period.to),
          previous: enableComparison && analysis.period1?.to
            ? formatDate(analysis.period1.to)
            : formatDate(previousTo)
        };
      }
      if (analysis.period2?.to) {
        return {
          current: formatDate(analysis.period2.to),
          previous: analysis.period1?.to
            ? formatDate(analysis.period1.to)
            : formatDate(previousTo)
        };
      }
    }

    // For rows (multi-project/multi-metric), extract from first row
    if (rows && rows.length > 0) {
      const firstRow = rows[0];
      // Check for defect leakage date_range
      if (firstRow.current_week?.date_range) {
        return {
          current: extractWeekEnding(firstRow.current_week.date_range),
          previous: firstRow.previous_week?.date_range
            ? extractWeekEnding(firstRow.previous_week.date_range)
            : formatDate(previousTo)
        };
      }
      // Check for period-based metrics
      if (firstRow.period?.to) {
        return {
          current: formatDate(firstRow.period.to),
          previous: enableComparison && firstRow.period1?.to
            ? formatDate(firstRow.period1.to)
            : formatDate(previousTo)
        };
      }
      if (firstRow.period2?.to) {
        return {
          current: formatDate(firstRow.period2.to),
          previous: firstRow.period1?.to
            ? formatDate(firstRow.period1.to)
            : formatDate(previousTo)
        };
      }
    }

    // Fallback to current filter state (only if no report data exists)
    return {
      current: formatDate(currentTo),
      previous: formatDate(previousTo)
    };
  };

  const reportDateLabels = getDateLabelsFromReportData();
  const selectedWeekEndingPrevious = formatDate(previousTo);
  const selectedWeekEndingCurrent = formatDate(currentTo);
  const previousWeekEndingLabel = reportDateLabels.previous;
  const currentWeekEndingLabel = reportDateLabels.current;
  const todayDisplayLabel = formatDate(currentTo);
  const qualityHeaderComparisonNote = getComparisonPINote();

  const getQualityMetricsHeaderTitle = () => {
    const piContext = getReportPIContext();
    if (piContext) return `${piContext.year} - ${piContext.pi} Weekly Quality Metrics`;
    return 'Quality Metrics';
  };

  const getQualityMetricsPeriodLabel = () => {
    if (enableComparison) return `Period: ${previousWeekEndingLabel} vs ${currentWeekEndingLabel}`;
    return `Period: ${currentWeekEndingLabel}`;
  };

  // Display labels
  const portfolioLabel = analysis?.portfolio_display || selectedPortfolio || 'All';
  const projectLabel = analysis?.project_label || (
    useMultiSelect && selectedProjectKeys.length > 0
      ? `${selectedProjectKeys.length} projects selected`
      : selectedProjectKey !== 'All'
        ? selectedProjectKey
        : 'All'
  );
  const projectKeyDisplay = analysis?.project_key || (
    useMultiSelect && selectedProjectKeys.length > 0
      ? selectedProjectKeys.join(', ')
      : selectedProjectKey
  );
  const metricLabel = analysis?.metric_label || activeMetricOption?.label || 'Weekly Defects Leakage';
  const metricDescription = activeMetricOption?.description || 'Defects / [Defects + Bugs] for the reporting period';
  const commentText = analysis ? buildCommentText(analysis as any, metricLabel) : '';
  const currentWeekDebug = analysis?.current_week;
  const bugKeys = currentWeekDebug?.bugs_keys ?? [];
  const defectKeys = currentWeekDebug?.defects_keys ?? [];
  const bugsJql = currentWeekDebug?.bugs_jql || '';
  const defectsJql = currentWeekDebug?.defects_jql || '';
  const hasGeneratedReport = Boolean(analysis || (rows && rows.length));

  const getReportMetricNamesForMail = () => {
    if (useMetricMultiSelect && onlyVisibleTcoeMetrics(selectedMetrics).length > 0) {
      return onlyVisibleTcoeMetrics(selectedMetrics)
        .map((metricValue) => VISIBLE_METRIC_OPTIONS.find((option) => option.value === metricValue)?.label || metricValue)
        .join(', ');
    }

    if (selectedMetric === 'all') {
      return VISIBLE_METRIC_OPTIONS
        .filter((option) => !option.disabled)
        .map((option) => option.label)
        .join(', ');
    }

    return metricLabel;
  };

  const getReportFileLabel = () => {
    const label = currentWeekEndingLabel || selectedWeekEndingCurrent || 'tcoe';
    return label.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'tcoe';
  };

  const getReportHtmlForMail = () => {
    const reportElement = document.getElementById('tcoe-report');
    if (!reportElement) return '';

    const clone = reportElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button, [data-email-hidden="true"]').forEach((node) => node.remove());
    clone.querySelectorAll('script, style').forEach((node) => node.remove());
    clone.style.background = '#ffffff';
    clone.style.color = '#111827';
    clone.style.padding = '0';
    clone.style.width = '100%';
    clone.style.maxWidth = '100%';

    return clone.outerHTML;
  };

  const getDefaultMailSubject = () => `QCoE WSR - ${currentWeekEndingLabel || selectedWeekEndingCurrent}`;

  const getDefaultMailBody = () => [
    `Leaders - Please find attached the QCoE WSR for the week ending ${currentWeekEndingLabel || selectedWeekEndingCurrent}. Please review the attached PDF for additional details.`,
    '',
    `Report: ${getQualityMetricsHeaderTitle()}`,
    getQualityMetricsPeriodLabel(),
    `Metrics: ${getReportMetricNamesForMail()}`,
    '',
    'Thanks,',
    'Team QCoE'
  ].join('\n');

  const openMailDialog = () => {
    if (!hasGeneratedReport) return;
    setMailSubject(getDefaultMailSubject());
    setMailBody(getDefaultMailBody());
    setMailStatus(null);
    setMailError(null);
    setMailDialogOpen(true);
  };

  const handleExportPDF = async () => {
    if (!hasGeneratedReport) return;
    try {
      setExportingPDF(true);
      const filenameLabel = getReportFileLabel();
      
      // Use the frontend html2canvas approach to capture the exact UI appearance
      // This captures the styled report with colors, AI insights, and all formatting
      await exportTcoeReportAsPDF('tcoe-report', `qcoe_${selectedMetric || 'report'}_${filenameLabel}.pdf`);
    } catch (error) {
      console.error('Failed to export QCOE metric PDF:', error);
    } finally {
      setExportingPDF(false);
    }
  };

  const handleExportJPG = async () => {
    try {
      setExportingJPG(true);
      const filenameLabel = currentWeekEndingLabel || selectedWeekEndingCurrent || new Date().toISOString().split('T')[0];
      await exportQcoeReportAsJPG('tcoe-report', `qcoe_${selectedMetric || 'report'}_${filenameLabel}.jpg`);
    } catch (error) {
      console.error('Failed to export QCOE metric JPG:', error);
    } finally {
      setExportingJPG(false);
    }
  };

  const handleSendMail = async () => {
    if (!hasGeneratedReport) return;
    if (!mailTo.trim()) {
      setMailError('Add at least one recipient in the To field.');
      setMailStatus(null);
      return;
    }

    try {
      setSendingMail(true);
      setMailError(null);
      setMailStatus('Preparing PDF attachment...');

      const filename = `QCoE - Weekly Status Report - ${getReportFileLabel()}.pdf`;
      const pdfBlob = await createTcoeReportPDFBlob('tcoe-report');
      const formData = new FormData();
      formData.append('to', mailTo);
      formData.append('cc', mailCc);
      formData.append('subject', mailSubject || getDefaultMailSubject());
      formData.append('body', mailBody || getDefaultMailBody());
      formData.append('filename', filename);
      formData.append('report_title', getQualityMetricsHeaderTitle());
      formData.append('report_period', getQualityMetricsPeriodLabel());
      formData.append('metrics', getReportMetricNamesForMail());
      formData.append('report_html', getReportHtmlForMail());
      formData.append('pdf', pdfBlob, filename);

      setMailStatus('Sending mail...');

      const response = await fetch(getApiUrl('/api/quality/send-tcoe-report-email'), {
        method: 'POST',
        body: formData
      });
      const responseBody = await response.json().catch(() => ({}));

      if (!response.ok || responseBody?.success === false) {
        throw new Error(responseBody?.detail || responseBody?.message || 'Failed to send mail.');
      }

      setMailStatus('Mail sent successfully.');
    } catch (error) {
      console.error('Failed to send QCOE report mail:', error);
      setMailError(error instanceof Error ? error.message : 'Failed to send mail.');
      setMailStatus(null);
    } finally {
      setSendingMail(false);
    }
  };

  const handleExportExcel = async () => {
    if (!hasGeneratedReport) return;
    try {
      setExportingExcel(true);
      const filenameLabel = getReportFileLabel();
      if (rows && rows.length) {
        const exportRows = rows.map((row) => ({
          portfolio: row.portfolio_display || row.portfolio,
          projectLabel: row.project_label || '',
          projectKey: row.project_key || '',
          metricName: metricLabel,
          bugs: row.current_week.bugs_count,
          defects: row.current_week.defects_count,
          previousLabel: previousWeekEndingLabel,
          previousLeakage: row.previous_week.leakage_percentage,
          currentLabel: currentWeekEndingLabel,
          currentLeakage: row.current_week.leakage_percentage,
          wowProgress: row.comparison.leakage_change,
          comments: buildCommentText(row as any, metricLabel),
          bugKeys: row.current_week.bugs_keys ?? [],
          defectKeys: row.current_week.defects_keys ?? [],
          bugsJql: row.current_week.bugs_jql || '',
          defectsJql: row.current_week.defects_jql || ''
        }));
        await exportTcoeReportAsExcelMulti(exportRows, `tcoe-report-${filenameLabel}.xlsx`);
      } else if (analysis) {
        await exportTcoeReportAsExcel({
          portfolio: portfolioLabel,
          projectLabel,
          metricName: metricLabel,
          projectKey: projectKeyDisplay,
          bugs: analysis.current_week.bugs_count,
          defects: analysis.current_week.defects_count,
          previousLabel: previousWeekEndingLabel,
          previousLeakage: analysis.previous_week.leakage_percentage,
          currentLabel: currentWeekEndingLabel,
          currentLeakage: analysis.current_week.leakage_percentage,
          wowProgress: analysis.comparison.leakage_change,
          comments: commentText,
          bugKeys,
          defectKeys,
          bugsJql,
          defectsJql
        }, `tcoe-report-${filenameLabel}.xlsx`);
      }
    } catch (error) {
      console.error('Failed to export QCOE report Excel:', error);
    } finally {
      setExportingExcel(false);
    }
  };

  // Color palette from theme
  const colorPalette = {
    positive: {
      icon: currentTheme.colors.success,
      background: `${currentTheme.colors.success}20`
    },
    warning: {
      icon: currentTheme.colors.warning,
      text: currentTheme.colors.warning,
      background: `${currentTheme.colors.warning}25`
    },
    negative: {
      icon: currentTheme.colors.error,
      background: `${currentTheme.colors.error}20`
    }
  };

  // Get status icon based on leakage value and change
  const getStatusIcon = (leakage: number, change?: number) => {
    if (change !== undefined) {
      if (change < -10) return { icon: TrendingDown, color: colorPalette.positive.icon, label: 'Great' };
      if (change < -2) return { icon: TrendingDown, color: colorPalette.positive.icon, label: 'Good' };
      if (change > 10) return { icon: TrendingUp, color: colorPalette.negative.icon, label: 'Bad' };
      if (change > 2) return { icon: TrendingUp, color: colorPalette.warning.icon, label: 'Warning' };
      if (Math.abs(change) <= 2) return { icon: Equal, color: currentTheme.colors.textSecondary, label: 'Equal' };
      return { icon: Minus, color: currentTheme.colors.textSecondary, label: 'Neutral' };
    }

    if (leakage >= 60) return { icon: AlertTriangle, color: colorPalette.negative.icon, label: 'Bad' };
    if (leakage >= 40) return { icon: AlertTriangle, color: colorPalette.warning.icon, label: 'Warning' };
    if (leakage <= 10) return { icon: Check, color: colorPalette.positive.icon, label: 'Great' };
    if (leakage <= 25) return { icon: Check, color: colorPalette.positive.icon, label: 'Good' };
    return { icon: Minus, color: currentTheme.colors.textSecondary, label: 'Neutral' };
  };

  const cardBackground = currentTheme.colors.surface;
  const borderColor = `${currentTheme.colors.border}80`;
  const headingColor = currentTheme.colors.text;
  const subheadingColor = currentTheme.colors.textSecondary;
  const tableHeaderBg = `${currentTheme.colors.primary}15`;
  const tableHeaderText = currentTheme.colors.text;
  const tableBorderColor = `${currentTheme.colors.border}99`;
  const pdfContainerBg = currentTheme.colors.background;
  const pdfHeaderBg = `${currentTheme.colors.primary}20`;
  const pdfHeaderText = currentTheme.colors.text;
  const pdfGrandTotalBg = currentTheme.colors.primary;
  const pdfGrandTotalText = '#FFFFFF';

  return (
    <DashboardLayout className="transition-all duration-300">
      <div className="flex-1 min-h-0 p-6 space-y-8 w-full pb-8 overflow-auto">
        <Dialog
          open={mailDialogOpen}
          onOpenChange={(open) => {
            if (!sendingMail) setMailDialogOpen(open);
          }}
        >
          <DialogContent
            className="sm:max-w-2xl"
            style={{
              backgroundColor: cardBackground,
              borderColor: borderColor,
              color: headingColor
            }}
          >
            <DialogHeader>
              <DialogTitle>Send Report Mail</DialogTitle>
              <DialogDescription className="sr-only">
                Send the generated QCoE report with the PDF attached.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="tcoe-mail-to">To</Label>
                <Input
                  id="tcoe-mail-to"
                  value={mailTo}
                  onChange={(event) => setMailTo(event.target.value)}
                  placeholder="name@company.com; another@company.com"
                  disabled={sendingMail}
                  style={{
                    backgroundColor: pdfContainerBg,
                    borderColor: borderColor,
                    color: headingColor
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tcoe-mail-cc">CC</Label>
                <Input
                  id="tcoe-mail-cc"
                  value={mailCc}
                  onChange={(event) => setMailCc(event.target.value)}
                  placeholder="optional"
                  disabled={sendingMail}
                  style={{
                    backgroundColor: pdfContainerBg,
                    borderColor: borderColor,
                    color: headingColor
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tcoe-mail-subject">Subject</Label>
                <Input
                  id="tcoe-mail-subject"
                  value={mailSubject}
                  onChange={(event) => setMailSubject(event.target.value)}
                  disabled={sendingMail}
                  style={{
                    backgroundColor: pdfContainerBg,
                    borderColor: borderColor,
                    color: headingColor
                  }}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tcoe-mail-body">Message</Label>
                <textarea
                  id="tcoe-mail-body"
                  value={mailBody}
                  onChange={(event) => setMailBody(event.target.value)}
                  rows={8}
                  disabled={sendingMail}
                  className="w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: pdfContainerBg,
                    borderColor: borderColor,
                    color: headingColor,
                    resize: 'vertical'
                  }}
                />
              </div>

              {mailError && (
                <Alert style={{ borderColor: `${currentTheme.colors.error}66`, backgroundColor: `${currentTheme.colors.error}12` }}>
                  <AlertTriangle className="h-4 w-4" style={{ color: currentTheme.colors.error }} />
                  <AlertDescription style={{ color: headingColor }}>{mailError}</AlertDescription>
                </Alert>
              )}

              {mailStatus && (
                <Alert style={{ borderColor: `${currentTheme.colors.success}66`, backgroundColor: `${currentTheme.colors.success}12` }}>
                  <Check className="h-4 w-4" style={{ color: currentTheme.colors.success }} />
                  <AlertDescription style={{ color: headingColor }}>{mailStatus}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                className="fx-pill"
                onClick={() => setMailDialogOpen(false)}
                disabled={sendingMail}
                style={{
                  backgroundColor: pdfContainerBg,
                  color: headingColor,
                  borderColor: borderColor,
                  borderWidth: '1px',
                  borderStyle: 'solid'
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="fx-pill"
                onClick={handleSendMail}
                disabled={sendingMail || !mailTo.trim()}
                style={{
                  backgroundColor: currentTheme.colors.primary,
                  color: '#FFFFFF',
                  borderColor: currentTheme.colors.primary,
                  borderWidth: '1px',
                  borderStyle: 'solid'
                }}
              >
                <Send className={`h-4 w-4 mr-2 ${sendingMail ? 'animate-pulse' : ''}`} />
                {sendingMail ? 'Sending...' : 'Send Mail'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p style={{ color: 'var(--accent-cool)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              QA Centre of Excellence
            </p>
            <h1
              style={{
                fontFamily: 'var(--font)',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: 'var(--text-primary)',
              }}
            >
              CDK QCOE Metrics
            </h1>
            {(useMultiSelect && selectedProjectKeys.length > 0) && (
              <div className="mt-2">
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    fontSize: 11, fontWeight: 600,
                    color: 'var(--accent-cool)',
                    backgroundColor: 'var(--accent-cool-bg)',
                    border: isDarkMode ? '1px solid rgba(212,168,71,0.25)' : '1px solid rgba(24,120,185,0.25)',
                    borderRadius: 6, padding: '2px 8px',
                  }}
                >
                  {selectedProjectKeys.length} Projects Selected
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              onClick={analyzeLeakage}
              className="fx-pill flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-opacity duration-150 hover:opacity-85 focus-visible:outline-none"
              style={{
                backgroundColor: 'var(--accent-cool)',
                color: 'var(--bg-page)',
                borderRadius: isDarkMode ? '12px' : undefined,
                border: 'none',
              }}
              disabled={loading || catalogLoading || Boolean(catalogError) || projectCatalog.length === 0}
            >
              <RefreshCw className={`h-4 w-4 ${loading || catalogLoading ? 'animate-spin' : ''}`} />
              {catalogLoading ? 'Loading Jira Projects...' : loading ? 'Loading...' : 'Generate'}
            </Button>
            <Button
              onClick={handleExportExcel}
              className="fx-pill rounded-xl px-4 py-2 text-sm font-medium transition-opacity duration-150 hover:opacity-85"
              style={{
                backgroundColor: cardBackground,
                color: headingColor,
                borderColor: borderColor,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: isDarkMode ? '12px' : undefined
              }}
              disabled={!hasGeneratedReport || exportingExcel}
            >
              <FileText className="h-4 w-4 mr-2" />
              {exportingExcel ? 'Exporting...' : 'CSV'}
            </Button>
            <Button
              onClick={handleExportPDF}
              className="fx-pill rounded-xl px-4 py-2 text-sm font-medium transition-opacity duration-150 hover:opacity-85"
              style={{
                backgroundColor: cardBackground,
                color: headingColor,
                borderColor: borderColor,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: isDarkMode ? '12px' : undefined
              }}
              disabled={!hasGeneratedReport || exportingPDF}
            >
              <Download className="h-4 w-4 mr-2" />
              {exportingPDF ? 'Exporting...' : 'Export PDF (One Page)'}
            </Button>
            <Button
              onClick={handleExportJPG}
              className="fx-pill rounded-xl px-4 py-2 text-sm font-medium transition-opacity duration-150 hover:opacity-85"
              style={{
                backgroundColor: cardBackground,
                color: headingColor,
                borderColor: borderColor,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: isDarkMode ? '12px' : undefined
              }}
              disabled={!hasGeneratedReport || exportingJPG}
            >
              <FileImage className="h-4 w-4 mr-2" />
              {exportingJPG ? 'Exporting...' : 'Export as Image'}
            </Button>
            <Button
              onClick={openMailDialog}
              className="fx-pill rounded-xl px-4 py-2 text-sm font-medium transition-opacity duration-150 hover:opacity-85"
              style={{
                backgroundColor: cardBackground,
                color: headingColor,
                borderColor: borderColor,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: isDarkMode ? '12px' : undefined
              }}
              disabled={!hasGeneratedReport || sendingMail}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Mail
            </Button>
          </div>
        </div>

        {/* Filters Card with Gradient */}
        <div
          className="rounded-xl shadow-sm p-4"
          style={{
            backgroundColor: cardBackground,
            borderColor: borderColor,
            borderWidth: '1px',
            borderStyle: 'solid'
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Portfolio - Multi-select dropdown */}
            <div className="relative">
            <label className="text-sm font-medium mb-2 block" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
              Portfolio
            </label>
              <div
                className="w-full px-3 py-2 rounded-xl border cursor-pointer flex items-center justify-between transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-[#1878B9]/70 focus-within:border-[#1878B9] dark:focus-within:ring-blue-500/70 dark:focus-within:border-blue-500"
                style={{
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(51, 65, 85, 0.8))'
                    : `linear-gradient(135deg, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`,
                  borderColor: portfolioMultiSelectOpen ? currentTheme.colors.primary : borderColor,
                  color: headingColor,
                  borderRadius: '12px',
                  boxShadow: portfolioMultiSelectOpen
                    ? `0 4px 12px ${currentTheme.colors.primary}25`
                    : '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}
                onClick={() => {
                if (portfolioMultiSelectOpen) {
                  // Closing - auto-apply temporary selections if they changed
                  const hasChanges = JSON.stringify(tempSelectedPortfolios.sort()) !== JSON.stringify(selectedPortfolios.sort());
                  if (hasChanges && tempSelectedPortfolios.length > 0) {
                    setSelectedPortfolios([...tempSelectedPortfolios]);
                    setUsePortfolioMultiSelect(true);
                    setSelectedPortfolio('All');
                  }
                } else {
                  // Opening - initialize temp selections with current applied selections
                  setTempSelectedPortfolios([...selectedPortfolios]);
                }
                setPortfolioMultiSelectOpen(!portfolioMultiSelectOpen);
              }}
            >
              <span>
                {selectedPortfolios.length > 0
                  ? `${selectedPortfolios.length} selected`
                  : selectedPortfolio}
              </span>
              <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Portfolio Multi-select dropdown with gradient */}
            {portfolioMultiSelectOpen && (
              <div
                className="absolute left-0 top-full z-[9999] mt-2 p-4 rounded-xl border w-full backdrop-blur-sm"
                  style={{
                    background: isDarkMode
                      ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95))'
                      : 'var(--bg-card)',
                    borderColor: currentTheme.colors.primary,
                    minWidth: '280px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    boxShadow: isDarkMode
                      ? `0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3), 0 0 0 1px ${currentTheme.colors.primary}40`
                      : `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px ${currentTheme.colors.primary}30`
                }}
              >
                <div className="flex items-center justify-between mb-3 pb-3 border-b" style={{ borderColor: currentTheme.colors.border }}>
                  <span className="text-sm font-semibold" style={{ color: headingColor }}>Select Portfolios</span>
                  <div className="flex gap-1">
                    <button
                      className="text-xs px-2 py-1 rounded-lg transition-all duration-200 hover:bg-[var(--accent-primary)]/10"
                      onClick={(e) => { e.stopPropagation(); selectAllPortfolios(); }}
                      style={{ color: currentTheme.colors.primary, borderRadius: '8px' }}
                    >
                      All
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded-lg transition-all duration-200 hover:bg-[var(--accent-primary)]/10"
                      onClick={(e) => { e.stopPropagation(); setTempSelectedPortfolios([]); }}
                      style={{ color: currentTheme.colors.textSecondary, borderRadius: '8px' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Type to search..."
                  value={portfolioSearch}
                  onChange={(e) => setPortfolioSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{
                    background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'var(--bg-surface)',
                    borderColor: currentTheme.colors.border,
                    color: currentTheme.colors.text,
                  }}
                  autoFocus
                />
                <div className="space-y-1">
                  {options.portfolios.filter(p => p === 'All' || p.toLowerCase().includes(portfolioSearch.toLowerCase())).map((portfolio) => {
                    const isAll = portfolio === 'All';
                    const isSelected = isAll
                      ? tempSelectedPortfolios.length === 0 && selectedPortfolio === 'All'
                      : tempSelectedPortfolios.includes(portfolio);
                    return (
                      <div
                        key={portfolio}
                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-150"
                      style={{
                          backgroundColor: isSelected ? `${currentTheme.colors.primary}15` : 'transparent',
                          border: `1px solid ${isSelected ? currentTheme.colors.primary : 'transparent'}`
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAll) {
                            setTempSelectedPortfolios([]);
                            setSelectedPortfolios([]); // Clear applied selections
                            setSelectedPortfolio('All');
                            setUsePortfolioMultiSelect(false);
                            setPortfolioMultiSelectOpen(false);
                          } else {
                            togglePortfolio(portfolio);
                          }
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center transition-all duration-150"
                          style={{
                            borderWidth: '2px',
                            borderStyle: 'solid',
                            borderColor: isSelected ? currentTheme.colors.primary : currentTheme.colors.border,
                            backgroundColor: isSelected ? currentTheme.colors.primary : 'transparent'
                          }}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
            </div>
                        <span className="text-sm font-medium" style={{ color: headingColor }}>{portfolio}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: currentTheme.colors.border }}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 fx-pill"
                    onClick={(e) => { e.stopPropagation(); cancelPortfolioMultiSelect(); }}
                    style={{
                      borderColor: currentTheme.colors.border,
                      color: currentTheme.colors.textSecondary
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 fx-pill"
                    onClick={(e) => { e.stopPropagation(); applyPortfolioMultiSelect(); }}
                    disabled={tempSelectedPortfolios.length === 0}
                    style={{
                      backgroundColor: tempSelectedPortfolios.length > 0 ? currentTheme.colors.primary : currentTheme.colors.border,
                      color: '#FFFFFF',
                      opacity: tempSelectedPortfolios.length > 0 ? 1 : 0.5
                    }}
                  >
                    Apply {tempSelectedPortfolios.length > 0 ? `(${tempSelectedPortfolios.length})` : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Project - Multi-select dropdown */}
          <div className="relative">
            <label className="text-sm font-medium mb-2 block" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
              Project
            </label>
            <div
              className="w-full px-3 py-2 rounded-xl border cursor-pointer flex items-center justify-between transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-[#1878B9]/70 focus-within:border-[#1878B9] dark:focus-within:ring-blue-500/70 dark:focus-within:border-blue-500"
                style={{
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(51, 65, 85, 0.8))'
                    : `linear-gradient(135deg, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`,
                  borderColor: multiSelectOpen ? currentTheme.colors.primary : borderColor,
                  color: headingColor,
                  borderRadius: '12px',
                  boxShadow: multiSelectOpen
                    ? `0 4px 12px ${currentTheme.colors.primary}25`
                    : '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}
              onClick={() => {
                if (multiSelectOpen) {
                  // Closing - auto-apply temporary selections if they changed
                  const hasChanges = JSON.stringify(tempSelectedProjectKeys.sort()) !== JSON.stringify(selectedProjectKeys.sort());
                  if (hasChanges && tempSelectedProjectKeys.length > 0) {
                    setSelectedProjectKeys([...tempSelectedProjectKeys]);
                    setUseMultiSelect(true);
                    setSelectedProjectKey('All');
                    const tempNames = tempSelectedProjectKeys.map(key => findProjectNameForKey(key)).filter((name): name is string => name !== null);
                    if (tempNames.length === 1) {
                      setSelectedProjectName(tempNames[0]);
                    } else if (tempNames.length > 1) {
                      setSelectedProjectName('All');
                    }
                  }
                } else {
                  // Opening - initialize temp selections with current applied selections
                  setTempSelectedProjectKeys([...selectedProjectKeys]);
                }
                setMultiSelectOpen(!multiSelectOpen);
              }}
            >
              <span>
                {useMultiSelect && selectedProjectKeys.length > 0
                  ? `${selectedProjectKeys.length} selected`
                  : selectedProjectKey !== 'All'
                    ? `${findProjectNameForKey(selectedProjectKey) || selectedProjectKey} (${selectedProjectKey})`
                    : selectedProjectKey}
              </span>
              <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Project Multi-select dropdown with gradient */}
            {multiSelectOpen && (
              <div
                className="absolute left-0 top-full z-[9999] mt-2 p-4 rounded-xl border w-full backdrop-blur-sm"
                style={{
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95))'
                    : 'var(--bg-card)',
                  borderColor: currentTheme.colors.primary,
                  minWidth: '300px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  boxShadow: isDarkMode
                    ? `0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3), 0 0 0 1px ${currentTheme.colors.primary}40`
                    : `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px ${currentTheme.colors.primary}30`
                }}
              >
                <div className="flex items-center justify-between mb-3 pb-3 border-b" style={{ borderColor: currentTheme.colors.border }}>
                  <span className="text-sm font-semibold" style={{ color: headingColor }}>Select Projects</span>
                  <div className="flex gap-1">
                    <button
                      className="text-xs px-2 py-1 rounded-lg transition-all duration-200 hover:bg-[var(--accent-primary)]/10"
                      onClick={(e) => { e.stopPropagation(); selectAllProjectKeys(); }}
                      style={{ color: currentTheme.colors.primary, borderRadius: '8px' }}
                    >
                      All
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded-lg transition-all duration-200 hover:bg-[var(--accent-primary)]/10"
                      onClick={(e) => { e.stopPropagation(); setTempSelectedProjectKeys([]); }}
                      style={{ color: currentTheme.colors.textSecondary, borderRadius: '8px' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Type to search..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{
                    background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'var(--bg-surface)',
                    borderColor: currentTheme.colors.border,
                    color: currentTheme.colors.text,
                  }}
                  autoFocus
                />
                <div className="space-y-1">
                  {options.project_keys.filter(k => {
                    if (k === 'All') return true;
                    const name = findProjectNameForKey(k) || '';
                    return k.toLowerCase().includes(projectSearch.toLowerCase()) || name.toLowerCase().includes(projectSearch.toLowerCase());
                  }).map((key) => {
                    const isAll = key === 'All';
                    const isSelected = isAll
                      ? tempSelectedProjectKeys.length === 0 && selectedProjectKey === 'All'
                      : tempSelectedProjectKeys.includes(key);
                    const matchingName = !isAll ? findProjectNameForKey(key) : null;
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-150"
                        style={{
                          backgroundColor: isSelected ? `${currentTheme.colors.primary}15` : 'transparent',
                          border: `1px solid ${isSelected ? currentTheme.colors.primary : 'transparent'}`
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAll) {
                            setTempSelectedProjectKeys([]);
                            setSelectedProjectKeys([]); // Clear applied selections
                            setSelectedProjectKey('All');
                            setUseMultiSelect(false);
                            setMultiSelectOpen(false);
                          } else {
                            toggleProjectKey(key);
                          }
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center transition-all duration-150"
                          style={{
                            borderWidth: '2px',
                            borderStyle: 'solid',
                            borderColor: isSelected ? currentTheme.colors.primary : currentTheme.colors.border,
                            backgroundColor: isSelected ? currentTheme.colors.primary : 'transparent'
                          }}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-medium" style={{ color: headingColor }}>{matchingName || key}</span>
                          {matchingName && (
                            <span className="text-xs block" style={{ color: currentTheme.colors.textSecondary }}>
                              {key}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: currentTheme.colors.border }}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 fx-pill"
                    onClick={(e) => { e.stopPropagation(); cancelMultiSelect(); }}
                    style={{
                      borderColor: currentTheme.colors.border,
                      color: currentTheme.colors.textSecondary
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 fx-pill"
                    onClick={(e) => { e.stopPropagation(); applyMultiSelect(); }}
                    disabled={tempSelectedProjectKeys.length === 0}
                    style={{
                      backgroundColor: tempSelectedProjectKeys.length > 0 ? currentTheme.colors.primary : currentTheme.colors.border,
                      color: '#FFFFFF',
                      opacity: tempSelectedProjectKeys.length > 0 ? 1 : 0.5
                    }}
                  >
                    Apply {tempSelectedProjectKeys.length > 0 ? `(${tempSelectedProjectKeys.length})` : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Metric */}
          <div className="relative">
            <label className="text-sm font-medium mb-2 block" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
              Metric
            </label>
            <div
              className="w-full rounded-xl px-3 py-2 text-sm border cursor-pointer transition-all duration-200 hover:shadow-md flex items-center justify-between"
              style={{
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.surface,
                color: headingColor,
                borderRadius: '12px'
              }}
              onClick={() => {
                if (metricMultiSelectOpen) {
                  // Closing - auto-apply temporary selections if they changed
                  const hasChanges = JSON.stringify(tempSelectedMetrics.sort()) !== JSON.stringify(selectedMetrics.sort());
                  const visibleTempMetrics = onlyVisibleTcoeMetrics(tempSelectedMetrics);
                  if (hasChanges && visibleTempMetrics.length > 0) {
                    setSelectedMetrics(visibleTempMetrics);
                    setUseMetricMultiSelect(true);
                    setSelectedMetric('all');
                  }
                } else {
                  // Opening - initialize temp selections with current applied selections
                  setTempSelectedMetrics(onlyVisibleTcoeMetrics(selectedMetrics));
                }
                setMetricMultiSelectOpen(!metricMultiSelectOpen);
              }}
            >
              <span className="flex items-center gap-2">
                {useMetricMultiSelect && onlyVisibleTcoeMetrics(selectedMetrics).length > 0
                  ? `${onlyVisibleTcoeMetrics(selectedMetrics).length} selected`
                  : selectedMetric === 'all' ? 'ALL' : VISIBLE_METRIC_OPTIONS.find(m => m.value === selectedMetric)?.label || 'Select Metric'}
              </span>
              <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Metric Multi-select dropdown */}
            {metricMultiSelectOpen && (
              <div
                className="absolute left-0 top-full z-[9999] mt-2 p-4 rounded-xl border w-full backdrop-blur-sm"
                style={{
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95))'
                    : 'var(--bg-card)',
                  borderColor: currentTheme.colors.primary,
                  minWidth: '300px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  boxShadow: isDarkMode
                    ? `0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3), 0 0 0 1px ${currentTheme.colors.primary}40`
                    : `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px ${currentTheme.colors.primary}30`
                }}
              >
                <div className="flex items-center justify-between mb-3 pb-3 border-b" style={{ borderColor: currentTheme.colors.border }}>
                  <span className="text-sm font-semibold" style={{ color: headingColor }}>Select Metrics</span>
                  <div className="flex gap-1">
                    <button
                      className="text-xs px-2 py-1 rounded-lg transition-all duration-200 hover:bg-[var(--accent-primary)]/10"
                      onClick={(e) => { e.stopPropagation(); selectAllMetrics(); }}
                      style={{ color: currentTheme.colors.primary, borderRadius: '8px' }}
                    >
                      All
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded-lg transition-all duration-200 hover:bg-[var(--accent-primary)]/10"
                      onClick={(e) => { e.stopPropagation(); clearMetricMultiSelect(); }}
                      style={{ color: currentTheme.colors.textSecondary, borderRadius: '8px' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Type to search..."
                  value={metricSearch}
                  onChange={(e) => setMetricSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{
                    background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'var(--bg-surface)',
                    borderColor: currentTheme.colors.border,
                    color: currentTheme.colors.text,
                  }}
                  autoFocus
                />
                <div className="space-y-1">
                  {!metricSearch && <div
                    className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-150"
                    style={{
                      backgroundColor: selectedMetric === 'all' && !useMetricMultiSelect ? `${currentTheme.colors.primary}15` : 'transparent',
                      border: `1px solid ${selectedMetric === 'all' && !useMetricMultiSelect ? currentTheme.colors.primary : 'transparent'}`
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMetric('all');
                      setUseMetricMultiSelect(false);
                      setSelectedMetrics([]);
                      setMetricMultiSelectOpen(false);
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center transition-all duration-150"
                      style={{
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        borderColor: selectedMetric === 'all' && !useMetricMultiSelect ? currentTheme.colors.primary : currentTheme.colors.border,
                        backgroundColor: selectedMetric === 'all' && !useMetricMultiSelect ? currentTheme.colors.primary : 'transparent'
                      }}
                    >
                      {selectedMetric === 'all' && !useMetricMultiSelect && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-semibold" style={{ color: headingColor }}>ALL</span>
                    </div>
                  </div>}
                  {VISIBLE_METRIC_OPTIONS.filter(o => o.label.toLowerCase().includes(metricSearch.toLowerCase())).map((option) => {
                    // When dropdown is open, always check tempSelectedMetrics for display
                    const isSelected = metricMultiSelectOpen
                      ? tempSelectedMetrics.includes(option.value)
                      : useMetricMultiSelect
                      ? tempSelectedMetrics.includes(option.value)
                      : selectedMetric === option.value;
                    return (
                      <div
                        key={option.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-150"
                        style={{
                          backgroundColor: isSelected ? `${currentTheme.colors.primary}15` : 'transparent',
                          border: `1px solid ${isSelected ? currentTheme.colors.primary : 'transparent'}`,
                          opacity: option.disabled ? 0.5 : 1
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (option.disabled) return;
                          // When dropdown is open, always use multi-select toggle behavior
                            toggleMetric(option.value);
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center transition-all duration-150"
                          style={{
                            borderWidth: '2px',
                            borderStyle: 'solid',
                            borderColor: isSelected ? currentTheme.colors.primary : currentTheme.colors.border,
                            backgroundColor: isSelected ? currentTheme.colors.primary : 'transparent'
                          }}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-medium" style={{ color: headingColor }}>{option.label}</span>
                          {option.disabled && (
                            <span className="text-xs block mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                              Coming Soon
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: currentTheme.colors.border }}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 fx-pill"
                    onClick={(e) => { e.stopPropagation(); cancelMetricMultiSelect(); }}
                    style={{
                      borderColor: currentTheme.colors.border,
                      color: currentTheme.colors.textSecondary
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 fx-pill"
                    onClick={(e) => { e.stopPropagation(); applyMetricMultiSelect(); }}
                    disabled={onlyVisibleTcoeMetrics(tempSelectedMetrics).length === 0}
                    style={{
                      backgroundColor: onlyVisibleTcoeMetrics(tempSelectedMetrics).length > 0 ? currentTheme.colors.primary : currentTheme.colors.border,
                      color: '#FFFFFF',
                      opacity: onlyVisibleTcoeMetrics(tempSelectedMetrics).length > 0 ? 1 : 0.5
                    }}
                  >
                    Apply {onlyVisibleTcoeMetrics(tempSelectedMetrics).length > 0 ? `(${onlyVisibleTcoeMetrics(tempSelectedMetrics).length})` : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>

          </div>
        </div>

        {/* Date Filter Options with Gradient Card */}
        <Card
          className="rounded-xl shadow-sm"
          style={{
            backgroundColor: cardBackground,
            borderColor: borderColor,
            borderWidth: '1px',
            borderStyle: 'solid'
          }}
        >
          <CardContent className="p-4">
            {/* Filter Mode & Comparison Toggle */}
            <div className="flex flex-wrap items-center gap-6 mb-4">
              {/* Date Filter Mode */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>Date Filter:</span>
                <div className="flex gap-2">
                  {[
                    { value: 'weekly', label: 'Weekly Date Range' },
                    { value: 'today', label: 'Today' },
                    { value: 'custom', label: 'Custom Range' },
                    { value: 'pi', label: 'By PI' },
                    { value: 'sprint', label: 'By Sprint' },
                    { value: 'month', label: 'By Month/Year' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => selectDateFilterMode(mode.value as DateFilterMode)}
                      className="fx-pill px-3 py-1.5 text-sm rounded-xl border transition-all duration-200 font-medium"
                      style={{
                        background: dateFilterMode === mode.value
                          ? 'var(--accent-cool)'
                          : isDarkMode
                            ? `linear-gradient(135deg, ${currentTheme.colors.surface}, ${currentTheme.colors.background})`
                            : `linear-gradient(135deg, ${cardBackground}, ${currentTheme.colors.background})`,
                        borderColor: dateFilterMode === mode.value ? 'var(--accent-cool)' : borderColor,
                        color: dateFilterMode === mode.value ? (isDarkMode ? '#000000' : '#FFFFFF') : headingColor,
                        borderRadius: isDarkMode ? '12px' : undefined,
                        boxShadow: dateFilterMode === mode.value
                          ? (isDarkMode ? '0 4px 12px rgba(212,168,71,0.25)' : '0 4px 12px rgba(24,120,185,0.25)')
                          : '0 1px 2px rgba(0, 0, 0, 0.05)',
                        fontFamily: 'var(--font)'
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comparison Toggle - Neat Switch like Dark Mode */}
              {dateFilterMode !== 'today' && dateFilterMode !== 'weekly' && (
                <div className="flex items-center gap-3">
                  <label htmlFor="enableComparison" className="text-sm font-medium cursor-pointer" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
                    Enable Comparison
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableComparison}
                    onClick={() => setEnableComparison(!enableComparison)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={{ backgroundColor: enableComparison ? currentTheme.colors.primary : currentTheme.colors.border }}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                        enableComparison ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Date Inputs based on mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Analysis Period */}
              <div className="p-4 rounded-lg border" style={{ borderColor: currentTheme.colors.border,
                background: isDarkMode
                  ? `linear-gradient(135deg, ${currentTheme.colors.surface}80, ${currentTheme.colors.background}80)`
                  : `linear-gradient(135deg, ${currentTheme.colors.background}, ${currentTheme.colors.surface})`
              }}>
                  <label className="text-sm font-medium mb-2 block" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
                  {enableComparison ? 'Current Period' : 'Analysis Period'}
                </label>

                {dateFilterMode === 'today' && (
                  <div
                    className="rounded-xl border px-4 py-3"
                    style={{
                      backgroundColor: cardBackground,
                      borderColor: borderColor,
                      borderRadius: '12px'
                    }}
                  >
                    <div className="text-xs mb-1" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>
                      Date
                    </div>
                    <div className="text-sm font-medium" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
                      {todayDisplayLabel}
                    </div>
                  </div>
                )}

                {dateFilterMode === 'weekly' && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-xs block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>PI Start</label>
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrentRangeEditable) {
                              const derivedStart = piStartForReportDate(currentTo, currentFrom);
                              setCurrentFrom(derivedStart);
                              setIsCurrentRangeEditable(false);
                            } else {
                              setIsCurrentRangeEditable(true);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium"
                          style={{ borderColor, color: headingColor, backgroundColor: cardBackground }}
                        >
                          <Pencil className="h-3 w-3" />
                          {isCurrentRangeEditable ? 'Auto' : 'Edit'}
                        </button>
                      </div>
                      <input
                        type="date"
                        value={currentFrom}
                        readOnly={!isCurrentRangeEditable}
                        onChange={(e) => setCurrentFrom(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none transition-all duration-200"
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: cardBackground,
                          borderColor: borderColor,
                          color: headingColor,
                          borderRadius: '12px'
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>Week Ending</label>
                      <input
                        type="date"
                        value={currentTo}
                        onChange={(e) => {
                          const nextReportDate = normalizeToWeekEndingFriday(e.target.value);
                          if (!isCurrentRangeEditable) {
                            setCurrentFrom(piStartForReportDate(nextReportDate, currentFrom));
                          }
                          setCurrentTo(nextReportDate);
                        }}
                        className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: cardBackground,
                          borderColor: borderColor,
                          color: headingColor,
                          borderRadius: '12px'
                        }}
                      />
                    </div>
                  </div>
                )}

                {dateFilterMode === 'custom' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>From</label>
                  <input
                    type="date"
                    value={currentFrom}
                    onChange={(e) => {
                      setCurrentFrom(e.target.value);
                      setSelectedSprint('All'); // Clear sprint selection when manually changing dates
                    }}
                        className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: cardBackground,
                          borderColor: borderColor,
                          color: headingColor,
                          borderRadius: '12px'
                        }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>To</label>
                  <input
                    type="date"
                    value={currentTo}
                    onChange={(e) => {
                      setCurrentTo(e.target.value);
                      setSelectedSprint('All'); // Clear sprint selection when manually changing dates
                    }}
                        className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: cardBackground,
                          borderColor: borderColor,
                          color: headingColor,
                          borderRadius: '12px'
                        }}
                  />
                </div>
              </div>
                )}

                {dateFilterMode === 'pi' && (
                  <Select value={selectedPI} onValueChange={(v) => {
                    setSelectedPI(v);
                    const pi = PI_OPTIONS.find(p => p.value === v);
                    if (pi) {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const commitStartDate = new Date(pi.commitStart);
                      commitStartDate.setHours(0, 0, 0, 0);
                      const isUpcoming = commitStartDate > today;

                      // Only set dates if PI has started
                      if (!isUpcoming) {
                        setCurrentFrom(pi.startDate);
                        setCurrentTo(pi.reportEnd);
                      }
                    }
                  }}>
                    <SelectTrigger
                      className="w-full rounded-xl px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                    >
                      <SelectValue placeholder="Select PI" />
                    </SelectTrigger>
                    <SelectContent>
                      {PI_OPTIONS.map((pi) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const commitStartDate = new Date(pi.commitStart);
                        commitStartDate.setHours(0, 0, 0, 0);
                        const isUpcoming = commitStartDate > today;

                        return (
                          <SelectItem
                            key={pi.value}
                            value={pi.value}
                            disabled={isUpcoming}
                            className={isUpcoming ? 'opacity-50 cursor-not-allowed' : ''}
                          >
                            {isUpcoming ? `${pi.label} - PI yet to start` : pi.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                {dateFilterMode === 'sprint' && (
                  <Select value={selectedSprint} onValueChange={(v) => {
                    setSelectedSprint(v);
                    if (v !== 'All') {
                      const sprint = SPRINT_OPTIONS.find(s => s.value === v);
                      if (sprint) {
                        setCurrentFrom(sprint.startDate);
                        setCurrentTo(sprint.endDate);
                      }
                    }
                  }}>
                    <SelectTrigger
                      className="w-full rounded-xl px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                    >
                      <SelectValue placeholder="Select Sprint" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Sprints</SelectItem>
                      {SPRINT_OPTIONS.map((sprint) => (
                        <SelectItem
                          key={sprint.value}
                          value={sprint.value}
                        >
                          {sprint.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {dateFilterMode === 'month' && (
                  <div className="flex gap-2">
                    <Select value={selectedMonth.toString()} onValueChange={(v) => {
                      const month = parseInt(v);
                      setSelectedMonth(month);
                      const lastDay = new Date(selectedYear, month, 0).getDate();
                      const nextReportDate = `${selectedYear}-${month.toString().padStart(2, '0')}-${lastDay}`;
                      setCurrentFrom(piStartForReportDate(nextReportDate, currentFrom));
                      setCurrentTo(nextReportDate);
                    }}>
                      <SelectTrigger
                        className="flex-1 rounded-xl px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                      >
                        <SelectValue placeholder={getMonthLabel(selectedMonth)} />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedYear.toString()} onValueChange={(v) => {
                      const year = parseInt(v);
                      setSelectedYear(year);
                      const lastDay = new Date(year, selectedMonth, 0).getDate();
                      const nextReportDate = `${year}-${selectedMonth.toString().padStart(2, '0')}-${lastDay}`;
                      setCurrentFrom(piStartForReportDate(nextReportDate, currentFrom));
                      setCurrentTo(nextReportDate);
                    }}>
                      <SelectTrigger
                        className="w-24 rounded-xl px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                      >
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
            </div>

              {/* Comparison Period - only show when comparison enabled */}
              {enableComparison && (
                <div className="p-4 rounded-lg border" style={{ borderColor: currentTheme.colors.border,
                  background: isDarkMode
                    ? `linear-gradient(135deg, ${currentTheme.colors.surface}80, ${currentTheme.colors.background}80)`
                    : `linear-gradient(135deg, ${currentTheme.colors.background}, ${currentTheme.colors.surface})`
                }}>
                  <label className="text-sm font-medium mb-2 block" style={{ color: headingColor, fontFamily: 'Inter, sans-serif' }}>
                    Comparison Period
              </label>

                  {dateFilterMode === 'sprint' && (
                    <Select value={comparisonSprint} onValueChange={(v) => {
                      setComparisonSprint(v);
                      if (v !== 'All') {
                        const sprint = SPRINT_OPTIONS.find(s => s.value === v);
                        if (sprint) {
                          setPreviousFrom(sprint.startDate);
                          setPreviousTo(sprint.endDate);
                        }
                      }
                    }}>
                      <SelectTrigger
                        className="w-full rounded-xl px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                      >
                        <SelectValue placeholder="Select Comparison Sprint" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Sprints</SelectItem>
                        {SPRINT_OPTIONS.map((sprint) => (
                          <SelectItem
                            key={sprint.value}
                            value={sprint.value}
                          >
                            {sprint.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {dateFilterMode === 'weekly' && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-xs block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>PI Start</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (isPreviousRangeEditable) {
                                const derivedStart = piStartForReportDate(previousTo, previousFrom);
                                setPreviousFrom(derivedStart);
                                setIsPreviousRangeEditable(false);
                              } else {
                                setIsPreviousRangeEditable(true);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium"
                            style={{ borderColor, color: headingColor, backgroundColor: cardBackground }}
                          >
                            <Pencil className="h-3 w-3" />
                            {isPreviousRangeEditable ? 'Auto' : 'Edit'}
                          </button>
                        </div>
                        <input
                          type="date"
                          value={previousFrom}
                          readOnly={!isPreviousRangeEditable}
                          onChange={(e) => setPreviousFrom(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none transition-all duration-200"
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            backgroundColor: cardBackground,
                            borderColor: borderColor,
                            color: headingColor,
                            borderRadius: '12px'
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>Week Ending</label>
                        <input
                          type="date"
                          value={previousTo}
                          onChange={(e) => {
                            const nextReportDate = normalizeToWeekEndingFriday(e.target.value);
                            if (!isPreviousRangeEditable) {
                              setPreviousFrom(piStartForReportDate(nextReportDate, previousFrom));
                            }
                            setPreviousTo(nextReportDate);
                          }}
                          className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            backgroundColor: cardBackground,
                            borderColor: borderColor,
                            color: headingColor,
                            borderRadius: '12px'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {dateFilterMode === 'custom' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>From</label>
                  <input
                    type="date"
                    value={previousFrom}
                    onChange={(e) => {
                      setPreviousFrom(e.target.value);
                      setComparisonSprint('All'); // Clear sprint selection when manually changing dates
                    }}
                          className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            backgroundColor: cardBackground,
                            borderColor: borderColor,
                            color: headingColor,
                            borderRadius: '12px'
                          }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: subheadingColor, fontFamily: 'Inter, sans-serif' }}>To</label>
                  <input
                    type="date"
                    value={previousTo}
                    onChange={(e) => {
                      setPreviousTo(e.target.value);
                      setComparisonSprint('All'); // Clear sprint selection when manually changing dates
                    }}
                          className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            backgroundColor: cardBackground,
                            borderColor: borderColor,
                            color: headingColor,
                            borderRadius: '12px'
                          }}
                  />
                </div>
              </div>
                  )}

                  {dateFilterMode === 'pi' && (
                    <Select value={comparisonPI} onValueChange={(v) => {
                      setComparisonPI(v);
                      const pi = PI_OPTIONS.find(p => p.value === v);
                      if (pi) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const commitStartDate = new Date(pi.commitStart);
                        commitStartDate.setHours(0, 0, 0, 0);
                        const isUpcoming = commitStartDate > today;

                        // Only set dates if PI has started
                        if (!isUpcoming) {
                          setPreviousFrom(pi.startDate);
                          setPreviousTo(pi.reportEnd);
                        }
                      }
                    }}>
                      <SelectTrigger
                        className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                      >
                        <SelectValue placeholder="Select PI" />
                      </SelectTrigger>
                      <SelectContent>
                        {PI_OPTIONS.map((pi) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const commitStartDate = new Date(pi.commitStart);
                          commitStartDate.setHours(0, 0, 0, 0);
                          const isUpcoming = commitStartDate > today;

                          return (
                            <SelectItem
                              key={pi.value}
                              value={pi.value}
                              disabled={isUpcoming}
                              className={isUpcoming ? 'opacity-50 cursor-not-allowed' : ''}
                            >
                              {isUpcoming ? `${pi.label} - PI yet to start` : pi.label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}

                  {dateFilterMode === 'month' && (
                    <div className="flex gap-2">
                      <Select value={comparisonMonth.toString()} onValueChange={(v) => {
                        const month = parseInt(v);
                        setComparisonMonth(month);
                        const lastDay = new Date(comparisonYear, month, 0).getDate();
                        const nextReportDate = `${comparisonYear}-${month.toString().padStart(2, '0')}-${lastDay}`;
                        setPreviousFrom(piStartForReportDate(nextReportDate, previousFrom));
                        setPreviousTo(nextReportDate);
                      }}>
                      <SelectTrigger
                        className="flex-1 rounded-lg px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                      >
                          <SelectValue placeholder={getMonthLabel(comparisonMonth)} />
                      </SelectTrigger>
                        <SelectContent>
                          {MONTH_OPTIONS.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={comparisonYear.toString()} onValueChange={(v) => {
                        const year = parseInt(v);
                        setComparisonYear(year);
                        const lastDay = new Date(year, comparisonMonth, 0).getDate();
                        const nextReportDate = `${year}-${comparisonMonth.toString().padStart(2, '0')}-${lastDay}`;
                        setPreviousFrom(piStartForReportDate(nextReportDate, previousFrom));
                        setPreviousTo(nextReportDate);
                      }}>
                        <SelectTrigger
                          className="w-24 rounded-lg px-3 py-2 text-sm focus:ring-2 transition-all duration-200 hover:shadow-md"
                        >
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {YEAR_OPTIONS.map((y) => (
                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
            </div>
                  )}
          </div>
              )}
            </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {(catalogError || error) && (
        <Alert
          className="border flex items-start gap-3"
          style={{
            backgroundColor: isDarkMode ? `${currentTheme.colors.error}20` : '#F9E3E7',
            borderColor: isDarkMode ? `${currentTheme.colors.error}60` : '#E9B0BA',
            color: isDarkMode ? '#FECACA' : '#C21F3A'
          }}
        >
          <AlertTriangle className="h-4 w-4" style={{ color: isDarkMode ? '#FECACA' : currentTheme.colors.error }} />
          <AlertDescription className="text-sm" style={{ color: isDarkMode ? '#FECACA' : '#C21F3A' }}>
            {catalogError || error}
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Display - for partial success when some portfolios have no valid projects */}
      {warning && !error && !catalogError && (
        <Alert
          data-pdf-exclude="true"
          className="border flex items-start gap-3"
          style={{
            backgroundColor: isDarkMode ? '#78350F20' : '#FAF1DE',
            borderColor: isDarkMode ? '#D9770660' : '#E4C878',
            color: isDarkMode ? '#FDE68A' : '#8A5E10'
          }}
        >
          <AlertTriangle className="h-4 w-4" style={{ color: isDarkMode ? '#FDE68A' : '#B45309' }} />
          <AlertDescription className="text-sm" style={{ color: isDarkMode ? '#FDE68A' : '#8A5E10' }}>
            <div className="space-y-1">
              <p>{warning}</p>
              {warningDetails.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setWarningExpanded((prev) => !prev)}
                    className="text-xs underline font-medium"
                    style={{ color: isDarkMode ? '#FDE68A' : '#8A5E10' }}
                  >
                    {warningExpanded
                      ? 'Hide details'
                      : `Show details (${warningDetails.length} portfolio${warningDetails.length > 1 ? 's' : ''})`}
                  </button>
                  {warningExpanded && (
                    <div className="text-xs" style={{ color: isDarkMode ? '#FDE68A' : '#8A5E10' }}>
                      {warningDetails.map((group) => (
                        <div key={`warning-${group.portfolio}`}>Portfolio {group.portfolio}: {group.projects.join(', ')}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

        {/* Loading State */}
      {loading && (
        <div
          className="rounded-2xl border px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: cardBackground, borderColor }}
        >
          <RefreshCw className="h-4 w-4 animate-spin" style={{ color: currentTheme.colors.primary }} />
          <div>
            <p className="text-sm font-medium" style={{ color: headingColor }}>
              Fetching Jira metrics for {portfolioLabel} (Project {projectKeyDisplay})...
            </p>
            <p className="text-xs" style={{ color: subheadingColor }}>
              {enableComparison
                ? `Comparing periods ${selectedWeekEndingPrevious} and ${selectedWeekEndingCurrent}`
                : `Analyzing period ${selectedWeekEndingCurrent}`}
            </p>
          </div>
        </div>
      )}

        {/* Results Table - Professional Corporate Design */}
      {(analysis || (rows && rows.length)) && (() => {
        const dataRows = rows && rows.length ? rows : (analysis ? [analysis] : []);
        const rawDataRows = rawRows && rawRows.length ? rawRows : dataRows;
        const getVisibleMetricKey = (row: Analysis) => row.metric || (selectedMetric === 'all' ? 'defect_leakage' : selectedMetric);
        const visibleDataRows = dataRows.filter(row => !HIDDEN_TCOE_METRIC_VALUES.has(getVisibleMetricKey(row)));
        const visibleRawDataRows = rawDataRows.filter(row => !HIDDEN_TCOE_METRIC_VALUES.has(getVisibleMetricKey(row)));
        if (!visibleDataRows.length) return null;

        // Format report generation time to hours, minutes, seconds
        const formatGenerationTime = (seconds: number): string => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          const milliseconds = Math.floor((seconds % 1) * 1000);

          const parts: string[] = [];
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0) parts.push(`${minutes}m`);
          if (secs > 0 || parts.length === 0) {
            // Show milliseconds only if less than 1 second total, otherwise show seconds
            if (seconds < 1) {
              parts.push(`${milliseconds}ms`);
            } else {
              parts.push(`${secs}s`);
            }
          }

          return parts.join(' ');
        };

        // Report generation time indicator
        const timeDisplay = reportGenerationTime !== null
          ? `Report generated in ${formatGenerationTime(reportGenerationTime)}`
          : null;

        // Group rows by metric when "All Metrics" is selected
        const groupedRows = selectedMetric === 'all'
          ? visibleDataRows.reduce((acc, row) => {
              const metricKey = row.metric || 'defect_leakage';
              if (!acc[metricKey]) acc[metricKey] = [];
              acc[metricKey].push(row);
              return acc;
            }, {} as Record<string, Analysis[]>)
          : { [selectedMetric]: visibleDataRows };

        // Always keep project-level grouping available for graphs
        const groupedRawRows = selectedMetric === 'all'
          ? visibleRawDataRows.reduce((acc, row) => {
              const metricKey = row.metric || 'defect_leakage';
              if (!acc[metricKey]) acc[metricKey] = [];
              acc[metricKey].push(row);
              return acc;
            }, {} as Record<string, Analysis[]>)
          : { [selectedMetric]: visibleRawDataRows };

        // Helper function to get metric-specific headers (matching PDF format exactly)
        const getMetricHeaders = (metric: string, enableComparison: boolean) => {
          const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
          const reportPIContext = getReportPIContext();
          const piCompactLabel = formatPICompact(reportPIContext);
          const piSpacedLabel = formatPISpaced(reportPIContext);

          if (metric === 'regression_automation') {
            // Regression Automation Status - DUAL TABLE
            return {
              // Table A: Automated / Total
              tableATitle: 'Regression Automation Status – Automated test cases against the overall test cases volume',
              // Table B: Automated / Automatable Only  
              tableBTitle: 'Regression only Automation Status – Automated regression test cases against the identified regression suite',
              firstCol: 'Automated',
              secondCol: '# Overall Regression Test Cases',
              thirdCol: 'Automation Not Required',
              period1Col1: 'Automated',
              period1Col2: 'Manual',
              period2Col1: 'Automated',
              period2Col2: 'Manual',
              type: 'regression_automation',
              isDualTable: true
            };
          } else if (metric === 'overall_automation') {
            // Overall Automation Status - DUAL TABLE
            return {
              // Table A: Automated / Total
              tableATitle: 'Overall Automation Status – Automated test cases against the overall test cases volume',
              // Table B: Automated / Automatable Only
              tableBTitle: 'Overall Automation Status – Automated test cases against the automatable functional test cases volume',
              firstCol: 'Automated',
              secondCol: '# Overall Test Cases',
              thirdCol: 'Automation Not Required',
              period1Col1: 'Automated',
              period1Col2: 'Manual',
              period2Col1: 'Automated',
              period2Col2: 'Manual',
              type: 'overall_automation',
              isDualTable: true
            };
          } else if (metric === 'test_coverage') {
            // Stories to Test Cases Mapping - DUAL TABLE
            return {
              // Table A: selected PI only
              tableATitle: 'Stories to Test Cases Mapping – Every story should have at least 1 test case mapped to ensure optimal coverage',
              tableBTitle: 'Stories to Test Cases Mapping – Cumulative (CY24+CY25+CY26)',
              firstCol: `# of Dev Stories in ${piCompactLabel}`,
              secondCol: `# Test Cases Created in ${piCompactLabel} (Story + Bugs + Defects)`,
              period1Col1: 'Stories with Tests',
              period1Col2: 'Stories without Tests',
              period2Col1: 'Stories with Tests',
              period2Col2: 'Stories without Tests',
              percentageLabel: 'Coverage %',
              type: 'test_coverage',
              isDualTable: true
            };
          } else if (metric === 'test_story_ratio') {
            // Test:Story Ratio - SINGLE TABLE
            return {
              tableTitle: 'Test : Story Ratio - Total # of Tests Created per closed Dev story',
              firstCol: `# Test Cases Created in ${piSpacedLabel}`,
              secondCol: `# of Closed Dev Stories in ${piSpacedLabel}`,
              period1Col1: 'Test Cases',
              period1Col2: 'Stories',
              period2Col1: 'Test Cases',
              period2Col2: 'Stories',
              type: 'test_story_ratio',
              isDualTable: false
            };
          } else if (metric === 'bug_ratio') {
            // Bugs/Test Case - SINGLE TABLE
            return {
              tableTitle: 'Bugs / Test Case – Indicates the quality of test cases and testing team along with a view of code quality',
              firstCol: `Test Cases (Stories / Bugs / Defects with Tests + Test only stories) in ${piSpacedLabel}`,
              secondCol: `Bugs Written in ${piSpacedLabel}`,
              period1Col1: 'Test Cases',
              period1Col2: 'Bugs',
              period2Col1: 'Test Cases',
              period2Col2: 'Bugs',
              type: 'bug_ratio',
              isDualTable: false
            };
          } else if (metric === 'test_review_status') {
            // Test Cases Review Status - SINGLE TABLE
            return {
              tableTitle: `Test Cases Review Status - Closed Dev Stories with Review Filled in ${piSpacedLabel}`,
              firstCol: '# of Closed Dev Stories with Test Cases Review Filled',
              secondCol: `# of Closed Dev Stories in ${piCompactLabel}`,
              period1Col1: 'Reviewed Yes',
              period1Col2: 'Reviewed No',
              period2Col1: 'Reviewed Yes',
              period2Col2: 'Reviewed No',
              percentageLabel: 'Review %',
              type: 'test_review_status',
              isDualTable: false
            };
          } else {
            // Weekly Defect Inflow (YoY) - SINGLE TABLE
            return {
              tableTitle: 'Weekly Defect Inflow - [(CY26 Defects - CY25 Defects) / CY25 Defects] for the reporting period',
              firstCol: 'CY25 Defects',
              secondCol: 'CY26 Defects',
              period1Col1: 'Defects Count',
              period1Col2: 'Leakage %',
              period2Col1: 'Defects Count',
              period2Col2: 'Leakage %',
              type: 'defect_leakage',
              isDualTable: false
            };
          }
        };

        // Wrap all cards in a container for PDF export
        const cards = Object.entries(groupedRows)
          .filter(([metricKey]) => !HIDDEN_TCOE_METRIC_VALUES.has(metricKey))
          .map(([metricKey, metricRows], cardIdx) => {
          const metricRawRows = groupedRawRows[metricKey] || metricRows;
          const isAutomation = metricKey === 'regression_automation' || metricKey === 'overall_automation';
          const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
          const isPeriodBased = periodBasedMetrics.includes(metricKey);
          const metricOption = METRIC_OPTIONS.find(opt => opt.value === metricKey);
          const metricLabel = metricOption?.label || (isAutomation ? (metricKey === 'regression_automation' ? 'Regression Test Automation' : 'Overall Test Automation') : 'Defect Leakage Rate');
          const metricDescription = metricOption?.description || '';
          const headers = getMetricHeaders(metricKey, enableComparison);
          const isQualityMetricTable = isPeriodBased || metricKey === 'defect_leakage';
          const qualityMetricTableTitle = (headers as any).tableTitle || (headers as any).tableATitle || metricLabel;
          const qualityHeaderTitle = getQualityMetricsHeaderTitle();
          const qualityHeaderMetricName = qualityMetricTableTitle || `${metricLabel}${metricDescription ? ` - ${metricDescription}` : ''}`;
          const qualityHeaderPeriod = getQualityMetricsPeriodLabel();

          const renderQualityMetricTables = () => {
            const tableRows = metricRows.filter(row => row.portfolio !== 'Grand Total' && row.portfolio_display !== 'Grand Total');
            const rowsForTables = tableRows.length ? tableRows : metricRows;
            const sharedSpecs = buildTcoeTableSpecs(metricKey, rowsForTables);
            return (
              <div style={{ display: 'grid', gap: 18 }}>
                {sharedSpecs.map((spec) => (
                  <QcoeMetricTable
                    key={`${metricKey}-${spec.title}`}
                    spec={spec}
                    previousWeek={previousWeekEndingLabel}
                    currentWeek={currentWeekEndingLabel}
                  />
                ))}
              </div>
            );
          };

          return (
            <Card
              key={`metric-card-${metricKey}-${cardIdx}`}
              id={`tcoe-report-card-${metricKey}`}
              className="overflow-hidden border rounded-xl shadow-sm"
              style={{
                backgroundColor: cardBackground,
                borderRadius: '12px',
                border: `1px solid ${borderColor}`,
                boxShadow: isDarkMode
                  ? `0 1px 3px rgba(0, 0, 0, 0.3)`
                  : '0 1px 3px rgba(0, 0, 0, 0.1)',
                marginTop: cardIdx > 0 ? '24px' : '0'
              }}
            >
              {/* Weekly quality metrics header */}
              <div
                className="px-6 py-5"
                style={{
                  background: '#008a87',
                  borderBottom: '2px solid rgba(255,255,255,0.22)',
                  boxShadow: isDarkMode ? '0 2px 4px rgba(0,0,0,0.16)' : '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                <div
                  className="grid items-center gap-4"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 820px) minmax(0, 1fr)' }}
                >
                  <div />
                  <div className="text-center" style={{ minWidth: 0 }}>
                    <h2 className="text-3xl font-semibold text-white mb-1" style={{
                      fontFamily: 'Inter, sans-serif',
                      letterSpacing: '0',
                      textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}>
                      {qualityHeaderTitle}
                    </h2>
                    <p className="text-sm mt-1.5" style={{
                      color: 'rgba(255,255,255,0.9)',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 500
                    }}>
                      {qualityHeaderMetricName}
                    </p>
                    <p className="text-xs mt-1.5" style={{
                      color: 'rgba(255,255,255,0.75)',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {qualityHeaderPeriod}
                    </p>
                    {qualityHeaderComparisonNote && (
                      <p className="text-xs mt-1.5" style={{
                        color: 'rgba(255,255,255,0.82)',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {qualityHeaderComparisonNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    {(() => {
                      const portfoliosForGraph = Array.from(
                        new Set(
                          metricRawRows
                            .filter(r => r.portfolio && r.portfolio !== 'Grand Total')
                            .map(r => r.portfolio_display || r.portfolio || 'Unknown')
                        )
                      );
                      const hasMultiplePortfolios = portfoliosForGraph.length > 1;
                      const currentSelection = graphPortfolioSelection[metricKey] || 'All';
                      return hasMultiplePortfolios && viewMode[metricKey] === 'graph' ? (
                        <div className="flex items-center gap-2 text-white">
                          <span className="text-xs opacity-80">Portfolio</span>
                          <Select
                            value={currentSelection}
                            onValueChange={(val) =>
                              setGraphPortfolioSelection({
                                ...graphPortfolioSelection,
                                [metricKey]: val
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-40 bg-white/10 border-white/20 text-white">
                              <SelectValue placeholder="All portfolios" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="All">All portfolios</SelectItem>
                              {portfoliosForGraph.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null;
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentMode = viewMode[metricKey] || 'table';
                        setViewMode({
                          ...viewMode,
                          [metricKey]: currentMode === 'table' ? 'graph' : 'table'
                        });
                      }}
                      className="bg-white/10 hover:bg-white/20 border-white/20 text-white"
                      style={{
                        backdropFilter: 'blur(10px)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {viewMode[metricKey] === 'graph' ? (
                        <>
                          <Table2 className="h-4 w-4 mr-2" />
                          See Table
                        </>
                      ) : (
                        <>
                          <BarChart3 className="h-4 w-4 mr-2" />
                          See Graph
                        </>
                      )}
                    </Button>
                    {/* Show JQL Button - Temporary feature for debugging */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowJql({
                          ...showJql,
                          [metricKey]: !showJql[metricKey]
                        });
                      }}
                      className={`${showJql[metricKey] ? 'bg-blue-500/30' : 'bg-white/10'} hover:bg-white/20 border-white/20 text-white`}
                      style={{
                        backdropFilter: 'blur(10px)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {showJql[metricKey] ? 'Hide JQL' : 'Show JQL'}
                    </Button>
                  </div>
                </div>
              </div>

            {/* JQL Display Section - Temporary feature */}
            {showJql[metricKey] && (
              <div className="px-6 py-4 border-t border-white/10" style={{ backgroundColor: cardBackground }}>
                <div className="rounded-lg p-4 bg-slate-900/50 border border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-blue-400" />
                    <h4 className="text-sm font-semibold text-blue-400">JQL Queries Used</h4>
                    <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                      Debug Mode
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      // Prefer aggregated portfolio rows so Show JQL reflects every project in the portfolio filter.
                      const sourceRows = metricRows.filter(row => row.portfolio !== 'Grand Total' && row.portfolio_display !== 'Grand Total');
                      const fallbackRows = metricRawRows.filter(row => row.portfolio !== 'Grand Total' && row.portfolio_display !== 'Grand Total');
                      const rowsForJql = [...sourceRows, ...fallbackRows];
                      const jqlQueries: string[] = [];
                      
                      rowsForJql.forEach((dataRow) => {
                        const hasMetricJql = Boolean(
                          dataRow?.jql_queries?.length ||
                          dataRow?.period?.jql_queries?.length ||
                          dataRow?.period1?.jql_queries?.length ||
                          dataRow?.period2?.jql_queries?.length
                        );
                        // Check for JQL in different locations based on metric type
                        if (dataRow?.jql_queries && dataRow.jql_queries.length > 0) {
                          jqlQueries.push(...dataRow.jql_queries);
                        }
                        if (dataRow?.period?.jql_queries && dataRow.period.jql_queries.length > 0) {
                          jqlQueries.push(...dataRow.period.jql_queries);
                        }
                        if (dataRow?.period1?.jql_queries && dataRow.period1.jql_queries.length > 0) {
                          jqlQueries.push(...dataRow.period1.jql_queries);
                        }
                        if (dataRow?.period2?.jql_queries && dataRow.period2.jql_queries.length > 0) {
                          jqlQueries.push(...dataRow.period2.jql_queries);
                        }
                        if (dataRow?.table_a?.period1?.jql) {
                          jqlQueries.push(dataRow.table_a.period1.jql);
                        }
                        if (dataRow?.table_a?.period2?.jql) {
                          jqlQueries.push(dataRow.table_a.period2.jql);
                        }
                        if (dataRow?.table_b?.period1?.jql) {
                          jqlQueries.push(dataRow.table_b.period1.jql);
                        }
                        if (dataRow?.table_b?.period2?.jql) {
                          jqlQueries.push(dataRow.table_b.period2.jql);
                        }
                        if (metricKey === 'defect_leakage') {
                          if (!hasMetricJql && dataRow?.current_week?.cy25_jql) {
                            jqlQueries.push(`CY25 Defects JQL: ${dataRow.current_week.cy25_jql}`);
                          }
                          if (!hasMetricJql && dataRow?.current_week?.cy26_jql) {
                            jqlQueries.push(`CY26 Defects JQL: ${dataRow.current_week.cy26_jql}`);
                          }
                        } else {
                          if (dataRow?.current_week?.bugs_jql) {
                            jqlQueries.push(`Bugs JQL: ${dataRow.current_week.bugs_jql}`);
                          }
                          if (dataRow?.current_week?.defects_jql) {
                            jqlQueries.push(`Defects JQL: ${dataRow.current_week.defects_jql}`);
                          }
                        }
                      });
                      const uniqueJqlQueries = Array.from(new Set(jqlQueries.filter(Boolean)));
                      
                      if (uniqueJqlQueries.length === 0) {
                        return (
                          <p className="text-sm text-slate-400 italic">
                            JQL queries not available for this metric. Backend needs to return jql_queries field.
                          </p>
                        );
                      }
                      
                      return uniqueJqlQueries.map((jql, idx) => (
                        <div key={idx} className="bg-slate-800/50 rounded p-3 border border-slate-600">
                          <code className="text-xs text-green-300 break-all font-mono whitespace-pre-wrap">
                            {jql}
                          </code>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Conditional rendering: Table or Graph */}
            {viewMode[metricKey] === 'graph' ? (
              <div className="p-6" style={{ backgroundColor: cardBackground }}>
                {(() => {
                  // Prepare data for graphs
                  const selectedPortfolio = graphPortfolioSelection[metricKey] || 'All';
                  const chartData = metricRawRows
                    .filter(row => row.portfolio !== 'Grand Total')
                    .filter(row => {
                      if (selectedPortfolio === 'All') return true;
                      const pLabel = row.portfolio_display || row.portfolio || 'Unknown';
                      return pLabel === selectedPortfolio;
                    })
                    .map(row => {
                      const portfolioLabel = row.portfolio_display || row.portfolio || row.project_label || 'Unknown';
                      const projectLabel = row.project_label || row.project_key || portfolioLabel;
                      const displayLabel = projectLabel.length > 30 ? projectLabel.substring(0, 30) + '...' : projectLabel;
                      const period = enableComparison ? (row.period2 || row.period) : row.period;

                      if (isAutomation) {
                        return {
                          name: displayLabel,
                          fullName: portfolioLabel,
                          current: period?.automation_percentage || 0,
                          previous: enableComparison && row.period1 ? (row.period1.automation_percentage || 0) : undefined,
                          total: row.total_regression_tests || row.total_test_cases || 0,
                          automated: period?.automated_count || 0,
                          manual: period?.manual_count || 0
                        };
                      } else if (metricKey === 'test_coverage') {
                        return {
                          name: displayLabel,
                          fullName: portfolioLabel,
                          current: period?.coverage_percentage || 0,
                          previous: enableComparison && row.period1 ? (row.period1.coverage_percentage || 0) : undefined,
                          total: row.total_stories || 0,
                          withTests: period?.stories_with_tests || 0,
                          withoutTests: period?.stories_without_tests || 0
                        };
                      } else if (metricKey === 'test_story_ratio') {
                        return {
                          name: displayLabel,
                          fullName: portfolioLabel,
                          current: period?.ratio || 0,
                          previous: enableComparison && row.period1 ? (row.period1.ratio || 0) : undefined,
                          totalTests: period?.total_test_cases || 0,
                          totalStories: period?.total_stories || 0
                        };
                      } else if (metricKey === 'bug_ratio') {
                        return {
                          name: displayLabel,
                          fullName: portfolioLabel,
                          current: period?.bugs_found && period?.test_cases_executed
                            ? (period.bugs_found / period.test_cases_executed) * 100
                            : 0,
                          previous: enableComparison && row.period1 && row.period1.bugs_found && row.period1.test_cases_executed
                            ? (row.period1.bugs_found / row.period1.test_cases_executed) * 100
                            : undefined,
                          bugs: period?.bugs_found || 0,
                          testsExecuted: period?.test_cases_executed || 0
                        };
                      } else if (metricKey === 'test_review_status') {
                        return {
                          name: displayLabel,
                          fullName: portfolioLabel,
                          current: period?.review_percentage || 0,
                          previous: enableComparison && row.period1 ? (row.period1.review_percentage || 0) : undefined,
                          reviewed: period?.reviewed_yes || 0,
                          notReviewed: period?.reviewed_no || 0,
                          notSet: period?.not_set || 0
                        };
                      } else {
                        // Defect leakage
                        return {
                          name: displayLabel,
                          fullName: portfolioLabel,
                          current: row.current_week?.leakage_percentage || 0,
                          previous: enableComparison ? (row.previous_week?.leakage_percentage || 0) : undefined,
                          bugs: row.current_week?.bugs_count || 0,
                          defects: row.current_week?.defects_count || 0
                        };
                      }
                    })
                    .sort((a, b) => b.current - a.current); // Sort by current value descending

                  const chartColors = {
                    primary: isDarkMode ? '#D4A847' : '#1878B9',
                    secondary: isDarkMode ? '#34D399' : '#43A05C',
                    negative: isDarkMode ? '#F87171' : '#C21F3A',
                    text: currentTheme.colors.text,
                    grid: currentTheme.colors.border
                  };

                  return (
                    <div className="space-y-6">
                      {/* Main metric chart */}
                      <div>
                        <h3 className="text-sm font-semibold mb-4" style={{ color: headingColor }}>
                          {isAutomation ? 'Automation %' :
                           metricKey === 'test_coverage' ? 'Coverage %' :
                           metricKey === 'test_story_ratio' ? 'Test/Story Ratio' :
                           metricKey === 'bug_ratio' ? 'Bug Ratio (%)' :
                           metricKey === 'test_review_status' ? 'Review %' :
                           'Leakage %'} by Portfolio/Project
                        </h3>
                        <ResponsiveContainer width="100%" height={400}>
                          {enableComparison ? (
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                              <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                tick={{ fill: chartColors.text, fontSize: 12 }}
                              />
                              <YAxis
                                tick={{ fill: chartColors.text, fontSize: 12 }}
                                label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft', fill: chartColors.text }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: currentTheme.colors.surface,
                                  border: `1px solid ${chartColors.grid}`,
                                  borderRadius: '8px'
                                }}
                                labelStyle={{ color: chartColors.text, fontWeight: 'bold' }}
                                formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                              />
                              <Legend
                                wrapperStyle={{ color: chartColors.text }}
                              />
                              <Bar
                                dataKey="previous"
                                fill={chartColors.secondary}
                                name={enableComparison ? (dateFilterMode === 'pi' ? comparisonPI : previousWeekEndingLabel) : 'Previous'}
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="current"
                                fill={chartColors.primary}
                                name={dateFilterMode === 'pi' ? selectedPI : currentWeekEndingLabel}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          ) : (
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                              <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                tick={{ fill: chartColors.text, fontSize: 12 }}
                              />
                              <YAxis
                                tick={{ fill: chartColors.text, fontSize: 12 }}
                                label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft', fill: chartColors.text }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: currentTheme.colors.surface,
                                  border: `1px solid ${chartColors.grid}`,
                                  borderRadius: '8px'
                                }}
                                labelStyle={{ color: chartColors.text, fontWeight: 'bold' }}
                                formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                              />
                              <Bar
                                dataKey="current"
                                fill={chartColors.primary}
                                name={isAutomation ? 'Automation %' :
                                      metricKey === 'test_coverage' ? 'Coverage %' :
                                      metricKey === 'test_story_ratio' ? 'Ratio' :
                                      metricKey === 'bug_ratio' ? 'Bug Ratio %' :
                                      metricKey === 'test_review_status' ? 'Review %' :
                                      'Leakage %'}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>

                      {/* Additional breakdown charts for automation metrics */}
                      {isAutomation && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h3 className="text-sm font-semibold mb-4" style={{ color: headingColor }}>
                              Automated vs Manual Tests
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                <XAxis
                                  dataKey="name"
                                  angle={-45}
                                  textAnchor="end"
                                  height={100}
                                  tick={{ fill: chartColors.text, fontSize: 11 }}
                                />
                                <YAxis tick={{ fill: chartColors.text, fontSize: 12 }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: currentTheme.colors.surface,
                                    border: `1px solid ${chartColors.grid}`,
                                    borderRadius: '8px'
                                  }}
                                  labelStyle={{ color: chartColors.text }}
                                />
                                <Legend wrapperStyle={{ color: chartColors.text }} />
                                <Bar dataKey="automated" fill={chartColors.secondary} name="Automated" />
                                <Bar dataKey="manual" fill={chartColors.negative} name="Manual" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold mb-4" style={{ color: headingColor }}>
                              Total Tests by Portfolio/Project
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                <XAxis
                                  dataKey="name"
                                  angle={-45}
                                  textAnchor="end"
                                  height={100}
                                  tick={{ fill: chartColors.text, fontSize: 11 }}
                                />
                                <YAxis tick={{ fill: chartColors.text, fontSize: 12 }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: currentTheme.colors.surface,
                                    border: `1px solid ${chartColors.grid}`,
                                    borderRadius: '8px'
                                  }}
                                  labelStyle={{ color: chartColors.text }}
                                />
                                <Bar dataKey="total" fill={chartColors.primary} name="Total Tests" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : isQualityMetricTable ? (
              renderQualityMetricTables()
            ) : (
            <div className="overflow-x-auto pdf-table" style={{ width: '100%', margin: '0 auto', pageBreakInside: 'avoid' }}>
              <table
                className="w-full border-collapse pdf-table"
                style={{
                  fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                  width: '100%',
                  tableLayout: 'auto',
                  borderSpacing: 0,
                  borderCollapse: 'collapse',
                  pageBreakInside: 'avoid'
                }}
              >
                  <thead>
                  {isQualityMetricTable && (
                    <tr>
                      <th
                        colSpan={7}
                        className="text-center"
                        style={{
                          backgroundColor: '#d9e2f3',
                          color: '#000000',
                          borderBottom: '1px solid #bfbfbf',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 700,
                          padding: '14px 12px',
                          fontSize: '14px'
                        }}
                      >
                        {qualityMetricTableTitle}
                      </th>
                    </tr>
                  )}
                  <tr className="pdf-table-header" style={{
                    backgroundColor: isQualityMetricTable ? '#b4c6e7' : tableHeaderBg,
                    color: isQualityMetricTable ? '#000000' : tableHeaderText,
                    fontWeight: 500
                  }}>
                    <th className="text-left pdf-table-header" style={{
                      color: isQualityMetricTable ? '#000000' : tableHeaderText,
                      backgroundColor: isQualityMetricTable ? '#b4c6e7' : tableHeaderBg,
                      fontWeight: isQualityMetricTable ? 700 : 500,
                      borderBottom: `2px solid ${tableBorderColor}`,
                      borderRight: `1px solid ${tableBorderColor}`,
                      fontFamily: 'Inter, sans-serif',
                      padding: '8px 12px',
                      fontSize: '13px'
                    }}>Portfolio</th>
                    {isPeriodBased ? (
                      <>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: '#000000',
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: '#b4c6e7'
                        }}>{headers.firstCol}</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: '#000000',
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: '#b4c6e7'
                        }}>{headers.secondCol}</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: '#000000',
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: '#b4c6e7'
                        }}>Week ending {previousWeekEndingLabel}</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: '#000000',
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: '#b4c6e7'
                        }}>Week ending {currentWeekEndingLabel}</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: '#000000',
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: '#b4c6e7'
                        }}>WoW Progress</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold" style={{
                          color: '#000000',
                          borderBottom: `2px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif',
                          backgroundColor: '#b4c6e7'
                        }}>Comments</th>
                      </>
                    ) : isPeriodBased ? (
                      <>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: headingColor,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>{`${headers.firstCol} (${dateFilterMode === 'pi' ? selectedPI : currentWeekEndingLabel})`}</th>
                        {enableComparison && (
                          <>
                            <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                              color: headingColor,
                              borderBottom: `2px solid ${tableBorderColor}`,
                              borderRight: `1px solid ${tableBorderColor}`,
                              fontFamily: 'Inter, sans-serif'
                            }}>
                              {dateFilterMode === 'pi' ? comparisonPI : previousWeekEndingLabel}<br/>
                              <span className="font-normal text-[10px]">{headers.period1Col1}</span>
                            </th>
                            <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                              color: headingColor,
                              borderBottom: `2px solid ${tableBorderColor}`,
                              borderRight: `1px solid ${tableBorderColor}`,
                              fontFamily: 'Inter, sans-serif'
                            }}>
                              {dateFilterMode === 'pi' ? comparisonPI : previousWeekEndingLabel}<br/>
                              <span className="font-normal text-[10px]">{headers.period1Col2}</span>
                            </th>
                          </>
                        )}
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: headingColor,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {dateFilterMode === 'pi' ? selectedPI : currentWeekEndingLabel}<br/>
                          <span className="font-normal text-[10px]">{headers.period2Col1}</span>
                        </th>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: headingColor,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {dateFilterMode === 'pi' ? selectedPI : currentWeekEndingLabel}<br/>
                          <span className="font-normal text-[10px]">{headers.period2Col2}</span>
                        </th>
                        {enableComparison && (
                          <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                            color: headingColor,
                            borderBottom: `2px solid ${tableBorderColor}`,
                            borderRight: `1px solid ${tableBorderColor}`,
                            fontFamily: 'Inter, sans-serif'
                          }}>Change</th>
                        )}
                        <th className="text-left py-3 px-4 text-xs font-semibold" style={{
                          color: headingColor,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>Comments</th>
                      </>
                    ) : (
                      <>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: isQualityMetricTable ? '#000000' : headingColor,
                          backgroundColor: isQualityMetricTable ? '#b4c6e7' : undefined,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>{headers.firstCol}</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: isQualityMetricTable ? '#000000' : headingColor,
                          backgroundColor: isQualityMetricTable ? '#b4c6e7' : undefined,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>{headers.secondCol}</th>
                        {enableComparison && (
                          <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                            color: isQualityMetricTable ? '#000000' : headingColor,
                            backgroundColor: isQualityMetricTable ? '#b4c6e7' : undefined,
                            borderBottom: `2px solid ${tableBorderColor}`,
                            borderRight: `1px solid ${tableBorderColor}`,
                            fontFamily: 'Inter, sans-serif'
                          }}>
                            {dateFilterMode === 'pi' ? comparisonPI : previousWeekEndingLabel}<br/>
                            <span className="font-normal text-[10px]">Leakage %</span>
                          </th>
                        )}
                        <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                          color: isQualityMetricTable ? '#000000' : headingColor,
                          backgroundColor: isQualityMetricTable ? '#b4c6e7' : undefined,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          borderRight: `1px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>
                          {dateFilterMode === 'pi' ? selectedPI : currentWeekEndingLabel}<br/>
                          <span className="font-normal text-[10px]">Leakage %</span>
                        </th>
                        {enableComparison && (
                          <th className="text-center py-3 px-4 text-xs font-semibold" style={{
                            color: isQualityMetricTable ? '#000000' : headingColor,
                            backgroundColor: isQualityMetricTable ? '#b4c6e7' : undefined,
                            borderBottom: `2px solid ${tableBorderColor}`,
                            borderRight: `1px solid ${tableBorderColor}`,
                            fontFamily: 'Inter, sans-serif'
                          }}>WoW Progress</th>
                        )}
                        <th className="text-left py-3 px-4 text-xs font-semibold" style={{
                          color: isQualityMetricTable ? '#000000' : headingColor,
                          backgroundColor: isQualityMetricTable ? '#b4c6e7' : undefined,
                          borderBottom: `2px solid ${tableBorderColor}`,
                          fontFamily: 'Inter, sans-serif'
                        }}>Comments</th>
                      </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                  {(() => {
                    // Check if Grand Total already exists in the data (from backend portfolio grouping)
                    const hasGrandTotal = metricRows.some(row => row.portfolio === 'Grand Total' || row.portfolio_display === 'Grand Total');
                    
                    // Calculate grand total only if we have multiple rows AND no grand total exists yet
                    const grandTotal = (metricRows.length > 1 && !hasGrandTotal) 
                      ? calculateGrandTotal(metricRows.filter(row => row.portfolio !== 'Grand Total' && row.portfolio_display !== 'Grand Total')) 
                      : null;
                    
                    const cellBorder = currentTheme.colors.border;

                    // Professional color scheme
                    // Updated color functions using design palette
                    const getWowBgColor = (change: number) => {
                      if (change < -5) return isDarkMode ? 'rgba(113, 133, 57, 0.2)' : colorPalette.positive.background;
                      if (change < 0) return isDarkMode ? 'rgba(113, 133, 57, 0.15)' : '#ECFDF5';
                      if (change > 5) return isDarkMode ? 'rgba(163, 48, 48, 0.2)' : colorPalette.negative.background;
                      if (change > 0) return isDarkMode ? 'rgba(163, 48, 48, 0.15)' : '#FEF2F2';
                      return isDarkMode ? 'rgba(229, 177, 118, 0.2)' : colorPalette.warning.background;
                    };

                    const getWowTextColor = (change: number) => {
                      if (change < 0) return isDarkMode ? '#A3D9A5' : colorPalette.positive.icon;
                      if (change > 0) return isDarkMode ? '#FCA5A5' : colorPalette.negative.icon;
                      return isDarkMode ? '#FCD34D' : colorPalette.warning.text;
                    };

                    const getLeakageBgColor = (leakage: number) => {
                      if (leakage >= 60) return isDarkMode ? 'rgba(163, 48, 48, 0.2)' : colorPalette.negative.background;
                      if (leakage >= 40) return isDarkMode ? 'rgba(229, 177, 118, 0.2)' : colorPalette.warning.background;
                      return isDarkMode ? 'rgba(113, 133, 57, 0.2)' : colorPalette.positive.background;
                    };

                    const getLeakageTextColor = (leakage: number) => {
                      if (leakage >= 60) return isDarkMode ? '#FCA5A5' : colorPalette.negative.icon;
                      if (leakage >= 40) return isDarkMode ? '#FCD34D' : colorPalette.warning.text;
                      return isDarkMode ? '#A3D9A5' : colorPalette.positive.icon;
                    };

                    const getReviewBgColor = (percentage: number) => {
                      if (percentage > 90) return '#c6efce';
                      if (percentage >= 70) return '#ffeb9c';
                      return '#ffc7ce';
                    };

                    const getReviewTextColor = (percentage: number) => {
                      if (percentage > 90) return '#006100';
                      if (percentage >= 70) return '#9c6500';
                      return '#9c0006';
                    };

                    const getReviewProgressBgColor = (change: number) => {
                      if (change > 0) return '#c6efce';
                      if (change < 0) return '#ffc7ce';
                      return '#ffeb9c';
                    };

                    const getReviewProgressTextColor = (change: number) => {
                      if (change > 0) return '#006100';
                      if (change < 0) return '#9c0006';
                      return '#9c6500';
                    };

                    const buildRegressionSummary = (rows: Analysis[]): string => {
                      if (!rows.length) return 'No regression automation data available.';

                      const enriched = rows.map((r) => {
                        const label =
                          r.portfolio_display ||
                          r.portfolio ||
                          r.project_label ||
                          'Unknown';
                        const period = enableComparison ? (r.period2 || r.period) : r.period;
                        const pct = period?.automation_percentage ?? 0;
                        const manual = period?.manual_count ?? 0;
                        return { label, pct, manual };
                      }).filter(r => !Number.isNaN(r.pct));

                      if (!enriched.length) return 'No regression automation data available.';

                      enriched.sort((a, b) => b.pct - a.pct);
                      const best = enriched[0];
                      const worst = enriched[enriched.length - 1];
                      const avg =
                        enriched.reduce((sum, r) => sum + r.pct, 0) / enriched.length;

                      let summary = `Overall regression automation averages ${avg.toFixed(
                        1,
                      )}% across ${enriched.length} portfolios.`;

                      if (best) {
                        summary += ` Best coverage is in ${best.label} at ${best.pct.toFixed(
                          1,
                        )}%, with ${best.manual} manual tests remaining.`;
                      }

                      if (worst && worst.label !== best.label) {
                        summary += ` Lowest coverage is in ${worst.label} at ${worst.pct.toFixed(
                          1,
                        )}%, which needs attention due to ${
                          worst.manual
                        } manual tests still not automated.`;
                      }

                      return summary;
                    };

                    // Calculate average automation percentage for comparison
                    const avgAutomation = metricRows.length > 0
                      ? metricRows
                          .map(r => {
                            const p = enableComparison ? (r.period2 || r.period) : r.period;
                            return p?.automation_percentage ?? 0;
                          })
                          .filter(p => !Number.isNaN(p))
                          .reduce((sum, p, _, arr) => sum + p / arr.length, 0)
                      : 0;

                    // Group rows by portfolio to find best/worst projects
                    const portfolioGroups = metricRows.reduce((acc, r) => {
                      const portfolio = r.portfolio_display || r.portfolio || 'Unknown';
                      if (!acc[portfolio]) acc[portfolio] = [];
                      acc[portfolio].push(r);
                      return acc;
                    }, {} as Record<string, Analysis[]>);

                    // Find best and worst project for each portfolio
                    const getPortfolioProjectInsights = (portfolio: string, currentRow?: Analysis): { best?: string; worst?: string } => {
                      // First, try to get project details from the current row (if aggregated)
                      if (currentRow && (currentRow as any)._projectDetails && Array.isArray((currentRow as any)._projectDetails)) {
                        const projectDetails = (currentRow as any)._projectDetails;
                        if (projectDetails.length < 2) return {}; // Need at least 2 projects

                        const withPct = projectDetails.map((p: any) => {
                          const period = enableComparison ? (p.period2 || p.period) : p.period;
                          const pct = period?.automation_percentage ?? 0;
                          return { label: p.project_label || p.project_key || 'Unknown Project', pct };
                        }).filter((p: any) => !Number.isNaN(p.pct));

                        if (withPct.length < 2) return {};

                        const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
                        const best = sorted[0];
                        const worst = sorted[sorted.length - 1];

                        return {
                          best: best.pct > 0 ? `${best.label} (${best.pct.toFixed(1)}%)` : undefined,
                          worst: worst.pct < 80 ? `${worst.label} (${worst.pct.toFixed(1)}%)` : undefined
                        };
                      }

                      // Fallback: use portfolio groups (for non-aggregated rows)
                      const projects = portfolioGroups[portfolio] || [];
                      if (projects.length <= 1) return {}; // Only one project or no projects

                      const withPct = projects.map(r => {
                        const p = enableComparison ? (r.period2 || r.period) : r.period;
                        const pct = p?.automation_percentage ?? 0;
                        const label = r.project_label || r.project_key || 'Unknown Project';
                        return { label, pct, row: r };
                      }).filter(p => !Number.isNaN(p.pct));

                      if (withPct.length < 2) return {}; // Need at least 2 projects to compare

                      const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
                      const best = sorted[0];
                      const worst = sorted[sorted.length - 1];

                      return {
                        best: best.pct > 0 ? `${best.label} (${best.pct.toFixed(1)}%)` : undefined,
                        worst: worst.pct < 80 ? `${worst.label} (${worst.pct.toFixed(1)}%)` : undefined
                      };
                    };

                    const buildRegressionRowSummary = (row: Analysis): string => {
                      const label =
                        row.portfolio_display ||
                        row.portfolio ||
                        row.project_label ||
                        'This portfolio';
                      const period = enableComparison ? (row.period2 || row.period) : row.period;
                      const period1 = enableComparison ? row.period1 : null;
                      const pct = period?.automation_percentage ?? 0;
                      const automated = period?.automated_count ?? 0;
                      const manual = period?.manual_count ?? 0;
                      const totalTests = row.total_regression_tests ?? 0;

                      if (Number.isNaN(pct)) {
                        return `${label}: No regression automation data available.`;
                      }

                      // Analyze trends if comparison mode
                      let trendAnalysis = '';
                      if (enableComparison && period1) {
                        const prevPct = period1.automation_percentage ?? 0;
                        const prevManual = period1.manual_count ?? 0;
                        const pctChange = pct - prevPct;
                        const manualChange = manual - prevManual;

                        if (manualChange > 0 && pctChange <= 0) {
                          trendAnalysis = `Manual tests increased by ${manualChange} while automation stayed flat - new tests are being added faster than automation. `;
                        } else if (manualChange > 10) {
                          trendAnalysis = `Manual test count increased by ${manualChange} - automation is not keeping pace with test growth. `;
                        } else if (pctChange < -2) {
                          trendAnalysis = `Automation declined by ${Math.abs(pctChange).toFixed(1)}% - investigate regression in automation coverage. `;
                        } else if (pctChange > 2) {
                          trendAnalysis = `Automation improved by ${pctChange.toFixed(1)}% - good progress, maintain momentum. `;
                        }
                      }

                      // Identify primary concern and recommendation
                      let concern = '';
                      let recommendation = '';

                      // Priority 1: High manual test count (most actionable)
                      if (manual > 200) {
                        concern = `${label} has ${manual} manual test cases`;
                        recommendation = 'which needs attention. Consider prioritizing automation for high-frequency and critical regression scenarios.';
                      } else if (manual > 100) {
                        concern = `${label} has ${manual} manual test cases`;
                        recommendation = 'which needs attention. Focus on automating frequently executed tests to reduce manual overhead.';
                      } else if (manual > 50 && pct < 50) {
                        concern = `${label} has ${manual} manual test cases`;
                        recommendation = 'which needs attention. Consider doing more automation focus to improve coverage.';
                      }
                      // Priority 2: Low automation percentage
                      else if (pct < 30) {
                        concern = `${label} automation is at ${pct.toFixed(1)}%`;
                        recommendation = 'which needs urgent attention. Prioritize automation for core regression flows to reduce risk.';
                      } else if (pct < 50) {
                        concern = `${label} automation is at ${pct.toFixed(1)}%`;
                        recommendation = 'which needs attention. Increase automation investment to reach industry standard (60%+).';
                      }
                      // Priority 3: Below average performance
                      else if (metricRows.length > 1 && !Number.isNaN(avgAutomation) && pct < avgAutomation - 10) {
                        concern = `${label} automation is ${(avgAutomation - pct).toFixed(1)}% below average`;
                        recommendation = 'which needs attention. Review automation strategy and allocate dedicated capacity for automation.';
                      }
                      // Priority 4: Good but can improve
                      else if (pct >= 50 && pct < 70 && manual > 30) {
                        concern = `${label} has ${manual} remaining manual tests`;
                        recommendation = 'which needs attention. Consider automating high-value tests to reach 70%+ coverage.';
                      }
                      // Priority 5: Excellent performance
                      else if (pct >= 80) {
                        concern = `${label} is performing well at ${pct.toFixed(1)}% automation`;
                        recommendation = 'with strong coverage. Continue maintaining automation standards and review remaining manual tests.';
                      }
                      // Default: Moderate performance
                      else {
                        concern = `${label} automation is at ${pct.toFixed(1)}%`;
                        recommendation = 'which needs improvement. Focus on automating critical regression paths to enhance coverage.';
                      }

                      // Add portfolio project insights (best/worst project)
                      const portfolio = row.portfolio_display || row.portfolio || '';
                      const projectInsights = getPortfolioProjectInsights(portfolio, row);
                      let projectNote = '';

                      if (projectInsights.best && projectInsights.worst) {
                        projectNote = ` Within ${portfolio}: ${projectInsights.best} is doing well, while ${projectInsights.worst} needs attention.`;
                      } else if (projectInsights.best) {
                        projectNote = ` Within ${portfolio}: ${projectInsights.best} is doing well.`;
                      } else if (projectInsights.worst) {
                        projectNote = ` Within ${portfolio}: ${projectInsights.worst} needs attention.`;
                      }

                      // Build structured bullet-point analysis with numbers and bold text
                      const bullets: string[] = [];

                      // Issue/Current State (with numbers)
                      if (manual > 200) {
                        bullets.push(`• **Issue**: ${label} has **${manual} manual test cases** (${(100 - pct).toFixed(1)}% of ${totalTests} total tests)`);
                        bullets.push(`• **Impact**: Manual execution overhead is high, affecting release velocity`);
                        bullets.push(`• **Action**: Prioritize automating **200+ high-frequency tests** in next sprint`);
                        bullets.push(`• **Target**: Aim for **60%+ automation** (currently at ${pct.toFixed(1)}%)`);
                      } else if (manual > 100) {
                        bullets.push(`• **Issue**: ${label} has **${manual} manual test cases** (${(100 - pct).toFixed(1)}% of ${totalTests} total tests)`);
                        bullets.push(`• **Impact**: Significant manual effort required for regression testing`);
                        bullets.push(`• **Action**: Focus on automating **100+ frequently executed tests**`);
                        bullets.push(`• **Target**: Reach **60%+ automation** (currently at ${pct.toFixed(1)}%)`);
                      } else if (pct < 30) {
                        bullets.push(`• **Issue**: ${label} automation is critically low at **${pct.toFixed(1)}%** (${automated} automated, ${manual} manual)`);
                        bullets.push(`• **Impact**: High risk of production defects due to limited automated coverage`);
                        bullets.push(`• **Action**: Urgently automate **core regression flows** - target **50+ tests** in next 2 sprints`);
                        bullets.push(`• **Target**: Reach **50%+ automation** to reduce risk`);
                      } else if (pct < 50) {
                        bullets.push(`• **Issue**: ${label} automation is at **${pct.toFixed(1)}%** (${automated} automated, ${manual} manual)`);
                        bullets.push(`• **Impact**: Below industry standard (60%+), manual testing overhead is significant`);
                        bullets.push(`• **Action**: Increase automation investment - automate **50+ tests** to reach 60%+`);
                        bullets.push(`• **Target**: Achieve **60%+ automation** (${(60 - pct).toFixed(1)}% improvement needed)`);
                      } else if (pct >= 50 && pct < 70 && manual > 30) {
                        bullets.push(`• **Status**: ${label} has **${manual} remaining manual tests** at ${pct.toFixed(1)}% automation`);
                        bullets.push(`• **Impact**: Good progress, but ${manual} tests still require manual execution`);
                        bullets.push(`• **Action**: Automate **high-value tests** - target **30+ tests** to reach 70%+`);
                        bullets.push(`• **Target**: Reach **70%+ automation** (${(70 - pct).toFixed(1)}% improvement needed)`);
                      } else if (pct >= 80) {
                        bullets.push(`• **Status**: ${label} is performing well at **${pct.toFixed(1)}% automation** (${automated} automated, ${manual} manual)`);
                        bullets.push(`• **Impact**: Strong coverage, minimal manual overhead`);
                        bullets.push(`• **Action**: Maintain standards, review remaining **${manual} manual tests** for automation potential`);
                        bullets.push(`• **Target**: Continue excellence, consider reaching **90%+** if feasible`);
                      } else {
                        bullets.push(`• **Status**: ${label} automation is at **${pct.toFixed(1)}%** (${automated} automated, ${manual} manual)`);
                        bullets.push(`• **Impact**: Moderate coverage, room for improvement`);
                        bullets.push(`• **Action**: Focus on automating **critical regression paths** - target **20+ tests**`);
                        bullets.push(`• **Target**: Improve to **60%+ automation** (${(60 - pct).toFixed(1)}% improvement needed)`);
                      }

                      // Add trend analysis if available
                      if (trendAnalysis) {
                        bullets.unshift(`• **Trend**: ${trendAnalysis.trim()}`);
                      }

                      // Add project insights
                      if (projectInsights.best && projectInsights.worst) {
                        bullets.push(`• **Projects**: Within ${portfolio}, **${projectInsights.best}** is doing well, while **${projectInsights.worst}** needs attention`);
                      } else if (projectInsights.best) {
                        bullets.push(`• **Projects**: Within ${portfolio}, **${projectInsights.best}** is performing well`);
                      } else if (projectInsights.worst) {
                        bullets.push(`• **Projects**: Within ${portfolio}, **${projectInsights.worst}** needs urgent attention`);
                      }

                      // Join bullets with line breaks
                      return bullets.join('\n');
                    };

                    return (
                      <>
                        {metricRows.map((row, idx) => {
                          // Determine if this row is regression automation
                          const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
                          const rowIsPeriodBased = row.metric && periodBasedMetrics.includes(row.metric);
                          const rowIsAutomation = row.metric === 'regression_automation' || row.metric === 'overall_automation';
                          const wowChange = row.comparison?.leakage_change ?? 0;
                          const rowBg = isDarkMode
                            ? (idx % 2 === 0 ? currentTheme.colors.background : currentTheme.colors.surface)
                            : (idx % 2 === 0 ? cardBackground : currentTheme.colors.background);

                          return (
                            <tr
                              key={`${row.portfolio}-${row.project_key ?? idx}-${row.metric || 'unknown'}`}
                              style={{ backgroundColor: rowBg }}
                            >
                              <td className="py-3 px-4 text-sm font-medium" style={{
                                borderBottom: `1px solid ${cellBorder}`,
                                borderRight: `1px solid ${cellBorder}`,
                                color: isDarkMode ? '#F3F4F6' : '#111827',
                                fontFamily: 'Inter, sans-serif'
                              }}>
                        {row.portfolio_display || row.portfolio}
                    </td>
                              {rowIsPeriodBased ? (() => {
                                // Get period data - handle both single and comparison modes
                                const period = enableComparison ? (row.period2 || row.period) : (row.period || row.period2);
                                const period1 = enableComparison ? (row.period1 || null) : null;

                                // Debug logging for new metrics
                                if (row.metric === 'test_coverage' || row.metric === 'test_story_ratio' || row.metric === 'bug_ratio' || row.metric === 'test_review_status') {
                                  console.log(`🔍 Rendering ${row.metric} for ${row.portfolio}:`, {
                                    total_stories: row.total_stories,
                                    total_test_cases: row.total_test_cases,
                                    period: period,
                                    period1: period1,
                                    enableComparison: enableComparison,
                                    row_period: row.period,
                                    row_period1: row.period1,
                                    row_period2: row.period2,
                                    full_row: row
                                  });

                                  // If period is undefined, log warning
                                  if (!period) {
                                    console.warn(`⚠️ Period is undefined for ${row.metric} - ${row.portfolio}`);
                                  }
                                }

                                const cellTextColor = isDarkMode ? currentTheme.colors.text : currentTheme.colors.text;
                                const commentHtml = (row.ai_analysis || row.ai_insights || '')
                                  .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: ' + (isDarkMode ? '#F3F4F6' : '#111827') + ';">$1</strong>');
                                const renderMetricComment = () => (
                                  <td className="py-3 px-4 text-sm" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                    color: cellTextColor,
                                    maxWidth: '500px',
                                    fontFamily: 'Inter, sans-serif',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-line'
                                  }}>
                                    <div
                                      style={{ color: cellTextColor }}
                                      dangerouslySetInnerHTML={{ __html: commentHtml }}
                                    />
                                  </td>
                                );

                                if (
                                  row.metric === 'regression_automation' ||
                                  row.metric === 'overall_automation' ||
                                  row.metric === 'test_coverage' ||
                                  row.metric === 'test_story_ratio' ||
                                  row.metric === 'bug_ratio' ||
                                  row.metric === 'test_review_status'
                                ) {
                                  const metricProgress = row.progress as any;
                                  let firstCount = 0;
                                  let secondCount = 0;
                                  let previousValue = '0.0%';
                                  let currentValue = '0.0%';
                                  let progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.percentage_change ?? 0;
                                  let previousScore = 0;
                                  let currentScore = 0;
                                  let isRatioMetric = false;

                                  if (row.metric === 'regression_automation' || row.metric === 'overall_automation') {
                                    const automated = period?.automated ?? period?.automated_count ?? 0;
                                    const totalTests = period?.total ?? row.total_regression_tests ?? row.total_test_cases ?? ((period?.automated ?? 0) + (period?.requires_automation ?? 0) + (period?.automation_not_required ?? 0));
                                    firstCount = automated;
                                    secondCount = totalTests;
                                    previousScore = period1?.automation_percentage ?? 0;
                                    currentScore = period?.automation_percentage ?? 0;
                                    previousValue = formatPercentage(previousScore);
                                    currentValue = formatPercentage(currentScore);
                                  } else if (row.metric === 'test_coverage') {
                                    firstCount = period?.total_stories ?? row.total_stories ?? ((period?.stories_with_tests ?? 0) + (period?.stories_without_tests ?? 0));
                                    secondCount = period?.total_test_cases ?? row.total_test_cases ?? (period?.stories_with_tests ?? 0);
                                    previousScore = period1?.coverage_percentage ?? 0;
                                    currentScore = period?.coverage_percentage ?? 0;
                                    previousValue = formatPercentage(previousScore);
                                    currentValue = formatPercentage(currentScore);
                                  } else if (row.metric === 'test_story_ratio') {
                                    firstCount = period?.total_test_cases ?? row.total_test_cases ?? 0;
                                    secondCount = period?.total_stories ?? row.total_stories ?? 0;
                                    previousScore = period1?.ratio ?? 0;
                                    currentScore = period?.ratio ?? 0;
                                    previousValue = formatRatio(previousScore, 2);
                                    currentValue = formatRatio(currentScore, 2);
                                    progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.ratio_change ?? 0;
                                    isRatioMetric = true;
                                  } else if (row.metric === 'bug_ratio') {
                                    firstCount = period?.test_cases_executed ?? 0;
                                    secondCount = period?.bugs_found ?? 0;
                                    previousScore = period1?.ratio ?? 0;
                                    currentScore = period?.ratio ?? 0;
                                    previousValue = formatRatio(previousScore, 4);
                                    currentValue = formatRatio(currentScore, 4);
                                    progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.ratio_change ?? 0;
                                    isRatioMetric = true;
                                  } else if (row.metric === 'test_review_status') {
                                    firstCount = period?.reviewed_yes ?? 0;
                                    secondCount = ((period?.reviewed_yes ?? 0) + (period?.reviewed_no ?? 0) + (period?.not_set ?? 0)) || row.total_stories || 0;
                                    previousScore = period1?.review_percentage ?? 0;
                                    currentScore = period?.review_percentage ?? 0;
                                    previousValue = formatPercentage(previousScore);
                                    currentValue = formatPercentage(currentScore);
                                    progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.percentage_change ?? (currentScore - previousScore);
                                  }

                                  return (
                                    <>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatNumber(firstCount)}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#111827',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatNumber(secondCount)}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        backgroundColor: isRatioMetric ? (isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background) : getReviewBgColor(previousScore),
                                        color: isRatioMetric ? cellTextColor : getReviewTextColor(previousScore),
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {previousValue}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        backgroundColor: isRatioMetric ? (isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background) : getReviewBgColor(currentScore),
                                        color: isRatioMetric ? cellTextColor : getReviewTextColor(currentScore),
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {currentValue}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        backgroundColor: getReviewProgressBgColor(progressValue),
                                        color: getReviewProgressTextColor(progressValue),
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatChange(progressValue)}
                                      </td>
                                      {renderMetricComment()}
                                    </>
                                  );
                                }

                                // Render cells based on metric type
                                if (row.metric === 'regression_automation' || row.metric === 'overall_automation') {
                                  return (
                                <>
                                  <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    borderRight: `1px solid ${cellBorder}`,
                                    color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                                        {row.total_regression_tests ?? row.total_test_cases ?? 0}
                                      </td>
                                      {enableComparison && period1 && (
                                        <>
                                          <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                            borderBottom: `1px solid ${cellBorder}`,
                                            borderRight: `1px solid ${cellBorder}`,
                                            color: isDarkMode ? '#34D399' : '#059669',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {period1.automated_count ?? 0}
                                            <span className="block text-xs mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                                              ({formatPercentage(period1.automation_percentage ?? 0)})
                                            </span>
                                          </td>
                                          <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                            borderBottom: `1px solid ${cellBorder}`,
                                            borderRight: `1px solid ${cellBorder}`,
                                            color: isDarkMode ? '#F87171' : '#DC2626',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {period1.manual_count ?? 0}
                                          </td>
                                        </>
                                      )}
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#34D399' : '#059669',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.automated_count ?? 0}
                                        <span className="block text-xs mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                                          ({formatPercentage(period?.automation_percentage ?? 0)})
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#F87171' : '#DC2626',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.manual_count ?? 0}
                                  </td>
                                  {enableComparison && (
                                        <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                          borderBottom: `1px solid ${cellBorder}`,
                                          borderRight: `1px solid ${cellBorder}`,
                                          backgroundColor: getWowBgColor((row.progress?.percentage_change ?? 0)),
                                          color: getWowTextColor((row.progress?.percentage_change ?? 0)),
                                          fontFamily: 'Inter, sans-serif'
                                        }}>
                                          {formatChange(row.progress?.percentage_change ?? 0)}
                                        </td>
                                      )}
                                      <td className="py-3 px-4 text-sm" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                        color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
                                        maxWidth: '500px',
                                        fontFamily: 'Inter, sans-serif',
                                        lineHeight: '1.6',
                                        whiteSpace: 'pre-line'
                                      }}>
                                        <div
                                          style={{
                                            color: currentTheme.colors.text,
                                          }}
                                          dangerouslySetInnerHTML={{
                                            __html: (row.ai_analysis || row.ai_insights || '')
                                              .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: ' + (isDarkMode ? '#F3F4F6' : '#111827') + ';">$1</strong>')
                                          }}
                                        />
                                      </td>
                                    </>
                                  );
                                } else if (row.metric === 'test_coverage') {
                                  return (
                                    <>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {row.total_stories ?? 0}
                                      </td>
                                      {enableComparison && period1 && (
                                    <>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#34D399' : '#059669',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                            {period1.stories_with_tests ?? 0}
                                        <span className="block text-xs mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                                              ({formatPercentage(period1.coverage_percentage ?? 0)})
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#F87171' : '#DC2626',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                            {period1.stories_without_tests ?? 0}
                                      </td>
                                    </>
                                  )}
                                  <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    borderRight: `1px solid ${cellBorder}`,
                                    color: isDarkMode ? '#34D399' : '#059669',
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                                        {period?.stories_with_tests ?? 0}
                                    <span className="block text-xs mt-1" style={{ color: currentTheme.colors.textSecondary }}>
                                          ({formatPercentage(period?.coverage_percentage ?? 0)})
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    borderRight: `1px solid ${cellBorder}`,
                                    color: isDarkMode ? '#F87171' : '#DC2626',
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                                        {period?.stories_without_tests ?? 0}
                                  </td>
                                      {enableComparison && (
                                        <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                          borderBottom: `1px solid ${cellBorder}`,
                                          borderRight: `1px solid ${cellBorder}`,
                                          backgroundColor: getWowBgColor((row.progress?.percentage_change ?? 0)),
                                          color: getWowTextColor((row.progress?.percentage_change ?? 0)),
                                          fontFamily: 'Inter, sans-serif'
                                        }}>
                                          {formatChange(row.progress?.percentage_change ?? 0)}
                                        </td>
                                      )}
                                  <td className="py-3 px-4 text-sm" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                    color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
                                    maxWidth: '500px',
                                    fontFamily: 'Inter, sans-serif',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-line'
                                  }}>
                                    <div
                                      style={{
                                        color: currentTheme.colors.text,
                                      }}
                                      dangerouslySetInnerHTML={{
                                            __html: (row.ai_analysis || row.ai_insights || '')
                                          .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: ' + (isDarkMode ? '#F3F4F6' : '#111827') + ';">$1</strong>')
                                      }}
                                    />
                                  </td>
                                </>
                                  );
                                } else if (row.metric === 'test_story_ratio') {
                                  return (
                                    <>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.total_test_cases ?? 0}
                                      </td>
                                      {enableComparison && period1 && (
                                        <>
                                          <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                            borderBottom: `1px solid ${cellBorder}`,
                                            borderRight: `1px solid ${cellBorder}`,
                                            color: isDarkMode ? '#34D399' : '#059669',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {period1.total_stories ?? 0}
                                          </td>
                                          <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                            borderBottom: `1px solid ${cellBorder}`,
                                            borderRight: `1px solid ${cellBorder}`,
                                            color: isDarkMode ? '#F87171' : '#DC2626',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {(period1.ratio?.toFixed(2) ?? '0.00')} tests per story
                                          </td>
                                        </>
                                      )}
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#34D399' : '#059669',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.total_stories ?? 0}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#F87171' : '#DC2626',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {(period?.ratio?.toFixed(2) ?? '0.00')} tests per story
                                      </td>
                                      {enableComparison && (
                                        <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                          borderBottom: `1px solid ${cellBorder}`,
                                          borderRight: `1px solid ${cellBorder}`,
                                          backgroundColor: getWowBgColor((row.progress?.ratio_change ?? 0)),
                                          color: getWowTextColor((row.progress?.ratio_change ?? 0)),
                                          fontFamily: 'Inter, sans-serif'
                                        }}>
                                          {formatChange(row.progress?.ratio_change ?? 0)}
                                        </td>
                                      )}
                                      <td className="py-3 px-4 text-sm" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                        color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
                                        maxWidth: '500px',
                                        fontFamily: 'Inter, sans-serif',
                                        lineHeight: '1.6',
                                        whiteSpace: 'pre-line'
                                      }}>
                                        <div
                                          style={{
                                            color: currentTheme.colors.text,
                                          }}
                                          dangerouslySetInnerHTML={{
                                            __html: (row.ai_analysis || row.ai_insights || '')
                                              .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: ' + (isDarkMode ? '#F3F4F6' : '#111827') + ';">$1</strong>')
                                          }}
                                        />
                                      </td>
                                    </>
                                  );
                                } else if (row.metric === 'bug_ratio') {
                                  return (
                                    <>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.bugs_found ?? 0}
                                      </td>
                                      {enableComparison && period1 && (
                                        <>
                                          <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                            borderBottom: `1px solid ${cellBorder}`,
                                            borderRight: `1px solid ${cellBorder}`,
                                            color: isDarkMode ? '#34D399' : '#059669',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {period1.test_cases_executed ?? 0}
                                          </td>
                                          <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                            borderBottom: `1px solid ${cellBorder}`,
                                            borderRight: `1px solid ${cellBorder}`,
                                            color: isDarkMode ? '#F87171' : '#DC2626',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {period1.ratio?.toFixed(4) ?? '0.0000'}
                                          </td>
                                        </>
                                      )}
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#34D399' : '#059669',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.test_cases_executed ?? 0}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#F87171' : '#DC2626',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {period?.ratio?.toFixed(4) ?? '0.0000'}
                                      </td>
                                      {enableComparison && (
                                        <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                          borderBottom: `1px solid ${cellBorder}`,
                                          borderRight: `1px solid ${cellBorder}`,
                                          backgroundColor: getWowBgColor((row.progress?.ratio_change ?? 0)),
                                          color: getWowTextColor((row.progress?.ratio_change ?? 0)),
                                          fontFamily: 'Inter, sans-serif'
                                        }}>
                                          {formatChange(row.progress?.ratio_change ?? 0)}
                                        </td>
                                      )}
                                      <td className="py-3 px-4 text-sm" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                        color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
                                        maxWidth: '500px',
                                        fontFamily: 'Inter, sans-serif',
                                        lineHeight: '1.6',
                                        whiteSpace: 'pre-line'
                                      }}>
                                        <div
                                          style={{
                                            color: currentTheme.colors.text,
                                          }}
                                          dangerouslySetInnerHTML={{
                                            __html: (row.ai_analysis || row.ai_insights || '')
                                              .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: ' + (isDarkMode ? '#F3F4F6' : '#111827') + ';">$1</strong>')
                                          }}
                                        />
                                      </td>
                                    </>
                                  );
                                } else if (row.metric === 'test_review_status') {
                                  const currentReviewed = period?.reviewed_yes ?? 0;
                                  const currentTotal = ((period?.reviewed_yes ?? 0) + (period?.reviewed_no ?? 0) + (period?.not_set ?? 0)) || row.total_stories || 0;
                                  const previousPercentage = period1?.review_percentage ?? 0;
                                  const currentPercentage = period?.review_percentage ?? 0;
                                  const reviewChange = row.progress?.percentage_change ?? (currentPercentage - previousPercentage);

                                  return (
                                    <>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatNumber(currentReviewed)}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        color: isDarkMode ? '#D4A847' : '#111827',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatNumber(currentTotal)}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        backgroundColor: getReviewBgColor(previousPercentage),
                                        color: getReviewTextColor(previousPercentage),
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatPercentage(previousPercentage)}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        backgroundColor: getReviewBgColor(currentPercentage),
                                        color: getReviewTextColor(currentPercentage),
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatPercentage(currentPercentage)}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        borderRight: `1px solid ${cellBorder}`,
                                        backgroundColor: getReviewProgressBgColor(reviewChange),
                                        color: getReviewProgressTextColor(reviewChange),
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {formatChange(reviewChange)}
                                      </td>
                                      <td className="py-3 px-4 text-sm" style={{
                                        borderBottom: `1px solid ${cellBorder}`,
                                        backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                        color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
                                        maxWidth: '500px',
                                        fontFamily: 'Inter, sans-serif',
                                        lineHeight: '1.6',
                                        whiteSpace: 'pre-line'
                                      }}>
                                        <div
                                          style={{
                                            color: currentTheme.colors.text,
                                          }}
                                          dangerouslySetInnerHTML={{
                                            __html: (row.ai_analysis || row.ai_insights || '')
                                              .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: ' + (isDarkMode ? '#F3F4F6' : '#111827') + ';">$1</strong>')
                                          }}
                                        />
                                      </td>
                                    </>
                                  );
                                }
                                return null;
                              })() : (
                                <>
                                  <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    borderRight: `1px solid ${cellBorder}`,
                                    color: isDarkMode ? '#D4A847' : '#1D4ED8',
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                            {row.current_week.bugs_count ?? 0}
                        </td>
                                  <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    borderRight: `1px solid ${cellBorder}`,
                                    color: isDarkMode ? '#F87171' : '#DC2626',
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                            {row.current_week.defects_count ?? 0}
                        </td>
                                  {enableComparison && (
                                    <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                      borderBottom: `1px solid ${cellBorder}`,
                                      borderRight: `1px solid ${cellBorder}`,
                                      backgroundColor: getLeakageBgColor(row.previous_week.leakage_percentage ?? 0),
                                      color: getLeakageTextColor(row.previous_week.leakage_percentage ?? 0),
                                      fontFamily: 'Inter, sans-serif'
                                    }}>
                            {formatPercentage(row.previous_week.leakage_percentage)}
                          </td>
                                  )}
                                  <td className="py-3 px-4 text-center text-sm font-semibold" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    borderRight: `1px solid ${cellBorder}`,
                                    backgroundColor: getLeakageBgColor(row.current_week.leakage_percentage ?? 0),
                                    color: getLeakageTextColor(row.current_week.leakage_percentage ?? 0),
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                                    <div className="flex items-center justify-center gap-2">
                                      {(() => {
                                        const status = getStatusIcon(row.current_week.leakage_percentage ?? 0);
                                        const StatusIcon = status.icon;
                                        return (
                                          <>
                                            <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
                                            {formatPercentage(row.current_week.leakage_percentage)}
                                          </>
                                        );
                                      })()}
                                    </div>
                          </td>
                                  {enableComparison && (
                                    <td className="py-3 px-4 text-center text-sm font-bold" style={{
                                      borderBottom: `1px solid ${cellBorder}`,
                                      borderRight: `1px solid ${cellBorder}`,
                                      backgroundColor: getWowBgColor(wowChange),
                                      color: getWowTextColor(wowChange),
                                      fontFamily: 'Inter, sans-serif'
                                    }}>
                                      <div className="flex items-center justify-center gap-2">
                                        {(() => {
                                          const status = getStatusIcon(row.current_week.leakage_percentage ?? 0, wowChange);
                                          const StatusIcon = status.icon;
                                          return (
                                            <>
                                              <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
                                              {formatChange(wowChange)}
                                            </>
                                          );
                                        })()}
                                      </div>
                          </td>
                                  )}
                                  <td className="py-3 px-4 text-sm" style={{
                                    borderBottom: `1px solid ${cellBorder}`,
                                    backgroundColor: isDarkMode ? currentTheme.colors.surface : currentTheme.colors.background,
                                    color: isDarkMode ? currentTheme.colors.text : currentTheme.colors.text,
                                    maxWidth: '400px',
                                    fontFamily: 'Inter, sans-serif',
                                    lineHeight: '1.5'
                                  }}>
                                    <span>
                                      <strong style={{ color: isDarkMode ? '#F3F4F6' : '#111827' }}>{row.portfolio_display || row.portfolio}</strong> {buildCommentText(row as Analysis, metricLabel)}
                                    </span>
                          </td>
                                </>
                              )}
                    </tr>
                          );
                        })}

                        {/* Grand Total Row */}
                        {grandTotal && (() => {
                          const gtWowChange = grandTotal.comparison?.leakage_change ?? 0;
                          const periodBasedMetrics = ['regression_automation', 'overall_automation', 'test_coverage', 'test_story_ratio', 'bug_ratio', 'test_review_status'];
                          const grandTotalIsPeriodBased = grandTotal.metric && periodBasedMetrics.includes(grandTotal.metric);
                          const grandTotalIsAutomation = grandTotal.metric === 'regression_automation' || grandTotal.metric === 'overall_automation';
                          const grandTotalIsReviewStatus = grandTotal.metric === 'test_review_status';
                          
                          // Use CSS variables for PDF-matching colors (works in both light/dark mode)
                          const grandTotalBg = 'var(--tcoe-grand-total-bg)';
                          const grandTotalText = 'var(--tcoe-grand-total-text)';
              return (
                            <tr className="tcoe-grand-total pdf-grand-total-row" style={{ backgroundColor: grandTotalBg }}>
                              <td className="py-4 px-4 text-sm font-bold portfolio-cell" style={{
                                borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                backgroundColor: grandTotalBg,
                                color: grandTotalText,
                                fontFamily: 'Inter, sans-serif',
                                padding: '12px 16px',
                                fontWeight: 700,
                                textAlign: 'left'
                              }}>
                                Grand Total
                              </td>
                              {grandTotalIsPeriodBased ? (() => {
                                const gtPeriod = enableComparison ? (grandTotal.period2 || grandTotal.period) : grandTotal.period;
                                const gtPeriod1 = enableComparison ? grandTotal.period1 : null;

                                if (
                                  grandTotal.metric === 'regression_automation' ||
                                  grandTotal.metric === 'overall_automation' ||
                                  grandTotal.metric === 'test_coverage' ||
                                  grandTotal.metric === 'test_story_ratio' ||
                                  grandTotal.metric === 'bug_ratio' ||
                                  grandTotal.metric === 'test_review_status'
                                ) {
                                  const metricProgress = grandTotal.progress as any;
                                  let firstCount = 0;
                                  let secondCount = 0;
                                  let previousValue = '0.0%';
                                  let currentValue = '0.0%';
                                  let progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.percentage_change ?? 0;
                                  let previousScore = 0;
                                  let currentScore = 0;
                                  let isRatioMetric = false;

                                  if (grandTotal.metric === 'regression_automation' || grandTotal.metric === 'overall_automation') {
                                    const automated = gtPeriod?.automated ?? gtPeriod?.automated_count ?? 0;
                                    const totalTests = gtPeriod?.total ?? grandTotal.total_regression_tests ?? grandTotal.total_test_cases ?? ((gtPeriod?.automated ?? 0) + (gtPeriod?.requires_automation ?? 0) + (gtPeriod?.automation_not_required ?? 0));
                                    firstCount = automated;
                                    secondCount = totalTests;
                                    previousScore = gtPeriod1?.automation_percentage ?? 0;
                                    currentScore = gtPeriod?.automation_percentage ?? 0;
                                    previousValue = formatPercentage(previousScore);
                                    currentValue = formatPercentage(currentScore);
                                  } else if (grandTotal.metric === 'test_coverage') {
                                    firstCount = gtPeriod?.total_stories ?? grandTotal.total_stories ?? ((gtPeriod?.stories_with_tests ?? 0) + (gtPeriod?.stories_without_tests ?? 0));
                                    secondCount = gtPeriod?.total_test_cases ?? grandTotal.total_test_cases ?? (gtPeriod?.stories_with_tests ?? 0);
                                    previousScore = gtPeriod1?.coverage_percentage ?? 0;
                                    currentScore = gtPeriod?.coverage_percentage ?? 0;
                                    previousValue = formatPercentage(previousScore);
                                    currentValue = formatPercentage(currentScore);
                                  } else if (grandTotal.metric === 'test_story_ratio') {
                                    firstCount = gtPeriod?.total_test_cases ?? grandTotal.total_test_cases ?? 0;
                                    secondCount = gtPeriod?.total_stories ?? grandTotal.total_stories ?? 0;
                                    previousScore = gtPeriod1?.ratio ?? 0;
                                    currentScore = gtPeriod?.ratio ?? 0;
                                    previousValue = formatRatio(previousScore, 2);
                                    currentValue = formatRatio(currentScore, 2);
                                    progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.ratio_change ?? 0;
                                    isRatioMetric = true;
                                  } else if (grandTotal.metric === 'bug_ratio') {
                                    firstCount = gtPeriod?.test_cases_executed ?? 0;
                                    secondCount = gtPeriod?.bugs_found ?? 0;
                                    previousScore = gtPeriod1?.ratio ?? 0;
                                    currentScore = gtPeriod?.ratio ?? 0;
                                    previousValue = formatRatio(previousScore, 4);
                                    currentValue = formatRatio(currentScore, 4);
                                    progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.ratio_change ?? 0;
                                    isRatioMetric = true;
                                  } else if (grandTotal.metric === 'test_review_status') {
                                    firstCount = gtPeriod?.reviewed_yes ?? 0;
                                    secondCount = ((gtPeriod?.reviewed_yes ?? 0) + (gtPeriod?.reviewed_no ?? 0) + (gtPeriod?.not_set ?? 0)) || grandTotal.total_stories || 0;
                                    previousScore = gtPeriod1?.review_percentage ?? 0;
                                    currentScore = gtPeriod?.review_percentage ?? 0;
                                    previousValue = formatPercentage(previousScore);
                                    currentValue = formatPercentage(currentScore);
                                    progressValue = metricProgress?.wow_progress_pct ?? metricProgress?.percentage_change ?? (currentScore - previousScore);
                                  }

                                  return (
                                    <>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: grandTotalBg,
                                        color: grandTotalText,
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                        {formatNumber(firstCount)}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: grandTotalBg,
                                        color: grandTotalText,
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                        {formatNumber(secondCount)}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: isRatioMetric ? grandTotalBg : getReviewBgColor(previousScore),
                                        color: isRatioMetric ? grandTotalText : getReviewTextColor(previousScore),
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                        {previousValue}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: isRatioMetric ? grandTotalBg : getReviewBgColor(currentScore),
                                        color: isRatioMetric ? grandTotalText : getReviewTextColor(currentScore),
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                        {currentValue}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: getReviewProgressBgColor(progressValue),
                                        color: getReviewProgressTextColor(progressValue),
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                        {formatChange(progressValue)}
                                      </td>
                                      <td className="py-4 px-4 text-sm tcoe-grand-total" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        backgroundColor: grandTotalBg,
                                        color: grandTotalText,
                                        fontFamily: 'Inter, sans-serif',
                                        maxWidth: '500px',
                                        lineHeight: '1.45',
                                        padding: '12px 16px'
                                      }}>
                                        {grandTotal.ai_analysis || buildRegressionSummary(metricRows)}
                                      </td>
                                    </>
                                  );
                                }

                                if (grandTotalIsAutomation) {
                                  return (
                                <>
                                  <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    padding: '12px 16px',
                                    fontWeight: 700
                                  }}>
                                        {formatNumber(grandTotal.total_regression_tests ?? grandTotal.total_test_cases ?? 0)}
                                  </td>
                                      {enableComparison && gtPeriod1 && (
                                    <>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                        borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                        backgroundColor: 'var(--tcoe-grand-total-bg)',
                                        color: 'var(--tcoe-grand-total-text)',
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                            {formatNumber(gtPeriod1.automated_count ?? 0)}
                                        <span className="block text-xs mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                              ({formatPercentage(gtPeriod1.automation_percentage ?? 0)})
                                        </span>
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                        borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                        backgroundColor: 'var(--tcoe-grand-total-bg)',
                                        color: 'var(--tcoe-grand-total-text)',
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                            {formatNumber(gtPeriod1.manual_count ?? 0)}
                                      </td>
                                    </>
                                  )}
                                  <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    padding: '12px 16px',
                                    fontWeight: 700
                                  }}>
                                        {formatNumber(gtPeriod?.automated_count ?? 0)}
                                    <span className="block text-xs mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                          ({formatPercentage(gtPeriod?.automation_percentage ?? 0)})
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    padding: '12px 16px',
                                    fontWeight: 700
                                  }}>
                                        {formatNumber(gtPeriod?.manual_count ?? 0)}
                                  </td>
                                      {enableComparison && (
                                        <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                          borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                          borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                          backgroundColor: 'var(--tcoe-grand-total-bg)',
                                          color: 'var(--tcoe-grand-total-text)',
                                          fontFamily: 'Inter, sans-serif',
                                          padding: '12px 16px',
                                          fontWeight: 700
                                        }}>
                                          {formatChange(grandTotal.progress?.percentage_change ?? 0)}
                                        </td>
                                      )}
                                  <td className="py-4 px-4 text-sm tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    maxWidth: '500px',
                                    lineHeight: '1.45',
                                    padding: '12px 16px'
                                  }}>
                                        {grandTotal.ai_analysis || buildRegressionSummary(metricRows)}
                                  </td>
                                </>
                                  );
                                } else if (grandTotal.metric === 'test_coverage') {
                                  return (
                                <>
                                  <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    padding: '12px 16px',
                                    fontWeight: 700
                                  }}>
                                        {formatNumber(grandTotal.total_stories ?? 0)}
                                  </td>
                                      {enableComparison && gtPeriod1 && (
                                        <>
                                  <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    padding: '12px 16px',
                                    fontWeight: 700
                                  }}>
                                            {formatNumber(gtPeriod1.stories_with_tests ?? 0)}
                                            <span className="block text-xs mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                              ({formatPercentage(gtPeriod1.coverage_percentage ?? 0)})
                                            </span>
                                  </td>
                                    <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                      borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                      borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                      backgroundColor: 'var(--tcoe-grand-total-bg)',
                                      color: 'var(--tcoe-grand-total-text)',
                                      fontFamily: 'Inter, sans-serif',
                                      padding: '12px 16px',
                                      fontWeight: 700
                                    }}>
                                            {formatNumber(gtPeriod1.stories_without_tests ?? 0)}
                                    </td>
                                        </>
                                  )}
                                  <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                    borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                    borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                    backgroundColor: 'var(--tcoe-grand-total-bg)',
                                    color: 'var(--tcoe-grand-total-text)',
                                    fontFamily: 'Inter, sans-serif',
                                    padding: '12px 16px',
                                    fontWeight: 700
                                  }}>
                                        {formatNumber(gtPeriod?.stories_with_tests ?? 0)}
                                        <span className="block text-xs mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                          ({formatPercentage(gtPeriod?.coverage_percentage ?? 0)})
                                        </span>
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                        borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                        borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                        backgroundColor: 'var(--tcoe-grand-total-bg)',
                                        color: 'var(--tcoe-grand-total-text)',
                                        fontFamily: 'Inter, sans-serif',
                                        padding: '12px 16px',
                                        fontWeight: 700
                                      }}>
                                        {formatNumber(gtPeriod?.stories_without_tests ?? 0)}
                                  </td>
                                  {enableComparison && (
                                    <td className="py-4 px-4 text-center text-sm font-bold tcoe-grand-total" style={{
                                      borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                      borderRight: '1px solid var(--tcoe-grand-total-bg)',
                                      backgroundColor: 'var(--tcoe-grand-total-bg)',
                                      color: 'var(--tcoe-grand-total-text)',
                                      fontFamily: 'Inter, sans-serif',
                                      padding: '12px 16px',
                                      fontWeight: 700
                                    }}>
                                          {formatChange(grandTotal.progress?.percentage_change ?? 0)}
                                        </td>
                                      )}
                                      <td className="py-4 px-4 text-sm tcoe-grand-total" style={{
                                        borderTop: '2px solid var(--tcoe-grand-total-bg)',
                                        backgroundColor: 'var(--tcoe-grand-total-bg)',
                                        color: 'var(--tcoe-grand-total-text)',
                                        fontFamily: 'Inter, sans-serif',
                                        maxWidth: '500px',
                                        lineHeight: '1.45',
                                        padding: '12px 16px'
                                      }}>
                                        {grandTotal.ai_analysis || ''}
                                      </td>
                                    </>
                                  );
                                } else if (grandTotal.metric === 'test_story_ratio') {
                                          return (
                                            <>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        borderRight: `1px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {gtPeriod?.total_test_cases ?? 0}
                                      </td>
                                      {enableComparison && gtPeriod1 && (
                                        <>
                                          <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                            borderTop: `2px solid ${currentTheme.colors.primary}`,
                                            borderRight: `1px solid ${currentTheme.colors.primary}`,
                                            color: '#FFFFFF',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {gtPeriod1.total_stories ?? 0}
                                          </td>
                                          <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                            borderTop: `2px solid ${currentTheme.colors.primary}`,
                                            borderRight: `1px solid ${currentTheme.colors.primary}`,
                                            color: '#FFFFFF',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {(gtPeriod1.ratio?.toFixed(2) ?? '0.00')} tests per story
                                          </td>
                                        </>
                                      )}
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        borderRight: `1px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {gtPeriod?.total_stories ?? 0}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        borderRight: `1px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {(gtPeriod?.ratio?.toFixed(2) ?? '0.00')} tests per story
                                      </td>
                                      {enableComparison && (
                                        <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                          borderTop: `2px solid ${currentTheme.colors.primary}`,
                                          borderRight: `1px solid ${currentTheme.colors.primary}`,
                                          color: '#FFFFFF',
                                          fontFamily: 'Inter, sans-serif'
                                        }}>
                                          {formatChange(grandTotal.progress?.ratio_change ?? 0)}
                                    </td>
                                  )}
                                  <td className="py-4 px-4 text-sm" style={{
                                    borderTop: `2px solid ${currentTheme.colors.primary}`,
                                    color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif',
                                        maxWidth: '500px',
                                        lineHeight: '1.5'
                                  }}>
                                        {grandTotal.ai_analysis || ''}
                                  </td>
                                </>
                                  );
                                } else if (grandTotal.metric === 'bug_ratio') {
                                  return (
                                    <>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        borderRight: `1px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                              fontFamily: 'Inter, sans-serif'
                            }}>
                                        {gtPeriod?.bugs_found ?? 0}
                            </td>
                                      {enableComparison && gtPeriod1 && (
                                        <>
                                          <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                            borderTop: `2px solid ${currentTheme.colors.primary}`,
                                            borderRight: `1px solid ${currentTheme.colors.primary}`,
                                            color: '#FFFFFF',
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                            {gtPeriod1.test_cases_executed ?? 0}
                                          </td>
                                          <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                            borderTop: `2px solid ${currentTheme.colors.primary}`,
                                            borderRight: `1px solid ${currentTheme.colors.primary}`,
                                            color: '#FFFFFF',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {gtPeriod1.ratio?.toFixed(4) ?? '0.0000'}
                                          </td>
                                        </>
                                      )}
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        borderRight: `1px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {gtPeriod?.test_cases_executed ?? 0}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        borderRight: `1px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif'
                                      }}>
                                        {gtPeriod?.ratio?.toFixed(4) ?? '0.0000'}
                                </td>
                                {enableComparison && (
                                        <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                          borderTop: `2px solid ${currentTheme.colors.primary}`,
                                          borderRight: `1px solid ${currentTheme.colors.primary}`,
                                          color: '#FFFFFF',
                                          fontFamily: 'Inter, sans-serif'
                                        }}>
                                          {formatChange(grandTotal.progress?.ratio_change ?? 0)}
                                        </td>
                                      )}
                                      <td className="py-4 px-4 text-sm" style={{
                                        borderTop: `2px solid ${currentTheme.colors.primary}`,
                                        color: '#FFFFFF',
                                        fontFamily: 'Inter, sans-serif',
                                        maxWidth: '500px',
                                        lineHeight: '1.5'
                                      }}>
                                        {grandTotal.ai_analysis || ''}
                                      </td>
                                    </>
                                  );
                                } else if (grandTotal.metric === 'test_review_status') {
                                  const currentReviewed = gtPeriod?.reviewed_yes ?? 0;
                                  const currentTotal = ((gtPeriod?.reviewed_yes ?? 0) + (gtPeriod?.reviewed_no ?? 0) + (gtPeriod?.not_set ?? 0)) || grandTotal.total_stories || 0;
                                  const previousPercentage = gtPeriod1?.review_percentage ?? 0;
                                  const currentPercentage = gtPeriod?.review_percentage ?? 0;
                                  const reviewChange = grandTotal.progress?.percentage_change ?? (currentPercentage - previousPercentage);

                                  return (
                                    <>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        color: grandTotalText,
                                      fontFamily: 'Inter, sans-serif'
                                    }}>
                                        {formatNumber(currentReviewed)}
                                      </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        color: grandTotalText,
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                        {formatNumber(currentTotal)}
                                </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: getReviewBgColor(previousPercentage),
                                        color: getReviewTextColor(previousPercentage),
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                        {formatPercentage(previousPercentage)}
                                </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        borderRight: `1px solid ${grandTotalBg}`,
                                        backgroundColor: getReviewBgColor(currentPercentage),
                                        color: getReviewTextColor(currentPercentage),
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                        {formatPercentage(currentPercentage)}
                                </td>
                                      <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                          borderTop: `2px solid ${grandTotalBg}`,
                                          borderRight: `1px solid ${grandTotalBg}`,
                                          backgroundColor: getReviewProgressBgColor(reviewChange),
                                          color: getReviewProgressTextColor(reviewChange),
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                          {formatChange(reviewChange)}
                                        </td>
                                      <td className="py-4 px-4 text-sm" style={{
                                        borderTop: `2px solid ${grandTotalBg}`,
                                        color: grandTotalText,
                                        fontFamily: 'Inter, sans-serif',
                                        maxWidth: '500px',
                                        lineHeight: '1.5'
                                      }}>
                                        {grandTotal.ai_analysis || ''}
                                </td>
                              </>
                                  );
                                }
                                return null;
                              })() : (
                                <>
                                  <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                    borderTop: `2px solid ${currentTheme.colors.primary}`,
                                    borderRight: `1px solid ${currentTheme.colors.primary}`,
                                    color: '#FFFFFF',
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                    {grandTotal.current_week.bugs_count}
                                </td>
                                  <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                    borderTop: `2px solid ${currentTheme.colors.primary}`,
                                    borderRight: `1px solid ${currentTheme.colors.primary}`,
                                    color: '#FFFFFF',
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                    {grandTotal.current_week.defects_count}
                                </td>
                                {enableComparison && (
                                    <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                      borderTop: `2px solid ${currentTheme.colors.primary}`,
                                      borderRight: `1px solid ${currentTheme.colors.primary}`,
                                      color: '#FFFFFF',
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                                    {formatPercentage(grandTotal.previous_week.leakage_percentage)}
                                  </td>
                                )}
                                  <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                    borderTop: `2px solid ${currentTheme.colors.primary}`,
                                    borderRight: `1px solid ${currentTheme.colors.primary}`,
                                    color: '#FFFFFF',
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                  {formatPercentage(grandTotal.current_week.leakage_percentage)}
                                </td>
                                {enableComparison && (
                                    <td className="py-4 px-4 text-center text-sm font-bold" style={{
                                      borderTop: `2px solid ${currentTheme.colors.primary}`,
                                      borderRight: `1px solid ${currentTheme.colors.primary}`,
                                      backgroundColor: getWowBgColor(gtWowChange),
                                      color: getWowTextColor(gtWowChange),
                                    fontFamily: 'Inter, sans-serif'
                                  }}>
                                      <div className="flex items-center justify-center gap-2">
                                        {(() => {
                                          const status = getStatusIcon(0, gtWowChange);
                                          const StatusIcon = status.icon;
                                          return (
                                            <>
                                              <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
                                              {formatChange(gtWowChange)}
                                            </>
                                          );
                                        })()}
                                      </div>
                                  </td>
                                )}
                                  <td className="py-4 px-4 text-sm" style={{
                                    borderTop: `2px solid ${currentTheme.colors.primary}`,
                                    color: '#FFFFFF',
                                  fontFamily: 'Inter, sans-serif'
                                }}>
                                    {grandTotal.ai_insights}
                                </td>
                              </>
                            )}
                          </tr>
                          );
                        })()}
                      </>
                    );
                  })()}
                  </tbody>
                </table>
              </div>
            )}
            </Card>
          );
        });

        // Return wrapped cards in a container for PDF export
        return (
          <div
            id="tcoe-report"
            className="space-y-6 pdf-export-container"
            style={{
              width: '100%',
              maxWidth: '100%',
              padding: '20px',
                backgroundColor: pdfContainerBg,
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {/* PDF-specific styles injected via style tag */}
            <style>{`
              @media print {
                .pdf-export-container * {
                  page-break-inside: avoid;
                }
                .pdf-metric-card {
                  page-break-after: always;
                  page-break-inside: avoid;
                }
                .pdf-table {
                  page-break-inside: avoid;
                }
                .pdf-comment-section {
                  page-break-inside: avoid;
                }
              }
              .pdf-table-cell {
                padding: 8px 12px !important;
                vertical-align: middle !important;
              }
              .pdf-table-header {
                background-color: ${pdfHeaderBg} !important;
                color: ${pdfHeaderText} !important;
                font-weight: 500 !important;
                padding: 8px 12px !important;
              }
              .pdf-grand-total-row {
                background-color: ${pdfGrandTotalBg} !important;
                color: ${pdfGrandTotalText} !important;
                font-weight: 600 !important;
                padding: 10px 12px !important;
              }
              .pdf-comment-text {
                line-height: 1.45 !important;
                padding: 8px 12px !important;
              }
              .pdf-section-header {
                height: 60px !important;
                page-break-after: avoid;
              }
              .pdf-metric-title {
                font-size: 18px !important;
                margin-bottom: 24px !important;
              }
            `}</style>

            {/* Report Generation Time Indicator */}
            {timeDisplay && (
              <div
                className="pdf-time-indicator"
                style={{
                  textAlign: 'right',
                  fontSize: '12px',
                  color: currentTheme.colors.textSecondary,
                  fontFamily: 'Inter, sans-serif',
                  marginBottom: '8px',
                  paddingRight: '4px'
                }}
              >
                {timeDisplay}
              </div>
            )}
            {cards}
          </div>
        );
      })()}

        {/* Info Box when no data */}
      {!analysis && !(rows && rows.length) && !loading && (
        <Alert
          className="border flex items-start gap-3"
          style={{
            backgroundColor: isDarkMode ? `${currentTheme.colors.info}15` : 'var(--accent-cool-bg)',
            borderColor: isDarkMode ? `${currentTheme.colors.info}40` : '#B0D5EB',
            color: currentTheme.colors.info
          }}
        >
          <Info className="h-4 w-4" style={{ color: isDarkMode ? '#D4A847' : currentTheme.colors.info }} />
          <AlertDescription className="text-sm" style={{ color: currentTheme.colors.info }}>
              <strong>QCOE Report:</strong> Select filters above and click "Generate" to analyze quality metrics.
              Click on Portfolio or Project dropdown to select multiple items with checkboxes.
          </AlertDescription>
        </Alert>
      )}
    </div>
    </DashboardLayout>
  );
}
