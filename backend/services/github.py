import os
import httpx
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class GitHubConfig:
    def __init__(self):
        self.api_token = os.getenv("GITHUB_TOKEN", "")
        self.email = os.getenv("GITHUB_EMAIL", "ajith.ramesh@cdk.com")
        self.base_url = "https://api.github.com"
        # Default org can be overridden via env when the repo lives elsewhere
        self.org = os.getenv("GITHUB_ORG", "cdk-prod")
        # SSL / cert handling
        # GITHUB_VERIFY=false to skip verification (not recommended)
        # GITHUB_CA_BUNDLE=/path/to/ca-bundle.pem to trust custom CA
        # Default to false (temporary) until proper CA bundle is provided
        verify_env = os.getenv("GITHUB_VERIFY", "false").lower()
        self.verify = False if verify_env in ["false", "0", "no", "off"] else True
        self.ca_bundle = os.getenv("GITHUB_CA_BUNDLE")

class GitHubClient:
    """
    Client for interacting with GitHub REST API
    """
    def __init__(self, config: GitHubConfig = None):
        self.config = config or GitHubConfig()
        self._client = None
        self._headers = None

    async def initialize(self):
        """Initialize the HTTP client"""
        if not self._client:
            # Determine verification setting
            verify_setting: Any = self.config.verify
            if self.config.ca_bundle:
                verify_setting = self.config.ca_bundle
                logger.info(f"Using custom CA bundle for GitHub: {self.config.ca_bundle}")
            if verify_setting is False:
                logger.warning("GitHub SSL verification is DISABLED (GITHUB_VERIFY=false). Enable it or provide GITHUB_CA_BUNDLE if possible.")

            self._client = httpx.AsyncClient(timeout=30.0, verify=verify_setting, trust_env=True)
            self._headers = {
                'Authorization': f'Bearer {self.config.api_token}',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'FalconX-Leadership-Engine'
            }

    def set_token(self, api_token: str, email: Optional[str] = None):
        """Update credentials and refresh the auth header on the live client.

        _get() sends self._headers, which initialize() builds only once — so
        mutating config.api_token alone leaves a stale Authorization header.
        """
        self.config.api_token = api_token
        if email:
            self.config.email = email
        if self._headers:
            self._headers['Authorization'] = f'Bearer {api_token}'

    async def _get(self, endpoint: str, params: Dict = None) -> Dict[str, Any]:
        """Internal GET helper with detailed logging"""
        if not self._client:
            logger.info("   - HTTP client not initialized, initializing now...")
            await self.initialize()
        
        # Handle full URLs vs endpoints
        url = endpoint if endpoint.startswith('http') else f"{self.config.base_url}{endpoint}"
        
        logger.debug(f"   - Making GET request to: {url}")
        if params:
            logger.debug(f"   - Query params: {params}")
        
        try:
            response = await self._client.get(url, headers=self._headers, params=params)
            logger.debug(f"   - Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.debug(f"   - Response data keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
                return data
            elif response.status_code == 401:
                logger.error(f"❌ GitHub API authentication failed (401)")
                logger.error(f"   - Check if GITHUB_TOKEN is valid and has required permissions")
                logger.error(f"   - Response: {response.text[:200]}")
                return {}
            elif response.status_code == 403:
                logger.error(f"❌ GitHub API forbidden (403)")
                logger.error(f"   - Token may not have required permissions")
                logger.error(f"   - Response: {response.text[:200]}")
                return {}
            elif response.status_code == 404:
                logger.warning(f"⚠️ GitHub API endpoint not found (404): {url}")
                return {}
            else:
                logger.error(f"❌ GitHub API error {response.status_code}: {response.text[:500]}")
                return {}
        except httpx.TimeoutException as e:
            logger.error(f"❌ GitHub API request timeout: {e}")
            logger.error(f"   - URL: {url}")
            return {}
        except httpx.ConnectError as e:
            logger.error(f"❌ GitHub API connection error: {e}")
            logger.error(f"   - URL: {url}")
            logger.error(f"   - Check network connectivity and base_url configuration")
            return {}
        except Exception as e:
            logger.error(f"❌ GitHub API request failed: {e}")
            logger.error(f"   - Error type: {type(e).__name__}")
            logger.error(f"   - URL: {url}")
            import traceback
            logger.debug(f"   - Traceback: {traceback.format_exc()}")
            return {}

    async def get_status(self) -> Dict[str, Any]:
        """Check connection status - only logs errors to reduce log clutter"""
        # Only log errors, not successful status checks (to reduce log clutter)
        try:
            if not self.config.api_token:
                return {"connected": False, "error": "No GitHub token configured"}
            if not self._client:
                await self.initialize()
            data = await self._get("/user")
            if data:
                # Only log on success if explicitly requested (e.g., manual status check)
                # For periodic checks, return silently to reduce log clutter
                return {
                    "connected": True, 
                    "user": data.get("login"),
                    "email": self.config.email,
                    "config": {
                        "org": self.config.org,
                        "base_url": self.config.base_url,
                        "verify_ssl": self.config.verify
                    }
                }
            else:
                logger.warning("⚠️ GitHub connection failed: Invalid credentials or no user data returned.")
                return {"connected": False, "error": "Invalid credentials or no user data returned"}
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ GitHub API HTTP error during status check: {e.response.status_code} - {e.response.text}", exc_info=True)
            return {"connected": False, "error": f"API error: {e.response.status_code} - {e.response.text}"}
        except httpx.RequestError as e:
            logger.error(f"❌ GitHub network error during status check: {e}", exc_info=True)
            return {"connected": False, "error": f"Network error: {e}"}
        except Exception as e:
            logger.error(f"❌ Unexpected error during GitHub status check: {e}", exc_info=True)
            return {"connected": False, "error": str(e)}

    async def _get_all_pages(self, endpoint: str, params: Dict = None, max_pages: int = 20) -> List[Dict]:
        """Paginate through all pages of a GitHub list endpoint (follows Link headers)."""
        if not self._client:
            await self.initialize()
        all_items: List[Dict] = []
        url = endpoint if endpoint.startswith('http') else f"{self.config.base_url}{endpoint}"
        page_params = {**(params or {}), "per_page": 100}
        for _ in range(max_pages):
            try:
                response = await self._client.get(url, headers=self._headers, params=page_params)
                if response.status_code != 200:
                    break
                data = response.json()
                if isinstance(data, list):
                    all_items.extend(data)
                    if len(data) < 100:
                        break  # Last page
                    # Follow Link: next header
                    link_header = response.headers.get("Link", "")
                    next_url = None
                    for part in link_header.split(","):
                        if 'rel="next"' in part:
                            next_url = part.split(";")[0].strip().strip("<>")
                            break
                    if not next_url:
                        break
                    url = next_url
                    page_params = {}  # URL already has params encoded
                else:
                    break
            except Exception as e:
                logger.error(f"❌ Pagination error: {e}")
                break
        return all_items

    async def _list_org_repos(self, org: str, max_pages: int = 20) -> Dict[str, Any]:
        """Fetch all repos for one org, distinguishing a SAML-SSO block from an empty org.

        Unlike _get_all_pages (which silently breaks on any non-200), this inspects the
        status/body so a 403 'organization SAML enforcement' can be surfaced to the caller
        instead of vanishing into an empty list.

        Returns {"repos": [...raw...], "saml_blocked": bool, "status": int|None}.
        """
        if not self._client:
            await self.initialize()
        url = f"{self.config.base_url}/orgs/{org}/repos"
        params: Dict = {"type": "all", "sort": "updated", "per_page": 100}
        items: List[Dict] = []
        saml_blocked = False
        last_status: Optional[int] = None
        for _ in range(max_pages):
            try:
                resp = await self._client.get(url, headers=self._headers, params=params)
            except Exception as e:
                logger.error(f"❌ Org repos request failed for '{org}': {e}")
                break
            last_status = resp.status_code
            if resp.status_code == 403:
                body = (resp.text or "").lower()
                if "saml" in body or "single sign-on" in body or "single-sign-on" in body:
                    saml_blocked = True
                    logger.warning(f"⚠️ Org '{org}' is SAML-protected; token is not SSO-authorized for it.")
                else:
                    logger.warning(f"⚠️ Org '{org}' repos returned 403 (token lacks access).")
                break
            if resp.status_code != 200:
                logger.warning(f"⚠️ Org '{org}' repos returned HTTP {resp.status_code}.")
                break
            data = resp.json()
            if not isinstance(data, list):
                break
            items.extend(data)
            if len(data) < 100:
                break
            link_header = resp.headers.get("Link", "")
            next_url = None
            for part in link_header.split(","):
                if 'rel="next"' in part:
                    next_url = part.split(";")[0].strip().strip("<>")
                    break
            if not next_url:
                break
            url = next_url
            params = {}
        return {"repos": items, "saml_blocked": saml_blocked, "status": last_status}

    async def list_repositories(self, per_page: int = 100) -> Dict[str, Any]:
        """List every repository visible to the token: the user's own repos plus the repos
        of every org the user belongs to (configured org first). Orgs whose repos are blocked
        by SAML SSO are reported in `sso_required_orgs` so the UI can prompt the user to
        authorize the token, rather than silently showing only the user's own repos."""
        def _parse(raw_list: Any) -> List[Dict]:
            if not isinstance(raw_list, list):
                return []
            result = []
            for repo in raw_list:
                if not isinstance(repo, dict):
                    continue
                result.append({
                    "id": repo.get("id"),
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "private": repo.get("private", False),
                    "owner": repo.get("owner", {}).get("login"),
                    "html_url": repo.get("html_url"),
                    "default_branch": repo.get("default_branch"),
                })
            return result

        try:
            repos: List[Dict] = []
            seen: set = set()
            sso_required_orgs: List[str] = []

            # 1. Build the org list: the configured org first, then every org the user
            #    is a member of — so we are not limited to one hardcoded org.
            org_list: List[str] = []
            if self.config.org:
                org_list.append(self.config.org)
            user_orgs_raw = await self._get("/user/orgs", {"per_page": 100})
            if isinstance(user_orgs_raw, list):
                for o in user_orgs_raw:
                    login = o.get("login") if isinstance(o, dict) else None
                    if login:
                        org_list.append(login)
            org_list = list(dict.fromkeys(org_list))  # de-dupe, preserve order

            # 2. Fetch each org's repos, recording which ones are blocked by SAML SSO.
            for org in org_list:
                res = await self._list_org_repos(org)
                for r in _parse(res["repos"]):
                    if r["full_name"] not in seen:
                        seen.add(r["full_name"])
                        repos.append(r)
                if res["saml_blocked"]:
                    sso_required_orgs.append(org)
            if repos:
                logger.info(f"✅ Fetched {len(repos)} org repos across {len(org_list)} org(s)")

            # 3. Paginate through the user's own repos.
            #    NOTE: GitHub rejects `type` combined with `affiliation` (422), so
            #    only affiliation is sent here.
            user_raw = await self._get_all_pages(
                "/user/repos",
                params={"sort": "updated", "affiliation": "owner,collaborator,organization_member"}
            )
            for r in _parse(user_raw):
                if r["full_name"] not in seen:
                    seen.add(r["full_name"])
                    repos.append(r)

            notice = None
            if sso_required_orgs:
                notice = (
                    f"Repos from {len(sso_required_orgs)} organization(s) are hidden because this token "
                    f"isn't authorized for their SAML SSO: {', '.join(sso_required_orgs)}. "
                    f"Authorize it at GitHub → Settings → Developer settings → Personal access tokens "
                    f"→ (your token) → Configure SSO, then click Refresh repos."
                )

            if not repos:
                return {
                    "success": False,
                    "repos": [],
                    "sso_required_orgs": sso_required_orgs,
                    "error": notice or (
                        f"No repositories visible. Check the token scopes (repo, read:org) and authorize "
                        f"the token for SAML SSO (GitHub → token settings → Configure SSO)."
                    ),
                }

            logger.info(f"✅ Total repos available: {len(repos)}")
            return {"success": True, "repos": repos, "sso_required_orgs": sso_required_orgs, "notice": notice}
        except Exception as e:
            logger.error(f"❌ Failed to list repositories: {e}", exc_info=True)
            return {"success": False, "repos": [], "error": str(e)}

    async def get_first_action_date(self, repo: str) -> Dict[str, Any]:
        """Return the date of the repo's very first (oldest) GitHub Actions run plus the
        total run count. Found via the last page of the runs list (runs come newest-first,
        so the last item of the last page is the oldest). Used to default the date filter's
        from-date per repo."""
        owner_repo = repo if "/" in repo else f"{self.config.org}/{repo}"
        first = await self._get(f"/repos/{owner_repo}/actions/runs", {"per_page": 1})
        total = first.get("total_count", 0) if isinstance(first, dict) else 0
        if not total:
            return {"first_run_date": None, "total_count": 0}
        # Fetch the LAST page with per_page=100 so the page number stays small (ceil(total/100))
        # and we don't hit GitHub's pagination-depth ceiling on high-volume repos. Runs come
        # newest-first, so the oldest run is the LAST item on the last page.
        per_page = 100
        last_page = (total + per_page - 1) // per_page
        last = await self._get(f"/repos/{owner_repo}/actions/runs", {"per_page": per_page, "page": last_page})
        runs = last.get("workflow_runs", []) if isinstance(last, dict) else []
        return {"first_run_date": runs[-1].get("created_at") if runs else None, "total_count": total}

    @staticmethod
    def _date_span_days(from_date: str, to_date: str) -> int:
        try:
            a = datetime.strptime(from_date, '%Y-%m-%d')
            b = datetime.strptime(to_date, '%Y-%m-%d')
            return max(1, (b - a).days + 1)  # clamp so from>to never yields <=0
        except Exception:
            return 1

    async def _paginate_runs(self, endpoint: str, params: Dict, max_runs: int) -> Tuple[List[Dict], bool]:
        """Page through the workflow_runs list up to max_runs. Returns (runs, truncated)."""
        if not self._client:
            await self.initialize()
        url = f"{self.config.base_url}{endpoint}"
        page_params = {**params, "per_page": 100, "page": 1}
        out: List[Dict] = []
        truncated = False
        for _ in range(50):  # hard cap: 50 pages * 100 = 5000 runs
            try:
                resp = await self._client.get(url, headers=self._headers, params=page_params)
            except Exception as e:
                logger.error(f"❌ runs pagination error: {e}")
                break
            if resp.status_code != 200:
                break
            try:
                body = resp.json()
            except Exception:
                break
            chunk = body.get("workflow_runs", []) if isinstance(body, dict) else []
            out.extend(chunk)
            if len(out) >= max_runs:
                out = out[:max_runs]
                truncated = True
                break
            if len(chunk) < 100:
                break
            page_params = {**page_params, "page": page_params["page"] + 1}
        return out, truncated

    async def get_workflow_runs(self, repo: str, days: int = 30, workflow: Optional[str] = None,
                                from_date: Optional[str] = None, to_date: Optional[str] = None,
                                paginate: bool = False, max_runs: int = 2000) -> Dict[str, Any]:
        """Get automation run stats for a repo over a date window.

        Date window: explicit from_date/to_date (YYYY-MM-DD) take precedence, else the last
        `days` days. When paginate is True, ALL runs in the window are fetched (up to max_runs)
        and returned in `runs`; otherwise a single page (<=100) is fetched and the top 10
        returned — the all-repos overview uses the fast single-page path."""
        owner_repo = repo if "/" in repo else f"{self.config.org}/{repo}"
        endpoint = (f"/repos/{owner_repo}/actions/workflows/{workflow}/runs" if workflow
                    else f"/repos/{owner_repo}/actions/runs")

        # Build the `created` filter and the effective span (days) for rate math.
        if from_date and to_date:
            created = f"{from_date}..{to_date}"
            span_days = self._date_span_days(from_date, to_date)
        elif from_date:
            created = f">={from_date}"
            span_days = self._date_span_days(from_date, datetime.now().strftime('%Y-%m-%d'))
        else:
            since_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
            created = f">{since_date}"
            span_days = max(1, days)
        params = {"created": created}

        truncated = False
        if paginate:
            runs, truncated = await self._paginate_runs(endpoint, params, max_runs)
        else:
            data = await self._get(endpoint, {**params, "per_page": 100})
            runs = data.get("workflow_runs", []) if isinstance(data, dict) else []

        total = len(runs)
        successful = sum(1 for r in runs if r.get('conclusion') == 'success')
        failed = sum(1 for r in runs if r.get('conclusion') == 'failure')

        # Per-workflow breakdown (over ALL fetched runs).
        by_wf: Dict[str, Dict[str, Any]] = {}
        for r in runs:
            name = r.get('name') or r.get('workflow_id') or 'Unknown'
            w = by_wf.setdefault(str(name), {"name": str(name), "total": 0, "successful": 0, "failed": 0})
            w["total"] += 1
            if r.get('conclusion') == 'success':
                w["successful"] += 1
            elif r.get('conclusion') == 'failure':
                w["failed"] += 1
        by_workflow = sorted(by_wf.values(), key=lambda x: x["total"], reverse=True)
        for w in by_workflow:
            w["success_rate"] = (w["successful"] / w["total"] * 100) if w["total"] else 0

        # paginate -> return ALL runs; else top 10. Slim to the fields the UI renders so the
        # payload stays small even with thousands of runs.
        out_runs = runs if paginate else runs[:10]
        slim = [{
            "id": r.get("id"),
            "name": r.get("name"),
            "status": r.get("status"),
            "conclusion": r.get("conclusion"),
            "created_at": r.get("created_at"),
            "html_url": r.get("html_url"),
        } for r in out_runs]

        return {
            "repo": repo,
            "days": span_days,
            "from": from_date,
            "to": to_date,
            "total_runs": total,
            "successful": successful,
            "failed": failed,
            "success_rate": (successful / total * 100) if total > 0 else 0,
            "avg_runs_per_day": round(total / span_days, 2) if span_days > 0 else 0,
            "by_workflow": by_workflow,
            "runs": slim,
            "truncated": truncated,
        }

    async def get_run_jobs_batch(self, repo: str, run_ids: List[int]) -> Dict[str, Any]:
        """Per-run job pass/fail counts for a batch of run IDs — used to lazily enrich the
        currently visible page of the runs table (bounded by page size, not total runs)."""
        import asyncio
        owner_repo = repo if "/" in repo else f"{self.config.org}/{repo}"

        async def one(run_id: int) -> Tuple[str, Dict[str, int]]:
            jdata = await self._get(f"/repos/{owner_repo}/actions/runs/{run_id}/jobs", {"per_page": 100})
            jobs = jdata.get("jobs", []) if isinstance(jdata, dict) else []
            return str(run_id), {
                "jobs_total": len(jobs),
                "jobs_passed": sum(1 for j in jobs if j.get("conclusion") == "success"),
                "jobs_failed": sum(1 for j in jobs if j.get("conclusion") == "failure"),
            }

        results = await asyncio.gather(*[one(rid) for rid in run_ids[:100]], return_exceptions=True)
        out: Dict[str, Any] = {}
        for res in results:
            if isinstance(res, tuple):
                out[res[0]] = res[1]
        return out

    async def get_recent_prs(self, repo: str, state: str = "all", per_page: int = 20) -> Dict[str, Any]:
        """Get recent pull requests for a repository"""
        owner_repo = repo if "/" in repo else f"{self.config.org}/{repo}"
        endpoint = f"/repos/{owner_repo}/pulls"
        params = {"state": state, "per_page": per_page, "sort": "updated", "direction": "desc"}
        data = await self._get(endpoint, params)
        if not isinstance(data, list):
            return {"prs": [], "total": 0}
        prs = []
        for pr in data:
            body = pr.get("body") or ""
            prs.append({
                "id": pr.get("number"),
                "title": pr.get("title", "Untitled"),
                "author": pr.get("user", {}).get("login", ""),
                "author_avatar": pr.get("user", {}).get("avatar_url", ""),
                "state": pr.get("state", "open"),
                "merged": pr.get("merged_at") is not None,
                "draft": pr.get("draft", False),
                "head_branch": pr.get("head", {}).get("ref", ""),
                "base_branch": pr.get("base", {}).get("ref", "main"),
                "created_at": pr.get("created_at"),
                "updated_at": pr.get("updated_at"),
                "merged_at": pr.get("merged_at"),
                "html_url": pr.get("html_url", ""),
                "comments": pr.get("comments", 0),
                "review_comments": pr.get("review_comments", 0),
                "labels": [l.get("name") for l in (pr.get("labels") or [])],
                "body_preview": body[:300].strip() if body else "",
            })
        return {"prs": prs, "total": len(prs)}

    async def get_repo_detail(self, repo: str) -> Dict[str, Any]:
        """
        Fetch enriched details for a single repo:
        - Last PR merged to default branch (main/master)
        - Branches active in the last 7 days with commit counts
        - Open PRs with body preview
        """
        import asyncio
        owner_repo = repo if "/" in repo else f"{self.config.org}/{repo}"
        since_week = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')

        # ── Run all independent initial fetches in parallel ───────────────────
        results_initial = await asyncio.gather(
            self._get(f"/repos/{owner_repo}"),
            self._get_all_pages(f"/repos/{owner_repo}/pulls",
                      params={"state": "closed", "sort": "updated", "direction": "desc"},
                      max_pages=1),
            self._get(f"/repos/{owner_repo}/branches", params={"per_page": 100}),
            self._get_all_pages(f"/repos/{owner_repo}/pulls",
                      params={"state": "open", "sort": "updated", "direction": "desc"},
                      max_pages=1),
            return_exceptions=True,
        )
        repo_info      = results_initial[0] if not isinstance(results_initial[0], Exception) else {}
        merged_prs_raw = results_initial[1] if not isinstance(results_initial[1], Exception) else []
        branches_raw   = results_initial[2] if not isinstance(results_initial[2], Exception) else []
        open_prs_raw   = results_initial[3] if not isinstance(results_initial[3], Exception) else []

        default_branch = repo_info.get("default_branch", "main") if isinstance(repo_info, dict) else "main"

        # ── Last PR merged to default branch ──────────────────────────────────
        last_merged_pr = None
        if isinstance(merged_prs_raw, list):
            for pr in merged_prs_raw:
                if pr.get("merged_at") and pr.get("base", {}).get("ref") == default_branch:
                    last_merged_pr = {
                        "id": pr.get("number"),
                        "title": pr.get("title", ""),
                        "author": pr.get("user", {}).get("login", ""),
                        "author_avatar": pr.get("user", {}).get("avatar_url", ""),
                        "merged_at": pr.get("merged_at"),
                        "head_branch": pr.get("head", {}).get("ref", ""),
                        "html_url": pr.get("html_url", ""),
                        "body_preview": (pr.get("body") or "")[:200].strip(),
                    }
                    break

        # ── Active branches (last 7 days) ─────────────────────────────────────
        # GitHub Branches API only returns commit.sha + commit.url (NOT commit.author.date).
        # To get dates and commit counts we query commits?sha=<branch>&since=<week_ago>
        # for the top 10 branches in parallel with a generous timeout.
        active_branches: List[Dict] = []
        if isinstance(branches_raw, list):
            branch_names = [b.get("name", "") for b in branches_raw if b.get("name")][:10]
            protected_map = {b.get("name", ""): b.get("protected", False) for b in branches_raw}

            async def fetch_branch_activity(name: str) -> Optional[Dict]:
                try:
                    commits = await asyncio.wait_for(
                        self._get(
                            f"/repos/{owner_repo}/commits",
                            params={"sha": name, "since": since_week, "per_page": 100},
                        ),
                        timeout=15.0,
                    )
                except asyncio.TimeoutError:
                    return None
                if not isinstance(commits, list) or len(commits) == 0:
                    return None
                # The commits API returns full commit objects with commit.author.date
                last_date = commits[0].get("commit", {}).get("author", {}).get("date", "")
                last_sha  = commits[0].get("sha", "")[:7]
                return {
                    "name": name,
                    "commits_this_week": len(commits),
                    "last_commit_date": last_date,
                    "last_commit_sha": last_sha,
                    "protected": protected_map.get(name, False),
                }

            try:
                results = await asyncio.wait_for(
                    asyncio.gather(*[fetch_branch_activity(n) for n in branch_names], return_exceptions=True),
                    timeout=20.0,
                )
                active_branches = [r for r in results if isinstance(r, dict)]
                active_branches.sort(key=lambda x: x["commits_this_week"], reverse=True)
            except asyncio.TimeoutError:
                logger.warning(f"Branch activity fetch timed out for {owner_repo}, continuing without branch data")

        # ── Open PRs with body ────────────────────────────────────────────────
        open_prs = []
        if isinstance(open_prs_raw, list):
            for pr in open_prs_raw:
                body = pr.get("body") or ""
                open_prs.append({
                    "id": pr.get("number"),
                    "title": pr.get("title", ""),
                    "author": pr.get("user", {}).get("login", ""),
                    "author_avatar": pr.get("user", {}).get("avatar_url", ""),
                    "draft": pr.get("draft", False),
                    "head_branch": pr.get("head", {}).get("ref", ""),
                    "base_branch": pr.get("base", {}).get("ref", default_branch),
                    "created_at": pr.get("created_at"),
                    "updated_at": pr.get("updated_at"),
                    "html_url": pr.get("html_url", ""),
                    "comments": pr.get("comments", 0),
                    "review_comments": pr.get("review_comments", 0),
                    "labels": [l.get("name") for l in (pr.get("labels") or [])],
                    "body_preview": body[:400].strip() if body else "",
                })

        # ── PR merge velocity (from the closed PRs already fetched above) ─────
        merge_stats: Dict[str, Any] = {
            "merged_total": 0, "merged_last_7d": 0, "merged_last_30d": 0, "avg_hours_to_merge": None,
        }
        if isinstance(merged_prs_raw, list):
            now = datetime.now()
            ttm_hours: List[float] = []
            for pr in merged_prs_raw:
                if not isinstance(pr, dict) or not pr.get("merged_at"):
                    continue
                merge_stats["merged_total"] += 1
                try:
                    merged_at  = datetime.strptime(pr["merged_at"], "%Y-%m-%dT%H:%M:%SZ")
                    created_at = datetime.strptime(pr.get("created_at", ""), "%Y-%m-%dT%H:%M:%SZ")
                    hrs = (merged_at - created_at).total_seconds() / 3600.0
                    if hrs >= 0:
                        ttm_hours.append(hrs)
                    age_days = (now - merged_at).total_seconds() / 86400.0
                    if age_days <= 7:
                        merge_stats["merged_last_7d"] += 1
                    if age_days <= 30:
                        merge_stats["merged_last_30d"] += 1
                except (ValueError, TypeError):
                    continue
            if ttm_hours:
                merge_stats["avg_hours_to_merge"] = round(sum(ttm_hours) / len(ttm_hours), 1)

        return {
            "repo": owner_repo,
            "default_branch": default_branch,
            "last_merged_pr": last_merged_pr,
            "active_branches": active_branches,
            "open_prs": open_prs,
            "merge_stats": merge_stats,
        }

    async def search_issues_and_prs(self, query: str, use_semantic: bool = True) -> List[Dict[str, Any]]:
        """
        Search for issues and PRs based on natural language
        Uses semantic search (RAG) if available, falls back to GitHub API search
        """
        # Try semantic search first if enabled
        if use_semantic:
            try:
                from services.github_rag_handler import get_github_rag_handler
                rag_handler = get_github_rag_handler()
                if rag_handler:
                    # First, get recent issues/PRs to search through
                    # GitHub search API for recent items
                    search_query = f"org:{self.config.org} sort:updated-desc"
                    data = await self._get("/search/issues", {"q": search_query, "per_page": 100})
                    recent_issues = data.get("items", [])
                    
                    if recent_issues:
                        # Use semantic search on recent issues
                        similar = await rag_handler.find_similar_issues(
                            query=query,
                            issues=recent_issues,
                            top_k=10
                        )
                        if similar:
                            logger.info(f"✅ Found {len(similar)} similar issues using semantic search")
                            return similar
            except Exception as rag_err:
                logger.warning(f"Semantic search for GitHub failed, falling back to API: {rag_err}")
        
        # Fallback to GitHub API search (keyword-based)
        search_query = f"org:{self.config.org} {query}"
        data = await self._get("/search/issues", {"q": search_query})
        return data.get("items", [])
