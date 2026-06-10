"""
Test to Story Ratio Analyzer Module

Analyzes test to story ratio metrics for portfolios by comparing 
total test cases vs total stories.

Formula: Test to Story Ratio = Total Test Cases / Total Stories

Author: FalconX Team
Created: 2025-01-XX
"""

from typing import Dict, List
from datetime import datetime
import logging
from openai import AsyncOpenAI
import os

logger = logging.getLogger(__name__)

PORTFOLIO_TEST_DEPTH_FOCUS = {
    "Data Platform": "data contracts, transformations, and pipeline edge cases",
    "Data Solutions": "analytics scenarios, API validations, and data product behavior",
    "DMS": "dealer workflows, accounting paths, and modernization scenarios",
    "Engineering Excellence": "tooling workflows, standards, and platform enablement paths",
    "Fixed Ops": "service, parts, appointment, and warranty scenarios",
    "Fortellis": "partner API, marketplace, and portal journeys",
    "Inventory Management Solutions": "inventory accuracy, replenishment, and fulfillment flows",
    "Modern Retail": "CRM, desking, digital retail, and checkout journeys",
    "Network & Communication Services": "connectivity, provisioning, routing, and failover paths",
    "Payments": "authorization, refund, settlement, and tokenization paths",
    "Shared Services": "identity, entitlement, shared API, and integration paths",
    "Title & Registration-CVR": "title, registration, fee, and state integration paths",
}


class TestStoryRatioAnalyzer:
    """
    Analyze test to story ratio metrics for quality reporting
    
    Test to Story Ratio measures the average number of test cases 
    per story, indicating test coverage depth.
    
    Higher ratio = More comprehensive testing
    Target: 3-5 tests per story (industry standard)
    """
    
    def __init__(self, jira_client):
        self.jira = jira_client
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_API_ENDPOINT")
        if base_url and api_key:
            from services.ai_engine import create_databricks_async_openai_client
            self.openai = create_databricks_async_openai_client(api_key, base_url)
        elif api_key:
            self.openai = AsyncOpenAI(api_key=api_key)
        else:
            self.openai = AsyncOpenAI()
        self.model = os.getenv("OPENAI_MODEL", "databricks-gpt-5-1")
        
        # Import shared portfolio mapping
        from services.portfolio_mapping import PORTFOLIO_PROJECTS, get_portfolio_projects, build_project_jql, build_project_jql_with_validation
        self.portfolio_projects_list = PORTFOLIO_PROJECTS
        self._get_portfolio_projects = get_portfolio_projects
        self._build_project_jql = build_project_jql
        self._build_project_jql_with_validation = build_project_jql_with_validation

    def _portfolio_focus(self, portfolio: str) -> str:
        return PORTFOLIO_TEST_DEPTH_FOCUS.get(portfolio, "complex and high-risk story paths")
    
    async def _resolve_project_key(self, portfolio: str) -> str:
        """Resolve project key from project name or key - DEPRECATED, use _build_project_jql instead"""
        projects = self._get_portfolio_projects(portfolio)
        return projects[0] if projects else portfolio
    
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
                else:
                    issues = results if isinstance(results, list) else []
                    if total_count is None:
                        total_count = len(issues)
                
                if not issues:
                    break
                
                all_issues.extend(issues)
                
                if total_count and len(all_issues) >= total_count:
                    break
                
                if len(issues) < max_results_per_page:
                    break
                
                start_at += max_results_per_page
                
                if len(all_issues) > 100000:
                    break
                    
            except Exception as e:
                logger.error(f"❌ Error fetching page at start_at={start_at}: {e}")
                break
        
        return all_issues
    
    async def _get_total_test_cases(self, project_filter: str, period_from: str = None, period_to: str = None) -> int:
        """
        Get total count of test cases linked (via "is tested by") to closed Dev stories.

        M3 approach: A4 story denominator + "is tested by" link filter.
        Stories: resolved in PI window, status IN (Accepted, Test Complete, Done).
        Tests: issuetype = Test, status NOT IN (Abandoned), linked via "is tested by".
        No created-date filter on tests — date scope comes from the linked story filter.
        """
        if period_from and period_to:
            # Inner JQL: closed Dev stories resolved in PI window (single-quoted dates to avoid nesting conflicts)
            inner_jql = (f'issuetype = Story AND \\"Story Type\\" = Dev'
                         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
                         f' AND resolved >= \'{period_from}\' AND resolved <= \'{period_to} 23:59\'')
        else:
            inner_jql = (f'issuetype = Story AND \\"Story Type\\" = Dev'
                         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")')

        jql = (f'{project_filter} AND issuetype = Test AND status NOT IN (Abandoned)'
               f' AND issueFunction in linkedIssuesOf("{inner_jql}", "is tested by")')

        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else ""
            logger.info(f"📊 Found {count} test cases (is tested by closed Dev stories){date_info}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying total test cases: {e}")
            return 0
    
    async def _get_total_stories(self, project_filter: str, period_from: str = None, period_to: str = None) -> int:
        """
        Get total count of closed Dev stories — A4 approach.

        A4: status IN (Accepted, Test Complete, Done) AND resolved in PI window.
        No created-date filter — resolved date anchors the count to the snapshot window.
        """
        jql = (f'{project_filter} AND issuetype = Story AND "Story Type" = Dev'
               f' AND status IN ("Accepted", "Test Complete", "Done")')

        if period_from:
            jql += f' AND resolved >= "{period_from}"'
        if period_to:
            jql += f' AND resolved <= "{period_to} 23:59"'

        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
            logger.info(f"📊 Found {count} closed Dev stories (A4){date_info}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying total stories: {e}")
            return 0
    
    async def analyze_single_period(self, portfolio: str, period_from: str, period_to: str) -> Dict:
        """Analyze test to story ratio for a single period"""
        logger.info(f"📊 Analyzing test to story ratio for {portfolio} (single period)")
        logger.info(f"   Period: {period_from} to {period_to}")
        
        try:
            # Use validated project filter to handle invalid projects gracefully
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Using portfolio: {portfolio}")
            logger.info(f"📋 Project filter: {project_filter}")
            
            # Get test cases and stories filtered by date range
            total_test_cases = await self._get_total_test_cases(project_filter, period_from=period_from, period_to=period_to)
            total_stories = await self._get_total_stories(project_filter, period_from=period_from, period_to=period_to)
            
            ratio = (total_test_cases / total_stories) if total_stories > 0 else 0
            
            ai_analysis = await self._generate_single_period_ai_analysis(
                portfolio=portfolio,
                total_test_cases=total_test_cases,
                total_stories=total_stories,
                ratio=ratio,
                period_label=f"{period_to}"
            )
            
            # Build JQL queries for debugging/display (A4 + is tested by)
            _inner = (f'issuetype = Story AND \\"Story Type\\" = Dev'
                      f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
                      + (f' AND resolved >= \'{period_from}\' AND resolved <= \'{period_to} 23:59\'' if period_from and period_to else ''))
            jql_tests = (f'{project_filter} AND issuetype = Test AND status NOT IN (Abandoned)'
                         f' AND issueFunction in linkedIssuesOf("{_inner}", "is tested by")')
            jql_stories = (f'{project_filter} AND issuetype = Story AND "Story Type" = Dev'
                           f' AND status IN ("Accepted", "Test Complete", "Done")'
                           + (f' AND resolved >= "{period_from}" AND resolved <= "{period_to} 23:59"' if period_from and period_to else ''))
            jql_queries = [
                f"Test Cases (is tested by closed Dev stories): {jql_tests}",
                f"Closed Dev Stories (A4): {jql_stories}"
            ]
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "jql_queries": jql_queries,
                "period": {
                    "from": period_from,
                    "to": period_to,
                    "total_test_cases": total_test_cases,
                    "total_stories": total_stories,
                    "ratio": round(ratio, 2),
                    "jql_queries": jql_queries
                },
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Test to story ratio analysis completed")
            logger.info(f"   Ratio: {total_test_cases}/{total_stories} = {ratio:.2f}:1")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Test to story ratio analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def compare_periods(self, portfolio: str, period1_from: str, period1_to: str, period2_from: str, period2_to: str) -> Dict:
        """Compare test to story ratio between two periods"""
        logger.info(f"📊 Analyzing test to story ratio for {portfolio}")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        
        try:
            # Use validated project filter to handle invalid projects gracefully
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Using portfolio: {portfolio}")
            logger.info(f"📋 Project filter: {project_filter}")
            
            # Get test cases and stories for each period (filtered by date range)
            period1_test_cases = await self._get_total_test_cases(project_filter, period_from=period1_from, period_to=period1_to)
            period1_stories = await self._get_total_stories(project_filter, period_from=period1_from, period_to=period1_to)
            period2_test_cases = await self._get_total_test_cases(project_filter, period_from=period2_from, period_to=period2_to)
            period2_stories = await self._get_total_stories(project_filter, period_from=period2_from, period_to=period2_to)
            
            period1_ratio = (period1_test_cases / period1_stories) if period1_stories > 0 else 0
            period2_ratio = (period2_test_cases / period2_stories) if period2_stories > 0 else 0
            
            ratio_change = period2_ratio - period1_ratio
            # WoW Progress as percentage-point change (difference * 100)
            wow_progress_pct = (period2_ratio - period1_ratio) * 100
            test_cases_change = period2_test_cases - period1_test_cases
            stories_change = period2_stories - period1_stories
            
            ai_analysis = await self._generate_ai_analysis(
                portfolio=portfolio,
                period1_test_cases=period1_test_cases,
                period1_stories=period1_stories,
                period1_ratio=period1_ratio,
                period2_test_cases=period2_test_cases,
                period2_stories=period2_stories,
                period2_ratio=period2_ratio,
                ratio_change=ratio_change,
                test_cases_change=test_cases_change,
                stories_change=stories_change,
                period1_label=f"{period1_to}",
                period2_label=f"{period2_to}"
            )
            # Build JQL queries for debugging/display (A4 + is tested by)
            def _make_inner(pfrom, pto):
                return (f'issuetype = Story AND \\"Story Type\\" = Dev'
                        f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
                        f' AND resolved >= \'{pfrom}\' AND resolved <= \'{pto} 23:59\'')
            def _make_test_jql(pf, pfrom, pto):
                return (f'{pf} AND issuetype = Test AND status NOT IN (Abandoned)'
                        f' AND issueFunction in linkedIssuesOf("{_make_inner(pfrom, pto)}", "is tested by")')
            def _make_story_jql(pf, pfrom, pto):
                return (f'{pf} AND issuetype = Story AND "Story Type" = Dev'
                        f' AND status IN ("Accepted", "Test Complete", "Done")'
                        f' AND resolved >= "{pfrom}" AND resolved <= "{pto} 23:59"')
            jql_queries = [
                f"Period 1 Tests: {_make_test_jql(project_filter, period1_from, period1_to)}",
                f"Period 1 Stories: {_make_story_jql(project_filter, period1_from, period1_to)}",
                f"Period 2 Tests: {_make_test_jql(project_filter, period2_from, period2_to)}",
                f"Period 2 Stories: {_make_story_jql(project_filter, period2_from, period2_to)}",
            ]
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "jql_queries": jql_queries,
                "period1": {
                    "from": period1_from,
                    "to": period1_to,
                    "week_ending": period1_to,
                    "total_test_cases": period1_test_cases,
                    "total_stories": period1_stories,
                    "ratio": round(period1_ratio, 2),
                    "jql_queries": [jql_queries[0], jql_queries[1]]
                },
                "period2": {
                    "from": period2_from,
                    "to": period2_to,
                    "week_ending": period2_to,
                    "total_test_cases": period2_test_cases,
                    "total_stories": period2_stories,
                    "ratio": round(period2_ratio, 2),
                    "jql_queries": [jql_queries[2], jql_queries[3]]
                },
                "progress": {
                    "ratio_change": round(ratio_change, 2),
                    "wow_progress_pct": round(wow_progress_pct, 0),
                    "test_cases_change": test_cases_change,
                    "stories_change": stories_change,
                    "trend": "improving" if ratio_change > 0 else "declining" if ratio_change < 0 else "stable"
                },
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Test to story ratio analysis completed")
            logger.info(f"   Period 1: {period1_ratio:.2f}:1 (Week ending {period1_to})")
            logger.info(f"   Period 2: {period2_ratio:.2f}:1 (Week ending {period2_to})")
            logger.info(f"   WoW Progress: {wow_progress_pct:.1f}%")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Test to story ratio analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_ai_analysis(self, portfolio: str, period1_test_cases: int, period1_stories: int, period1_ratio: float,
                                   period2_test_cases: int, period2_stories: int, period2_ratio: float,
                                   ratio_change: float, test_cases_change: int, stories_change: int,
                                   period1_label: str, period2_label: str) -> str:
        """Generate AI analysis for test to story ratio comparison"""
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            focus = self._portfolio_focus(portfolio)
            prompt = f"""You are a Senior Quality Engineering Manager analyzing test to story ratio progress for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- As of {period1_date}: {period1_test_cases} test cases, {period1_stories} stories, ratio {period1_ratio:.2f}:1
- As of {period2_date}: {period2_test_cases} test cases, {period2_stories} stories, ratio {period2_ratio:.2f}:1
- Ratio Change: {"+" if ratio_change >= 0 else ""}{ratio_change:.2f}
- Test Cases Change: {"+" if test_cases_change >= 0 else ""}{test_cases_change}
- Stories Change: {"+" if stories_change >= 0 else ""}{stories_change}
- Portfolio focus area: {focus}

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the ratio trend
2. Highlights key numbers
3. Provides actionable next steps tied to {focus}

Be conversational and human-friendly."""

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
            focus = self._portfolio_focus(portfolio)
            if ratio_change > 0:
                return f"{portfolio} improved test depth from {period1_ratio:.2f}:1 to {period2_ratio:.2f}:1, adding {test_cases_change} tests against {stories_change} stories. Keep the extra depth focused on {focus}, where additional positive, negative, and boundary tests will matter most."
            elif ratio_change < 0:
                return f"{portfolio} test depth slipped from {period1_ratio:.2f}:1 to {period2_ratio:.2f}:1 as story growth outpaced test creation. Review the newest stories in {focus} and backfill missing edge-case or regression tests before the ratio settles lower."
            else:
                return f"{portfolio} held steady at {period2_ratio:.2f}:1 with {period2_test_cases} tests across {period2_stories} stories. Use {focus} to decide where test depth should deliberately exceed the average rather than distributing new tests evenly."
    
    async def _generate_single_period_ai_analysis(self, portfolio: str, total_test_cases: int, total_stories: int,
                                                  ratio: float, period_label: str) -> str:
        """Generate AI analysis for single period test to story ratio"""
        try:
            try:
                period_date = datetime.strptime(period_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period_date = period_label
            
            focus = self._portfolio_focus(portfolio)
            prompt = f"""You are a Senior Quality Engineering Manager analyzing test to story ratio status for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- Total Test Cases: {total_test_cases}
- Total Stories: {total_stories}
- As of {period_date}: Ratio {ratio:.2f}:1
- Portfolio focus area: {focus}

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the current ratio status
2. Highlights key numbers
3. Provides actionable next steps tied to {focus}

Be conversational and human-friendly."""

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
            focus = self._portfolio_focus(portfolio)
            if ratio >= 5:
                return f"{portfolio} has very deep test coverage at {ratio:.2f}:1 across {total_stories} stories. Keep pruning duplicate or low-value tests while preserving strong coverage for {focus}."
            elif ratio >= 3:
                return f"{portfolio} is strong at {ratio:.2f}:1 with {total_test_cases} tests for {total_stories} stories. Keep the same discipline for {focus}, especially where one story touches multiple user or integration paths."
            elif ratio >= 2:
                return f"{portfolio} is moderate at {ratio:.2f}:1, so test depth is present but not yet robust. Add targeted negative, boundary, and regression cases for {focus} before broadening lower-risk coverage."
            else:
                return f"{portfolio} needs more test depth at {ratio:.2f}:1. Start with the highest-risk stories in {focus} and set a minimum test expectation before those stories close."

