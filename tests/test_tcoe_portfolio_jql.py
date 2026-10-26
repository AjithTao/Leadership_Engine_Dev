import asyncio
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

class DummyAsyncOpenAI:
    def __init__(self, *args, **kwargs): pass

openai_stub = types.ModuleType("openai")
openai_stub.AsyncOpenAI = DummyAsyncOpenAI
sys.modules.setdefault("openai", openai_stub)
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from services.bug_ratio_analyzer import BugRatioAnalyzer
from services.defect_leakage_analyzer import DefectLeakageAnalyzer
from services.overall_automation_analyzer import OverallAutomationAnalyzer
from services.qcoe_project_catalog import QcoeProjectCatalog
from services.regression_automation_analyzer import RegressionAutomationAnalyzer
from services.test_case_review_status_analyzer import TestCaseReviewStatusAnalyzer
from services.test_coverage_analyzer import TestCoverageAnalyzer
from services.test_story_ratio_analyzer import TestStoryRatioAnalyzer

RAW_PROJECTS = [
    {"id": "1", "key": "DP1", "name": "Pipeline One", "projectCategory": {"id": "10", "name": "Data Platform"}},
    {"id": "2", "key": "DP2", "name": "Pipeline Two", "projectCategory": {"id": "10", "name": "Data Platform"}},
    {"id": "3", "key": "PAY", "name": "Payments", "projectCategory": {"id": "20", "name": "Payments"}},
    {"id": "4", "key": "MISC", "name": "Miscellaneous"},
]

class FakeJiraClient:
    def __init__(self): self.queries = []
    async def search(self, jql, *args, **kwargs):
        self.queries.append(" ".join(str(jql).split()))
        return {"issues": [], "total": 0}

class TcoePortfolioJqlTests(unittest.TestCase):
    def setUp(self):
        self.catalog = QcoeProjectCatalog.from_jira_projects(RAW_PROJECTS)
        self.jira = FakeJiraClient()
        self.analyzers = [
            DefectLeakageAnalyzer(self.jira, self.catalog),
            OverallAutomationAnalyzer(self.jira, self.catalog),
            RegressionAutomationAnalyzer(self.jira, self.catalog),
            TestCoverageAnalyzer(self.jira, self.catalog),
            TestStoryRatioAnalyzer(self.jira, self.catalog),
            BugRatioAnalyzer(self.jira, self.catalog),
            TestCaseReviewStatusAnalyzer(self.jira, self.catalog),
        ]

    def test_all_analyzers_share_the_injected_jira_catalog(self):
        for analyzer in self.analyzers:
            with self.subTest(analyzer=analyzer.__class__.__name__):
                self.assertEqual(analyzer._get_portfolio_projects("Data Platform"), ["DP1", "DP2"])
                self.assertEqual(analyzer._build_project_jql("Data Platform"), 'project IN ("DP1", "DP2")')
                self.assertIs(analyzer.project_catalog, self.catalog)

    def test_review_grouping_comes_from_jira_categories(self):
        analyzer = TestCaseReviewStatusAnalyzer(self.jira, self.catalog)
        self.assertEqual(analyzer.portfolio_groups["DP1"], "Data Platform")
        self.assertEqual(analyzer.portfolio_groups["MISC"], "Uncategorized")

    def test_metric_query_contains_catalog_resolved_project_filter(self):
        async def run():
            await DefectLeakageAnalyzer(self.jira, self.catalog).analyze_week(
                "Data Platform", "2026-01-14", "2026-03-13"
            )
        asyncio.run(run())
        self.assertTrue(self.jira.queries)
        self.assertTrue(all('project IN ("DP1", "DP2")' in query for query in self.jira.queries))

    def test_unknown_scope_is_never_treated_as_a_project_key(self):
        for analyzer in self.analyzers:
            with self.subTest(analyzer=analyzer.__class__.__name__):
                with self.assertRaisesRegex(ValueError, "Unknown Jira portfolio or project key"):
                    analyzer._build_project_jql("Made Up Portfolio")

if __name__ == "__main__": unittest.main()
