'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  RefreshCw, Download, AlertTriangle, Target, Users, TrendingUp,
  CheckCircle, Activity, BarChart3, PieChart, Award, FileText, Sheet
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

interface QEMetricsData {
  automation_percentage: number;
  bugs_story_ratio: number;
  defect_leakage_percentage: number;
  functional_automation_percentage: number;
  test_coverage_percentage: number;
  project_automation_percentage: number;
  overall_testcases: number;
  tcs_requires_automation: number;
  automated_testcases: number;
  count_of_stories: number;
  count_of_defects: number;
  count_of_bugs: number;
  bug_density: string;
  dedicated_qe_env: string;
  dedicated_perf_env: string;
  automation_stability: string;
  test_data_refresh: string;
  performance_tested: string;
  dev_qe_ratio: string;
  tao_qe_count: number;
  tao_gp_cdk_count: number;
  sdet_assignment: number;
  manual_assignment: number;
  sdet_skillset: number;
  manual_skillset: number;
  total_projects: number;
  unique_products: number;
  portfolio: string;
}

interface DropdownOptions {
  portfolios: string[];
  timelines: string[];
  products?: string[];
  containers?: string[];
}

interface AllOptions {
  portfolios: string[];
  timelines: string[];
  products: string[];
  containers: string[];
}

export function QAMetricsDashboard() {
  const { currentTheme, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QEMetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataKey, setDataKey] = useState(0);
  const [allOptions, setAllOptions] = useState<AllOptions>({ portfolios: ['All'], timelines: ['All'], products: ['All'], containers: ['All'] });
  const [options, setOptions] = useState<DropdownOptions>({ portfolios: ['All'], timelines: ['All'], products: ['All'], containers: ['All'] });
  const [selectedPortfolio, setSelectedPortfolio] = useState('All');
  const [selectedTimeline, setSelectedTimeline] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState('All');
  const [selectedContainer, setSelectedContainer] = useState('All');

  useEffect(() => { fetchAllDropdownOptions(); }, []);

  useEffect(() => {
    if (selectedPortfolio !== 'All') fetchFilteredOptions(selectedPortfolio);
    else setOptions(allOptions);
    setSelectedProduct('All');
    setSelectedContainer('All');
  }, [selectedPortfolio, allOptions]);

  useEffect(() => { fetchQEMetrics(); }, [selectedPortfolio, selectedTimeline, selectedProduct, selectedContainer]);

  const fetchAllDropdownOptions = async () => {
    try {
      const response = await fetch(getApiUrl('/api/qe-metrics/options'));
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const allOpts = {
            portfolios: result.options.portfolios || ['All'],
            timelines: result.options.timelines || ['All'],
            products: result.options.products || ['All'],
            containers: result.options.containers || ['All']
          };
          setAllOptions(allOpts);
          setOptions(allOpts);
        }
      }
    } catch (err) { console.error('Error fetching dropdown options:', err); }
  };

  const fetchFilteredOptions = async (portfolio: string) => {
    try {
      const response = await fetch(getApiUrl(`/api/qe-metrics/options?portfolio=${encodeURIComponent(portfolio)}`));
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setOptions({
            portfolios: allOptions.portfolios,
            timelines: result.options.timelines || ['All'],
            products: result.options.products || ['All'],
            containers: result.options.containers || ['All']
          });
        }
      }
    } catch (err) { console.error('Error fetching filtered options:', err); }
  };

  const fetchQEMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl('/api/qe-metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: selectedPortfolio, product: selectedProduct, container: selectedContainer, timeline: selectedTimeline })
      });
      if (!response.ok) throw new Error('Failed to fetch QE metrics');
      const result = await response.json();
      if (result.success) { setData(result.data); setDataKey(prev => prev + 1); }
      else setError(result.error || 'Failed to load data');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally { setLoading(false); }
  };

  const exportToExcel = () => {
    if (!data) return;
    const csv = [
      ['Metric', 'Value'],
      ['Portfolio', data.portfolio],
      ['Automation %', data.automation_percentage],
      ['Bugs - Story Ratio', data.bugs_story_ratio],
      ['Defect Leakage %', data.defect_leakage_percentage],
      ['Overall Testcases', data.overall_testcases],
      ['TCs Requires Automation', data.tcs_requires_automation],
      ['Automated Testcases', data.automated_testcases],
      ['Count of Stories', data.count_of_stories],
      ['Count of Defects', data.count_of_defects],
      ['Count of Bugs', data.count_of_bugs],
      ['Bug Density', data.bug_density],
      ['Dedicated QE Env', data.dedicated_qe_env],
      ['Dedicated PERF Env', data.dedicated_perf_env],
      ['Automation Stability', data.automation_stability],
      ['Test Data Refresh', data.test_data_refresh],
      ['Performance Tested', data.performance_tested],
      ['TAO QE Count', data.tao_qe_count],
      ['TAO + GP + CDK Count', data.tao_gp_cdk_count],
      ['DEV - QE Ratio', data.dev_qe_ratio]
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QE-Metrics-${selectedPortfolio}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    if (!data) return;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>QE Metrics</title><style>body{font-family:Arial;margin:20px;}table{width:100%;border-collapse:collapse;}th,td{padding:8px;text-align:left;border-bottom:1px solid #ccc;}th{background:#f0f0f0;}</style></head><body><h1>QE Metrics Report</h1><p>Portfolio: ${data.portfolio}</p><p>Generated: ${new Date().toLocaleString()}</p><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Automation %</td><td>${data.automation_percentage}%</td></tr><tr><td>Bugs - Story Ratio</td><td>${data.bugs_story_ratio}%</td></tr><tr><td>Defect Leakage %</td><td>${data.defect_leakage_percentage}%</td></tr></table></body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 250);
    }
  };

  if (loading && !data) return <LoadingSkeleton />;

  if (error && !data) {
    return (
      <DashboardLayout>
      <div style={{ padding: '24px', fontFamily: DS.font }}>
        <div style={{ background: DS.redBg, border: `1px solid ${DS.red}`, borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} style={{ color: DS.red, flexShrink: 0 }} />
          <span style={{ color: DS.red, fontSize: '14px' }}>{error}</span>
        </div>
      </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  // ─── Shared label style ───────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase',
    letterSpacing: '0.04em', fontWeight: 500, marginBottom: '6px',
    display: 'block', fontFamily: DS.font,
  };
  const selectTriggerStyle: React.CSSProperties = {
    background: DS.surface, border: `1px solid ${DS.border}`,
    borderRadius: '8px', color: DS.textPrimary, fontSize: '13px', fontFamily: DS.font,
  };
  const card: React.CSSProperties = {
    background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px',
  };

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '24px', fontFamily: DS.font }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}
          >
            <div>
              <p style={{ color: 'var(--accent-cool)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Quality Engineering</p>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: DS.textPrimary, letterSpacing: '-0.03em', margin: 0 }}>
                CDK QE Metrics
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                <p style={{ fontSize: '14px', color: DS.textSecondary, margin: 0 }}>Comprehensive Quality Engineering Dashboard</p>
                <span style={{ background: DS.greenBg, color: DS.green, border: '1px solid rgba(212,168,71,0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
                  {data.total_projects} Projects • {data.unique_products} Products
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={fetchQEMetrics} disabled={loading} style={{ background: DS.surface, color: DS.textPrimary, border: `1px solid ${DS.border}`, borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: DS.font, opacity: loading ? 0.7 : 1 }}>
                <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                Refresh
              </button>
              <button onClick={exportToExcel} disabled={!data} style={{ background: DS.surface, color: DS.textPrimary, border: `1px solid ${DS.border}`, borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: DS.font }}>
                <Sheet size={14} />
                CSV
              </button>
              <button onClick={exportToPDF} disabled={!data} style={{ background: DS.surface, color: DS.textPrimary, border: `1px solid ${DS.border}`, borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: DS.font }}>
                <FileText size={14} />
                PDF
              </button>
            </div>
          </motion.div>

          {/* ── Filter Bar ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '16px', padding: '20px' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {[
                { label: 'Portfolio', val: selectedPortfolio, set: setSelectedPortfolio, items: options.portfolios || [] },
                { label: 'Product', val: selectedProduct, set: setSelectedProduct, items: options.products || [] },
                { label: 'Container', val: selectedContainer, set: setSelectedContainer, items: options.containers || [] },
                { label: 'Timeline', val: selectedTimeline, set: setSelectedTimeline, items: options.timelines || [] },
              ].map(({ label, val, set, items }) => (
                <div key={label}>
                  <label style={labelStyle}>{label}</label>
                  <Select value={val} onValueChange={set}>
                    <SelectTrigger style={selectTriggerStyle}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textPrimary }}>
                      {items.length > 0 ? items.map(i => <SelectItem key={i} value={i} style={{ color: DS.textPrimary }}>{i}</SelectItem>) : <SelectItem value="loading" disabled>Loading…</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Hero Gauge Cards ────────────────────────────────────────── */}
          <motion.div
            key={`gauges-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}
          >
            <GaugeCard title="Automation %" value={data.automation_percentage} accent={DS.amber} dataKey={dataKey} />
            <GaugeCard title="Bugs — Story Ratio" value={data.bugs_story_ratio} accent={DS.blue} dataKey={dataKey} />
            <GaugeCard title="Defect Leakage %" value={data.defect_leakage_percentage} accent={DS.red} dataKey={dataKey} />
          </motion.div>

          {/* ── Stats Grid (8 metric cards, 4 columns) ─────────────────── */}
          <motion.div
            key={`stats-grid-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}
          >
            <MetricCountCard label="Overall Testcases" value={data.overall_testcases} accent={DS.blue} />
            <MetricCountCard label="TCs Requires Automation" value={data.tcs_requires_automation} accent={DS.blue} />
            <MetricCountCard label="Automated Testcases" value={data.automated_testcases} accent={DS.green} />
            <MetricCountCard label="Count of Stories" value={data.count_of_stories} accent={DS.blue} />
            <MetricCountCard label="Count of Defects" value={data.count_of_defects} accent={DS.red} />
            <MetricCountCard label="Count of Bugs" value={data.count_of_bugs} accent={DS.amber} />
            <MetricStringCard label="Bug Density" value={data.bug_density} accent={DS.amber} />
            <MetricStringCard label="Dev-QE Ratio" value={data.dev_qe_ratio} accent={DS.blue} />
          </motion.div>

          {/* ── Environment Flags ───────────────────────────────────────── */}
          <motion.div
            key={`env-flags-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '16px', padding: '20px' }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: DS.textPrimary, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Environment Flags</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <FlagCard label="Dedicated QE Env" value={data.dedicated_qe_env} />
              <FlagCard label="Dedicated PERF Env" value={data.dedicated_perf_env} />
              <FlagCard label="Automation Stability" value={data.automation_stability} />
              <FlagCard label="Test Data Refresh" value={data.test_data_refresh} />
              <FlagCard label="Performance Tested" value={data.performance_tested} />
            </div>
          </motion.div>

          {/* ── Team Section ────────────────────────────────────────────── */}
          <motion.div
            key={`team-section-${dataKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}
          >
            <TeamCompositionCard title="CDK Assignment" sdetCount={data.sdet_assignment} manualCount={data.manual_assignment} icon={<Users size={16} style={{ color: DS.blue }} />} />
            <TeamCompositionCard title="Skillset Distribution" sdetCount={data.sdet_skillset} manualCount={data.manual_skillset} icon={<Award size={16} style={{ color: DS.green }} />} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <TeamCountCard title="TAO QE Count" count={data.tao_qe_count} />
              <TeamCountCard title="TAO + GP + CDK Count" count={data.tao_gp_cdk_count} />
              <TeamRatioCard title="DEV — QE Ratio" ratio={data.dev_qe_ratio} dataKey={dataKey} />
            </div>
          </motion.div>

        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GaugeCard({ title, value, accent, dataKey = 0 }: { title: string; value: number; accent: string; dataKey?: number; }) {
  const pct = Math.round(value);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (pct / 100) * circumference;
  const titleId = title.replace(/\s+/g, '-');

  return (
    <motion.div
      key={`gauge-${titleId}-${dataKey}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 22 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '20px', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ fontSize: '13px', fontWeight: 600, color: DS.textPrimary, textAlign: 'center', marginBottom: '16px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ position: 'relative', width: '160px', height: '160px' }}>
          <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 100 100">
            <defs>
              <linearGradient id={`g-${titleId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accent} />
                <stop offset="100%" stopColor={accent} stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="40" fill="none" stroke={DS.surface} strokeWidth="12" />
            <motion.circle
              cx="50" cy="50" r="40" fill="none"
              stroke={`url(#g-${titleId})`} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.8, ease: 'easeOut', delay: 0.3 }}
            />
            <circle cx="50" cy="50" r="28" fill={DS.cardBg} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: accent, letterSpacing: '-0.04em', fontFamily: DS.font }}>{pct}%</span>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ width: '100%', height: '5px', background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: '4px', overflow: 'hidden' }}>
          <motion.div
            style={{ height: '100%', background: accent, borderRadius: '4px' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function MetricCountCard({ label, value, accent }: { label: string; value: number; accent: string; }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '16px', textAlign: 'center', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 600, color: DS.textPrimary, letterSpacing: '-0.04em' }}>{value.toLocaleString()}</div>
    </motion.div>
  );
}

function MetricStringCard({ label, value, accent }: { label: string; value: string; accent: string; }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '16px', textAlign: 'center', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 600, color: accent, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </motion.div>
  );
}

function FlagCard({ label, value }: { label: string; value: string; }) {
  const lower = (value || '').toLowerCase();
  const isYes = lower === 'yes' || lower === 'y';
  const isNo = lower === 'no' || lower === 'n';
  const badgeBg = isYes ? DS.greenBg : isNo ? DS.redBg : DS.amberBg;
  const badgeColor = isYes ? DS.green : isNo ? DS.red : DS.amber;

  return (
    <div style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '14px', textAlign: 'center', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}>
      <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>{label}</div>
      <span style={{ background: badgeBg, color: badgeColor, borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function TeamCompositionCard({ title, sdetCount, manualCount, icon }: { title: string; sdetCount: number; manualCount: number; icon: React.ReactNode; }) {
  const total = sdetCount + manualCount;
  const sdetPct = total > 0 ? (sdetCount / total) * 100 : 0;
  const manualPct = total > 0 ? (manualCount / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', padding: '20px', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {icon}
        <span style={{ fontSize: '15px', fontWeight: 600, color: DS.textPrimary }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[
          { lbl: 'SDET', count: sdetCount, pct: sdetPct, color: DS.blue },
          { lbl: 'Manual', count: manualCount, pct: manualPct, color: DS.amber },
        ].map(({ lbl, count, pct, color }) => (
          <div key={lbl}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                <span style={{ fontSize: '13px', color: DS.textPrimary }}>{lbl}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: DS.textPrimary }}>{count}</span>
                <span style={{ fontSize: '11px', color: DS.textSecondary }}>({Math.round(pct)}%)</span>
              </div>
            </div>
            <div style={{ height: '5px', background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: '4px', overflow: 'hidden' }}>
              <motion.div
                style={{ height: '100%', background: color, borderRadius: '4px' }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
        <div style={{ fontSize: '12px', color: DS.textSecondary, marginTop: '4px' }}>Total: {total}</div>
      </div>
    </motion.div>
  );
}

function TeamCountCard({ title, count }: { title: string; count: number; }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ padding: '12px 16px', background: DS.surface, borderBottom: `1px solid ${DS.border}` }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: DS.textSecondary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      </div>
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', fontWeight: 700, color: DS.textPrimary, letterSpacing: '-0.04em' }}>{count}</div>
        <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '4px' }}>Team Members</div>
      </div>
    </motion.div>
  );
}

function TeamRatioCard({ title, ratio, dataKey = 0 }: { title: string; ratio: string; dataKey?: number; }) {
  const formatRatio = (r: string): string => {
    if (!r || typeof r !== 'string') return '11:1';
    const cleaned = r.trim();
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      if (parts.length >= 2) return `${parts[0].trim()}:${parts[1].trim()}`;
    }
    if (cleaned.match(/^\d+:\d+:\d+/)) {
      const parts = cleaned.split(':');
      return `${parseInt(parts[0])}:${parseInt(parts[1])}`;
    }
    return cleaned || '11:1';
  };

  return (
    <motion.div
      key={`ratio-${dataKey}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.2s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.borderStrong)}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = DS.border)}
    >
      <div style={{ padding: '12px 16px', background: DS.surface, borderBottom: `1px solid ${DS.border}` }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: DS.textSecondary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      </div>
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', fontWeight: 700, color: DS.textPrimary, letterSpacing: '-0.04em', fontFamily: DS.font }}>{formatRatio(ratio)}</div>
        <div style={{ fontSize: '11px', color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '4px' }}>Development to QE</div>
      </div>
    </motion.div>
  );
}
