"""
Bug Discovery Ratio Analyzer Module

Analyzes bug discovery ratio metrics for portfolios by comparing 
bugs found vs test cases executed in a given period.

Formula: Bug Discovery Ratio = Bugs Found / Test Cases Executed

Author: FalconX Team
Created: 2025-01-XX
"""

from typing import Dict, List
from datetime import datetime
import logging
from openai import AsyncOpenAI
import os

logger = logging.getLogger(__name__)

PORTFOLIO_BUG_FOCUS = {
    "Data Platform": "data pipeline changes, contract breaks, and transformation defects",
    "Data Solutions": "analytics workflows, API behavior, and data processing defects",
    "DMS": "dealer accounting, drive workflow, and modernization defects",
    "Engineering Excellence": "tooling, platform enablement, and CI/CD quality gaps",
    "Fixed Ops": "service, parts, appointment, and warranty defects",
    "Fortellis": "partner API, marketplace, and developer portal defects",
    "Inventory Management Solutions": "inventory accuracy, replenishment, and fulfillment defects",
    "Modern Retail": "CRM, desking, digital retail, and checkout defects",
    "Network & Communication Services": "connectivity, provisioning, routing, and failover defects",
    "Payments": "authorization, settlement, refund, and compliance defects",
    "Shared Services": "identity, entitlement, common service, and integration defects",
    "Title & Registration-CVR": "title, registration, fee, and DMV integration defects",
}


class BugRatioAnalyzer:
    """
    Analyze bug discovery ratio metrics for quality reporting
    
    Bug Discovery Ratio measures how many bugs are found per test case 
    executed, indicating test effectiveness and code quality.
    
    Lower ratio = Better code quality or more effective tests
    Target: 0.02-0.05 (2-5 bugs per 100 tests)
    """
    
    def __init__(self, jira_client, project_catalog):
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
        
        self.project_catalog = project_catalog
        self.portfolio_projects_list = project_catalog.portfolio_projects
        self._get_portfolio_projects = project_catalog.get_portfolio_projects
        self._build_project_jql = project_catalog.build_project_jql
        self._build_project_jql_with_validation = project_catalog.build_project_jql_with_validation
        self.portfolio_projects = {
            project.key: {"name": project.name, "key": project.key}
            for project in project_catalog.projects
        }

    def _portfolio_focus(self, portfolio: str) -> str:
        return PORTFOLIO_BUG_FOCUS.get(portfolio, "recently changed components and high-risk test areas")
    
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
    
    def _bugs_in_period_jql(self, project_filter: str, date_from: str, date_to: str) -> str:
        """Build the Bugs Written query for the selected PI snapshot."""
        return f'{project_filter} AND issuetype = Bug AND created >= "{date_from}" AND created <= "{date_to} 23:59"'

    def _test_cases_in_period_jql(self, project_filter: str, date_from: str, date_to: str) -> str:
        """Build the locked A9 denominator for Bugs/Test Case."""
        linked_work_items = (
            f"((issuetype = Story AND \\\"Story Type\\\" = Dev "
            f"AND status IN (\\\"Accepted\\\", \\\"Test Complete\\\", \\\"Done\\\") "
            f"AND resolved >= '{date_from}' AND resolved <= '{date_to} 23:59') "
            f"OR (issuetype IN (Bug, Defect) "
            f"AND resolved >= '{date_from}' AND resolved <= '{date_to} 23:59'))"
        )
        return (
            f'{project_filter} AND issuetype = Test AND status NOT IN (Abandoned) '
            f'AND (created >= "{date_from}" AND created <= "{date_to} 23:59" '
            f'OR issueFunction in linkedIssuesOf("{linked_work_items}"))'
        )

    async def _get_bugs_in_period(self, project_filter: str, date_from: str, date_to: str) -> int:
        """
        Get count of bugs written in date range.
        
        M4 Q2 QCOE Spec: Bugs created in PI. Uses 'created' per Rule 1.
        Accepts pre-validated project_filter to ensure only valid projects are queried.
        """
        jql = self._bugs_in_period_jql(project_filter, date_from, date_to)
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            logger.info(f"📊 Found {count} bugs in period {date_from} to {date_to}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying bugs: {e}")
            return 0
    
    async def _get_executed_test_cases(self, project_filter: str, date_from: str, date_to: str) -> int:
        """
        Get count of non-abandoned tests created in PI, plus tests linked to
        closed Dev stories or Bugs/Defects resolved in PI.
        
        M4 locked A9 approach: the OR query includes new test-only cases and
        avoids double counting tests that also have qualifying links.
        Accepts pre-validated project_filter to ensure only valid projects are queried.
        """
        jql = self._test_cases_in_period_jql(project_filter, date_from, date_to)
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            logger.info(f"Bug/Test Case denominator: {count} A9 qualifying test cases in period {date_from} to {date_to}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying test cases: {e}")
            return 0
    
    async def analyze_single_period(self, portfolio: str, period_from: str, period_to: str) -> Dict:
        """Analyze bug discovery ratio for a single period"""
        logger.info(f"📊 Analyzing bug discovery ratio for {portfolio} (single period)")
        logger.info(f"   Period: {period_from} to {period_to}")
        
        try:
            # Use validated project filter to handle invalid projects gracefully
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"📋 Project filter: {project_filter}")
            
            bugs_found = await self._get_bugs_in_period(project_filter, period_from, period_to)
            test_cases_executed = await self._get_executed_test_cases(project_filter, period_from, period_to)
            
            ratio = (bugs_found / test_cases_executed) if test_cases_executed > 0 else 0
            
            ai_analysis = await self._generate_single_period_ai_analysis(
                portfolio=portfolio,
                bugs_found=bugs_found,
                test_cases_executed=test_cases_executed,
                ratio=ratio,
                period_label=f"{period_to}"
            )
            
            # Display the exact JQL queries used to calculate the metric.
            jql_bugs = self._bugs_in_period_jql(project_filter, period_from, period_to)
            jql_tests = self._test_cases_in_period_jql(project_filter, period_from, period_to)
            jql_queries = [
                f"Bugs Found: {jql_bugs}",
                f"Test Cases Executed: {jql_tests}"
            ]
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "jql_queries": jql_queries,
                "period": {
                    "from": period_from,
                    "to": period_to,
                    "bugs_found": bugs_found,
                    "test_cases_executed": test_cases_executed,
                    "ratio": round(ratio, 6),
                    "jql_queries": jql_queries
                },
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Bug discovery ratio analysis completed")
            logger.info(f"   Ratio: {bugs_found}/{test_cases_executed} = {ratio:.4f}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Bug discovery ratio analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def compare_periods(self, portfolio: str, period1_from: str, period1_to: str, period2_from: str, period2_to: str) -> Dict:
        """Compare bug discovery ratio between two periods"""
        logger.info(f"📊 Analyzing bug discovery ratio for {portfolio}")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        
        try:
            # Use validated project filter to handle invalid projects gracefully
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"📋 Project filter: {project_filter}")
            
            period1_bugs = await self._get_bugs_in_period(project_filter, period1_from, period1_to)
            period1_tests = await self._get_executed_test_cases(project_filter, period1_from, period1_to)
            period2_bugs = await self._get_bugs_in_period(project_filter, period2_from, period2_to)
            period2_tests = await self._get_executed_test_cases(project_filter, period2_from, period2_to)
            
            period1_ratio = (period1_bugs / period1_tests) if period1_tests > 0 else 0
            period2_ratio = (period2_bugs / period2_tests) if period2_tests > 0 else 0
            
            ratio_change = period2_ratio - period1_ratio
            bugs_change = period2_bugs - period1_bugs
            tests_change = period2_tests - period1_tests
            
            ai_analysis = await self._generate_ai_analysis(
                portfolio=portfolio,
                period1_bugs=period1_bugs,
                period1_tests=period1_tests,
                period1_ratio=period1_ratio,
                period2_bugs=period2_bugs,
                period2_tests=period2_tests,
                period2_ratio=period2_ratio,
                ratio_change=ratio_change,
                bugs_change=bugs_change,
                tests_change=tests_change,
                period1_label=f"{period1_to}",
                period2_label=f"{period2_to}"
            )
            
            # Calculate WoW progress as percentage (ratio converted to percentage basis)
            wow_progress_pct = round(ratio_change * 100, 2)
            
            # Display the exact JQL queries used to calculate the metric.
            jql_p1_bugs = self._bugs_in_period_jql(project_filter, period1_from, period1_to)
            jql_p1_tests = self._test_cases_in_period_jql(project_filter, period1_from, period1_to)
            jql_p2_bugs = self._bugs_in_period_jql(project_filter, period2_from, period2_to)
            jql_p2_tests = self._test_cases_in_period_jql(project_filter, period2_from, period2_to)
            jql_queries = [
                f"Period 1 Bugs: {jql_p1_bugs}",
                f"Period 1 Tests Executed: {jql_p1_tests}",
                f"Period 2 Bugs: {jql_p2_bugs}",
                f"Period 2 Tests Executed: {jql_p2_tests}"
            ]
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "jql_queries": jql_queries,
                "period1": {
                    "from": period1_from,
                    "to": period1_to,
                    "week_ending": period1_to,
                    "bugs_found": period1_bugs,
                    "test_cases_executed": period1_tests,
                    "ratio": round(period1_ratio, 6),
                    "jql_queries": [jql_queries[0], jql_queries[1]]
                },
                "period2": {
                    "from": period2_from,
                    "to": period2_to,
                    "week_ending": period2_to,
                    "bugs_found": period2_bugs,
                    "test_cases_executed": period2_tests,
                    "ratio": round(period2_ratio, 6),
                    "jql_queries": [jql_queries[2], jql_queries[3]]
                },
                "progress": {
                    "ratio_change": round(ratio_change, 4),
                    "wow_progress_pct": wow_progress_pct,
                    "bugs_change": bugs_change,
                    "tests_change": tests_change,
                    "trend": "improving" if ratio_change < 0 else "declining" if ratio_change > 0 else "stable"
                },
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Bug discovery ratio analysis completed")
            logger.info(f"   Period 1: {period1_ratio:.4f} | Period 2: {period2_ratio:.4f} | Change: {ratio_change:+.4f}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Bug discovery ratio analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_ai_analysis(self, portfolio: str, period1_bugs: int, period1_tests: int, period1_ratio: float,
                                   period2_bugs: int, period2_tests: int, period2_ratio: float,
                                   ratio_change: float, bugs_change: int, tests_change: int,
                                   period1_label: str, period2_label: str) -> str:
        """Generate AI analysis for bug discovery ratio comparison"""
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
            prompt = f"""You are a Senior Quality Engineering Manager analyzing bug discovery ratio progress for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- As of {period1_date}: {period1_bugs} bugs, {period1_tests} tests executed, ratio {period1_ratio:.4f} ({period1_ratio*100:.2f} bugs per 100 tests)
- As of {period2_date}: {period2_bugs} bugs, {period2_tests} tests executed, ratio {period2_ratio:.4f} ({period2_ratio*100:.2f} bugs per 100 tests)
- Ratio Change: {"+" if ratio_change >= 0 else ""}{ratio_change:.4f}
- Bugs Change: {"+" if bugs_change >= 0 else ""}{bugs_change}
- Tests Change: {"+" if tests_change >= 0 else ""}{tests_change}
- Portfolio focus area: {focus}

Note: Lower ratio is better (fewer bugs per test). Ratio change < 0 means improvement.

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
            if ratio_change < 0:
                return f"{portfolio} bug discovery density improved from {period1_ratio * 100:.1f}% to {period2_ratio * 100:.1f}% even with {tests_change:+d} tests in the denominator. Review the remaining {period2_bugs} bugs for clusters in {focus} and keep expanding the tests that are lowering the ratio."
            elif ratio_change > 0:
                return f"{portfolio} bug discovery density increased from {period1_ratio * 100:.1f}% to {period2_ratio * 100:.1f}%, with {bugs_change:+d} bugs against {tests_change:+d} tests. Cluster the new bugs around {focus} and feed the pattern back into engineering before adding more broad test volume."
            else:
                return f"{portfolio} bug discovery density is stable at {period2_ratio * 100:.1f}% with {period2_bugs} bugs over {period2_tests} tests. Use {focus} to decide whether stability reflects improving code quality or a need for sharper negative testing."
    
    async def _generate_single_period_ai_analysis(self, portfolio: str, bugs_found: int, test_cases_executed: int,
                                                  ratio: float, period_label: str) -> str:
        """Generate AI analysis for single period bug discovery ratio"""
        try:
            try:
                period_date = datetime.strptime(period_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period_date = period_label
            
            focus = self._portfolio_focus(portfolio)
            prompt = f"""You are a Senior Quality Engineering Manager analyzing bug discovery ratio status for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- Bugs Found: {bugs_found}
- Test Cases Executed: {test_cases_executed}
- As of {period_date}: Ratio {ratio:.4f} ({ratio*100:.2f} bugs per 100 tests)
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
            if ratio < 0.02:
                return f"{portfolio} has low bug discovery density at {ratio * 100:.1f}% ({bugs_found} bugs over {test_cases_executed} tests). Keep sampling {focus} so the low rate reflects real quality rather than missed risk."
            elif ratio <= 0.05:
                return f"{portfolio} is in a controlled bug-density band at {ratio * 100:.1f}% with {bugs_found} bugs. Continue root-cause review in {focus} and protect the test mix that is finding issues early."
            else:
                return f"{portfolio} has elevated bug discovery density at {ratio * 100:.1f}% with {bugs_found} bugs. Group the defects by {focus}, then tighten review and targeted regression around the highest-repeat cause."

