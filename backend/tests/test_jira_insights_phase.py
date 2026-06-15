"""
Unit and filter-validation tests for Jira Insights phases 3–9.

Coverage:
  - build_advanced_filter_clause   (Phase 5: advanced filter JQL builder)
  - generate_enhanced_metrics      (Phase 3: date-range anchor; data consistency)
  - filter scoping                 (Phase 3: advanced filter propagation)

These tests run without a live Jira connection; all inputs are synthetic.
"""
import os
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import build_advanced_filter_clause, generate_enhanced_metrics


# ─── helpers ──────────────────────────────────────────────────────────────────

def make_issue(
    key: str,
    status_name: str,
    status_category: str,
    created: str,
    updated: str | None = None,
    story_points: float | None = None,
    sp_field: str = "customfield_10016",
    issue_type: str = "Story",
    priority: str = "Medium",
    assignee: str | None = "Alice",
) -> dict:
    fields = {
        "summary": f"{key} — test summary",
        "issuetype": {"name": issue_type},
        "priority": {"name": priority},
        "status": {
            "name": status_name,
            "statusCategory": {"name": status_category},
        },
        "created": created,
        "updated": updated or created,
        "assignee": {"displayName": assignee} if assignee else None,
        "labels": [],
    }
    if story_points is not None:
        fields[sp_field] = story_points
    return {"key": key, "fields": fields}


def date_str(delta_days: int = 0) -> str:
    """Return an ISO-8601 date string delta_days from today."""
    d = datetime.now() + timedelta(days=delta_days)
    return d.strftime("%Y-%m-%dT%H:%M:%S.000+0000")


def ymd(delta_days: int = 0) -> str:
    return (datetime.now() + timedelta(days=delta_days)).strftime("%Y-%m-%d")


# ══════════════════════════════════════════════════════════════════════════════
# build_advanced_filter_clause
# ══════════════════════════════════════════════════════════════════════════════

class TestBuildAdvancedFilterClause:

    def test_empty_dict_returns_empty_string(self):
        assert build_advanced_filter_clause({}) == ""

    def test_none_returns_empty_string(self):
        assert build_advanced_filter_clause(None) == ""  # type: ignore[arg-type]

    def test_priority_single(self):
        result = build_advanced_filter_clause({"priority": ["High"]})
        assert result == 'priority in ("High")'

    def test_priority_multiple(self):
        result = build_advanced_filter_clause({"priority": ["Highest", "High"]})
        assert 'priority in (' in result
        assert '"Highest"' in result
        assert '"High"' in result

    def test_issue_type(self):
        result = build_advanced_filter_clause({"issueType": ["Bug", "Story"]})
        assert 'issuetype in (' in result
        assert '"Bug"' in result
        assert '"Story"' in result

    def test_status_category(self):
        result = build_advanced_filter_clause({"statusCategory": ["In Progress"]})
        assert result == 'statusCategory in ("In Progress")'

    def test_assignee(self):
        result = build_advanced_filter_clause({"assignee": "John Doe"})
        assert result == 'assignee = "John Doe"'

    def test_assignee_whitespace_stripped(self):
        result = build_advanced_filter_clause({"assignee": "  Jane  "})
        assert result == 'assignee = "Jane"'

    def test_empty_assignee_ignored(self):
        result = build_advanced_filter_clause({"assignee": ""})
        assert result == ""

    def test_label_single(self):
        result = build_advanced_filter_clause({"label": "backend"})
        assert result == 'labels in ("backend")'

    def test_label_comma_separated(self):
        result = build_advanced_filter_clause({"label": "backend, frontend"})
        assert 'labels in (' in result
        assert '"backend"' in result
        assert '"frontend"' in result

    def test_label_whitespace_trimmed(self):
        result = build_advanced_filter_clause({"label": " backend , frontend "})
        assert '"backend"' in result
        assert '"frontend"' in result

    def test_empty_label_ignored(self):
        result = build_advanced_filter_clause({"label": ""})
        assert result == ""

    def test_multiple_fields_joined_with_and(self):
        result = build_advanced_filter_clause({
            "priority": ["High"],
            "issueType": ["Bug"],
            "assignee": "Alice",
        })
        parts = result.split(" AND ")
        assert len(parts) == 3

    def test_all_fields(self):
        result = build_advanced_filter_clause({
            "priority": ["High"],
            "issueType": ["Bug"],
            "statusCategory": ["In Progress"],
            "assignee": "Bob",
            "label": "urgent",
        })
        parts = result.split(" AND ")
        assert len(parts) == 5
        assert 'priority in' in result
        assert 'issuetype in' in result
        assert 'statusCategory in' in result
        assert 'assignee = "Bob"' in result
        assert 'labels in' in result

    def test_partial_fields_only_active_ones_appear(self):
        result = build_advanced_filter_clause({
            "priority": [],
            "issueType": ["Task"],
            "assignee": "",
            "label": "",
        })
        assert "priority" not in result
        assert "assignee" not in result
        assert "labels" not in result
        assert 'issuetype in ("Task")' == result


# ══════════════════════════════════════════════════════════════════════════════
# generate_enhanced_metrics — data consistency
# ══════════════════════════════════════════════════════════════════════════════

class TestGenerateEnhancedMetricsConsistency:
    """Verify that metric outputs are internally consistent (no double-counting,
    buckets fit within totals, etc.)."""

    @pytest.fixture
    def mixed_issues(self):
        today = ymd()
        old = ymd(-60)
        very_old = ymd(-100)
        return [
            make_issue("C-1", "Done", "Done", date_str(-10), issue_type="Bug"),
            make_issue("C-2", "Done", "Done", date_str(-5), story_points=3, issue_type="Story"),
            make_issue("C-3", "In Progress", "In Progress", date_str(-20), issue_type="Task"),
            make_issue("C-4", "To Do", "To Do", date_str(-65), issue_type="Story"),
            make_issue("C-5", "In Progress", "In Progress", date_str(-3), story_points=2, issue_type="Bug"),
        ]

    @pytest.mark.asyncio
    async def test_age_distribution_buckets_cover_open_issues(self, mixed_issues):
        metrics = await generate_enhanced_metrics(mixed_issues)
        open_count = sum(
            1 for i in mixed_issues
            if (i["fields"]["status"]["statusCategory"]["name"] or "").lower() != "done"
        )
        age_total = sum(b["count"] for b in (metrics.get("issueAgeDistribution") or []))
        # Age buckets must not exceed the number of open (non-Done) issues
        assert age_total <= open_count

    @pytest.mark.asyncio
    async def test_bottleneck_analysis_does_not_exceed_issue_count(self, mixed_issues):
        metrics = await generate_enhanced_metrics(mixed_issues)
        total = len(mixed_issues)
        for b in (metrics.get("bottleneckAnalysis") or []):
            assert b["issuesStuck"] <= total, (
                f"bottleneck '{b['status']}' reports {b['issuesStuck']} stuck "
                f"but total issues is {total}"
            )

    @pytest.mark.asyncio
    async def test_team_capacity_utilization_is_non_negative(self, mixed_issues):
        metrics = await generate_enhanced_metrics(mixed_issues)
        for member in (metrics.get("teamCapacity") or []):
            assert member["utilizationPercentage"] >= 0, (
                f"utilization for {member['assignee']} is negative"
            )

    @pytest.mark.asyncio
    async def test_predictive_analytics_confidence_in_range(self, mixed_issues):
        metrics = await generate_enhanced_metrics(mixed_issues)
        pa = metrics.get("predictiveAnalytics") or {}
        conf = pa.get("completionConfidence")
        if conf is not None:
            assert 0 <= conf <= 100, f"completionConfidence {conf} outside [0,100]"


# ══════════════════════════════════════════════════════════════════════════════
# Phase 3: date-range anchor correctness
# ══════════════════════════════════════════════════════════════════════════════

class TestDateRangeAnchor:
    """Historical comparison must use date_to as the reference month,
    not datetime.now()."""

    def _make_batch(self, base_date: str, n: int = 3, done: bool = True) -> list:
        cat = "Done" if done else "In Progress"
        return [
            make_issue(f"D-{i}", cat, cat, base_date)
            for i in range(n)
        ]

    @pytest.mark.asyncio
    async def test_historical_comparison_period_label_reflects_date_to(self):
        """Period labels should be derived from date_to, not today."""
        # Use a past month that differs from today
        target_month = datetime(2024, 3, 15)
        date_to = target_month.strftime("%Y-%m-%d")
        date_from = (target_month - timedelta(days=60)).strftime("%Y-%m-%d")

        issues = self._make_batch(
            target_month.strftime("%Y-%m-%dT12:00:00.000+0000")
        )

        metrics = await generate_enhanced_metrics(
            issues,
            date_from=date_from,
            date_to=date_to,
        )

        hist = metrics.get("historicalComparison") or []
        assert len(hist) >= 1, "Expected at least one historical comparison period"

        # At least one period label must reference March or February 2024
        labels = [h["period"] for h in hist]
        assert any("2024" in label for label in labels), (
            f"Expected period labels anchored to 2024, got: {labels}"
        )
        # Must not use the current year if date_to is in 2024
        current_year = str(datetime.now().year)
        if current_year != "2024":
            assert not all(current_year in label for label in labels), (
                f"All period labels use current year {current_year} — "
                f"anchor is not using date_to: {labels}"
            )

    @pytest.mark.asyncio
    async def test_historical_comparison_returns_two_periods(self):
        """Should return this-month and last-month comparison entries."""
        date_to = "2024-06-20"
        date_from = "2024-05-01"
        issues = self._make_batch("2024-06-10T12:00:00.000+0000", n=5)

        metrics = await generate_enhanced_metrics(
            issues,
            date_from=date_from,
            date_to=date_to,
        )

        hist = metrics.get("historicalComparison") or []
        assert len(hist) == 2, f"Expected 2 comparison periods, got {len(hist)}"

    @pytest.mark.asyncio
    async def test_historical_comparison_period_keys_present(self):
        """Each comparison entry must have required keys."""
        date_to = "2024-09-30"
        date_from = "2024-08-01"
        issues = self._make_batch("2024-09-15T12:00:00.000+0000", n=2)

        metrics = await generate_enhanced_metrics(
            issues,
            date_from=date_from,
            date_to=date_to,
        )

        for entry in (metrics.get("historicalComparison") or []):
            for key in ("period", "totalIssues", "completedIssues", "completionRate", "velocity"):
                assert key in entry, f"Missing key '{key}' in historical comparison entry"


# ══════════════════════════════════════════════════════════════════════════════
# Phase 5: filter scoping — advanced filters accepted without error
# ══════════════════════════════════════════════════════════════════════════════

class TestFilterScoping:
    """Ensures generate_enhanced_metrics handles an advanced-filter-narrowed
    issue list without raising and produces valid output shapes."""

    @pytest.mark.asyncio
    async def test_bug_only_filter_produces_valid_metrics(self):
        """Simulates passing only Bug issues (as would be filtered by advancedFilters)."""
        issues = [
            make_issue(f"BUG-{i}", "Done" if i % 2 == 0 else "In Progress",
                       "Done" if i % 2 == 0 else "In Progress",
                       date_str(-i * 3), issue_type="Bug")
            for i in range(6)
        ]
        metrics = await generate_enhanced_metrics(issues)

        assert isinstance(metrics, dict)
        assert "sprintVelocityTrends" in metrics
        assert "bottleneckAnalysis" in metrics
        assert "teamCapacity" in metrics

    @pytest.mark.asyncio
    async def test_single_assignee_filter_produces_valid_metrics(self):
        """Simulates passing issues for a single assignee."""
        issues = [
            make_issue(f"ASN-{i}", "In Progress", "In Progress",
                       date_str(-i * 2), assignee="Charlie")
            for i in range(4)
        ]
        metrics = await generate_enhanced_metrics(issues)
        capacity = metrics.get("teamCapacity") or []
        names = [m["assignee"] for m in capacity]
        if names:
            assert all(n == "Charlie" for n in names), (
                f"Expected only 'Charlie' in capacity, got: {names}"
            )

    @pytest.mark.asyncio
    async def test_empty_issue_list_does_not_raise(self):
        """Edge case: no issues matching the filter."""
        metrics = await generate_enhanced_metrics([])
        assert isinstance(metrics, dict)
        assert metrics.get("bottleneckAnalysis") is not None or \
               metrics.get("bottleneckAnalysis") is None  # either is fine — just no exception

    @pytest.mark.asyncio
    async def test_all_done_issues_no_age_distribution(self):
        """If every issue is Done, open age distribution should have 0 counts."""
        issues = [
            make_issue(f"ALL-{i}", "Done", "Done", date_str(-i * 5))
            for i in range(10)
        ]
        metrics = await generate_enhanced_metrics(issues)
        for bucket in (metrics.get("issueAgeDistribution") or []):
            assert bucket["count"] == 0, (
                f"Bucket '{bucket['range']}' has count {bucket['count']} "
                f"but all issues are Done"
            )

    @pytest.mark.asyncio
    async def test_all_open_issues_age_distribution_matches_total(self):
        """If every issue is open, age buckets must sum to exactly the total."""
        issues = [
            make_issue(f"OPEN-{i}", "In Progress", "In Progress", date_str(-i * 15))
            for i in range(8)
        ]
        metrics = await generate_enhanced_metrics(issues)
        age_total = sum(b["count"] for b in (metrics.get("issueAgeDistribution") or []))
        assert age_total == len(issues), (
            f"Age distribution total {age_total} != issue count {len(issues)}"
        )
