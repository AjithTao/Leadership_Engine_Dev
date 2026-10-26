"""
Test Case Review Status Analyzer Module

Analyzes test case review status metrics for portfolios by comparing 
stories with "Test Case Reviewed" = Yes vs total stories.

Formula: Test Case Review Status % = (Stories with "Test Case Reviewed" = Yes / Total Stories) × 100

Author: FalconX Team
Created: 2025-01-XX
"""

from typing import Dict, List
from datetime import datetime
import logging
from openai import AsyncOpenAI
import os

logger = logging.getLogger(__name__)

PORTFOLIO_REVIEW_FOCUS = {
    "Data Platform": "data contracts, ingestion paths, and high-impact pipeline stories",
    "Data Solutions": "analytics, API, and customer-facing data product stories",
    "DMS": "dealer accounting, workflow, and modernization stories",
    "Engineering Excellence": "platform tooling, standards, and shared engineering enablement stories",
    "Fixed Ops": "service lane, parts, appointment, and warranty workflow stories",
    "Fortellis": "partner API, marketplace, and developer-experience stories",
    "Inventory Management Solutions": "inventory accuracy, stocking, and fulfillment stories",
    "Modern Retail": "digital retail, CRM, desking, and checkout journey stories",
    "Network & Communication Services": "connectivity, voice, provisioning, and failover stories",
    "Payments": "authorization, settlement, refund, and compliance-sensitive payment stories",
    "Shared Services": "identity, entitlement, common service, and integration stories",
    "Title & Registration-CVR": "state-specific title, registration, fee, and DMV integration stories",
}


class TestCaseReviewStatusAnalyzer:
    """
    Analyze test case review status metrics for quality reporting
    
    Test Case Review Status measures the percentage of stories that have 
    had their test cases reviewed, indicating quality assurance maturity.
    
    Higher percentage = Better review coverage
    Target: > 90% (industry standard)
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
        
        # Bind this analyzer to the immutable Jira catalog snapshot.
        self.project_catalog = project_catalog
        self.portfolio_projects_list = project_catalog.portfolio_projects
        self._get_portfolio_projects = project_catalog.get_portfolio_projects
        self._build_project_jql = project_catalog.build_project_jql
        self._build_project_jql_with_validation = project_catalog.build_project_jql_with_validation
        
        self.portfolio_projects = {
            project.key: {"name": project.name, "key": project.key}
            for project in project_catalog.projects
        }
        
        # Project-key grouping comes directly from Jira project categories.
        self.portfolio_groups = project_catalog.project_to_portfolio.copy()

    def _review_focus(self, portfolio: str) -> str:
        return PORTFOLIO_REVIEW_FOCUS.get(portfolio, "high-risk stories and recently closed delivery scope")

    def _build_review_fallback_comment(self, portfolio: str, period1_percentage: float, period2_percentage: float,
                                       progress: float, period2_reviewed_yes: int, period2_total: int,
                                       pending_review: int, new_reviewed: int) -> str:
        focus = self._review_focus(portfolio)
        if progress > 1:
            trend = f"review coverage improved by {progress:.1f}pp, with {new_reviewed} additional stories now carrying review evidence"
        elif progress < -1:
            trend = f"review coverage slipped by {abs(progress):.1f}pp as story closure outpaced review completion"
        else:
            trend = f"review coverage is broadly stable at {period2_percentage:.1f}%"

        if period2_percentage >= 80:
            action = f"Use a light audit on the remaining {pending_review} stories so the strong position does not hide gaps in {focus}."
        elif period2_percentage >= 60:
            action = f"Prioritize the remaining {pending_review} unreviewed or unset stories, starting with {focus}, and close them before the next weekly cut."
        else:
            action = f"Create a focused review sweep for {focus}; the {pending_review} stories without review evidence are the main drag on this metric."

        return (
            f"{portfolio} is at {period2_reviewed_yes}/{period2_total} closed Dev stories reviewed "
            f"({period2_percentage:.1f}%, from {period1_percentage:.1f}% last week); {trend}. {action}"
        )
    
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
                    if results.get("error"):
                        err = results["error"]
                        raise RuntimeError(f"Jira search failed ({err.get('status_code')}): {err.get('message', '')}")
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
                raise
        
        return all_issues
    
    def _closed_story_window_jql(self, project_filter: str, period_from: str = None, period_to: str = None) -> str:
        """
        Build base JQL for dev stories in the selected PI/week window.

        Accepts pre-validated project_filter to ensure only valid projects are queried.
        """
        jql = f'{project_filter} AND issuetype = Story AND "Story Type" = Dev'

        if period_from:
            jql += f' AND created >= "{period_from}"'
        if period_to:
            jql += f' AND created <= "{period_to} 23:59"'

        # A5 approach: exclude Abandoned + resolved <= snap
        # resolved <= snap anchors the count to stories actually closed by the snap date
        # status NOT IN (Abandoned) is broader than hardcoded Done/Accepted/Test Complete
        jql += ' AND status NOT IN (Abandoned)'

        if period_to:
            jql += f' AND resolved <= "{period_to} 23:59"'

        return jql

    async def _get_total_stories(self, project_filter: str, period_from: str = None, period_to: str = None) -> int:
        """Get total count of stories in the selected PI/week window.
        
        Accepts pre-validated project_filter.
        """
        jql = self._closed_story_window_jql(project_filter, period_from, period_to)
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
            logger.info(f"📊 Found {count} total stories{date_info}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying total stories: {e}")
            raise
    
    async def _get_reviewed_stories(self, project_filter: str, period_from: str = None, period_to: str = None, reviewed: bool = True) -> int:
        """Get count of stories with Test Case Reviewed = Yes or not Yes.
        
        Accepts pre-validated project_filter.
        """
        base_jql = self._closed_story_window_jql(project_filter, period_from, period_to)
        
        if reviewed:
            jql = f'{base_jql} AND "Test Case Reviewed" = Yes'
        else:
            jql = f'{base_jql} AND "Test Case Reviewed" != Yes'
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            date_info = f" for period {period_from} to {period_to}" if period_from and period_to else (f" up to {period_to}" if period_to else "")
            logger.info(f"📊 Found {count} stories with Test Case Reviewed {'= Yes' if reviewed else '!= Yes'}{date_info}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying reviewed stories: {e}")
            raise
    
    async def analyze_single_period(self, portfolio: str, period_from: str, period_to: str) -> Dict:
        """Analyze test case review status for a single period"""
        logger.info(f"📊 Analyzing test case review status for {portfolio} (single period)")
        logger.info(f"   Period: {period_from} to {period_to}")
        
        try:
            # Use validated project filter to handle invalid projects gracefully
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Using project filter: {project_filter}")
            
            # Build JQL queries for debugging/display
            base_jql = self._closed_story_window_jql(project_filter, period_from, period_to)
            jql_reviewed_yes = f'{base_jql} AND "Test Case Reviewed" = Yes'
            jql_reviewed_no = f'{base_jql} AND "Test Case Reviewed" != Yes'
            jql_queries = [
                f"Total Stories: {base_jql}",
                f"Reviewed Yes: {jql_reviewed_yes}",
                f"Reviewed No: {jql_reviewed_no}"
            ]
            
            # Get stories and reviewed counts filtered by date range
            total_stories = await self._get_total_stories(project_filter, period_from=period_from, period_to=period_to)
            reviewed_yes = await self._get_reviewed_stories(project_filter, period_from=period_from, period_to=period_to, reviewed=True)
            reviewed_no = await self._get_reviewed_stories(project_filter, period_from=period_from, period_to=period_to, reviewed=False)
            not_set = total_stories - reviewed_yes - reviewed_no
            
            review_percentage = (reviewed_yes / total_stories * 100) if total_stories > 0 else 0
            
            ai_analysis = await self._generate_single_period_ai_analysis(
                portfolio=portfolio,
                total_stories=total_stories,
                reviewed_yes=reviewed_yes,
                reviewed_no=reviewed_no,
                not_set=not_set,
                review_percentage=review_percentage,
                period_label=f"{period_to}"
            )
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "total_stories": total_stories,
                "period": {
                    "from": period_from,
                    "to": period_to,
                    "reviewed_yes": reviewed_yes,
                    "reviewed_no": reviewed_no,
                    "not_set": not_set,
                    "review_percentage": round(review_percentage, 1),
                    "jql_queries": jql_queries
                },
                "jql_queries": jql_queries,
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Test case review status analysis completed")
            logger.info(f"   Period: {reviewed_yes}/{total_stories} ({review_percentage:.1f}%)")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Test case review status analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def compare_periods(self, portfolio: str, period1_from: str, period1_to: str, period2_from: str, period2_to: str, summary_mode: bool = False) -> Dict:
        """Compare test case review status between two periods
        
        Args:
            portfolio: Project name or key
            period1_from: Start date for period 1
            period1_to: End date for period 1
            period2_from: Start date for period 2
            period2_to: End date for period 2
            summary_mode: If True, returns minimal AI analysis (suitable for consolidated views). 
                         If False, returns detailed project-level analysis.
        """
        logger.info(f"📊 Analyzing test case review status for {portfolio}")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        logger.info(f"   Summary Mode: {summary_mode}")
        
        try:
            # Validate projects at entry point
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Using project filter: {project_filter}")
            
            # Build JQL queries for debugging/display
            base_jql_p1 = self._closed_story_window_jql(project_filter, period1_from, period1_to)
            base_jql_p2 = self._closed_story_window_jql(project_filter, period2_from, period2_to)
            jql_p1_reviewed_yes = f'{base_jql_p1} AND "Test Case Reviewed" = Yes'
            jql_p2_reviewed_yes = f'{base_jql_p2} AND "Test Case Reviewed" = Yes'
            jql_queries = [
                f"Period 1 - Total Stories: {base_jql_p1}",
                f"Period 1 - Reviewed Yes: {jql_p1_reviewed_yes}",
                f"Period 2 - Total Stories: {base_jql_p2}",
                f"Period 2 - Reviewed Yes: {jql_p2_reviewed_yes}"
            ]
            
            # Get totals and reviewed counts for each period (filtered by date range)
            period1_total_stories = await self._get_total_stories(project_filter, period_from=period1_from, period_to=period1_to)
            period2_total_stories = await self._get_total_stories(project_filter, period_from=period2_from, period_to=period2_to)
            
            period1_reviewed_yes = await self._get_reviewed_stories(project_filter, period_from=period1_from, period_to=period1_to, reviewed=True)
            period1_reviewed_no = await self._get_reviewed_stories(project_filter, period_from=period1_from, period_to=period1_to, reviewed=False)
            period2_reviewed_yes = await self._get_reviewed_stories(project_filter, period_from=period2_from, period_to=period2_to, reviewed=True)
            period2_reviewed_no = await self._get_reviewed_stories(project_filter, period_from=period2_from, period_to=period2_to, reviewed=False)
            
            period1_not_set = period1_total_stories - period1_reviewed_yes - period1_reviewed_no
            period2_not_set = period2_total_stories - period2_reviewed_yes - period2_reviewed_no
            
            # Use period2 totals for overall total (current period)
            total_stories = period2_total_stories
            
            # Calculate percentages using each period's own total stories
            period1_percentage = (period1_reviewed_yes / period1_total_stories * 100) if period1_total_stories > 0 else 0
            period2_percentage = (period2_reviewed_yes / period2_total_stories * 100) if period2_total_stories > 0 else 0
            
            progress = period2_percentage - period1_percentage
            new_reviewed = period2_reviewed_yes - period1_reviewed_yes
            
            # Generate AI analysis based on mode
            if summary_mode:
                ai_analysis = self._generate_summary_analysis(
                    portfolio=portfolio,
                    period1_percentage=period1_percentage,
                    period2_percentage=period2_percentage,
                    progress=progress
                )
            else:
                ai_analysis = await self._generate_ai_analysis(
                    portfolio=portfolio,
                    total_stories=total_stories,
                    period1_reviewed_yes=period1_reviewed_yes,
                    period1_reviewed_no=period1_reviewed_no,
                    period1_not_set=period1_not_set,
                    period1_percentage=period1_percentage,
                    period2_reviewed_yes=period2_reviewed_yes,
                    period2_reviewed_no=period2_reviewed_no,
                    period2_not_set=period2_not_set,
                    period2_percentage=period2_percentage,
                    progress=progress,
                    new_reviewed=new_reviewed,
                    period1_label=f"{period1_to}",
                    period2_label=f"{period2_to}"
                )
            
            # Generate grand total with high-level summary analysis
            grand_total_analysis = await self._generate_grand_total_analysis(
                portfolio=portfolio,
                period1_percentage=period1_percentage,
                period2_percentage=period2_percentage,
                progress=progress,
                period1_reviewed_yes=period1_reviewed_yes,
                period1_total=period1_total_stories,
                period2_reviewed_yes=period2_reviewed_yes,
                period2_total=period2_total_stories,
                period1_label=period1_to,
                period2_label=period2_to
            )
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "total_stories": total_stories,
                "jql_queries": jql_queries,
                "period1": {
                    "from": period1_from,
                    "to": period1_to,
                    "week_ending": period1_to,
                    "reviewed_yes": period1_reviewed_yes,
                    "reviewed_no": period1_reviewed_no,
                    "not_set": period1_not_set,
                    "review_percentage": round(period1_percentage, 1),
                    "jql_queries": [jql_queries[0], jql_queries[1]]
                },
                "period2": {
                    "from": period2_from,
                    "to": period2_to,
                    "week_ending": period2_to,
                    "reviewed_yes": period2_reviewed_yes,
                    "reviewed_no": period2_reviewed_no,
                    "not_set": period2_not_set,
                    "review_percentage": round(period2_percentage, 1),
                    "jql_queries": [jql_queries[2], jql_queries[3]]
                },
                "progress": {
                    "percentage_change": round(progress, 1),
                    "wow_progress_pct": round(progress, 1),
                    "new_reviewed": new_reviewed,
                    "trend": "improving" if progress > 0 else "declining" if progress < 0 else "stable"
                },
                "ai_analysis": ai_analysis,
                "grand_total": {
                    "label": "Grand Total",
                    "period1_reviewed_yes": period1_reviewed_yes,
                    "period1_total": period1_total_stories,
                    "period1_percentage": round(period1_percentage, 1),
                    "period2_reviewed_yes": period2_reviewed_yes,
                    "period2_total": period2_total_stories,
                    "period2_percentage": round(period2_percentage, 1),
                    "progress_change": round(progress, 1),
                    "ai_analysis": grand_total_analysis
                }
            }
            
            logger.info(f"✅ Test case review status analysis completed")
            logger.info(f"   Period 1: {period1_reviewed_yes}/{total_stories} ({period1_percentage:.1f}%)")
            logger.info(f"   Period 2: {period2_reviewed_yes}/{total_stories} ({period2_percentage:.1f}%)")
            logger.info(f"   Progress: {progress:+.1f} percentage points")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Test case review status analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_ai_analysis(self, portfolio: str, total_stories: int,
                                   period1_reviewed_yes: int, period1_reviewed_no: int, period1_not_set: int, period1_percentage: float,
                                   period2_reviewed_yes: int, period2_reviewed_no: int, period2_not_set: int, period2_percentage: float,
                                   progress: float, new_reviewed: int,
                                   period1_label: str, period2_label: str) -> str:
        """Generate AI analysis for test case review status comparison"""
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing test case review status progress for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- Total Stories: {total_stories}
- As of {period1_date}: {period1_reviewed_yes} reviewed Yes ({period1_percentage:.1f}%), {period1_reviewed_no} No, {period1_not_set} not set
- As of {period2_date}: {period2_reviewed_yes} reviewed Yes ({period2_percentage:.1f}%), {period2_reviewed_no} No, {period2_not_set} not set
- Progress: {"+" if progress >= 0 else ""}{progress:.1f} percentage points
- New Reviewed: {new_reviewed} stories

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the review status progress
2. Highlights key numbers
3. Provides actionable next steps

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
            return self._build_review_fallback_comment(
                portfolio=portfolio,
                period1_percentage=period1_percentage,
                period2_percentage=period2_percentage,
                progress=progress,
                period2_reviewed_yes=period2_reviewed_yes,
                period2_total=total_stories,
                pending_review=period2_not_set + period2_reviewed_no,
                new_reviewed=new_reviewed,
            )
    
    def _generate_summary_analysis(self, portfolio: str, period1_percentage: float, period2_percentage: float, progress: float) -> str:
        """Generate simple summary-level analysis (for consolidated/summary views)
        
        This returns a minimal, high-level statement suitable for display in summary tables
        without detailed project-level commentary.
        """
        trend_emoji = "📈" if progress > 0 else "📉" if progress < 0 else "➡️"
        
        if progress > 5:
            return f"{trend_emoji} Coverage improved {progress:+.1f}pp ({period1_percentage:.1f}% → {period2_percentage:.1f}%)"
        elif progress < -5:
            return f"{trend_emoji} Coverage declined {progress:.1f}pp ({period1_percentage:.1f}% → {period2_percentage:.1f}%)"
        elif progress == 0:
            return f"{trend_emoji} Coverage stable at {period2_percentage:.1f}%"
        else:
            return f"{trend_emoji} Coverage changed {progress:+.1f}pp ({period1_percentage:.1f}% → {period2_percentage:.1f}%)"
    
    async def _generate_grand_total_analysis(self, portfolio: str, period1_percentage: float, period2_percentage: float, 
                                            progress: float, period1_reviewed_yes: int, period1_total: int,
                                            period2_reviewed_yes: int, period2_total: int,
                                            period1_label: str, period2_label: str) -> str:
        """Generate high-level grand total analysis for overall portfolio/project status
        
        This provides a summary overview of the entire project's test case review progress
        without going into project-specific details.
        """
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            prompt = f"""You are a Senior Quality Engineering Manager providing a high-level executive summary.

OVERALL PROJECT STATUS - {portfolio}:
- Week ending {period1_date}: {period1_reviewed_yes}/{period1_total} stories reviewed ({period1_percentage:.1f}%)
- Week ending {period2_date}: {period2_reviewed_yes}/{period2_total} stories reviewed ({period2_percentage:.1f}%)
- Week-over-Week Change: {progress:+.1f} percentage points
- New stories reviewed: {period2_reviewed_yes - period1_reviewed_yes}

Provide a CONCISE, HIGH-LEVEL executive summary (2-3 sentences max) that:
1. States the overall test case review coverage status and trend
2. Highlights the key metric (e.g., "Overall at 30.7% coverage")
3. Gives ONE clear, actionable recommendation for improvement

Focus on OVERALL portfolio health, not individual projects. Be direct and metrics-focused."""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing clear, concise portfolio-level insights for executive stakeholders."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=300
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ Grand total AI analysis generated")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ Grand total AI analysis generation failed: {e}")
            # Fallback response
            if progress > 0:
                trend = "improving"
            elif progress < 0:
                trend = "declining"
            else:
                trend = "stable"
            
            if period2_percentage >= 80:
                severity = "Strong"
                action = "Maintain momentum and ensure consistency across all stories."
            elif period2_percentage >= 50:
                severity = "Moderate"
                action = "Increase review coverage to reach 80%+ target within next sprint cycle."
            else:
                severity = "Below Target"
                action = "Establish clear review ownership and set weekly review targets to improve coverage."
            
            return f"{severity} test case review coverage ({period2_percentage:.1f}%) with {trend} trend ({progress:+.1f}pp WoW). {action}"
    
    async def _generate_single_period_ai_analysis(self, portfolio: str, total_stories: int, reviewed_yes: int,
                                                  reviewed_no: int, not_set: int, review_percentage: float, period_label: str) -> str:
        """Generate AI analysis for single period test case review status"""
        try:
            try:
                period_date = datetime.strptime(period_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period_date = period_label
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing test case review status for the {portfolio} portfolio.

Current Situation:
- Portfolio: {portfolio}
- Total Stories: {total_stories}
- As of {period_date}: {reviewed_yes} reviewed Yes ({review_percentage:.1f}%), {reviewed_no} No, {not_set} not set

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the current review status
2. Highlights key numbers
3. Provides actionable next steps

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
            pending_review = reviewed_no + not_set
            focus = self._review_focus(portfolio)
            if review_percentage >= 80:
                return f"{portfolio} has strong review discipline at {review_percentage:.1f}% ({reviewed_yes}/{total_stories} stories reviewed). Clear the remaining {pending_review} stories with a quick audit of {focus} to keep the portfolio above target."
            if review_percentage >= 60:
                return f"{portfolio} is mid-pack on review completion at {review_percentage:.1f}% ({reviewed_yes}/{total_stories}). Prioritize review sign-off for the remaining {pending_review} stories, especially {focus}, before more scope rolls into the next weekly cut."
            return f"{portfolio} needs a focused review push: only {reviewed_yes}/{total_stories} stories have review evidence ({review_percentage:.1f}%). Start with {focus} and make the review field a closure gate for the remaining {pending_review} stories."
    
    async def analyze_portfolio_consolidated(self, portfolios: List[str], period1_from: str, period1_to: str, period2_from: str, period2_to: str) -> Dict:
        """
        Analyze test case review status across multiple portfolios and provide high-level consolidated response.
        Instead of individual project comments, returns a single comprehensive portfolio-level analysis.
        """
        logger.info(f"📊 Analyzing consolidated test case review status for {len(portfolios)} portfolios")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        
        try:
            # Analyze each portfolio
            portfolio_results = []
            for portfolio in portfolios:
                try:
                    result = await self.compare_periods(
                        portfolio=portfolio,
                        period1_from=period1_from,
                        period1_to=period1_to,
                        period2_from=period2_from,
                        period2_to=period2_to
                    )
                    portfolio_results.append(result)
                    logger.info(f"✅ Analyzed {portfolio}: {result['period2']['review_percentage']}%")
                except Exception as e:
                    logger.error(f"❌ Failed to analyze {portfolio}: {e}")
                    continue
            
            if not portfolio_results:
                raise Exception("No portfolio analyses completed successfully")
            
            # Calculate grand totals
            grand_total_stories_p1 = sum(r['period1']['reviewed_yes'] for r in portfolio_results)
            grand_total_stories_p2 = sum(r['period2']['reviewed_yes'] for r in portfolio_results)
            grand_total_all_p1 = sum(r['period1']['reviewed_yes'] + r['period1']['reviewed_no'] + r['period1']['not_set'] for r in portfolio_results)
            grand_total_all_p2 = sum(r['period2']['reviewed_yes'] + r['period2']['reviewed_no'] + r['period2']['not_set'] for r in portfolio_results)
            
            grand_percentage_p1 = (grand_total_stories_p1 / grand_total_all_p1 * 100) if grand_total_all_p1 > 0 else 0
            grand_percentage_p2 = (grand_total_stories_p2 / grand_total_all_p2 * 100) if grand_total_all_p2 > 0 else 0
            grand_progress = grand_percentage_p2 - grand_percentage_p1
            
            # Rank portfolios by review coverage (ascending) to identify ones needing attention
            portfolios_by_coverage = sorted(
                portfolio_results,
                key=lambda x: x['period2']['review_percentage']
            )
            
            # Generate consolidated AI analysis
            consolidated_analysis = await self._generate_consolidated_ai_analysis(
                portfolios=portfolio_results,
                grand_percentage_p1=grand_percentage_p1,
                grand_percentage_p2=grand_percentage_p2,
                grand_progress=grand_progress,
                grand_total_stories_p1=grand_total_stories_p1,
                grand_total_stories_p2=grand_total_stories_p2,
                grand_total_all_p1=grand_total_all_p1,
                grand_total_all_p2=grand_total_all_p2,
                period1_label=period1_to,
                period2_label=period2_to
            )
            
            # Build consolidated result
            result = {
                "portfolio": "Fortellis (Consolidated)",
                "report_type": "consolidated_portfolio",
                "total_portfolios": len(portfolio_results),
                "period1": {
                    "from": period1_from,
                    "to": period1_to,
                    "reviewed_yes": grand_total_stories_p1,
                    "total_stories": grand_total_all_p1,
                    "review_percentage": round(grand_percentage_p1, 1)
                },
                "period2": {
                    "from": period2_from,
                    "to": period2_to,
                    "reviewed_yes": grand_total_stories_p2,
                    "total_stories": grand_total_all_p2,
                    "review_percentage": round(grand_percentage_p2, 1)
                },
                "progress": {
                    "percentage_change": round(grand_progress, 1),
                    "new_reviewed": grand_total_stories_p2 - grand_total_stories_p1,
                    "trend": "improving" if grand_progress > 0 else "declining" if grand_progress < 0 else "stable"
                },
                "portfolio_breakdown": [
                    {
                        "portfolio": r['portfolio'],
                        "review_percentage": r['period2']['review_percentage'],
                        "reviewed_yes": r['period2']['reviewed_yes'],
                        "total_stories": r['period2']['reviewed_yes'] + r['period2']['reviewed_no'] + r['period2']['not_set'],
                        "trend": r['progress']['trend'],
                        "priority": "critical" if r['period2']['review_percentage'] < 10 else "high" if r['period2']['review_percentage'] < 50 else "medium" if r['period2']['review_percentage'] < 80 else "low"
                    }
                    for r in portfolios_by_coverage
                ],
                "focus_areas": [
                    r['portfolio'] for r in portfolios_by_coverage[:3]  # Top 3 portfolios needing attention
                    if r['period2']['review_percentage'] < grand_percentage_p2
                ],
                "ai_analysis": consolidated_analysis,
                "grand_total": {
                    "label": "Grand Total (All Portfolios)",
                    "period1_reviewed_yes": grand_total_stories_p1,
                    "period1_total": grand_total_all_p1,
                    "period1_percentage": round(grand_percentage_p1, 1),
                    "period2_reviewed_yes": grand_total_stories_p2,
                    "period2_total": grand_total_all_p2,
                    "period2_percentage": round(grand_percentage_p2, 1),
                    "progress_change": round(grand_progress, 1),
                    "ai_analysis": consolidated_analysis,
                    "total_portfolios_analyzed": len(portfolio_results),
                    "portfolios_on_track": sum(1 for p in portfolio_results if p['period2']['review_percentage'] >= 80),
                    "portfolios_at_risk": sum(1 for p in portfolio_results if p['period2']['review_percentage'] < 50)
                }
            }
            
            logger.info(f"✅ Consolidated portfolio analysis completed")
            logger.info(f"   Grand Total: {grand_total_stories_p2}/{grand_total_all_p2} ({grand_percentage_p2:.1f}%)")
            logger.info(f"   Progress: {grand_progress:+.1f} percentage points")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Consolidated portfolio analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_consolidated_ai_analysis(self, portfolios: List[Dict], 
                                                grand_percentage_p1: float, grand_percentage_p2: float, 
                                                grand_progress: float,
                                                grand_total_stories_p1: int, grand_total_stories_p2: int,
                                                grand_total_all_p1: int, grand_total_all_p2: int,
                                                period1_label: str, period2_label: str) -> str:
        """Generate consolidated AI analysis for the entire Fortellis portfolio"""
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            # Build portfolio summary for context
            portfolio_summary = "\n".join([
                f"- {p['portfolio']}: {p['review_percentage']:.1f}% ({p['reviewed_yes']}/{p['total_stories']})"
                for p in sorted(portfolios, key=lambda x: x['review_percentage'])
            ])
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing the OVERALL Test Case Review Status across the entire Fortellis portfolio.

PORTFOLIO SUMMARY (Week ending {period2_date}):
{portfolio_summary}

GRAND TOTALS:
- Week ending {period1_date}: {grand_total_stories_p1}/{grand_total_all_p1} stories reviewed ({grand_percentage_p1:.1f}%)
- Week ending {period2_date}: {grand_total_stories_p2}/{grand_total_all_p2} stories reviewed ({grand_percentage_p2:.1f}%)
- Progress: {grand_progress:+.1f} percentage points

Provide a CONCISE, HIGH-LEVEL analysis (3-4 sentences max) that:
1. Summarizes the overall portfolio status and trend
2. Highlights the key concern (e.g., "Portfolio is at 30.7% coverage with a -0.7% regression")
3. Identifies which 1-2 projects need the MOST immediate attention based on their coverage %
4. Gives ONE actionable priority recommendation for the entire portfolio

Be direct and executive-friendly. Focus on grand totals and portfolio-level insights, not individual projects."""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing clear, concise portfolio-level insights for executive stakeholders."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=400
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ Consolidated AI analysis generated")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ Consolidated AI analysis generation failed: {e}")
            # Fallback analysis
            status_msg = "improving" if grand_progress > 0 else "declining" if grand_progress < 0 else "stalled"
            focus_msg = "Focus immediately on improving the lowest-performing projects."
            
            if grand_percentage_p2 < 20:
                severity = "CRITICAL"
                recommendation = "Assign dedicated review owners and set aggressive weekly targets (20+ stories/week per portfolio)."
            elif grand_percentage_p2 < 50:
                severity = "HIGH"
                recommendation = "Establish clear review SLAs and mandatory review checkpoints before story closure."
            elif grand_percentage_p2 < 80:
                severity = "MEDIUM"
                recommendation = "Increase review throughput to reach 90% coverage target within next 2 sprints."
            else:
                severity = "LOW"
                recommendation = "Maintain current momentum and prevent regressions."
            
            return f"[{severity}] Portfolio test case review coverage is {status_msg} at {grand_percentage_p2:.1f}% ({grand_total_stories_p2}/{grand_total_all_p2} stories). {focus_msg} {recommendation}"

    
    async def analyze_by_portfolio_groups(self, projects: List[str], period1_from: str, period1_to: str, period2_from: str, period2_to: str) -> Dict:
        """
        Analyze test case review status grouped by portfolio.
        Returns portfolio-level responses with concerning areas identified.
        
        Projects are grouped using the Jira category captured in this run's
        immutable project-catalog snapshot.
        """
        logger.info(f"📊 Analyzing test case review status by portfolio groups")
        logger.info(f"   Projects: {projects}")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        
        try:
            # Group projects by portfolio
            portfolio_groups_data = {}
            for project in projects:
                portfolio_group = self.project_catalog.get_portfolio_for_project(project)
                logger.info(f"   📌 Mapping project '{project}' → Portfolio: '{portfolio_group}'")
                if portfolio_group not in portfolio_groups_data:
                    portfolio_groups_data[portfolio_group] = []
                portfolio_groups_data[portfolio_group].append(project)
            
            logger.info(f"📂 Grouped {len(projects)} projects into {len(portfolio_groups_data)} portfolio groups:")
            for portfolio, projs in portfolio_groups_data.items():
                logger.info(f"   ✅ {portfolio}: {', '.join(projs)}")
            
            # Analyze each portfolio group
            portfolio_analyses = []
            grand_total_p1 = {"reviewed_yes": 0, "total": 0}
            grand_total_p2 = {"reviewed_yes": 0, "total": 0}
            
            for portfolio_group, group_projects in portfolio_groups_data.items():
                logger.info(f"🔍 Analyzing portfolio group: {portfolio_group} ({len(group_projects)} projects)")
                
                # Analyze each project in the group
                project_results = []
                for project in group_projects:
                    try:
                        result = await self.compare_periods(
                            portfolio=project,
                            period1_from=period1_from,
                            period1_to=period1_to,
                            period2_from=period2_from,
                            period2_to=period2_to,
                            summary_mode=True
                        )
                        project_results.append(result)
                        logger.info(f"   ✅ {project}: {result['period2']['review_percentage']}%")
                    except Exception as e:
                        logger.error(f"   ❌ Failed to analyze {project}: {e}")
                        continue
                
                if not project_results:
                    logger.warning(f"⚠️ No successful analyses for {portfolio_group}")
                    continue
                
                # Calculate portfolio group aggregates
                p1_reviewed_yes = sum(r['period1']['reviewed_yes'] for r in project_results)
                p1_total = sum(r['period1']['reviewed_yes'] + r['period1']['reviewed_no'] + r['period1']['not_set'] for r in project_results)
                p2_reviewed_yes = sum(r['period2']['reviewed_yes'] for r in project_results)
                p2_total = sum(r['period2']['reviewed_yes'] + r['period2']['reviewed_no'] + r['period2']['not_set'] for r in project_results)
                
                # Update grand totals
                grand_total_p1["reviewed_yes"] += p1_reviewed_yes
                grand_total_p1["total"] += p1_total
                grand_total_p2["reviewed_yes"] += p2_reviewed_yes
                grand_total_p2["total"] += p2_total
                
                p1_percentage = (p1_reviewed_yes / p1_total * 100) if p1_total > 0 else 0
                p2_percentage = (p2_reviewed_yes / p2_total * 100) if p2_total > 0 else 0
                progress = p2_percentage - p1_percentage
                quoted_projects = ", ".join(f'"{project}"' for project in group_projects)
                group_project_filter = (
                    f"project IN ({quoted_projects})"
                    if len(group_projects) > 1
                    else f'project = "{group_projects[0]}"'
                )
                group_jql_p1_total = self._closed_story_window_jql(group_project_filter, period1_from, period1_to)
                group_jql_p1_reviewed = f'{group_jql_p1_total} AND "Test Case Reviewed" = Yes'
                group_jql_p2_total = self._closed_story_window_jql(group_project_filter, period2_from, period2_to)
                group_jql_p2_reviewed = f'{group_jql_p2_total} AND "Test Case Reviewed" = Yes'
                group_jql_queries = [
                    f"Period 1 - Total Stories: {group_jql_p1_total}",
                    f"Period 1 - Reviewed Yes: {group_jql_p1_reviewed}",
                    f"Period 2 - Total Stories: {group_jql_p2_total}",
                    f"Period 2 - Reviewed Yes: {group_jql_p2_reviewed}"
                ]
                
                logger.info(f"📊 {portfolio_group} aggregates:")
                logger.info(f"   Period 1: {p1_reviewed_yes}/{p1_total} = {p1_percentage:.1f}%")
                logger.info(f"   Period 2: {p2_reviewed_yes}/{p2_total} = {p2_percentage:.1f}%")
                logger.info(f"   Progress: {progress:.1f} percentage points")
                
                # Identify concerning areas (projects with low coverage or declining)
                concerning_areas = [
                    r['portfolio'] for r in sorted(
                        project_results,
                        key=lambda x: x['period2']['review_percentage']
                    )
                    if r['period2']['review_percentage'] < 50 or r['progress']['trend'] == 'declining'
                ][:3]  # Top 3 concerning
                
                on_track_areas = [
                    r['portfolio'] for r in project_results
                    if r['period2']['review_percentage'] >= 80 and r['progress']['trend'] == 'improving'
                ]
                
                # Generate portfolio-level AI analysis
                portfolio_analysis = await self._generate_portfolio_group_analysis(
                    portfolio_group=portfolio_group,
                    projects=project_results,
                    p1_percentage=p1_percentage,
                    p2_percentage=p2_percentage,
                    progress=progress,
                    concerning_areas=concerning_areas,
                    period1_label=period1_to,
                    period2_label=period2_to
                )
                
                # Build portfolio group response
                portfolio_response = {
                    "portfolio": portfolio_group,
                    "period1_from": period1_from,
                    "period1_to": period1_to,
                    "period2_from": period2_from,
                    "period2_to": period2_to,
                    "period1_percentage": round(p1_percentage, 1),
                    "period2_percentage": round(p2_percentage, 1),
                    "period1_reviewed_yes": p1_reviewed_yes,
                    "period1_total": p1_total,
                    "period2_reviewed_yes": p2_reviewed_yes,
                    "period2_total": p2_total,
                    "progress": round(progress, 1),
                    "projects_count": len(group_projects),
                    "projects": group_projects,
                    "project_filter": group_project_filter,
                    "jql_queries": group_jql_queries,
                    "ai_analysis": portfolio_analysis,
                    "concerning_areas": concerning_areas,
                    "on_track_areas": on_track_areas,
                    "project_breakdown": [
                        {
                            "project": r['portfolio'],
                            "period1_percentage": r['period1']['review_percentage'],
                            "period2_percentage": r['period2']['review_percentage'],
                            "progress": r['progress']['percentage_change'],
                            "trend": r['progress']['trend'],
                            "ai_analysis": r['ai_analysis']
                        }
                        for r in sorted(project_results, key=lambda x: x['period2']['review_percentage'])
                    ]
                }
                
                portfolio_analyses.append(portfolio_response)
                logger.info(f"✅ {portfolio_group}: {p2_percentage:.1f}% ({p2_reviewed_yes}/{p2_total})")
            
            # Calculate grand total metrics
            grand_p1_percentage = (grand_total_p1["reviewed_yes"] / grand_total_p1["total"] * 100) if grand_total_p1["total"] > 0 else 0
            grand_p2_percentage = (grand_total_p2["reviewed_yes"] / grand_total_p2["total"] * 100) if grand_total_p2["total"] > 0 else 0
            grand_progress = grand_p2_percentage - grand_p1_percentage
            
            # Generate enterprise-wide grand total analysis
            grand_total_analysis = await self._generate_enterprise_grand_total_analysis(
                portfolio_analyses=portfolio_analyses,
                grand_p1_percentage=grand_p1_percentage,
                grand_p2_percentage=grand_p2_percentage,
                grand_progress=grand_progress,
                grand_total_p1=grand_total_p1,
                grand_total_p2=grand_total_p2,
                period1_label=period1_to,
                period2_label=period2_to
            )
            
            # Build final response
            result = {
                "success": True,
                "report_type": "portfolio_groups",
                "analyses": portfolio_analyses,
                "grand_total": {
                    "period1_percentage": round(grand_p1_percentage, 1),
                    "period2_percentage": round(grand_p2_percentage, 1),
                    "progress": round(grand_progress, 1),
                    "total_projects": len(projects),
                    "total_portfolios": len(portfolio_groups_data),
                    "reviewed_yes_p1": grand_total_p1["reviewed_yes"],
                    "total_stories_p1": grand_total_p1["total"],
                    "reviewed_yes_p2": grand_total_p2["reviewed_yes"],
                    "total_stories_p2": grand_total_p2["total"],
                    "ai_analysis": grand_total_analysis,
                    "concerning_portfolios": [p["portfolio"] for p in portfolio_analyses if p["progress"] < 0 or p["period2_percentage"] < 50],
                    "improving_portfolios": [p["portfolio"] for p in portfolio_analyses if p["progress"] > 0]
                }
            }
            
            logger.info(f"✅ Portfolio group analysis completed")
            logger.info(f"   Grand Total: {grand_total_p2['reviewed_yes']}/{grand_total_p2['total']} ({grand_p2_percentage:.1f}%)")
            logger.info(f"   Progress: {grand_progress:+.1f} percentage points")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Portfolio group analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_portfolio_group_analysis(self, portfolio_group: str, projects: List[Dict],
                                                p1_percentage: float, p2_percentage: float,
                                                progress: float, concerning_areas: List[str],
                                                period1_label: str, period2_label: str) -> str:
        """Generate high-level analysis for a portfolio group (Fortellis or Payments)"""
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            # Build project summary
            project_summary = "\n".join([
                f"- {p['portfolio']}: {p['period2']['review_percentage']:.1f}% (trend: {p['progress']['trend']})"
                for p in sorted(projects, key=lambda x: x['period2']['review_percentage'])
            ])
            
            concerning_str = ", ".join(concerning_areas) if concerning_areas else "None"
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing the {portfolio_group} portfolio test case review status.

PORTFOLIO GROUP: {portfolio_group}
REPORT DATE: {period2_date}
PROJECTS IN GROUP:
{project_summary}

KEY METRICS:
- Week ending {period1_date}: {p1_percentage:.1f}% coverage
- Week ending {period2_date}: {p2_percentage:.1f}% coverage
- Progress: {progress:+.1f} percentage points
- Concerning Projects: {concerning_str}

Generate a CONCISE HIGH-LEVEL response (2-3 sentences max) that:
1. States the {portfolio_group} portfolio's current test case review coverage and trend
2. Identifies the main concern (declining? too low? specific projects at risk?)
3. Recommends ONE immediate action

Be direct, factual, and executive-friendly. No fluff."""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing concise, actionable portfolio insights."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=350
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ {portfolio_group} portfolio analysis generated")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ Portfolio group analysis generation failed: {e}")
            # Fallback analysis
            status = "improving" if progress > 0 else "declining" if progress < 0 else "stalled"
            severity = "CRITICAL" if p2_percentage < 20 else "HIGH" if p2_percentage < 50 else "MEDIUM" if p2_percentage < 80 else "LOW"
            
            concerning_msg = f"Concerning projects: {', '.join(concerning_areas)}." if concerning_areas else "Most projects on track."
            
            return f"[{severity}] {portfolio_group} test case review coverage at {p2_percentage:.1f}% ({status} {progress:+.1f}pp). {concerning_msg} Focus on recovery plans for underperforming projects."
    
    async def _generate_enterprise_grand_total_analysis(self, portfolio_analyses: List[Dict],
                                                       grand_p1_percentage: float, grand_p2_percentage: float,
                                                       grand_progress: float,
                                                       grand_total_p1: Dict, grand_total_p2: Dict,
                                                       period1_label: str, period2_label: str) -> str:
        """Generate enterprise-wide grand total analysis across all portfolio groups"""
        try:
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            # Build portfolio summary
            portfolio_summary = "\n".join([
                f"- {p['portfolio']}: {p['period2_percentage']:.1f}% (progress: {p['progress']:+.1f}pp)"
                for p in portfolio_analyses
            ])
            
            improving = [p['portfolio'] for p in portfolio_analyses if p['progress'] > 0]
            declining = [p['portfolio'] for p in portfolio_analyses if p['progress'] < 0]
            
            prompt = f"""You are a Senior Quality Engineering Manager providing enterprise-level test case review status insights.

ENTERPRISE GRAND TOTAL (All Portfolios):
{portfolio_summary}

KEY METRICS:
- Week ending {period1_date}: {grand_p1_percentage:.1f}% ({grand_total_p1['reviewed_yes']}/{grand_total_p1['total']} stories)
- Week ending {period2_date}: {grand_p2_percentage:.1f}% ({grand_total_p2['reviewed_yes']}/{grand_total_p2['total']} stories)
- Overall Progress: {grand_progress:+.1f} percentage points
- Improving: {', '.join(improving) if improving else 'None'}
- Declining: {', '.join(declining) if declining else 'None'}

Generate a CONCISE EXECUTIVE SUMMARY (2-3 sentences max) that:
1. States the enterprise-wide test case review coverage status
2. Highlights the critical issue (which portfolio groups need help)
3. Recommends ONE enterprise-level action

Be direct, factual, and executive-friendly. Focus on portfolio groups, not individual projects."""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Executive providing clear portfolio-level insights."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=350
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ Enterprise grand total analysis generated")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ Enterprise grand total analysis generation failed: {e}")
            # Fallback analysis
            status = "improving" if grand_progress > 0 else "declining" if grand_progress < 0 else "stalled"
            severity = "CRITICAL" if grand_p2_percentage < 20 else "HIGH" if grand_p2_percentage < 50 else "MEDIUM" if grand_p2_percentage < 80 else "LOW"
            
            declining_str = ", ".join([p['portfolio'] for p in portfolio_analyses if p['progress'] < 0])
            declining_msg = f" {declining_str} portfolio groups declining." if declining_str else ""
            
            return f"[{severity}] Enterprise test case review coverage at {grand_p2_percentage:.1f}% ({status} {grand_progress:+.1f}pp).{declining_msg} Establish recovery plans for all underperforming portfolio groups."


