import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import generate_enhanced_metrics


def make_issue(key, status_name, status_category, updated, story_points=None, story_point_field="customfield_12345"):
    fields = {
        "summary": f"{key} summary",
        "status": {
            "name": status_name,
            "statusCategory": {"name": status_category},
        },
        "updated": updated,
        "created": updated,
    }
    if story_points is not None:
        fields[story_point_field] = story_points
    return {"key": key, "fields": fields}


@pytest.mark.asyncio
async def test_velocity_trends_use_resolved_story_point_field():
    updated = datetime.now().strftime("%Y-%m-%d")
    issues = [
        make_issue("VEL-1", "QE Complete", "Done", updated, story_points=5),
        make_issue("VEL-2", "Done", "Done", updated, story_points=3),
        make_issue("VEL-3", "In Progress", "In Progress", updated, story_points=2),
    ]

    metrics = await generate_enhanced_metrics(
        issues,
        story_point_field_ids=["customfield_12345"],
    )

    trend = metrics["sprintVelocityTrends"][0]
    assert trend["committedPoints"] == 10
    assert trend["completedPoints"] == 8
    assert trend["velocity"] == 8


@pytest.mark.asyncio
async def test_velocity_trends_fallback_to_completed_issue_count_without_points():
    updated = datetime.now().strftime("%Y-%m-%d")
    issues = [
        make_issue("VEL-1", "QE Complete", "Done", updated),
        make_issue("VEL-2", "Closed", "Done", updated),
        make_issue("VEL-3", "In Progress", "In Progress", updated),
    ]

    metrics = await generate_enhanced_metrics(issues)

    trend = metrics["sprintVelocityTrends"][0]
    assert trend["committedPoints"] == 3
    assert trend["completedPoints"] == 2
    assert trend["velocity"] == 2
