"""
Document Indexer Service
Indexes documents from all sources into unified vector store
"""
import logging
from typing import List, Dict, Any
from services.unified_rag_handler import UnifiedRAGHandler, SourceType

logger = logging.getLogger(__name__)

class DocumentIndexer:
    """Service to index documents from all sources into unified vector store"""
    
    def __init__(self, unified_rag: UnifiedRAGHandler):
        self.unified_rag = unified_rag
    
    def _extract_jira_text(self, issue: Dict[str, Any]) -> str:
        """Extract searchable text from a Jira issue"""
        fields = issue.get('fields', {})
        summary = fields.get('summary', '')
        description = fields.get('description', '') or ''
        
        # Extract comments
        comments = fields.get('comment', {}).get('comments', [])
        comment_texts = [c.get('body', '') for c in comments if isinstance(c.get('body'), str)]
        comments_text = ' '.join(comment_texts)
        
        # Combine all searchable fields
        text_parts = [
            summary,
            description,
            comments_text
        ]
        
        return " ".join(filter(None, text_parts))
    
    async def index_jira_issues(self, issues: List[Dict], jira_base_url: str = ""):
        """Index Jira issues"""
        logger.info(f"Indexing {len(issues)} Jira issues...")
        
        for issue in issues:
            try:
                text = self._extract_jira_text(issue)
                if not text.strip():
                    continue
                
                fields = issue.get('fields', {})
                
                # Safely extract nested fields with None checks
                project_obj = fields.get('project')
                project = project_obj.get('key', '') if project_obj and isinstance(project_obj, dict) else ''
                
                status_obj = fields.get('status')
                status = status_obj.get('name', '') if status_obj and isinstance(status_obj, dict) else ''
                
                assignee_obj = fields.get('assignee')
                assignee = assignee_obj.get('displayName', 'Unassigned') if assignee_obj and isinstance(assignee_obj, dict) else 'Unassigned'
                
                reporter_obj = fields.get('reporter')
                reporter = reporter_obj.get('displayName', 'Unknown') if reporter_obj and isinstance(reporter_obj, dict) else 'Unknown'
                
                metadata = {
                    'id': issue.get('key'),
                    'url': f"{jira_base_url}/browse/{issue.get('key')}" if jira_base_url else "",
                    'project': project,
                    'status': status,
                    'assignee': assignee,
                    'reporter': reporter,
                    'created': fields.get('created', ''),
                    'summary': fields.get('summary', '')
                }
                
                await self.unified_rag.index_document(
                    text=text,
                    source_type=SourceType.JIRA,
                    metadata=metadata
                )
            except Exception as e:
                logger.error(f"Failed to index Jira issue {issue.get('key', 'unknown')}: {e}")
        
        logger.info(f"✅ Indexed {len(issues)} Jira issues")
    
    async def index_confluence_pages(
        self,
        pages: List[Dict],
        confluence_base_url: str = "",
        hierarchy: Dict[str, Any] = None,
        incremental: bool = False
    ):
        """
        Index Confluence pages using smart chunking.

        Each page is split into fine-grained chunks:
          - table_row  : one chunk per table row (with column headers)
          - section    : one chunk per heading block
          - text       : overlapping 300-word chunks for long sections

        Parent-child breadcrumbs are embedded in every chunk so results
        show WHERE in the Confluence tree the answer came from.

        Args:
            pages:               Raw Confluence page dicts (body.storage expanded).
            confluence_base_url: Base URL for building page links.
            hierarchy:           Space hierarchy map from build_space_hierarchy().
                                 Enables full breadcrumb paths.
            incremental:         If True, skip pages whose last_modified hasn't changed.
        """
        from services.confluence_chunker import ConfluenceChunker

        chunker = ConfluenceChunker(base_url=confluence_base_url)

        total_chunks  = 0
        skipped_pages = 0
        updated_pages = 0

        logger.info(f"[Indexer] Starting chunk-based indexing of {len(pages)} pages "
                    f"(incremental={incremental})...")

        for page in pages:
            page_id    = page.get("id", "")
            page_title = page.get("title", "Unknown")

            try:
                # --- Incremental change detection ---
                if incremental and page_id and self.unified_rag.storage:
                    version_obj   = page.get("version", {}) or {}
                    last_modified = version_obj.get("when", "") if isinstance(version_obj, dict) else ""
                    stored_ts = self.unified_rag.storage.get_page_last_modified(page_id)

                    if stored_ts and stored_ts == last_modified:
                        skipped_pages += 1
                        logger.debug(f"[Indexer] Skipping unchanged page: {page_title}")
                        continue

                    # Page has changed — remove old chunks before re-indexing
                    if stored_ts and page_id:
                        removed = self.unified_rag.storage.delete_by_page_id(page_id)
                        logger.debug(f"[Indexer] Removed {removed} stale chunks for '{page_title}'")
                        # Also remove from in-memory store
                        stale_ids = [
                            k for k, v in self.unified_rag.vector_store.items()
                            if v.metadata.get("page_id") == page_id
                        ]
                        for sid in stale_ids:
                            del self.unified_rag.vector_store[sid]

                # --- Chunk the page ---
                chunks = chunker.chunk_page(page, hierarchy=hierarchy)
                if not chunks:
                    continue

                # --- Index each chunk individually ---
                for chunk in chunks:
                    # Unique doc ID per chunk: confluence_<pageId>_chunk_<idx>
                    chunk_doc_id = f"confluence_{page_id}_chunk_{chunk.chunk_index}"

                    metadata = {
                        "id":            chunk_doc_id,
                        "page_id":       chunk.page_id,
                        "title":         chunk.page_title,
                        "space":         chunk.space_key,
                        "space_name":    chunk.space_name,
                        "url":           chunk.url,
                        "breadcrumb":    chunk.breadcrumb,
                        "parent_page_id": chunk.parent_page_id,
                        "chunk_type":    chunk.chunk_type,
                        "section_heading": chunk.section_heading,
                        "table_name":    chunk.table_name,
                        "row_index":     chunk.row_index,
                        "chunk_index":   chunk.chunk_index,
                        "last_modified": chunk.last_modified,
                    }

                    await self.unified_rag.index_document(
                        text=chunk.text,
                        source_type=SourceType.CONFLUENCE,
                        metadata=metadata
                    )

                total_chunks  += len(chunks)
                updated_pages += 1
                logger.debug(f"[Indexer] '{page_title}' → {len(chunks)} chunks")

            except Exception as e:
                logger.error(f"[Indexer] Failed to index page '{page_title}' ({page_id}): {e}")

        logger.info(
            f"✅ [Indexer] Done — {updated_pages} pages indexed, "
            f"{skipped_pages} unchanged pages skipped, "
            f"{total_chunks} total chunks stored"
        )
    
    def _extract_github_text(self, item: Dict[str, Any]) -> str:
        """Extract searchable text from a GitHub issue or PR"""
        title = item.get('title', '')
        body = item.get('body', '') or ''
        labels = [label.get('name', '') for label in item.get('labels', [])]
        
        return f"{title} {body} {' '.join(labels)}".strip()
    
    async def index_github_items(self, items: List[Dict], github_base_url: str = ""):
        """Index GitHub issues/PRs"""
        logger.info(f"Indexing {len(items)} GitHub items...")
        
        for item in items:
            try:
                text = self._extract_github_text(item)
                if not text.strip():
                    continue
                
                item_type = 'pull_request' if 'pull_request' in item else 'issue'
                item_id = str(item.get('number', ''))
                repo = item.get('repository_url', '').split('/')[-1] if item.get('repository_url') else ''
                
                metadata = {
                    'id': item_id,
                    'url': item.get('html_url', ''),
                    'title': item.get('title', ''),
                    'type': item_type,
                    'repository': repo,
                    'state': item.get('state', '')
                }
                
                await self.unified_rag.index_document(
                    text=text,
                    source_type=SourceType.GITHUB,
                    metadata=metadata
                )
            except Exception as e:
                logger.error(f"Failed to index GitHub item {item.get('number', 'unknown')}: {e}")
        
        logger.info(f"✅ Indexed {len(items)} GitHub items")

