"""
Progressive TCOE dashboard orchestration.

This module keeps the dashboard runner separate from FastAPI route wiring so
the date and run-state behavior can be tested without importing the whole app.
"""

from __future__ import annotations

import asyncio
import copy
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from services.pi_date_utils import build_pi_date_window, compare_metric_by_date
from services.portfolio_mapping import get_all_portfolios


TCOE_DASHBOARD_METRICS: List[Dict[str, Any]] = [
    {
        "key": "test_coverage",
        "order": 1,
        "label": "Stories to Test Cases Mapping",
        "description": "Every story should have at least 1 test case mapped to ensure optimal coverage",
    },
    {
        "key": "test_review_status",
        "order": 2,
        "label": "Test Cases Review Status",
        "description": "Closed Dev stories with the test case review field completed in the selected PI",
    },
    {
        "key": "test_story_ratio",
        "order": 3,
        "label": "Test:Story Ratio",
        "description": "Total number of tests created per closed Dev story",
    },
    {
        "key": "bug_ratio",
        "order": 4,
        "label": "Bugs/Test Case",
        "description": "Indicates test case quality and code quality through bug discovery rate",
    },
    {
        "key": "defect_leakage",
        "order": 5,
        "label": "Weekly Defect Inflow (YoY)",
        "description": "CY26 defects compared with the matching CY25 reporting window",
    },
    {
        "key": "overall_automation",
        "order": 6,
        "label": "Overall Automation Status",
        "description": "Automated test cases against overall and automatable test case volume",
    },
    {
        "key": "regression_automation",
        "order": 7,
        "label": "Regression Automation Status",
        "description": "Automated regression test cases against the regression suite",
    },
]

_METRIC_LOOKUP = {metric["key"]: metric for metric in TCOE_DASHBOARD_METRICS}
_HEAVY_ROW_KEYS = {"bugs_list", "defects_list"}


def now_iso() -> str:
    return datetime.now().isoformat()


def latest_friday(today: Optional[date] = None) -> date:
    """Return the latest Friday on or before today."""
    current = today or date.today()
    if isinstance(current, datetime):
        current = current.date()
    days_since_friday = (current.weekday() - 4) % 7
    return current - timedelta(days=days_since_friday)


def build_default_dashboard_dates(today: Optional[date] = None) -> Dict[str, Any]:
    """Build the dashboard's current/previous Friday comparison context.
    
    If the two dates fall in different PI windows, each period keeps its own PI
    start date so the latest/current week uses the latest PI window.
    """
    current_week = latest_friday(today)
    previous_week = current_week - timedelta(days=7)
    
    # Use compare_metric_by_date to handle cross-PI boundary detection.
    comparison = compare_metric_by_date(
        current_week.isoformat(),
        previous_week.isoformat(),
    )
    
    current_window = comparison["current"]
    previous_window = comparison["previous"]

    return {
        "current_week_ending": current_window["report_date"],
        "previous_week_ending": previous_window["report_date"],
        "current_window": current_window,
        "previous_window": previous_window,
        "comparison_note": comparison.get("comparison_note"),
        "is_different_pi": comparison.get("is_different_pi", False),
    }


def create_tcoe_dashboard_run(today: Optional[date] = None) -> Dict[str, Any]:
    """Create an initial dashboard run record with all metrics pending."""
    date_context = build_default_dashboard_dates(today)
    run_id = str(uuid.uuid4())
    created_at = now_iso()

    return {
        "run_id": run_id,
        "status": "pending",
        "created_at": created_at,
        "updated_at": created_at,
        "started_at": None,
        "completed_at": None,
        "current_week_ending": date_context["current_week_ending"],
        "previous_week_ending": date_context["previous_week_ending"],
        "current_window": date_context["current_window"],
        "previous_window": date_context["previous_window"],
        "comparison_note": date_context.get("comparison_note"),
        "metrics": {
            metric["key"]: {
                "key": metric["key"],
                "order": metric["order"],
                "label": metric["label"],
                "description": metric["description"],
                "status": "pending",
                "rows": [],
                "errors": [],
                "started_at": None,
                "completed_at": None,
                "error": None,
            }
            for metric in TCOE_DASHBOARD_METRICS
        },
    }


def copy_dashboard_run(run: Dict[str, Any]) -> Dict[str, Any]:
    """Return a detached copy suitable for JSON responses."""
    return copy.deepcopy(run)


def run_has_current_default_dates(run: Optional[Dict[str, Any]], today: Optional[date] = None) -> bool:
    if not run:
        return False
    dates = build_default_dashboard_dates(today)
    return (
        run.get("current_week_ending") == dates["current_week_ending"]
        and run.get("previous_week_ending") == dates["previous_week_ending"]
    )


def _attach_dashboard_context(row: Dict[str, Any], metric: Dict[str, Any], run: Dict[str, Any]) -> Dict[str, Any]:
    row.setdefault("metric", metric["key"])
    row.setdefault("metric_label", metric["label"])
    row.setdefault("metric_description", metric["description"])
    row.setdefault("portfolio_display", row.get("portfolio"))
    row.setdefault("pi_context", run.get("current_window", {}).get("pi_context"))
    row.setdefault("previous_pi_context", run.get("previous_window", {}).get("pi_context"))
    row.setdefault("comparison_note", run.get("comparison_note"))
    row.setdefault("generated_at", now_iso())

    current_context = run.get("current_window", {}).get("pi_context")
    previous_context = run.get("previous_window", {}).get("pi_context")

    for key in ("period2", "period", "current_week"):
        if isinstance(row.get(key), dict):
            row[key].setdefault("pi_context", current_context)

    for key in ("period1", "previous_week"):
        if isinstance(row.get(key), dict):
            row[key].setdefault("pi_context", previous_context)

    for table_key in ("table_a", "table_b"):
        table = row.get(table_key)
        if not isinstance(table, dict):
            continue
        if isinstance(table.get("period1"), dict):
            table["period1"].setdefault("pi_context", previous_context)
        for period_key in ("period2", "period"):
            if isinstance(table.get(period_key), dict):
                table[period_key].setdefault("pi_context", current_context)

    return row


def _strip_heavy_row_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _strip_heavy_row_fields(item)
            for key, item in value.items()
            if key not in _HEAVY_ROW_KEYS
        }
    if isinstance(value, list):
        return [_strip_heavy_row_fields(item) for item in value]
    return value


def _create_analyzer(metric_key: str, jira_client: Any) -> Any:
    if metric_key == "test_coverage":
        from services.test_coverage_analyzer import TestCoverageAnalyzer

        return TestCoverageAnalyzer(jira_client)
    if metric_key == "test_review_status":
        from services.test_case_review_status_analyzer import TestCaseReviewStatusAnalyzer

        return TestCaseReviewStatusAnalyzer(jira_client)
    if metric_key == "test_story_ratio":
        from services.test_story_ratio_analyzer import TestStoryRatioAnalyzer

        return TestStoryRatioAnalyzer(jira_client)
    if metric_key == "bug_ratio":
        from services.bug_ratio_analyzer import BugRatioAnalyzer

        return BugRatioAnalyzer(jira_client)
    if metric_key == "defect_leakage":
        from services.defect_leakage_analyzer import DefectLeakageAnalyzer

        return DefectLeakageAnalyzer(jira_client)
    if metric_key == "overall_automation":
        from services.overall_automation_analyzer import OverallAutomationAnalyzer

        return OverallAutomationAnalyzer(jira_client)
    if metric_key == "regression_automation":
        from services.regression_automation_analyzer import RegressionAutomationAnalyzer

        return RegressionAutomationAnalyzer(jira_client)
    raise ValueError(f"Unsupported TCOE dashboard metric: {metric_key}")


async def _run_metric_analyzer(analyzer: Any, metric_key: str, portfolio: str, run: Dict[str, Any]) -> Dict[str, Any]:
    previous_window = run["previous_window"]
    current_window = run["current_window"]
    common_kwargs = {
        "portfolio": portfolio,
        "period1_from": previous_window["pi_start_date"],
        "period1_to": previous_window["report_date"],
        "period2_from": current_window["pi_start_date"],
        "period2_to": current_window["report_date"],
    }

    return await analyzer.compare_periods(**common_kwargs)


async def analyze_dashboard_metric(
    metric_key: str,
    jira_client: Any,
    run: Dict[str, Any],
    portfolios: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Analyze one dashboard metric for every portfolio."""
    metric = _METRIC_LOOKUP.get(metric_key)
    if not metric:
        raise ValueError(f"Unsupported TCOE dashboard metric: {metric_key}")

    analyzer = _create_analyzer(metric_key, jira_client)
    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []

    for portfolio in portfolios or get_all_portfolios():
        try:
            result = await _run_metric_analyzer(analyzer, metric_key, portfolio, run)
            result = _attach_dashboard_context(result, metric, run)
            rows.append(_strip_heavy_row_fields(result))
        except Exception as exc:
            errors.append({"portfolio": portfolio, "error": str(exc)})

    if not rows:
        error_text = "; ".join(f"{item['portfolio']}: {item['error']}" for item in errors)
        raise RuntimeError(error_text or f"No rows generated for {metric['label']}")

    return {
        "key": metric_key,
        "label": metric["label"],
        "description": metric["description"],
        "rows": rows,
        "errors": errors,
    }


async def process_tcoe_dashboard_run(
    run: Dict[str, Any],
    jira_client: Any,
    portfolios: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Run all dashboard metrics concurrently and update the run progressively."""
    run["status"] = "processing"
    run["started_at"] = now_iso()
    run["updated_at"] = run["started_at"]

    async def process_metric(metric: Dict[str, Any]) -> None:
        metric_state = run["metrics"][metric["key"]]
        metric_state["status"] = "processing"
        metric_state["started_at"] = now_iso()
        metric_state["error"] = None
        run["updated_at"] = metric_state["started_at"]

        try:
            result = await analyze_dashboard_metric(metric["key"], jira_client, run, portfolios=portfolios)
            metric_state["rows"] = result["rows"]
            metric_state["errors"] = result["errors"]
            metric_state["status"] = "completed"
        except Exception as exc:
            metric_state["status"] = "failed"
            metric_state["error"] = str(exc)
            metric_state["errors"] = [{"portfolio": "All", "error": str(exc)}]
        finally:
            metric_state["completed_at"] = now_iso()
            run["updated_at"] = metric_state["completed_at"]

    await asyncio.gather(*(process_metric(metric) for metric in TCOE_DASHBOARD_METRICS))

    statuses = [state["status"] for state in run["metrics"].values()]
    if all(status == "completed" for status in statuses):
        run["status"] = "completed"
    elif all(status == "failed" for status in statuses):
        run["status"] = "failed"
    else:
        run["status"] = "completed_with_errors"

    run["completed_at"] = now_iso()
    run["updated_at"] = run["completed_at"]
    return run
