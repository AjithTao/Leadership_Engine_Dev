# \<Project name> change log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Dates in this CHANGELOG follow the [ISO 8601 date format](https://www.w3.org/QA/Tips/iso-date).

<!-- Example

## [Unreleased]

## [1.0.29] - 2022-03-01
### Updated
- [SDE-348](https://projects.cdk.com/browse/SDE-348) Changed athena-libs to v.0.29 to use corrected react-internal build-templates path 

### Fixed
- Updated changelog format to v1.1.0.

-->

## [Unreleased]
### Added
- **Services Dashboard + QE dashboard enhancements** (features by Ramesh Ajith,
  integrated additively so none of the existing UI/UX or API work was reverted):
  - New **Services Dashboard** ("Project Mercury — Status Summary"): test-suite
    breakdowns, bug distribution, Zephyr execution table, and a Confluence-fed
    Findings panel, with a top-level sidebar entry and 5-minute auto-refresh.
  - New backend endpoints: `GET /api/jira/period-context` (Sprint/PI date ranges),
    `GET /api/mercury-dashboard`, `GET /api/mercury-dashboard/findings`, and
    `GET /api/jira/fields`.
  - **QCOE/TCOE** and **Defect Leakage** dashboards: searchable metric multi-select
    and portfolio/project/metric dropdown search filters.
  - **GitHub Insights**: per-metric explanatory tooltips across the CI cards,
    tables, and section headers.
  - **Connection Settings**: parallel status fetch that now also reports GitHub.
  - **Work Buddy**: light-mode theming for the chat panel.
- **Jira Insights — Engineering Leadership Command Center** (Phases 3–9): full
  overhaul of the Jira Insights page; breaking changes are backward-compatible
  and all existing API contracts are preserved.
  - **Phase 3 (filter accuracy)**: historical comparison and monthly trend
    sections now anchor to `date_to` instead of `datetime.now()`, so a past
    date range shows the correct relative months rather than always "This Month /
    Last Month"; period labels now show actual month names (e.g. "May 2026").
  - **Phase 4 (Since First Action Date)**: new `GET /api/jira/first-action-date`
    endpoint; frontend fetches the earliest Jira issue date for the active
    project filter and exposes it as a quick-range preset and an active-filter
    pill, mirroring the GitHub Insights pattern.
  - **Phase 5 (advanced filters)**: project search now matches by project name,
    key, container name, and container key; multi-select filter panel added
    (Priority, Issue Type, Status Category, Assignee, Labels); new
    `build_advanced_filter_clause` helper generates JQL from the filter object
    and propagates it to every metric endpoint.
  - **Phase 6 (leadership dashboard)**: Composite Score cards (Project Health,
    Delivery Confidence, Team Performance, Workload Balance) with SVG ring
    gauges; Executive Summary section (Key Wins / Key Risks / Recommendations)
    computed from live data without AI.
  - **Phase 7 (explainability)**: every KPI, metric, chart, composite score,
    table, and recommendation now has an InfoTooltip showing formula, data
    source, business meaning, and example; Best Performers section includes
    methodology disclaimer.
  - **Phase 8 (Jira drilldown)**: every metric is now clickable — clicking any
    KPI card, Quick Stats card, status row, issue-type row, bottleneck, age
    bucket, performer card, historical period, blocker/flagged issue, or due-date
    risk item opens the matching Jira issue list in a new tab via dynamically
    built JQL; drilldown is null-safe and disabled when Jira is not connected.
  - **Phase 9 (enterprise UI/UX)**: responsive CSS grid classes added to
    `globals.css` (6→3→2 KPI cols, 4→2 score cols, 2→1 chart cols at
    1100/880/680 px breakpoints); max-width increased to 1400 px; `tabular-nums`
    applied to all numeric displays; `var(--shadow-small)` shadows on all major
    cards; `data-drill` CSS attribute provides hover accent-border affordance on
    drillable elements without JS handlers; section title icons tightened.
- **Tests** (`backend/tests/test_jira_insights_phase.py`): 28 unit /
  filter-validation / data-consistency tests covering `build_advanced_filter_clause`
  (16 cases), `generate_enhanced_metrics` data consistency (4 cases), date-range
  anchor correctness (3 cases), and filter-scoping edge cases (5 cases).
- GitHub integration: connection settings tab with one-click connect, login-time
  auto-connect via an encrypted service token, and a live status indicator in the
  sidebar integrations list.

### Changed
- UI/UX overhaul of the login page, sidebar navigation (Insights sub-nav, status
  badges, accent active indicator), Connection Settings (theming, contrast,
  auto-expanding modal), and the Work Buddy chat (empty-state redesign, welcome
  toast, story/issue-list/count cards, message-layout polish and animations).
- Login errors now distinguish an unreachable server from invalid credentials.
- All frontend backend calls now go through getApiUrl(); NEXT_PUBLIC_API_URL is the single source of truth for the backend address. NEXT_PUBLIC_BACKEND_URL and NEXT_PUBLIC_API_BASE were removed; the Databricks client env var was renamed to NEXT_PUBLIC_DATABRICKS_ENDPOINT.
- Additional CORS origins can be supplied via the EXTRA_CORS_ORIGINS env var (comma-separated) instead of editing code.
- Stopped tracking frontend/tsconfig.tsbuildinfo; added .gitignore rules for *.tsbuildinfo and MS Office lock files.
- Sessions now persist across page refreshes — a saved auth token is verified on load instead of being cleared, and the user role is carried in the JWT so it survives a refresh.
- GitHub Insights single-repo view redesigned: the generic overview cards (which duplicated the per-repo CI stats) are now shown only for "All Repositories". A single repo gets a coherent layout — primary CI metrics (runs/passed/failed/success rate, with avg runs/day), an activity row (open PRs incl. draft count, active branches and commits in the last 7 days, last-CI-run recency), a per-workflow CI breakdown (run counts and pass rate per workflow), and a leadership-focused **Delivery Performance** panel with DORA-style indicators — lead time for changes, change failure rate, and merge frequency (each rated Elite/High/Medium/Low) plus a review-backlog signal (open/stale PRs, oldest PR age). The backend `actions/runs` and `repo-detail` endpoints return `by_workflow`/`avg_runs_per_day` and `merge_stats` to support these.

### Added
- **Jira Insights — Quality Engineering metrics** for test-case projects. A new
  "Quality Engineering" section appears below the Total Issues row whenever the
  selected scope contains Test-type issues. It shows KPI cards (Test Cases,
  Automated + automation coverage, Requires Automation, Accepted + acceptance
  rate, Open Defects, Defect Density) and three distribution cards (Automation
  Status, Test Type, Test Lifecycle). All figures are **exact live Jira counts**
  (not sampled, so unaffected by the issue-fetch cap) scoped to the current
  project + date filter, and every row drills into the matching Jira issue list.
  The QE custom fields ("Test Status" automation lifecycle and "Test Type") are
  resolved by name with known fallbacks, and each breakdown reconciles to the
  total test count (an "Unspecified" bucket absorbs any remainder). The section is
  hidden for projects without Test issues, and the extra Jira queries are skipped
  there. Note: this instance has no Zephyr/Xray add-on, so there is no PASS/FAIL
  test-execution data — QE is derived from native issue types, statuses, and the
  automation/type custom fields.

### Fixed
- **Jira & GitHub Insights stuck on "Connecting…"** — the dashboards could spin
  indefinitely and never render. Root cause: `/api/jira/metrics` computed the heavy
  Quality-Engineering metrics inline (~40 Jira count-queries over the whole Test
  backlog, ~40s), and the page awaited `metrics` and `enhanced-metrics` together, so
  the loader was gated on the slowest call — which also starved every other request on
  the shared async worker, so GitHub Insights' `status`/`repos` calls hung too. Fixes:
  - QE metrics moved to a dedicated `POST /api/jira/qe-metrics` endpoint, loaded
    non-blocking; the headline renders without waiting on it.
  - Enhanced analytics (velocity/burndown/predictive, ~30s) moved **off** the awaited
    path — `jiraMetrics` is set as soon as the headline metrics resolve and the advanced
    charts fill in afterward behind a "Loading advanced analytics…" banner.
  - `/api/jira/metrics` pagination parallelised (bounded concurrency, using the known
    total) with the 200 ms-per-batch sleeps removed, and the per-issue field list
    trimmed to only what the breakdowns read (dropped `description`, etc.). For the
    broadest all-projects window this cut the metrics call from ~31 s to ~11 s.
  - Added 90 s client-side timeouts to the Jira metrics / enhanced-metrics / qe-metrics
    fetches so a stalled backend can never leave the loader spinning forever.
  Net: first render for the heaviest All-Projects view dropped from ~50 s (or never) to
  ~12 s, single-project views render in a few seconds, and GitHub Insights is no longer
  starved.
- Jira Insights "Issue Breakdown" didn't reconcile with the total (e.g. total
  5,544 but the breakdown showed only Bugs 2 + Stories 55). It only counted four
  hardcoded types (Bug/Story/Task/Epic), so projects dominated by other types —
  e.g. "Test" in a test-case project — were invisible. The `/api/jira/metrics`
  endpoint now returns a full `issuesByType` distribution covering every type, and
  when the fetch is capped it computes **exact** per-type counts via lightweight
  `maxResults=0` Jira searches (run concurrently) with a remainder folded into
  "Other", so the breakdown sums to the real total. The dashboard renders all
  types dynamically (sorted, color-assigned, with per-type drilldown; "Other" is
  non-clickable) instead of the four fixed rows.
- Jira Insights showed **all-projects** data (a fixed ~5,100 total) even after a
  single project was selected. Root cause was on the frontend: the metrics cache
  was a single project-agnostic key rendered on mount under any selection, and
  changing the project did **not** trigger a refetch (it was gated behind the
  "Get Insights" button). Now: (1) cached metrics are only displayed when their
  scope — project + date range, read from the response's `filters` — matches the
  current selection; (2) the mount restore re-applies the cached project/date so
  the dropdown, dates, and numbers stay coherent; (3) any filter change (project,
  date, advanced) clears the stale metrics and refetches for the new scope; and
  (4) `fetchData` tags each request with a monotonic token so a slower, superseded
  response (e.g. an all-projects fetch resolving after a newer single-project one)
  can never overwrite the latest scope's metrics.
- Jira Insights "Total Issues" now reflects Jira's real match count (`jiraTotal`,
  from the search API's `total`) instead of the paginated fetch count, and the
  fetch safety cap is an exact 5,000 (was off-by-one at 5,100); when a project
  exceeds the cap the filter bar shows the real total with a "(N sampled)" note.
- Work Buddy count queries return the actual total instead of an empty issue card.
- Invalid JQL is reported honestly instead of a misleading count of "0"; generated
  JQL is restricted to real Jira fields, mapping functional-area terms to
  labels/text rather than inventing fields.
- Jira and GitHub "configure" now validate credentials before replacing the live
  client, preventing a bad attempt from degrading existing connections.
- Restored GitHub auto-connect at login (apply the encrypted service token via set_token), which was lost in an earlier merge; fixes the empty-token "Bearer " error that left GitHub showing disconnected, and get_status now guards against a missing token.
- Repaired corrupted dependency names in frontend/package.json ("rplaywright/test" -> "@playwright/test", "@echarts" -> "recharts").
- /api/jira/configure and /api/confluence/configure now validate credentials before replacing the active clients and return 400 with a detail message on failure; invalid credentials no longer silently degrade dashboards to anonymous Jira/Confluence access.
- Connection Settings "test connection" now calls /api/jira/test instead of replacing the live Jira client; connect dialogs surface the real error message instead of "undefined".
- Quoted project keys in the AI engine fallback JQL builder (keys named IN/TO are JQL reserved words and made the query fail with HTTP 400).
- Hourly incremental Confluence indexing failed with 401 on every run (Basic auth sent for a PAT); it now reuses the authenticated ConfluenceClient (****** Basic fallback).
- GitHub Insights no longer hangs forever on "Connecting to GitHub…": when `NEXT_PUBLIC_API_URL` is unset, `getApiUrl()` now derives the backend from the page host (`http://<page-host>:8000`) instead of a fixed `localhost:8000`, so localhost and LAN-shared (`http://<LAN-IP>:3000`) clients both reach the backend and a stale/wrong hardcoded IP can no longer strand the UI; `loadRepos()` also got a 20s abort timeout that surfaces a "Not Connected" + Retry state instead of an endless spinner.
- Spinners now animate everywhere: `@keyframes spin` is defined globally in `globals.css` instead of only inside one component's scoped `<style>`, so lucide loaders no longer sit frozen (and misaligned) on screens like GitHub Insights' "Connecting…" state.
- GitHub Insights now filters by an explicit **From / To date range** (with 30d/90d/1y quick presets) instead of a fixed "last N days" dropdown. Selecting a repo auto-sets From to that repo's **very first GitHub Actions run** (fetched per repo), so the default window covers its whole history. The single-repo CI Workflow Runs table now lists **all** runs in the range — fetched fully (paginated server-side up to a cap) and **paginated client-side** with a rows-per-page selector (10/25/50/100) and Prev/Next. Per-run job pass/fail counts are loaded **lazily for the visible page only** (batch `actions/run-jobs` endpoint), so the table scales regardless of total run count. New endpoints: `actions/first-run` and `actions/run-jobs`; `actions/runs` gained `from_date`/`to_date`/`paginate`.
- GitHub Insights CI Workflow Runs table (single-repo) now shows a per-run "Jobs (pass / fail)" column — how many jobs in each workflow run succeeded vs failed, fetched via the new `include_jobs` option on `actions/runs` (gated to single-repo so the all-repos batch isn't slowed). Note: GitHub Actions exposes job-level results, not test-level counts; single-job workflows therefore mirror the run's own result.
- GitHub repo listing now scans every organization the user belongs to (not just one hardcoded `GITHUB_ORG`) and, when an org's repos are blocked by SAML SSO, returns the blocked org names so the UI shows an actionable "Configure SSO" notice instead of silently listing only the user's own repos.
- GitHub repo listing was capped far below the true total (e.g. 147–197 of 674) because the paginator followed GitHub Enterprise's Link `next` cursor, which returns short pages and drops the `next` link early on large org lists. Switched `_get_all_pages` and `_list_org_repos` to explicit `page=N` (offset) paging, and made workflow-run pagination `total_count`-driven, so all accessible repos/runs are returned; the repo list is also sorted by full name.
- GitHub Insights colors: success metrics now render green instead of the mustard accent (the design's `--green` is aliased to the accent, so `var(--green)` made success rates gold), and the dashboard's `${color}NN` alpha tints (icon chips, badges, bar tracks) now resolve — they used CSS vars, which can't be suffixed into an 8-digit hex, so those backgrounds were silently transparent.

## 2022-07-18
### Updated
- [DPSC-1316](https://projects.cdk.com/browse/DPSC-1316) Updated readME.md to include source code policy, as well as a link to a confluence page containing more details.
