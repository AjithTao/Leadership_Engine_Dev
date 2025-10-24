"""
Jira Client for interacting with Jira REST API
"""

import os
import json
import logging
import asyncio
from typing import Dict, List, Any, Optional
import httpx
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class JiraConfig:
    base_url: str
    email: str
    api_token: str
    board_id: Optional[str] = None

class JiraClient:
    """
    Jira REST API client for searching issues and managing projects
    """
    
    def __init__(self, config: JiraConfig):
        self.cfg = config
        self._client = None
        self._headers = None
        
    async def initialize(self):
        """Initialize the HTTP client"""
        if not self._client:
            self._client = httpx.AsyncClient(timeout=30.0)
            self._headers = {
                'Authorization': f'Basic {self._get_auth_string()}',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
    
    def _get_auth_string(self) -> str:
        """Get base64 encoded auth string"""
        import base64
        auth_string = f"{self.cfg.email}:{self.cfg.api_token}"
        return base64.b64encode(auth_string.encode()).decode()
    
    def _url(self, path: str) -> str:
        """Build full URL"""
        return f"{self.cfg.base_url.rstrip('/')}{path}"
    
    async def search(self, jql: str, max_results: int = 50, fields=None, start_at: int = 0, expand=None):
        """
        Search issues using the correct Jira REST API v3 endpoints
        """
        if not self._client:
            await self.initialize()

        # Use the new API v3 search/jql endpoint with GET
        try:
            url = f"{self.cfg.base_url.rstrip('/')}/rest/api/3/search/jql"
            params = {
                "jql": jql,
                "maxResults": max_results,
                "startAt": start_at
            }
            # Always specify fields to ensure we get results
            if fields:
                params["fields"] = ",".join(fields) if isinstance(fields, list) else fields
            else:
                # Use a comprehensive set of default fields
                params["fields"] = "key,summary,status,issuetype,assignee,project,created,updated,priority,description"
            if expand:
                params["expand"] = expand
                
            resp = await self._client.get(url, params=params, headers=self._headers)
            
            if resp.status_code == 200:
                data = resp.json()
                logger.info(f"Successfully used API v3 search/jql: {len(data.get('issues', []))} issues found")
                logger.info(f"Jira response structure: total={data.get('total')}, startAt={data.get('startAt')}, maxResults={data.get('maxResults')}")
                return data
            else:
                logger.error(f"[Jira] API v3 search/jql failed {resp.status_code}: {resp.text}")
                return {"issues": [], "total": 0}
                
        except Exception as e:
            logger.error(f"[Jira] API v3 search/jql failed: {e}")
            return {"issues": [], "total": 0}
    
    async def count(self, jql: str) -> int:
        """Get count of issues matching JQL"""
        try:
            result = await self.search(jql, max_results=1)
            if isinstance(result, dict):
                return result.get('total', 0)
            return 0
        except Exception as e:
            logger.error(f"Count query failed: {e}")
            return 0
    
    async def get_projects(self) -> List[Dict[str, Any]]:
        """Get all projects using the correct project endpoint"""
        try:
            url = self._url("/rest/api/3/project")
            response = await self._get_with_retry(url)
            result = response.json()
            
            # The /rest/api/3/project endpoint returns a list directly, not wrapped in 'values'
            projects = result if isinstance(result, list) else result.get('values', [])
            logger.info(f"Successfully used API v3 project endpoint: {len(projects)} projects found")
            return projects
            
        except Exception as e:
            logger.error(f"Failed to get projects: {e}")
            return []
    
    async def get_project_keys(self) -> List[str]:
        """Get list of project keys"""
        try:
            projects = await self.get_projects()
            return [project.get('key', '') for project in projects if project.get('key')]
        except Exception as e:
            logger.error(f"Failed to get project keys: {e}")
            return []
    
    async def _get_with_retry(self, url: str, max_retries: int = 3) -> httpx.Response:
        """Get with retry logic"""
        if not self._client:
            await self.initialize()
            
        for attempt in range(max_retries):
            try:
                response = await self._client.get(url, headers=self._headers)
                response.raise_for_status()
                return response
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                logger.warning(f"Attempt {attempt + 1} failed: {e}, retrying...")
                await asyncio.sleep(1)
    
    async def close(self):
        """Close the HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None
