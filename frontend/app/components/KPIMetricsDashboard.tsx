'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  RefreshCw, Download, AlertTriangle, Bug, AlertCircle,
  CheckCircle, Activity, BarChart3, PieChart, Award, FileText, Sheet,
  ChevronRight, Building2, Code, Zap
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { getApiUrl } from '../../lib/api-config';
import { LoadingSkeleton } from './figma/InsightsDashboard/components/LoadingSkeleton';
import { DashboardLayout } from './DashboardLayout';

// ─── CDK palette (single source: globals.css / themes.ts) ─────────────────────
const DS = {
  pageBg:        'var(--bg-page)',
  cardBg:        'var(--bg-card)',
  surface:       'var(--bg-surface)',
  hover:         'var(--bg-hover)',
  active:        'var(--bg-active)',
  border:        'var(--border)',
  borderStrong:  'var(--border-strong)',
  textPrimary:   'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted:     'var(--text-muted)',
  green:         'var(--green)',
  greenBg:       'var(--green-bg)',
  amber:         'var(--amber)',
  amberBg:       'var(--amber-bg)',
  red:           'var(--red)',
  redBg:         'var(--red-bg)',
  blue:          'var(--blue)',
  blueBg:        'var(--blue-bg)',
  font:          'var(--font)',
  mono:          'var(--mono)',
} as const;

const card = {
  background: DS.cardBg,
  border: '1px solid var(--border)',
  borderRadius: '12px',
} as const;

interface KPIMetricsData {
  defect_count: number;
  bug_count: number;
  defect_rca_breakdown: Record<string, number>;
  bug_rca_breakdown: Record<string, number>;
  automation_metrics: {
    completion_percentage: number;
    automation_percentage: number;
    committed_tc_count: number;
    completed_tc_count: number;
    total_projects: number;
  };
  projects_list: Array<{
    project_key: string;
    project_name: string;
    defect_count: number;
    bug_count: number;
    automation_percentage: number;
    completion_percentage: number;
  }>;
  defect_details: Array<{
    issue_key: string;
    summary: string;
    priority: string;
    severity: string;
    sprint: string;
    assignee_name: string;
    assignee_from_tao: string;
    missed_by_tao_qe: string;
    linked_story: string;
    rca: string;
    justification: string;
  }>;
  bug_details: Array<{
    issue_key: string;
    summary: string;
    priority: string;
    severity: string;
    sprint: string;
    assignee_name: string;
    assignee_from_tao: string;
    caused_by_tao_dev: string;
    linked_story: string;
    rca: string;
    justification: string;
  }>;
  automation_details: Array<{
    project_key: string;
    project_name: string;
    project_type: string;
    tool_framework: string;
    ai_assistant_integration_enabled: string;
    ai_assistant: string;
    usage_level_of_ai_assistant: string;
    impact_on_productivity: string;
    ai_usage_inference: string;
    qa_owner: string;
    committed_tc_count: number;
    completed_tc_count: number;
    completion_percentage: number;
    automation_percentage: number;
  }>;
  filters: {
    portfolio: string;
    project_key: string;
    project_name: string;
    rca: string;
  };
}

interface DropdownOptions {
  portfolios: string[];
  project_keys: string[];
  project_names: string[];
  rca_values: string[];
}

export function KPIMetricsDashboard() {
  const { currentTheme, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KPIMetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataKey, setDataKey] = useState(0);
  const [aiInsights, setAiInsights] = useState<{
    comment: string;
    recommendations: string[];
    prediction: string;
    leakage_percentage: number;
    change_percentage: number | null;
  } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const [options, setOptions] = useState<DropdownOptions>({
    portfolios: ['All'],
    project_keys: ['All'],
    project_names: ['All'],
    rca_values: ['All']
  });

  const [selectedPortfolio, setSelectedPortfolio] = useState('All');
  const [selectedProjectKey, setSelectedProjectKey] = useState('All');
  const [selectedProjectName, setSelectedProjectName] = useState('All');
  const [selectedRCA, setSelectedRCA] = useState('All');

  useEffect(() => { fetchDropdownOptions(); }, []);

  useEffect(() => {
    if (selectedPortfolio !== 'All') fetchDropdownOptions(selectedPortfolio);
  }, [selectedPortfolio]);

  useEffect(() => {
    fetchKPIMetrics();
  }, [selectedPortfolio, selectedProjectKey, selectedProjectName, selectedRCA]);

  const fetchDropdownOptions = async (portfolio?: string) => {
    try {
      const url = portfolio && portfolio !== 'All'
        ? `/api/kpi-metrics/options?portfolio=${encodeURIComponent(portfolio)}`
        : '/api/kpi-metrics/options';
      const response = await fetch(getApiUrl(url));
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setOptions({
            portfolios: result.options.portfolios || ['All'],
            project_keys: result.options.project_keys || ['All'],
            project_names: result.options.project_names || ['All'],
            rca_values: result.options.rca_values || ['All']
          });
        }
      }
    } catch (err) {
      console.error('Error fetching dropdown options:', err);
    }
  };

  const fetchKPIMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl('/api/kpi-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: selectedPortfolio,
          project_key: selectedProjectKey,
          project_name: selectedProjectName,
          rca: selectedRCA
        })
      });
      if (!response.ok) throw new Error('Failed to fetch KPI metrics');
      const result = await response.json();
      if (result.success) {
        const dataWithDefaults = {
          ...result.data,
          defect_details: result.data.defect_details || [],
          bug_details: result.data.bug_details || [],
          automation_details: result.data.automation_details || [],
          projects_list: result.data.projects_list || []
        };
        setData(dataWithDefaults);
        setDataKey(prev => prev + 1);
        fetchAIInsights(selectedPortfolio, selectedProjectKey, selectedProjectName, selectedRCA);
      } else {
        setError(result.error || 'Failed to load data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAIInsights = async (portfolio: string, projectKey: string, projectName: string, rca: string) => {
    setLoadingInsights(true);
    try {
      const response = await fetch(getApiUrl('/api/kpi-metrics/ai-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio, project_key: projectKey, project_name: projectName, rca })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.insights) setAiInsights(result.insights);
      }
    } catch (err) {
      console.error('Error fetching AI insights:', err);
    } finally {
      setLoadingInsights(false);
    }
  };

  const exportToCSV = () => {
    if (!data) return;
    const csv = [
      ['Metric', 'Value'],
      ['Defect Count', data.defect_count || 0],
      ['Bug Count', data.bug_count || 0],
      ['Automation %', data.automation_metrics?.automation_percentage || 0],
      ['Completion %', data.automation_metrics?.completion_percentage || 0],
      ['Committed TC', data.automation_metrics?.committed_tc_count || 0],
      ['Completed TC', data.automation_metrics?.completed_tc_count || 0]
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KPI-Metrics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    if (!data) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>KPI Metrics Report</title>
        <style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;}th,td{padding:10px;text-align:left;border-bottom:1px solid #ccc;}th{background:#f5f5f5;}</style>
        </head><body>
        <h1>KPI Metrics Report</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <table>
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>Defect Count</td><td>${data.defect_count || 0}</td></tr>
          <tr><td>Bug Count</td><td>${data.bug_count || 0}</td></tr>
          <tr><td>Automation %</td><td>${data.automation_metrics?.automation_percentage || 0}%</td></tr>
          <tr><td>Completion %</td><td>${data.automation_metrics?.completion_percentage || 0}%</td></tr>
        </table></body></html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    }
  };

  if (loading && !data) return <LoadingSkeleton />;

  if (error && !data) {
    return (
      <DashboardLayout>
        <div style={{ padding: '24px', fontFamily: DS.font }}>
          <div style={{ background: DS.redBg, border: `1px solid ${DS.red}`, borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle style={{ color: DS.red, flexShrink: 0 }} size={16} />
            <span style={{ color: DS.red, fontSize: '14px' }}>{error}</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const totalDefects = data.defect_count || 0;
  const totalBugs = data.bug_count || 0;
  const automationPct = data.automation_metrics?.automation_percentage || 0;
  const completionPct = data.automation_metrics?.completion_percentage || 0;

  // ─── Shared label style for select dropdowns ──────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: DS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 500,
    marginBottom: '6px',
    display: 'block',
    fontFamily: DS.font,
  };

  const selectTriggerStyle: React.CSSProperties = {
    background: DS.surface,
    border: `1px solid ${DS.border}`,
    borderRadius: '8px',
    color: DS.textPrimary,
    fontSize: '13px',
    fontFamily: DS.font,
  };

  // ── Gauge ring helper ────────────────────────────────────────────────────
  const GaugeRing = ({ value, max = 100, color, size = 96 }: { value: number; max?: number; color: string; size?: number }) => {
    const r = (size - 12) / 2;
    const circ = 2 * Math.PI * r;
    const pct = Math.min(value / max, 1);
    const dash = pct * circ;
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={DS.border} strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s ease' }}
        />
      </svg>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '24px', fontFamily: DS.font }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}
          >
            {/* Left: title block */}
            <div>
              <p style={{ color: 'var(--accent-cool)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Key Performance Indicators
              </p>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: DS.textPrimary, letterSpacing: '-0.04em', margin: 0 }}>
                CDK KPI Metrics
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                <p style={{ fontSize: '14px', color: DS.textSecondary, margin: 0 }}>
                  Comprehensive Performance Indicators Dashboard
                </p>
                {data?.projects_list?.length > 0 && (
                  <span style={{ background: DS.blueBg, color: DS.blue, border: `1px solid ${DS.blue}30`, borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 600 }}>
                    {data.projects_list.length} Projects
                  </span>
                )}
              </div>
            </div>

            {/* Right: action buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={fetchKPIMetrics}
                disabled={loading}
                style={{ background: 'var(--accent-cool)', color: 'var(--bg-page)', border: 'none', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: loading ? 0.7 : 1, fontFamily: DS.font, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
              >
                <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                Refresh
              </button>
              <button
                onClick={exportToCSV}
                disabled={!data}
                style={{ background: DS.surface, color: DS.textPrimary, border: `1px solid ${DS.border}`, borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: DS.font }}
              >
                <Sheet size={14} />
                CSV
              </button>
              <button
                onClick={exportToPDF}
                disabled={!data}
                style={{ background: DS.surface, color: DS.textPrimary, border: `1px solid ${DS.border}`, borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: DS.font }}
              >
                <FileText size={14} />
                PDF
              </button>
            </div>
          </motion.div>

          {/* ── Filter Bar ───────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            style={{ background: DS.cardBg, border: '1px solid ' + DS.border, borderRadius: '16px', padding: '20px' }}
          >
            <p style={{ fontSize: '11px', fontWeight: 600, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>
              Filter Data
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {/* Portfolio */}
              <div>
                <label style={labelStyle}>Portfolio</label>
                <Select value={selectedPortfolio} onValueChange={(v) => { setSelectedPortfolio(v); setSelectedProjectKey('All'); setSelectedProjectName('All'); }}>
                  <SelectTrigger style={selectTriggerStyle}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textPrimary }}>
                    {options.portfolios.map(p => <SelectItem key={p} value={p} style={{ color: DS.textPrimary }}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Project Key */}
              <div>
                <label style={labelStyle}>Project Key</label>
                <Select value={selectedProjectKey} onValueChange={setSelectedProjectKey}>
                  <SelectTrigger style={selectTriggerStyle}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textPrimary }}>
                    {options.project_keys.map(k => <SelectItem key={k} value={k} style={{ color: DS.textPrimary }}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Project Name */}
              <div>
                <label style={labelStyle}>Project Name</label>
                <Select value={selectedProjectName} onValueChange={setSelectedProjectName}>
                  <SelectTrigger style={selectTriggerStyle}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textPrimary }}>
                    {options.project_names.map(n => <SelectItem key={n} value={n} style={{ color: DS.textPrimary }}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* RCA */}
              <div>
                <label style={labelStyle}>
                  RCA <span style={{ fontSize: '10px', color: DS.textMuted, fontWeight: 400 }}>(Bug &amp; Defect)</span>
                </label>
                <Select value={selectedRCA} onValueChange={setSelectedRCA}>
                  <SelectTrigger style={selectTriggerStyle}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textPrimary }}>
                    {options.rca_values.map(r => <SelectItem key={r} value={r} style={{ color: DS.textPrimary }}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>

          {/* ── Key KPI Gauges — 3-col grid ──────────────────────────────── */}
          <motion.div
            key={`gauges-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}
          >
            {/* Automation % gauge */}
            {[
              { label: 'Automation', sublabel: 'Test Automation Coverage', value: automationPct, color: DS.green, icon: <Zap size={14} /> },
              { label: 'Completion', sublabel: 'Test Case Completion Rate', value: completionPct, color: DS.blue, icon: <CheckCircle size={14} /> },
              { label: 'Quality Index', sublabel: 'Defect-free ratio (est.)', value: Math.max(0, 100 - ((totalDefects + totalBugs) / Math.max(data.automation_metrics?.committed_tc_count || 1, 1)) * 100), color: DS.amber, icon: <Award size={14} /> },
            ].map(({ label, sublabel, value, color, icon }) => (
              <motion.div
                key={label}
                whileHover={{ borderColor: DS.borderStrong }}
                style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', transition: 'border-color 0.2s', cursor: 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color }}>{icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GaugeRing value={value} color={color} size={112} />
                  <div style={{ position: 'absolute', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: DS.textPrimary, letterSpacing: '-0.04em', lineHeight: 1 }}>
                      {value.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '11px', color: DS.textMuted, fontWeight: 500 }}>%</div>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: DS.textSecondary, margin: 0, textAlign: 'center' }}>{sublabel}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Defect & Bug Count Stats — 4-col grid ────────────────────── */}
          <motion.div
            key={`counts-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}
          >
            {[
              { label: 'Defect Count', value: totalDefects, icon: <AlertCircle size={18} />, accent: DS.red, accentBg: DS.redBg, isNum: true },
              { label: 'Bug Count', value: totalBugs, icon: <Bug size={18} />, accent: DS.amber, accentBg: DS.amberBg, isNum: true },
              { label: 'Committed TC', value: data.automation_metrics?.committed_tc_count || 0, icon: <BarChart3 size={18} />, accent: DS.blue, accentBg: DS.blueBg, isNum: true },
              { label: 'Completed TC', value: data.automation_metrics?.completed_tc_count || 0, icon: <CheckCircle size={18} />, accent: DS.green, accentBg: DS.greenBg, isNum: true },
            ].map(({ label, value, icon, accent, accentBg }) => (
              <KPISummaryCard key={label} title={label} value={value as number} icon={icon} accent={accent} accentBg={accentBg} dataKey={dataKey} />
            ))}
          </motion.div>

          {/* ── AI Insights ──────────────────────────────────────────────── */}
          {(aiInsights || loadingInsights) && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              style={{ background: DS.cardBg, border: '1px solid ' + DS.border, borderRadius: '16px', padding: '20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Activity size={16} style={{ color: DS.blue }} />
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: DS.textPrimary, margin: 0, letterSpacing: '-0.02em' }}>AI Insights</h2>
                {loadingInsights && <RefreshCw size={13} style={{ color: DS.textMuted, animation: 'spin 1s linear infinite' }} />}
              </div>
              {loadingInsights ? (
                <p style={{ fontSize: '13px', color: DS.textSecondary, margin: 0 }}>Generating AI insights…</p>
              ) : aiInsights ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: '10px', padding: '14px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 600, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Analysis</p>
                    <p style={{ fontSize: '13px', color: DS.textPrimary, margin: 0 }}>{aiInsights.comment}</p>
                  </div>
                  {aiInsights.recommendations?.length > 0 && (
                    <div>
                      <p style={{ fontSize: '10px', fontWeight: 600, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Recommendations</p>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {aiInsights.recommendations.map((rec, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: DS.textPrimary }}>
                            <span style={{ color: DS.blue, marginTop: '2px', flexShrink: 0 }}>•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiInsights.prediction && (
                    <div style={{ background: DS.blueBg, border: `1px solid ${DS.blue}30`, borderRadius: '10px', padding: '14px' }}>
                      <p style={{ fontSize: '10px', fontWeight: 600, color: DS.blue, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Future Prediction</p>
                      <p style={{ fontSize: '13px', color: DS.textPrimary, margin: 0 }}>{aiInsights.prediction}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          )}

          {/* ── Projects List ────────────────────────────────────────────── */}
          {selectedPortfolio !== 'All' && data?.projects_list?.length > 0 && (
            <motion.div
              key={`projects-${dataKey}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Building2 size={15} style={{ color: DS.textSecondary }} />
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: DS.textPrimary, margin: 0, letterSpacing: '-0.02em' }}>
                  Projects <span style={{ fontWeight: 400, color: DS.textMuted, fontSize: '13px' }}>({data.projects_list.length})</span>
                </h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {data.projects_list.map((project, index) => (
                  <ProjectCard key={`${project.project_key}-${index}`} project={project} index={index} dataKey={dataKey} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── RCA Breakdown: Defect + Bug Analysis side-by-side ────────── */}
          {(Object.keys(data.defect_rca_breakdown || {}).length > 0 || Object.keys(data.bug_rca_breakdown || {}).length > 0) && (
            <motion.div
              key={`rca-${dataKey}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}
            >
              <AnalysisPanel title="Defect RCA Breakdown" icon={<AlertCircle size={15} />} totalCount={totalDefects} rcaBreakdown={data.defect_rca_breakdown || {}} accent={DS.red} dataKey={dataKey} />
              <AnalysisPanel title="Bug RCA Breakdown" icon={<Bug size={15} />} totalCount={totalBugs} rcaBreakdown={data.bug_rca_breakdown || {}} accent={DS.amber} dataKey={dataKey} />
            </motion.div>
          )}

          {/* ── Automation Metrics Panel ──────────────────────────────────── */}
          <motion.div
            key={`automation-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.44 }}
          >
            <AutomationPanel
              automationMetrics={data.automation_metrics || { completion_percentage: 0, automation_percentage: 0, committed_tc_count: 0, completed_tc_count: 0, total_projects: 0 }}
              projectsList={data.projects_list || []}
              dataKey={dataKey}
            />
          </motion.div>

          {/* ── Detail Tables ─────────────────────────────────────────────── */}
          {selectedPortfolio !== 'All' && selectedProjectKey !== 'All' && (
            <>
              {(data.defect_details?.length > 0 || data.bug_details?.length > 0) && (
                <motion.div
                  key={`defects-bugs-details-${dataKey}`}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                >
                  {data.defect_details?.length > 0 && (
                    <DetailTable
                      title="Defect Details"
                      subtitle={`${data.defect_details.length} defect${data.defect_details.length !== 1 ? 's' : ''} found`}
                      icon={<AlertCircle size={18} style={{ color: DS.red }} />}
                      iconBg={DS.redBg}
                      rows={data.defect_details}
                      aiComment={aiInsights?.comment}
                    />
                  )}
                  {data.bug_details?.length > 0 && (
                    <DetailTable
                      title="Bug Details"
                      subtitle={`${data.bug_details.length} bug${data.bug_details.length !== 1 ? 's' : ''} found`}
                      icon={<Bug size={18} style={{ color: DS.amber }} />}
                      iconBg={DS.amberBg}
                      rows={data.bug_details}
                      aiComment={aiInsights?.comment}
                    />
                  )}
                </motion.div>
              )}

              {/* Automation Details Table */}
              {data.automation_details?.length > 0 && (
                <motion.div
                  key={`automation-details-${dataKey}`}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <div style={{ ...card, overflow: 'hidden' }}>
                    <div style={{ padding: '20px', borderBottom: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ padding: '8px', borderRadius: '10px', background: DS.greenBg }}>
                        <Zap size={18} style={{ color: DS.green }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: DS.textPrimary, margin: 0 }}>Automation Details</h3>
                        <p style={{ fontSize: '12px', color: DS.textSecondary, margin: '2px 0 0' }}>
                          {data.automation_details.length} project{data.automation_details.length !== 1 ? 's' : ''} found
                        </p>
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: DS.surface, borderBottom: `1px solid ${DS.border}` }}>
                            {['Project', 'Type', 'Tool/Framework', 'AI Integration', 'AI Usage Level', 'Productivity Impact', 'AI Inference', 'QA Owner'].map(h => (
                              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.automation_details.map((automation, index) => (
                            <tr
                              key={index}
                              style={{ borderBottom: `1px solid ${DS.border}` }}
                              onMouseEnter={e => (e.currentTarget.style.background = DS.surface)}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <td style={{ padding: '12px 16px' }}>
                                <p style={{ fontWeight: 600, fontSize: '13px', color: DS.textPrimary, margin: 0 }}>{automation.project_key}</p>
                                <p style={{ fontSize: '11px', color: DS.textSecondary, margin: '2px 0 0' }}>{automation.project_name}</p>
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ background: DS.surface, color: DS.textSecondary, border: `1px solid ${DS.border}`, borderRadius: '5px', padding: '2px 8px', fontSize: '11px' }}>
                                  {automation.project_type || 'N/A'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: DS.textPrimary }}>{automation.tool_framework || 'N/A'}</td>
                              <td style={{ padding: '12px 16px' }}>
                                {automation.ai_assistant_integration_enabled?.toLowerCase() === 'yes' ? (
                                  <span style={{ background: DS.greenBg, color: DS.green, borderRadius: '5px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>Yes</span>
                                ) : (
                                  <span style={{ background: DS.surface, color: DS.textSecondary, borderRadius: '5px', padding: '2px 8px', fontSize: '11px' }}>{automation.ai_assistant_integration_enabled || 'N/A'}</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: DS.textPrimary }}>{automation.usage_level_of_ai_assistant || 'N/A'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: DS.textPrimary }}>{automation.impact_on_productivity || 'N/A'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '12px', color: DS.textSecondary, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{automation.ai_usage_inference || 'N/A'}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: DS.surface, border: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: DS.textPrimary }}>
                                    {(automation.qa_owner || 'N').charAt(0).toUpperCase()}
                                  </div>
                                  <span style={{ fontSize: '13px', color: DS.textPrimary }}>{automation.qa_owner || 'N/A'}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPISummaryCard({ title, value, icon, accent, accentBg, dataKey, isPercentage = false }: {
  title: string; value: number; icon: React.ReactNode;
  accent: string; accentBg: string; dataKey: number; isPercentage?: boolean;
}) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    const duration = 1200;
    const start = Date.now();
    const animate = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      setDisplay(isPercentage ? value * ease : Math.floor(value * ease));
      if (p < 1) requestAnimationFrame(animate);
      else setDisplay(value);
    };
    animate();
  }, [value, dataKey, isPercentage]);

  return (
    <motion.div
      key={`kpi-${title}-${dataKey}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ borderColor: DS.borderStrong }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '20px', transition: 'border-color 0.2s', cursor: 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ color: accent }}>{icon}</span>
        <span style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 600, color: DS.textPrimary, letterSpacing: '-0.04em', fontFamily: DS.font }}>
        {isPercentage ? `${display.toFixed(1)}%` : display.toLocaleString()}
      </div>
    </motion.div>
  );
}

function ProjectCard({ project, index, dataKey }: {
  project: { project_key: string; project_name: string; defect_count: number; bug_count: number; automation_percentage: number; completion_percentage: number; };
  index: number; dataKey: number;
}) {
  return (
    <motion.div
      key={`proj-${project.project_key}-${dataKey}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.08 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '16px', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Code size={14} style={{ color: DS.textSecondary }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: DS.textPrimary }}>{project.project_key}</div>
          <div style={{ fontSize: '11px', color: DS.textSecondary }}>{project.project_name}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          { label: 'Defects', val: project.defect_count, isNum: true },
          { label: 'Bugs', val: project.bug_count, isNum: true },
          { label: 'Automation', val: project.automation_percentage, isNum: false },
          { label: 'Completion', val: project.completion_percentage, isNum: false },
        ].map(({ label, val, isNum }) => (
          <div key={label}>
            <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: DS.textPrimary, letterSpacing: '-0.03em' }}>
              {isNum ? val : `${(val as number).toFixed(1)}%`}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AnalysisPanel({ title, icon, totalCount, rcaBreakdown, accent, dataKey }: {
  title: string; icon: React.ReactNode; totalCount: number;
  rcaBreakdown: Record<string, number>; accent: string; dataKey: number;
}) {
  const entries = Object.entries(rcaBreakdown).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...entries.map(([, c]) => c), 1);

  return (
    <motion.div
      key={`panel-${title}-${dataKey}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '20px', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: accent }}>{icon}</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: DS.textPrimary }}>{title}</span>
        </div>
        <span style={{ fontSize: '14px', fontWeight: 600, color: DS.textSecondary }}>Total: {totalCount}</span>
      </div>
      <p style={{ fontSize: '11px', fontWeight: 600, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Breakdown by RCA</p>
      {entries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {entries.map(([rca, count], i) => {
            const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
            const barW = (count / maxCount) * 100;
            return (
              <motion.div
                key={rca}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ color: DS.textPrimary }}>{rca}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ fontWeight: 700, color: DS.textPrimary }}>{count}</span>
                    <span style={{ color: DS.textMuted }}>({pct.toFixed(1)}%)</span>
                  </div>
                </div>
                <div style={{ height: '5px', background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: '4px', overflow: 'hidden' }}>
                  <motion.div
                    style={{ height: '100%', background: accent, borderRadius: '4px' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${barW}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.5 + i * 0.08 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <p style={{ fontSize: '13px', color: DS.textMuted }}>No RCA data available</p>
      )}
    </motion.div>
  );
}

function AutomationPanel({ automationMetrics, projectsList, dataKey }: {
  automationMetrics: { completion_percentage: number; automation_percentage: number; committed_tc_count: number; completed_tc_count: number; total_projects: number; };
  projectsList: Array<{ project_key: string; project_name: string; automation_percentage: number; completion_percentage: number; }>;
  dataKey: number;
}) {
  return (
    <motion.div
      key={`auto-panel-${dataKey}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '20px', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Zap size={15} style={{ color: DS.green }} />
        <span style={{ fontSize: '15px', fontWeight: 600, color: DS.textPrimary }}>Automation Metrics</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Committed TC', val: automationMetrics.committed_tc_count },
          { label: 'Completed TC', val: automationMetrics.completed_tc_count },
          { label: 'Automation %', val: `${automationMetrics.automation_percentage.toFixed(1)}%` },
          { label: 'Completion %', val: `${automationMetrics.completion_percentage.toFixed(1)}%` },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: DS.textPrimary, letterSpacing: '-0.03em' }}>{val}</div>
          </div>
        ))}
      </div>
      {projectsList.length > 0 && (
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Projects Breakdown</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {projectsList.map((project, i) => (
              <motion.div
                key={`auto-proj-${project.project_key}-${i}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                style={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: '8px', padding: '12px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: DS.textPrimary }}>{project.project_key} — {project.project_name}</div>
                    <div style={{ fontSize: '11px', color: DS.textSecondary, marginTop: '2px' }}>
                      Automation: {project.automation_percentage.toFixed(1)}% | Completion: {project.completion_percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={{ height: '5px', background: DS.border, border: `1px solid ${DS.border}`, borderRadius: '4px', overflow: 'hidden' }}>
                  <motion.div
                    style={{ height: '100%', background: DS.green, borderRadius: '4px' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${project.completion_percentage}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.6 + i * 0.08 }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function DetailTable({ title, subtitle, icon, iconBg, rows, aiComment }: {
  title: string; subtitle: string; icon: React.ReactNode; iconBg: string;
  rows: Array<{ issue_key: string; summary: string; assignee_name: string; justification?: string; }>;
  aiComment?: string;
}) {
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '20px', borderBottom: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ padding: '8px', borderRadius: '8px', background: iconBg }}>{icon}</div>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: DS.textPrimary, margin: 0 }}>{title}</h3>
          <p style={{ fontSize: '12px', color: DS.textSecondary, margin: '2px 0 0' }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: DS.surface, borderBottom: `1px solid ${DS.border}` }}>
              {['Issue Key', 'Description', 'Assignee', 'Justification'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{ borderBottom: `1px solid ${DS.border}` }}
                onMouseEnter={e => (e.currentTarget.style.background = DS.surface)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: DS.mono, fontSize: '12px', fontWeight: 700, color: DS.textPrimary }}>{row.issue_key || 'N/A'}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: DS.textPrimary, maxWidth: '320px' }}>{row.summary || 'N/A'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: DS.surface, border: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: DS.textPrimary, flexShrink: 0 }}>
                      {(row.assignee_name || 'N').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '13px', color: DS.textPrimary }}>{row.assignee_name || 'N/A'}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '12px', color: DS.textSecondary, maxWidth: '240px' }}>
                  {aiComment || row.justification || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
