import os
import sys
import types
import unittest


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

class DummyAsyncOpenAI:
    def __init__(self, *args, **kwargs):
        pass


openai_stub = types.ModuleType("openai")
openai_stub.AsyncOpenAI = DummyAsyncOpenAI
sys.modules.setdefault("openai", openai_stub)

from services.test_coverage_analyzer import CUMULATIVE_START, TestCoverageAnalyzer
from services.portfolio_mapping import build_project_jql, get_portfolio_projects


class FakeJiraClient:
    async def search(self, *args, **kwargs):
        return {"issues": [], "total": 0}


class TestCoverageJqlTests(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("OPENAI_API_KEY", "test-key")
        self.analyzer = TestCoverageAnalyzer(FakeJiraClient())

    def test_stories_with_tests_uses_resolved_dev_story_scope_and_any_linked_active_test(self):
        project_filter = 'project = "NDP"'
        jql = self.analyzer._stories_with_tests_jql(project_filter, "2026-01-14", "2026-03-13")

        self.assertIn('project = "NDP" AND issuetype = Story AND "Story Type" = Dev', jql)
        self.assertIn('status IN ("Accepted", "Blocked", "Done", "In Progress", "In Review", "Pending Approval", "Review", "Test", "Test Case Review", "Test Complete", "Todo")', jql)
        self.assertIn('resolved >= "2026-01-14" AND resolved <= "2026-03-13 23:59"', jql)
        self.assertIn(
            'issueFunction in linkedIssuesOf("issuetype = Test AND status NOT IN (Abandoned)")',
            jql,
        )

    def test_test_cases_use_one_common_linked_or_test_only_rule(self):
        project_filter = 'project = "NDP"'
        jql = self.analyzer._test_cases_jql(project_filter, "2026-01-14", "2026-04-03")

        self.assertIn('issuetype = Test AND status NOT IN (Abandoned) AND (', jql)
        self.assertIn(
            'linkedIssuesOf("project = \\"NDP\\" AND issuetype IN (Story, Bug, Defect) '
            "AND ((status = Accepted AND created >= '2026-01-14' AND created <= '2026-04-03 23:59') "
            "OR (status = Done AND resolved >= '2026-01-14' AND resolved <= '2026-04-03 23:59'))\"",
            jql,
        )
        self.assertIn(
            'project = "NDP" AND created >= "2026-01-14" AND created <= "2026-04-03 23:59" '
            'AND issueFunction not in linkedIssuesOf("issuetype IN (Story, Bug, Defect)")',
            jql,
        )

    def test_displayed_jql_uses_same_builders_as_executed_jql(self):
        project_filter = 'project = "NDP"'
        queries = self.analyzer._coverage_jql_queries(project_filter, "2026-01-14", "2026-03-13")

        self.assertEqual(
            queries,
            [
                f'Total Dev Stories: {self.analyzer._dev_stories_jql(project_filter, "2026-01-14", "2026-03-13")}',
                f'Test Cases (Story+Bug+Defect): {self.analyzer._test_cases_jql(project_filter, "2026-01-14", "2026-03-13")}',
                f'Dev Stories with Tests: {self.analyzer._stories_with_tests_jql(project_filter, "2026-01-14", "2026-03-13")}',
            ],
        )

    def test_cumulative_coverage_start_is_locked_to_2022(self):
        class RecordingCoverageAnalyzer(TestCoverageAnalyzer):
            def __init__(self, jira_client):
                super().__init__(jira_client)
                self.snapshot_calls = []

            async def _coverage_snapshot(self, project_filter, period_from, period_to):
                self.snapshot_calls.append((project_filter, period_from, period_to))
                return {
                    "from": period_from,
                    "to": period_to,
                    "week_ending": period_to,
                    "dev_stories": 1,
                    "total_stories": 1,
                    "test_cases": 1,
                    "test_cases_created": 1,
                    "tests_mapped": 1,
                    "total_test_cases": 1,
                    "stories_with_tests": 1,
                    "stories_without_tests": 0,
                    "coverage_percentage": 100.0,
                    "jql": "",
                    "jql_queries": [f"{period_from}->{period_to}"],
                }

            async def _generate_ai_analysis(self, *args, **kwargs):
                return "Analysis suppressed for test."

        analyzer = RecordingCoverageAnalyzer(FakeJiraClient())

        import asyncio
        result = asyncio.run(
            analyzer.compare_periods("NDP", "2026-04-01", "2026-04-03", "2026-04-01", "2026-04-10")
        )

        self.assertEqual(CUMULATIVE_START, "2022-01-01")
        self.assertEqual(result["table_b"]["period1"]["from"], "2022-01-01")
        self.assertEqual(result["table_b"]["period2"]["from"], "2022-01-01")
        self.assertIn(('project = "NDP"', "2022-01-01", "2026-04-03"), analyzer.snapshot_calls)
        self.assertIn(('project = "NDP"', "2022-01-01", "2026-04-10"), analyzer.snapshot_calls)

    def test_network_portfolio_name_resolves_to_jira_project_keys(self):
        projects = get_portfolio_projects("Network & Communication Services")

        self.assertEqual(projects, ["NEUTRON", "PROTON", "COLLAB", "VCI"])
        self.assertEqual(
            build_project_jql("Network & Communication Services"),
            'project IN ("NEUTRON", "PROTON", "COLLAB", "VCI")',
        )

    def test_test_coverage_mapping_uses_confirmed_project_keys(self):
        self.assertIn("MDSIA", self.analyzer._get_portfolio_projects("Data Platform"))
        self.assertNotIn("MDSIAPF", self.analyzer._get_portfolio_projects("Data Platform"))
        self.assertEqual(
            self.analyzer._build_project_jql("Network & Communication Services"),
            'project IN ("NEUTRON", "PROTON", "COLLAB", "VCI")',
        )


if __name__ == "__main__":
    unittest.main()
