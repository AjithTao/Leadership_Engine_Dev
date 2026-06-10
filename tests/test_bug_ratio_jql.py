import asyncio
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
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.pop("OPENAI_API_ENDPOINT", None)

from services.bug_ratio_analyzer import BugRatioAnalyzer


class CapturingJiraClient:
    def __init__(self):
        self.queries = []

    async def search(self, jql, *args, **kwargs):
        self.queries.append(jql)
        return {"issues": [], "total": 0}

    async def get_projects(self):
        return [{"key": "NDP"}]


class BugRatioJqlTests(unittest.TestCase):
    def setUp(self):
        self.jira = CapturingJiraClient()
        self.analyzer = BugRatioAnalyzer(self.jira)

    def test_denominator_uses_locked_a9_created_or_resolved_linked_cases(self):
        jql = self.analyzer._test_cases_in_period_jql(
            'project = "NDP"',
            "2026-04-01",
            "2026-04-10",
        )

        self.assertIn('project = "NDP" AND issuetype = Test AND status NOT IN (Abandoned)', jql)
        self.assertIn(
            'created >= "2026-04-01" AND created <= "2026-04-10 23:59"',
            jql,
        )
        self.assertIn(
            'issueFunction in linkedIssuesOf("((issuetype = Story AND \\"Story Type\\" = Dev '
            'AND status IN (\\"Accepted\\", \\"Test Complete\\", \\"Done\\") '
            "AND resolved >= '2026-04-01' AND resolved <= '2026-04-10 23:59') "
            "OR (issuetype IN (Bug, Defect) AND resolved >= '2026-04-01' "
            "AND resolved <= '2026-04-10 23:59'))\")",
            jql,
        )
        self.assertNotIn('issueFunction not in linkedIssuesOf', jql)

    def test_executed_denominator_uses_the_union_jql(self):
        asyncio.run(
            self.analyzer._get_executed_test_cases(
                'project = "NDP"',
                "2026-04-01",
                "2026-04-10",
            )
        )

        self.assertEqual(
            self.jira.queries,
            [self.analyzer._test_cases_in_period_jql('project = "NDP"', "2026-04-01", "2026-04-10")],
        )

    def test_single_period_response_displays_executed_queries(self):
        async def no_analysis(*args, **kwargs):
            return "Analysis suppressed for test."

        self.analyzer._generate_single_period_ai_analysis = no_analysis
        result = asyncio.run(self.analyzer.analyze_single_period("NDP", "2026-04-01", "2026-04-10"))
        project_filter = 'project = "NDP"'

        self.assertEqual(
            result["jql_queries"],
            [
                f'Bugs Found: {self.analyzer._bugs_in_period_jql(project_filter, "2026-04-01", "2026-04-10")}',
                f'Test Cases Executed: {self.analyzer._test_cases_in_period_jql(project_filter, "2026-04-01", "2026-04-10")}',
            ],
        )


if __name__ == "__main__":
    unittest.main()
