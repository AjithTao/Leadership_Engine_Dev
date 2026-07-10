"""
Tableau Server client for the Tableau REST API.

Signs in with a Personal Access Token (PAT) and exposes content listing and
view data export (CSV). Targets on-prem Tableau Server; VizQL Data Service
needs Server 2025.1+ so data pulls use the classic view-data CSV export,
which works on 2024.x.
"""

import csv
import io
import logging
import re
import time
from typing import Dict, List, Any, Optional
import httpx
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Known-good fallback for Tableau Server 2024.2; real version discovered at sign-in
DEFAULT_API_VERSION = "3.23"


@dataclass
class TableauConfig:
    server_url: str
    site_id: str  # site content URL segment, e.g. "CDKInternal"; "" = default site
    pat_name: str
    pat_secret: str


class TableauClient:
    """
    Tableau REST API client: PAT sign-in, view listing, view data export.
    """

    def __init__(self, config: TableauConfig):
        self.cfg = config
        self._client: Optional[httpx.AsyncClient] = None
        self._api_version = DEFAULT_API_VERSION
        self._auth_token: Optional[str] = None
        self._site_luid: Optional[str] = None
        # Sites can hold thousands of views (multiple pages per listing), so
        # cache the list briefly for find_view/get_views callers
        self._views_cache: Optional[List[Dict[str, Any]]] = None
        self._views_cache_at: float = 0.0
        self._views_cache_ttl_seconds = 300

    async def initialize(self):
        """Initialize the HTTP client"""
        if not self._client:
            self._client = httpx.AsyncClient(
                timeout=60.0,
                headers={"Accept": "application/json"},
            )

    def _url(self, path: str) -> str:
        return f"{self.cfg.server_url.rstrip('/')}/api/{self._api_version}{path}"

    def _site_url(self, path: str) -> str:
        return self._url(f"/sites/{self._site_luid}{path}")

    def _headers(self) -> Dict[str, str]:
        return {"X-Tableau-Auth": self._auth_token or ""}

    async def sign_in(self) -> bool:
        """Sign in with the PAT; stores the session token and site luid."""
        await self.initialize()
        try:
            # serverinfo is unauthenticated and available from API 3.4 on
            resp = await self._client.get(
                f"{self.cfg.server_url.rstrip('/')}/api/3.4/serverinfo"
            )
            if resp.status_code == 200:
                self._api_version = resp.json()["serverInfo"]["restApiVersion"]
        except Exception as e:
            logger.warning(f"Tableau serverinfo failed, using API {self._api_version}: {e}")

        payload = {
            "credentials": {
                "personalAccessTokenName": self.cfg.pat_name,
                "personalAccessTokenSecret": self.cfg.pat_secret,
                "site": {"contentUrl": self.cfg.site_id or ""},
            }
        }
        try:
            resp = await self._client.post(self._url("/auth/signin"), json=payload)
            if resp.status_code == 200:
                creds = resp.json()["credentials"]
                self._auth_token = creds["token"]
                self._site_luid = creds["site"]["id"]
                logger.info(
                    "✅ Tableau signed in (site '%s', luid %s)",
                    self.cfg.site_id or "default",
                    self._site_luid,
                )
                return True
            logger.error(
                f"❌ Tableau sign-in failed {resp.status_code}: {resp.text[:300]}"
            )
            return False
        except Exception as e:
            logger.error(f"❌ Tableau sign-in error: {e}")
            return False

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        """GET with one re-sign-in retry on session expiry (Tableau ~240 min)."""
        if not self._auth_token:
            if not await self.sign_in():
                raise RuntimeError("Tableau sign-in failed")
        resp = await self._client.get(url, headers=self._headers(), **kwargs)
        if resp.status_code == 401:
            logger.info("🔄 Tableau session expired, re-signing in...")
            if not await self.sign_in():
                raise RuntimeError("Tableau re-sign-in failed")
            resp = await self._client.get(url, headers=self._headers(), **kwargs)
        return resp

    async def validate_connection(self) -> Dict[str, Any]:
        """Validate credentials. Returns {success, message, views}."""
        if not await self.sign_in():
            return {
                "success": False,
                "message": "Tableau sign-in failed — check PAT name/secret and site",
            }
        try:
            resp = await self._get(self._site_url("/views"), params={"pageSize": 1})
            if resp.status_code == 200:
                total = (
                    resp.json().get("pagination", {}).get("totalAvailable", 0)
                )
                return {
                    "success": True,
                    "message": f"Connected to site '{self.cfg.site_id or 'default'}'",
                    "views": int(total),
                }
            return {
                "success": False,
                "message": f"Signed in but cannot list views (HTTP {resp.status_code})",
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def get_views(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        List all views on the site with their workbook names.
        Returns [{id, name, content_url, workbook_id, workbook_name}].
        """
        if (
            not force_refresh
            and self._views_cache is not None
            and time.time() - self._views_cache_at < self._views_cache_ttl_seconds
        ):
            return self._views_cache
        views: List[Dict[str, Any]] = []
        page = 1
        while True:
            resp = await self._get(
                self._site_url("/views"),
                params={
                    "pageSize": 1000,
                    "pageNumber": page,
                    "fields": "id,name,contentUrl,workbook.id,workbook.name",
                },
            )
            if resp.status_code != 200:
                logger.error(
                    f"❌ Tableau views query failed {resp.status_code}: {resp.text[:300]}"
                )
                break
            body = resp.json()
            for v in body.get("views", {}).get("view", []):
                views.append(
                    {
                        "id": v.get("id"),
                        "name": v.get("name"),
                        "content_url": v.get("contentUrl"),
                        "workbook_id": (v.get("workbook") or {}).get("id"),
                        "workbook_name": (v.get("workbook") or {}).get("name"),
                    }
                )
            total = int(body.get("pagination", {}).get("totalAvailable", 0))
            if page * 1000 >= total:
                break
            page += 1
        self._views_cache = views
        self._views_cache_at = time.time()
        return views

    @staticmethod
    def parse_view_url(url: str) -> Optional[Dict[str, str]]:
        """
        Extract workbook/view content-url segments from a browser URL like
        https://host/#/site/CDKInternal/views/<workbook>/<view>?:iid=1
        """
        m = re.search(r"/views/([^/?#]+)/([^/?#]+)", url or "")
        if not m:
            return None
        return {"workbook": m.group(1), "view": m.group(2)}

    async def find_view(
        self, workbook: str, view: str
    ) -> Optional[Dict[str, Any]]:
        """
        Find a view by the content-url segments used in browser URLs.
        A view's contentUrl is '<workbook>/sheets/<view>'.
        """
        target = f"{workbook}/sheets/{view}".lower()
        for v in await self.get_views():
            if (v.get("content_url") or "").lower() == target:
                return v
        return None

    async def get_view_data(
        self,
        view_id: str,
        filters: Optional[Dict[str, str]] = None,
        max_age_minutes: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Export a view's summary data as CSV and parse it.
        Returns {columns, rows, row_count}. `filters` maps field name -> value
        (applied as vf_ query params, same semantics as URL filters).
        """
        params: Dict[str, Any] = {}
        if max_age_minutes is not None:
            params["maxAge"] = max_age_minutes
        for field, value in (filters or {}).items():
            params[f"vf_{field}"] = value

        resp = await self._get(self._site_url(f"/views/{view_id}/data"), params=params)
        if resp.status_code != 200:
            raise RuntimeError(
                f"Tableau view data export failed (HTTP {resp.status_code}): {resp.text[:300]}"
            )
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = [dict(r) for r in reader]
        return {
            "columns": reader.fieldnames or [],
            "rows": rows,
            "row_count": len(rows),
        }

    async def get_status(self) -> Dict[str, Any]:
        """Live status check. Returns {connected, server_url, site, views, error?}."""
        try:
            validation = await self.validate_connection()
            if validation.get("success"):
                return {
                    "connected": True,
                    "server_url": self.cfg.server_url,
                    "site": self.cfg.site_id or "default",
                    "views": validation.get("views", 0),
                }
            return {"connected": False, "error": validation.get("message")}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    async def sign_out(self):
        """Invalidate the Tableau session server-side."""
        if self._client and self._auth_token:
            try:
                await self._client.post(
                    self._url("/auth/signout"), headers=self._headers()
                )
            except Exception:
                pass
            self._auth_token = None
            self._site_luid = None

    async def close(self):
        """Sign out and close the HTTP client"""
        await self.sign_out()
        if self._client:
            await self._client.aclose()
            self._client = None
