import os
import httpx
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

SALESFORCE_API_VERSION = "v59.0"

class SalesforceConfig:
    def __init__(self):
        self.instance_url = os.getenv("SALESFORCE_INSTANCE_URL", "").rstrip("/")
        self.client_id = os.getenv("SALESFORCE_CLIENT_ID", "")
        self.client_secret = os.getenv("SALESFORCE_CLIENT_SECRET", "")
        self.username = os.getenv("SALESFORCE_USERNAME", "")
        self.password = os.getenv("SALESFORCE_PASSWORD", "")  # password + security token appended

    def is_configured(self) -> bool:
        return all([
            self.instance_url,
            self.client_id,
            self.client_secret,
            self.username,
            self.password,
        ])


class SalesforceClient:
    """
    Client for interacting with Salesforce REST API.
    Uses OAuth 2.0 Username-Password flow.
    """

    def __init__(self, config: SalesforceConfig = None):
        self.config = config or SalesforceConfig()
        self._client: Optional[httpx.AsyncClient] = None
        self._access_token: Optional[str] = None

    async def initialize(self):
        """Initialize the HTTP client."""
        if not self._client:
            self._client = httpx.AsyncClient(timeout=30.0, verify=False)

    async def _authenticate(self) -> bool:
        """Obtain an OAuth 2.0 access token via username-password flow."""
        await self.initialize()
        token_url = f"{self.config.instance_url}/services/oauth2/token"
        payload = {
            "grant_type": "password",
            "client_id": self.config.client_id,
            "client_secret": self.config.client_secret,
            "username": self.config.username,
            "password": self.config.password,
        }
        try:
            response = await self._client.post(token_url, data=payload)
            if response.status_code == 200:
                data = response.json()
                self._access_token = data.get("access_token")
                # Salesforce may return a different instance_url in the token response
                returned_instance = data.get("instance_url")
                if returned_instance:
                    self.config.instance_url = returned_instance.rstrip("/")
                logger.info("✅ Salesforce OAuth token obtained successfully")
                return True
            else:
                logger.error(f"❌ Salesforce auth failed {response.status_code}: {response.text[:300]}")
                return False
        except Exception as e:
            logger.error(f"❌ Salesforce authentication error: {e}")
            return False

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    async def _query(self, soql: str) -> Dict[str, Any]:
        """Execute a SOQL query against the Salesforce REST API."""
        if not self._access_token:
            authenticated = await self._authenticate()
            if not authenticated:
                return {"records": [], "totalSize": 0, "done": True}

        url = f"{self.config.instance_url}/services/data/{SALESFORCE_API_VERSION}/query/"
        params = {"q": soql}
        try:
            response = await self._client.get(url, headers=self._headers(), params=params)
            if response.status_code == 401:
                # Token expired — re-authenticate once
                logger.info("🔄 Salesforce token expired, re-authenticating...")
                await self._authenticate()
                response = await self._client.get(url, headers=self._headers(), params=params)

            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"❌ Salesforce SOQL error {response.status_code}: {response.text[:300]}")
                return {"records": [], "totalSize": 0, "done": True}
        except httpx.TimeoutException:
            logger.error("❌ Salesforce API request timed out")
            return {"records": [], "totalSize": 0, "done": True}
        except Exception as e:
            logger.error(f"❌ Salesforce query error: {e}")
            return {"records": [], "totalSize": 0, "done": True}

    async def test_connection(self) -> Dict[str, Any]:
        """Test Salesforce connection. Returns {connected, instance_url, error?}."""
        if not self.config.is_configured():
            return {"connected": False, "error": "Salesforce credentials not configured"}
        authenticated = await self._authenticate()
        if not authenticated:
            return {"connected": False, "error": "Authentication failed — check credentials"}

        # Simple identity check
        try:
            url = f"{self.config.instance_url}/services/data/{SALESFORCE_API_VERSION}/"
            response = await self._client.get(url, headers=self._headers())
            if response.status_code == 200:
                return {
                    "connected": True,
                    "instance_url": self.config.instance_url,
                    "api_version": SALESFORCE_API_VERSION,
                }
            return {"connected": False, "error": f"API check failed: {response.status_code}"}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    async def get_cases(
        self,
        limit: int = 50,
        offset: int = 0,
        status_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetch Salesforce Cases ordered by CreatedDate descending.
        Optionally filter by Status (e.g., 'Open').
        """
        where_clause = f"WHERE Status = '{status_filter}'" if status_filter else ""
        soql = (
            f"SELECT Id, CaseNumber, Subject, Description, Status, Priority, "
            f"Origin, CreatedDate, LastModifiedDate, "
            f"Account.Name, Contact.Name "
            f"FROM Case {where_clause} "
            f"ORDER BY CreatedDate DESC "
            f"LIMIT {limit} OFFSET {offset}"
        )
        result = await self._query(soql)
        records = result.get("records", [])
        cases = []
        for r in records:
            cases.append({
                "id": r.get("Id"),
                "case_number": r.get("CaseNumber"),
                "subject": r.get("Subject") or "",
                "description": r.get("Description") or "",
                "status": r.get("Status") or "Unknown",
                "priority": r.get("Priority") or "Medium",
                "origin": r.get("Origin") or "",
                "created_date": r.get("CreatedDate"),
                "last_modified": r.get("LastModifiedDate"),
                "account_name": (r.get("Account") or {}).get("Name", ""),
                "contact_name": (r.get("Contact") or {}).get("Name", ""),
                # Classification fields — populated later by classifier
                "category": None,
                "confidence": None,
                "solution": None,
                "reasoning": None,
            })
        return cases

    async def get_case_by_id(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single Case by Salesforce record Id."""
        soql = (
            f"SELECT Id, CaseNumber, Subject, Description, Status, Priority, "
            f"Origin, CreatedDate, LastModifiedDate, Account.Name, Contact.Name "
            f"FROM Case WHERE Id = '{case_id}' LIMIT 1"
        )
        result = await self._query(soql)
        records = result.get("records", [])
        if not records:
            return None
        r = records[0]
        return {
            "id": r.get("Id"),
            "case_number": r.get("CaseNumber"),
            "subject": r.get("Subject") or "",
            "description": r.get("Description") or "",
            "status": r.get("Status") or "Unknown",
            "priority": r.get("Priority") or "Medium",
            "origin": r.get("Origin") or "",
            "created_date": r.get("CreatedDate"),
            "last_modified": r.get("LastModifiedDate"),
            "account_name": (r.get("Account") or {}).get("Name", ""),
            "contact_name": (r.get("Contact") or {}).get("Name", ""),
            "category": None,
            "confidence": None,
            "solution": None,
            "reasoning": None,
        }

    async def get_case_count(self, status_filter: Optional[str] = None) -> int:
        """Return total number of Cases (with optional status filter)."""
        where_clause = f"WHERE Status = '{status_filter}'" if status_filter else ""
        soql = f"SELECT COUNT() FROM Case {where_clause}"
        result = await self._query(soql)
        return result.get("totalSize", 0)
