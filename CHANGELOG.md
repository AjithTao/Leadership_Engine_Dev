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

### Fixed
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
- GitHub Insights colors: success metrics now render green instead of the mustard accent (the design's `--green` is aliased to the accent, so `var(--green)` made success rates gold), and the dashboard's `${color}NN` alpha tints (icon chips, badges, bar tracks) now resolve — they used CSS vars, which can't be suffixed into an 8-digit hex, so those backgrounds were silently transparent.

## 2022-07-18
### Updated
- [DPSC-1316](https://projects.cdk.com/browse/DPSC-1316) Updated readME.md to include source code policy, as well as a link to a confluence page containing more details.
