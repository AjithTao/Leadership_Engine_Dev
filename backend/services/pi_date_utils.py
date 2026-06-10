"""
Reusable PI reporting-window utilities for TCOE/QCOE metrics.

Reporting windows follow fixed calendar-quarter PI dates. Keep this mapping
aligned with the frontend PI calendar when official PI dates change.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional


PI_DATE_RANGES = [
    {
        "year": "CY25",
        "pi": "PI1",
        "value": "PI1_CY25",
        "label": "PI 1 - CY25 (Jan 01 - Mar 31, 2025)",
        "start_date": "2025-01-01",
        "end_date": "2025-03-31",
    },
    {
        "year": "CY25",
        "pi": "PI2",
        "value": "PI2_CY25",
        "label": "PI 2 - CY25 (Apr 01 - Jun 30, 2025)",
        "start_date": "2025-04-01",
        "end_date": "2025-06-30",
    },
    {
        "year": "CY25",
        "pi": "PI3",
        "value": "PI3_CY25",
        "label": "PI 3 - CY25 (Jul 01 - Sep 30, 2025)",
        "start_date": "2025-07-01",
        "end_date": "2025-09-30",
    },
    {
        "year": "CY25",
        "pi": "PI4",
        "value": "PI4_CY25",
        "label": "PI 4 - CY25 (Oct 01 - Dec 31, 2025)",
        "start_date": "2025-10-01",
        "end_date": "2025-12-31",
    },
    {
        "year": "CY26",
        "pi": "PI1",
        "value": "PI1_CY26",
        "label": "PI 1 - CY26 (Jan 01 - Mar 31, 2026)",
        "start_date": "2026-01-01",
        "end_date": "2026-03-31",
    },
    {
        "year": "CY26",
        "pi": "PI2",
        "value": "PI2_CY26",
        "label": "PI 2 - CY26 (Apr 01 - Jun 30, 2026)",
        "start_date": "2026-04-01",
        "end_date": "2026-06-30",
    },
    {
        "year": "CY26",
        "pi": "PI3",
        "value": "PI3_CY26",
        "label": "PI 3 - CY26 (Jul 01 - Sep 30, 2026)",
        "start_date": "2026-07-01",
        "end_date": "2026-09-30",
    },
    {
        "year": "CY26",
        "pi": "PI4",
        "value": "PI4_CY26",
        "label": "PI 4 - CY26 (Oct 01 - Dec 31, 2026)",
        "start_date": "2026-10-01",
        "end_date": "2026-12-31",
    },
]


def normalize_iso_date(value: Any) -> str:
    """Return YYYY-MM-DD for a date, datetime, or ISO-ish string."""
    if value is None:
        raise ValueError("Report date is required")

    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")

    raw = str(value).strip()
    if len(raw) >= 10:
        candidate = raw[:10]
        try:
            datetime.strptime(candidate, "%Y-%m-%d")
            return candidate
        except ValueError:
            pass

    try:
        return datetime.fromisoformat(raw).strftime("%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"Invalid report date: {raw or '(blank)'}") from exc


def _to_frontend_context(pi_context: Dict[str, str]) -> Dict[str, str]:
    frontend_context = {
        "year": pi_context["year"],
        "pi": pi_context["pi"],
        "value": pi_context["value"],
        "label": pi_context["label"],
        "startDate": pi_context["start_date"],
        "endDate": pi_context["end_date"],
    }
    if pi_context.get("report_start_date"):
        frontend_context["reportStartDate"] = pi_context["report_start_date"]
    if pi_context.get("report_end_date"):
        frontend_context["reportEndDate"] = pi_context["report_end_date"]
    return frontend_context


def get_pi_by_date(date_value: Any) -> Optional[Dict[str, str]]:
    """Return the configured PI context containing the selected date."""
    report_date = normalize_iso_date(date_value)
    for pi_context in PI_DATE_RANGES:
        report_start = pi_context.get("report_start_date", pi_context["start_date"])
        report_end = pi_context.get("report_end_date", pi_context["end_date"])
        if report_start <= report_date <= report_end:
            return dict(pi_context)
    return None


def format_pi_compact(pi_context: Optional[Dict[str, str]]) -> str:
    if not pi_context:
        return "selected PI"
    return f"{pi_context['year']}{pi_context['pi']}"


def format_pi_spaced(pi_context: Optional[Dict[str, str]]) -> str:
    if not pi_context:
        return "selected PI"
    return f"{pi_context['year']} {pi_context['pi']}"


def build_pi_date_window(report_date_value: Any) -> Dict[str, Any]:
    """Build the PI-start-to-selected-date window for a report date."""
    report_date = normalize_iso_date(report_date_value)
    pi_context = get_pi_by_date(report_date)
    if not pi_context:
        raise ValueError(
            f"No PI date range configured for {report_date}. Add this date to PI_DATE_RANGES."
        )

    return {
        "pi_context": _to_frontend_context(pi_context),
        "cy_year": pi_context["year"],
        "pi_number": pi_context["pi"],
        "pi_start_date": pi_context["start_date"],
        "report_date": report_date,
        "date_from": pi_context["start_date"],
        "date_to": report_date,
        "header_title": f"{pi_context['year']} - {pi_context['pi']} Weekly Quality Metrics",
    }


def build_metric_header(report_date_value: Any) -> str:
    return build_pi_date_window(report_date_value)["header_title"]


def build_jql_date_clause(metric_type: str, pi_start_date_value: Any, report_date_value: Any) -> str:
    """Build a reusable PI-bounded JQL date clause."""
    metric = (metric_type or "").lower()
    resolved_metrics = {"resolved", "closed", "closed_dev_stories", "test_review_status"}
    updated_metrics = {"updated", "defect_leakage", "defect_inflow", "test_execution"}
    if metric in resolved_metrics:
        field_name = "resolved"
    elif metric in updated_metrics:
        field_name = "updatedDate"
    else:
        field_name = "createdDate"

    pi_start_date = normalize_iso_date(pi_start_date_value)
    report_date = normalize_iso_date(report_date_value)
    return f'{field_name} >= "{pi_start_date}" AND {field_name} <= "{report_date} 23:59"'


def compare_metric_by_date(current_date_value: Any, previous_date_value: Any) -> Dict[str, Any]:
    """
    Build current and previous windows for metric comparison.
    
    IMPORTANT: If the two dates fall in different PI windows, each period keeps
    its own PI start date. This lets the latest report date use the latest PI
    window instead of being pulled back to an older PI start.
    
    Example:
    - current_date: 2026-04-03 (PI2)
    - previous_date: 2026-03-27 (PI1)
    - current uses PI2 window: 2026-04-01 to 2026-04-03
    - previous uses PI1 window: 2026-01-01 to 2026-03-27
    """
    current = build_pi_date_window(current_date_value)
    previous = build_pi_date_window(previous_date_value)
    
    current_pi = current["pi_context"]["value"]
    previous_pi = previous["pi_context"]["value"]
    different_pi = current_pi != previous_pi

    return {
        "current": current,
        "previous": previous,
        "is_different_pi": different_pi,
        "comparison_note": (
            f"Different PIs detected: Previous is {format_pi_spaced(previous['pi_context'])}, "
            f"Current is {format_pi_spaced(current['pi_context'])}. Each period uses its own PI start date."
            if different_pi
            else None
        ),
    }


def normalize_tcoe_request_for_pi(request: Dict[str, Any], metric: str = "") -> Dict[str, Any]:
    """
    Normalize any TCOE/QCOE metrics request so PI metrics always query from
    that date's PI start through the selected report date.
    
    IMPORTANT: If comparing two periods that fall in different PI windows, 
    each period uses its own PI start date.
    """
    normalized = dict(request)
    use_custom_date_range = bool(normalized.get("use_custom_date_range"))

    def lower_bound(from_key: str, pi_window: Dict[str, Any]) -> str:
        if use_custom_date_range and normalized.get(from_key):
            return normalize_iso_date(normalized[from_key])
        return pi_window["pi_start_date"]

    if "period2_to" in normalized:
        current = build_pi_date_window(normalized["period2_to"])
        normalized["period2_from"] = lower_bound("period2_from", current)
        normalized["period2_to"] = current["report_date"]
        normalized["pi_context"] = current["pi_context"]
        normalized["metric_header"] = current["header_title"]

        if "period1_to" in normalized:
            previous = build_pi_date_window(normalized["period1_to"])
            normalized["period1_from"] = lower_bound("period1_from", previous)
            normalized["period1_to"] = previous["report_date"]
            normalized["previous_pi_context"] = previous["pi_context"]
            
            comparison = compare_metric_by_date(current["report_date"], previous["report_date"])
            if comparison["comparison_note"]:
                normalized["comparison_note"] = comparison["comparison_note"]
        return normalized

    if "current_week_to" in normalized:
        current = build_pi_date_window(normalized["current_week_to"])
        normalized["current_week_from"] = lower_bound("current_week_from", current)
        normalized["current_week_to"] = current["report_date"]
        normalized["pi_context"] = current["pi_context"]
        normalized["metric_header"] = current["header_title"]

        if "previous_week_to" in normalized:
            previous = build_pi_date_window(normalized["previous_week_to"])
            normalized["previous_week_from"] = lower_bound("previous_week_from", previous)
            normalized["previous_week_to"] = previous["report_date"]
            normalized["previous_pi_context"] = previous["pi_context"]
            
            comparison = compare_metric_by_date(current["report_date"], previous["report_date"])
            if comparison["comparison_note"]:
                normalized["comparison_note"] = comparison["comparison_note"]
        return normalized

    if "period_to" in normalized:
        current = build_pi_date_window(normalized["period_to"])
        normalized["period_from"] = lower_bound("period_from", current)
        normalized["period_to"] = current["report_date"]
        normalized["pi_context"] = current["pi_context"]
        normalized["metric_header"] = current["header_title"]
        return normalized

    if "date_to" in normalized:
        current = build_pi_date_window(normalized["date_to"])
        normalized["date_from"] = lower_bound("date_from", current)
        normalized["date_to"] = current["report_date"]
        normalized["pi_context"] = current["pi_context"]
        normalized["metric_header"] = current["header_title"]
        return normalized

    if "dateTo" in normalized:
        current = build_pi_date_window(normalized["dateTo"])
        normalized["dateFrom"] = lower_bound("dateFrom", current)
        normalized["dateTo"] = current["report_date"]
        normalized["pi_context"] = current["pi_context"]
        normalized["metric_header"] = current["header_title"]

    return normalized
