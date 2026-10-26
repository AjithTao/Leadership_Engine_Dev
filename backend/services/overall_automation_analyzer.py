"""
Overall Automation Analyzer Module

Analyzes overall test automation metrics for portfolios by comparing 
automated vs manual test cases across different time periods.

Formula: Overall Automation % = Automated Test Cases / Total Test Cases × 100

Author: FalconX Team
Created: 2025-01-XX
"""

from typing import Dict, List, Optional
from datetime import datetime
import logging
from openai import AsyncOpenAI
import os

logger = logging.getLogger(__name__)

class OverallAutomationAnalyzer:
    """
    Analyze overall automation metrics for quality reporting
    
    Overall Automation measures the percentage of ALL test cases
    that are automated vs manual (not just regression tests).
    
    Higher automation = Better overall test maturity
    Target: > 70% (industry standard)
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
        
        # Import shared portfolio mapping
        self.project_catalog = project_catalog
        self.portfolio_projects_list = project_catalog.portfolio_projects
        self._get_portfolio_projects = project_catalog.get_portfolio_projects
        self._build_project_jql = project_catalog.build_project_jql
        self._build_project_jql_with_validation = project_catalog.build_project_jql_with_validation
        
        # Portfolio → project mapping
        self.portfolio_projects = {
            project.key: {"name": project.name, "key": project.key}
            for project in project_catalog.projects
        }
    
    async def _resolve_project_key(self, portfolio: str) -> str:
        """Resolve one project through the injected Jira catalog."""
        return self._get_portfolio_projects(portfolio)[0]
    async def _fetch_all_issues(self, jql: str) -> List[Dict]:
        """
        Fetch all issues from Jira with pagination support
        
        Args:
            jql: JQL query string
        
        Returns:
            List of all issues
        """
        all_issues = []
        start_at = 0
        max_results_per_page = 2000  # Jira API limit per page
        total_count = None
        
        while True:
            try:
                results = await self.jira.search(jql, max_results=max_results_per_page, start_at=start_at)
                
                if isinstance(results, dict):
                    issues = results.get('issues', [])
                    # Get total count from first page
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
                
                # Check if we've fetched all issues
                if total_count and len(all_issues) >= total_count:
                    break
                
                # Check if this was the last page (fewer results than requested)
                if len(issues) < max_results_per_page:
                    break
                
                start_at += max_results_per_page
                
                # Safety limit to prevent infinite loops
                if len(all_issues) > 100000:  # Max 100k issues
                    logger.warning(f"⚠️ Reached safety limit of 100k issues, stopping pagination")
                    break
                    
            except Exception as e:
                logger.error(f"❌ Error fetching page at start_at={start_at}: {e}")
                break
        
        logger.info(f"✅ Total issues fetched: {len(all_issues)}")
        return all_issues
    
    async def _get_test_cases_snapshot(self, project_key: str, end_date: str, automated: bool = True) -> int:
        """
        Get count of test cases as of a specific date (snapshot approach)
        
        Args:
            project_key: Jira project key
            end_date: End date in YYYY-MM-DD format (snapshot as of this date)
            automated: True for automated tests, False for manual (non-automated) tests
        
        Returns:
            Count of test cases
        """
        if automated:
            # Automated test cases as of end_date (NO test type filter - all test cases)
            jql = f'project = "{project_key}" AND type = Test AND "Test Status" = Automated AND updatedDate <= "{end_date} 23:59"'
        else:
            # Manual (non-automated) test cases as of end_date (NO test type filter - all test cases)
            jql = f'project = "{project_key}" AND type = Test AND "Test Status" != Automated AND updatedDate <= "{end_date} 23:59"'
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            logger.info(f"📊 Found {count} {'automated' if automated else 'manual'} test cases as of {end_date}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying test cases: {e}")
            return 0
    
    async def _get_total_test_cases(self, project_key: str) -> int:
        """
        Get total count of test cases (current total) - ALL test types
        
        Args:
            project_key: Jira project key
        
        Returns:
            Total count of test cases
        """
        # NO test type filter - counts ALL test cases
        jql = f'project = "{project_key}" AND type = Test'
        
        try:
            all_issues = await self._fetch_all_issues(jql)
            count = len(all_issues)
            logger.info(f"📊 Found {count} total test cases for {project_key}")
            return count
        except Exception as e:
            logger.error(f"❌ Error querying total test cases: {e}")
            return 0
    
    async def _get_automation_breakdown(self, project_filter: str, end_date: str = None) -> Dict:
        """
        Get detailed breakdown of test cases by automation status (matching PDF structure).
        
        QCOE locked approach: week-ending snapshot based on tests created by the
        report date, excluding tests that were resolved after that date.
        Overall automation intentionally uses all test types.
        
        Categories:
        - Automated: Tests with "Test Status" = Automated
        - Requires Automation: Tests that need automation or are in automation work
        - Automation Not Required: Tests that don't need automation
        
        Args:
            project_filter: Jira project JQL filter
            end_date: Week-ending snapshot date (YYYY-MM-DD)
        
        Returns:
            Dict with automated, requires_automation, automation_not_required counts
        """
        date_filter = ""
        if end_date:
            date_filter = (
                f' AND created <= "{end_date} 23:59"'
                f' AND (resolution is EMPTY OR resolved <= "{end_date} 23:59")'
            )

        base_filter = f'{project_filter} AND issuetype = Test AND status NOT IN (Abandoned){date_filter}'
        
        # Get Automated count
        jql_automated = f'{base_filter} AND "Test Status" = Automated'
        # QCOE roll-up: include in-flight automation statuses in Requires Automation.
        jql_requires = f'{base_filter} AND "Test Status" IN ("Requires Automation", "In Progress", "Merged", "Repair")'
        # Get Automation Not Required count
        jql_not_required = f'{base_filter} AND "Test Status" = "Automation Not Required"'
        
        try:
            automated_issues = await self._fetch_all_issues(jql_automated)
            requires_issues = await self._fetch_all_issues(jql_requires)
            not_required_issues = await self._fetch_all_issues(jql_not_required)
            
            breakdown = {
                "automated": len(automated_issues),
                "requires_automation": len(requires_issues),
                "automation_not_required": len(not_required_issues),
                "jql_automated": jql_automated,
                "jql_requires_automation": jql_requires,
                "jql_automation_not_required": jql_not_required
            }
            
            logger.info(f"📊 Automation breakdown for {project_filter}: Automated={breakdown['automated']}, Requires={breakdown['requires_automation']}, Not Required={breakdown['automation_not_required']}")
            return breakdown
        except Exception as e:
            logger.error(f"❌ Error getting automation breakdown: {e}")
            return {"automated": 0, "requires_automation": 0, "automation_not_required": 0}
    
    async def analyze_single_period(self,
                                   portfolio: str,
                                   period_from: str,
                                   period_to: str,
                                   project_metrics: Optional[List[Dict]] = None) -> Dict:
        """
        Analyze overall automation metrics for a single period (no comparison)
        
        Args:
            portfolio: Jira project name or key
            period_from: Period start date (YYYY-MM-DD)
            period_to: Period end date (YYYY-MM-DD) - snapshot as of this date
        
        Returns:
            Dict containing automation breakdown matching PDF structure:
            - automated: Automated test count
            - requires_automation: Tests needing automation
            - automation_not_required: Tests not needing automation
            - automation_percentage_total: % against total
            - automation_percentage_automatable: % against automatable only
        """
        logger.info(f"📊 Analyzing overall automation for {portfolio} (single period)")
        logger.info(f"   Period: {period_from} to {period_to}")
        
        try:
            # Validate projects at entry point
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"📋 Project filter: {project_filter}")
            
            # Get automation breakdown (matching PDF structure)
            breakdown = await self._get_automation_breakdown(project_filter, period_to)
            
            automated = breakdown["automated"]
            requires_automation = breakdown["requires_automation"]
            automation_not_required = breakdown["automation_not_required"]
            
            # Total test cases
            total_test_cases = automated + requires_automation + automation_not_required
            # Automatable only (excludes "Automation Not Required")
            automatable_count = automated + requires_automation
            
            # Calculate percentages (matching PDF dual-table structure)
            # Table A: Automated / Total
            automation_percentage_total = (automated / total_test_cases * 100) if total_test_cases > 0 else 0
            # Table B: Automated / Automatable Only
            automation_percentage_automatable = (automated / automatable_count * 100) if automatable_count > 0 else 0
            
            # Generate AI analysis
            ai_analysis = await self._generate_single_period_ai_analysis(
                portfolio=portfolio,
                total_test_cases=total_test_cases,
                period_automated=automated,
                period_manual=requires_automation + automation_not_required,
                period_percentage=automation_percentage_total,
                period_label=f"{period_to}",
                project_metrics=project_metrics
            )
            
            # Build JQL queries for debugging/display
            jql_queries = [
                f"Automated: {breakdown.get('jql_automated', '')}",
                f"Requires Automation: {breakdown.get('jql_requires_automation', '')}",
                f"Automation Not Required: {breakdown.get('jql_automation_not_required', '')}"
            ]
            
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "total_test_cases": total_test_cases,
                "jql_queries": jql_queries,
                "period": {
                    "from": period_from,
                    "to": period_to,
                    # PDF structure fields
                    "automated": automated,
                    "requires_automation": requires_automation,
                    "automation_not_required": automation_not_required,
                    # Legacy fields for compatibility
                    "automated_count": automated,
                    "manual_count": requires_automation + automation_not_required,
                    # Dual percentages
                    "automation_percentage": round(automation_percentage_total, 1),
                    "automation_percentage_total": round(automation_percentage_total, 1),
                    "automation_percentage_automatable": round(automation_percentage_automatable, 1),
                    "jql_queries": jql_queries
                },
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Overall automation analysis completed")
            logger.info(f"   Period: {automated}/{total_test_cases} ({automation_percentage_total:.1f}%)")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Overall automation analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def compare_periods(self,
                            portfolio: str,
                            period1_from: str,
                            period1_to: str,
                            period2_from: str,
                            period2_to: str,
                            project_metrics: Optional[List[Dict]] = None) -> Dict:
        """
        Compare overall automation metrics between two periods (Snapshot approach)
        
        Args:
            portfolio: Jira project name or key
            period1_from: First period start date (YYYY-MM-DD)
            period1_to: First period end date (YYYY-MM-DD) - snapshot as of this date
            period2_from: Second period start date (YYYY-MM-DD)
            period2_to: Second period end date (YYYY-MM-DD) - snapshot as of this date
        
        Returns:
            Dict containing:
            - total_test_cases: Total test cases
            - period1_automated: Automated tests as of period1 end
            - period1_manual: Manual tests as of period1 end
            - period1_percentage: Automation % for period1
            - period2_automated: Automated tests as of period2 end
            - period2_manual: Manual tests as of period2 end
            - period2_percentage: Automation % for period2
            - progress: Change in automation percentage
            - new_automated: New tests automated between periods
            - ai_analysis: AI-generated insights
        """
        logger.info(f"📊 Analyzing overall automation for {portfolio}")
        logger.info(f"   Period 1: {period1_from} to {period1_to}")
        logger.info(f"   Period 2: {period2_from} to {period2_to}")
        
        try:
            # Validate projects at entry point
            project_filter = await self._build_project_jql_with_validation(self.jira, portfolio)
            if not project_filter:
                raise ValueError(f"No valid projects found for portfolio '{portfolio}'")
            logger.info(f"🔑 Project filter: {project_filter}")
            
            # Get automation breakdown for both periods (matching PDF structure)
            breakdown1 = await self._get_automation_breakdown(project_filter, period1_to)
            breakdown2 = await self._get_automation_breakdown(project_filter, period2_to)
            
            # Period 1 breakdown
            p1_automated = breakdown1["automated"]
            p1_requires_automation = breakdown1["requires_automation"]
            p1_automation_not_required = breakdown1["automation_not_required"]
            p1_total = p1_automated + p1_requires_automation + p1_automation_not_required
            p1_automatable = p1_automated + p1_requires_automation
            
            # Period 2 breakdown
            p2_automated = breakdown2["automated"]
            p2_requires_automation = breakdown2["requires_automation"]
            p2_automation_not_required = breakdown2["automation_not_required"]
            p2_total = p2_automated + p2_requires_automation + p2_automation_not_required
            p2_automatable = p2_automated + p2_requires_automation
            
            # Use current period total
            total_test_cases = p2_total
            
            # Calculate percentages for dual tables
            # Table A: Automated / Total
            p1_percentage_total = (p1_automated / p1_total * 100) if p1_total > 0 else 0
            p2_percentage_total = (p2_automated / p2_total * 100) if p2_total > 0 else 0
            # Table B: Automated / Automatable Only
            p1_percentage_automatable = (p1_automated / p1_automatable * 100) if p1_automatable > 0 else 0
            p2_percentage_automatable = (p2_automated / p2_automatable * 100) if p2_automatable > 0 else 0
            
            # Calculate progress for both tables
            progress_total = p2_percentage_total - p1_percentage_total
            progress_automatable = p2_percentage_automatable - p1_percentage_automatable
            new_automated = p2_automated - p1_automated
            
            # Generate AI analysis
            ai_analysis = await self._generate_ai_analysis(
                portfolio=portfolio,
                total_test_cases=total_test_cases,
                period1_automated=p1_automated,
                period1_manual=p1_requires_automation + p1_automation_not_required,
                period1_percentage=p1_percentage_total,
                period2_automated=p2_automated,
                period2_manual=p2_requires_automation + p2_automation_not_required,
                period2_percentage=p2_percentage_total,
                progress=progress_total,
                new_automated=new_automated,
                period1_label=f"{period1_to}",
                period2_label=f"{period2_to}",
                project_metrics=project_metrics
            )
            
            # Calculate WoW progress percentages
            wow_progress_pct_total = round(progress_total, 1)
            wow_progress_pct_automatable = round(progress_automatable, 1)
            
            # Build JQL queries for debugging/display
            jql_queries = [
                f"Period 1 - Automated: {breakdown1.get('jql_automated', '')}",
                f"Period 1 - Requires Automation: {breakdown1.get('jql_requires_automation', '')}",
                f"Period 2 - Automated: {breakdown2.get('jql_automated', '')}",
                f"Period 2 - Requires Automation: {breakdown2.get('jql_requires_automation', '')}"
            ]
            
            # DUAL TABLE STRUCTURE - Table A & Table B
            result = {
                "portfolio": portfolio,
                "project_filter": project_filter,
                "total_test_cases": total_test_cases,
                "jql_queries": jql_queries,
                
                # TABLE A: Automated vs Overall Test Cases
                "table_a": {
                    "title": "Overall Automation Status - Automated test cases against the overall test cases volume",
                    "period1": {
                        "from": period1_from,
                        "to": period1_to,
                        "week_ending": period1_to,
                        "automated": p1_automated,
                        "requires_automation": p1_requires_automation,
                        "automation_not_required": p1_automation_not_required,
                        "total": p1_total,
                        "automation_percentage": round(p1_percentage_total, 1),
                        "jql": jql_queries[0]
                    },
                    "period2": {
                        "from": period2_from,
                        "to": period2_to,
                        "week_ending": period2_to,
                        "automated": p2_automated,
                        "requires_automation": p2_requires_automation,
                        "automation_not_required": p2_automation_not_required,
                        "total": p2_total,
                        "automation_percentage": round(p2_percentage_total, 1),
                        "jql": jql_queries[2]
                    },
                    "progress": {
                        "wow_progress_pct": wow_progress_pct_total,
                        "percentage_change": round(progress_total, 1),
                        "trend": "improving" if progress_total > 0 else "declining" if progress_total < 0 else "stable"
                    }
                },
                
                # TABLE B: Automated vs Automatable Test Cases Only
                "table_b": {
                    "title": "Overall Automation Status - Automated test cases against the automatable functional test cases volume",
                    "period1": {
                        "from": period1_from,
                        "to": period1_to,
                        "week_ending": period1_to,
                        "automated": p1_automated,
                        "requires_automation": p1_requires_automation,
                        "automatable": p1_automatable,
                        "automation_percentage": round(p1_percentage_automatable, 1),
                        "jql": jql_queries[1]
                    },
                    "period2": {
                        "from": period2_from,
                        "to": period2_to,
                        "week_ending": period2_to,
                        "automated": p2_automated,
                        "requires_automation": p2_requires_automation,
                        "automatable": p2_automatable,
                        "automation_percentage": round(p2_percentage_automatable, 1),
                        "jql": jql_queries[3]
                    },
                    "progress": {
                        "wow_progress_pct": wow_progress_pct_automatable,
                        "percentage_change": round(progress_automatable, 1),
                        "trend": "improving" if progress_automatable > 0 else "declining" if progress_automatable < 0 else "stable"
                    }
                },
                
                # LEGACY FORMAT (for backward compatibility)
                "period1": {
                    "from": period1_from,
                    "to": period1_to,
                    "week_ending": period1_to,
                    "automated": p1_automated,
                    "requires_automation": p1_requires_automation,
                    "automation_not_required": p1_automation_not_required,
                    "automated_count": p1_automated,
                    "manual_count": p1_requires_automation + p1_automation_not_required,
                    "automation_percentage": round(p1_percentage_total, 1),
                    "automation_percentage_total": round(p1_percentage_total, 1),
                    "automation_percentage_automatable": round(p1_percentage_automatable, 1),
                    "jql_queries": [jql_queries[0], jql_queries[1]]
                },
                "period2": {
                    "from": period2_from,
                    "to": period2_to,
                    "week_ending": period2_to,
                    "automated": p2_automated,
                    "requires_automation": p2_requires_automation,
                    "automation_not_required": p2_automation_not_required,
                    "automated_count": p2_automated,
                    "manual_count": p2_requires_automation + p2_automation_not_required,
                    "automation_percentage": round(p2_percentage_total, 1),
                    "automation_percentage_total": round(p2_percentage_total, 1),
                    "automation_percentage_automatable": round(p2_percentage_automatable, 1),
                    "jql_queries": [jql_queries[2], jql_queries[3]]
                },
                "progress": {
                    "wow_progress_pct": wow_progress_pct_total,
                    "percentage_change": round(progress_total, 1),
                    "percentage_change_total": round(progress_total, 1),
                    "percentage_change_automatable": round(progress_automatable, 1),
                    "new_automated_tests": new_automated,
                    "trend": "improving" if progress_total > 0 else "declining" if progress_total < 0 else "stable"
                },
                "ai_analysis": ai_analysis
            }
            
            logger.info(f"✅ Overall automation analysis completed")
            logger.info(f"   Period 1: {p1_automated}/{total_test_cases} ({p1_percentage_total:.1f}%)")
            logger.info(f"   Period 2: {p2_automated}/{total_test_cases} ({p2_percentage_total:.1f}%)")
            logger.info(f"   Progress: {progress_total:+.1f} percentage points")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Overall automation analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    async def _generate_ai_analysis(self,
                                   portfolio: str,
                                   total_test_cases: int,
                                   period1_automated: int,
                                   period1_manual: int,
                                   period1_percentage: float,
                                   period2_automated: int,
                                   period2_manual: int,
                                   period2_percentage: float,
                                   progress: float,
                                   new_automated: int,
                                   period1_label: str,
                                   period2_label: str,
                                   project_metrics: Optional[List[Dict]] = None) -> str:
        """
        Generate human-friendly AI analysis for overall automation progress
        
        Args:
            All metrics from comparison
        
        Returns:
            Human-friendly analysis text
        """
        try:
            # Format dates for display
            try:
                period1_date = datetime.strptime(period1_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period1_date = period1_label
            
            try:
                period2_date = datetime.strptime(period2_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period2_date = period2_label
            
            # Portfolio-specific context hints for varied responses
            portfolio_hints = {
                "Data Platform": "data contracts, ingestion paths, and high-impact pipeline scenarios",
                "Data Solutions": "data pipelines, ETL processes, API validation, and data processing workflows",
                "DMS": "dealer accounting, drive workflows, and modernization scenarios",
                "Engineering Excellence": "CI/CD health checks, platform tooling, and engineering standards",
                "Fixed Ops": "service lane, parts ordering, appointment, and warranty workflows",
                "Fortellis": "partner APIs, marketplace flows, and developer portal journeys",
                "Inventory Management Solutions": "inventory accuracy, replenishment, and multi-location synchronization",
                "Modern Retail": "customer journeys, e-commerce workflows, transaction processing, and checkout scenarios",
                "Network & Communication Services": "provisioning, connectivity, routing, and failover checks",
                "Payments": "authorization, refund, settlement, and payment method tokenization",
                "Shared Services": "identity, entitlement, common services, integrations, and shared components",
                "Title & Registration-CVR": "state-specific title, registration, fee, and DMV integration flows",
            }
            
            hint = portfolio_hints.get(portfolio, "critical business workflows, high-impact test scenarios")
            
            # If project_metrics provided, generate portfolio-level summary
            if project_metrics and len(project_metrics) > 1:
                # Find best and worst performing projects
                best_project = None
                worst_project = None
                best_percentage = -1
                worst_percentage = 101
                
                for proj in project_metrics:
                    proj_pct = proj.get('period2_percentage', proj.get('automation_percentage', 0))
                    if proj_pct > best_percentage:
                        best_percentage = proj_pct
                        best_project = proj.get('project_key', proj.get('project_name', 'Unknown'))
                    if proj_pct < worst_percentage:
                        worst_percentage = proj_pct
                        worst_project = proj.get('project_key', proj.get('project_name', 'Unknown'))
                
                projects_summary = "\n".join([
                    f"- {proj.get('project_key', proj.get('project_name', 'Unknown'))}: {proj.get('period2_percentage', proj.get('automation_percentage', 0)):.1f}% automation"
                    for proj in project_metrics[:10]  # Limit to first 10 projects
                ])
                
                prompt = f"""You are a Senior Quality Engineering Manager analyzing overall test automation progress for the {portfolio} portfolio which contains {len(project_metrics)} projects.

Portfolio Overview:
- Total Test Cases: {total_test_cases}
- As of {period1_date}: {period1_automated} automated ({period1_percentage:.1f}%), {period1_manual} manual
- As of {period2_date}: {period2_automated} automated ({period2_percentage:.1f}%), {period2_manual} manual
- Progress: {"+" if progress >= 0 else ""}{progress:.1f} percentage points
- New Tests Automated: {new_automated} tests

Project Performance:
{projects_summary}

Best Performing Project: {best_project} ({best_percentage:.1f}%)
Needs Attention: {worst_project} ({worst_percentage:.1f}%)

Provide a concise, professional portfolio-level analysis (2-3 sentences) that:
1. Summarizes the overall portfolio progress (improved/declined/stayed same)
2. Mentions which project is performing best ({best_project}) and which needs attention ({worst_project})
3. Provides actionable next steps at the portfolio level
4. Keep it simple and focused - do NOT analyze individual projects in detail

Be conversational and human-friendly. Focus on portfolio-level insights, not individual project details.

Write the analysis:"""
            else:
                # Single project or no project metrics - use original prompt
                prompt = f"""You are a Senior Quality Engineering Manager analyzing overall test automation progress for the {portfolio} portfolio. Provide a clear, human-friendly analysis that is unique and tailored to this specific portfolio's context.

Current Situation:
- Portfolio: {portfolio}
- Total Test Cases: {total_test_cases}
- As of {period1_date}: {period1_automated} automated ({period1_percentage:.1f}%), {period1_manual} manual
- As of {period2_date}: {period2_automated} automated ({period2_percentage:.1f}%), {period2_manual} manual
- Progress: {"+" if progress >= 0 else ""}{progress:.1f} percentage points
- New Tests Automated: {new_automated} tests

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the progress (improved/declined/stayed same) for {portfolio}
2. Highlights key numbers in a natural way
3. Provides actionable next steps specific to {portfolio}'s context, considering {hint}
4. Use varied phrasing and different perspectives - make it unique even if metrics are similar to other portfolios

Be conversational and human-friendly. Avoid generic templates. Make each analysis distinct. Consider the portfolio's domain when providing recommendations.

Write the analysis:"""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing clear, actionable insights. Each portfolio should receive a unique analysis even with similar metrics."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,  # Higher temperature for more variation
                max_tokens=300
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ AI analysis generated: {analysis[:100]}...")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ AI analysis generation failed: {e}")
            # Fallback to simple analysis
            if progress > 0:
                return f"{portfolio} overall automation improved from {period1_percentage:.1f}% to {period2_percentage:.1f}% (+{progress:.1f}pp), adding {new_automated} automated tests. Keep the momentum focused on {hint}; {period2_manual} tests still depend on manual execution."
            elif progress < 0:
                return f"{portfolio} overall automation declined from {period1_percentage:.1f}% to {period2_percentage:.1f}% ({progress:.1f}pp), so new manual scope is growing faster than automation. Rebalance the next sprint toward {hint} and convert the highest-repeat manual checks first."
            else:
                return f"{portfolio} overall automation is steady at {period2_percentage:.1f}% with {period2_automated} automated tests and {period2_manual} still manual. Use {hint} as the prioritization lens so the next automation work reduces the most release risk."
    
    async def _generate_single_period_ai_analysis(self,
                                                  portfolio: str,
                                                  total_test_cases: int,
                                                  period_automated: int,
                                                  period_manual: int,
                                                  period_percentage: float,
                                                  period_label: str,
                                                  project_metrics: Optional[List[Dict]] = None) -> str:
        """
        Generate human-friendly AI analysis for single period overall automation
        
        Args:
            All metrics from single period analysis
        
        Returns:
            Human-friendly analysis text
        """
        try:
            # Format date for display
            try:
                period_date = datetime.strptime(period_label, "%Y-%m-%d").strftime("%B %d, %Y")
            except:
                period_date = period_label
            
            # Portfolio-specific context hints for varied responses
            portfolio_hints = {
                "Data Platform": "data contracts, ingestion paths, and high-impact pipeline scenarios",
                "Data Solutions": "data pipelines, ETL processes, API validation, and data processing workflows",
                "DMS": "dealer accounting, drive workflows, and modernization scenarios",
                "Engineering Excellence": "CI/CD health checks, platform tooling, and engineering standards",
                "Fixed Ops": "service lane, parts ordering, appointment, and warranty workflows",
                "Fortellis": "partner APIs, marketplace flows, and developer portal journeys",
                "Inventory Management Solutions": "inventory accuracy, replenishment, and multi-location synchronization",
                "Modern Retail": "customer journeys, e-commerce workflows, transaction processing, and checkout scenarios",
                "Network & Communication Services": "provisioning, connectivity, routing, and failover checks",
                "Payments": "authorization, refund, settlement, and payment method tokenization",
                "Shared Services": "identity, entitlement, common services, integrations, and shared components",
                "Title & Registration-CVR": "state-specific title, registration, fee, and DMV integration flows",
            }
            
            hint = portfolio_hints.get(portfolio, "critical business workflows, high-impact test scenarios")
            
            prompt = f"""You are a Senior Quality Engineering Manager analyzing overall test automation status for the {portfolio} portfolio. Provide a clear, human-friendly analysis that is unique and tailored to this specific portfolio's context.

Current Situation:
- Portfolio: {portfolio}
- Total Test Cases: {total_test_cases}
- As of {period_date}: {period_automated} automated ({period_percentage:.1f}%), {period_manual} manual

Provide a concise, professional analysis (2-3 sentences) that:
1. Summarizes the current automation status for {portfolio}
2. Highlights key numbers in a natural way
3. Provides actionable next steps specific to {portfolio}'s context, considering {hint}
4. Use varied phrasing and different perspectives - make it unique even if metrics are similar to other portfolios

Be conversational and human-friendly. Avoid generic templates. Make each analysis distinct. Consider the portfolio's domain when providing recommendations.

Write the analysis:"""

            response = await self.openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert Quality Engineering Manager providing clear, actionable insights. Each portfolio should receive a unique analysis even with similar metrics."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,  # Higher temperature for more variation
                max_tokens=300
            )
            
            analysis = response.choices[0].message.content.strip()
            logger.info(f"✅ AI analysis generated: {analysis[:100]}...")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ AI analysis generation failed: {e}")
            # Fallback to simple analysis
            if period_percentage >= 80:
                return f"{portfolio} has excellent overall automation at {period_percentage:.1f}% with {period_automated} tests automated. Review the remaining {period_manual} manual tests through the lens of {hint} to confirm they are either intentionally manual or ready for conversion."
            elif period_percentage >= 70:
                return f"{portfolio} is in a strong automation position at {period_percentage:.1f}% ({period_automated}/{total_test_cases}). The best next gain is to convert high-run manual tests in {hint}, while preserving intentional non-automation exclusions."
            elif period_percentage >= 60:
                return f"{portfolio} is moderate at {period_percentage:.1f}% overall automation with {period_manual} tests still manual. Prioritize {hint} first so the next automation work improves confidence on the paths teams actually rerun most."
            else:
                return f"{portfolio} needs a sharper automation push at {period_percentage:.1f}% overall automation. Start with stable, repeatable scenarios in {hint}; that will create visible improvement while reducing the largest manual testing burden."

