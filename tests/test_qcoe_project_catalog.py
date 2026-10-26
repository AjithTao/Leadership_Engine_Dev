import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from services.qcoe_project_catalog import QcoeProjectCatalog, load_qcoe_project_catalog
from services.jira import JiraClient, JiraConfig

class StubResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)
    def json(self): return self._payload

class StubJiraClient(JiraClient):
    def __init__(self, base_url, responses):
        super().__init__(JiraConfig(base_url=base_url, email="test@example.com", api_token="token"))
        self._client = object()
        self.responses = list(responses)
        self.requests = []
    async def _get_with_auth(self, url, params=None):
        self.requests.append((url, params))
        return self.responses.pop(0)

class FakeJira:
    def __init__(self, projects): self.projects, self.calls = projects, 0
    async def get_qcoe_projects(self):
        self.calls += 1
        return self.projects

class QcoeProjectCatalogTests(unittest.TestCase):
    def setUp(self):
        self.raw = [
            {"id": "2", "key": "B", "name": "Beta", "projectCategory": {"id": "20", "name": "Payments"}},
            {"id": "1", "key": "A", "name": "Alpha", "projectCategory": {"id": "10", "name": "Data"}},
            {"id": "3", "key": "C", "name": "Categoryless"},
            {"id": "4", "key": "OLD", "name": "Archived", "archived": True, "projectCategory": {"id": "10", "name": "Data"}},
        ]
        self.catalog = QcoeProjectCatalog.from_jira_projects(self.raw)

    def test_groups_sorts_and_excludes_archived_projects(self):
        self.assertEqual(self.catalog.portfolio_names, ["Data", "Payments", "Uncategorized"])
        self.assertEqual(self.catalog.get_portfolio_projects("All"), ["A", "B", "C"])
        self.assertEqual(self.catalog.get_portfolio_projects("Uncategorized"), ["C"])
        response = self.catalog.as_response()
        self.assertEqual(response["total_projects"], 3)
        self.assertEqual(response["uncategorized_count"], 1)

    def test_resolves_category_and_project_key_case_insensitively(self):
        self.assertEqual(self.catalog.get_portfolio_projects("data"), ["A"])
        self.assertEqual(self.catalog.get_portfolio_projects("b"), ["B"])
        self.assertEqual(self.catalog.get_portfolio_for_project("c"), "Uncategorized")

    def test_builds_safe_jql_and_rejects_unknown_scopes(self):
        escaped = QcoeProjectCatalog.from_jira_projects([{"id": "1", "key": 'A"B', "name": "Escaped"}])
        self.assertEqual(escaped.build_project_jql('A"B'), 'project = "A\\"B"')
        with self.assertRaisesRegex(ValueError, "Unknown Jira portfolio or project key"):
            self.catalog.build_project_jql("Unknown")

    def test_signature_is_deterministic_and_changes_with_metadata(self):
        reordered = QcoeProjectCatalog.from_jira_projects(list(reversed(self.raw)))
        changed = QcoeProjectCatalog.from_jira_projects([
            {**project, "name": "Changed"} if project.get("key") == "A" else project for project in self.raw
        ])
        self.assertEqual(self.catalog.signature, reordered.signature)
        self.assertNotEqual(self.catalog.signature, changed.signature)

    def test_empty_catalog_is_a_clear_error(self):
        with self.assertRaisesRegex(ValueError, "no visible active projects"):
            QcoeProjectCatalog.from_jira_projects([])

    def test_loader_calls_jira_once(self):
        jira = FakeJira(self.raw)
        catalog = asyncio.run(load_qcoe_project_catalog(jira))
        self.assertEqual(jira.calls, 1)
        self.assertEqual(len(catalog.projects), 3)

class JiraProjectDiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_data_center_project_list_shape(self):
        client = StubJiraClient("https://jira.example.com", [StubResponse([{"id": "1", "key": "DC", "name": "DC"}])])
        projects = await client.get_qcoe_projects()
        self.assertEqual(projects[0]["key"], "DC")
        self.assertIn("/rest/api/2/project", client.requests[0][0])

    async def test_cloud_project_search_paginates(self):
        client = StubJiraClient("https://example.atlassian.net", [
            StubResponse({"values": [{"id": "1", "key": "A", "name": "A"}], "total": 2, "isLast": False}),
            StubResponse({"values": [{"id": "2", "key": "B", "name": "B"}], "total": 2, "isLast": True}),
        ])
        projects = await client.get_qcoe_projects()
        self.assertEqual([project["key"] for project in projects], ["A", "B"])
        self.assertEqual(client.requests[1][1]["startAt"], 1)
        self.assertIn("/rest/api/3/project/search", client.requests[0][0])

    async def test_discovery_http_error_is_not_silently_empty(self):
        client = StubJiraClient("https://jira.example.com", [StubResponse({"error": "denied"}, 403)])
        with self.assertRaisesRegex(RuntimeError, "project discovery failed"):
            await client.get_qcoe_projects()

if __name__ == "__main__": unittest.main()
