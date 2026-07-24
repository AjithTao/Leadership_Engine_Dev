import os
import re
import sys
import types
import unittest
import asyncio
from pathlib import Path


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
from services.defect_leakage_analyzer import DefectLeakageAnalyzer
from services.overall_automation_analyzer import OverallAutomationAnalyzer
from services.portfolio_mapping import (
    PORTFOLIO_PROJECTS,
    PROJECT_TO_PORTFOLIO,
    build_project_jql,
    get_portfolio_projects,
)
from services.regression_automation_analyzer import RegressionAutomationAnalyzer
from services.test_case_review_status_analyzer import TestCaseReviewStatusAnalyzer
from services.test_coverage_analyzer import TestCoverageAnalyzer
from services.test_story_ratio_analyzer import TestStoryRatioAnalyzer


EXPECTED_PORTFOLIO_COUNTS = {
    'Data Platform': 23,
    'Data Solutions': 10,
    'DMS': 22,
    'Fixed Ops': 34,
    'Fortellis': 5,
    'Inventory Management Solutions': 6,
    'Modern Retail': 68,
    'Payments': 4,
    'Shared Services': 14,
    'Title & Registration-CVR': 31,
}

ACTIVE_CVR_PROJECT_KEYS = [
    'CVRS',
    'CVRCACONV',
    'CVRCBE',
    'CVRIN',
    'CVRNC',
    'CVRAL',
    'CVRMA',
    'CVRMD',
    'CVRPA',
    'CVRSC',
    'CVRVA',
    'CVRWV',
    'CVRHOST',
    'CVRFL',
    'CVRGA',
    'CVRIL',
    'CVRILSUP',
    'CVRCH',
    'CVRCIS',
    'CVRCLA',
    'CVRDAESIGN',
    'CVRDOCIMG',
    'CVRJE',
    'CVRNMVTI',
    'CVRRC',
    'CVRMIWEB',
    'CVRNCC',
    'CVRNJ',
    'CVRNY',
    'CVRPAC',
    'WICON',
]

EXCLUDED_PROJECT_KEYS = [
    'REP',
    'EQAP',
    'QUEN',
    'RMD',
    'CDESK',
    'NEUTRON',
    'PROTON',
    'COLLAB',
    'VCI',
]


class FakeJiraClient:
    async def search(self, *args, **kwargs):
        return {"issues": [], "total": 0}

    async def get_projects(self):
        return [
            {"key": project}
            for projects in PORTFOLIO_PROJECTS.values()
            for project in projects
        ]


class CapturingJiraClient(FakeJiraClient):
    def __init__(self):
        self.queries = []

    async def search(self, jql, *args, **kwargs):
        self.queries.append(" ".join(str(jql).split()))
        return {"issues": [], "total": 0}


class TcoePortfolioJqlTests(unittest.TestCase):
    def setUp(self):
        self.analyzers = [
            DefectLeakageAnalyzer(FakeJiraClient()),
            OverallAutomationAnalyzer(FakeJiraClient()),
            RegressionAutomationAnalyzer(FakeJiraClient()),
            TestCoverageAnalyzer(FakeJiraClient()),
            TestStoryRatioAnalyzer(FakeJiraClient()),
            BugRatioAnalyzer(FakeJiraClient()),
            TestCaseReviewStatusAnalyzer(FakeJiraClient()),
        ]

    def test_canonical_mapping_matches_tac_csv_qcoe_scope(self):
        self.assertEqual(set(PORTFOLIO_PROJECTS), set(EXPECTED_PORTFOLIO_COUNTS))
        self.assertEqual(
            {portfolio: len(projects) for portfolio, projects in PORTFOLIO_PROJECTS.items()},
            EXPECTED_PORTFOLIO_COUNTS,
        )
        self.assertEqual(PORTFOLIO_PROJECTS["Title & Registration-CVR"], ACTIVE_CVR_PROJECT_KEYS)

        all_projects = [project for projects in PORTFOLIO_PROJECTS.values() for project in projects]
        self.assertEqual(len(all_projects), 217)
        self.assertEqual(len(set(all_projects)), 217)
        for project in EXCLUDED_PROJECT_KEYS:
            self.assertNotIn(project, all_projects)

    def test_backend_mapping_matches_active_frontend_qcoe_options(self):
        component_path = Path(__file__).resolve().parents[1] / "frontend" / "app" / "components" / "DefectLeakageAnalyzer.tsx"
        text = component_path.read_text(encoding="utf-8")
        start = text.index("const ACTIVE_TCOE_PORTFOLIO_STRUCTURE")
        end = text.index("// Build flat lists from TCOE structure", start)
        block = text[start:end]
        portfolios = re.findall(r'^  "([^"]+)": \{\s*\n    products:', block, re.M)

        frontend_mapping = {}
        for index, portfolio in enumerate(portfolios):
            portfolio_start = block.index(f'  "{portfolio}": {{')
            portfolio_end = (
                block.index(f'  "{portfolios[index + 1]}": {{', portfolio_start + 1)
                if index + 1 < len(portfolios)
                else len(block)
            )
            portfolio_block = block[portfolio_start:portfolio_end]
            frontend_mapping[portfolio] = [
                key for key in re.findall(r'"key": "([^"]*)"', portfolio_block) if key
            ]

        self.assertEqual(frontend_mapping, PORTFOLIO_PROJECTS)

    def test_all_metric_analyzers_build_project_key_jql_for_every_portfolio(self):
        for analyzer in self.analyzers:
            with self.subTest(analyzer=analyzer.__class__.__name__):
                for portfolio, expected_projects in PORTFOLIO_PROJECTS.items():
                    with self.subTest(portfolio=portfolio):
                        self.assertEqual(analyzer._get_portfolio_projects(portfolio), expected_projects)
                        jql = analyzer._build_project_jql(portfolio)
                        self.assertEqual(jql, build_project_jql(portfolio))
                        self.assertTrue(jql.startswith("project IN ("))
                        self.assertNotIn(f'"{portfolio}"', jql)
                        for project in EXCLUDED_PROJECT_KEYS:
                            self.assertNotIn(f'"{project}"', jql)
                        for project in expected_projects:
                            self.assertIn(f'"{project}"', jql)

    def test_representative_metric_queries_use_project_filters_for_every_portfolio(self):
        async def collect_queries(portfolio):
            queries = []
            project_filter = build_project_jql(portfolio)

            jira = CapturingJiraClient()
            await DefectLeakageAnalyzer(jira).analyze_week(portfolio, "2026-01-14", "2026-03-13")
            queries.extend(jira.queries)

            overall = OverallAutomationAnalyzer(CapturingJiraClient())
            await overall._get_automation_breakdown(project_filter, "2026-03-13")
            queries.extend(overall.jira.queries)

            regression = RegressionAutomationAnalyzer(CapturingJiraClient())
            await regression._get_regression_automation_breakdown(project_filter, "2026-03-13")
            queries.extend(regression.jira.queries)

            coverage = TestCoverageAnalyzer(FakeJiraClient())
            queries.extend(coverage._coverage_jql_queries(project_filter, "2026-01-14", "2026-03-13"))

            story_ratio = TestStoryRatioAnalyzer(CapturingJiraClient())
            await story_ratio._get_total_test_cases(project_filter, "2026-01-14", "2026-03-13")
            await story_ratio._get_total_stories(project_filter, "2026-01-14", "2026-03-13")
            queries.extend(story_ratio.jira.queries)

            bug_ratio = BugRatioAnalyzer(CapturingJiraClient())
            await bug_ratio._get_bugs_in_period(project_filter, "2026-01-14", "2026-03-13")
            await bug_ratio._get_executed_test_cases(project_filter, "2026-01-14", "2026-03-13")
            queries.extend(bug_ratio.jira.queries)

            review = TestCaseReviewStatusAnalyzer(CapturingJiraClient())
            await review._get_total_stories(project_filter, "2026-01-14", "2026-03-13")
            await review._get_reviewed_stories(project_filter, "2026-01-14", "2026-03-13", reviewed=True)
            await review._get_reviewed_stories(project_filter, "2026-01-14", "2026-03-13", reviewed=False)
            queries.extend(review.jira.queries)

            return [" ".join(query.split()) for query in queries]

        for portfolio in PORTFOLIO_PROJECTS:
            with self.subTest(portfolio=portfolio):
                queries = asyncio.run(collect_queries(portfolio))
                project_filter = build_project_jql(portfolio)
                self.assertGreaterEqual(len(queries), 15)
                for query in queries:
                    self.assertIn(project_filter, query)
                    self.assertNotIn(f'project = "{portfolio}"', query)
                    for project in EXCLUDED_PROJECT_KEYS:
                        self.assertNotIn(f'"{project}"', query)

    def test_overall_automation_uses_locked_snapshot_and_requires_rollup(self):
        jira = CapturingJiraClient()
        analyzer = OverallAutomationAnalyzer(jira)

        asyncio.run(analyzer._get_automation_breakdown('project = "NDP"', "2026-04-10"))

        self.assertEqual(len(jira.queries), 3)
        for query in jira.queries:
            self.assertIn('project = "NDP" AND issuetype = Test AND status NOT IN (Abandoned)', query)
            self.assertIn('created <= "2026-04-10 23:59"', query)
            self.assertIn('(resolution is EMPTY OR resolved <= "2026-04-10 23:59")', query)
            self.assertNotIn('"Test Type" = "Functional Testing"', query)
            self.assertNotIn('"Test Type" IN ("Functional Testing")', query)

        self.assertIn('"Test Status" = Automated', jira.queries[0])
        self.assertIn('"Test Status" IN ("Requires Automation", "In Progress", "Merged", "Repair")', jira.queries[1])
        self.assertIn('"Test Status" = "Automation Not Required"', jira.queries[2])

    def test_regression_automation_uses_locked_snapshot_and_regression_type(self):
        jira = CapturingJiraClient()
        analyzer = RegressionAutomationAnalyzer(jira)

        asyncio.run(analyzer._get_regression_automation_breakdown('project = "NDP"', "2026-04-10"))

        self.assertEqual(len(jira.queries), 3)
        for query in jira.queries:
            self.assertIn('project = "NDP" AND issuetype = Test AND status NOT IN (Abandoned)', query)
            self.assertIn('"Test Type" IN ("Regression Testing")', query)
            self.assertIn('created <= "2026-04-10 23:59"', query)
            self.assertIn('(resolution is EMPTY OR resolved <= "2026-04-10 23:59")', query)

        self.assertIn('"Test Status" = Automated', jira.queries[0])
        self.assertIn('"Test Status" IN ("Requires Automation", "In Progress", "Merged", "Repair")', jira.queries[1])
        self.assertIn('"Test Status" = "Automation Not Required"', jira.queries[2])

    def test_active_portfolio_aliases_do_not_fall_back_to_portfolio_label_jql(self):
        self.assertEqual(get_portfolio_projects("Data Platforms"), PORTFOLIO_PROJECTS["Data Platform"])
        self.assertEqual(
            build_project_jql("Data Platforms"),
            build_project_jql("Data Platform"),
        )
        self.assertEqual(
            build_project_jql("IMS"),
            build_project_jql("Inventory Management Solutions"),
        )

    def test_all_filter_resolves_to_all_tac_csv_project_keys(self):
        projects = get_portfolio_projects("All")

        self.assertEqual(len(projects), 217)
        self.assertEqual(len(set(projects)), 217)
        self.assertEqual(projects, [project for keys in PORTFOLIO_PROJECTS.values() for project in keys])
        self.assertTrue(build_project_jql("All").startswith("project IN ("))
        for project in EXCLUDED_PROJECT_KEYS:
            self.assertNotIn(f'"{project}"', build_project_jql("All"))

    def test_review_status_portfolio_grouping_uses_the_same_updated_project_map(self):
        analyzer = TestCaseReviewStatusAnalyzer(FakeJiraClient())

        self.assertEqual(analyzer.portfolio_groups, PROJECT_TO_PORTFOLIO)
        self.assertEqual(len(analyzer.portfolio_groups), 217)

    def test_review_status_portfolio_grouping_displays_the_a5_query(self):
        async def analyze():
            analyzer = TestCaseReviewStatusAnalyzer(FakeJiraClient())

            async def no_analysis(*args, **kwargs):
                return "Analysis suppressed for test."

            analyzer._generate_ai_analysis = no_analysis
            analyzer._generate_grand_total_analysis = no_analysis
            analyzer._generate_portfolio_group_analysis = no_analysis
            analyzer._generate_enterprise_grand_total_analysis = no_analysis
            return analyzer, await analyzer.analyze_by_portfolio_groups(
                ["MDSICAP", "MDSIA"],
                "2026-01-01",
                "2026-04-03",
                "2026-01-01",
                "2026-04-10",
            )

        analyzer, result = asyncio.run(analyze())
        expected_total_jql = analyzer._closed_story_window_jql(
            'project IN ("MDSICAP", "MDSIA")',
            "2026-01-01",
            "2026-04-10",
        )
        queries = result["analyses"][0]["jql_queries"]

        self.assertEqual(queries[2], f"Period 2 - Total Stories: {expected_total_jql}")
        self.assertIn('status NOT IN (Abandoned)', queries[2])
        self.assertIn('resolved <= "2026-04-10 23:59"', queries[2])
        self.assertNotIn('status IN ("Accepted", "Test Complete", "Done")', queries[2])


if __name__ == "__main__":
    unittest.main()
