"""
Confluence Smart Chunker
========================
Converts Confluence pages into fine-grained, independently-searchable chunks.

Every chunk is self-contained — it carries enough context to be understood
without seeing the rest of the page.

Chunk types produced:
  table_row  — one chunk per table row, column headers prepended
               e.g. "Workflow: GL Inquiry | Repo: ...gl-inquiry.git | Branch: me-gl-main | POCs: Ajith, Ganesh"
  section    — one heading-block per chunk (heading + its body content)
  text       — overlapping 300-word sub-chunks for long narrative sections
  full_page  — fallback for very short pages (< 300 chars)

Parent-child breadcrumbs are embedded in every chunk:
  "[EMT > Modern Enablement > Automation - DMS Modern Enablement]"
  so a global search can show WHERE the answer came from without extra API calls.
"""

import re
import html as html_mod
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ContentChunk:
    """A single independently-searchable chunk from a Confluence page."""
    text: str                              # Full searchable text (sent to embedding API)
    chunk_type: str                        # 'table_row' | 'section' | 'text' | 'full_page'
    page_id: str                           # Confluence page ID
    page_title: str                        # Page title
    space_key: str                         # e.g. "EMT"
    space_name: str                        # e.g. "Engineering Efficiency Transformation"
    url: str                               # Direct page URL
    breadcrumb: str                        # "Parent > Child > Page" path
    parent_page_id: Optional[str] = None  # Immediate parent page ID (None = root)
    section_heading: Optional[str] = None # Heading this chunk falls under
    table_name: Optional[str] = None      # Heading of the table (if table_row)
    row_index: Optional[int] = None       # Row number within the table
    chunk_index: int = 0                   # Sequential index within the page
    last_modified: Optional[str] = None   # ISO timestamp from Confluence version.when
    metadata: Dict[str, Any] = field(default_factory=dict)


class ConfluenceChunker:
    """
    Splits Confluence pages into fine-grained chunks.

    Usage:
        chunker = ConfluenceChunker(base_url="https://confluence.cdk.com")
        hierarchy = await client.build_space_hierarchy("EMT")
        chunks = chunker.chunk_page(page_dict, hierarchy)
    """

    MAX_SECTION_CHARS = 1500   # Max characters per section chunk before splitting
    OVERLAP_CHARS     = 150    # Overlap between adjacent text sub-chunks
    MIN_CHUNK_CHARS   = 50     # Discard chunks shorter than this (likely empty cells)
    MAX_BREADCRUMB_DEPTH = 4   # Maximum ancestor levels to show in breadcrumb

    def __init__(self, base_url: str = ""):
        self.base_url = base_url.rstrip("/")

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def chunk_page(
        self,
        page: Dict[str, Any],
        hierarchy: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """
        Convert one Confluence page into a list of ContentChunks.

        Args:
            page:      Raw Confluence page dict with body.storage expanded.
            hierarchy: Space hierarchy map produced by build_space_hierarchy().
                       If None, breadcrumbs fall back to page title only.

        Returns:
            List of ContentChunk — ready to embed and store.
        """
        page_id    = page.get("id", "")
        page_title = page.get("title", "Untitled")
        space_obj  = page.get("space", {}) or {}
        space_key  = space_obj.get("key", "") if isinstance(space_obj, dict) else ""
        space_name = space_obj.get("name", space_key) if isinstance(space_obj, dict) else space_key

        # Last modified timestamp
        version_obj   = page.get("version", {}) or {}
        last_modified = version_obj.get("when", "") if isinstance(version_obj, dict) else ""

        # Build page URL
        url = (
            f"{self.base_url}/pages/viewpage.action?pageId={page_id}"
            if page_id else ""
        )

        # Breadcrumb from hierarchy or ancestors field
        breadcrumb    = self._build_breadcrumb(page_id, page_title, page, hierarchy)
        parent_page_id = self._get_parent_id(page_id, page, hierarchy)

        # Raw HTML storage body
        body_storage = page.get("body", {}).get("storage", {}) or {}
        raw_html = body_storage.get("value", "") if isinstance(body_storage, dict) else ""

        base_meta = {
            "page_id":       page_id,
            "page_title":    page_title,
            "space_key":     space_key,
            "space_name":    space_name,
            "url":           url,
            "breadcrumb":    breadcrumb,
            "parent_page_id": parent_page_id,
            "last_modified": last_modified,
        }

        # --- No content: single title chunk ---
        if not raw_html.strip():
            return [ContentChunk(
                text=page_title,
                chunk_type="full_page",
                **{k: base_meta[k] for k in
                   ["page_id","page_title","space_key","space_name","url","breadcrumb","parent_page_id"]},
                last_modified=last_modified,
                chunk_index=0,
                metadata=base_meta
            )]

        chunks: List[ContentChunk] = []
        idx = 0

        # --- Priority 1: Table rows (most structured, highest search value) ---
        table_chunks = self._chunk_tables(raw_html, base_meta, idx)
        chunks.extend(table_chunks)
        idx += len(table_chunks)

        # --- Priority 2: Sections (headings + body text) ---
        # Strip tables from HTML so their content doesn't duplicate in sections
        html_no_tables = re.sub(
            r"<table[^>]*>.*?</table>", "", raw_html,
            flags=re.DOTALL | re.IGNORECASE
        )
        section_chunks = self._chunk_sections(html_no_tables, base_meta, idx)
        chunks.extend(section_chunks)

        # --- Fallback: full page if nothing else was produced ---
        if not chunks:
            from services.confluence import ConfluenceClient
            plain = ConfluenceClient.storage_html_to_text(raw_html).strip()
            if plain:
                chunks.append(ContentChunk(
                    text=f"{page_title}\n\n{plain[:self.MAX_SECTION_CHARS]}",
                    chunk_type="full_page",
                    **{k: base_meta[k] for k in
                       ["page_id","page_title","space_key","space_name","url","breadcrumb","parent_page_id"]},
                    last_modified=last_modified,
                    chunk_index=0,
                    metadata=base_meta
                ))

        logger.debug(
            f"[Chunker] '{page_title}' ({space_key}) → "
            f"{len(chunks)} chunks "
            f"({len(table_chunks)} table_row, {len(section_chunks)} section)"
        )
        return chunks

    # -------------------------------------------------------------------------
    # Table chunking
    # -------------------------------------------------------------------------

    def _chunk_tables(
        self,
        html: str,
        base_meta: Dict[str, Any],
        start_index: int = 0
    ) -> List[ContentChunk]:
        """
        For each table in the page, produce one chunk per DATA row.
        Column headers are prepended to each row so the chunk is self-contained.

        Example chunk text:
          "[EMT > Automation - DMS Modern Enablement]
           Workflow Name: GL Inquiry | Master Repo URL: https://github.com/cdk-prod/app-dms-gl-inquiry.git
           | Internal Main Branches: me-gl-main(internal) | POCs: Ajith Ramesh, Ganesh Kumar, Shalini Reddy Bakkapolla"
        """
        from services.confluence import ConfluenceClient

        chunks: List[ContentChunk] = []
        idx = start_index

        table_re = re.compile(
            r"<table[^>]*>(.*?)</table>",
            re.DOTALL | re.IGNORECASE
        )

        for table_match in table_re.finditer(html):
            table_html   = table_match.group(1)
            table_start  = table_match.start()
            table_heading = self._find_preceding_heading(html[:table_start])

            headers   = self._extract_table_headers(table_html)
            data_rows = self._extract_table_rows(table_html)

            for row_idx, row_cells in enumerate(data_rows):
                if not row_cells:
                    continue
                # Skip the header row if it appears as a data row too
                if headers and self._is_header_row(row_cells, headers):
                    continue

                # Build "Header: value | Header: value | ..." string
                if headers:
                    pairs = []
                    for col_i, cell_html in enumerate(row_cells):
                        header    = headers[col_i] if col_i < len(headers) else f"Col{col_i + 1}"
                        cell_text = ConfluenceClient.storage_html_to_text(cell_html).strip()
                        if cell_text:
                            pairs.append(f"{header}: {cell_text}")
                    row_text = " | ".join(pairs)
                else:
                    cleaned = [
                        ConfluenceClient.storage_html_to_text(c).strip()
                        for c in row_cells
                    ]
                    row_text = " | ".join(c for c in cleaned if c)

                if not row_text or len(row_text) < self.MIN_CHUNK_CHARS:
                    continue

                # Prefix with breadcrumb + table heading for full context
                context = base_meta["breadcrumb"]
                if table_heading:
                    context += f" > {table_heading}"

                full_text = f"[{context}]\n{row_text}"

                chunks.append(ContentChunk(
                    text=full_text,
                    chunk_type="table_row",
                    page_id=base_meta["page_id"],
                    page_title=base_meta["page_title"],
                    space_key=base_meta["space_key"],
                    space_name=base_meta["space_name"],
                    url=base_meta["url"],
                    breadcrumb=base_meta["breadcrumb"],
                    parent_page_id=base_meta.get("parent_page_id"),
                    last_modified=base_meta.get("last_modified"),
                    table_name=table_heading,
                    row_index=row_idx,
                    chunk_index=idx,
                    metadata={
                        **base_meta,
                        "table_heading": table_heading,
                        "row_index": row_idx,
                        "headers": headers,
                    }
                ))
                idx += 1

        return chunks

    # -------------------------------------------------------------------------
    # Section chunking
    # -------------------------------------------------------------------------

    def _chunk_sections(
        self,
        html: str,
        base_meta: Dict[str, Any],
        start_index: int = 0
    ) -> List[ContentChunk]:
        """
        Split HTML into heading-bounded sections.
        Each section = one h1-h6 heading + all content until the next heading.
        Long sections are further split into overlapping text chunks.
        """
        from services.confluence import ConfluenceClient

        chunks: List[ContentChunk] = []
        idx = start_index

        heading_re = re.compile(
            r"(<h[1-6][^>]*>.*?</h[1-6]>)",
            re.DOTALL | re.IGNORECASE
        )

        parts = heading_re.split(html)

        # Start with the page title as the implicit first heading
        current_heading = base_meta["page_title"]
        content_parts: List[str] = []

        def _flush():
            nonlocal idx
            if not content_parts:
                return
            raw_section = ConfluenceClient.storage_html_to_text(
                "".join(content_parts)
            ).strip()
            if not raw_section or len(raw_section) < self.MIN_CHUNK_CHARS:
                return
            sub = self._split_long_section(
                heading=current_heading,
                text=raw_section,
                base_meta=base_meta,
                start_idx=idx
            )
            chunks.extend(sub)
            idx += len(sub)
            content_parts.clear()

        for part in parts:
            if re.match(r"<h[1-6]", part, re.IGNORECASE):
                _flush()
                current_heading = re.sub(r"<[^>]+>", "", part).strip()
            else:
                content_parts.append(part)

        _flush()   # flush final section
        return chunks

    def _split_long_section(
        self,
        heading: str,
        text: str,
        base_meta: Dict[str, Any],
        start_idx: int = 0
    ) -> List[ContentChunk]:
        """Split a long text section into overlapping chunks."""
        if len(text) <= self.MAX_SECTION_CHARS:
            return [ContentChunk(
                text=f"[{base_meta['breadcrumb']}]\n{heading}\n\n{text}",
                chunk_type="section",
                page_id=base_meta["page_id"],
                page_title=base_meta["page_title"],
                space_key=base_meta["space_key"],
                space_name=base_meta["space_name"],
                url=base_meta["url"],
                breadcrumb=base_meta["breadcrumb"],
                parent_page_id=base_meta.get("parent_page_id"),
                last_modified=base_meta.get("last_modified"),
                section_heading=heading,
                chunk_index=start_idx,
                metadata={**base_meta, "section_heading": heading}
            )]

        # Split into overlapping word windows
        words = text.split()
        words_per_chunk  = self.MAX_SECTION_CHARS // 6   # ~6 chars/word average
        overlap_words    = self.OVERLAP_CHARS // 6
        result: List[ContentChunk] = []
        i, sub_idx = 0, 0

        while i < len(words):
            chunk_words = words[i: i + words_per_chunk]
            chunk_text  = " ".join(chunk_words)

            result.append(ContentChunk(
                text=f"[{base_meta['breadcrumb']}]\n{heading}\n\n{chunk_text}",
                chunk_type="text",
                page_id=base_meta["page_id"],
                page_title=base_meta["page_title"],
                space_key=base_meta["space_key"],
                space_name=base_meta["space_name"],
                url=base_meta["url"],
                breadcrumb=base_meta["breadcrumb"],
                parent_page_id=base_meta.get("parent_page_id"),
                last_modified=base_meta.get("last_modified"),
                section_heading=heading,
                chunk_index=start_idx + sub_idx,
                metadata={**base_meta, "section_heading": heading, "sub_chunk": sub_idx}
            ))
            sub_idx += 1
            i += words_per_chunk - overlap_words
            if i + overlap_words >= len(words):
                break

        return result

    # -------------------------------------------------------------------------
    # Table parsing helpers
    # -------------------------------------------------------------------------

    def _extract_table_headers(self, table_html: str) -> List[str]:
        """
        Extract header names from the first <tr> that contains <th> tags.
        Falls back to first <tr>'s <td> cells if no <th> found.
        """
        from services.confluence import ConfluenceClient

        first_row = re.search(
            r"<tr[^>]*>(.*?)</tr>", table_html, re.DOTALL | re.IGNORECASE
        )
        if not first_row:
            return []

        row_html = first_row.group(1)

        # Try <th> cells
        th_cells = re.findall(
            r"<th[^>]*>(.*?)</th>", row_html, re.DOTALL | re.IGNORECASE
        )
        if th_cells:
            return [ConfluenceClient.storage_html_to_text(h).strip() for h in th_cells]

        # Fallback: first <td> row as header
        td_cells = re.findall(
            r"<td[^>]*>(.*?)</td>", row_html, re.DOTALL | re.IGNORECASE
        )
        return [ConfluenceClient.storage_html_to_text(c).strip() for c in td_cells]

    def _extract_table_rows(self, table_html: str) -> List[List[str]]:
        """Return all rows as lists of raw cell HTML strings."""
        rows = []
        for row_m in re.finditer(
            r"<tr[^>]*>(.*?)</tr>", table_html, re.DOTALL | re.IGNORECASE
        ):
            cells = re.findall(
                r"<(?:td|th)[^>]*>(.*?)</(?:td|th)>",
                row_m.group(1), re.DOTALL | re.IGNORECASE
            )
            if cells:
                rows.append(cells)
        return rows

    def _is_header_row(self, row_cells: List[str], headers: List[str]) -> bool:
        """True if the cleaned row content matches the extracted headers."""
        from services.confluence import ConfluenceClient
        if len(row_cells) != len(headers):
            return False
        cleaned = [
            ConfluenceClient.storage_html_to_text(c).strip() for c in row_cells
        ]
        return cleaned == headers

    def _find_preceding_heading(self, html: str) -> Optional[str]:
        """Return the text of the most recent heading before a given html position."""
        headings = re.findall(
            r"<h[1-6][^>]*>(.*?)</h[1-6]>", html, re.DOTALL | re.IGNORECASE
        )
        if headings:
            return re.sub(r"<[^>]+>", "", headings[-1]).strip()
        return None

    # -------------------------------------------------------------------------
    # Breadcrumb & hierarchy helpers
    # -------------------------------------------------------------------------

    def _build_breadcrumb(
        self,
        page_id: str,
        page_title: str,
        page: Dict[str, Any],
        hierarchy: Optional[Dict[str, Any]]
    ) -> str:
        """
        Build "Space > Grandparent > Parent > Page" breadcrumb.

        Sources tried in order:
          1. hierarchy map (built from full space crawl — most complete)
          2. page['ancestors'] field (available if expand=ancestors was used)
          3. page title only (fallback)
        """
        ancestors: List[str] = []

        if hierarchy and page_id in hierarchy:
            anc_list = hierarchy[page_id].get("ancestors", [])
            ancestors = [a["title"] for a in anc_list if a.get("title")]
        else:
            # Try the ancestors field embedded in the page dict
            raw_ancestors = page.get("ancestors", [])
            if isinstance(raw_ancestors, list):
                ancestors = [
                    a.get("title", "")
                    for a in raw_ancestors
                    if isinstance(a, dict) and a.get("title")
                ]

        parts = ancestors + [page_title]

        # Limit depth to keep breadcrumbs readable
        if len(parts) > self.MAX_BREADCRUMB_DEPTH:
            parts = ["..."] + parts[-(self.MAX_BREADCRUMB_DEPTH - 1):]

        return " > ".join(parts)

    def _get_parent_id(
        self,
        page_id: str,
        page: Dict[str, Any],
        hierarchy: Optional[Dict[str, Any]]
    ) -> Optional[str]:
        """Return the immediate parent page ID."""
        if hierarchy and page_id in hierarchy:
            return hierarchy[page_id].get("parent_id")

        ancestors = page.get("ancestors", [])
        if isinstance(ancestors, list) and ancestors:
            return ancestors[-1].get("id")

        return None
