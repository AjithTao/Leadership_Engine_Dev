import os
import httpx
import logging
from typing import Dict, List, Any, Optional
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

    async def list_repositories(self, per_page: int = 100) -> Dict[str, Any]:
        """List ALL repositories for the authenticated user and configured org (paginated)."""
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

            # 1. Paginate through ALL org repos
            if self.config.org:
                org_raw = await self._get_all_pages(
                    f"/orgs/{self.config.org}/repos",
                    params={"type": "all", "sort": "updated"}
                )
                for r in _parse(org_raw):
                    if r["full_name"] not in seen:
                        seen.add(r["full_name"])
                        repos.append(r)
                logger.info(f"✅ Fetched {len(repos)} repos from org '{self.config.org}'")

            # 2. Paginate through ALL user repos
            user_raw = await self._get_all_pages(
                "/user/repos",
                params={"type": "all", "sort": "updated", "affiliation": "owner,collaborator,organization_member"}
            )
            for r in _parse(user_raw):
                if r["full_name"] not in seen:
                    seen.add(r["full_name"])
                    repos.append(r)

            if not repos:
                return {"success": False, "repos": [], "error": "No repositories found. Check token permissions (needs repo/read:org scope)."}

            logger.info(f"✅ Total repos available: {len(repos)}")
            return {"success": True, "repos": repos}
        except Exception as e:
            logger.error(f"❌ Failed to list repositories: {e}", exc_info=True)
            return {"success": False, "repos": [], "error": str(e)}

    async def get_workflow_runs(self, repo: str, days: int = 30, workflow: Optional[str] = None) -> Dict[str, Any]:
        """Get automation run counts for a repo or specific workflow file/id"""
        # Calculate date window
        since_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        # Fetch runs
        # Allow callers to pass either "repo-name" or "owner/repo-name"
        owner_repo = repo if "/" in repo else f"{self.config.org}/{repo}"
        if workflow:
            # GitHub accepts workflow file name (e.g., is-smoke-dev.yml) or workflow id
            endpoint = f"/repos/{owner_repo}/actions/workflows/{workflow}/runs"
        else:
            endpoint = f"/repos/{owner_repo}/actions/runs"
        params = {
            "created": f">{since_date}",
            "per_page": 100
        }
        
        data = await self._get(endpoint, params)
        runs = data.get("workflow_runs", [])
        
        # Aggregate statistics
        total = len(runs)
        successful = sum(1 for r in runs if r.get('conclusion') == 'success')
        failed = sum(1 for r in runs if r.get('conclusion') == 'failure')
        
        return {
            "repo": repo,
            "total_runs": total,
            "successful": successful,
            "failed": failed,
            "success_rate": (successful / total * 100) if total > 0 else 0,
            "runs": runs[:10] # Return top 10 for display
        }

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

        return {
            "repo": owner_repo,
            "default_branch": default_branch,
            "last_merged_pr": last_merged_pr,
            "active_branches": active_branches,
            "open_prs": open_prs,
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
