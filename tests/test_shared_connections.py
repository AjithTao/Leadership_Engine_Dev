"""Exercise the endpoint without importing unrelated application startup jobs."""
import ast
import asyncio
import logging
import os
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


class SharedConnectionTests(unittest.IsolatedAsyncioTestCase):
    def load_endpoint(self, state):
        source = ast.parse((Path(__file__).resolve().parents[1] / "backend/main.py").read_text(encoding="utf-8"))
        names = {"_shared_client_healthy", "auto_connect_integrations", "_connect_shared_integrations"}
        nodes = [node for node in source.body if isinstance(node, ast.AsyncFunctionDef) and node.name in names]
        for node in nodes:
            node.decorator_list = []
        namespace = dict(asyncio=asyncio, os=os, app_state=state,
                         logger=logging.getLogger("test"), _integration_connect_lock=asyncio.Lock())
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "<connections>", "exec"), namespace)
        return namespace

    async def test_concurrent_calls_reuse_healthy_clients(self):
        jira = SimpleNamespace(validate_connection=AsyncMock(return_value={"success": True}), close=AsyncMock())
        confluence = SimpleNamespace(validate_connection=AsyncMock(return_value={"success": True}), close=AsyncMock())
        github = SimpleNamespace(get_status=AsyncMock(return_value={"connected": True}), set_token=MagicMock())
        state = SimpleNamespace(jira_configured=True, jira_client=jira,
                                confluence_configured=True, confluence_client=confluence,
                                github_client=github, tableau_configured=False, tableau_client=None)
        ns = self.load_endpoint(state)
        scheduler = MagicMock()
        scheduler.is_running.return_value = True
        scheduler.warmup_if_empty = AsyncMock()
        module = SimpleNamespace(get_indexing_scheduler=lambda: scheduler)
        with patch.dict(os.environ, {}, clear=True), patch.dict(sys.modules, {"services.indexing_scheduler": module}):
            results = await asyncio.gather(ns["auto_connect_integrations"](), ns["auto_connect_integrations"]())
            await asyncio.sleep(0)
        for result in results:
            for provider in ("jira", "confluence", "github"):
                self.assertTrue(result["results"][provider]["success"])
        jira.close.assert_not_called()
        confluence.close.assert_not_called()
        github.set_token.assert_not_called()
        self.assertIs(state.jira_client, jira)

    async def test_missing_jira_credentials_do_not_block_other_providers(self):
        confluence = SimpleNamespace(validate_connection=AsyncMock(return_value={"success": True}))
        github = SimpleNamespace(get_status=AsyncMock(return_value={"connected": True}))
        state = SimpleNamespace(jira_configured=False, jira_client=None,
                                confluence_configured=True, confluence_client=confluence,
                                github_client=github, tableau_configured=False, tableau_client=None)
        ns = self.load_endpoint(state)
        scheduler = MagicMock()
        scheduler.is_running.return_value = True
        scheduler.warmup_if_empty = AsyncMock()
        module = SimpleNamespace(get_indexing_scheduler=lambda: scheduler)
        with patch.dict(os.environ, {}, clear=True), patch.dict(sys.modules, {"services.indexing_scheduler": module}):
            result = await ns["auto_connect_integrations"]()
            await asyncio.sleep(0)
        self.assertFalse(result["results"]["jira"]["success"])
        self.assertIn("not configured", result["results"]["jira"]["message"])
        self.assertTrue(result["results"]["confluence"]["success"])
        self.assertTrue(result["results"]["github"]["success"])

    async def test_unhealthy_or_missing_client_is_not_reused(self):
        ns = self.load_endpoint(SimpleNamespace())
        self.assertFalse(await ns["_shared_client_healthy"](None))
        client = SimpleNamespace(validate_connection=AsyncMock(side_effect=RuntimeError("offline")))
        self.assertFalse(await ns["_shared_client_healthy"](client))

    async def test_initialization_is_serialized(self):
        ns = self.load_endpoint(SimpleNamespace())
        active = 0
        peak = 0
        async def initialize():
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.01)
            active -= 1
        ns["_connect_shared_integrations"] = initialize
        await asyncio.gather(*(ns["auto_connect_integrations"]() for _ in range(3)))
        self.assertEqual(peak, 1)
