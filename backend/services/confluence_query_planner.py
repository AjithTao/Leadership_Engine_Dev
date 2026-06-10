"""
Confluence Query Planner
========================
Layer 1 of the intelligent retrieval pipeline.

Analyzes user queries BEFORE retrieval to understand:
  - What TYPE of question this is (intent)
  - WHICH page/document to look in (target_page)
  - WHAT specific value is being asked (column_filter, date_filter)
  - The BEST search query for retrieval (search_query)

Intent types:
  table_lookup   – find a cell value in a table given row criteria (date, name, etc.)
                   e.g. "which Jira ID Fixed on 03-19-2026 in GL Enquiry Workflow"
  factual_lookup – find a specific named fact (URL, branch, owner, count)
                   e.g. "what is the master repo URL for GL Inquiry"
  page_summary   – summarize or describe a page / workflow
                   e.g. "explain the AP Invoice workflow"
  ownership      – who owns / is responsible for something
                   e.g. "who owns the GL Inquiry workflow"
  cross_page     – requires combining facts from multiple pages
  general_search – fallback for everything else

Why this matters:
  Without intent classification, the search term extractor concatenates ALL
  proper nouns from the query, producing garbage like:
    "Jiira ID Fixed GL Enquiry Workflow GL Space EMT"
  which matches nothing in CQL.

  With intent classification, the planner detects:
    intent      = 'table_lookup'
    target_page = 'GL Enquiry Workflow'    ← clean CQL search term
    date_filter = '03-19-2026'             ← row selector for LLM
    column_filter = 'Jira ID Fixed'        ← column selector for LLM
    search_query  = 'GL Enquiry Workflow'  ← sent to CQL / hybrid search
"""

import re
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class QueryPlan:
    """
    Structured plan produced by ConfluenceQueryPlanner.

    Fields
    ------
    intent         : classified intent type (see module docstring)
    target_page    : best guess at the Confluence page title to search
    search_query   : optimized search string for CQL / hybrid retrieval
    date_filter    : extracted date string, if any (e.g. "03-19-2026")
    column_filter  : table column being asked about (e.g. "Jira ID Fixed")
    lookup_key     : primary row-matching key (usually == date_filter)
    space          : detected Confluence space key (e.g. "EMT")
    original_query : unchanged user query
    confidence     : planner confidence 0–1
    metadata       : any extra key-value pairs
    """
    intent: str
    target_page: Optional[str]
    search_query: str
    date_filter: Optional[str]
    column_filter: Optional[str]
    lookup_key: Optional[str]
    space: Optional[str]
    original_query: str
    confidence: float = 0.8
    metadata: Dict[str, Any] = field(default_factory=dict)

    def has_table_criteria(self) -> bool:
        return bool(self.date_filter or self.column_filter)

    def build_llm_hint(self) -> str:
        """Return a compact instruction string to inject into LLM prompts."""
        parts = []
        if self.intent == "table_lookup":
            parts.append("TASK: Locate a specific TABLE ROW and return the requested cell value.")
            if self.date_filter:
                parts.append(f"ROW SELECTOR: Find the row where Date = '{self.date_filter}'.")
            if self.column_filter:
                parts.append(f"RETURN VALUE: Report the '{self.column_filter}' column for that row.")
            if self.target_page:
                parts.append(f"PAGE: Look in the '{self.target_page}' page/table.")
        elif self.intent == "factual_lookup":
            if self.column_filter:
                parts.append(f"TASK: Find the value of '{self.column_filter}'.")
            if self.target_page:
                parts.append(f"PAGE: Look in '{self.target_page}'.")
        elif self.intent == "ownership":
            parts.append("TASK: Identify the owner / POC / responsible team.")
        elif self.intent == "page_summary":
            parts.append("TASK: Summarize the page content.")
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# Pattern dictionaries
# ---------------------------------------------------------------------------

# Date formats commonly used in CDK engineering docs
_DATE_PATTERNS: List[str] = [
    r'\b(\d{2}-\d{2}-\d{4})\b',      # 03-19-2026
    r'\b(\d{4}-\d{2}-\d{2})\b',      # 2026-03-19
    r'\b(\d{2}/\d{2}/\d{4})\b',      # 03/19/2026
    r'\bon\s+(\d{2}-\d{2}-\d{4})\b', # on 03-19-2026
    r'\bfor\s+(\d{2}-\d{2}-\d{4})\b',# for 03-19-2026
    r'\bdate\s+(\d{2}-\d{2}-\d{4})\b',# date 03-19-2026
]

# Map column name → list of regex patterns that identify the user is asking for that column
_COLUMN_PATTERNS: Dict[str, List[str]] = {
    "Jira ID Fixed": [
        r'\bjira\s+id\s+fixed\b',
        r'\bjira\s+(?:id|ids)\s+(?:that\s+)?(?:was|were|got|are|has\s+been)?\s*fixed\b',
        r'\bwhich\s+jira\s+(?:id|ids|ticket|tickets|issue|issues)\b',
        r'\bjira\s+(?:id|ids)\s+(?:resolved|closed|done)\b',
        r'\bticket(?:s)?\s+fixed\b',
        r'\bbugs?\s+fixed\b',
        r'\bfixed\s+jira\b',
        r'\bfixed\s+ticket\b',
    ],
    "Master Repo URL": [
        r'\bmaster\s+repo(?:sitory)?\s+(?:url|link|path)\b',
        r'\brepo(?:sitory)?\s+(?:url|link)\b',
        r'\bgit\s+(?:url|link|repo)\b',
        r'\bmaster\s+branch\s+(?:url|link)\b',
    ],
    "Internal Main Branches": [
        r'\binternal\s+(?:main\s+)?branch\b',
        r'\bbranch\s+name\b',
        r'\bme[-\s](?:main|branch)\b',
    ],
    "POCs": [
        r'\bpoc\b',
        r'\bpoint\s+of\s+contact\b',
        r'\bowner(?:s)?\b',
        r'\bwho\s+owns\b',
        r'\bresponsible\s+(?:for|team)\b',
        r'\bteam\s+(?:lead|leads|behind)\b',
    ],
    "Total TCs": [
        r'\btotal\s+(?:test\s+)?cases?\b',
        r'\bhow\s+many\s+(?:test\s+)?cases?\b',
        r'\bnumber\s+of\s+(?:test\s+)?cases?\b',
    ],
    "Pass %": [
        r'\bpass(?:ing)?\s+(?:rate|percentage|%)\b',
        r'\bpass\s+%\b',
        r'\bpassed\s+(?:tests?|cases?)\b',
    ],
    "Fail %": [
        r'\bfail(?:ing)?\s+(?:rate|percentage|%)\b',
        r'\bfail\s+%\b',
        r'\bfailed\s+(?:tests?|cases?)\b',
    ],
    "Refactored IT Blocks": [
        r'\brefactored\b',
        r'\bit\s+blocks?\b',
    ],
    "Pipeline": [
        r'\bpipeline\b',
        r'\bci(?:/cd)?\b',
    ],
}

# Noise terms to strip when building a clean search query
_NOISE_TOKENS = {
    "which", "what", "who", "where", "when", "how",
    "find", "get", "show", "tell", "give", "list", "fetch", "retrieve",
    "fixed", "resolved", "closed", "done", "logged",
    "was", "were", "is", "are", "be", "been",
    "the", "a", "an", "and", "or", "but",
    "on", "in", "at", "for", "of", "with", "from", "by",
    "id", "ids",                      # stripped when followed by "fixed"
    "jira",                           # stripped when it's part of "Jira ID Fixed"
}

# Signals for intent classification
_TABLE_LOOKUP_VERBS = re.compile(
    r'\b(which|what|find|get|show|list|tell me|give me)\b', re.I
)
_SUMMARY_VERBS = re.compile(
    r'\b(summarize|summary|overview|describe|explain|what does .+ do)\b', re.I
)
_OWNERSHIP_VERBS = re.compile(
    r'\b(who owns|who is responsible|poc|owner|team behind|maintained by)\b', re.I
)
_FACTUAL_VERBS = re.compile(
    r'\b(what is|what are|what was|what were|who is|where is|how many|how much)\b', re.I
)


# ---------------------------------------------------------------------------
# Main planner class
# ---------------------------------------------------------------------------

class ConfluenceQueryPlanner:
    """
    Pure pattern-based query planner.  No LLM required.

    Usage
    -----
        planner = ConfluenceQueryPlanner()
        plan = planner.plan("which Jira ID Fixed on 03-19-2026 in GL Enquiry Workflow on EMT space",
                            space="EMT")
        # plan.intent       == 'table_lookup'
        # plan.target_page  == 'GL Enquiry Workflow'
        # plan.search_query == 'GL Enquiry Workflow'
        # plan.date_filter  == '03-19-2026'
        # plan.column_filter== 'Jira ID Fixed'
    """

    def plan(self, query: str, space: Optional[str] = None) -> QueryPlan:
        q_lower = query.lower()

        date_filter   = self._extract_date(query)
        column_filter = self._detect_column(q_lower)
        intent        = self._classify_intent(q_lower, date_filter, column_filter)
        target_page   = self._extract_page_name(query, space)
        search_query  = self._build_search_query(query, target_page, intent,
                                                  date_filter, column_filter, space)

        confidence = 0.9 if target_page else (0.7 if (date_filter or column_filter) else 0.5)

        logger.info(
            f"[QueryPlanner] intent={intent!r}  page={target_page!r}  "
            f"date={date_filter!r}  col={column_filter!r}  "
            f"search_query={search_query!r}  conf={confidence:.2f}"
        )

        return QueryPlan(
            intent=intent,
            target_page=target_page,
            search_query=search_query,
            date_filter=date_filter,
            column_filter=column_filter,
            lookup_key=date_filter,
            space=space,
            original_query=query,
            confidence=confidence,
        )

    # ------------------------------------------------------------------
    # Date extraction
    # ------------------------------------------------------------------

    def _extract_date(self, query: str) -> Optional[str]:
        """Return the first date-like string found in the query.

        Resolves relative terms (yesterday, today, last week) to actual
        MM-DD-YYYY date strings so they can be matched against Confluence table rows.
        """
        q_lower = query.lower()
        today = datetime.utcnow().date()

        # --- Relative date terms ---
        if "yesterday" in q_lower:
            return (today - timedelta(days=1)).strftime("%m-%d-%Y")
        if re.search(r"\btoday\b", q_lower):
            return today.strftime("%m-%d-%Y")
        if re.search(r"\bthis\s+week\b|\bcurrent\s+week\b", q_lower):
            return today.strftime("%m-%d-%Y")
        if re.search(r"\blast\s+week\b|\bpast\s+week\b", q_lower):
            return (today - timedelta(days=7)).strftime("%m-%d-%Y")

        # --- Explicit date patterns ---
        for pattern in _DATE_PATTERNS:
            m = re.search(pattern, query, re.IGNORECASE)
            if m:
                # Return the captured group if present, otherwise full match
                return m.group(1) if m.lastindex and m.lastindex >= 1 else m.group(0)
        return None

    # ------------------------------------------------------------------
    # Column detection
    # ------------------------------------------------------------------

    def _detect_column(self, q_lower: str) -> Optional[str]:
        """Return the canonical column name the user is asking about, or None."""
        for column_name, patterns in _COLUMN_PATTERNS.items():
            for pat in patterns:
                if re.search(pat, q_lower):
                    return column_name
        return None

    # ------------------------------------------------------------------
    # Intent classification
    # ------------------------------------------------------------------

    def _classify_intent(
        self,
        q_lower: str,
        date_filter: Optional[str],
        column_filter: Optional[str]
    ) -> str:
        has_lookup_verb = bool(_TABLE_LOOKUP_VERBS.search(q_lower))

        # Table lookup: has row-level criteria (date or known column) + lookup verb
        if (date_filter or column_filter) and has_lookup_verb:
            return "table_lookup"

        # Ownership
        if _OWNERSHIP_VERBS.search(q_lower):
            return "ownership"

        # Summary
        if _SUMMARY_VERBS.search(q_lower):
            return "page_summary"

        # Factual (asking for a named attribute without a date)
        if _FACTUAL_VERBS.search(q_lower) or column_filter:
            return "factual_lookup"

        return "general_search"

    # ------------------------------------------------------------------
    # Page name extraction  (the most critical part)
    # ------------------------------------------------------------------

    def _extract_page_name(self, query: str, space: Optional[str]) -> Optional[str]:
        """
        Try to identify the Confluence page title from the query.

        Strategy (in priority order):
        1. Pattern: "in/for/on/from [Title Case Page Name]"
        2. Pattern: "[Title Case Page Name] [table/page/section/workflow]"
        3. Multi-word proper noun phrase (longest match that isn't a noise term)
        """
        # Build a set of tokens that are NOT part of the page name
        excluded: set = {"EMT", "IS", "IT", "DEV", "QA", "PM", "HR",
                         "FIN", "OPS", "ENG", "PROD", "TEST", "DMS"}
        if space:
            excluded.add(space.upper())

        # --- Strategy 1: "in/for/on/from THE [PageName]" -----------------
        # Matches "in GL Enquiry Workflow on EMT" → "GL Enquiry Workflow"
        in_pattern = re.compile(
            r'\b(?:in|for|on|from)\s+(?:the\s+)?'        # preposition + optional "the"
            r'([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,6})'  # Title Case phrase
            r'(?:\s+(?:on|in|at|space|page|table|section|workflow|document))?',
            re.IGNORECASE
        )
        for m in in_pattern.finditer(query):
            candidate = m.group(1).strip()
            words = candidate.split()
            # Filter: must be 2+ words, not a pure space key, not all noise
            if len(words) >= 2 and candidate.upper() not in excluded:
                # Exclude if ends with just a space abbreviation
                if not re.match(r'^[A-Z]{2,4}$', candidate):
                    logger.debug(f"[PageName] Strategy 1 candidate: '{candidate}'")
                    return candidate

        # --- Strategy 2: "PageName workflow/page/table" ------------------
        suffix_pattern = re.compile(
            r'\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,5})\s+'
            r'(?:workflow|page|table|section|document|dashboard|module|report)\b',
            re.IGNORECASE
        )
        for m in suffix_pattern.finditer(query):
            candidate = m.group(1).strip()
            if len(candidate.split()) >= 2 and candidate.upper() not in excluded:
                logger.debug(f"[PageName] Strategy 2 candidate: '{candidate}'")
                return candidate

        # --- Strategy 3: Longest Title Case multi-word phrase ------------
        all_phrases = re.findall(
            r'\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,5})\b',
            query
        )
        # Known noise multi-word phrases to exclude
        noise_phrases = {
            "Jira ID", "Jira ID Fixed", "GL Space", "EMT Space",
            "ID Fixed", "Which Jira", "GL Enquiry", "EMT Space",
        }
        best = None
        for phrase in all_phrases:
            if phrase in noise_phrases:
                continue
            if phrase.upper() in excluded:
                continue
            # Prefer longer phrases
            if best is None or len(phrase) > len(best):
                best = phrase

        if best and len(best.split()) >= 2:
            logger.debug(f"[PageName] Strategy 3 candidate: '{best}'")
            return best

        return None

    # ------------------------------------------------------------------
    # Search query builder
    # ------------------------------------------------------------------

    def _build_search_query(
        self,
        original: str,
        target_page: Optional[str],
        intent: str,
        date_filter: Optional[str],
        column_filter: Optional[str],
        space: Optional[str],
    ) -> str:
        """
        Build the best search string for CQL / hybrid vector search.

        For table_lookup / factual_lookup → just the page name is ideal.
        For general_search → clean up the original query.
        """
        if target_page:
            return target_page

        # No target page: strip noise tokens and dates from original
        stripped = original
        if date_filter:
            stripped = stripped.replace(date_filter, "")
        if column_filter:
            stripped = re.sub(re.escape(column_filter), "", stripped, flags=re.IGNORECASE)
        if space:
            stripped = re.sub(r'\b' + re.escape(space) + r'\b', "", stripped, flags=re.IGNORECASE)

        # Strip individual noise tokens
        words = stripped.split()
        cleaned = [w for w in words if w.lower() not in _NOISE_TOKENS and len(w) > 1]
        result = " ".join(cleaned).strip()

        return result if result else original
