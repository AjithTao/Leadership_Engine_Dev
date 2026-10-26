"""Jira-backed project catalog used by QCOE dashboards and metrics."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


UNCATEGORIZED = "Uncategorized"


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _jql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


@dataclass(frozen=True)
class QcoeProject:
    id: str
    key: str
    name: str
    category_id: Optional[str]
    category_name: str

    def as_dict(self) -> Dict[str, str]:
        return {"id": self.id, "key": self.key, "name": self.name}


class QcoeProjectCatalog:
    """Immutable, deterministic view of projects visible through Jira."""

    def __init__(self, projects: List[QcoeProject], fetched_at: Optional[str] = None):
        if not projects:
            raise ValueError("Jira returned no visible active projects for QCOE.")

        ordered = sorted(projects, key=lambda item: (item.category_name.casefold(), item.name.casefold(), item.key))
        self.projects = tuple(ordered)
        self.fetched_at = fetched_at or datetime.now(timezone.utc).isoformat()
        self._by_key = {item.key.upper(): item for item in self.projects}

        grouped: Dict[str, List[QcoeProject]] = {}
        category_ids: Dict[str, Optional[str]] = {}
        for item in self.projects:
            grouped.setdefault(item.category_name, []).append(item)
            category_ids.setdefault(item.category_name, item.category_id)

        names = sorted((name for name in grouped if name != UNCATEGORIZED), key=str.casefold)
        if UNCATEGORIZED in grouped:
            names.append(UNCATEGORIZED)
        self.portfolio_projects = {name: [item.key for item in grouped[name]] for name in names}
        self.project_to_portfolio = {item.key: item.category_name for item in self.projects}
        self._category_ids = category_ids

        signature_payload = [
            [item.category_id, item.category_name, item.id, item.key, item.name]
            for item in self.projects
        ]
        encoded = json.dumps(signature_payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        self.signature = hashlib.sha256(encoded).hexdigest()

    @classmethod
    def from_jira_projects(cls, raw_projects: List[Dict[str, Any]]) -> "QcoeProjectCatalog":
        projects: List[QcoeProject] = []
        seen_keys = set()
        for raw in raw_projects:
            key = _clean(raw.get("key"))
            if not key or bool(raw.get("archived", False)):
                continue
            normalized_key = key.upper()
            if normalized_key in seen_keys:
                continue
            seen_keys.add(normalized_key)

            category = raw.get("projectCategory") or raw.get("category") or {}
            category_name = _clean(category.get("name")) if isinstance(category, dict) else ""
            category_id = _clean(category.get("id")) if isinstance(category, dict) else ""
            if not category_name:
                category_name = UNCATEGORIZED
                category_id = ""

            projects.append(QcoeProject(
                id=_clean(raw.get("id")),
                key=key,
                name=_clean(raw.get("name")) or key,
                category_id=category_id or None,
                category_name=category_name,
            ))
        return cls(projects)

    @property
    def portfolio_names(self) -> List[str]:
        return list(self.portfolio_projects)

    def get_portfolio_projects(self, scope: str) -> List[str]:
        value = _clean(scope)
        if not value:
            raise ValueError("A Jira portfolio or project key is required.")
        if value.casefold() == "all":
            return [item.key for item in self.projects]

        for name, keys in self.portfolio_projects.items():
            if name.casefold() == value.casefold():
                return list(keys)

        project = self._by_key.get(value.upper())
        if project:
            return [project.key]
        raise ValueError(f"Unknown Jira portfolio or project key: {scope}")

    def get_portfolio_for_project(self, project_key: str) -> str:
        project = self._by_key.get(_clean(project_key).upper())
        if not project:
            raise ValueError(f"Unknown Jira project key: {project_key}")
        return project.category_name

    def build_project_jql(self, scope: str) -> str:
        projects = self.get_portfolio_projects(scope)
        quoted = [f'"{_jql_string(project)}"' for project in projects]
        if len(quoted) == 1:
            return f"project = {quoted[0]}"
        return f"project IN ({', '.join(quoted)})"

    async def build_project_jql_with_validation(self, _jira_client: Any, scope: str) -> str:
        return self.build_project_jql(scope)

    def as_response(self) -> Dict[str, Any]:
        grouped = {name: [] for name in self.portfolio_names}
        for project in self.projects:
            grouped[project.category_name].append(project)
        return {
            "success": True,
            "source": "jira",
            "fetched_at": self.fetched_at,
            "catalog_signature": self.signature,
            "total_projects": len(self.projects),
            "uncategorized_count": len(grouped.get(UNCATEGORIZED, [])),
            "portfolios": [
                {
                    "category_id": self._category_ids.get(name),
                    "name": name,
                    "projects": [project.as_dict() for project in grouped[name]],
                }
                for name in self.portfolio_names
            ],
        }


async def load_qcoe_project_catalog(jira_client: Any) -> QcoeProjectCatalog:
    raw_projects = await jira_client.get_qcoe_projects()
    return QcoeProjectCatalog.from_jira_projects(raw_projects)
