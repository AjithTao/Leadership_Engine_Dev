"""Structured, validated AI insights for the progressive QCOE dashboard."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

UNAVAILABLE_INSIGHT: Dict[str, Any] = {
    "status": "unavailable",
    "export_comments": None,
    "portfolios": {},
}


def _clean(value: Any, limit: int = 260) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit].rstrip()


def _project_ids(row: Dict[str, Any]) -> List[str]:
    source = " ".join(
        str(row.get(key, ""))
        for key in ("project_key", "project_filter", "jql", "query")
    )
    quoted = re.findall(r'["\']([A-Z][A-Z0-9_-]{1,20})["\']', source)
    project_clauses = re.findall(r"\bproject\s*=\s*([A-Z][A-Z0-9_-]{1,20})", source, re.I)
    in_clauses = re.findall(r"\bproject\s+in\s*\(([^)]+)\)", source, re.I)
    unquoted: List[str] = []
    for clause in in_clauses:
        unquoted.extend(re.findall(r"\b[A-Z][A-Z0-9_-]{1,20}\b", clause.upper()))
    return list(dict.fromkeys(item.upper() for item in quoted + project_clauses + unquoted))[:20]


def _compact_row(row: Dict[str, Any], project_name_by_key: Dict[str, str]) -> Dict[str, Any]:
    def metrics(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: metrics(item)
                for key, item in value.items()
                if key not in {"jql", "query", "jql_queries", "pi_context", "bugs_list", "defects_list"}
                and isinstance(item, (str, int, float, bool, type(None), dict))
            }
        return value

    project_ids = _project_ids(row)
    return {
        "portfolio": row.get("portfolio_display") or row.get("portfolio") or "Unknown",
        "projects": [
            {"key": key, "name": project_name_by_key[key]}
            for key in project_ids
            if project_name_by_key.get(key)
        ],
        "period1": metrics(row.get("period1") or row.get("previous_week") or {}),
        "period2": metrics(row.get("period2") or row.get("period") or row.get("current_week") or {}),
        "table_a": metrics(row.get("table_a") or {}),
        "table_b": metrics(row.get("table_b") or {}),
        "progress": metrics(row.get("progress") or {}),
        "existing_ai_analysis": _clean(row.get("ai_analysis") or row.get("ai_insights"), 600),
    }


def _parse_json(content: str) -> Dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _validated_list(value: Any, maximum: int = 2) -> List[str]:
    if not isinstance(value, list):
        return []
    return [_clean(item, 220) for item in value[:maximum] if _clean(item, 220)]


def validate_qcoe_ai_insight(
    payload: Any,
    rows: List[Dict[str, Any]],
    project_name_by_key: Dict[str, str] | None = None,
) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return dict(UNAVAILABLE_INSIGHT)

    comments = payload.get("export_comments")
    if not isinstance(comments, dict):
        return dict(UNAVAILABLE_INSIGHT)
    required_comments = (
        "issue_portfolio_recommendation",
        "best_portfolio_summary",
        "overall_recommendation",
    )
    cleaned_comments = {key: _clean(comments.get(key), 170) for key in required_comments}
    if not all(cleaned_comments.values()):
        return dict(UNAVAILABLE_INSIGHT)

    name_map = project_name_by_key or {}
    valid_rows = {
        str(row.get("portfolio_display") or row.get("portfolio") or "Unknown"): {
            name_map[key] for key in _project_ids(row) if name_map.get(key)
        }
        for row in rows
    }
    raw_portfolios = payload.get("portfolios")
    if not isinstance(raw_portfolios, dict):
        return dict(UNAVAILABLE_INSIGHT)

    portfolios: Dict[str, Any] = {}
    for portfolio, allowed_projects in valid_rows.items():
        raw = raw_portfolios.get(portfolio)
        if not isinstance(raw, dict):
            continue
        referenced = [str(item) for item in raw.get("project_names", []) if str(item) in allowed_projects]
        roots = _validated_list(raw.get("root_causes"))
        actions = _validated_list(raw.get("action_items"))
        combined_text = " ".join(roots + actions).lower()
        names_are_used = not allowed_projects or any(name.lower() in combined_text for name in referenced)
        if roots and actions and referenced and names_are_used:
            portfolios[portfolio] = {
                "project_names": list(dict.fromkeys(referenced))[:10],
                "root_causes": roots,
                "action_items": actions,
            }

    return {
        "status": "available",
        "export_comments": cleaned_comments,
        "portfolios": portfolios,
    }


async def generate_qcoe_ai_insight(
    analyzer: Any,
    metric_key: str,
    metric_label: str,
    rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate one real AI response for export comments and UI-only row expansion."""
    if not rows or not getattr(analyzer, "openai", None):
        return dict(UNAVAILABLE_INSIGHT)

    project_name_by_key: Dict[str, str] = {}
    try:
        jira_projects = await analyzer.jira.get_projects()
        project_name_by_key = {
            str(project.get("key", "")).upper(): _clean(project.get("name"), 120)
            for project in jira_projects
            if project.get("key") and project.get("name")
        }
    except Exception:
        logger.warning("QCOE AI insight (%s): Jira project lookup failed; project-name validation disabled", metric_key, exc_info=True)
        project_name_by_key = {}

    compact_rows = [_compact_row(row, project_name_by_key) for row in rows]
    prompt = f"""You are a senior quality engineering leader analyzing the QCOE metric {metric_label} ({metric_key}).

Use only the supplied measurements, existing AI analyses, portfolio names, and Jira project names. Do not invent a project, cause, or result. If evidence supports only a hypothesis, explicitly call it a hypothesis. Do not merely repeat numbers. Write project display names naturally inside every root-cause and action bullet; never expose project keys to the user.

Return JSON only with this exact shape:
{{
  "export_comments": {{
    "issue_portfolio_recommendation": "one concise bullet naming the primary issue portfolio and a specific recommendation",
    "best_portfolio_summary": "one concise bullet naming the best portfolio and why it performed well",
    "overall_recommendation": "one concise bullet recommending overall metric improvement"
  }},
  "portfolios": {{
    "EXACT PORTFOLIO NAME": {{
      "project_names": ["ONLY PROJECT DISPLAY NAMES SUPPLIED FOR THIS PORTFOLIO"],
      "root_causes": ["maximum two concise evidence-based bullets, each 2-3 short lines"],
      "action_items": ["maximum two concise project-specific actions, each 2-3 short lines"]
    }}
  }}
}}

Each export comment must be under 170 characters. Produce exactly the three export comments. Each root cause or action must be under 220 characters. For each portfolio, produce no more than two root causes and two action items. Mention exact supplied project names inside the bullets. Avoid generic template language.

Data:
{json.dumps(compact_rows, default=str)}"""

    try:
        response = await analyzer.openai.chat.completions.create(
            model=getattr(analyzer, "model", "databricks-gpt-5-1"),
            messages=[
                {"role": "system", "content": "Return valid JSON only. Base every conclusion on supplied QCOE evidence."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=3500,
        )
        payload = _parse_json(response.choices[0].message.content or "")
        return validate_qcoe_ai_insight(payload, rows, project_name_by_key)
    except Exception:
        logger.warning("QCOE AI insight (%s): generation failed; returning unavailable insight", metric_key, exc_info=True)
        return dict(UNAVAILABLE_INSIGHT)
