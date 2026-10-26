import asyncio
import os
import sys
import unittest
from datetime import date


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import services.tcoe_dashboard as dashboard
from services.qcoe_project_catalog import QcoeProjectCatalog
from services.pi_date_utils import (
    build_pi_date_window,
    compare_metric_by_date,
    get_pi_by_date,
    normalize_tcoe_request_for_pi,
)


class TcoeDashboardDateTests(unittest.TestCase):
    def test_pi_calendar_uses_fixed_quarter_boundaries(self):
        pi1 = build_pi_date_window("2026-01-01")
        self.assertEqual(pi1["pi_context"]["value"], "PI1_CY26")
        self.assertEqual(pi1["pi_start_date"], "2026-01-01")

        self.assertEqual(get_pi_by_date("2026-03-31")["value"], "PI1_CY26")
        self.assertEqual(get_pi_by_date("2026-04-01")["value"], "PI2_CY26")
        self.assertEqual(build_pi_date_window("2026-04-03")["pi_start_date"], "2026-04-01")
        self.assertEqual(get_pi_by_date("2026-12-31")["value"], "PI4_CY26")

    def test_latest_friday_uses_today_when_today_is_friday(self):
        self.assertEqual(dashboard.latest_friday(date(2026, 5, 8)), date(2026, 5, 8))

    def test_latest_friday_rolls_back_from_weekend_and_weekday(self):
        self.assertEqual(dashboard.latest_friday(date(2026, 5, 9)), date(2026, 5, 8))
        self.assertEqual(dashboard.latest_friday(date(2026, 5, 7)), date(2026, 5, 1))

    def test_default_dashboard_dates_use_current_and_previous_friday(self):
        dates = dashboard.build_default_dashboard_dates(date(2026, 5, 8))

        self.assertEqual(dates["current_week_ending"], "2026-05-08")
        self.assertEqual(dates["previous_week_ending"], "2026-05-01")
        self.assertEqual(dates["current_window"]["pi_start_date"], "2026-04-01")
        self.assertEqual(dates["previous_window"]["pi_start_date"], "2026-04-01")

    def test_cross_pi_comparison_keeps_latest_period_on_latest_pi_start(self):
        comparison = compare_metric_by_date("2026-04-03", "2026-03-27")

        self.assertTrue(comparison["is_different_pi"])
        self.assertEqual(comparison["current"]["pi_context"]["value"], "PI2_CY26")
        self.assertEqual(comparison["current"]["pi_start_date"], "2026-04-01")
        self.assertEqual(comparison["previous"]["pi_context"]["value"], "PI1_CY26")
        self.assertEqual(comparison["previous"]["pi_start_date"], "2026-01-01")

    def test_default_dashboard_cross_pi_boundary_uses_current_pi_start_for_current_week(self):
        dates = dashboard.build_default_dashboard_dates(date(2026, 4, 3))

        self.assertEqual(dates["current_week_ending"], "2026-04-03")
        self.assertEqual(dates["previous_week_ending"], "2026-03-27")
        self.assertEqual(dates["current_window"]["pi_start_date"], "2026-04-01")
        self.assertEqual(dates["previous_window"]["pi_start_date"], "2026-01-01")

    def test_normalized_cross_pi_request_keeps_each_period_pi_start(self):
        normalized = normalize_tcoe_request_for_pi({
            "period1_to": "2026-03-27",
            "period2_to": "2026-04-03",
        })

        self.assertEqual(normalized["period1_from"], "2026-01-01")
        self.assertEqual(normalized["period2_from"], "2026-04-01")
        self.assertEqual(normalized["previous_pi_context"]["value"], "PI1_CY26")
        self.assertEqual(normalized["pi_context"]["value"], "PI2_CY26")


class TcoeDashboardRunTests(unittest.TestCase):
    def setUp(self):
        self.catalog = QcoeProjectCatalog.from_jira_projects([
            {"id": "1", "key": "ONE", "name": "One", "projectCategory": {"id": "10", "name": "Portfolio"}},
        ])

    def test_create_dashboard_run_initializes_all_metrics_as_pending(self):
        run = dashboard.create_tcoe_dashboard_run(date(2026, 5, 8), self.catalog)

        self.assertEqual(run["status"], "pending")
        self.assertEqual(run["current_week_ending"], "2026-05-08")
        self.assertEqual(run["previous_week_ending"], "2026-05-01")
        self.assertEqual(len(run["metrics"]), 7)
        self.assertTrue(all(metric["status"] == "pending" for metric in run["metrics"].values()))

    def test_run_has_current_default_dates_matches_requested_week(self):
        run = dashboard.create_tcoe_dashboard_run(date(2026, 5, 8), self.catalog)

        self.assertTrue(dashboard.run_has_current_default_dates(run, date(2026, 5, 8)))
        self.assertFalse(dashboard.run_has_current_default_dates(run, date(2026, 5, 15)))

    def test_run_stores_catalog_signature_and_project_count(self):
        catalog = QcoeProjectCatalog.from_jira_projects([
            {"id": "1", "key": "ONE", "name": "One", "projectCategory": {"id": "10", "name": "Portfolio"}},
            {"id": "2", "key": "TWO", "name": "Two"},
        ])

        run = dashboard.create_tcoe_dashboard_run(date(2026, 5, 8), catalog)

        self.assertEqual(run["catalog_signature"], catalog.signature)
        self.assertEqual(run["project_count"], 2)


class TcoeDashboardProgressTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_state_updates_as_individual_metrics_complete(self):
        catalog = QcoeProjectCatalog.from_jira_projects([
            {"id": "1", "key": "DS", "name": "Data Solutions", "projectCategory": {"id": "10", "name": "Data Solutions"}}
        ])
        run = dashboard.create_tcoe_dashboard_run(date(2026, 5, 8), catalog)
        original = dashboard.analyze_dashboard_metric

        async def fake_analyze_metric(metric_key, jira_client, run_record, project_catalog, portfolios=None):
            if metric_key == "test_coverage":
                await asyncio.sleep(0.01)
            else:
                await asyncio.sleep(0.2)
            return {
                "key": metric_key,
                "label": metric_key,
                "description": "",
                "rows": [{"portfolio": "Data Solutions", "metric": metric_key}],
                "errors": [],
            }

        dashboard.analyze_dashboard_metric = fake_analyze_metric
        try:
            task = asyncio.create_task(dashboard.process_tcoe_dashboard_run(run, object(), catalog))
            await asyncio.sleep(0.06)

            self.assertEqual(run["metrics"]["test_coverage"]["status"], "completed")
            self.assertEqual(run["metrics"]["test_story_ratio"]["status"], "processing")
            self.assertEqual(run["status"], "processing")

            await task
            self.assertEqual(run["status"], "completed")
            self.assertTrue(all(metric["status"] == "completed" for metric in run["metrics"].values()))
        finally:
            dashboard.analyze_dashboard_metric = original


if __name__ == "__main__":
    unittest.main()
