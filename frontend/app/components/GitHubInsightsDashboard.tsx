'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitBranch, Code, CheckCircle, XCircle, RefreshCw, TrendingUp,
  Activity, Clock, ExternalLink, AlertCircle, Loader2, GitCommit,
  Lock, Globe, GitPullRequest, GitMerge, Flame, MessageSquare,
  Search, ChevronDown, Filter, Play,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { DashboardLayout } from './DashboardLayout';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Repo { id: number; name: string; full_name: string; private: boolean; owner: string; html_url: string; default_branch: string; }
interface WorkflowRun { id: number; name: string; status: string; conclusion: string; created_at: string; html_url: string; }
interface RepoStats { repo: string; total_runs: number; successful: number; failed: number; success_rate: number; runs: WorkflowRun[]; loading?: boolean; error?: string; }
interface GitHubUser { login: string; org: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const prStatusStyle = (pr: any) => {
  if (pr.merged) return { bg: '#6B21A820', color: '#A855F7', label: 'MERGED' };
  if (pr.state === 'open') return { bg: '#16653420', color: '#22C55E', label: 'OPEN' };
  return { bg: '#7F1D1D20', color: '#EF4444', label: 'CLOSED' };
};

const timeAgo = (dateStr: string) => {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const DAY_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 14 days', value: 14 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
  { label: 'Last 90 days', value: 90 },
];

// ─── Simple native-select dropdown ───────────────────────────────────────────

function NativeSelect({ value, onChange, style, children }: {
  value: string; onChange: (v: string) => void; style?: React.CSSProperties; children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', width: '100%', padding: '9px 36px 9px 12px',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px',
          fontWeight: 500, cursor: 'pointer', outline: 'none',
        }}
      >
        {children}
      </select>
      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
    </div>
  );
}

// ─── Searchable combobox for repo selection ───────────────────────────────────

function SearchableRepoSelect({ repos, value, onChange }: {
  repos: Repo[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState('');
  const containerRef              = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const displayLabel = value === 'all'
    ? `All Repositories (${repos.length})`
    : value;

  const filtered = search
    ? repos.filter(r => r.full_name.toLowerCase().includes(search.toLowerCase()))
    : repos;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function selectItem(v: string) {
    onChange(v);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger input */}
      <div
        style={{ position: 'relative', cursor: 'pointer' }}
        onClick={() => { setOpen(o => !o); if (!open) setTimeout(() => inputRef.current?.focus(), 0); }}
      >
        {open ? (
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search repositories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{
                appearance: 'none', width: '100%', paddingLeft: 30, paddingRight: 36, paddingTop: 9, paddingBottom: 9,
                background: 'var(--bg-surface)', border: '1px solid var(--accent-cool)',
                borderRadius: '10px', color: 'var(--text-primary)', fontSize: '13px',
                fontWeight: 500, outline: 'none', boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: '10px',
            color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
            userSelect: 'none',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>
            <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: 8, color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, maxHeight: 260, overflowY: 'auto',
        }}>
          {/* All Repositories option */}
          <div
            onMouseDown={() => selectItem('all')}
            style={{
              padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              color: value === 'all' ? 'var(--accent-cool)' : 'var(--text-secondary)',
              background: value === 'all' ? 'var(--accent-cool)12' : 'transparent',
              borderBottom: '1px solid var(--border)',
            }}
          >
            All Repositories ({repos.length})
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              No repositories match "{search}"
            </div>
          ) : (
            filtered.map(r => (
              <div
                key={r.full_name}
                onMouseDown={() => selectItem(r.full_name)}
                style={{
                  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                  color: value === r.full_name ? 'var(--accent-cool)' : 'var(--text-primary)',
                  background: value === r.full_name ? 'var(--accent-cool)12' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (value !== r.full_name) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = value === r.full_name ? 'var(--accent-cool)12' : 'transparent'; }}
              >
                {r.private ? <Lock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <Globe size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GitHubInsightsDashboard() {
  const { isDarkMode } = useTheme();

  // ── connection / repo list ──
  const [connected, setConnected]           = useState<boolean | null>(null);
  const [ghUser, setGhUser]                 = useState<GitHubUser | null>(null);
  const [repos, setRepos]                   = useState<Repo[]>([]);
  const [initialLoading, setInitialLoading]  = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // ── filter state ──
  const [selectedRepo, setSelectedRepo]   = useState<string>('all');
  const [selectedDays, setSelectedDays]   = useState<number>(30);

  // ── insight data ──
  const [hasInsights, setHasInsights]       = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [loadProgress, setLoadProgress]     = useState(0);   // 0-100 for batch progress
  const [repoStatsMap, setRepoStatsMap]     = useState<Record<string, RepoStats>>({});
  const [repoDetail, setRepoDetail]         = useState<any>(null);
  const [repoDetailLoading, setRepoDetailLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const colors = {
    bg: 'var(--bg-page)', surface: 'var(--bg-surface)', card: 'var(--bg-card)',
    primary: 'var(--accent-cool)', text: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)', textMuted: 'var(--text-muted)',
    border: 'var(--border)', success: 'var(--green)',
    error: 'var(--red)', warning: 'var(--amber)',
  };

  // ── Initial load: only connect + fetch repo list ──────────────────────────
  const loadRepos = useCallback(async () => {
    setConnectionError(null);
    setInitialLoading(true);
    try {
      const statusRes  = await fetch(`${API}/api/github/status`);
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        setConnected(false);
        setConnectionError(statusData.error || 'GitHub not connected');
        return;
      }
      setConnected(true);
      setGhUser({ login: statusData.user || '', org: statusData.config?.org || '' });

      const reposRes  = await fetch(`${API}/api/github/repos`);
      const reposData = await reposRes.json();
      setRepos(reposData.repos || []);
    } catch (e: any) {
      setConnected(false);
      setConnectionError(e?.message || 'Network error');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  // ── Fetch CI stats for a single repo ─────────────────────────────────────
  const fetchRepoStats = useCallback(async (fullName: string, days: number, signal?: AbortSignal) => {
    setRepoStatsMap(prev => ({
      ...prev,
      [fullName]: { ...(prev[fullName] || {}), repo: fullName, total_runs: 0, successful: 0, failed: 0, success_rate: 0, runs: [], loading: true },
    }));
    try {
      const res  = await fetch(`${API}/api/github/actions/runs?repo=${encodeURIComponent(fullName)}&days=${days}`, { signal });
      const data = await res.json();
      setRepoStatsMap(prev => ({ ...prev, [fullName]: { ...data, repo: fullName, loading: false } }));
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setRepoStatsMap(prev => ({ ...prev, [fullName]: { repo: fullName, total_runs: 0, successful: 0, failed: 0, success_rate: 0, runs: [], loading: false, error: 'Failed' } }));
      }
    }
  }, []);

  // ── Fetch enriched repo detail (PRs, branches) ───────────────────────────
  const fetchRepoDetail = useCallback(async (fullName: string) => {
    setRepoDetailLoading(true);
    setRepoDetail(null);
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 35000); // 35s timeout
    try {
      const res = await fetch(
        `${API}/api/github/repo-detail?repo=${encodeURIComponent(fullName)}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRepoDetail(data);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        // Return a partial object so PRs panel isn't completely blank
        setRepoDetail({ repo: fullName, default_branch: 'main', last_merged_pr: null, active_branches: [], open_prs: [], _error: true });
      }
    } finally {
      clearTimeout(timeoutId);
      setRepoDetailLoading(false);
    }
  }, []);

  // ── GET INSIGHTS ─────────────────────────────────────────────────────────
  const getInsights = useCallback(async () => {
    // Cancel any prior in-flight batch
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setInsightsLoading(true);
    setHasInsights(false);
    setRepoStatsMap({});
    setRepoDetail(null);
    setLoadProgress(0);

    try {
      if (selectedRepo !== 'all') {
        // ── Single repo: fetch CI + detail in parallel ──
        await Promise.all([
          fetchRepoStats(selectedRepo, selectedDays, ctrl.signal),
          fetchRepoDetail(selectedRepo),
        ]);
        setLoadProgress(100);
      } else {
        // ── All repos: batch CI stats with progress ──
        const list   = repos.slice(0, 200); // safety cap
        const BATCH  = 8;
        const total  = list.length;
        let   done   = 0;

        for (let i = 0; i < total; i += BATCH) {
          if (ctrl.signal.aborted) break;
          const batch = list.slice(i, i + BATCH);
          await Promise.all(batch.map(r => fetchRepoStats(r.full_name, selectedDays, ctrl.signal)));
          done += batch.length;
          setLoadProgress(Math.round((done / total) * 100));
        }
      }
    } finally {
      setInsightsLoading(false);
      setHasInsights(true);
    }
  }, [selectedRepo, selectedDays, repos, fetchRepoStats, fetchRepoDetail]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const allStats     = Object.values(repoStatsMap).filter(s => !s.loading && !s.error);
  const totalRuns    = allStats.reduce((s, r) => s + r.total_runs, 0);
  const totalSuccess = allStats.reduce((s, r) => s + r.successful, 0);
  const totalFailed  = allStats.reduce((s, r) => s + r.failed, 0);
  const overallRate  = totalRuns > 0 ? (totalSuccess / totalRuns) * 100 : 0;
  const activeRepos  = allStats.filter(r => r.total_runs > 0);
  const loadingCount = Object.values(repoStatsMap).filter(s => s.loading).length;

  const visibleRuns: (WorkflowRun & { repoName: string })[] =
    selectedRepo === 'all'
      ? allStats.flatMap(s => (s.runs || []).map(r => ({ ...r, repoName: s.repo })))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 50)
      : (repoStatsMap[selectedRepo]?.runs || []).map(r => ({ ...r, repoName: selectedRepo }));

  const selectedRepoObj = repos.find(r => r.full_name === selectedRepo);
  const selectedStats   = selectedRepo === 'all' ? null : repoStatsMap[selectedRepo];

  // ─── Not connected ────────────────────────────────────────────────────────
  if (connected === false) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: `${colors.error}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <AlertCircle size={28} style={{ color: colors.error }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.text, margin: '0 0 8px' }}>GitHub Not Connected</h2>
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: '0 0 20px' }}>
              {connectionError || 'Set GITHUB_TOKEN in your .env file and restart the backend.'}
            </p>
            <button onClick={loadRepos} style={{ background: colors.primary, color: '#000', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Retry Connection
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Initial loading ──────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg }}>
          <div style={{ textAlign: 'center' }}>
            <Loader2 size={36} style={{ color: colors.primary, animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: colors.textSecondary }}>Connecting to GitHub…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Main UI ──────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: colors.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: colors.primary, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>GitHub Integration</p>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: colors.text, margin: 0 }}>GitHub Insights</h1>
              {ghUser?.login && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: `${colors.primary}15`, color: colors.primary, border: `1px solid ${colors.primary}30`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
                  <GitBranch size={11} /> {ghUser.login}{ghUser.org && ` · ${ghUser.org}`}
                  <span style={{ marginLeft: 4, background: `${colors.primary}20`, borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                    {repos.length} repos
                  </span>
                </span>
              )}
            </div>
            <button
              onClick={loadRepos}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              <RefreshCw size={13} />
              Refresh repos
            </button>
          </div>

          {/* ── Filter bar ── */}
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              <Filter size={11} style={{ display: 'inline', marginRight: 5 }} />
              Select Filters
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: 12, alignItems: 'end' }}>

              {/* Repo selector */}
              <div>
                <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Repository</label>
                <SearchableRepoSelect
                  repos={repos}
                  value={selectedRepo}
                  onChange={v => { setSelectedRepo(v); setHasInsights(false); }}
                />
              </div>

              {/* Days selector */}
              <div>
                <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Time Range</label>
                <NativeSelect value={String(selectedDays)} onChange={v => { setSelectedDays(Number(v)); setHasInsights(false); }}>
                  {DAY_OPTIONS.map(o => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
                </NativeSelect>
              </div>

              {/* Get Insights button */}
              <button
                onClick={getInsights}
                disabled={insightsLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: insightsLoading ? `${colors.primary}60` : colors.primary,
                  color: '#000', border: 'none', borderRadius: 10,
                  padding: '10px 22px', fontSize: 13, fontWeight: 700,
                  cursor: insightsLoading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s', whiteSpace: 'nowrap',
                }}
              >
                {insightsLoading
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading… {loadProgress > 0 && loadProgress < 100 ? `${loadProgress}%` : ''}</>
                  : <><Play size={13} /> Get Insights</>
                }
              </button>
            </div>

            {/* Progress bar for batch loading */}
            {insightsLoading && selectedRepo === 'all' && loadProgress > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ height: 4, background: `${colors.border}`, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${loadProgress}%`, background: colors.primary, borderRadius: 2, transition: 'width 0.3s ease' }} />
                </div>
                <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  Fetching CI data… {loadProgress}% — {loadingCount > 0 ? `${loadingCount} repos still loading` : 'almost done'}
                </p>
              </div>
            )}
          </div>

          {/* ── Empty / idle state ── */}
          {!hasInsights && !insightsLoading && (
            <div style={{ textAlign: 'center', padding: '64px 24px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: `${colors.primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <GitBranch size={26} style={{ color: colors.primary }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>Ready to Analyse</h3>
              <p style={{ fontSize: 13, color: colors.textSecondary, maxWidth: 340, margin: '0 auto 24px' }}>
                {repos.length > 0
                  ? `${repos.length} repositories loaded. Select a repo and time range, then click Get Insights.`
                  : 'Loading repositories…'}
              </p>
              <button
                onClick={getInsights}
                disabled={repos.length === 0}
                style={{ background: colors.primary, color: '#000', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: repos.length === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Play size={13} /> Get Insights
              </button>
            </div>
          )}

          {/* ═══════════════ INSIGHTS CONTENT ═══════════════ */}
          {(hasInsights || insightsLoading) && (

            <>
              {/* ── Summary cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                {[
                  { label: selectedRepo === 'all' ? 'Repos w/ Activity' : 'CI Runs', value: selectedRepo === 'all' ? activeRepos.length : (selectedStats?.total_runs ?? '—'), icon: Code, color: colors.primary, sub: selectedRepo === 'all' ? `of ${repos.length} total` : `last ${selectedDays}d` },
                  { label: 'Total CI Runs', value: totalRuns || '—', icon: Activity, color: colors.primary, sub: `last ${selectedDays} days` },
                  { label: 'Success Rate', value: totalRuns > 0 ? `${overallRate.toFixed(1)}%` : '—', icon: TrendingUp, color: overallRate >= 70 ? colors.success : colors.error },
                ].map(({ label, value, icon: Icon, color, sub }) => (
                  <div key={label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{label}</p>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={16} style={{ color }} />
                      </div>
                    </div>
                    <p style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, margin: 0 }}>{value}</p>
                    {sub && <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</p>}
                  </div>
                ))}

                {/* Open PRs card — shows spinner while repo detail is loading */}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Open PRs</p>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: '#22C55E18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {repoDetailLoading
                        ? <Loader2 size={16} style={{ color: '#22C55E', animation: 'spin 1s linear infinite' }} />
                        : <GitPullRequest size={16} style={{ color: '#22C55E' }} />
                      }
                    </div>
                  </div>
                  {repoDetailLoading ? (
                    <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>Loading…</p>
                  ) : (
                    <p style={{ fontSize: 26, fontWeight: 700, color: '#22C55E', lineHeight: 1, margin: 0 }}>
                      {repoDetail?.open_prs?.length ?? (selectedRepo === 'all' ? '—' : '—')}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                    {selectedRepo !== 'all' ? 'this repo' : 'select a repo'}
                  </p>
                </div>
              </div>

              {/* ── CI Success rate bar (all repos) ── */}
              {selectedRepo === 'all' && totalRuns > 0 && (
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>Overall CI Success Rate</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: overallRate >= 70 ? colors.success : colors.error }}>{overallRate.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: `${colors.error}25` }}>
                    <div style={{ width: `${overallRate}%`, height: '100%', borderRadius: 999, background: overallRate >= 70 ? 'linear-gradient(90deg,#22C55E,#16A34A)' : 'linear-gradient(90deg,#EF4444,#DC2626)', transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{totalSuccess} passed</span>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{totalFailed} failed</span>
                  </div>
                </div>
              )}

              {/* ── Single repo: CI stats row ── */}
              {selectedRepo !== 'all' && selectedStats && !selectedStats.loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {[
                    { label: 'Total CI Runs', value: selectedStats.total_runs, color: colors.primary, icon: Activity },
                    { label: 'Successful',    value: selectedStats.successful,  color: colors.success,  icon: CheckCircle },
                    { label: 'Failed',        value: selectedStats.failed,       color: colors.error,    icon: XCircle },
                    { label: 'Success Rate',  value: `${selectedStats.success_rate.toFixed(1)}%`, color: selectedStats.success_rate >= 70 ? colors.success : colors.error, icon: TrendingUp },
                  ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>{label}</p>
                        <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0 }}>{value}</p>
                      </div>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={17} style={{ color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedRepo !== 'all' && selectedStats?.loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }}>
                  <Loader2 size={15} style={{ color: colors.primary, animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 13, color: colors.textSecondary }}>Fetching CI stats…</span>
                </div>
              )}

              {/* ── Single repo enriched detail ── */}
              {selectedRepo !== 'all' && (
                repoDetailLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }}>
                    <Loader2 size={15} style={{ color: colors.primary, animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 13, color: colors.textSecondary }}>Loading branch & PR details…</span>
                  </div>
                ) : repoDetail && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Last merged PR to main */}
                    {repoDetail.last_merged_pr && (
                      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{ padding: '13px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <GitMerge size={14} style={{ color: '#A855F7' }} />
                          <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>
                            Last Merged PR →{' '}
                            <code style={{ fontSize: 12, background: '#6B21A820', color: '#A855F7', borderRadius: 4, padding: '1px 7px' }}>{repoDetail.default_branch}</code>
                          </span>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, background: '#6B21A820', color: '#A855F7', borderRadius: 5, padding: '2px 7px' }}>MERGED</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>#{repoDetail.last_merged_pr.id}</span>
                            <code style={{ fontSize: 11, color: colors.textSecondary, background: colors.bg, borderRadius: 4, padding: '1px 6px' }}>
                              {repoDetail.last_merged_pr.head_branch} → {repoDetail.default_branch}
                            </code>
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: colors.text, margin: '0 0 6px' }}>{repoDetail.last_merged_pr.title}</p>
                          {repoDetail.last_merged_pr.body_preview && (
                            <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 10px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{repoDetail.last_merged_pr.body_preview}</p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: colors.textSecondary }}>by <strong>{repoDetail.last_merged_pr.author}</strong></span>
                            <span style={{ fontSize: 11, color: colors.textMuted }}>{timeAgo(repoDetail.last_merged_pr.merged_at)}</span>
                            <a href={repoDetail.last_merged_pr.html_url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 12, color: colors.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <ExternalLink size={11} /> View PR
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Active branches this week */}
                    {repoDetail.active_branches?.length > 0 && (
                      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{ padding: '13px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flame size={14} style={{ color: colors.warning }} />
                          <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>Most Active Branches — Last 7 Days</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textMuted }}>{repoDetail.active_branches.length} active</span>
                        </div>
                        {repoDetail.active_branches.map((branch: any, idx: number) => {
                          const maxC = Math.max(...repoDetail.active_branches.map((b: any) => b.commits_this_week || 0), 1);
                          const pct  = ((branch.commits_this_week || 0) / maxC) * 100;
                          return (
                            <div key={branch.name} style={{ padding: '12px 20px', borderBottom: idx < repoDetail.active_branches.length - 1 ? `1px solid ${colors.border}40` : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                              <span style={{ fontSize: idx === 0 ? 10 : 11, fontWeight: 700, color: idx === 0 ? colors.warning : colors.textMuted, minWidth: 34, textAlign: 'center', flexShrink: 0 }}>
                                {idx === 0 ? '🔥 #1' : `#${idx + 1}`}
                              </span>
                              <code style={{ fontSize: 12, fontWeight: 600, color: branch.name === repoDetail.default_branch ? colors.primary : colors.text, background: colors.bg, borderRadius: 5, padding: '2px 8px', flexShrink: 0, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {branch.protected && '🔒 '}{branch.name}
                              </code>
                              <div style={{ flex: 1, height: 6, background: `${colors.border}50`, borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: idx === 0 ? colors.warning : colors.primary, borderRadius: 3, transition: 'width 0.6s ease' }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: idx === 0 ? colors.warning : colors.text, minWidth: 72, textAlign: 'right', flexShrink: 0 }}>
                                {branch.commits_this_week ?? 0} commit{branch.commits_this_week !== 1 ? 's' : ''}
                              </span>
                              <span style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0, minWidth: 64, textAlign: 'right' }}>{timeAgo(branch.last_commit_date)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Open PRs with body */}
                    {repoDetail.open_prs?.length > 0 && (
                      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{ padding: '13px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <GitPullRequest size={14} style={{ color: '#22C55E' }} />
                          <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>Open Pull Requests</span>
                          <span style={{ marginLeft: 'auto', background: '#16653425', color: '#22C55E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                            {repoDetail.open_prs.length} open
                          </span>
                        </div>
                        {repoDetail.open_prs.map((pr: any, idx: number) => (
                          <div key={pr.id} style={{ padding: '16px 20px', borderBottom: idx < repoDetail.open_prs.length - 1 ? `1px solid ${colors.border}40` : 'none', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                {pr.draft && <span style={{ fontSize: 10, fontWeight: 700, background: `${colors.textMuted}20`, color: colors.textMuted, borderRadius: 4, padding: '1px 6px' }}>DRAFT</span>}
                                <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{pr.title}</span>
                                <span style={{ fontSize: 11, color: colors.textMuted }}>#{pr.id}</span>
                              </div>
                              {pr.body_preview && (
                                <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 8px', lineHeight: 1.6, whiteSpace: 'pre-line', maxHeight: 76, overflow: 'hidden' }}>
                                  {pr.body_preview}
                                </p>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <code style={{ fontSize: 11, color: colors.textSecondary, background: colors.bg, borderRadius: 4, padding: '1px 6px' }}>{pr.head_branch} → {pr.base_branch}</code>
                                <span style={{ fontSize: 12, color: colors.textSecondary }}>by <strong>{pr.author}</strong></span>
                                <span style={{ fontSize: 11, color: colors.textMuted }}>{timeAgo(pr.updated_at || pr.created_at)}</span>
                                {(pr.comments + pr.review_comments) > 0 && (
                                  <span style={{ fontSize: 11, color: colors.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <MessageSquare size={10} /> {pr.comments + pr.review_comments}
                                  </span>
                                )}
                                {pr.labels?.map((lbl: string) => (
                                  <span key={lbl} style={{ fontSize: 10, fontWeight: 600, background: `${colors.primary}20`, color: colors.primary, borderRadius: 4, padding: '1px 6px' }}>{lbl}</span>
                                ))}
                              </div>
                            </div>
                            <a href={pr.html_url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, color: colors.primary, opacity: 0.8, marginTop: 2 }}>
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}

                    {repoDetail.open_prs?.length === 0 && !repoDetail.last_merged_pr && repoDetail.active_branches?.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '32px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }}>
                        <p style={{ fontSize: 13, color: colors.textMuted }}>No PR or branch activity found for this repository.</p>
                      </div>
                    )}

                  </div>
                )
              )}

              {/* ── All repos: per-repo grid ── */}
              {selectedRepo === 'all' && allStats.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                    Per-Repository CI Breakdown
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {repos.filter(r => repoStatsMap[r.full_name]).map(repo => {
                      const stats   = repoStatsMap[repo.full_name];
                      const isLoad  = stats?.loading;
                      const rate    = stats?.success_rate ?? 0;
                      const total   = stats?.total_runs ?? 0;
                      return (
                        <button
                          key={repo.full_name}
                          onClick={() => { setSelectedRepo(repo.full_name); setHasInsights(false); }}
                          style={{ textAlign: 'left', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = colors.primary)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = colors.border)}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                {repo.private ? <Lock size={11} style={{ color: colors.textMuted, flexShrink: 0 }} /> : <Globe size={11} style={{ color: colors.textMuted, flexShrink: 0 }} />}
                                <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
                              </div>
                              <span style={{ fontSize: 11, color: colors.textMuted }}>{repo.owner}</span>
                            </div>
                            <a href={repo.html_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ opacity: 0.5, flexShrink: 0 }}>
                              <ExternalLink size={12} style={{ color: colors.textSecondary }} />
                            </a>
                          </div>
                          {isLoad ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Loader2 size={12} style={{ color: colors.primary, animation: 'spin 1s linear infinite' }} />
                              <span style={{ fontSize: 11, color: colors.textMuted }}>Loading…</span>
                            </div>
                          ) : total === 0 ? (
                            <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>No CI runs in period</p>
                          ) : (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                <span style={{ fontSize: 11, color: colors.textMuted }}>{total} runs</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: rate >= 70 ? colors.success : colors.error }}>{rate.toFixed(0)}%</span>
                              </div>
                              <div style={{ height: 5, background: `${colors.error}25`, borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? 'linear-gradient(90deg,#22C55E,#16A34A)' : 'linear-gradient(90deg,#EF4444,#DC2626)', borderRadius: 3 }} />
                              </div>
                              <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                                <span style={{ fontSize: 11, color: colors.success }}>✓ {stats.successful}</span>
                                <span style={{ fontSize: 11, color: colors.error }}>✗ {stats.failed}</span>
                              </div>
                            </>
                          )}
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}40`, fontSize: 10, color: colors.textMuted }}>
                            Click to drill into this repo →
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── CI Workflow runs table ── */}
              {visibleRuns.length > 0 && (
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GitCommit size={14} style={{ color: colors.primary }} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>
                      {selectedRepo === 'all' ? `Recent CI Workflow Runs — All Repos` : `CI Workflow Runs — ${selectedRepoObj?.name || selectedRepo.split('/')[1]}`}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textMuted }}>{visibleRuns.length} runs</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                          {selectedRepo === 'all' && <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Repo</th>}
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Workflow</th>
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Result</th>
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Date</th>
                          <th style={{ padding: '10px 16px' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRuns.map((run, idx) => {
                          const ok   = run.conclusion === 'success';
                          const fail = run.conclusion === 'failure';
                          const busy = run.status === 'in_progress' || run.status === 'queued';
                          const clr  = ok ? colors.success : fail ? colors.error : colors.warning;
                          return (
                            <tr key={`${run.id}-${idx}`} style={{ borderBottom: `1px solid ${colors.border}30` }}>
                              {selectedRepo === 'all' && (
                                <td style={{ padding: '10px 16px' }}>
                                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: colors.textMuted }}>{run.repoName.split('/')[1] || run.repoName}</span>
                                </td>
                              )}
                              <td style={{ padding: '10px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <GitCommit size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />
                                  <span style={{ color: colors.text }}>{run.name}</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px 16px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${clr}20`, color: clr, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>
                                  {ok && <CheckCircle size={11} />}
                                  {fail && <XCircle size={11} />}
                                  {busy && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                                  {run.conclusion || run.status || 'pending'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 16px', fontSize: 11, color: colors.textMuted }}>
                                {new Date(run.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ padding: '10px 16px' }}>
                                <a href={run.html_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: colors.primary, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <ExternalLink size={11} /> View
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </>
          )}

          {/* ── No CI data after load ── */}
          {hasInsights && !insightsLoading && totalRuns === 0 && selectedRepo !== 'all' && !repoDetail && (
            <div style={{ textAlign: 'center', padding: '40px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }}>
              <Activity size={32} style={{ color: colors.textMuted, opacity: 0.4, marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: colors.textMuted }}>No data found for the selected filters.</p>
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
