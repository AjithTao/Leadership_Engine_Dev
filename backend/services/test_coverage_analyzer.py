"""
Test Coverage Analyzer Module

Analyzes test coverage metrics for portfolios by comparing stories with 
linked test cases vs total stories across different time periods.

Formula: Test Coverage % = (Stories with linked Test Cases / Total Stories) × 100

Author: FalconX Team
Created: 2025-01-XX
"""

from typing import Dict, List, Optional
from datetime import datetime
import logging
from openai import AsyncOpenAI
import os
from services.pi_date_utils import build_pi_date_window, compare_metric_by_date

logger = logging.getLogger(__name__)

# Locked cumulative coverage start date for QCOE reporting.
CUMULATIVE_START = "2022-01-01"
COVERAGE_DEV_STORY_STATUSES = (
    "Accepted",
    "Blocked",
    "Done",
    "In Progress",
    "In Review",
    "Pending Approval",
    "Review",
    "Test",
    "Test Case Review",
    "Test Complete",
    "Todo",
)


class TestCoverageAnalyzer:
    """
    Analyze test coverage metrics for quality reporting
    
    Test Coverage measures the percentage of stories that have 
    linked test cases, indicating test coverage completeness.
    
    Higher coverage = Better test coverage
    Target: > 80% (industry standard)
    """
    
    def __init__(self, jira_client, project_catalog):
        """
        Initialize analyzer with Jira client
        
        Args:
            jira_client: JiraClient instance for querying issues
        """
        self.jira = jira_client
        ai_enabled = os.getenv("AI_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
        api_key = os.getenv("OPENAI_API_KEY") if ai_enabled else None
        base_url = os.getenv("OPENAI_API_ENDPOINT") if ai_enabled else None
        if base_url and api_key:
            from services.ai_engine import create_databricks_async_openai_client
            self.openai = create_databricks_async_openai_client(api_key, base_url)
        elif api_key:
            self.openai = AsyncOpenAI(api_key=api_key)
        else:
            self.openai = None
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        
        # Use the same canonical portfolio map as the other TCOE analyzers.
        self.project_catalog = project_catalog
        self.portfolio_projects = project_catalog.portfolio_projects
        self._get_portfolio_projects = project_catalog.get_portfolio_projects
        self._build_project_jql = project_catalog.build_project_jql
        self._build_project_jql_with_validation = project_catalog.build_project_jql_with_validation
    
    async def _resolve_project_key(self, portfolio: str) -> str:
        """Resolve one project through the injected Jira catalog."""
        return self._get_portfolio_projects(portfolio)[0]

    async def _fetch_all_issues(self, jql: str) -> List[Dict]:
        """Fetch all issues from Jira with pagination support"""
        all_issues = []
        start_at = 0
        max_results_per_page = 2000
        total_count = None
        
        while True:
            try:
                results = await self.jira.search(jql, max_results=max_results_per_page, start_at=start_at)
                
                if isinstance(results, dict):
                    issues = results.get('issues', [])
                    if total_count is None:
                        total_count = results.get('total', 0)
                        logger.info(f"📊 Total issues available: {total_count}")
                else:
                    issues = results if isinstance(results, list) else []
                    if total_count is None:
                        total_count = len(issues)
                
                if not issues:
                    break
                
                all_issues.extend(issues)
                logger.info(f"📄 Fetched page: {len(issues)} issues (Total so far: {len(all_issues)}/{total_count if total_count else 'unknown'})")
                
                if total_count and len(all_issues) >= total_count:
                    break
                
                if len(issues) < max_results_per_page:
                    break
                
                start_at += max_results_per_page
                
                if len(all_issues) > 100000:
                    logger.warning(f"⚠️ Reached safety limit of 100k issues, stopping pagination")
                    break
                    
            except Exception as e:
                logger.error(f"❌ Error fetching page at start_at={start_at}: {e}")
                break
        
        logger.info(f"✅ Total issues fetched: {len(all_issues)}")
        return all_issues
    
    async def _get_total_stories(self, project_filter: str, period_from: str = None, period_to: str = None) -> int:
        """Get total count of dev stories, optionally filtered by date range.
        
        Accepts pre-validated project_filter.
        """
        jql = self._dev_stories_jql(project_filter, period_from, period_to)
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
            logger.info(f"📊 Found {count} total stories{date_info}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying total stories: {e}")
            return 0
    
    async def _get_total_test_cases(self, project_filter: str, period_from: str = None, period_to: str = None) -> int:
        """Get total count of test cases linked to Stories + Bugs + Defects.
        
        Accepts pre-validated project_filter.
        """
        jql = self._test_cases_jql(project_filter, period_from, period_to)
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
            logger.info(f"📊 Found {count} test cases linked to Stories+Bugs+Defects{date_info}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying test cases: {e}")
            return 0
    
    async def _get_stories_with_tests(self, project_filter: str, period_from: str = None, period_to: str = None) -> int:
        """Get count of dev stories with linked test cases, optionally filtered by date range.
        
        Accepts pre-validated project_filter.
        """
        jql_variants = [
            self._stories_with_tests_jql(project_filter, period_from, period_to),
        ]
        
        for jql in jql_variants:
            try:
                all_issues = await self._fetch_all_issues(jql)
                count = len(all_issues)
                if count > 0 or jql == jql_variants[-1]:  # Use last variant if others fail
                    date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
                    logger.info(f"📊 Found {count} stories with linked test cases{date_info}")
                    return count
            except Exception as e:
                logger.warning(f"⚠️ JQL variant failed: {e}")
                continue
        
        # Fallback: Get all stories and check links manually (slower but more reliable)
        logger.info("📊 Using fallback: fetching all dev stories and checking links...")
        try:
            base_jql = f'{project_filter} AND type = Story AND "Story Type" = Dev'
            if period_from and period_to:
                base_jql += f' AND createdDate >= "{period_from}" AND createdDate <= "{period_to} 23:59"'
            elif period_to:
                base_jql += f' AND createdDate <= "{period_to} 23:59"'
            
            all_stories = await self._fetch_all_issues(base_jql)
            stories_with_tests = 0
            
            # Check each story for linked test cases
            for story in all_stories:
                issue_key = story.get('key', '')
                if issue_key:
                    # Check if story has linked test cases
                    linked_jql = self._linked_tests_for_story_jql(issue_key, project_filter, period_from, period_to)
                    linked_results = await self.jira.search(linked_jql, max_results=1)
                    if isinstance(linked_results, dict):
                        linked_issues = linked_results.get('issues', [])
                    else:
                        linked_issues = linked_results if isinstance(linked_results, list) else []
                    
                    if linked_issues:
                        stories_with_tests += 1
                
                # Limit to avoid too many queries
                if stories_with_tests > 0 and len(all_stories) > 100:
                    # Sample approach for large datasets
                    if len(all_stories) > 1000:
                        sample_size = min(100, len(all_stories))
                        logger.info(f"📊 Sampling {sample_size} stories for link checking...")
                        break
            
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
            logger.info(f"📊 Found {stories_with_tests} stories with linked test cases (fallback method){date_info}")
            return stories_with_tests
            
        except Exception as e:
            logger.error(f"❌ Error in fallback method: {e}")
            return 0

    def _created_date_filter(self, period_from: str = None, period_to: str = None) -> str:
        """Build a created-date window for Test-only items in a snapshot."""
        if period_from and period_to:
            return f' AND created >= "{period_from}" AND created <= "{period_to} 23:59"'
        if period_to:
            return f' AND created <= "{period_to} 23:59"'
        return ""

    def _resolved_date_filter(self, period_from: str = None, period_to: str = None) -> str:
        """Build the resolved-date window used to count Dev Stories."""
        if period_from and period_to:
            return f' AND resolved >= "{period_from}" AND resolved <= "{period_to} 23:59"'
        if period_to:
            return f' AND resolved <= "{period_to} 23:59"'
        return ""

    def _nested_date_filter(self, field: str, period_from: str = None, period_to: str = None) -> str:
        """Build a single-quoted date window for JQL embedded in linkedIssuesOf."""
        if period_from and period_to:
            return f" AND {field} >= '{period_from}' AND {field} <= '{period_to} 23:59'"
        if period_to:
            return f" AND {field} <= '{period_to} 23:59'"
        return ""

    def _dev_story_status_filter(self) -> str:
        statuses = ", ".join(f'"{status}"' for status in COVERAGE_DEV_STORY_STATUSES)
        return f"status IN ({statuses})"

    def _escape_linked_issues_jql(self, jql: str) -> str:
        """Escape a JQL subquery so it can be embedded in linkedIssuesOf("...")."""
        return jql.replace("\\", "\\\\").replace('"', '\\"')

    def _linked_work_items_jql(self, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """Story, Bug, or Defect items used by the common Test-count rule.
        
        Accepts pre-validated project_filter.
        """
        accepted_created = (
            f"(status = Accepted{self._nested_date_filter('created', period_from, period_to)})"
        )
        done_resolved = (
            f"(status = Done{self._nested_date_filter('resolved', period_from, period_to)})"
        )
        return (
            f"{project_filter} AND issuetype IN (Story, Bug, Defect) "
            f"AND ({accepted_created} OR {done_resolved})"
        )

    def _linked_tests_jql(self, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """Linked Tests eligible for story coverage percentage calculation.
        
        Accepts pre-validated project_filter.
        """
        return 'issuetype = Test AND status NOT IN (Abandoned)'

    def _dev_stories_jql(self, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """Dev Stories resolved in scope for the shared coverage denominator.
        
        Accepts pre-validated project_filter.
        """
        return (
            f'{project_filter} AND issuetype = Story AND "Story Type" = Dev '
            f'AND {self._dev_story_status_filter()}'
            f'{self._resolved_date_filter(period_from, period_to)}'
        )

    def _test_cases_jql(self, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """
        Count Tests using the selected common rule for every portfolio.

        A Test qualifies when it is linked to a portfolio Story/Bug/Defect that
        was accepted after creation or completed after resolution in the
        snapshot window, or when it is a Test-only item created in the window.
        
        Accepts pre-validated project_filter.
        """
        linked_work_items = self._escape_linked_issues_jql(
            self._linked_work_items_jql(project_filter, period_from, period_to)
        )
        story_bug_defect_links = self._escape_linked_issues_jql(
            "issuetype IN (Story, Bug, Defect)"
        )
        return (
            'issuetype = Test AND status NOT IN (Abandoned) AND ('
            f'issueFunction in linkedIssuesOf("{linked_work_items}") OR '
            f'({project_filter}{self._created_date_filter(period_from, period_to)} '
            f'AND issueFunction not in linkedIssuesOf("{story_bug_defect_links}")))'
        )

    def _stories_with_tests_jql(self, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """
        Dev Stories in the shared denominator that have a non-abandoned Test.
        
        Accepts pre-validated project_filter.
        """
        nested_jql = self._escape_linked_issues_jql(
            self._linked_tests_jql(project_filter, period_from, period_to)
        )
        return (
            f'{self._dev_stories_jql(project_filter, period_from, period_to)} '
            f'AND issueFunction in linkedIssuesOf("{nested_jql}")'
        )

    def _linked_tests_for_story_jql(self, issue_key: str, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """Fallback query for checking one story's linked tests.
        
        Accepts pre-validated project_filter.
        """
        return (
            f'issue in linkedIssues("{issue_key}") '
            f'AND {self._linked_tests_jql(project_filter, period_from, period_to)}'
        )
    
    def _coverage_jql_queries(self, project_filter: str, period_from: str, period_to: str) -> List[str]:
        """Build the exact JQL strings used for a coverage snapshot.
        
        Accepts pre-validated project_filter.
        """
        return [
            f'Total Dev Stories: {self._dev_stories_jql(project_filter, period_from, period_to)}',
            f'Test Cases (Story+Bug+Defect): {self._test_cases_jql(project_filter, period_from, period_to)}',
            f'Dev Stories with Tests: {self._stories_with_tests_jql(project_filter, period_from, period_to)}'
        ]

    async def _coverage_snapshot(self, project_filter: str, period_from: str, period_to: str) -> Dict:
        """Return one table-ready snapshot for story/test mapping.
        
        Accepts pre-validated project_filter.
        """
        total_stories = await self._get_total_stories(project_filter, period_from=period_from, period_to=period_to)
        total_test_cases = await self._get_total_test_cases(project_filter, period_from=period_from, period_to=period_to)
        stories_with_tests = await self._get_stories_with_tests(project_filter, period_from=period_from, period_to=period_to)
        stories_without_tests = max(total_stories - stories_with_tests, 0)
        coverage_percentage = (stories_with_tests / total_stories * 100) if total_stories > 0 else 0
        jql_queries = self._coverage_jql_queries(project_filter, period_from, period_to)

        return {
            "from": period_from,
            "to": period_to,
            "week_ending": period_to,
            "dev_stories": total_stories,
            "total_stories": total_stories,
            "test_cases": total_test_cases,
            "test_cases_created": total_test_cases,
            "tests_mapped": total_test_cases,
            "total_test_cases": total_test_cases,
            "stories_with_tests": stories_with_tests,
            "stories_without_tests": stories_without_tests,
            "coverage_percentage": round(coverage_percentage, 1),
            "jql": " | ".join(jql_queries),
            "jql_queries": jql_queries
        }

    def _as_cumulative_snapshot(self, snapshot: Dict) -> Dict:
        """Alias PI snapshot fields to cumulative table field names."""
        cumulative = dict(snapshot)
        cumulative["cumulative_dev_stories"] = snapshot.get("dev_stories", 0)
        cumulative["cumulative_tests_mapped"] = snapshot.get("test_cases", 0)
        return cumulative

    async def analyze_single_period(self, portfolio: str, period_from: str, period_to: str) -> Dict:
        """
        Analyze test coverage for a single period.
        
        NOTE: For robust project handling with invalid projects, uses validated project filter
        that automatically removes invalid projects and continues with valid ones.
        """
        logger.info(f"📊 Analyzing test coverage for {portfolio} (single period)")
        logger.info(f"   Period: {period_from} to {period_to}")
        
        try:
            # Use validated project filter to handle invalid projects gracefully
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Using validated projects: {project_filter}")
            
            pi_window = build_pi_date_window(period_to)
            period_from = pi_window["pi_start_date"]
            period_to = pi_window["report_date"]
            pi_context = pi_window["pi_context"]

            pi_snapshot = await self._coverage_snapshot(project_filter, period_from, period_to)
            pi_snapshot["pi_context"] = pi_context
            # Table B uses the locked cumulative coverage start date.
            cumulative_snapshot = self._as_cumulative_snapshot(
                await self._coverage_snapshot(project_filter, CUMULATIVE_START, period_to)
            )
            cumulative_snapshot["pi_context"] = pi_context

            total_stories = pi_snapshot["total_stories"]
            total_test_cases = pi_snapshot["total_test_cases"]
            stories_with_tests = pi_snapshot["stories_with_tests"]
            stories_without_tests = pi_snapshot["stories_without_tests"]
            coverage_percentage = pi_snapshot["coverage_percentage"]
            
            ai_analysis = await self._generate_single_period_ai_analysis(
                portfolio=portfolio,
                total_stories=total_stories,
                total_test_cases=total_test_cases,
                stories_with_tests=stories_with_tests,
                stories_without_tests=stories_without_tests,
                coverage_percentage=coverage_percentage,
                period_label=f"{period_to}"
            )
            
            jql_queries = pi_snapshot["jql_queries"] + cumulative_snapshot["jql_queries"]
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "total_stories": total_stories,
                "total_test_cases": total_test_cases,
                "stories_with_tests": stories_with_tests,
                "coverage_percentage": round(coverage_percentage, 2),
                "jql_queries": jql_queries,
                "period": {
                    "from": period_from,
                    "to": period_to,
                    "pi_context": pi_context,
                    "total_test_cases": total_test_cases,
                    "total_stories": total_stories,
                    "stories_with_tests": stories_with_tests,
                    "stories_without_tests": stories_without_tests,
                    "coverage_percentage": round(coverage_percentage, 1),
                    "jql_queries": pi_snapshot["jql_queries"]
                },
                "table_a": {
                    "title": "Stories to Test Cases Mapping - Every story should have at least 1 test case mapped to ensure optimal coverage",
                    "period": pi_snapshot
                },
                "table_b": {
                    "title": "Stories to Test Cases Mapping - Cumulative",
                    "period": cumulative_snapshot
                },
                "pi_context": pi_context,
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Test coverage analysis completed")
            logger.info(f"   Period: {stories_with_tests}/{total_stories} ({coverage_percentage:.1f}%)")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Test coverage analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def compare_periods(self, portfolio: str, period1_from: str, period1_to: str, period2_from: str, period2_to: str) -> Dict:
        """Compare test coverage between two periods"""
        logger.info(f"📊 Analyzing test coverage for {portfolio}")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        
        try:
            # Validate projects at entry point
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Using validated project filter: {project_filter}")
            
            # Use compare_metric_by_date to handle cross-PI boundary detection.
            # If dates fall in different PIs, each period uses its own PI start.
            comparison = compare_metric_by_date(period2_to, period1_to)
            p1_window = comparison["previous"]
            p2_window = comparison["current"]
            
            if comparison.get("is_different_pi"):
                logger.warning(f"⚠️ Cross-PI comparison detected: {comparison.get('comparison_note')}")
            
            period1_from = p1_window["pi_start_date"]
            period1_to = p1_window["report_date"]
            period2_from = p2_window["pi_start_date"]
            period2_to = p2_window["report_date"]
            period1_pi_context = p1_window["pi_context"]
            period2_pi_context = p2_window["pi_context"]

            # Metric 1 is reported as two snapshots:
            # Table A: PI start → report date (PI-scoped weekly snapshot)
            # Table B: locked cumulative start date -> report date.
            table_a_p1 = await self._coverage_snapshot(project_filter, period1_from, period1_to)
            table_a_p1["pi_context"] = period1_pi_context
            table_a_p2 = await self._coverage_snapshot(project_filter, period2_from, period2_to)
            table_a_p2["pi_context"] = period2_pi_context
            # Table B uses the locked cumulative coverage start date.
            table_b_p1 = self._as_cumulative_snapshot(await self._coverage_snapshot(project_filter, CUMULATIVE_START, period1_to))
            table_b_p1["pi_context"] = period1_pi_context
            table_b_p2 = self._as_cumulative_snapshot(await self._coverage_snapshot(project_filter, CUMULATIVE_START, period2_to))
            table_b_p2["pi_context"] = period2_pi_context

            period1_total_stories = table_a_p1["total_stories"]
            period2_total_stories = table_a_p2["total_stories"]
            period1_with_tests = table_a_p1["stories_with_tests"]
            period2_with_tests = table_a_p2["stories_with_tests"]
            period1_total_test_cases = table_a_p1["total_test_cases"]
            period2_total_test_cases = table_a_p2["total_test_cases"]
            
            # Use period2 totals for overall total (current period)
            total_stories = period2_total_stories
            total_test_cases = period2_total_test_cases
            
            # Calculate percentages using each period's own total stories
            period1_percentage = (period1_with_tests / period1_total_stories * 100) if period1_total_stories > 0 else 0
            period2_percentage = (period2_with_tests / period2_total_stories * 100) if period2_total_stories > 0 else 0
            
            progress = period2_percentage - period1_percentage
            new_stories_with_tests = period2_with_tests - period1_with_tests
            
            ai_analysis = await self._generate_ai_analysis(
                portfolio=portfolio,
                total_stories=total_stories,
                period1_with_tests=period1_with_tests,
                period1_without_tests=period1_total_stories - period1_with_tests,
                period1_percentage=period1_percentage,
                period2_with_tests=period2_with_tests,
                period2_without_tests=period2_total_stories - period2_with_tests,
                period2_percentage=period2_percentage,
                progress=progress,
                new_stories_with_tests=new_stories_with_tests,
                period1_label=f"{period1_to}",
                period2_label=f"{period2_to}"
            )
            
            # Calculate WoW progress percentage
            wow_progress_pct = round(progress, 1)
            
            jql_queries = (
                table_a_p1["jql_queries"] +
                table_a_p2["jql_queries"] +
                table_b_p1["jql_queries"] +
                table_b_p2["jql_queries"]
            )
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "total_stories": total_stories,
                "total_test_cases": total_test_cases,
                "jql_queries": jql_queries,
                "period1": {
                    "from": period1_from,
                    "to": period1_to,
                    "pi_context": period1_pi_context,
                    "week_ending": period1_to,
                    "total_stories": period1_total_stories,
                    "total_test_cases": period1_total_test_cases,
                    "stories_with_tests": period1_with_tests,
                    "stories_without_tests": period1_total_stories - period1_with_tests,
                    "coverage_percentage": round(period1_percentage, 1),
                    "jql_queries": table_a_p1["jql_queries"]
                },
                "period2": {
                    "from": period2_from,
                    "to": period2_to,
                    "pi_context": period2_pi_context,
                    "week_ending": period2_to,
                    "total_stories": period2_total_stories,
                    "total_test_cases": period2_total_test_cases,
                    "stories_with_tests": period2_with_tests,
                    "stories_without_tests": period2_total_stories - period2_with_tests,
                    "coverage_percentage": round(period2_percentage, 1),
                    "jql_queries": table_a_p2["jql_queries"]
                },
                "table_a": {
                    "title": "Stories to Test Cases Mapping - Every story should have at least 1 test case mapped to ensure optimal coverage",
                    "period1": table_a_p1,
                    "period2": table_a_p2,
                    "progress": {
                        "percentage_change": wow_progress_pct,
                        "wow_progress_pct": wow_progress_pct,
                        "trend": "improving" if progress > 0 else "declining" if progress < 0 else "stable"
                    }
                },
                "table_b": {
                    "title": "Stories to Test Cases Mapping - Cumulative",
                    "period1": table_b_p1,
                    "period2": table_b_p2,
                    "progress": {
                        "percentage_change": round(table_b_p2["coverage_percentage"] - table_b_p1["coverage_percentage"], 1),
                        "wow_progress_pct": round(table_b_p2["coverage_percentage"] - table_b_p1["coverage_percentage"], 1),
                        "trend": "improving" if table_b_p2["coverage_percentage"] > table_b_p1["coverage_percentage"] else "declining" if table_b_p2["coverage_percentage"] < table_b_p1["coverage_percentage"] else "stable"
                    }
                },
                "progress": {
                    "percentage_change": round(progress, 1),
                    "wow_progress_pct": wow_progress_pct,
                    "new_stories_with_tests": new_stories_with_tests,
                    "trend": "improving" if progress > 0 else "declining" if progress < 0 else "stable"
                },
                "pi_context": period2_pi_context,
                "previous_pi_context": period1_pi_context,
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Test coverage analysis completed")
            logger.info(f"   Week ending {period1_to}: {period1_with_tests}/{total_stories} ({period1_percentage:.1f}%)")
            logger.info(f"   Week ending {period2_to}: {period2_with_tests}/{total_stories} ({period2_percentage:.1f}%)")
            logger.info(f"   WoW Progress: {wow_progress_pct:+.1f}%")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Test coverage analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_ai_analysis(self, portfolio: str, total_stories: int, period1_with_tests: int, period1_without_tests: int,
                                   period1_percentage: float, period2_with_tests: int, period2_without_tests: int,
                                   period2_percentage: float, progress: float, new_stories_with_tests: int,
                                   period1_label: str, period2_label: str) -> str:
        """Generate AI analysis for test coverage comparison"""
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            portfolio_hints = {
                "Data Platform": "data contracts, ingestion paths, and pipeline stories",
                "Data Solutions": "data pipelines, ETL processes, API validation, and analytics stories",
                "DMS": "dealer workflows, accounting paths, and modernization stories",
                "Engineering Excellence": "tooling, standards, and platform enablement stories",
                "Fixed Ops": "service, parts, appointment, and warranty stories",
                "Fortellis": "partner API, marketplace, and developer portal stories",
                "Inventory Management Solutions": "inventory accuracy, replenishment, and fulfillment stories",
                "Modern Retail": "customer journeys, CRM, desking, and digital retail workflows",
                "Network & Communication Services": "connectivity, provisioning, routing, and failover stories",
                "Payments": "authorization, refund, settlement, and tokenization stories",
                "Shared Services": "identity, entitlement, common services, and integrations",
                "Title & Registration-CVR": "title, registration, fee, and DMV integration stories",
            }
            
            hint = portfolio_hints.get(portfolio, "critical business workflows")
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing test coverage progress for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- Total Stories: {total_stories}
- As of {period1_date}: {period1_with_tests} stories with tests ({period1_percentage:.1f}%), {period1_without_tests} without
- As of {period2_date}: {period2_with_tests} stories with tests ({period2_percentage:.1f}%), {period2_without_tests} without
- Progress: {"+" if progress >= 0 else ""}{progress:.1f} percentage points
- New Stories with Tests: {new_stories_with_tests}

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the progress for {portfolio}
2. Highlights key numbers
3. Provides actionable next steps specific to {portfolio}'s context

Be conversational and human-friendly. Avoid jargon."""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing clear, actionable insights."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=300
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ AI analysis generated: {analysis[:100]}...")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ AI analysis generation failed: {e}")
            if progress > 0:
                return f"{portfolio} test coverage improved from {period1_percentage:.1f}% to {period2_percentage:.1f}% (+{progress:.1f}pp), with {new_stories_with_tests} additional stories now carrying tests. Keep the gain focused on {hint}, and close the remaining {period2_without_tests} uncovered stories before the next reporting cut."
            elif progress < 0:
                return f"{portfolio} test coverage declined from {period1_percentage:.1f}% to {period2_percentage:.1f}% ({progress:.1f}pp), meaning story growth is outrunning test mapping. Review the {period2_without_tests} uncovered stories in {hint} first and link at least one meaningful test before closure."
            else:
                return f"{portfolio} test coverage is steady at {period2_percentage:.1f}% with {period2_with_tests} stories mapped and {period2_without_tests} still uncovered. Use {hint} to decide which unmapped stories need immediate test links rather than treating all gaps equally."
    
    async def _generate_single_period_ai_analysis(self, portfolio: str, total_stories: int, total_test_cases: int,
                                                  stories_with_tests: int,
                                                  stories_without_tests: int, coverage_percentage: float, period_label: str) -> str:
        """Generate AI analysis for single period test coverage"""
        try:
            try:
                period_date = datetime.strptime(period_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period_date = period_label
            
            portfolio_hints = {
                "Data Platform": "data contracts, ingestion paths, and pipeline stories",
                "Data Solutions": "data pipelines, ETL processes, API validation, and analytics stories",
                "DMS": "dealer workflows, accounting paths, and modernization stories",
                "Engineering Excellence": "tooling, standards, and platform enablement stories",
                "Fixed Ops": "service, parts, appointment, and warranty stories",
                "Fortellis": "partner API, marketplace, and developer portal stories",
                "Inventory Management Solutions": "inventory accuracy, replenishment, and fulfillment stories",
                "Modern Retail": "customer journeys, CRM, desking, and digital retail workflows",
                "Network & Communication Services": "connectivity, provisioning, routing, and failover stories",
                "Payments": "authorization, refund, settlement, and tokenization stories",
                "Shared Services": "identity, entitlement, common services, and integrations",
                "Title & Registration-CVR": "title, registration, fee, and DMV integration stories",
            }
            
            hint = portfolio_hints.get(portfolio, "critical business workflows")
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing test coverage status for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- Total Stories: {total_stories}
- Total Test Cases Created/Mapped: {total_test_cases}
- As of {period_date}: {stories_with_tests} stories with test cases ({coverage_percentage:.1f}%), {stories_without_tests} without

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the current coverage status for {portfolio}
2. Highlights key numbers
3. Provides actionable next steps

Be conversational and human-friendly. Avoid jargon."""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing clear, actionable insights."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=300
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ AI analysis generated: {analysis[:100]}...")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ AI analysis generation failed: {e}")
            if coverage_percentage >= 90:
                return f"{portfolio} has excellent test coverage at {coverage_percentage:.1f}% with {stories_with_tests} stories mapped. Review the remaining {stories_without_tests} gaps in {hint} so the high percentage still reflects meaningful coverage."
            elif coverage_percentage >= 80:
                return f"{portfolio} is strong at {coverage_percentage:.1f}% test coverage with {stories_with_tests} stories mapped. Focus next on the {stories_without_tests} uncovered stories tied to {hint}, especially active development scope."
            elif coverage_percentage >= 70:
                return f"{portfolio} is moderate at {coverage_percentage:.1f}% test coverage. Prioritize the remaining {stories_without_tests} unmapped stories in {hint} and make test linkage visible before stories move to done."
            else:
                return f"{portfolio} needs a coverage push at {coverage_percentage:.1f}% with {stories_without_tests} stories still missing test links. Start with critical {hint} and make at least one mapped test a closure gate for applicable Dev stories."

