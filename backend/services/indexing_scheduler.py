"""
Automated Indexing Scheduler
Periodically indexes documents from Jira, Confluence, and GitHub.

Status tracking is exposed via get_status() so the API and UI can show
real-time indexing progress to the user instead of silent failures.
"""
import os
import logging
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from services.unified_rag_handler import get_unified_rag_handler
from services.document_indexer import DocumentIndexer

logger = logging.getLogger(__name__)


class IndexingScheduler:
    """Scheduler for automated document indexing with real-time status tracking."""

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.unified_rag = get_unified_rag_handler()
        self.indexer = DocumentIndexer(self.unified_rag) if self.unified_rag else None
        self._running = False

        self.jira_client       = None
        self.confluence_client = None
        self.github_client     = None

        # ---- Live status ----
        self._status: Dict[str, Any] = {
            "phase":          "idle",        # idle | warmup | full_confluence | incremental_confluence | incremental_jira
            "is_indexing":    False,
            "total_pages":    0,
            "indexed_pages":  0,
            "progress_pct":   0,
            "last_indexed_at": None,         # ISO string of last successful completion
            "last_error":     None,
            "doc_count":      0,
        }

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def set_clients(self, jira_client=None, confluence_client=None, github_client=None):
        """Set API clients for indexing."""
        self.jira_client       = jira_client
        self.confluence_client = confluence_client
        self.github_client     = github_client
        logger.info("✅ Indexing clients configured")

    def get_status(self) -> Dict[str, Any]:
        """Return a snapshot of the current indexing status."""
        doc_count = 0
        if self.unified_rag and self.unified_rag.storage:
            try:
                doc_count = self.unified_rag.storage.get_document_count()
            except Exception:
                pass
        return {
            **self._status,
            "scheduler_running": self._running,
            "doc_count":         doc_count,
        }

    def is_running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # Private status helpers
    # ------------------------------------------------------------------

    def _start_phase(self, phase: str, total: int = 0):
        self._status.update({
            "phase":         phase,
            "is_indexing":   True,
            "total_pages":   total,
            "indexed_pages": 0,
            "progress_pct":  0,
            "last_error":    None,
        })

    def _update_progress(self, indexed: int):
        total = self._status["total_pages"] or 1
        self._status["indexed_pages"] = indexed
        self._status["progress_pct"]  = round(indexed / total * 100)

    def _finish_phase(self, error: str = None):
        self._status.update({
            "is_indexing":    False,
            "phase":          "idle",
            "progress_pct":   100 if not error else self._status["progress_pct"],
            "last_indexed_at": datetime.utcnow().isoformat() if not error else self._status["last_indexed_at"],
            "last_error":     error,
        })

    # ------------------------------------------------------------------
    # Jira
    # ------------------------------------------------------------------

    async def _index_recent_jira_issues(self):
        """Index recent Jira issues (last 7 days)."""
        if not self.jira_client or not self.indexer:
            logger.warning("⚠️ Jira client not available for indexing")
            return

        self._start_phase("incremental_jira")
        try:
            logger.info("🔄 Starting automated Jira indexing...")
            date_from = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            jql = f"updated >= {date_from} ORDER BY updated DESC"
            search_result = await self.jira_client.search(jql, max_results=500)
            issues = search_result.get('issues', [])

            if issues:
                self._start_phase("incremental_jira", total=len(issues))
                jira_base_url = os.getenv("JIRA_BASE_URL", "")
                await self.indexer.index_jira_issues(issues, jira_base_url)
                logger.info(f"✅ Indexed {len(issues)} recent Jira issues")
            else:
                logger.info("ℹ️ No recent Jira issues to index")

            self._finish_phase()
        except Exception as e:
            logger.error(f"❌ Failed to index Jira issues: {e}", exc_info=True)
            self._finish_phase(error=str(e))

    # ------------------------------------------------------------------
    # Confluence — full
    # ------------------------------------------------------------------

    async def _index_full_confluence(self):
        """
        Index ALL Confluence pages from all spaces using smart chunking.

        Steps:
          1. Fetch all pages from all spaces (ancestors expanded)
          2. Build full parent-child hierarchy for breadcrumb generation
          3. Chunk each page (table rows, sections, text) individually
          4. Store embeddings with page_id + last_modified for change detection
        """
        if not self.confluence_client or not self.indexer:
            logger.warning("⚠️ Confluence client not available for indexing")
            return

        self._start_phase("full_confluence")
        try:
            logger.info("🔄 Starting FULL Confluence indexing (all spaces, chunked)...")
            base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")

            all_pages = await self.confluence_client.get_all_pages()
            if not all_pages:
                logger.warning("⚠️ No Confluence pages found to index")
                self._finish_phase()
                return

            self._start_phase("full_confluence", total=len(all_pages))
            logger.info(f"📄 Fetched {len(all_pages)} pages — building hierarchy...")

            hierarchy = await self.confluence_client.build_full_hierarchy()

            # Wrap index call to track page-level progress
            await self._index_pages_with_progress(
                pages=all_pages,
                base_url=base_url,
                hierarchy=hierarchy,
                incremental=False
            )

            doc_count = self.unified_rag.storage.get_document_count() if self.unified_rag and self.unified_rag.storage else "?"
            logger.info(
                f"✅ FULL INDEX complete — {len(all_pages)} pages processed. "
                f"Total chunks in store: {doc_count}"
            )
            self._finish_phase()

        except Exception as e:
            logger.error(f"❌ Failed to perform full Confluence indexing: {e}", exc_info=True)
            self._finish_phase(error=str(e))

    # ------------------------------------------------------------------
    # Confluence — incremental
    # ------------------------------------------------------------------

    async def _index_recent_confluence_pages(self):
        """Index recent Confluence pages (last 7 days) — incremental update."""
        if not self.confluence_client or not self.indexer:
            logger.warning("⚠️ Confluence client not available for indexing")
            return

        self._start_phase("incremental_confluence")
        try:
            logger.info("🔄 Starting incremental Confluence indexing (recent pages)...")

            date_from = (datetime.now() - timedelta(days=7)).strftime('%Y/%m/%d')
            cql       = f'lastModified >= "{date_from}" ORDER BY lastModified DESC'
            base_url  = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
            if not base_url:
                logger.warning("⚠️ CONFLUENCE_BASE_URL not set")
                self._finish_phase()
                return

            import httpx
            from services.encryption import get_encrypted_env

            email     = os.getenv("CONFLUENCE_SERVICE_EMAIL")
            raw_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN")
            if raw_token and raw_token.startswith('gAAAAA'):
                try:
                    api_token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")
                except Exception:
                    api_token = raw_token
            else:
                api_token = raw_token

            if not (email and api_token):
                logger.warning("⚠️ Confluence credentials not available")
                self._finish_phase()
                return

            search_url = f"{base_url}/rest/api/search"
            params     = {"cql": cql, "limit": "500"}

            async with httpx.AsyncClient(auth=(email, api_token), timeout=60.0) as client:
                response = await client.get(search_url, params=params)
                response.raise_for_status()
                results = response.json().get("results", [])

            if results:
                self._start_phase("incremental_confluence", total=len(results))
                changed_space_keys = list({
                    r.get("space", {}).get("key", "")
                    for r in results
                    if r.get("space", {}).get("key")
                })
                hierarchy = {}
                for sk in changed_space_keys:
                    try:
                        space_hier = await self.confluence_client.build_space_hierarchy(sk)
                        hierarchy.update(space_hier)
                    except Exception:
                        pass

                await self._index_pages_with_progress(
                    pages=results,
                    base_url=base_url,
                    hierarchy=hierarchy,
                    incremental=True
                )
                logger.info(f"✅ Incremental: processed {len(results)} recent Confluence pages")
            else:
                logger.info("ℹ️ No recent Confluence pages to index")

            self._finish_phase()

        except Exception as e:
            logger.error(f"❌ Failed to index recent Confluence pages: {e}", exc_info=True)
            self._finish_phase(error=str(e))

    # ------------------------------------------------------------------
    # Progress-aware wrapper for page indexing
    # ------------------------------------------------------------------

    async def _index_pages_with_progress(
        self,
        pages: list,
        base_url: str,
        hierarchy: dict,
        incremental: bool
    ):
        """
        Call the indexer in batches of 50 pages so we can update
        progress_pct throughout the run (visible in /api/index-status).
        """
        BATCH = 50
        total = len(pages)
        done  = 0

        for i in range(0, total, BATCH):
            batch = pages[i : i + BATCH]
            await self.indexer.index_confluence_pages(
                pages=batch,
                confluence_base_url=base_url,
                hierarchy=hierarchy,
                incremental=incremental
            )
            done += len(batch)
            self._update_progress(done)
            logger.info(f"[Progress] {done}/{total} pages indexed ({self._status['progress_pct']}%)")
            # Yield control so the event loop stays responsive
            await asyncio.sleep(0)

    # ------------------------------------------------------------------
    # GitHub (stub)
    # ------------------------------------------------------------------

    async def _index_recent_github_items(self):
        """Index recent GitHub issues/PRs (last 7 days)."""
        if not self.github_client or not self.indexer:
            return
        logger.info("ℹ️ GitHub indexing not fully implemented yet")

    # ------------------------------------------------------------------
    # Full cycle
    # ------------------------------------------------------------------

    async def _full_index(self):
        """Perform full indexing of all sources."""
        logger.info("🔄 Starting full indexing cycle...")
        await self._index_recent_jira_issues()
        await self._index_recent_confluence_pages()
        await self._index_recent_github_items()
        logger.info("✅ Full indexing cycle completed")

    # ------------------------------------------------------------------
    # Warmup
    # ------------------------------------------------------------------

    async def warmup_if_empty(self):
        """
        Trigger a full Confluence index if the vector store is empty.
        Called once at app startup so the first query doesn't hit a cold index.
        """
        if not self.unified_rag or not self.unified_rag.storage:
            return
        count = self.unified_rag.storage.get_document_count()
        if count == 0:
            logger.info("🔥 Index is empty — triggering warmup full index...")
            await self._index_full_confluence()
        else:
            logger.info(f"✅ Index already has {count} documents — no warmup needed")

    # ------------------------------------------------------------------
    # Scheduler lifecycle
    # ------------------------------------------------------------------

    def start(self):
        """Start the indexing scheduler."""
        if self._running:
            logger.warning("⚠️ Scheduler already running")
            return
        if not self.indexer:
            logger.error("❌ Indexer not initialized. Cannot start scheduler.")
            return

        self.scheduler = AsyncIOScheduler()

        self.scheduler.add_job(
            self._index_recent_jira_issues,
            trigger=IntervalTrigger(minutes=15),
            id='incremental_jira',
            name='Incremental Jira Indexing',
            replace_existing=True
        )
        self.scheduler.add_job(
            self._index_recent_confluence_pages,
            trigger=IntervalTrigger(hours=1),
            id='incremental_confluence',
            name='Incremental Confluence Indexing (Hourly)',
            replace_existing=True
        )
        self.scheduler.add_job(
            self._full_index,
            trigger=CronTrigger(hour=2, minute=0),
            id='full_index',
            name='Full Daily Re-indexing',
            replace_existing=True
        )

        self.scheduler.start()
        self._running = True
        logger.info("✅ Indexing scheduler started")
        logger.info("   - Incremental Jira:        Every 15 minutes")
        logger.info("   - Incremental Confluence:  Every 1 hour")
        logger.info("   - Full re-indexing:        Daily at 2:00 AM")

    def stop(self):
        """Stop the indexing scheduler."""
        if not self._running or not self.scheduler:
            return
        self.scheduler.shutdown()
        self._running = False
        logger.info("✅ Indexing scheduler stopped")


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

_indexing_scheduler: Optional[IndexingScheduler] = None


def get_indexing_scheduler() -> Optional[IndexingScheduler]:
    """Get or create indexing scheduler instance."""
    global _indexing_scheduler
    if _indexing_scheduler is None:
        _indexing_scheduler = IndexingScheduler()
    return _indexing_scheduler
