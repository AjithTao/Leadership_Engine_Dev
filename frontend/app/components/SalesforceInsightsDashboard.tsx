'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  RefreshCw,
  Ticket,
  AlertCircle,
  CheckCircle,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  BarChart3,
  Tag,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { getApiUrl } from '../../lib/api-config';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SalesforceCase {
  id: string;
  case_number: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  origin: string;
  created_date: string;
  account_name: string;
  contact_name: string;
  category: string | null;
  confidence: number | null;
  solution: string | null;
  reasoning: string | null;
  color: string | null;
}

interface Metrics {
  total_cases: number;
  open_cases: number;
  classified_cases: number;
  unclassified_cases: number;
  category_distribution: Record<string, number>;
  categories: string[];
  category_colors: Record<string, string>;
}

// ── CDK palette (single source: globals.css / themes.ts) ─────────────────────
const DS = {
  pageBg: 'var(--bg-page)', cardBg: 'var(--bg-card)', surface: 'var(--bg-surface)',
  hover: 'var(--bg-hover)', active: 'var(--bg-active)', border: 'var(--border)',
  textPrimary: 'var(--text-primary)', textSecondary: 'var(--text-secondary)', textMuted: 'var(--text-muted)',
  green: 'var(--green)', greenBg: 'var(--green-bg)', amber: 'var(--amber)', amberBg: 'var(--amber-bg)',
  red: 'var(--red)', redBg: 'var(--red-bg)', blue: 'var(--blue)', blueBg: 'var(--blue-bg)',
  font: 'var(--font)',
  mono: 'var(--mono)',
} as const;

// ── Category colours (mirrors the backend taxonomy) ──────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'UI / Frontend Issue':       '#D4A847',
  'Backend / API Issue':       '#F87171',
  'Data / Database Issue':     '#93C5FD',
  'Infrastructure / DevOps':   '#FCD34D',
  'Product / Feature Request': '#D4A847',
};

const PRIORITY_COLORS: Record<string, string> = {
  High:     '#F87171',
  Medium:   '#FCD34D',
  Low:      '#D4A847',
  Critical: '#F87171',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function CategoryBadge({ category, color }: { category: string | null; color?: string | null }) {
  if (!category) return <span style={{ color: DS.textMuted, fontSize: 12 }}>Unclassified</span>;
  const bg = color || CATEGORY_COLORS[category] || '#8B93A8';
  return (
    <span
      style={{
        background: `${bg}18`,
        border: `1px solid ${bg}40`,
        color: bg,
        borderRadius: 9999,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {category}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] || '#8B93A8';
  return (
    <span
      style={{
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
        borderRadius: 9999,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {priority}
    </span>
  );
}

function DonutChart({
  distribution,
  colors,
  total,
}: {
  distribution: Record<string, number>;
  colors: Record<string, string>;
  total: number;
}) {
  const entries = Object.entries(distribution);
  if (!entries.length || total === 0) return null;

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const inner = 36;

  let cumulativeAngle = -90;

  const slices = entries.map(([cat, count]) => {
    const pct = count / total;
    const angle = pct * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(cumulativeAngle));
    const y2 = cy + r * Math.sin(toRad(cumulativeAngle));
    const xi1 = cx + inner * Math.cos(toRad(startAngle));
    const yi1 = cy + inner * Math.sin(toRad(startAngle));
    const xi2 = cx + inner * Math.cos(toRad(cumulativeAngle));
    const yi2 = cy + inner * Math.sin(toRad(cumulativeAngle));
    const largeArc = angle > 180 ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${xi2} ${yi2}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${xi1} ${yi1}`,
      'Z',
    ].join(' ');

    return { cat, count, pct, d, color: colors[cat] || CATEGORY_COLORS[cat] || '#8B93A8' };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size}>
        {slices.map((s) => (
          <path key={s.cat} d={s.d} fill={s.color} stroke="var(--bg-page)" strokeWidth={2} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-primary)" fontSize={18} fontWeight={700}>
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-secondary)" fontSize={10}>
          total
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map((s) => (
          <div key={s.cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: DS.textPrimary, fontWeight: 500 }}>{s.cat}</span>
            <span style={{ color: DS.textSecondary, marginLeft: 'auto', paddingLeft: 8 }}>
              {s.count} ({(s.pct * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function SalesforceInsightsDashboard() {
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cases, setCases] = useState<SalesforceCase[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<SalesforceCase | null>(null);
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // ── Data fetching ────────────────────────────────────────────────────────────

  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/salesforce/status'));
      const data = await res.json();
      setConnected(!!data.connected);
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/salesforce/metrics'));
      const data = await res.json();
      if (data.success !== false) setMetrics(data.data || data);
    } catch (e) {
      console.error('Failed to fetch Salesforce metrics', e);
    }
  }, []);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(getApiUrl(`/api/salesforce/cases?${params}`));
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'Failed to fetch cases');
      setCases(data.data?.cases || data.cases || []);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch cases');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const handleClassify = async () => {
    setClassifying(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/salesforce/classify?limit=100'), { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'Classification failed');
      const classified: SalesforceCase[] = data.data?.cases || data.cases || [];
      setCases(classified);
      await fetchMetrics();
    } catch (e: any) {
      setError(e.message || 'Classification failed');
    } finally {
      setClassifying(false);
    }
  };

  const openCaseDetail = async (c: SalesforceCase) => {
    if (c.solution) {
      setSelectedCase(c);
      setExpandedDesc(false);
      return;
    }
    try {
      const res = await fetch(getApiUrl(`/api/salesforce/cases/${c.id}`));
      const data = await res.json();
      const updated = data.data || data;
      setSelectedCase({ ...c, ...updated });
      setCases(prev => prev.map(p => (p.id === c.id ? { ...p, ...updated } : p)));
      setExpandedDesc(false);
    } catch {
      setSelectedCase(c);
    }
  };

  useEffect(() => {
    checkConnection().then(() => {
      fetchCases();
      fetchMetrics();
    });
  }, []);

  // ── Not connected state ──────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="h-full min-h-0 flex flex-col overflow-auto" style={{ backgroundColor: 'var(--bg-page)', fontFamily: 'var(--font)' }}>
      <div style={{ padding: 24, fontFamily: DS.font }}>
        <div
          style={{
            background: DS.amberBg,
            border: `1px solid ${DS.border}`,
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle style={{ width: 16, height: 16, color: DS.amber, flexShrink: 0 }} />
          <span style={{ color: DS.amber, fontSize: 13 }}>
            Salesforce is not connected. Add your credentials to{' '}
            <code style={{ color: DS.blue }}>backend/config/.env</code> and restart the server.
          </span>
        </div>
      </div>
      </div>
    );
  }

  // ── Main dashboard ───────────────────────────────────────────────────────────

  const metricCards = metrics
    ? [
        { label: 'Total Cases',    value: metrics.total_cases,        icon: Ticket,       color: DS.blue, bg: DS.blueBg },
        { label: 'Open Cases',     value: metrics.open_cases,         icon: AlertCircle,  color: DS.amber, bg: DS.amberBg },
        { label: 'Classified',     value: metrics.classified_cases,   icon: CheckCircle,  color: DS.green, bg: DS.greenBg },
        { label: 'Unclassified',   value: metrics.unclassified_cases, icon: Tag,          color: DS.textSecondary, bg: DS.active },
      ]
    : [];

  return (
    <div
      className="h-full min-h-0 flex flex-col overflow-auto"
      style={{ backgroundColor: 'var(--bg-page)', fontFamily: 'var(--font)' }}
    >
    <div
      className="flex-1 min-h-0 overflow-auto"
      style={{ fontFamily: DS.font }}
    >
      <div style={{ padding: 24, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p style={{ color: 'var(--accent-cool)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Salesforce Integration</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: DS.textPrimary, margin: 0, letterSpacing: '-0.03em' }}>
              Salesforce Cases
            </h1>
            <p style={{ marginTop: 4, fontSize: 13, color: DS.textSecondary }}>
              AI-powered ticket categorization &amp; solution engine
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => { fetchCases(); fetchMetrics(); }}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textSecondary,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
                fontFamily: DS.font,
              }}
            >
              {loading
                ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                : <RefreshCw style={{ width: 14, height: 14 }} />}
              Refresh
            </button>
            <button
              onClick={handleClassify}
              disabled={classifying}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                background: 'var(--accent-cool)', color: 'var(--bg-page)', border: 'none',
                cursor: classifying ? 'not-allowed' : 'pointer', opacity: classifying ? 0.7 : 1,
                fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {classifying
                ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />Classifying…</>
                : <><Sparkles style={{ width: 14, height: 14 }} />Classify with AI</>
              }
            </button>
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div
            style={{
              background: DS.redBg,
              border: `1px solid ${DS.border}`,
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <AlertCircle style={{ width: 16, height: 16, color: DS.red, flexShrink: 0 }} />
            <span style={{ color: DS.red, fontSize: 13 }}>{error}</span>
          </div>
        )}

        {/* ── Metrics cards ── */}
        {metrics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {metricCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div
                key={label}
                style={{
                  background: DS.cardBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: 12,
                  padding: '20px 18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 12, color: DS.textSecondary, margin: 0 }}>{label}</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color, margin: '6px 0 0' }}>{value ?? '—'}</p>
                  </div>
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon style={{ width: 18, height: 18, color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Category Distribution ── */}
        {metrics && Object.keys(metrics.category_distribution || {}).length > 0 && (
          <div style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <BarChart3 style={{ width: 18, height: 18, color: DS.blue }} />
              <span style={{ color: DS.textPrimary, fontSize: 14, fontWeight: 600 }}>Category Distribution</span>
            </div>
            <DonutChart
              distribution={metrics.category_distribution}
              colors={metrics.category_colors || CATEGORY_COLORS}
              total={metrics.classified_cases}
            />
          </div>
        )}

        {/* ── Cases Table ── */}
        <div style={{ background: DS.cardBg, border: `1px solid ${DS.border}`, borderRadius: 12 }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${DS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ticket style={{ width: 18, height: 18, color: DS.blue }} />
              <span style={{ color: DS.textPrimary, fontSize: 14, fontWeight: 600 }}>Cases</span>
              {cases.length > 0 && (
                <span
                  style={{
                    background: DS.blueBg, color: DS.blue,
                    border: `1px solid ${DS.blue}30`, borderRadius: 9999,
                    padding: '1px 8px', fontSize: 11, fontWeight: 600,
                  }}
                >
                  {cases.length}
                </span>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                background: DS.surface, border: `1px solid ${DS.border}`, color: DS.textPrimary,
                borderRadius: 8, padding: '7px 10px', fontSize: 13,
                fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
              }}
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div style={{ padding: '0 0 8px' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
                <Loader2 style={{ width: 32, height: 32, color: DS.blue }} className="animate-spin" />
              </div>
            ) : cases.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <Ticket style={{ width: 48, height: 48, color: DS.border, margin: '0 auto 16px' }} />
                <p style={{ color: DS.textSecondary, fontSize: 13 }}>No cases found. Try refreshing or adjusting the filter.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: DS.surface }}>
                      {['Case #', 'Subject', 'Category', 'Priority', 'Status', 'Account', ''].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 14px', textAlign: 'left',
                            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                            letterSpacing: '0.06em', color: DS.textSecondary,
                            borderBottom: `1px solid ${DS.border}`,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map(caseItem => (
                      <tr
                        key={caseItem.id}
                        style={{ borderBottom: `1px solid ${DS.border}`, cursor: 'pointer', transition: 'background 150ms' }}
                        onMouseEnter={e => (e.currentTarget.style.background = DS.hover)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => openCaseDetail(caseItem)}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontFamily: DS.mono, fontSize: 12, color: DS.blue }}>
                            #{caseItem.case_number}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: DS.textPrimary, fontSize: 13, maxWidth: 260 }}>
                          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {caseItem.subject || '(No subject)'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <CategoryBadge category={caseItem.category} color={caseItem.color} />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <PriorityBadge priority={caseItem.priority} />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ color: DS.textSecondary, fontSize: 12 }}>{caseItem.status}</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: DS.textSecondary, fontSize: 12 }}>
                          {caseItem.account_name || '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <button
                            onClick={e => { e.stopPropagation(); openCaseDetail(caseItem); }}
                            style={{
                              padding: '4px 12px', borderRadius: 8, fontSize: 12,
                              background: DS.blueBg, color: DS.blue,
                              border: `1px solid ${DS.blue}30`,
                              cursor: 'pointer',
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            {caseItem.solution ? 'View Solution' : 'Analyse'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Solution Side Drawer ── */}
      {selectedCase && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedCase(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 40, backdropFilter: 'blur(2px)',
            }}
          />
          {/* Drawer */}
          <div
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
              background: DS.cardBg, borderLeft: `1px solid ${DS.border}`,
              zIndex: 50, overflowY: 'auto', padding: 28,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <span style={{ fontFamily: DS.mono, fontSize: 12, color: DS.blue }}>
                  #{selectedCase.case_number}
                </span>
                <h2 style={{ color: DS.textPrimary, fontSize: 16, fontWeight: 700, marginTop: 4, lineHeight: 1.4 }}>
                  {selectedCase.subject || '(No subject)'}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <CategoryBadge category={selectedCase.category} color={selectedCase.color} />
                  <PriorityBadge priority={selectedCase.priority} />
                  <span style={{ color: DS.textSecondary, fontSize: 11 }}>{selectedCase.status}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                style={{
                  color: DS.textSecondary, background: DS.surface,
                  border: `1px solid ${DS.border}`, borderRadius: 8,
                  cursor: 'pointer', padding: '6px 8px', display: 'flex',
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Confidence */}
            {selectedCase.confidence != null && (
              <div
                style={{
                  background: DS.greenBg, border: `1px solid ${DS.green}30`,
                  borderRadius: 10, padding: '10px 14px', marginBottom: 20,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <CheckCircle style={{ width: 16, height: 16, color: DS.green }} />
                <span style={{ color: DS.green, fontSize: 13, fontWeight: 600 }}>
                  {Math.round(selectedCase.confidence * 100)}% confidence
                </span>
                {selectedCase.reasoning && (
                  <span style={{ color: DS.textSecondary, fontSize: 12 }}>— {selectedCase.reasoning}</span>
                )}
              </div>
            )}

            {/* AI Solution */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles style={{ width: 16, height: 16, color: DS.blue }} />
                <span style={{ color: DS.textPrimary, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  AI Solution
                </span>
              </div>
              {selectedCase.solution ? (
                <div
                  style={{
                    background: DS.blueBg, border: `1px solid ${DS.blue}20`,
                    borderLeft: `3px solid ${DS.blue}`,
                    borderRadius: 10, padding: '14px 16px',
                    color: DS.textPrimary, fontSize: 14, lineHeight: 1.7,
                  }}
                >
                  {selectedCase.solution}
                </div>
              ) : (
                <div style={{ color: DS.textSecondary, fontSize: 13 }}>
                  Click <strong style={{ color: DS.textPrimary }}>"Classify with AI"</strong> to generate a solution for all cases,
                  or click <strong style={{ color: DS.textPrimary }}>"Analyse"</strong> on a specific case for on-demand classification.
                </div>
              )}
            </div>

            {/* Original Description */}
            <div>
              <button
                onClick={() => setExpandedDesc(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: DS.textSecondary, fontSize: 12, background: 'transparent',
                  border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8,
                }}
              >
                {expandedDesc
                  ? <ChevronUp style={{ width: 14, height: 14 }} />
                  : <ChevronDown style={{ width: 14, height: 14 }} />}
                Original Description
              </button>
              {expandedDesc && (
                <div
                  style={{
                    background: DS.surface, border: `1px solid ${DS.border}`,
                    borderRadius: 10, padding: '12px 14px',
                    color: DS.textSecondary, fontSize: 13, lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedCase.description || '(No description provided)'}
                </div>
              )}
            </div>

            {/* Meta */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${DS.border}` }}>
              {[
                { label: 'Account',  value: selectedCase.account_name },
                { label: 'Contact',  value: selectedCase.contact_name },
                { label: 'Origin',   value: selectedCase.origin },
                { label: 'Created',  value: selectedCase.created_date ? new Date(selectedCase.created_date).toLocaleString() : '' },
              ].filter(r => r.value).map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: DS.textSecondary, fontSize: 12 }}>{row.label}</span>
                  <span style={{ color: DS.textPrimary, fontSize: 12 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
