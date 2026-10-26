import httpx
import logging
from typing import Any, Dict, List, Optional


logger = logging.getLogger(__name__)


class ConfluenceConfig:
    def __init__(self, base_url: str, email: str, api_token: str):
        # Confluence Cloud base will typically be https://<site>.atlassian.net/wiki
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.api_token = api_token


class ConfluenceClient:
    def __init__(self, cfg: ConfluenceConfig):
        self.cfg = cfg
        self._client: Optional[httpx.AsyncClient] = None
        # Atlassian Cloud API tokens use Basic auth (email + token). Jira/
        # Confluence Data Center PATs generally use Bearer auth.
        self._use_bearer_auth = ".atlassian.net" not in self.cfg.base_url.lower()

    async def initialize(self):
        if not self._client:
            timeout = httpx.Timeout(30.0, read=30.0)
            # Don't use auth parameter - we'll add headers manually
            self._client = httpx.AsyncClient(timeout=timeout)

    async def close(self):
        if self._client:
            try:
                await self._client.aclose()
            except Exception:
                pass
            self._client = None

    def _headers(self) -> Dict[str, str]:
        """Get headers with appropriate authentication"""
        import base64
        headers = {"Accept": "application/json"}
        
        if self._use_bearer_auth:
            # Bearer auth for Personal Access Tokens (PAT)
            headers["Authorization"] = f"Bearer {self.cfg.api_token}"
        else:
            # Basic auth for API tokens (Cloud)
            auth_string = f"{self.cfg.email}:{self.cfg.api_token}"
            auth_b64 = base64.b64encode(auth_string.encode()).decode()
            headers["Authorization"] = f"Basic {auth_b64}"
        
        return headers

    async def _request_with_auth_fallback(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Make request with auth fallback: try Bearer first, then Basic"""
        if not self._client:
            await self.initialize()
        
        # Try with current auth method
        headers = kwargs.pop('headers', {})
        headers.update(self._headers())
        
        if method == 'GET':
            resp = await self._client.get(url, headers=headers, **kwargs)
        else:
            resp = await self._client.request(method, url, headers=headers, **kwargs)
        
        # Retry once with the alternate scheme. A 403 can also indicate that
        # the server rejected the authentication style rather than permissions.
        if resp.status_code in (401, 403):
            previous_auth = "Bearer" if self._use_bearer_auth else "Basic"
            self._use_bearer_auth = not self._use_bearer_auth
            logger.info(f"{previous_auth} auth failed, trying the alternate scheme...")
            headers.update(self._headers())
            if method == 'GET':
                resp = await self._client.get(url, headers=headers, **kwargs)
            else:
                resp = await self._client.request(method, url, headers=headers, **kwargs)
        
        return resp

    async def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search Confluence using CQL for full-text across pages."""
        if not self._client:
            await self.initialize()

        # Confluence Cloud search API
        url = f"{self.cfg.base_url}/rest/api/search"
        cql = f'text ~ "{query}"'
        params = {
            "cql": cql,
            "limit": str(limit),
        }
        try:
            resp = await self._request_with_auth_fallback('GET', url, params=params)
            resp.raise_for_status()
            data = resp.json()
            # Results contain content with id/type, and excerpt
            results = data.get("results", [])
            return results
        except Exception as e:
            logger.error(f"[Confluence] search failed: {e}")
            return []

    async def search_cql(self, cql: str, limit: int = 25) -> List[Dict[str, Any]]:
        """Run a raw CQL search with auth fallback; raises on HTTP errors."""
        url = f"{self.cfg.base_url}/rest/api/search"
        params = {"cql": cql, "limit": str(limit)}
        resp = await self._request_with_auth_fallback('GET', url, params=params)
        resp.raise_for_status()
        return resp.json().get("results", [])

    async def search_pages(self, title_query: str, space: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        """Search pages by title (CQL)."""
        if not self._client:
            await self.initialize()

        url = f"{self.cfg.base_url}/rest/api/search"
        # Build CQL string
        parts = ["type = page"]
        if title_query:
            parts.append(f'title ~ "{title_query}"')
        if space:
            parts.append(f'space = "{space}"')
        cql = " AND ".join(parts)
        params = {"cql": cql, "limit": str(limit)}
        try:
            resp = await self._request_with_auth_fallback('GET', url, params=params)
            resp.raise_for_status()
            return resp.json().get("results", [])
        except Exception as e:
            logger.error(f"[Confluence] search_pages failed: {e}")
            return []

    async def search_in_space(self, query: str, space: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for content within a specific space using comprehensive search strategies."""
        if not self._client:
            await self.initialize()

        url = f"{self.cfg.base_url}/rest/api/search"
        all_results = []
        seen_ids = set()
        
        # Strategy 1: Exact title match (highest priority)
        if query:
            try:
                parts_exact = ["type = page", f'space = "{space}"', f'title = "{query}"']
                cql_exact = " AND ".join(parts_exact)
                params_exact = {"cql": cql_exact, "limit": str(limit)}
                resp_exact = await self._request_with_auth_fallback('GET', url, params=params_exact)
                resp_exact.raise_for_status()
                exact_results = resp_exact.json().get("results", [])
                for result in exact_results:
                    content_id = result.get('content', {}).get('id') if isinstance(result.get('content'), dict) else None
                    if content_id and content_id not in seen_ids:
                        all_results.append(result)
                        seen_ids.add(content_id)
                logger.info(f"Exact title match found {len(exact_results)} results")
            except Exception as e:
                logger.debug(f"Exact title search failed: {e}")
        
        # Strategy 2: Title contains (high priority)
        if query and len(all_results) < limit:
            try:
                parts_title = ["type = page", f'space = "{space}"', f'title ~ "{query}"']
                cql_title = " AND ".join(parts_title)
                params_title = {"cql": cql_title, "limit": str(limit)}
                resp_title = await self._request_with_auth_fallback('GET', url, params=params_title)
                resp_title.raise_for_status()
                title_results = resp_title.json().get("results", [])
                for result in title_results:
                    content_id = result.get('content', {}).get('id') if isinstance(result.get('content'), dict) else None
                    if content_id and content_id not in seen_ids:
                        all_results.append(result)
                        seen_ids.add(content_id)
                        if len(all_results) >= limit:
                            break
                logger.info(f"Title contains search found {len(title_results)} results")
            except Exception as e:
                logger.debug(f"Title contains search failed: {e}")
        
        # Strategy 3: Full-text search (broader, lower priority)
        if query and len(all_results) < limit:
            try:
                parts_text = ["type = page", f'space = "{space}"', f'text ~ "{query}"']
                cql_text = " AND ".join(parts_text)
                params_text = {"cql": cql_text, "limit": str(limit * 2)}  # Get more to filter
                resp_text = await self._request_with_auth_fallback('GET', url, params=params_text)
                resp_text.raise_for_status()
                text_results = resp_text.json().get("results", [])
                for result in text_results:
                    content_id = result.get('content', {}).get('id') if isinstance(result.get('content'), dict) else None
                    if content_id and content_id not in seen_ids:
                        all_results.append(result)
                        seen_ids.add(content_id)
                        if len(all_results) >= limit:
                            break
                logger.info(f"Full-text search found {len(text_results)} results")
            except Exception as e:
                logger.debug(f"Full-text search failed: {e}")
        
        # Return top results, prioritizing exact matches
        return all_results[:limit]

    async def get_spaces(self, limit: int = 1) -> List[Dict[str, Any]]:
        """List Confluence spaces (used as a lightweight health check)."""
        if not self._client:
            await self.initialize()

        url = f"{self.cfg.base_url}/rest/api/space"
        params = {"limit": str(limit)}
        try:
            resp = await self._request_with_auth_fallback('GET', url, params=params)
            resp.raise_for_status()
            data = resp.json()
            # Cloud returns { results: [...] }, DC may vary
            return data.get("results", []) or data.get("spaces", []) or []
        except Exception as e:
            logger.error(f"[Confluence] get_spaces failed: {e}")
            return []

    async def validate_connection(self) -> Dict[str, Any]:
        """Validate credentials against an endpoint that requires a current user."""
        if not self._client:
            await self.initialize()

        url = f"{self.cfg.base_url}/rest/api/user/current"
        resp = await self._request_with_auth_fallback('GET', url)
        if resp.status_code != 200:
            body = (resp.text or "").strip()
            detail = "" if body.startswith("<") else f": {body[:200]}"
            return {
                "success": False,
                "status_code": resp.status_code,
                "message": f"Confluence authentication failed ({resp.status_code}){detail}",
            }

        user = resp.json()
        display_name = (
            user.get("displayName")
            or user.get("publicName")
            or user.get("username")
            or user.get("accountId")
            or "Confluence user"
        )
        return {"success": True, "user": display_name}

    @staticmethod
    def storage_html_to_text(storage_html: str) -> str:
        """
        Advanced HTML to text conversion for Confluence storage format.
        Properly handles: tables, lists, headings, code blocks, and nested structures.
        """
        try:
            import re, html as html_mod

            text = storage_html

            # --- Code blocks: preserve content with label ---
            text = re.sub(r'<ac:structured-macro[^>]*ac:name="code"[^>]*>(.*?)</ac:structured-macro>',
                          lambda m: '\n[CODE]\n' + re.sub(r'<[^>]+>', '', m.group(1)) + '\n[/CODE]\n',
                          text, flags=re.DOTALL | re.IGNORECASE)

            # --- Headings: h1-h6 with separator lines ---
            def heading_replace(m):
                level = int(m.group(1))
                content = re.sub(r'<[^>]+>', '', m.group(2)).strip()
                prefix = '#' * level
                return f"\n\n{prefix} {content}\n"
            text = re.sub(r'<h([1-6])[^>]*>(.*?)</h\1>', heading_replace, text, flags=re.DOTALL | re.IGNORECASE)

            # --- Tables: convert to readable grid ---
            # Table header rows
            text = re.sub(r'<th[^>]*>(.*?)</th>', lambda m: ' | ' + re.sub(r'<[^>]+>', '', m.group(1)).strip(), text, flags=re.DOTALL | re.IGNORECASE)
            # Table data cells
            text = re.sub(r'<td[^>]*>(.*?)</td>', lambda m: ' | ' + re.sub(r'<[^>]+>', '', m.group(1)).strip(), text, flags=re.DOTALL | re.IGNORECASE)
            # Table rows
            text = re.sub(r'<tr[^>]*>', '\n', text, flags=re.IGNORECASE)
            text = re.sub(r'</tr>', '', text, flags=re.IGNORECASE)
            # Strip table wrappers
            text = re.sub(r'</?t(?:able|head|body|foot)[^>]*>', '\n', text, flags=re.IGNORECASE)

            # --- Lists ---
            text = re.sub(r'<li[^>]*>(.*?)</li>', lambda m: '\n  - ' + re.sub(r'<[^>]+>', '', m.group(1)).strip(), text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'</?[uo]l[^>]*>', '\n', text, flags=re.IGNORECASE)

            # --- Paragraphs and line breaks ---
            text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
            text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
            text = re.sub(r'<p[^>]*>', '', text, flags=re.IGNORECASE)

            # --- Bold/italic: just strip tags (keep content) ---
            text = re.sub(r'<(?:strong|b|em|i|u|s)[^>]*>(.*?)</(?:strong|b|em|i|u|s)>', r'\1', text, flags=re.DOTALL | re.IGNORECASE)

            # --- Links: keep link text ---
            text = re.sub(r'<a[^>]*>(.*?)</a>', r'\1', text, flags=re.DOTALL | re.IGNORECASE)

            # --- Strip all remaining HTML tags ---
            text = re.sub(r'<[^>]+>', '', text)

            # --- Unescape HTML entities ---
            text = html_mod.unescape(text)

            # --- Normalize whitespace ---
            text = re.sub(r'[ \t]+', ' ', text)
            text = re.sub(r'\n[ \t]+', '\n', text)
            text = re.sub(r'\n{3,}', '\n\n', text)

            return text.strip()
        except Exception:
            return storage_html

    async def get_page(self, content_id: str) -> Optional[Dict[str, Any]]:
        """Get a Confluence page with comprehensive content including latest version."""
        if not self._client:
            await self.initialize()

        url = f"{self.cfg.base_url}/rest/api/content/{content_id}"
        # Expand all relevant fields for complete page data
        # body.storage: Full storage format (HTML)
        # body.view: View format (cleaner HTML)
        # version: Version info to ensure we have latest
        # space: Space metadata
        # metadata: Page metadata
        # children.page: Child pages if any
        params = {
            "expand": "body.storage,body.view,version,space,metadata,children.page",
            "status": "current"  # Only get current version, not historical
        }
        try:
            resp = await self._request_with_auth_fallback('GET', url, params=params)
            resp.raise_for_status()
            page_data = resp.json()
            
            # Log version info to ensure we're getting latest
            version_info = page_data.get('version', {})
            if version_info:
                logger.debug(f"Retrieved page {content_id} version {version_info.get('number')} (modified: {version_info.get('when')})")
            
            return page_data
        except Exception as e:
            logger.error(f"[Confluence] get_page failed for {content_id}: {e}")
            return None
    
    async def get_page_by_title(self, title: str, space: str) -> Optional[Dict[str, Any]]:
        """Get a Confluence page by exact title match - more reliable than search."""
        if not self._client:
            await self.initialize()
        
        # First search for exact title match
        results = await self.search_in_space(title, space, limit=1)
        
        if results:
            # Get the first result's content ID
            content_obj = results[0].get('content', {})
            content_id = content_obj.get('id') if isinstance(content_obj, dict) else None
            
            if content_id:
                # Fetch full page content
                return await self.get_page(content_id)
        
        return None
    
    async def get_all_spaces(self) -> List[Dict[str, Any]]:
        """Get all Confluence spaces (paginated)"""
        if not self._client:
            await self.initialize()
        
        all_spaces = []
        start = 0
        limit = 100  # Confluence API limit
        
        while True:
            url = f"{self.cfg.base_url}/rest/api/space"
            params = {
                "limit": str(limit),
                "start": str(start),
                "expand": "metadata"
            }
            try:
                resp = await self._request_with_auth_fallback('GET', url, params=params)
                resp.raise_for_status()
                data = resp.json()
                spaces = data.get("results", []) or data.get("spaces", [])
                
                if not spaces:
                    break
                
                all_spaces.extend(spaces)
                
                # Check if there are more results
                if len(spaces) < limit:
                    break
                
                start += limit
            except Exception as e:
                logger.error(f"[Confluence] get_all_spaces failed at start={start}: {e}")
                break
        
        logger.info(f"Retrieved {len(all_spaces)} Confluence spaces")
        return all_spaces
    
    async def get_all_pages_in_space(self, space_key: str) -> List[Dict[str, Any]]:
        """Get all pages from a specific space (paginated), including ancestors for hierarchy."""
        if not self._client:
            await self.initialize()

        all_pages = []
        start = 0
        limit = 100  # Confluence API limit

        while True:
            url = f"{self.cfg.base_url}/rest/api/content"
            params = {
                "spaceKey": space_key,
                "type": "page",
                "limit": str(limit),
                "start": str(start),
                # ancestors: gives full parent chain for breadcrumb building
                "expand": "body.storage,version,space,metadata,ancestors"
            }
            try:
                resp = await self._request_with_auth_fallback('GET', url, params=params)
                resp.raise_for_status()
                data = resp.json()
                pages = data.get("results", [])
                
                if not pages:
                    break
                
                all_pages.extend(pages)
                
                # Check if there are more results
                if len(pages) < limit:
                    break
                
                start += limit
                
                # Log progress for large spaces
                if start % 500 == 0:
                    logger.info(f"  Retrieved {len(all_pages)} pages from space {space_key}...")
                    
            except Exception as e:
                logger.error(f"[Confluence] get_all_pages_in_space failed for {space_key} at start={start}: {e}")
                break
        
        logger.info(f"Retrieved {len(all_pages)} pages from space {space_key}")
        return all_pages
    
    @staticmethod
    def extract_relevant_content(
        page_text: str,
        query: str,
        max_chars: int = 2500,
        date_filter: str = "",
        column_filter: str = "",
    ) -> str:
        """
        Extract the most query-relevant sections from a long Confluence page.

        Strategy:
        1. If date_filter is set, surface rows/lines containing that date first
           (critical for table_lookup queries like "which Jira ID Fixed on 03-19-2026")
        2. Split page into paragraphs/sections
        3. Score each section by query keyword overlap
        4. Return top-scoring sections up to max_chars

        Args:
            page_text:     Full plain-text content of the page
            query:         The user's search query
            max_chars:     Maximum characters to return
            date_filter:   Date string to prioritize (e.g. "03-19-2026")
            column_filter: Column name to boost (e.g. "Jira ID Fixed")

        Returns:
            Concatenated relevant sections, trimmed to max_chars
        """
        import re

        if not page_text or len(page_text) <= max_chars:
            return page_text

        # --- Priority: date-specific line extraction ---
        # For table-lookup queries the answer is usually on a single line/row.
        # Surfacing that line first ensures the LLM sees the relevant data even
        # when the page is truncated.
        if date_filter:
            # Build equivalent representations of the same date so we match
            # any common format the Confluence page might use:
            # e.g. "03-19-2026" also tried as "2026-03-19" and "03/19/2026"
            from datetime import datetime as _dt
            _date_variants = [date_filter]
            for _fmt_in in ("%m-%d-%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"):
                try:
                    _parsed = _dt.strptime(date_filter, _fmt_in).date()
                    _date_variants = list({
                        date_filter,
                        _parsed.strftime("%m-%d-%Y"),
                        _parsed.strftime("%Y-%m-%d"),
                        _parsed.strftime("%m/%d/%Y"),
                        _parsed.strftime("%d-%m-%Y"),
                        # Short forms: M/D/YY
                        str(_parsed.month) + "/" + str(_parsed.day) + "/" + str(_parsed.year)[-2:],
                    })
                    break
                except ValueError:
                    continue

            date_lines = [
                ln.strip() for ln in page_text.splitlines()
                if any(v in ln for v in _date_variants) and ln.strip()
            ]
            if date_lines:
                # Include surrounding context: grab header row (first non-empty line)
                # and the matching row(s).
                first_line = ""
                for ln in page_text.splitlines():
                    if ln.strip():
                        first_line = ln.strip()
                        break
                date_section = "\n".join(
                    ([first_line] if first_line and first_line not in date_lines else [])
                    + date_lines
                )
                # If the date section is small, append more context from the rest of the page
                remaining = max_chars - len(date_section) - 10
                if remaining > 200:
                    other_content = ConfluenceClient.extract_relevant_content(
                        page_text, query, max_chars=remaining
                    )
                    # Avoid duplicating the date lines
                    for dl in date_lines:
                        other_content = other_content.replace(dl, "")
                    return date_section + "\n\n" + other_content.strip()
                return date_section

        # Normalize query into keywords (ignore stop words)
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                      'would', 'could', 'should', 'may', 'might', 'can', 'in',
                      'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
                      'and', 'or', 'but', 'if', 'then', 'this', 'that', 'it',
                      'its', 'me', 'my', 'we', 'our', 'you', 'your'}
        query_words = set(
            w.lower() for w in re.findall(r'\w+', query)
            if w.lower() not in stop_words and len(w) > 2
        )
        # Also add column filter words if provided
        if column_filter:
            query_words.update(
                w.lower() for w in re.findall(r'\w+', column_filter)
                if len(w) > 2
            )

        # Split into chunks (paragraphs and sections)
        chunks = re.split(r'\n{2,}', page_text)

        # Score each chunk
        scored = []
        for chunk in chunks:
            chunk_stripped = chunk.strip()
            if not chunk_stripped:
                continue
            chunk_lower = chunk_stripped.lower()
            # Count keyword hits (weighted by frequency)
            score = sum(chunk_lower.count(word) for word in query_words)
            # Bonus for heading-like chunks (short, starts with #)
            if chunk_stripped.startswith('#') or (len(chunk_stripped) < 80 and chunk_stripped.endswith(':')):
                score += 2
            scored.append((score, chunk_stripped))

        # Sort by score descending, then reconstruct in original order preserving top sections
        if not scored:
            return page_text[:max_chars]

        # Pick top sections up to max_chars, preserving document order
        threshold = sorted(s for s, _ in scored)
        median_score = threshold[len(threshold) // 2] if threshold else 0

        # Take sections above median score, or if all zero, take first N chars
        relevant = [chunk for score, chunk in scored if score >= max(median_score, 1)]
        if not relevant:
            # Fallback: return beginning of page (intro usually has overview)
            return page_text[:max_chars]

        # Rebuild maintaining original paragraph order
        ordered = []
        remaining_chars = max_chars
        for score, chunk in scored:
            if chunk in relevant and remaining_chars > 0:
                ordered.append(chunk)
                remaining_chars -= len(chunk)
            if remaining_chars <= 0:
                break

        result = '\n\n'.join(ordered)
        if len(result) > max_chars:
            result = result[:max_chars] + "\n[... additional content available in full page ...]"
        return result

    async def get_all_pages(self, space_keys: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Get all pages from all spaces (or specified spaces)
        
        Args:
            space_keys: Optional list of space keys to index. If None, indexes all spaces.
        
        Returns:
            List of all pages from all spaces
        """
        if not self._client:
            await self.initialize()
        
        all_pages = []
        
        # Get spaces to index
        if space_keys:
            spaces_to_index = [{"key": key} for key in space_keys]
        else:
            spaces = await self.get_all_spaces()
            spaces_to_index = spaces
        
        logger.info(f"Indexing {len(spaces_to_index)} Confluence spaces...")
        
        for space in spaces_to_index:
            space_key = space.get("key") or space.get("name", "")
            if not space_key:
                continue
            
            try:
                pages = await self.get_all_pages_in_space(space_key)
                all_pages.extend(pages)
                logger.info(f"  Space {space_key}: {len(pages)} pages")
            except Exception as e:
                logger.error(f"Failed to get pages from space {space_key}: {e}")
                continue
        
        logger.info(f"✅ Retrieved {len(all_pages)} total pages from {len(spaces_to_index)} spaces")
        return all_pages

    async def build_space_hierarchy(
        self,
        space_key: str
    ) -> Dict[str, Any]:
        """
        Build a full parent-child hierarchy map for a Confluence space.

        Returns a dict keyed by page_id:
        {
            "page_id": {
                "title":     "GL Inquiry Workflow",
                "parent_id": "parent_page_id_or_None",
                "ancestors": [{"id": "...", "title": "..."}, ...],   # root → parent
                "children":  ["child_id_1", "child_id_2", ...]
            }
        }

        Uses the ancestors field fetched in get_all_pages_in_space() —
        no extra API calls needed.
        """
        pages = await self.get_all_pages_in_space(space_key)

        hierarchy: Dict[str, Any] = {}

        # First pass: populate every page with its ancestors
        for page in pages:
            page_id    = page.get("id", "")
            page_title = page.get("title", "Untitled")

            if not page_id:
                continue

            raw_ancestors = page.get("ancestors", []) or []
            # ancestors list from API is ordered root → immediate parent
            ancestor_info = [
                {"id": a.get("id", ""), "title": a.get("title", "")}
                for a in raw_ancestors
                if isinstance(a, dict) and a.get("id")
            ]

            parent_id = ancestor_info[-1]["id"] if ancestor_info else None

            hierarchy[page_id] = {
                "title":     page_title,
                "parent_id": parent_id,
                "ancestors": ancestor_info,
                "children":  [],         # populated in second pass
            }

        # Second pass: wire up children lists
        for page_id, info in hierarchy.items():
            parent_id = info.get("parent_id")
            if parent_id and parent_id in hierarchy:
                hierarchy[parent_id]["children"].append(page_id)

        root_pages = [pid for pid, info in hierarchy.items() if not info["parent_id"]]
        logger.info(
            f"[Hierarchy] Space {space_key}: {len(hierarchy)} pages, "
            f"{len(root_pages)} root pages"
        )
        return hierarchy

    async def build_full_hierarchy(
        self,
        space_keys: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Build a merged hierarchy map across all spaces (or specified spaces).
        Returns the same format as build_space_hierarchy() but for all spaces.
        """
        if space_keys:
            spaces_to_process = [{"key": k} for k in space_keys]
        else:
            spaces_to_process = await self.get_all_spaces()

        full_hierarchy: Dict[str, Any] = {}

        for space in spaces_to_process:
            sk = space.get("key") or space.get("name", "")
            if not sk:
                continue
            try:
                space_hier = await self.build_space_hierarchy(sk)
                full_hierarchy.update(space_hier)
            except Exception as e:
                logger.error(f"[Hierarchy] Failed for space {sk}: {e}")

        logger.info(f"[Hierarchy] Full hierarchy: {len(full_hierarchy)} total pages")
        return full_hierarchy


