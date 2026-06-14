'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Clock3, Download, Filter, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Button } from './ui/button';
import { DashboardLayout } from './DashboardLayout';
import { getApiUrl, fetchWithTimeout } from '../../lib/api-config';
import { exportTcoeReportAsPDF } from '../utils/exportUtils';
import {
  TCOE_METRIC_ORDER,
  TcoeTableRow,
  TcoeTableSpec,
  buildTcoeTableSpecs,
  formatTcoeChange,
  formatTcoeNumber,
  formatTcoeValue,
} from '../utils/tcoeDashboardTables';

type DashboardStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'completed_with_errors';
type MetricStatus = 'pending' | 'processing' | 'completed' | 'failed';
type ToneKind = 'good' | 'watch' | 'risk' | 'total';

interface MetricConfig {
  key: string;
  order: number;
  label: string;
  description: string;
}

interface MetricState extends MetricConfig {
  status: MetricStatus;
  rows: any[];
  errors: Array<{ portfolio?: string; error: string }>;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface DashboardRun {
  run_id: string;
  status: DashboardStatus;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  current_week_ending: string;
  previous_week_ending: string;
  comparison_note?: string | null;
  metrics: Record<string, MetricState>;
}

const FALLBACK_METRICS: MetricConfig[] = [
  { key: 'test_coverage', order: 1, label: 'Stories to Test Cases Mapping', description: 'Coverage mapping' },
  { key: 'test_review_status', order: 2, label: 'Test Cases Review Status', description: 'Review compliance' },
  { key: 'test_story_ratio', order: 3, label: 'Test:Story Ratio', description: 'Test depth' },
  { key: 'bug_ratio', order: 4, label: 'Bugs/Test Case', description: 'Bug discovery rate' },
  { key: 'defect_leakage', order: 5, label: 'Weekly Defect Inflow (YoY)', description: 'CY26 versus CY25 defects' },
  { key: 'overall_automation', order: 6, label: 'Overall Automation Status', description: 'Automation coverage' },
  { key: 'regression_automation', order: 7, label: 'Regression Automation Status', description: 'Regression automation' },
];

const HIDDEN_TCOE_DASHBOARD_METRICS = new Set(['defect_leakage']);
const VISIBLE_FALLBACK_METRICS = FALLBACK_METRICS.filter((metric) => !HIDDEN_TCOE_DASHBOARD_METRICS.has(metric.key));

const statusStyles: Record<string, { bg: string; color: string; border: string; label: string }> = {
  pending: { bg: 'var(--bg-surface)', color: 'var(--text-muted)', border: 'var(--border)', label: 'Pending' },
  processing: { bg: 'var(--blue-bg)', color: 'var(--blue)', border: 'var(--blue)', label: 'Running' },
  completed: { bg: 'var(--green-bg)', color: 'var(--green)', border: 'var(--green)', label: 'Complete' },
  failed: { bg: 'var(--red-bg)', color: 'var(--red)', border: 'var(--red)', label: 'Failed' },
  completed_with_errors: { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'var(--amber)', label: 'Partial' },
};

const panelShadow = '0 18px 46px rgba(10,20,50,0.12), 0 2px 10px rgba(10,20,50,0.08)';

function formatDateLabel(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatWeekEnding(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
}

function formatTimestamp(value?: string | null) {
  if (!value) return 'Not refreshed yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toneKind(row: TcoeTableRow, value: number, isProgress = false): ToneKind {
  if (row.isGrandTotal) {
    return 'total';
  }

  if (isProgress) {
    if (Math.abs(value) < 0.05) return 'watch';
    const good = row.lowerIsBetter ? value < 0 : value > 0;
    return good ? 'good' : 'risk';
  }

  if (row.mode === 'ratio') {
    if (value >= 2) return 'good';
    if (value >= 1) return 'watch';
    return 'risk';
  }

  if (row.mode === 'ratio_percent') {
    if (value <= 5) return 'good';
    if (value <= 10) return 'watch';
    return 'risk';
  }

  if (row.mode === 'defect_inflow') {
    if (value <= 0) return 'good';
    if (value <= 15) return 'watch';
    return 'risk';
  }

  if (value >= 90) return 'good';
  if (value >= 70) return 'watch';
  return 'risk';
}

function valueTone(row: TcoeTableRow, value: number, isProgress = false): React.CSSProperties {
  const kind = toneKind(row, value, isProgress);
  if (kind === 'total') {
    return {
      backgroundColor: 'var(--tcoe-grand-total-bg)',
      color: 'var(--tcoe-grand-total-text)',
    };
  }

  const green = { backgroundColor: 'var(--green-bg)', color: 'var(--green)' };
  const amber = { backgroundColor: 'var(--amber-bg)', color: 'var(--amber)' };
  const red = { backgroundColor: 'var(--red-bg)', color: 'var(--red)' };

  if (kind === 'good') return green;
  if (kind === 'watch') return amber;
  return red;
}

function trendClass(row: TcoeTableRow, value: number, isProgress = false) {
  const kind = toneKind(row, value, isProgress);
  if (kind === 'good') return 'tcoe-trend-good';
  if (kind === 'risk') return 'tcoe-trend-risk';
  if (kind === 'watch') return 'tcoe-trend-watch';
  return 'tcoe-trend-total';
}

// ── Searchable multi-select for metric filtering ──────────────────────────────
function SearchableMultiSelect({
  options, selected, onChange, placeholder,
}: {
  options: { key: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.size === 0 || selected.size === options.length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    if (next.size === options.length) onChange(new Set());
    else onChange(next);
  }

  function toggleAll() { onChange(new Set()); }

  const displayLabel = allSelected
    ? `All Metrics (${options.length})`
    : `${selected.size} of ${options.length} selected`;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => { setOpen(o => !o); if (!open) setTimeout(() => inputRef.current?.focus(), 30); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', userSelect: 'none', gap: 8, minWidth: 200,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
        {!allSelected && (
          <div
            onClick={e => { e.stopPropagation(); toggleAll(); }}
            style={{ color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={12} />
          </div>
        )}
        <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '100%',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search metrics…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit',
              }}
              autoFocus
            />
            {search && <X size={11} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSearch('')} />}
          </div>

          {/* All option */}
          <div
            onMouseDown={e => { e.preventDefault(); toggleAll(); }}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              color: allSelected ? 'var(--accent-cool)' : 'var(--text-secondary)',
              background: allSelected ? 'var(--accent-cool-bg)' : 'transparent',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 4, border: `2px solid ${allSelected ? 'var(--accent-cool)' : 'var(--border)'}`,
              background: allSelected ? 'var(--accent-cool)' : 'transparent',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {allSelected && <CheckCircle2 size={9} style={{ color: '#fff' }} />}
            </div>
            All Metrics
          </div>

          {/* Filtered options */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No match</div>
            ) : filtered.map(o => {
              const isOn = allSelected ? true : selected.has(o.key);
              return (
                <div
                  key={o.key}
                  onMouseDown={e => { e.preventDefault(); toggle(o.key); }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                    color: isOn ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: isOn ? 'var(--bg-card)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: '1px solid var(--border)30',
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 4, border: `2px solid ${isOn ? 'var(--accent-cool)' : 'var(--border)'}`,
                    background: isOn ? 'var(--accent-cool)' : 'transparent',
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isOn && <CheckCircle2 size={9} style={{ color: '#fff' }} />}
                  </div>
                  {o.label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || statusStyles.pending;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {status === 'completed' ? <CheckCircle2 size={13} /> : status === 'failed' ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
      {style.label}
    </span>
  );
}

function SummaryStat({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon: React.ReactNode }) {
  return (
    <div
      style={{
        minWidth: 150,
        flex: '1 1 150px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.08), transparent), var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 14px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tone || 'var(--text-secondary)', marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 22, lineHeight: 1, fontWeight: 900, letterSpacing: 0 }}>
        {value}
      </div>
    </div>
  );
}

function LoadingMetricTable() {
  return (
    <div style={{ padding: 18, display: 'grid', gap: 10 }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          style={{
            height: 34,
            borderRadius: 8,
            background: index === 0
              ? 'linear-gradient(90deg, var(--bg-active), var(--bg-surface))'
              : 'linear-gradient(90deg, var(--bg-surface), var(--bg-card), var(--bg-surface))',
            border: '1px solid var(--border)',
            opacity: index === 0 ? 0.9 : 0.75,
          }}
        />
      ))}
    </div>
  );
}

function TcoeTable({ spec, previousWeek, currentWeek, portfolioFilter }: {
  spec: TcoeTableSpec; previousWeek: string; currentWeek: string; portfolioFilter?: string;
}) {
  const visibleRows = portfolioFilter
    ? spec.rows.filter(row => row.isGrandTotal || row.label.toLowerCase().includes(portfolioFilter.toLowerCase()))
    : spec.rows;

  const headers = [
    'Portfolio',
    ...spec.countHeaders,
    `Week ending ${formatWeekEnding(previousWeek)}`,
    `Week ending ${formatWeekEnding(currentWeek)}`,
    'WoW Progress',
    'Comments',
  ];

  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <table style={{ width: '100%', minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr>
            <th
              colSpan={headers.length}
              style={{
                padding: '13px 14px',
                textAlign: 'left',
                background: 'linear-gradient(90deg, var(--bg-active), var(--bg-surface))',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
                fontWeight: 800,
              }}
            >
              {spec.title}
            </th>
          </tr>
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                style={{
                  padding: '10px 12px',
                  textAlign: index === 0 || index === headers.length - 1 ? 'left' : 'center',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border)',
                  borderRight: index === headers.length - 1 ? undefined : '1px solid var(--border)',
                  fontWeight: 800,
                  minWidth: index === headers.length - 1 ? 300 : undefined,
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => {
            const rowBg = row.isGrandTotal
              ? 'var(--tcoe-grand-total-bg)'
              : rowIndex % 2 === 0
              ? 'var(--bg-card)'
              : 'var(--bg-surface)';
            const rowColor = row.isGrandTotal ? 'var(--tcoe-grand-total-text)' : 'var(--text-primary)';

            return (
              <tr key={`${spec.title}-${row.label}-${rowIndex}`} className="tcoe-dashboard-row" style={{ background: rowBg }}>
                <td
                  className={`tcoe-value-cell ${trendClass(row, row.previous)}`}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    color: rowColor,
                    fontWeight: row.isGrandTotal ? 800 : 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.label}
                </td>
                {row.counts.map((count, countIndex) => (
                  <td
                    key={`${row.label}-count-${countIndex}`}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      color: rowColor,
                      textAlign: 'center',
                      fontWeight: row.isGrandTotal ? 800 : 700,
                    }}
                  >
                    {formatTcoeNumber(count)}
                  </td>
                ))}
                <td
                  className={`tcoe-value-cell ${trendClass(row, row.current)}`}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    textAlign: 'center',
                    fontWeight: 800,
                    ...valueTone(row, row.previous),
                  }}
                >
                  {formatTcoeValue(row.previous, row.mode)}
                </td>
                <td
                  className={`tcoe-value-cell ${trendClass(row, row.progress, true)}`}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    textAlign: 'center',
                    fontWeight: 800,
                    ...valueTone(row, row.current),
                  }}
                >
                  {formatTcoeValue(row.current, row.mode)}
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    textAlign: 'center',
                    fontWeight: 800,
                    ...valueTone(row, row.progress, true),
                  }}
                >
                  <span className="tcoe-trend-badge">
                    {toneKind(row, row.progress, true) === 'good' && !row.isGrandTotal && <CheckCircle2 size={13} className="tcoe-trend-icon" />}
                    {toneKind(row, row.progress, true) === 'risk' && !row.isGrandTotal && <AlertTriangle size={13} className="tcoe-trend-icon" />}
                    {formatTcoeChange(row.progress)}
                  </span>
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    color: rowColor,
                    minWidth: 300,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {row.comment}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricSection({ metric, run, portfolioFilter }: { metric: MetricState; run: DashboardRun; portfolioFilter?: string }) {
  const tableSpecs = useMemo(
    () => (metric.status === 'completed' ? buildTcoeTableSpecs(metric.key, metric.rows || []) : []),
    [metric.key, metric.rows, metric.status]
  );

  return (
    <section
      id={`tcoe-report-card-${metric.key}`}
      className="pdf-metric-card"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: panelShadow,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
          background: metric.status === 'completed'
            ? 'linear-gradient(90deg, rgba(212,168,71,0.18), rgba(26,91,176,0.08), transparent)'
            : 'linear-gradient(90deg, var(--bg-card), var(--bg-surface))',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: metric.status === 'completed' ? 'var(--accent-cool-bg)' : 'var(--bg-active)',
                color: 'var(--accent-cool)',
                fontSize: 12,
                fontWeight: 800,
                boxShadow: 'inset 0 0 0 1px rgba(212,168,71,0.2)',
              }}
            >
              {metric.order}
            </span>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, margin: 0 }}>
              {metric.label}
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '6px 0 0', lineHeight: 1.4 }}>
            {metric.description}
          </p>
        </div>
        <StatusBadge status={metric.status} />
      </div>

      {metric.status === 'failed' ? (
        <div style={{ padding: 18 }}>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              border: '1px solid var(--red)',
              background: 'var(--red-bg)',
              color: 'var(--red)',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{metric.error || metric.errors?.[0]?.error || 'Metric failed to load.'}</span>
          </div>
        </div>
      ) : metric.status === 'completed' ? (
        <div style={{ padding: 18, display: 'grid', gap: 18 }}>
          {metric.errors?.length > 0 && (
            <div
              style={{
                border: '1px solid var(--amber)',
                background: 'var(--amber-bg)',
                color: 'var(--amber)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
              }}
            >
              {metric.errors.length} portfolio{metric.errors.length === 1 ? '' : 's'} did not complete for this metric.
            </div>
          )}
          {tableSpecs.map((spec) => (
            <TcoeTable
              key={`${metric.key}-${spec.title}`}
              spec={spec}
              previousWeek={run.previous_week_ending}
              currentWeek={run.current_week_ending}
              portfolioFilter={portfolioFilter}
            />
          ))}
        </div>
      ) : (
        <LoadingMetricTable />
      )}
    </section>
  );
}

export function TCOEDashboard() {
  const [run, setRun] = useState<DashboardRun | null>(null);
  const [metricConfigs, setMetricConfigs] = useState<MetricConfig[]>(FALLBACK_METRICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Filter state
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<Set<string>>(new Set());
  const [portfolioSearch, setPortfolioSearch] = useState('');

  const applyResponse = useCallback((payload: any) => {
    if (payload?.metrics?.length) {
      setMetricConfigs(payload.metrics);
    }
    if (payload?.run) {
      setRun(payload.run);
    }
  }, []);

  const startRun = useCallback(async (force = false) => {
    setError(null);
    if (force) setRefreshing(true);
    try {
      const response = await fetchWithTimeout(getApiUrl('/api/quality/tcoe-dashboard/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Unable to start TCOE dashboard.');
      }
      applyResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start TCOE dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetchWithTimeout(getApiUrl('/api/quality/tcoe-dashboard/latest'));
        const data = await response.json();
        if (!mounted) return;
        if (response.ok && data.success && data.run && data.is_current !== false) {
          applyResponse(data);
          setLoading(false);
        } else {
          await startRun(false);
        }
      } catch {
        if (mounted) await startRun(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [applyResponse, startRun]);

  useEffect(() => {
    if (!run?.run_id || !['pending', 'processing'].includes(run.status)) return;

    const poll = async () => {
      try {
        // Sub-interval timeout (< the 2s poll cadence) so requests can't stack against a stalled backend.
        const response = await fetchWithTimeout(getApiUrl(`/api/quality/tcoe-dashboard/status/${run.run_id}`), {}, 1800);
        const data = await response.json();
        if (response.ok && data.success) {
          applyResponse(data);
        }
      } catch {
        // Keep the current partial dashboard visible if one poll fails.
      }
    };

    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [applyResponse, run?.run_id, run?.status]);

  const orderedMetrics = useMemo(() => {
    const configs = metricConfigs.length ? metricConfigs : FALLBACK_METRICS;
    return configs
      .slice()
      .filter((config) => !HIDDEN_TCOE_DASHBOARD_METRICS.has(config.key))
      .sort((a, b) => {
        const orderA = TCOE_METRIC_ORDER.indexOf(a.key as any);
        const orderB = TCOE_METRIC_ORDER.indexOf(b.key as any);
        return (orderA === -1 ? a.order : orderA) - (orderB === -1 ? b.order : orderB);
      })
      .map((config, index) => ({
        ...config,
        ...(run?.metrics?.[config.key] || {}),
        order: index + 1,
        status: run?.metrics?.[config.key]?.status || 'pending',
        rows: run?.metrics?.[config.key]?.rows || [],
        errors: run?.metrics?.[config.key]?.errors || [],
      })) as MetricState[];
  }, [metricConfigs, run?.metrics]);

  // Apply metric key filter to derive visible metrics
  const visibleMetrics = useMemo(() => {
    if (selectedMetricKeys.size === 0) return orderedMetrics;
    return orderedMetrics.filter(m => selectedMetricKeys.has(m.key));
  }, [orderedMetrics, selectedMetricKeys]);

  const totals = useMemo(() => {
    const total = orderedMetrics.length || VISIBLE_FALLBACK_METRICS.length;
    const completed = orderedMetrics.filter((metric) => metric.status === 'completed').length;
    const failed = orderedMetrics.filter((metric) => metric.status === 'failed').length;
    const processing = orderedMetrics.filter((metric) => metric.status === 'processing').length;
    const pending = orderedMetrics.filter((metric) => metric.status === 'pending').length;
    return { total, completed, failed, processing, pending };
  }, [orderedMetrics]);

  const handleExportPDF = useCallback(async () => {
    if (!run || totals.completed === 0) return;

    try {
      setExportingPDF(true);
      setError(null);

      // Use the frontend html2canvas approach to capture the exact UI appearance
      // This captures the styled dashboard with colors, AI insights, and all formatting
      const filenameLabel = run.current_week_ending || new Date().toISOString().split('T')[0];
      await exportTcoeReportAsPDF('tcoe-dashboard-report', `tcoe_metrics_${filenameLabel}.pdf`);
      
    } catch (err) {
      console.error('Failed to export TCOE metrics PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to export TCOE metrics as PDF.');
    } finally {
      setExportingPDF(false);
    }
  }, [run, totals.completed]);

  const scrollToMetric = useCallback((metricKey: string) => {
    document.getElementById(`tcoe-report-card-${metricKey}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <DashboardLayout>
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--font)',
          minHeight: '100%',
          background: 'radial-gradient(circle at top left, rgba(212,168,71,0.14), transparent 32%), radial-gradient(circle at top right, rgba(26,91,176,0.10), transparent 34%), var(--bg-page)',
        }}
      >
        <style>{`
          .tcoe-dashboard-row {
            transition: background-color 160ms ease, box-shadow 160ms ease;
          }
          .tcoe-dashboard-row:hover {
            background: var(--bg-hover) !important;
            box-shadow: inset 3px 0 0 var(--accent-cool);
          }
          .tcoe-value-cell {
            transition: transform 180ms ease, filter 180ms ease;
          }
          .tcoe-value-cell:hover {
            filter: saturate(1.12);
          }
          .tcoe-trend-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-width: 72px;
          }
          .tcoe-trend-good .tcoe-trend-icon {
            animation: tcoe-happy-bounce 1.8s ease-in-out infinite;
          }
          .tcoe-trend-risk .tcoe-trend-icon {
            animation: tcoe-worried-shake 1.2s ease-in-out infinite;
          }
          .tcoe-trend-good:hover {
            transform: translateY(-1px);
          }
          .tcoe-trend-risk:hover {
            transform: translateY(-1px);
          }
          @keyframes tcoe-happy-bounce {
            0%, 100% { transform: translateY(0) scale(1); }
            35% { transform: translateY(-2px) scale(1.08); }
            65% { transform: translateY(0) scale(1.02); }
          }
          @keyframes tcoe-worried-shake {
            0%, 100% { transform: translateX(0) rotate(0deg); }
            25% { transform: translateX(-1px) rotate(-4deg); }
            50% { transform: translateX(1px) rotate(4deg); }
            75% { transform: translateX(-1px) rotate(-2deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            .tcoe-trend-icon,
            .tcoe-dashboard-row,
            .tcoe-value-cell {
              animation: none !important;
              transition: none !important;
            }
          }
        `}</style>
        <div
          id="tcoe-dashboard-report"
          className="pdf-export-container"
          data-pdf-title="CDK QCOE TCOE DASHBOARD"
          style={{ display: 'grid', gap: 18, width: '100%' }}
        >
        <section
          id="tcoe-report-card-dashboard-summary"
          className="pdf-metric-card"
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), transparent 45%), linear-gradient(135deg, var(--bg-card), var(--bg-surface))',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 22,
            boxShadow: panelShadow,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'linear-gradient(90deg, var(--accent-cool), var(--blue), var(--green))',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 280, flex: '1 1 460px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cool))',
                    color: 'var(--bg-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 12px 24px rgba(0,0,0,0.16)',
                  }}
                >
                  <ShieldCheck size={21} />
                </div>
                <div>
                  <p style={{ margin: 0, color: 'var(--accent-cool)', fontSize: 11, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                    Quality Metrics
                  </p>
                  <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 28, fontWeight: 900, letterSpacing: 0 }}>
                    TCOE Dashboard
                  </h1>
                </div>
              </div>
              <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                Current week ending {formatDateLabel(run?.current_week_ending)} compared with {formatDateLabel(run?.previous_week_ending)}
              </p>
              <div className="pdf-time-indicator" style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                Last refreshed: {formatTimestamp(run?.updated_at)}
              </div>
            </div>

            <div
              data-html2canvas-ignore="true"
              style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}
            >
              <StatusBadge status={run?.status || 'pending'} />
              <Button
                onClick={handleExportPDF}
                disabled={!run || totals.completed === 0 || exportingPDF}
                style={{
                  height: 38,
                  borderRadius: 8,
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  fontWeight: 800,
                  boxShadow: 'var(--shadow-small)',
                }}
              >
                <Download size={15} className={exportingPDF ? 'animate-pulse' : ''} style={{ marginRight: 8 }} />
                {exportingPDF ? 'Exporting...' : 'Export as PDF'}
              </Button>
              <Button
                onClick={() => startRun(true)}
                disabled={refreshing}
                style={{
                  height: 38,
                  borderRadius: 8,
                  background: 'var(--accent-cool)',
                  color: '#fff',
                  fontWeight: 900,
                  boxShadow: '0 10px 22px rgba(212,168,71,0.22)',
                }}
              >
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} style={{ marginRight: 8 }} />
                Refresh
              </Button>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SummaryStat label="Complete" value={`${totals.completed}/${totals.total}`} tone="var(--green)" icon={<CheckCircle2 size={15} />} />
            <SummaryStat label="Running" value={String(totals.processing)} tone="var(--blue)" icon={<Activity size={15} />} />
            <SummaryStat label="Pending" value={String(totals.pending)} tone="var(--text-muted)" icon={<Clock3 size={15} />} />
            <SummaryStat label="Failed" value={String(totals.failed)} tone="var(--red)" icon={<AlertTriangle size={15} />} />
          </div>

          <div
            style={{
              marginTop: 16,
              height: 9,
              borderRadius: 999,
              background: 'var(--bg-page)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round((totals.completed / Math.max(totals.total, 1)) * 100)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent-cool), var(--green), var(--blue))',
                transition: 'width 240ms ease',
              }}
            />
          </div>
        </section>

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div
          data-html2canvas-ignore="true"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 18px',
            boxShadow: 'var(--shadow-small)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Filter size={13} style={{ color: 'var(--accent-cool)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
              Filters
            </span>
            {(selectedMetricKeys.size > 0 || portfolioSearch) && (
              <button
                onClick={() => { setSelectedMetricKeys(new Set()); setPortfolioSearch(''); }}
                style={{
                  marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                <X size={10} /> Clear filters
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Metric multi-select */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Metrics
              </label>
              <SearchableMultiSelect
                options={orderedMetrics.map(m => ({ key: m.key, label: m.label }))}
                selected={selectedMetricKeys}
                onChange={setSelectedMetricKeys}
                placeholder="All metrics"
              />
            </div>
            {/* Portfolio search */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Portfolio
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search portfolios…"
                  value={portfolioSearch}
                  onChange={e => setPortfolioSearch(e.target.value)}
                  style={{
                    width: '100%', paddingLeft: 30, paddingRight: portfolioSearch ? 28 : 12, paddingTop: 8, paddingBottom: 8,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {portfolioSearch && (
                  <X size={11} onClick={() => setPortfolioSearch('')} style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }} />
                )}
              </div>
            </div>
          </div>

          {/* Quick-jump nav buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center', marginRight: 4 }}>Jump to:</span>
            {orderedMetrics.map((metric) => {
              const status = metric.status || 'pending';
              const statusColor = status === 'completed' ? 'var(--green)' : status === 'failed' ? 'var(--red)' : status === 'processing' ? 'var(--blue)' : 'var(--text-muted)';
              const isVisible = selectedMetricKeys.size === 0 || selectedMetricKeys.has(metric.key);
              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => scrollToMetric(metric.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    minHeight: 28, borderRadius: 6, padding: '4px 9px',
                    border: `1px solid ${isVisible ? 'var(--border)' : 'var(--border)40'}`,
                    background: isVisible ? 'var(--bg-surface)' : 'var(--bg-page)',
                    color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    opacity: isVisible ? 1 : 0.45,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor, flexShrink: 0 }} />
                  {metric.order}. {metric.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              border: '1px solid var(--red)',
              background: 'var(--red-bg)',
              color: 'var(--red)',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {loading && !run ? (
          <div style={{ display: 'grid', gap: 14 }}>
            {FALLBACK_METRICS.slice(0, 4).map((metric) => (
              <section
                key={metric.key}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ height: 18, width: 260, borderRadius: 6, background: 'var(--bg-surface)' }} />
                </div>
                <LoadingMetricTable />
              </section>
            ))}
          </div>
        ) : run ? (
          <div style={{ display: 'grid', gap: 14 }}>
            {visibleMetrics.map((metric) => (
              <MetricSection key={metric.key} metric={metric} run={run} portfolioFilter={portfolioSearch || undefined} />
            ))}
          </div>
        ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
