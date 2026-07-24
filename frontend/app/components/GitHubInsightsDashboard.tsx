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
import { getApiUrl } from '../../lib/api-config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Repo { id: number; name: string; full_name: string; private: boolean; owner: string; html_url: string; default_branch: string; }
interface WorkflowRun { id: number; name: string; status: string; conclusion: string; created_at: string; html_url: string; }
interface JobCounts { jobs_total: number; jobs_passed: number; jobs_failed: number; }
interface WorkflowStat { name: string; total: number; successful: number; failed: number; success_rate: number; }
interface RepoStats { repo: string; total_runs: number; successful: number; failed: number; success_rate: number; runs: WorkflowRun[]; avg_runs_per_day?: number; by_workflow?: WorkflowStat[]; loading?: boolean; error?: string; }
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

// Humanise an hours value: "6h", "2.5d", "45m", or "—".
const formatDuration = (hours: number | null | undefined) => {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

// ── Date helpers for the From/To filter ──
const toISODate    = (d: Date) => d.toISOString().slice(0, 10);
const todayISO     = () => toISODate(new Date());
const daysAgoISO   = (n: number) => toISODate(new Date(Date.now() - n * 86400000));
const fmtShortDate = (iso: string) => {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
};
const spanDays = (from: string, to: string) => {
  const a = new Date(from + 'T00:00:00').getTime(), b = new Date(to + 'T00:00:00').getTime();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(1, Math.round((b - a) / 86400000) + 1) : 1;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Official GitHub mark (Octocat silhouette) — used as the connecting/loading indicator.
function GitHubMark({ size = 44, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
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

// ─── Hover tooltip ────────────────────────────────────────────────────────────
// Wraps a label; on hover shows an absolutely-positioned bubble above the child
// with a small CSS triangle arrow.
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap', textAlign: 'left', zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 200, maxWidth: 280,
          lineHeight: 1.5,
        }}>
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid var(--border)',
          }} />
        </span>
      )}
    </span>
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
  const [ssoNotice, setSsoNotice]           = useState<string | null>(null);  // SAML-blocked orgs warning

  // ── filter state ──
  const [selectedRepo, setSelectedRepo]   = useState<string>('all');
  const [fromDate, setFromDate]           = useState<string>(daysAgoISO(30));
  const [toDate, setToDate]               = useState<string>(todayISO());
  const [firstActionDate, setFirstActionDate] = useState<string | null>(null); // repo's 1st Actions run
  const [firstActionLoading, setFirstActionLoading] = useState(false);

  // ── runs table pagination + lazy per-run job counts ──
  const [runsPage, setRunsPage]           = useState(1);
  const [runsPageSize, setRunsPageSize]   = useState(25);
  const [jobCountsMap, setJobCountsMap]   = useState<Record<string, JobCounts>>({});

  // ── insight data ──
  const [hasInsights, setHasInsights]       = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [loadProgress, setLoadProgress]     = useState(0);   // 0-100 for batch progress
  const [repoStatsMap, setRepoStatsMap]     = useState<Record<string, RepoStats>>({});
  const [repoDetail, setRepoDetail]         = useState<any>(null);
  const [repoDetailLoading, setRepoDetailLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Surfaces/text/border stay theme-aware CSS vars. The semantic accents are concrete
  // hex (not CSS vars) for two reasons: (1) "success" must read GREEN — the design's
  // --green is aliased to the mustard accent, so var(--green) made success rates gold;
  // (2) the `${color}NN` 8-digit-hex alpha tints used throughout this file only resolve
  // for hex — `var(--x)18` is invalid and renders no tint, so icon chips/badges looked
  // inconsistent (only the hardcoded-hex green chip got a background). These greens/reds
  // match the hardcoded CI bar colors already used below.
  const colors = {
    bg: 'var(--bg-page)', surface: 'var(--bg-surface)', card: 'var(--bg-card)',
    primary: isDarkMode ? '#D4A847' : '#1878B9', text: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)', textMuted: 'var(--text-muted)',
    border: 'var(--border)',
    success: isDarkMode ? '#22C55E' : '#2E7D46',
    error: isDarkMode ? '#EF4444' : '#C21F3A',
    warning: isDarkMode ? '#F59E0B' : '#B45309',
  };

  // ── Initial load: only connect + fetch repo list ──────────────────────────
  const loadRepos = useCallback(async () => {
    setConnectionError(null);
    setSsoNotice(null);
    setInitialLoading(true);
    // Two independent hard timeouts so a slow-but-working backend is never misreported
    // as unreachable. The status probe is quick, but the full org repo list can take far
    // longer (hundreds of repos across many sequential GitHub pages), so it gets its own
    // generous budget. A single shared 20s budget used to abort the repos fetch mid-flight
    // — surfacing a false "backend unreachable" even though it was just slow. Timers live
    // outside try so the finally can always clear them.
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    let reposTimer:  ReturnType<typeof setTimeout> | undefined;
    try {
      const statusCtrl = new AbortController();
      statusTimer = setTimeout(() => statusCtrl.abort(), 20000);
      const statusRes  = await fetch(getApiUrl(`/api/github/status`), { signal: statusCtrl.signal });
      clearTimeout(statusTimer); statusTimer = undefined;
      const statusData = await statusRes.json();
      if (!statusData.connected) {
        setConnected(false);
        setConnectionError(statusData.error || 'GitHub not connected');
        return;
      }
      setConnected(true);
      setGhUser({ login: statusData.user || '', org: statusData.config?.org || '' });

      const reposCtrl = new AbortController();
      reposTimer = setTimeout(() => reposCtrl.abort(), 90000);
      const reposRes  = await fetch(getApiUrl(`/api/github/repos`), { signal: reposCtrl.signal });
      clearTimeout(reposTimer); reposTimer = undefined;
      const reposData = await reposRes.json();
      if (reposData.success === false) {
        setConnected(false);
        setConnectionError(reposData.error || 'GitHub is connected, but no repositories are visible.');
        return;
      }
      setRepos(reposData.repos || []);
      setSsoNotice(reposData.notice || null);
    } catch (e: any) {
      setConnected(false);
      setConnectionError(
        e?.name === 'AbortError'
          ? `Couldn't reach the backend at ${getApiUrl('')}. Make sure it's running and reachable from this device.`
          : (e?.message || 'Network error'),
      );
    } finally {
      if (statusTimer) clearTimeout(statusTimer);
      if (reposTimer)  clearTimeout(reposTimer);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  // ── Fetch CI stats for a single repo ─────────────────────────────────────
  const fetchRepoStats = useCallback(async (fullName: string, from: string, to: string, signal?: AbortSignal, paginate = false) => {
    setRepoStatsMap(prev => ({
      ...prev,
      [fullName]: { ...(prev[fullName] || {}), repo: fullName, total_runs: 0, successful: 0, failed: 0, success_rate: 0, runs: [], loading: true },
    }));
    try {
      // paginate=true (single repo) fetches ALL runs in the window for the full listing;
      // the all-repos batch omits it (one fast page per repo).
      const pg  = paginate ? '&paginate=true' : '';
      const res  = await fetch(getApiUrl(`/api/github/actions/runs?repo=${encodeURIComponent(fullName)}&from_date=${from}&to_date=${to}${pg}`), { signal });
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
        getApiUrl(`/api/github/repo-detail?repo=${encodeURIComponent(fullName)}`),
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
    setRunsPage(1);
    setJobCountsMap({});

    try {
      if (selectedRepo !== 'all') {
        // ── Single repo: fetch ALL runs in the window + detail in parallel ──
        await Promise.all([
          fetchRepoStats(selectedRepo, fromDate, toDate, ctrl.signal, true),
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
          await Promise.all(batch.map(r => fetchRepoStats(r.full_name, fromDate, toDate, ctrl.signal)));
          done += batch.length;
          setLoadProgress(Math.round((done / total) * 100));
        }
      }
    } finally {
      setInsightsLoading(false);
      setHasInsights(true);
    }
  }, [selectedRepo, fromDate, toDate, repos, fetchRepoStats, fetchRepoDetail]);

  // ── Select a repo: reset paging and default the From date to its very 1st Actions run ──
  const selectRepo = useCallback(async (v: string) => {
    setSelectedRepo(v);
    setHasInsights(false);
    setRunsPage(1);
    setJobCountsMap({});
    if (v === 'all') {
      setFirstActionDate(null);
      setFromDate(daysAgoISO(90));
      setToDate(todayISO());
      return;
    }
    setFirstActionLoading(true);
    try {
      const res  = await fetch(getApiUrl(`/api/github/actions/first-run?repo=${encodeURIComponent(v)}`));
      const data = await res.json();
      const fr   = data?.first_run_date ? String(data.first_run_date).slice(0, 10) : null;
      setFirstActionDate(fr);
      setFromDate(fr || daysAgoISO(90));
      setToDate(todayISO());
    } catch {
      setFirstActionDate(null);
      setFromDate(daysAgoISO(90));
      setToDate(todayISO());
    } finally {
      setFirstActionLoading(false);
    }
  }, []);

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
      : (repoStatsMap[selectedRepo]?.runs || []).map(r => ({ ...r, repoName: selectedRepo }));

  const selectedRepoObj = repos.find(r => r.full_name === selectedRepo);
  const selectedStats   = selectedRepo === 'all' ? null : repoStatsMap[selectedRepo];

  // ── Date-range + runs-table pagination derived ──
  const rangeDays       = spanDays(fromDate, toDate);
  const rangeLabel      = `${fmtShortDate(fromDate)} – ${fmtShortDate(toDate)}`;
  const runsTotalPages  = Math.max(1, Math.ceil(visibleRuns.length / runsPageSize));
  const runsPageClamped = Math.min(Math.max(1, runsPage), runsTotalPages);
  const pagedRuns       = visibleRuns.slice((runsPageClamped - 1) * runsPageSize, runsPageClamped * runsPageSize);
  const truncatedRuns   = selectedRepo !== 'all' && (repoStatsMap[selectedRepo] as any)?.truncated === true;

  // Lazily fetch per-run job pass/fail counts for just the currently visible page (single
  // repo) — bounded by page size, so it scales no matter how many total runs there are.
  const pageRunIdsKey = pagedRuns.map(r => r.id).join(',');
  useEffect(() => {
    if (selectedRepo === 'all' || !hasInsights) return;
    const missing = pagedRuns.map(r => r.id).filter(id => id != null && !jobCountsMap[String(id)]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(getApiUrl(`/api/github/actions/run-jobs?repo=${encodeURIComponent(selectedRepo)}&run_ids=${missing.join(',')}`));
        const data = await res.json();
        if (!cancelled && data && typeof data === 'object' && !data.error) {
          setJobCountsMap(prev => ({ ...prev, ...data }));
        }
      } catch { /* leave those rows showing — */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepo, hasInsights, pageRunIdsKey]);

  // ── Single-repo derived metrics (no new API calls — all from data we already have) ──
  const selectedRuns    = selectedRepo === 'all' ? [] : (repoStatsMap[selectedRepo]?.runs || []);
  const lastRun         = selectedRuns[0];                                   // backend returns newest-first
  const activeBranches7d = repoDetail?.active_branches?.length ?? null;
  const commits7d       = repoDetail?.active_branches
    ? repoDetail.active_branches.reduce((s: number, b: any) => s + (b.commits_this_week || 0), 0)
    : null;
  const openPrsList     = repoDetail?.open_prs ?? [];
  const openPrCount     = repoDetail?.open_prs?.length ?? null;
  const draftPrCount    = repoDetail?.open_prs?.filter((p: any) => p.draft).length ?? 0;
  const runConclusionColor = (r: WorkflowRun) =>
    r.conclusion === 'success' ? colors.success
      : r.conclusion === 'failure' ? colors.error
      : colors.warning;

  // ── Leadership / delivery-performance metrics (DORA-style) ──
  const nowMs              = Date.now();
  const ageDays            = (iso: string) => (nowMs - new Date(iso).getTime()) / 86400000;
  const changeFailureRate  = selectedStats && selectedStats.total_runs > 0
    ? (selectedStats.failed / selectedStats.total_runs) * 100 : null;
  const leadTimeHours      = repoDetail?.merge_stats?.avg_hours_to_merge ?? null;
  const mergesPerWeek      = repoDetail?.merge_stats?.merged_last_30d != null
    ? (repoDetail.merge_stats.merged_last_30d / 30) * 7 : null;
  const stalePrCount       = openPrsList.filter((p: any) => ageDays(p.updated_at || p.created_at) > 7).length;
  const oldestPrAgeDays    = openPrsList.length
    ? Math.max(...openPrsList.map((p: any) => ageDays(p.created_at))) : null;
  // DORA tiers
  const leadTimeTier = leadTimeHours == null ? null
    : leadTimeHours < 24 ? 'Elite' : leadTimeHours < 168 ? 'High' : leadTimeHours < 720 ? 'Medium' : 'Low';
  const cfrTier = changeFailureRate == null ? null
    : changeFailureRate <= 15 ? 'Elite' : changeFailureRate <= 30 ? 'High' : changeFailureRate <= 45 ? 'Medium' : 'Low';
  const freqTier = mergesPerWeek == null ? null
    : mergesPerWeek >= 7 ? 'Elite' : mergesPerWeek >= 1 ? 'High' : mergesPerWeek >= 0.25 ? 'Medium' : 'Low';
  const tierColor = (tier: string | null) =>
    tier === 'Elite' || tier === 'High' ? colors.success
      : tier === 'Medium' ? colors.warning
      : tier === 'Low' ? colors.error : colors.textMuted;

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
            <button onClick={loadRepos} style={{ background: colors.primary, color: isDarkMode ? '#000' : '#FFFFFF', border: 'none', borderRadius: isDarkMode ? 10 : 9999, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <GitHubMark size={48} style={{ color: colors.primary, animation: 'logo-breathe 1.4s ease-in-out infinite', display: 'block' }} />
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>Connecting to GitHub…</p>
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
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: isDarkMode ? 10 : 9999, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              <RefreshCw size={13} />
              Refresh repos
            </button>
          </div>

          {/* ── SAML SSO notice: org repos hidden until the token is authorized ── */}
          {ssoNotice && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: colors.surface, border: `1px solid ${colors.border}`, borderLeft: `3px solid ${colors.warning}`, borderRadius: 12, padding: '12px 16px' }}>
              <AlertCircle size={16} style={{ color: colors.warning, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: colors.text, margin: 0, lineHeight: 1.5 }}>{ssoNotice}</p>
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, fontWeight: 600, color: colors.warning }}
                >
                  <ExternalLink size={11} /> Configure SSO on GitHub
                </a>
              </div>
            </div>
          )}

          {/* ── Filter bar ── */}
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              <Filter size={11} style={{ display: 'inline', marginRight: 5 }} />
              Select Filters
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'end' }}>

              {/* Repo selector */}
              <div style={{ minWidth: 0 }}>
                <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Repository</label>
                <SearchableRepoSelect repos={repos} value={selectedRepo} onChange={selectRepo} />
              </div>

              {/* From date */}
              <div>
                <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>From</label>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={e => { setFromDate(e.target.value); setHasInsights(false); setRunsPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, padding: '8px 10px', outline: 'none', colorScheme: isDarkMode ? 'dark' : 'light' }}
                />
              </div>

              {/* To date */}
              <div>
                <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>To</label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={todayISO()}
                  onChange={e => { setToDate(e.target.value); setHasInsights(false); setRunsPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, padding: '8px 10px', outline: 'none', colorScheme: isDarkMode ? 'dark' : 'light' }}
                />
              </div>

              {/* Get Insights button */}
              <button
                onClick={getInsights}
                disabled={insightsLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: insightsLoading ? `${colors.primary}60` : colors.primary,
                  color: isDarkMode ? '#000' : '#FFFFFF', border: 'none', borderRadius: isDarkMode ? 10 : 9999,
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

            {/* Quick-range presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick range</span>
              {[{ label: '30 days', days: 30 }, { label: '90 days', days: 90 }, { label: '1 year', days: 365 }].map(p => (
                <button
                  key={p.label}
                  onClick={() => { setFromDate(daysAgoISO(p.days)); setToDate(todayISO()); setHasInsights(false); setRunsPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textSecondary, fontSize: 12, fontWeight: 500, padding: '4px 12px', cursor: 'pointer' }}
                >
                  {p.label}
                </button>
              ))}
              {selectedRepo !== 'all' && firstActionDate && (
                <button
                  onClick={() => { setFromDate(firstActionDate); setToDate(todayISO()); setHasInsights(false); setRunsPage(1); }}
                  style={{ background: `${colors.primary}1F`, border: `1px solid ${colors.primary}55`, borderRadius: 8, color: colors.primary, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <Flame size={11} /> Since 1st action ({fmtShortDate(firstActionDate)})
                </button>
              )}
              {firstActionLoading && <Loader2 size={13} style={{ color: colors.textMuted, animation: 'spin 1s linear infinite' }} />}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textMuted }}>{rangeLabel} · {rangeDays}d</span>
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
                  ? `${repos.length} repositories loaded. Pick a repo (its From date defaults to its 1st GitHub Action), adjust the date range, then click Get Insights.`
                  : 'Loading repositories…'}
              </p>
              <button
                onClick={getInsights}
                disabled={repos.length === 0}
                style={{ background: colors.primary, color: isDarkMode ? '#000' : '#FFFFFF', border: 'none', borderRadius: isDarkMode ? 10 : 9999, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: repos.length === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <Play size={13} /> Get Insights
              </button>
            </div>
          )}

          {/* ═══════════════ INSIGHTS CONTENT ═══════════════ */}
          {(hasInsights || insightsLoading) && (

            <>
              {/* ── Summary cards (All Repositories overview only) ── */}
              {selectedRepo === 'all' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {[
                    { label: 'Repos w/ Activity', value: activeRepos.length, icon: Code, color: colors.primary, sub: `of ${repos.length} total`, tooltip: `Number of repositories that had at least one CI workflow run between ${rangeLabel} (${rangeDays}d). Repositories with no activity in this range are excluded.` },
                    { label: 'Total CI Runs', value: totalRuns || '—', icon: Activity, color: colors.primary, sub: rangeLabel, tooltip: `Aggregate count of all GitHub Actions workflow runs across all selected repositories for ${rangeLabel} (${rangeDays}d). Each run represents one pipeline execution (triggered by a push, PR, or schedule).` },
                    { label: 'Success Rate', value: totalRuns > 0 ? `${overallRate.toFixed(1)}%` : '—', icon: TrendingUp, color: overallRate >= 70 ? colors.success : colors.error, sub: totalRuns > 0 ? `${totalSuccess}/${totalRuns} passed` : undefined, tooltip: `Percentage of CI runs that completed successfully (conclusion = "success") over ${rangeLabel} (${rangeDays}d). A rate above 70% is considered healthy. Below 70% suggests instability — frequent failures may indicate flaky tests, dependency issues, or frequent breaking changes.` },
                    { label: 'Failed Runs', value: totalRuns > 0 ? totalFailed : '—', icon: XCircle, color: totalFailed > 0 ? colors.error : colors.success, sub: `across ${activeRepos.length} active repos`, tooltip: `Number of CI workflow runs that ended in failure (conclusion = "failure") across all active repositories for ${rangeLabel} (${rangeDays}d). Failed runs are pipeline executions where one or more steps did not pass and need attention.` },
                  ].map(({ label, value, icon: Icon, color, sub, tooltip }) => (
                    <div key={label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Tooltip text={tooltip}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, cursor: 'help', borderBottom: '1px dashed var(--border)' }}>{label}</p>
                        </Tooltip>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={16} style={{ color }} />
                        </div>
                      </div>
                      <p style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, margin: 0 }}>{value}</p>
                      {sub && <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{sub}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* ── CI Success rate bar (all repos) ── */}
              {selectedRepo === 'all' && totalRuns > 0 && (
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Tooltip text={`Proportion of CI runs that succeeded across all repositories for ${rangeLabel} (${rangeDays}d). Industry benchmark is typically 70%+ for a healthy codebase. Low rates suggest frequent build/test failures that need attention.`}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, cursor: 'help', borderBottom: '1px dashed var(--border)' }}>Overall CI Success Rate</span>
                    </Tooltip>
                    <span style={{ fontSize: 14, fontWeight: 700, color: overallRate >= 70 ? colors.success : colors.error }}>{overallRate.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: `${colors.error}25` }}>
                    <div style={{ width: `${overallRate}%`, height: '100%', borderRadius: 999, background: overallRate >= 70 ? (isDarkMode ? 'linear-gradient(90deg,#22C55E,#16A34A)' : 'linear-gradient(90deg,#43A05C,#2E7D46)') : (isDarkMode ? 'linear-gradient(90deg,#EF4444,#DC2626)' : 'linear-gradient(90deg,#C21F3A,#A21A31)'), transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{totalSuccess} passed</span>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>{totalFailed} failed</span>
                  </div>
                </div>
              )}

              {/* ── Single repo: CI stats + activity ── */}
              {selectedRepo !== 'all' && selectedStats && !selectedStats.loading && (
                <>
                  {/* Primary CI metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                    {[
                      { label: 'Total CI Runs', value: selectedStats.total_runs, color: colors.primary, icon: Activity, sub: selectedStats.total_runs > 0 ? `${(selectedStats.avg_runs_per_day ?? selectedStats.total_runs / rangeDays).toFixed(1)}/day · ${rangeDays}d` : rangeLabel, tooltip: `Total number of CI/CD pipeline runs triggered on this repository over ${rangeLabel} (${rangeDays}d). Includes all workflow types (build, test, deploy).` },
                      { label: 'Successful',    value: selectedStats.successful,  color: colors.success,  icon: CheckCircle, sub: 'passed', tooltip: undefined as string | undefined },
                      { label: 'Failed',        value: selectedStats.failed,       color: selectedStats.failed > 0 ? colors.error : colors.success, icon: XCircle, sub: selectedStats.failed > 0 ? 'needs attention' : 'none', tooltip: `Number of CI workflow runs on this repository that ended in failure (conclusion = "failure") over ${rangeLabel} (${rangeDays}d). Failed runs are pipeline executions where one or more steps did not pass and need attention.` },
                      { label: 'Success Rate',  value: `${selectedStats.success_rate.toFixed(1)}%`, color: selectedStats.success_rate >= 70 ? colors.success : colors.error, icon: TrendingUp, sub: selectedStats.success_rate >= 70 ? 'healthy' : 'below target', tooltip: `Percentage of CI runs on this repository that completed successfully (conclusion = "success") over ${rangeLabel} (${rangeDays}d). A rate above 70% is considered healthy. Below 70% suggests instability — frequent failures may indicate flaky tests, dependency issues, or frequent breaking changes.` },
                    ].map(({ label, value, color, icon: Icon, sub, tooltip }) => (
                      <div key={label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          {tooltip ? (
                            <Tooltip text={tooltip}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', cursor: 'help', borderBottom: '1px dashed var(--border)' }}>{label}</p>
                            </Tooltip>
                          ) : (
                            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>{label}</p>
                          )}
                          <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0 }}>{value}</p>
                          {sub && <p style={{ fontSize: 11, color: colors.textMuted, margin: '4px 0 0' }}>{sub}</p>}
                        </div>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={17} style={{ color }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Activity metrics (PRs / branches / recency) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                    {[
                      { label: 'Open PRs',        icon: GitPullRequest, color: colors.success,      value: openPrCount,     sub: draftPrCount > 0 ? `${draftPrCount} draft` : 'awaiting review', loading: repoDetailLoading, tooltip: 'Number of currently open Pull Requests on this repository. Open PRs represent work-in-progress code waiting for review or merge. A high count may indicate a review bottleneck or large feature branches.' },
                      { label: 'Active Branches', icon: GitBranch,      color: colors.primary, value: activeBranches7d, sub: 'last 7 days', loading: repoDetailLoading, tooltip: 'Number of branches with commits pushed in the last 7 days. Active branches indicate areas of the codebase currently under development. A high count can mean many parallel work streams.' },
                      { label: 'Commits',         icon: GitCommit,      color: colors.primary, value: commits7d,       sub: 'last 7 days', loading: repoDetailLoading, tooltip: undefined as string | undefined },
                      { label: 'Last CI Run',     icon: Clock,          color: lastRun ? runConclusionColor(lastRun) : colors.textMuted, value: lastRun ? timeAgo(lastRun.created_at) : '—', sub: lastRun ? (lastRun.conclusion || lastRun.status || 'pending') : 'no runs in range', loading: false, tooltip: undefined as string | undefined },
                    ].map(({ label, icon: Icon, color, value, sub, loading, tooltip }) => (
                      <div key={label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ minWidth: 0 }}>
                          {tooltip ? (
                            <Tooltip text={tooltip}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', cursor: 'help', borderBottom: '1px dashed var(--border)' }}>{label}</p>
                            </Tooltip>
                          ) : (
                            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>{label}</p>
                          )}
                          {loading
                            ? <Loader2 size={18} style={{ color, animation: 'spin 1s linear infinite' }} />
                            : <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ?? '—'}</p>}
                          {sub && !loading && <p style={{ fontSize: 11, color: colors.textMuted, margin: '4px 0 0', textTransform: 'capitalize' }}>{sub}</p>}
                        </div>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={17} style={{ color }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Delivery performance — leadership / DORA-style indicators (shown above CI Workflows) */}
                  {(selectedStats?.total_runs || repoDetail?.merge_stats?.merged_total || (openPrCount ?? 0) > 0) && (
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: 'hidden' }}>
                      <div style={{ padding: '13px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={14} style={{ color: colors.primary }} />
                        <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>Delivery Performance</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textMuted }}>DORA-style delivery indicators</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {[
                          { label: 'Lead Time for Changes', value: formatDuration(leadTimeHours), tier: leadTimeTier, color: undefined as string | undefined, sub: 'avg PR open → merge' },
                          { label: 'Change Failure Rate', value: changeFailureRate != null ? `${changeFailureRate.toFixed(1)}%` : '—', tier: cfrTier, color: undefined as string | undefined, sub: selectedStats ? `${selectedStats.failed}/${selectedStats.total_runs} CI runs` : 'CI failures' },
                          { label: 'Merge Frequency', value: mergesPerWeek != null ? `${mergesPerWeek.toFixed(1)}/wk` : '—', tier: freqTier, color: undefined as string | undefined, sub: repoDetail?.merge_stats ? `${repoDetail.merge_stats.merged_last_30d} merged · 30d` : 'PRs merged' },
                          { label: 'Review Backlog', value: openPrCount ?? 0, tier: null as string | null, color: stalePrCount > 0 ? colors.warning : colors.success, sub: `${stalePrCount} stale >7d${oldestPrAgeDays != null && oldestPrAgeDays >= 1 ? ` · oldest ${Math.round(oldestPrAgeDays)}d` : ''}` },
                        ].map((m, i) => (
                          <div key={m.label} style={{ padding: '16px 20px', borderLeft: i > 0 ? `1px solid ${colors.border}` : 'none' }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>{m.label}</p>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 22, fontWeight: 700, color: m.color ?? (m.tier ? tierColor(m.tier) : colors.text) }}>{m.value}</span>
                              {m.tier && (
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tierColor(m.tier), background: `${tierColor(m.tier)}1F`, border: `1px solid ${tierColor(m.tier)}55`, borderRadius: 5, padding: '1px 6px' }}>{m.tier}</span>
                              )}
                            </div>
                            <p style={{ fontSize: 11, color: colors.textMuted, margin: '6px 0 0' }}>{m.sub}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CI workflow breakdown — per-workflow run counts and pass rate */}
                  {(selectedStats.by_workflow?.length ?? 0) > 1 && (
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16, overflow: 'hidden' }}>
                      <div style={{ padding: '13px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GitCommit size={14} style={{ color: colors.primary }} />
                        <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>CI Workflows</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textMuted }}>{selectedStats.by_workflow?.length} workflows · {rangeDays}d</span>
                      </div>
                      {(selectedStats.by_workflow ?? []).map((wf, idx, arr) => (
                        <div key={wf.name} style={{ padding: '12px 20px', borderBottom: idx < arr.length - 1 ? `1px solid ${colors.border}40` : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                          <span style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0, minWidth: 56, textAlign: 'right' }}>{wf.total} run{wf.total !== 1 ? 's' : ''}</span>
                          <div style={{ flex: 1, maxWidth: 160, height: 6, background: `${colors.error}25`, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ height: '100%', width: `${wf.success_rate}%`, background: wf.success_rate >= 70 ? (isDarkMode ? 'linear-gradient(90deg,#22C55E,#16A34A)' : 'linear-gradient(90deg,#43A05C,#2E7D46)') : (isDarkMode ? 'linear-gradient(90deg,#EF4444,#DC2626)' : 'linear-gradient(90deg,#C21F3A,#A21A31)'), borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: wf.success_rate >= 70 ? colors.success : colors.error, minWidth: 44, textAlign: 'right', flexShrink: 0 }}>{wf.success_rate.toFixed(0)}%</span>
                          <span style={{ display: 'flex', gap: 8, flexShrink: 0, minWidth: 72, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11, color: colors.success }}>✓ {wf.successful}</span>
                            <span style={{ fontSize: 11, color: colors.error }}>✗ {wf.failed}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
                          <Tooltip text="Branches ranked by number of commits pushed in the last 7 days. Shows which areas of the codebase are most actively being developed. Branches near the top of the list are seeing the most engineering activity this week.">
                            <span style={{ fontWeight: 600, fontSize: 13, color: colors.text, cursor: 'help', borderBottom: '1px dashed var(--border)' }}>Most Active Branches — Last 7 Days</span>
                          </Tooltip>
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
                          <GitPullRequest size={14} style={{ color: colors.success }} />
                          <Tooltip text="Pull Requests currently open for review on this repository. Each PR represents a set of code changes proposed by a developer, awaiting review and approval before being merged into the main branch. Author and branch info help identify ownership.">
                            <span style={{ fontWeight: 600, fontSize: 13, color: colors.text, cursor: 'help', borderBottom: '1px dashed var(--border)' }}>Open Pull Requests</span>
                          </Tooltip>
                          <span style={{ marginLeft: 'auto', background: isDarkMode ? '#16653425' : '#43A05C20', color: colors.success, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
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
                  <div style={{ marginBottom: 12 }}>
                    <Tooltip text="Each card shows one repository's CI health. The percentage is the success rate for that repository. Click any card to drill into its detailed branch and PR activity.">
                      <p style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, cursor: 'help', borderBottom: '1px dashed var(--border)' }}>
                        Per-Repository CI Breakdown
                      </p>
                    </Tooltip>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {repos.filter(r => repoStatsMap[r.full_name]).map(repo => {
                      const stats   = repoStatsMap[repo.full_name];
                      const isLoad  = stats?.loading;
                      const rate    = stats?.success_rate ?? 0;
                      const total   = stats?.total_runs ?? 0;
                      return (
                        <button
                          key={repo.full_name}
                          onClick={() => selectRepo(repo.full_name)}
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
                                <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? (isDarkMode ? 'linear-gradient(90deg,#22C55E,#16A34A)' : 'linear-gradient(90deg,#43A05C,#2E7D46)') : (isDarkMode ? 'linear-gradient(90deg,#EF4444,#DC2626)' : 'linear-gradient(90deg,#C21F3A,#A21A31)'), borderRadius: 3 }} />
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
                    <Tooltip text="Each row represents one GitHub Actions workflow run — an automated pipeline execution triggered by code activity. 'Workflow' is the pipeline name, 'Result' shows whether it passed or failed, and 'Date' is when it was triggered.">
                      <span style={{ fontWeight: 600, fontSize: 13, color: colors.text, cursor: 'help', borderBottom: '1px dashed var(--border)' }}>
                        {selectedRepo === 'all' ? `CI Workflow Runs — All Repos` : `CI Workflow Runs — ${selectedRepoObj?.name || selectedRepo.split('/')[1]}`}
                      </span>
                    </Tooltip>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textMuted }}>
                      {`${(runsPageClamped - 1) * runsPageSize + 1}–${Math.min(runsPageClamped * runsPageSize, visibleRuns.length)} of ${visibleRuns.length}${truncatedRuns ? '+' : ''} runs`}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                          {selectedRepo === 'all' && <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Repo</th>}
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>
                            <Tooltip text="The name of the automated pipeline / GitHub Actions workflow that ran (e.g., 'Build & Test', 'Deploy to Prod').">
                              <span style={{ cursor: 'help', borderBottom: '1px dashed var(--border)' }}>Workflow</span>
                            </Tooltip>
                          </th>
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>
                            <Tooltip text="The outcome of the pipeline run. 'Success' means all steps passed. 'Failure' means one or more steps failed. 'In progress' means still running.">
                              <span style={{ cursor: 'help', borderBottom: '1px dashed var(--border)' }}>Result</span>
                            </Tooltip>
                          </th>
                          {selectedRepo !== 'all' && <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Jobs (pass / fail)</th>}
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>
                            <Tooltip text="The date and time when this workflow run was triggered.">
                              <span style={{ cursor: 'help', borderBottom: '1px dashed var(--border)' }}>Date</span>
                            </Tooltip>
                          </th>
                          <th style={{ padding: '10px 16px' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedRuns.map((run, idx) => {
                          const ok   = run.conclusion === 'success';
                          const fail = run.conclusion === 'failure';
                          const busy = run.status === 'in_progress' || run.status === 'queued';
                          const clr  = ok ? colors.success : fail ? colors.error : colors.warning;
                          const jc   = jobCountsMap[String(run.id)];
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
                              {selectedRepo !== 'all' && (
                                <td style={{ padding: '10px 16px' }}>
                                  {jc ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600 }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: colors.success }}><CheckCircle size={11} /> {jc.jobs_passed}</span>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: jc.jobs_failed > 0 ? colors.error : colors.textMuted }}><XCircle size={11} /> {jc.jobs_failed}</span>
                                      <span style={{ color: colors.textMuted, fontWeight: 400 }}>of {jc.jobs_total}</span>
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: colors.textMuted }}>…</span>
                                  )}
                                </td>
                              )}
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

                  {/* Pagination footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: `1px solid ${colors.border}`, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>Rows per page</span>
                    <select
                      value={runsPageSize}
                      onChange={e => { setRunsPageSize(Number(e.target.value)); setRunsPage(1); }}
                      style={{ background: 'var(--bg-surface)', border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, padding: '4px 8px', cursor: 'pointer', colorScheme: isDarkMode ? 'dark' : 'light' }}
                    >
                      {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.textSecondary }}>Page {runsPageClamped} of {runsTotalPages}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setRunsPage(p => Math.max(1, p - 1))}
                        disabled={runsPageClamped <= 1}
                        style={{ background: 'var(--bg-surface)', border: `1px solid ${colors.border}`, borderRadius: 8, color: runsPageClamped <= 1 ? colors.textMuted : colors.text, fontSize: 12, fontWeight: 500, padding: '5px 14px', cursor: runsPageClamped <= 1 ? 'not-allowed' : 'pointer' }}
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setRunsPage(p => Math.min(runsTotalPages, p + 1))}
                        disabled={runsPageClamped >= runsTotalPages}
                        style={{ background: 'var(--bg-surface)', border: `1px solid ${colors.border}`, borderRadius: 8, color: runsPageClamped >= runsTotalPages ? colors.textMuted : colors.text, fontSize: 12, fontWeight: 500, padding: '5px 14px', cursor: runsPageClamped >= runsTotalPages ? 'not-allowed' : 'pointer' }}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  {truncatedRuns && (
                    <div style={{ padding: '8px 20px', borderTop: `1px solid ${colors.border}`, fontSize: 11, color: colors.warning }}>
                      Showing the first {visibleRuns.length} runs in this range (capped). Narrow the date range to load earlier runs.
                    </div>
                  )}
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
