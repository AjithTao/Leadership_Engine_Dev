"""
Intelligent AI Engine for Natural Language to Jira Query Processing
Uses OpenAI to understand user intent and generate appropriate responses
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional, Tuple, Union
from openai import OpenAI
import re
import math
import calendar
from datetime import datetime, timedelta
from dotenv import load_dotenv
import httpx
import html

# RAG handlers for Confluence and Jira
from services.rag_handler import get_handler as get_confluence_rag_handler
from services.jira_rag_handler import get_jira_rag_handler
from services.unified_rag_handler import get_unified_rag_handler, SourceType
from services.confluence_query_planner import ConfluenceQueryPlanner

# Singleton query planner (stateless, cheap to create once)
_confluence_query_planner = ConfluenceQueryPlanner()

# ---------------------------------------------------------------------------
# AI Search Planner — system prompt (module-level to avoid rebuilding per call)
# ---------------------------------------------------------------------------
AI_PLAN_SEARCH_SYSTEM_PROMPT = """You are an expert search planner for a project management assistant connected to Confluence and Jira. Your job is NOT to answer the question — only to produce a structured JSON search plan so the system knows exactly where to look.

## Confluence spaces available
IS  – Intelligence Suite (NDP, SSBYOD projects)
EMT – Engineering Modernization Team (DMS Modern Enablement, automation tracking)
DMS – DMS project documentation

## Rules
1. Identify whether the answer is in Confluence, Jira, or both.
2. For Confluence: produce 1–3 short, focused search terms — each should be a page title fragment or entity/workflow name (e.g., "GL Inquiry", "Automation DMS Modern Enablement"). Do NOT include question words, verbs, noise words, or the space key in the search terms.
3. For Jira: produce 1–3 complete valid JQL queries, ordered most-specific first.
4. Detect the extract_type:
   - "table_cell"   → user wants a specific column value from a table row
   - "factual"      → user wants a named fact (URL, branch, owner, ID)
   - "page_summary" → user wants a description or overview
   - "list"         → user wants a list of items
   - "count"        → user wants a number
5. For "table_cell" or "factual", populate extract_field (the column/attribute name, e.g. "Master Repo URL") and row_identifier (the row label, e.g. "GL Inquiry").
6. Set space to the detected space key, or null if unknown.

## Output — return ONLY valid JSON, no markdown fences, no extra text:
{
  "reasoning": "<one-sentence chain-of-thought>",
  "source": "confluence",
  "space": "<space key or null>",
  "confluence_search_queries": ["<term1>", "<term2>"],
  "jql_queries": [],
  "extract_type": "table_cell",
  "extract_field": "<column name or null>",
  "row_identifier": "<row label or null>"
}"""

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), 'config.env'), override=True)

logger = logging.getLogger(__name__)

def create_databricks_openai_client(api_key: str, endpoint_url: str):
    """
    Create an OpenAI client configured for Databricks Foundation Model APIs.
    
    The OpenAI client appends /chat/completions to base_url, but Databricks
    serving endpoints expect /serving-endpoints/<endpoint>/invocations.
    This function creates a custom HTTP client that fixes the URL path.
    """
    if "/serving-endpoints/" in endpoint_url and "/invocations" in endpoint_url:
        # Create custom HTTP client that fixes the URL path for Databricks
        class DatabricksHTTPClient(httpx.Client):
            def __init__(self, databricks_endpoint_url, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.databricks_endpoint_url = databricks_endpoint_url
            
            def build_request(self, *args, **kwargs):
                request = super().build_request(*args, **kwargs)
                # If the URL contains /chat/completions, replace it with the Databricks endpoint
                if "/chat/completions" in str(request.url):
                    # Replace the entire path with the Databricks invocations endpoint
                    request.url = httpx.URL(self.databricks_endpoint_url)
                return request
        
        return OpenAI(
            api_key=api_key,
            base_url=endpoint_url,
            http_client=DatabricksHTTPClient(endpoint_url)
        )
    else:
        # Standard OpenAI endpoint
        return OpenAI(api_key=api_key, base_url=endpoint_url)

def create_databricks_async_openai_client(api_key: str, endpoint_url: str):
    """
    Create an AsyncOpenAI client configured for Databricks Foundation Model APIs.
    """
    from openai import AsyncOpenAI
    
    if "/serving-endpoints/" in endpoint_url and "/invocations" in endpoint_url:
        # Create custom async HTTP client that fixes the URL path for Databricks
        class DatabricksAsyncHTTPClient(httpx.AsyncClient):
            def __init__(self, databricks_endpoint_url, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.databricks_endpoint_url = databricks_endpoint_url
            
            def build_request(self, *args, **kwargs):
                request = super().build_request(*args, **kwargs)
                # If the URL contains /chat/completions, replace it with the Databricks endpoint
                if "/chat/completions" in str(request.url):
                    # Replace the entire path with the Databricks invocations endpoint
                    request.url = httpx.URL(self.databricks_endpoint_url)
                return request
        
        return AsyncOpenAI(
            api_key=api_key,
            base_url=endpoint_url,
            http_client=DatabricksAsyncHTTPClient(endpoint_url)
        )
    else:
        # Standard OpenAI endpoint
        return AsyncOpenAI(api_key=api_key, base_url=endpoint_url)

def _format_chunks_as_response(docs: list, user_query: str) -> str:
    """
    Format raw indexed chunks into a clean, readable response when the LLM
    is unavailable. Produces the same bold/bullet style as the LLM prompts.
    """
    if not docs:
        return f"No Confluence content found for: **{user_query}**"

    lines = []
    seen_pages: set = set()

    for doc in docs:
        m          = doc.metadata or {}
        chunk_type = m.get("chunk_type", "text")
        breadcrumb = m.get("breadcrumb", "")
        page_title = m.get("title", "Untitled")
        url        = m.get("url", "")

        # Table rows: format as key-value pairs
        if chunk_type == "table_row":
            table_name = m.get("table_name", page_title)
            lines.append(f"**{table_name}**")
            for pair in doc.text.strip().split(" | "):
                if ":" in pair:
                    k, _, v = pair.partition(":")
                    lines.append(f"- **{k.strip()}:** {v.strip()}")
                else:
                    lines.append(f"- {pair.strip()}")
            lines.append("")
        else:
            # Section / text chunk
            heading = m.get("section_heading", "")
            if heading:
                lines.append(f"## {heading}")
            lines.append(doc.text.strip()[:800])
            lines.append("")

        # Collect source citation
        if page_title not in seen_pages:
            seen_pages.add(page_title)
            if url:
                lines.append(f"📄 Source: [{page_title}]({url}) ({breadcrumb})")
            elif breadcrumb:
                lines.append(f"📄 Source: {page_title} ({breadcrumb})")

    return "\n".join(lines).strip()


class IntelligentAIEngine:
    """
    Advanced AI engine that uses OpenAI to:
    1. Understand natural language queries
    2. Generate appropriate JQL queries
    3. Provide contextual, varied responses
    4. Learn from conversation context
    5. Calculate quality metrics from Jira data
    6. Search and analyze Confluence documentation
    """
    
    # Project-specific Confluence space mappings
    PROJECT_CONFLUENCE_SPACES = {
        'NDP': 'IS',       # Intelligence Suite
        'SSBYOD': 'IS',
        'DMS': 'EMT',      # DMS Modern Enablement → Engineering Modernization Team
        'EMT': 'EMT',      # Direct EMT space reference
        'default': 'IS'    # Default space for queries
    }
    
    # Project-specific Jira field mappings
    PROJECT_JIRA_MAPPINGS = {
        'NDP': {
            'issue_types': {
                'Story': 'User story or functional requirement describing new functionality or enhancements.',
                'Bug': 'Issue found in lower environments (QA/UAT/Staging). Represents non-production defects.',
                'Defect': 'Issue found in Production environment. Represents customer-facing failures.',
                'Test': 'Test case artifact used for validating requirements or automation coverage.'
            },
            'statuses': {
                # Unified status set (stories + tests) including the new execution statuses
                'open': ['Pending Approval', 'In Progress', 'Ready To Start', 'Development Complete', 'In Test', 'In Review'],
                'closed': ['Accepted', 'Test Complete', 'Done', 'Canceled']
            },
            'test_types': {
                'Functional Testing': 'Manual validation test case covering a functional scenario.',
                'Regression Testing': 'Test case included in regression suite; often automated.',
                'Unit Testing': 'Unit test case for testing individual components or functions in isolation.'
            },
            'test_statuses': {
                'Automated': 'This test case has been automated and is part of the automation suite.',
                'Automation Not Required': 'Test case is not eligible for automation (visual, exploratory, one-off scenarios, etc.).',
                'In Progress': 'Automation coding is currently in progress.',
                'Requires Automation': 'Automation has not yet started; needs to be picked up.'
            }
        },
        'default': {
            'issue_types': {
                'Story': 'User story or functional requirement.',
                'Bug': 'Issue found in lower environments.',
                'Defect': 'Issue found in Production environment.',
                'Test': 'Test case artifact.'
            },
            'statuses': {
                'open': ['In Progress', 'To Do', 'In Review'],
                'closed': ['Done', 'Closed', 'Resolved']
            },
            'test_types': {
                'Functional Testing': 'Functional test case.',
                'Regression Testing': 'Regression test case.',
                'Unit Testing': 'Unit test case for testing individual components.'
            },
            'test_statuses': {
                'Automated': 'Test case is automated.',
                'Automation Not Required': 'Test case is not eligible for automation.',
                'In Progress': 'Automation in progress.',
                'Requires Automation': 'Needs automation.'
            }
        }
    }
    
    # Quality metrics that can be calculated
    SUPPORTED_METRICS = {
        'automation': ['overall automation', 'automation %', 'automation percentage', 'automated tests'],
        'regression_automation': ['regression automation', 'regression %'],
        'test_coverage': ['test coverage', 'coverage %', 'story coverage'],
        'defect_leakage': ['defect leakage', 'leakage %', 'escaped defects'],
        'bug_ratio': ['bug ratio', 'bugs per test'],
        'test_story_ratio': ['test to story', 'test story ratio'],
    }
    
    def __init__(self, jira_client, confluence_client=None, github_client=None):
        self.jira_client = jira_client
        self.confluence_client = confluence_client  # Add Confluence client support
        self.github_client = github_client  # Add GitHub client support
        self.client = None
        self.conversation_context = []
        self.last_query_context = {}
        self.pending_user_confirmation = None  # Store pending user confirmation context
        self.model = os.getenv("OPENAI_MODEL", "databricks-gpt-5-1")  # Get model from env or default
        self.default_project = "NDP"  # Default project for queries
        # Initialize OpenAI/Databricks client once during construction
        self._initialize_openai_client()
    
    def _strip_html_tags(self, text: str) -> str:
        """Remove HTML tags from text and convert to clean plain text"""
        if not text or not isinstance(text, str):
            return text
        
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        # Decode HTML entities
        text = html.unescape(text)
        # Clean up extra whitespace
        text = re.sub(r'\n\s*\n+', '\n\n', text)
        text = text.strip()
        return text
    
    def _normalize_issue_type_value(self, issue_type: Optional[str]) -> Optional[str]:
        """Normalize common issue type variants to canonical Jira type names."""
        if not issue_type or not isinstance(issue_type, str):
            return None

        normalized = issue_type.strip().lower()
        mapping = {
            'story': 'Story',
            'stories': 'Story',
            'user story': 'Story',
            'user stories': 'Story',
            'bug': 'Bug',
            'bugs': 'Bug',
            'defect': 'Defect',
            'defects': 'Defect',
            'incident': 'Incident',
            'incidents': 'Incident',
            'test': 'Test',
            'tests': 'Test',
            'test case': 'Test',
            'test cases': 'Test',
            'task': 'Task',
            'tasks': 'Task',
            'epic': 'Epic',
            'epics': 'Epic'
        }

        if normalized in mapping:
            return mapping[normalized]

        # Keep original casing when we don't have a canonical mapping
        return issue_type.strip() or None

    def _normalize_issue_type_list(self, issue_types: Any) -> Optional[List[str]]:
        """Normalize and de-duplicate issue type collections."""
        if not issue_types:
            return None

        normalized_list: List[str] = []
        for raw in issue_types if isinstance(issue_types, list) else [issue_types]:
            normalized = self._normalize_issue_type_value(raw)
            if normalized and normalized not in normalized_list:
                normalized_list.append(normalized)

        return normalized_list or None

    def _sanitize_entities(self, entities: Dict[str, Any], intent: Optional[str] = None) -> Dict[str, Any]:
        """
        Clean AI-parsed entities:
        - Remove accidental intent strings in issue_type
        - Normalize issue_type / issue_types to canonical values
        """
        if not entities:
            return {}

        cleaned = dict(entities)
        invalid_issue_type_values = {
            'count_items', 'list_items', 'status_breakdown', 'project_overview',
            'assignee_work', 'issue_count', 'story_count'
        }

        issue_type_value = cleaned.get('issue_type')
        if isinstance(issue_type_value, str):
            if issue_type_value.strip().lower() in invalid_issue_type_values:
                cleaned.pop('issue_type', None)
            else:
                normalized = self._normalize_issue_type_value(issue_type_value)
                if normalized:
                    cleaned['issue_type'] = normalized
                else:
                    cleaned.pop('issue_type', None)

        normalized_issue_types = self._normalize_issue_type_list(cleaned.get('issue_types'))
        if normalized_issue_types:
            cleaned['issue_types'] = normalized_issue_types
        else:
            cleaned.pop('issue_types', None)

        # If intent itself was provided as an "issue_type", clear it
        if intent and cleaned.get('issue_type', '').lower() == intent.lower():
            cleaned.pop('issue_type', None)

        return cleaned

    def _normalize_issue_type_clauses(self, jql: str) -> str:
        """
        Replace 'issuetype' with 'type' for consistency across DC/Cloud setups.
        Handles both equality and IN clauses.
        """
        try:
            # Equality: issuetype = "Bug" -> type = "Bug"
            jql = re.sub(r'\bissuetype\b\s*=', 'type =', jql, flags=re.IGNORECASE)
            # IN clause: issuetype in (...) -> type in (...)
            jql = re.sub(r'\bissuetype\b\s+in', 'type in', jql, flags=re.IGNORECASE)
            return jql
        except Exception:
            return jql
    
    def _extract_date_range(self, user_query: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract a date range (start, end) from natural language.
        Returns ISO date strings (YYYY-MM-DD) or (None, None) if not found.
        """
        q = user_query.lower()
        today = datetime.utcnow().date()
        
        # Helpers
        def fmt(d): return d.strftime("%Y-%m-%d")
        def month_range(year: int, month: int):
            last_day = calendar.monthrange(year, month)[1]
            return datetime(year, month, 1).date(), datetime(year, month, last_day).date()
        
        # Relative periods
        if "today" in q:
            return fmt(today), fmt(today)
        if "yesterday" in q:
            y = today - timedelta(days=1)
            return fmt(y), fmt(y)
        if "last week" in q or "past week" in q:
            start = today - timedelta(days=7)
            return fmt(start), fmt(today)
        if "last month" in q or "past month" in q:
            # previous calendar month
            first_this = today.replace(day=1)
            last_prev = first_this - timedelta(days=1)
            start_prev = last_prev.replace(day=1)
            return fmt(start_prev), fmt(last_prev)
        if "last year" in q or "past year" in q:
            start = today.replace(year=today.year - 1)
            return fmt(start), fmt(today)
        
        # Rolling windows: "last 30 days", "past 15 days", "last 90 days"
        m = re.search(r"(last|past)\s+(\d+)\s+(day|days|week|weeks|month|months)", q)
        if m:
            n = int(m.group(2))
            unit = m.group(3)
            if "week" in unit:
                delta = timedelta(days=7 * n)
            elif "month" in unit:
                # approximate months as 30 days
                delta = timedelta(days=30 * n)
            else:
                delta = timedelta(days=n)
            start = today - delta
            return fmt(start), fmt(today)
        
        # Month name + year, e.g., "November 2025", "Nov 2025"
        month_names = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
        month_abbr = {m.lower(): i for i, m in enumerate(calendar.month_abbr) if m}
        tokens = q.replace(",", " ").split()
        for i, t in enumerate(tokens):
            if t in month_names or t in month_abbr:
                m_num = month_names.get(t) or month_abbr.get(t)
                year = None
                # check next token for year
                if i + 1 < len(tokens):
                    if re.match(r"\d{4}$", tokens[i + 1]):
                        year = int(tokens[i + 1])
                if year and m_num:
                    start, end = month_range(year, m_num)
                    return fmt(start), fmt(end)
        
        # Year-only e.g., "in 2025" or "2025"
        m = re.search(r"\b(20\d{2})\b", q)
        if m:
            year = int(m.group(1))
            start = datetime(year, 1, 1).date()
            end = datetime(year, 12, 31).date()
            return fmt(start), fmt(end)
        
        # Quarter e.g., "Q1 2025"
        m = re.search(r"q([1-4])\s*(20\d{2})", q)
        if m:
            q_num = int(m.group(1))
            year = int(m.group(2))
            month_start = (q_num - 1) * 3 + 1
            month_end = month_start + 2
            start, _ = month_range(year, month_start)
            _, end = month_range(year, month_end)
            return fmt(start), fmt(end)
        
        return None, None
    
    def _initialize_openai_client(self):
        """Initialize the OpenAI/Databricks client safely."""
        api_key = os.getenv("OPENAI_API_KEY")
        endpoint_url = os.getenv("OPENAI_API_ENDPOINT")
        if api_key and not api_key.startswith("sk-your-actual"):
            if endpoint_url:
                # Databricks serving endpoint handling
                if "/serving-endpoints/" in endpoint_url and "/invocations" in endpoint_url:
                    try:
                        self.client = create_databricks_openai_client(api_key, endpoint_url)
                        endpoint_name = endpoint_url.split("/serving-endpoints/")[1].split("/")[0]
                        logger.info(f"Intelligent AI Engine initialized with OpenAI (Databricks endpoint: {endpoint_name})")
                    except Exception as e:
                        logger.error(f"Failed to initialize Databricks OpenAI client: {e}", exc_info=True)
                        self.client = None
                else:
                    self.client = OpenAI(api_key=api_key, base_url=endpoint_url)
                    logger.info(f"Intelligent AI Engine initialized with OpenAI (endpoint: {endpoint_url}, model: {self.model})")
            else:
                self.client = OpenAI(api_key=api_key)
                logger.info(f"Intelligent AI Engine initialized with OpenAI (model: {self.model})")
        else:
            self.client = None
            if not api_key:
                logger.warning("No OpenAI API key found - AI features will be limited. Set OPENAI_API_KEY in backend/config/.env")
            else:
                logger.warning("OpenAI API key is placeholder - AI features will be limited. Update OPENAI_API_KEY in backend/config/.env")
    
    def add_context(self, user_query: str, jql: str, results: List[Dict], response: str, query_analysis: Dict = None, query_understanding: Dict = None):
        """Add conversation context for future reference with structured information"""
        context = {
            "user_query": user_query,
            "jql": jql,
            "result_count": len(results),
            "response": response,
            "timestamp": "now"
        }
        
        # Add structured information from query analysis
        if query_analysis:
            context["intent"] = query_analysis.get("intent")
            entities = query_analysis.get("entities", {})
            context["entities"] = entities
            context["project"] = entities.get("project") or entities.get("project_key")
            # Extract assignee, issue_type, status from entities
            if entities.get("assignee"):
                context["assignee"] = entities.get("assignee")
            if entities.get("issue_type"):
                context["issue_type"] = entities.get("issue_type")
            if entities.get("status"):
                context["status"] = entities.get("status")
            
            # Also try to extract from JQL if not in entities
            if jql:
                # Extract assignee from JQL: assignee = "Name"
                assignee_match = re.search(r'assignee\s*=\s*"([^"]+)"', jql, re.IGNORECASE)
                if assignee_match and not context.get("assignee"):
                    context["assignee"] = assignee_match.group(1)
                
                # Extract issue type from JQL: type = "Bug" or issuetype = "Story"
                issue_type_match = re.search(r'(?:type|issuetype)\s*=\s*"([^"]+)"', jql, re.IGNORECASE)
                if issue_type_match and not context.get("issue_type"):
                    context["issue_type"] = issue_type_match.group(1)
                
                # Extract status from JQL: status = "In Progress"
                status_match = re.search(r'status\s*=\s*"([^"]+)"', jql, re.IGNORECASE)
                if status_match and not context.get("status"):
                    context["status"] = status_match.group(1)
        
        # Add structured information from AI query understanding
        if query_understanding:
            context["metric_type"] = query_understanding.get("metric_type")
            context["is_metric_query"] = query_understanding.get("is_metric_query", False)
            context["time_period"] = query_understanding.get("time_period")
            context["year"] = query_understanding.get("year")
            context["month"] = query_understanding.get("month")
            context["issue_types"] = query_understanding.get("issue_types")
            context["status_filters"] = query_understanding.get("status_filters")
            context["query_intent"] = query_understanding.get("query_intent")
            # Also store project from understanding if not in query_analysis
            if not context.get("project") and query_understanding.get("project"):
                context["project"] = query_understanding.get("project")
        
        self.conversation_context.append(context)
        
        # Keep only last 10 interactions
        if len(self.conversation_context) > 10:
            self.conversation_context.pop(0)
    
    async def _understand_query_with_ai(self, user_query: str) -> Optional[Dict[str, Any]]:
        """
        Use AI to understand the user query, reason about it, and extract structured information.
        This function makes the AI think through the query before extracting data.
        Now handles ALL query types, not just metrics.
        """
        if not self.client:
            return None
        
        try:
            reasoning_prompt = f"""You are an intelligent query analyzer. Your job is to understand ANY user question about Jira, projects, issues, metrics, or team work and extract structured information.

USER QUERY: "{user_query}"

Think through this step by step:

1. UNDERSTANDING: What is the user really asking for?
   - Is this a metric calculation? (defect leakage, automation %, test coverage, etc.)
   - Is this about specific issues? (bugs, stories, tasks)
   - Is this about a project? (NDP, SSBYOD, APITRON, RM, SER, MRDRT, EFORMS, or other)
   - Is this about a person/assignee?
   - What time period? (last week, last month, specific month/year, etc.)
   - What issue types? (Bug, Story, Task, Epic, etc.)

2. REASONING: Ask yourself these questions:
   - Is this a metric calculation request? (Yes/No)
   - If yes, which metric type? (defect_leakage, automation, regression_automation, test_coverage, bug_ratio, test_story_ratio)
   - What project key should I use? (extract from query or use null if not specified)
   - What date range? Extract specific month/year or relative period (last week, last month, this month, etc.)
   - What issue types are mentioned? (Bug, Story, Task, etc.)
   - What status filters? (open, closed, in progress, etc.)

3. EXTRACTION: Based on your reasoning, extract:
   - is_metric_query: true/false
   - metric_type: one of [defect_leakage, automation, regression_automation, test_coverage, bug_ratio, test_story_ratio] or null
   - project: project key (NDP, SSBYOD, etc.) or null
   - time_period: specific format like "September 2025", "October 2025", "last week", "last month", "this month", or null
   - year: 4-digit year if specified, or null
   - month: month name (january, february, etc.) or number (1-12), or null
   - issue_types: array of issue types mentioned (["Bug"], ["Story", "Task"], etc.) or null
   - status_filters: array of status filters (["open"], ["closed"], ["in progress"], etc.) or null
   - query_intent: brief description of what the user wants (e.g., "find open bugs in NDP for last week")

Respond ONLY with valid JSON in this exact format:
{{
    "is_metric_query": true/false,
    "metric_type": "defect_leakage" or null,
    "project": "NDP" or null,
    "time_period": "last week" or "September 2025" or null,
    "year": 2025 or null,
    "month": "september" or 9 or null,
    "issue_types": ["Bug"] or null,
    "status_filters": ["open"] or null,
    "query_intent": "find open bugs in NDP project for last week",
    "reasoning": "Brief explanation of your understanding"
}}"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a precise query analyzer. Always respond with valid JSON only."},
                    {"role": "user", "content": reasoning_prompt}
                ],
                temperature=0.1,
                max_tokens=300
            )
            
            content = response.choices[0].message.content.strip()
            logger.info(f"🤖 AI Query Understanding Response: {content}")
            
            # Parse JSON response
            import json
            # Remove markdown code blocks if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()
            
            result = json.loads(content)
            
            # Extract all information from AI understanding
            project = result.get("project") or self.default_project
            time_period = result.get("time_period")
            year = result.get("year")
            month = result.get("month")
            issue_types = self._normalize_issue_type_list(result.get("issue_types"))
            status_filters = result.get("status_filters")
            query_intent = result.get("query_intent", "")
            reasoning = result.get("reasoning", "")
            
            # Build time range from AI extraction
            time_range = self._build_time_range_from_ai(time_period, year, month, user_query)
            
            # Log comprehensive understanding
            logger.info(f"🧠 AI Understanding: project={project}, time_range={time_range}, issue_types={issue_types}, status_filters={status_filters}, intent={query_intent}, reasoning={reasoning}")
            
            # If this is a metric query, return metric-specific format
            if result.get("is_metric_query"):
                metric_type = result.get("metric_type")
                if not metric_type:
                    # Not a valid metric query, but still return general understanding
                    return {
                        'is_metric_query': False,
                        'project': project,
                        'time_range': time_range,
                        'issue_types': issue_types,
                        'status_filters': status_filters,
                        'query_intent': query_intent,
                        'original_query': user_query,
                        'ai_reasoning': reasoning
                    }
                
                return {
                    'is_metric_query': True,
                    'metric_type': metric_type,
                    'project': project,
                    'time_range': time_range,
                    'original_query': user_query,
                    'ai_reasoning': reasoning
                }
            
            # For non-metric queries, return general understanding that can be used by _analyze_query
            return {
                'is_metric_query': False,
                'project': project,
                'time_range': time_range,
                'issue_types': issue_types,
                'status_filters': status_filters,
                'query_intent': query_intent,
                'original_query': user_query,
                'ai_reasoning': reasoning
            }
            
        except Exception as e:
            logger.error(f"❌ AI query understanding failed: {e}")
            return None
    
    def _build_time_range_from_ai(self, time_period: Optional[str], year: Optional[int], month: Optional[Union[str, int]], original_query: str) -> Dict[str, str]:
        """Build time range from AI-extracted information"""
        from datetime import datetime, timedelta
        from calendar import monthrange
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        # If AI provided specific month/year
        if month and year:
            month_num = month
            if isinstance(month, str):
                month_map = {
                    'january': 1, 'jan': 1, 'february': 2, 'feb': 2,
                    'march': 3, 'mar': 3, 'april': 4, 'apr': 4,
                    'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
                    'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9,
                    'october': 10, 'oct': 10, 'november': 11, 'nov': 11,
                    'december': 12, 'dec': 12
                }
                month_num = month_map.get(month.lower(), None)
            
            if month_num and 1 <= month_num <= 12:
                start_date = datetime(year, month_num, 1)
                last_day = monthrange(year, month_num)[1]
                end_date = datetime(year, month_num, last_day)
                logger.info(f"📅 AI extracted date: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
                return {
                    'start': start_date.strftime('%Y-%m-%d'),
                    'end': end_date.strftime('%Y-%m-%d')
                }
        
        # If AI provided time_period string, try to parse it
        if time_period:
            time_period_lower = time_period.lower()
            if 'last month' in time_period_lower:
                first_day_last_month = (end_date.replace(day=1) - timedelta(days=1)).replace(day=1)
                start_date = first_day_last_month
                end_date = end_date.replace(day=1) - timedelta(days=1)
            elif 'this month' in time_period_lower:
                start_date = end_date.replace(day=1)
            elif 'last quarter' in time_period_lower or 'last 3 months' in time_period_lower:
                start_date = end_date - timedelta(days=90)
            elif 'this week' in time_period_lower:
                start_date = end_date - timedelta(days=7)
            elif 'last sprint' in time_period_lower or 'previous sprint' in time_period_lower:
                start_date = end_date - timedelta(days=14)
        
        # Fallback to original extraction method
        return self._extract_time_range(original_query)
    
    def _detect_metric_query(self, user_query: str) -> Optional[Dict[str, Any]]:
        """Detect if the query is asking for a quality metric calculation (legacy pattern matching)"""
        query_lower = user_query.lower()
        
        # Check for metric keywords
        for metric_type, keywords in self.SUPPORTED_METRICS.items():
            for keyword in keywords:
                if keyword in query_lower:
                    # Extract project from query or use default
                    project = self._extract_project_from_query(user_query) or self.default_project
                    # Extract time range
                    time_range = self._extract_time_range(user_query)
                    
                    return {
                        'metric_type': metric_type,
                        'project': project,
                        'time_range': time_range,
                        'original_query': user_query
                    }
        return None
    
    def _extract_project_from_query(self, query: str) -> Optional[str]:
        """Extract project key from query"""
        query_upper = query.upper()
        # Check for known project keys
        known_projects = ['NDP', 'SSBYOD', 'APITRON', 'RM', 'SER', 'MRDRT', 'EFORMS']
        for project in known_projects:
            if project in query_upper:
                return project
        return None
    
    def _extract_time_range(self, query: str) -> Dict[str, str]:
        """Extract time range from query (sprint, month, etc.)"""
        query_lower = query.lower()
        
        # Default to last 30 days
        from datetime import datetime, timedelta
        from calendar import monthrange
        import re
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        # Check for specific month and year (e.g., "october 2025", "oct 2025", "10/2025")
        # More flexible patterns that handle words before/after
        month_patterns = [
            (r'\b(january|jan)\s+(\d{4})\b', 1),
            (r'\b(february|feb)\s+(\d{4})\b', 2),
            (r'\b(march|mar)\s+(\d{4})\b', 3),
            (r'\b(april|apr)\s+(\d{4})\b', 4),
            (r'\b(may)\s+(\d{4})\b', 5),
            (r'\b(june|jun)\s+(\d{4})\b', 6),
            (r'\b(july|jul)\s+(\d{4})\b', 7),
            (r'\b(august|aug)\s+(\d{4})\b', 8),
            (r'\b(september|sep|sept)\s+(\d{4})\b', 9),
            (r'\b(october|oct)\s+(\d{4})\b', 10),
            (r'\b(november|nov)\s+(\d{4})\b', 11),
            (r'\b(december|dec)\s+(\d{4})\b', 12),
            # Also try without word boundaries for more flexibility
            (r'(january|jan)\s+(\d{4})', 1),
            (r'(february|feb)\s+(\d{4})', 2),
            (r'(march|mar)\s+(\d{4})', 3),
            (r'(april|apr)\s+(\d{4})', 4),
            (r'(may)\s+(\d{4})', 5),
            (r'(june|jun)\s+(\d{4})', 6),
            (r'(july|jul)\s+(\d{4})', 7),
            (r'(august|aug)\s+(\d{4})', 8),
            (r'(september|sep|sept)\s+(\d{4})', 9),
            (r'(october|oct)\s+(\d{4})', 10),
            (r'(november|nov)\s+(\d{4})', 11),
            (r'(december|dec)\s+(\d{4})', 12),
            (r'\b(\d{1,2})[/-](\d{4})\b', None),  # Format: 10/2025 or 10-2025
        ]
        
        logger.info(f"📅 Extracting time range from query: '{query}'")
        for pattern, month_num in month_patterns:
            match = re.search(pattern, query_lower)
            if match:
                try:
                    if month_num is None:
                        # Handle numeric format (10/2025)
                        month_num = int(match.group(1))
                        year = int(match.group(2))
                    else:
                        # Handle month name format
                        year = int(match.group(2))
                    
                    # Validate month
                    if 1 <= month_num <= 12:
                        # First day of the month
                        start_date = datetime(year, month_num, 1)
                        # Last day of the month
                        last_day = monthrange(year, month_num)[1]
                        end_date = datetime(year, month_num, last_day)
                        logger.info(f"📅 Extracted date range from query: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')} (matched pattern: {pattern}, groups: {match.groups()})")
                        break
                except (ValueError, IndexError) as e:
                    logger.warning(f"📅 Error parsing date from match {match.groups()}: {e}")
                    continue
        
        # Check for relative dates if no specific month found
        default_start = end_date - timedelta(days=30)
        if abs((start_date - default_start).days) < 1:  # Still using default (within 1 day difference)
            logger.info(f"📅 No specific month found in query, checking relative dates...")
            if 'last sprint' in query_lower or 'previous sprint' in query_lower:
                # Approximate sprint as 2 weeks
                start_date = end_date - timedelta(days=14)
                logger.info(f"📅 Using last sprint: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
            elif 'last month' in query_lower:
                # First day of last month
                first_day_last_month = (end_date.replace(day=1) - timedelta(days=1)).replace(day=1)
                start_date = first_day_last_month
                end_date = end_date.replace(day=1) - timedelta(days=1)
                logger.info(f"📅 Using last month: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
            elif 'last quarter' in query_lower or 'last 3 months' in query_lower:
                start_date = end_date - timedelta(days=90)
                logger.info(f"📅 Using last quarter: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
            elif 'this month' in query_lower:
                start_date = end_date.replace(day=1)
                logger.info(f"📅 Using this month: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
            elif 'this week' in query_lower:
                start_date = end_date - timedelta(days=7)
                logger.info(f"📅 Using this week: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
            else:
                logger.warning(f"📅 Using default last 30 days: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')} (query: '{query}')")
        
        return {
            'start': start_date.strftime('%Y-%m-%d'),
            'end': end_date.strftime('%Y-%m-%d')
        }
    
    async def _calculate_metric(self, metric_info: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate the requested metric from Jira data"""
        metric_type = metric_info['metric_type']
        project = metric_info['project']
        time_range = metric_info['time_range']
        
        try:
            if metric_type == 'automation':
                query_intent = metric_info.get('query_intent', '')
                return await self._calculate_automation_percentage(project, time_range, query_intent)
            elif metric_type == 'regression_automation':
                return await self._calculate_regression_automation(project, time_range)
            elif metric_type == 'test_coverage':
                return await self._calculate_test_coverage(project, time_range)
            elif metric_type == 'defect_leakage':
                return await self._calculate_defect_leakage(project, time_range)
            elif metric_type == 'bug_ratio':
                return await self._calculate_bug_ratio(project, time_range)
            elif metric_type == 'test_story_ratio':
                return await self._calculate_test_story_ratio(project, time_range)
            else:
                return {'error': f'Unknown metric type: {metric_type}'}
        except Exception as e:
            logger.error(f"Error calculating metric {metric_type}: {e}")
            return {'error': str(e)}
    
    async def _calculate_automation_percentage(self, project: str, time_range: Dict[str, str], query_intent: str = None) -> Dict[str, Any]:
        """Calculate overall automation percentage or specific automation status counts"""
        # Check if query is asking for "Requires Automation" test cases specifically
        if query_intent and ('requires automation' in query_intent.lower() or 'require automation' in query_intent.lower()):
            # Query for test cases that require automation
            requires_automation_jql = f'project = "{project}" AND type = Test AND "Test Status" = "Requires Automation"'
            requires_automation_results = await self.jira_client.search(requires_automation_jql, max_results=1000)
            requires_automation_count = len(requires_automation_results) if requires_automation_results else 0
            
            # Also get total for context
            total_jql = f'project = "{project}" AND type = Test'
            total_results = await self.jira_client.search(total_jql, max_results=1000)
            total_count = len(total_results) if total_results else 0
            
            metric_data = {
                'metric': 'Requires Automation Test Cases',
                'value': requires_automation_count,
                'total_tests': total_count,
                'requires_automation_count': requires_automation_count,
                'project': project,
                'time_range': time_range,
                'analysis': f"There are {requires_automation_count} test cases in {project} that require automation out of {total_count} total test cases."
            }
            
            formatted_response = f"Requires Automation Test Cases - {project} Project\n\n"
            formatted_response += f"There are {requires_automation_count} test cases requiring automation out of {total_count} total test cases."
            if metric_data.get('analysis'):
                formatted_response += f" {metric_data['analysis']}"
            metric_data['formatted_response'] = formatted_response
            
            return metric_data
        
        # Default: Calculate automation percentage
        # Query for all test cases
        total_jql = f'project = "{project}" AND type = Test'
        automated_jql = f'project = "{project}" AND type = Test AND "Test Status" = Automated'
        
        total_results = await self.jira_client.search(total_jql, max_results=1000)
        automated_results = await self.jira_client.search(automated_jql, max_results=1000)
        
        total_count = len(total_results) if total_results else 0
        automated_count = len(automated_results) if automated_results else 0
        
        percentage = (automated_count / total_count * 100) if total_count > 0 else 0
        
        metric_data = {
            'metric': 'Overall Automation %',
            'value': round(percentage, 1),
            'total_tests': total_count,
            'automated_tests': automated_count,
            'manual_tests': total_count - automated_count,
            'project': project,
            'time_range': time_range,
            'analysis': self._generate_automation_analysis(percentage, automated_count, total_count)
        }
        
        # Format response in clean professional format
        formatted_response = self._format_automation_response(percentage, automated_count, total_count, project, time_range)
        metric_data['formatted_response'] = formatted_response
        
        return metric_data
    
    async def _calculate_regression_automation(self, project: str, time_range: Dict[str, str]) -> Dict[str, Any]:
        """Calculate regression automation percentage"""
        total_jql = f'project = "{project}" AND type = Test AND "Test Type" = "Regression Testing"'
        automated_jql = f'project = "{project}" AND type = Test AND "Test Type" = "Regression Testing" AND "Test Status" = Automated'
        
        total_results = await self.jira_client.search(total_jql, max_results=1000)
        automated_results = await self.jira_client.search(automated_jql, max_results=1000)
        
        total_count = len(total_results) if total_results else 0
        automated_count = len(automated_results) if automated_results else 0
        
        percentage = (automated_count / total_count * 100) if total_count > 0 else 0
        
        return {
            'metric': 'Regression Automation %',
            'value': round(percentage, 1),
            'total_regression_tests': total_count,
            'automated_regression_tests': automated_count,
            'project': project,
            'analysis': self._generate_automation_analysis(percentage, automated_count, total_count, 'regression')
        }
    
    async def _calculate_test_case_breakdown(self, project: str, test_type: str = None) -> Dict[str, Any]:
        """
        Calculate breakdown of test cases: total, automated, manual
        Args:
            project: Project key
            test_type: Optional test type filter (e.g., "Regression Testing")
        """
        logger.info(f"📊 Calculating test case breakdown for project: {project}, test_type: {test_type or 'All'}")
        
        # Build base JQL
        base_jql = f'project = "{project}" AND type = Test'
        if test_type:
            base_jql += f' AND "Test Type" = "{test_type}"'
        
        # Total test cases
        total_jql = base_jql
        logger.info(f"🔍 Executing total test cases query: {total_jql}")
        total_results = await self.jira_client.search(total_jql, max_results=1000)
        if isinstance(total_results, dict):
            total_count = total_results.get('total', len(total_results.get('issues', [])))
        else:
            total_count = len(total_results) if total_results else 0
        
        # Automated test cases
        automated_jql = f'{base_jql} AND "Test Status" = Automated'
        logger.info(f"🔍 Executing automated test cases query: {automated_jql}")
        automated_results = await self.jira_client.search(automated_jql, max_results=1000)
        if isinstance(automated_results, dict):
            automated_count = automated_results.get('total', len(automated_results.get('issues', [])))
        else:
            automated_count = len(automated_results) if automated_results else 0
        
        # Manual test cases (all non-automated)
        manual_jql = f'{base_jql} AND "Test Status" != Automated'
        logger.info(f"🔍 Executing manual test cases query: {manual_jql}")
        manual_results = await self.jira_client.search(manual_jql, max_results=1000)
        if isinstance(manual_results, dict):
            manual_count = manual_results.get('total', len(manual_results.get('issues', [])))
        else:
            manual_count = len(manual_results) if manual_results else 0
        
        automated_percentage = (automated_count / total_count * 100) if total_count > 0 else 0
        manual_percentage = (manual_count / total_count * 100) if total_count > 0 else 0
        
        logger.info(f"✅ Test case breakdown calculated: Total={total_count}, Automated={automated_count}, Manual={manual_count}")
        
        return {
            'total': total_count,
            'automated': automated_count,
            'manual': manual_count,
            'automated_percentage': round(automated_percentage, 1),
            'manual_percentage': round(manual_percentage, 1),
            'test_type': test_type or 'All',
            'project': project
        }
    
    def _format_test_case_breakdown_response(self, breakdown: Dict[str, Any]) -> str:
        """Format test case breakdown into user-friendly response"""
        test_type_label = breakdown.get('test_type', 'All Test Cases')
        if breakdown.get('test_type') == 'Regression Testing':
            test_type_label = 'Regression Test Cases'
        elif breakdown.get('test_type') == 'Functional Testing':
            test_type_label = 'Functional Test Cases'
        elif breakdown.get('test_type') == 'Smoke Testing':
            test_type_label = 'Smoke Test Cases'
        elif breakdown.get('test_type') == 'All':
            test_type_label = 'Test Cases'
        
        response = f"{test_type_label} - {breakdown['project']} Project\n\n"
        response += f"There are {breakdown['total']} {test_type_label.lower()} in the {breakdown['project']} project. "
        response += f"Out of these, {breakdown['automated']} ({breakdown['automated_percentage']}%) are automated and {breakdown['manual']} ({breakdown['manual_percentage']}%) are manual."
        
        if breakdown['automated_percentage'] >= 70:
            response += f" The automation coverage is excellent and well-maintained."
        elif breakdown['automated_percentage'] >= 50:
            response += f" Consider automating more tests to improve CI/CD readiness."
        else:
            response += f" Focus on automating critical test scenarios to enhance test coverage."
        
        return response
    
    async def _calculate_test_coverage(self, project: str, time_range: Dict[str, str]) -> Dict[str, Any]:
        """Calculate test coverage (stories with linked tests)"""
        start_date = time_range.get('start', '')
        end_date = time_range.get('end', '')
        
        # Get all stories in the time range
        stories_jql = f'project = "{project}" AND type = Story'
        if start_date and end_date:
            stories_jql += f' AND created >= "{start_date}" AND created <= "{end_date}"'
        stories = await self.jira_client.search(stories_jql, max_results=1000)
        
        # Get stories with test links using the correct JQL format
        covered_jql = f'project = "{project}" AND type = Story AND issueFunction in linkedIssuesOf("project = \\"{project}\\" AND type = Test")'
        if start_date and end_date:
            covered_jql += f' AND created >= "{start_date}" AND created <= "{end_date}"'
        
        total_stories = len(stories) if stories else 0
        
        # Since linkedIssuesOf may not be available, estimate from test links
        covered_count = 0
        if stories:
            for story in stories:
                # Check if story has test links
                if story.get('fields', {}).get('issuelinks'):
                    for link in story['fields']['issuelinks']:
                        if link.get('type', {}).get('name') == 'is tested by':
                            covered_count += 1
                            break
        
        percentage = (covered_count / total_stories * 100) if total_stories > 0 else 0
        
        return {
            'metric': 'Test Coverage %',
            'value': round(percentage, 1),
            'total_stories': total_stories,
            'stories_with_tests': covered_count,
            'project': project,
            'analysis': f"Test coverage is at {percentage:.1f}%. {covered_count} out of {total_stories} stories have linked test cases."
        }
    
    async def _calculate_defect_leakage(self, project: str, time_range: Dict[str, str]) -> Dict[str, Any]:
        """
        Calculate defect leakage percentage using the same JQL format as defect_leakage_analyzer
        
        Formula: Defect Leakage = Defects / (Defects + Bugs) × 100
        
        Uses:
        - updated date (not created) - matches when issues were last updated in the period
        - type IN (Bug) and type IN (Defect) - proper JQL syntax
        - Status filter matching the analyzer service
        """
        start_date = time_range['start']
        end_date = time_range['end']
        
        # Status filter matching defect_leakage_analyzer.py
        status_filter = '("IN PROGRESS","PENDING APPROVAL","READY TO START","DEVELOPMENT COMPLETE","IN TEST","TEST COMPLETE","IN REVIEW","Canceled")'
        
        # Bugs in lower environments - using updated date and proper JQL format
        # Use type = "Bug" for single value (not type IN (Bug))
        bugs_jql = f"""
            project = "{project}"
            AND type = "Bug"
            AND updated >= "{start_date}"
            AND updated <= "{end_date}"
            AND status IN {status_filter}
            ORDER BY created DESC
        """
        
        # Defects in production - using updated date and proper JQL format
        # Use type = "Defect" for single value (not type IN (Defect))
        defects_jql = f"""
            project = "{project}"
            AND type = "Defect"
            AND updated >= "{start_date}"
            AND updated <= "{end_date}"
            AND status IN {status_filter}
            ORDER BY priority DESC, created DESC
        """
        
        logger.info(f"🔍 Querying bugs for defect leakage: {bugs_jql.strip()}")
        bugs_result = await self.jira_client.search(bugs_jql, max_results=1000)
        bugs = bugs_result.get('issues', []) if isinstance(bugs_result, dict) else (bugs_result if isinstance(bugs_result, list) else [])
        bugs_count = len(bugs) if bugs else 0
        logger.info(f"✅ Found {bugs_count} bugs in lower environments")
        
        logger.info(f"🔍 Querying defects for defect leakage: {defects_jql.strip()}")
        defects_result = await self.jira_client.search(defects_jql, max_results=1000)
        defects = defects_result.get('issues', []) if isinstance(defects_result, dict) else (defects_result if isinstance(defects_result, list) else [])
        defects_count = len(defects) if defects else 0
        logger.info(f"✅ Found {defects_count} defects in production")
        
        total = bugs_count + defects_count
        leakage = (defects_count / total * 100) if total > 0 else 0
        
        logger.info(f"📈 Defect Leakage: {leakage:.1f}% ({defects_count}/{total})")
        
        metric_data = {
            'metric': 'Defect Leakage %',
            'value': round(leakage, 1),
            'bugs_count': bugs_count,
            'defects_count': defects_count,
            'total_issues': total,
            'project': project,
            'time_range': time_range,
            'formula': 'Defects / (Defects + Bugs) × 100',
            'explanation': f'Found {bugs_count} bugs caught in lower environments and {defects_count} defects that escaped to production. Total issues: {total}.',
            'analysis': self._generate_leakage_analysis(leakage, defects_count, bugs_count)
        }
        
        # Format response in clean professional format
        formatted_response = self._format_defect_leakage_response(metric_data)
        metric_data['formatted_response'] = formatted_response
        
        return metric_data
    
    async def _calculate_bug_ratio(self, project: str, time_range: Dict[str, str]) -> Dict[str, Any]:
        """Calculate bug ratio (bugs per test case)"""
        start_date = time_range['start']
        end_date = time_range['end']
        
        # Bugs found in the window (use creation date)
        bugs_jql = f'project = "{project}" AND type = Bug AND created >= "{start_date}" AND created <= "{end_date}"'
        # Tests executed in the window (use execution/status = Accepted and updated date)
        tests_jql = (
            f'project = "{project}" AND type = Test '
            f'AND status = "Accepted" '
            f'AND updated >= "{start_date}" AND updated <= "{end_date}"'
        )
        
        bugs = await self.jira_client.search(bugs_jql, max_results=1000)
        tests = await self.jira_client.search(tests_jql, max_results=1000)
        
        bugs_count = len(bugs) if bugs else 0
        tests_count = len(tests) if tests else 0
        
        ratio = bugs_count / tests_count if tests_count > 0 else 0
        
        return {
            'metric': 'Bug Ratio',
            'value': round(ratio, 2),
            'bugs_count': bugs_count,
            'tests_count': tests_count,
            'project': project,
            'analysis': (
                f"Bug ratio is {ratio:.2f} bugs per executed test. "
                f"Found {bugs_count} bugs with {tests_count} executed tests "
                f"from {start_date} to {end_date}."
            )
        }
    
    async def _calculate_test_story_ratio(self, project: str, time_range: Dict[str, str]) -> Dict[str, Any]:
        """Calculate test to story ratio"""
        start_date = time_range['start']
        end_date = time_range['end']
        
        tests_jql = (
            f'project = "{project}" AND type = Test '
            f'AND created >= "{start_date}" AND created <= "{end_date}"'
        )
        stories_jql = (
            f'project = "{project}" AND type = Story '
            f'AND created >= "{start_date}" AND created <= "{end_date}"'
        )
        
        tests = await self.jira_client.search(tests_jql, max_results=1000)
        stories = await self.jira_client.search(stories_jql, max_results=1000)
        
        tests_count = len(tests) if tests else 0
        stories_count = len(stories) if stories else 0
        
        ratio = tests_count / stories_count if stories_count > 0 else 0
        
        return {
            'metric': 'Test to Story Ratio',
            'value': round(ratio, 2),
            'tests_count': tests_count,
            'stories_count': stories_count,
            'project': project,
            'analysis': f"Test to story ratio is {ratio:.2f}. There are {tests_count} test cases for {stories_count} stories."
        }
    
    def _generate_automation_analysis(self, percentage: float, automated: int, total: int, test_type: str = 'overall') -> str:
        """Generate AI analysis for automation metrics"""
        if percentage >= 80:
            status = "excellent"
            recommendation = "Continue maintaining high automation coverage."
        elif percentage >= 60:
            status = "good"
            recommendation = "Focus on automating high-priority tests that require automation."
        elif percentage >= 40:
            status = "moderate"
            recommendation = "Consider increasing automation investment for regression suites."
        else:
            status = "needs improvement"
            recommendation = "Recommend prioritizing automation for critical test paths."
        
        return f"{test_type.title()} automation is {status} at {percentage:.1f}%. {automated} out of {total} tests are automated. Recommendation: {recommendation}"
    
    def _format_automation_response(self, percentage: float, automated_count: int, total_count: int, project: str, time_range: Dict[str, str]) -> str:
        """Format automation percentage response in clean professional format"""
        start_date = time_range.get('start', '')
        end_date = time_range.get('end', '')
        
        # Format dates
        if start_date and end_date:
            try:
                from datetime import datetime
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                period = f"{start_dt.strftime('%B %d')} - {end_dt.strftime('%B %d, %Y')}"
            except:
                period = f"{start_date} to {end_date}"
        else:
            period = "All time"
        
        manual_count = total_count - automated_count
        
        response = f"Automation Analysis - {project} Project\n\n"
        response += f"The test automation coverage is {percentage:.1f}% for the period {period}. "
        response += f"Out of {total_count} total test cases, {automated_count} are automated and {manual_count} require automation."
        
        return response
    
    def _generate_leakage_analysis(self, leakage: float, defects: int, bugs: int) -> str:
        """Generate AI analysis for defect leakage in clean professional format"""
        total = bugs + defects
        if leakage == 0:
            return f"Excellent! Zero defect leakage. All {bugs} issues were caught in lower environments."
        elif leakage <= 10:
            return f"Good defect leakage at {leakage:.1f}%. {defects} defects escaped to production. Continue strengthening test coverage."
        elif leakage <= 25:
            return f"Moderate defect leakage at {leakage:.1f}%. {defects} production defects from {total} total issues. Review test coverage for gaps."
        else:
            return f"High defect leakage at {leakage:.1f}%. {defects} defects escaped. Recommend RCA and enhanced pre-release testing."
    
    def _format_defect_leakage_response(self, metric_data: Dict[str, Any]) -> str:
        """Format defect leakage response in clean professional format"""
        value = metric_data.get('value', 0)
        project = metric_data.get('project', 'Unknown')
        time_range = metric_data.get('time_range', {})
        bugs_count = metric_data.get('bugs_count', 0)
        defects_count = metric_data.get('defects_count', 0)
        total_issues = metric_data.get('total_issues', 0)
        analysis = metric_data.get('analysis', '')
        
        start_date = time_range.get('start', '')
        end_date = time_range.get('end', '')
        
        # Format dates
        if start_date and end_date:
            try:
                from datetime import datetime
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                period = f"{start_dt.strftime('%B %d')} - {end_dt.strftime('%B %d, %Y')}"
            except:
                period = f"{start_date} to {end_date}"
        else:
            period = "Last 30 days"
        
        response = f"Defect Leakage Analysis - {project} Project\n\n"
        response += f"The defect leakage rate is {value}% for the period {period}. "
        response += f"Out of {total_issues} total issues, {bugs_count} bugs were caught in lower environments while {defects_count} defects escaped to production."
        
        if analysis:
            response += f" {analysis}"
        
        return response
    
    async def generate_kpi_insights(self, 
                                   portfolio: str,
                                   project_key: str,
                                   project_name: str,
                                   defect_count: int,
                                   bug_count: int,
                                   automation_percentage: float,
                                   completion_percentage: float,
                                   defect_rca_breakdown: Dict[str, int],
                                   bug_rca_breakdown: Dict[str, int],
                                   projects_list: List[Dict],
                                   historical_data: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """
        Generate AI-powered insights for KPI metrics including:
        - Dynamic comments based on real numbers
        - Recommendations to reduce leakage
        - Predictions for future leakage
        
        Args:
            portfolio: Portfolio name
            project_key: Project key
            project_name: Project name
            defect_count: Number of defects
            bug_count: Number of bugs
            automation_percentage: Automation percentage
            completion_percentage: Completion percentage
            defect_rca_breakdown: RCA breakdown for defects
            bug_rca_breakdown: RCA breakdown for bugs
            projects_list: List of projects with metrics
            historical_data: Optional historical data for trend analysis
        
        Returns:
            Dict with 'comment', 'recommendations', and 'prediction'
        """
        try:
            # Calculate leakage percentage
            total_issues = defect_count + bug_count
            leakage_percentage = (defect_count / total_issues * 100) if total_issues > 0 else 0
            
            # Calculate change if historical data available
            previous_leakage = None
            change_percentage = None
            if historical_data and len(historical_data) > 0:
                # Get most recent historical data point
                prev_data = historical_data[-1]
                prev_defects = prev_data.get('defect_count', 0)
                prev_bugs = prev_data.get('bug_count', 0)
                prev_total = prev_defects + prev_bugs
                if prev_total > 0:
                    previous_leakage = (prev_defects / prev_total * 100)
                    change_percentage = leakage_percentage - previous_leakage
            
            # Build context for AI
            context = f"""You are a Senior Quality Engineering Manager analyzing KPI metrics for a software development portfolio.

PORTFOLIO: {portfolio}
PROJECT: {project_key} - {project_name}

CURRENT METRICS:
- Defects (Production): {defect_count}
- Bugs (Lower Environments): {bug_count}
- Total Issues: {total_issues}
- Defect Leakage: {leakage_percentage:.1f}%
- Automation %: {automation_percentage:.1f}%
- Completion %: {completion_percentage:.1f}%

DEFECT RCA BREAKDOWN:
{json.dumps(defect_rca_breakdown, indent=2) if defect_rca_breakdown else 'None'}

BUG RCA BREAKDOWN:
{json.dumps(bug_rca_breakdown, indent=2) if bug_rca_breakdown else 'None'}
"""
            
            if change_percentage is not None:
                context += f"""
TREND ANALYSIS:
- Previous Leakage: {previous_leakage:.1f}%
- Current Leakage: {leakage_percentage:.1f}%
- Change: {'+' if change_percentage > 0 else ''}{change_percentage:.1f} percentage points
"""
            
            if projects_list:
                context += f"""
PROJECTS IN PORTFOLIO ({len(projects_list)}):
"""
                for proj in projects_list[:5]:  # Limit to first 5 for context
                    proj_leakage = (proj.get('defect_count', 0) / (proj.get('defect_count', 0) + proj.get('bug_count', 0)) * 100) if (proj.get('defect_count', 0) + proj.get('bug_count', 0)) > 0 else 0
                    context += f"- {proj.get('project_key')}: {proj_leakage:.1f}% leakage ({proj.get('defect_count', 0)} defects, {proj.get('bug_count', 0)} bugs)\n"
            
            # Generate dynamic comment
            comment_prompt = f"""{context}

Generate a concise, actionable comment (2-3 sentences) about the current leakage status. 
Include specific numbers and a clear recommendation.

Examples:
- "Leakage increased sharply by 75% (6 defects leaked). High-risk module. Recommendation: Strengthen regression suite, perform RCA, review unit test coverage."
- "Leakage improved by 33.1%. Positive movement. Continue reuse of automation framework and expand coverage to onboarding flows."

Your response (comment only, no labels):"""
            
            # Generate recommendations
            recommendations_prompt = f"""{context}

Generate 5-7 specific, actionable recommendations to reduce defect leakage. Focus on:
- Automated regression for modules that leaked 2+ times
- Increasing negative test coverage where leakage patterns repeat
- Prioritizing code review for developers with high leakage
- Strengthening integration test suite
- Improving test data generation
- Other specific, actionable recommendations

Format as a numbered list. Be specific and actionable."""

            # Generate prediction
            prediction_prompt = f"""{context}

Based on the current trend and historical patterns, predict the expected leakage for the next Program Increment (PI).
If historical data shows a trend, use it. Otherwise, provide a conservative estimate.

Format: "If current trend continues, expected leakage for next PI is ~X%. Recommend adding Y-Z automated test cases for high-risk modules."

Your response:"""
            
            # Use AsyncOpenAI for async operations
            from openai import AsyncOpenAI
            api_key = os.getenv("OPENAI_API_KEY")
            endpoint_url = os.getenv("OPENAI_API_ENDPOINT")
            model = os.getenv("OPENAI_MODEL", "databricks-gpt-5-1")
            
            if endpoint_url and api_key:
                async_client = create_databricks_async_openai_client(api_key, endpoint_url)
            elif api_key:
                async_client = AsyncOpenAI(api_key=api_key)
            else:
                async_client = AsyncOpenAI()
            
            # Generate comment
            comment_response = await async_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a Senior Quality Engineering Manager providing concise, data-driven insights."},
                    {"role": "user", "content": comment_prompt}
                ],
                temperature=0.7,
                max_tokens=200
            )
            comment = comment_response.choices[0].message.content.strip()
            
            # Generate recommendations
            rec_response = await async_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a Senior Quality Engineering Manager providing actionable recommendations."},
                    {"role": "user", "content": recommendations_prompt}
                ],
                temperature=0.8,
                max_tokens=500
            )
            recommendations_text = rec_response.choices[0].message.content.strip()
            
            # Generate prediction
            pred_response = await async_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a Senior Quality Engineering Manager providing data-driven predictions."},
                    {"role": "user", "content": prediction_prompt}
                ],
                temperature=0.6,
                max_tokens=200
            )
            prediction = pred_response.choices[0].message.content.strip()
            
            # Parse recommendations into list
            recommendations = []
            for line in recommendations_text.split('\n'):
                line = line.strip()
                if line and (line[0].isdigit() or line.startswith('-') or line.startswith('•')):
                    # Remove numbering/bullets
                    clean_line = re.sub(r'^[\d\-•\.\)\s]+', '', line).strip()
                    if clean_line:
                        recommendations.append(clean_line)
            
            return {
                "comment": comment,
                "recommendations": recommendations if recommendations else [recommendations_text],
                "prediction": prediction,
                "leakage_percentage": leakage_percentage,
                "change_percentage": change_percentage
            }
            
        except Exception as e:
            logger.error(f"Error generating KPI insights: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Fallback to simple analysis
            leakage_percentage = (defect_count / (defect_count + bug_count) * 100) if (defect_count + bug_count) > 0 else 0
            return {
                "comment": f"Defect leakage at {leakage_percentage:.1f}% ({defect_count} defects, {bug_count} bugs). Review test coverage and strengthen pre-release gates.",
                "recommendations": [
                    "Add automated regression for modules that leaked 2+ times",
                    "Increase negative test coverage where leakage patterns repeat",
                    "Prioritize code review for developers with high leakage",
                    "Strengthen integration test suite",
                    "Improve test data generation"
                ],
                "prediction": f"If current trend continues, expected leakage for next PI is ~{leakage_percentage:.1f}%. Recommend adding automated test cases for high-risk modules.",
                "leakage_percentage": leakage_percentage,
                "change_percentage": None
            }
    
    async def _search_confluence_for_project(self, query: str, project: str = None) -> List[Dict[str, Any]]:
        """Search Confluence in the project's dedicated space"""
        if not self.confluence_client:
            return []
        
        # Get the Confluence space for the project
        space = self.PROJECT_CONFLUENCE_SPACES.get(project, self.PROJECT_CONFLUENCE_SPACES['default'])
        
        try:
            results = await self.confluence_client.search_in_space(query, space=space, limit=10)
            return results
        except Exception as e:
            logger.error(f"Error searching Confluence space {space}: {e}")
            return []
    
    async def process_query(
        self, 
        user_query: str, 
        source: str = "auto",
        unified_rag_handler = None,
        integrations: List[str] = None,
        theme: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """
        Main entry point - processes user query intelligently
        
        Args:
            user_query: The user's question
            source: "auto" (AI detects), "jira", "confluence", "github", or determined by unified RAG
            unified_rag_handler: Unified RAG handler instance for semantic routing
            integrations: List of selected integrations for manual mode
            theme: Theme dictionary with color values for light/dark mode
        
        Returns: {
            "jql": "generated JQL",
            "response": "natural language response",
            "data": [...results...],
            "intent": "detected intent",
            "content": "response content (for adaptive engine)",
            "type": "simple|analysis"
        }
        """
        logger.info("=" * 80)
        logger.info("🚀 NEW QUERY RECEIVED")
        logger.info(f"💬 User Query: {user_query}")
        logger.info(f"🎯 Source Mode: {source}")
        logger.info("=" * 80)
        
        # PRIORITY 0: Use AI to understand the query comprehensively
        # Skip AI understanding for simple queries (ticket keys, simple lookups)
        query_understanding = None
        
        # Fast path: Skip AI understanding for simple queries
        ticket_pattern = r'\b([A-Z][A-Z0-9]+-\d+)\b'
        has_ticket_key = re.search(ticket_pattern, user_query, re.IGNORECASE)
        is_simple_query = (
            has_ticket_key or
            user_query.lower().strip() in ['help', 'hi', 'hello'] or
            len(user_query.split()) <= 3  # Very short queries
        )
        
        if not is_simple_query:
            # Check cache first
            from services.performance_cache import get_performance_cache
            cache = get_performance_cache()
            cache_key = cache._generate_key('query_understanding', user_query)
            query_understanding = cache.get(cache_key)
            
            if query_understanding is None:
                logger.info("🤖 Step 1: AI Query Understanding...")
                query_understanding = await self._understand_query_with_ai(user_query)
                # Cache for 1 hour
                if query_understanding:
                    cache.set(cache_key, query_understanding, ttl=3600)
            else:
                logger.info("✅ Using cached query understanding")
        
        # If AI understanding succeeded, log it
        if query_understanding:
            logger.info("=" * 80)
            logger.info("✅ AI QUERY UNDERSTANDING COMPLETE")
            logger.info(f"🎯 Query Intent: {query_understanding.get('query_intent', 'N/A')}")
            logger.info(f"🧠 AI Reasoning: {query_understanding.get('reasoning', query_understanding.get('ai_reasoning', 'N/A'))}")
            logger.info(f"📊 Is Metric Query: {query_understanding.get('is_metric_query', False)}")
            if query_understanding.get('is_metric_query'):
                logger.info(f"📈 Metric Type: {query_understanding.get('metric_type', 'N/A')}")
            logger.info(f"📦 Project: {query_understanding.get('project', 'N/A')}")
            logger.info(f"📅 Time Period: {query_understanding.get('time_period', 'N/A')}")
            logger.info("=" * 80)
        
        # Check if this is a metric calculation query
        if query_understanding and query_understanding.get('is_metric_query') and query_understanding.get('metric_type'):
            metric_info = query_understanding
            logger.info(f"📊 Detected metric query: {metric_info['metric_type']} for project {metric_info.get('project', 'N/A')}")
            try:
                metric_result = await self._calculate_metric(metric_info)
                
                # Format response in clean professional format
                if 'error' not in metric_result:
                    # Use formatted response if available
                    if 'formatted_response' in metric_result:
                        response = self._strip_html_tags(metric_result['formatted_response'])
                    else:
                        # Fallback formatting in clean professional format
                        metric_name = metric_result.get('metric', 'Metric')
                        value = metric_result.get('value', 0)
                        project = metric_result.get('project', 'Unknown')
                        
                        response = f"{metric_name} - {project} Project\n\n"
                        response += f"The {metric_name.lower()} is {value}%"
                        
                        time_range = metric_info.get('time_range', {})
                        if time_range:
                            start_date = time_range.get('start', '')
                            end_date = time_range.get('end', '')
                            if start_date and end_date:
                                try:
                                    from datetime import datetime
                                    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                                    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                                    period = f"{start_dt.strftime('%B %d')} - {end_dt.strftime('%B %d, %Y')}"
                                except:
                                    period = f"{start_date} to {end_date}"
                                response += f" for the period {period}."
                            else:
                                response += "."
                        else:
                            response += "."
                    
                    # Include analysis if available (but keep it concise)
                    if metric_result.get('analysis'):
                        response += f"\n\n{metric_result['analysis']}"
                    
                    # Store context for metric queries
                    jql_for_context = metric_result.get('jql', 'N/A')
                    self.add_context(user_query, jql_for_context, [], response, None, query_understanding)
                    
                    return {
                        "response": response,
                        "data": metric_result,
                        "intent": "metric_calculation",
                        "type": "analysis"
                    }
                else:
                    return {
                        "response": f"Unable to calculate metric: {metric_result['error']}",
                        "intent": "metric_calculation",
                        "type": "error"
                    }
            except Exception as e:
                logger.error(f"Error processing metric query: {e}")
                # Fall through to normal processing
        
        # Check if this is a test case breakdown query (e.g., "how many automated and manual test cases")
        query_lower = user_query.lower()
        is_test_case_breakdown = (
            'test case' in query_lower and 
            ('automated' in query_lower or 'manual' in query_lower) and
            ('how many' in query_lower or 'breakdown' in query_lower or 'count' in query_lower)
        )
        
        if is_test_case_breakdown:
            logger.info("🔍 Detected test case breakdown query")
            # Extract project from query understanding or query itself
            project = None
            if query_understanding and query_understanding.get('project'):
                project = query_understanding.get('project')
            else:
                # Try to extract project from query
                query_upper = user_query.upper()
                if 'NDP' in query_upper:
                    project = 'NDP'
                elif 'CCM' in query_upper:
                    project = 'CCM'
                elif 'CES' in query_upper:
                    project = 'CES'
                # Add more projects as needed
            
            # Determine test type
            test_type = None
            if 'regression' in query_lower:
                test_type = 'Regression Testing'
            elif 'functional' in query_lower:
                test_type = 'Functional Testing'
            elif 'smoke' in query_lower:
                test_type = 'Smoke Testing'
            
            if project:
                try:
                    breakdown = await self._calculate_test_case_breakdown(project, test_type)
                    response = self._format_test_case_breakdown_response(breakdown)
                    
                    # Store context
                    jql_for_context = f'project = "{project}" AND type = Test'
                    if test_type:
                        jql_for_context += f' AND "Test Type" = "{test_type}"'
                    self.add_context(user_query, jql_for_context, [], response, None, query_understanding)
                    
                    return {
                        "response": response,
                        "data": breakdown,
                        "intent": "test_case_breakdown",
                        "success": True,
                        "source": "jira"
                    }
                except Exception as e:
                    logger.error(f"Error processing test case breakdown query: {e}")
                    # Fall through to normal processing
            else:
                logger.warning("Test case breakdown query detected but no project found")
                # Fall through to normal processing
        else:
            # Not a metric query, but check if pattern matching finds one
            if not query_understanding:
                logger.info("🤖 AI understanding didn't detect metric query, trying pattern matching...")
                metric_info = self._detect_metric_query(user_query)
                if metric_info:
                    # Found metric via pattern matching, process it
                    logger.info(f"📊 Pattern matching detected metric query: {metric_info['metric_type']} for project {metric_info.get('project', 'N/A')}")
                    try:
                        metric_result = await self._calculate_metric(metric_info)
                        if 'error' not in metric_result:
                            raw_response = metric_result.get('formatted_response', f"{metric_result.get('metric', 'Metric')}: {metric_result.get('value', 0)}%")
                            response = self._strip_html_tags(raw_response)
                            # Store context for pattern-matched metric queries
                            jql_for_context = metric_result.get('jql', 'N/A')
                            # Create a query_understanding-like dict from metric_info
                            pattern_query_understanding = {
                                "is_metric_query": True,
                                "metric_type": metric_info.get('metric_type'),
                                "project": metric_info.get('project'),
                                "time_period": metric_info.get('time_period'),
                                "year": metric_info.get('year'),
                                "month": metric_info.get('month'),
                                "query_intent": f"calculate {metric_info.get('metric_type')} for {metric_info.get('project', 'project')}"
                            }
                            self.add_context(user_query, jql_for_context, [], response, None, pattern_query_understanding)
                            return {
                                "response": response,
                                "data": metric_result,
                                "intent": "metric_calculation",
                                "type": "analysis"
                            }
                    except Exception as e:
                        logger.error(f"Error processing pattern-matched metric query: {e}")
                        # Fall through to normal processing
        
        # Store query understanding for use in JQL generation and context awareness
        # This will help _analyze_query generate better JQL and enable follow-up questions
        if query_understanding:
            self.last_query_context = query_understanding
        
        # Store unified_rag_handler and integrations for use in response generation
        self._current_unified_rag_handler = unified_rag_handler
        self._current_integrations = integrations or []
        self._current_theme = theme  # Theme from request headers
        
        # NEW: If source is "both", search both sources and return best match
        if source == "both":
            return await self._process_dual_source_query(user_query)
        
        # NEW: If source is "auto", use unified RAG or AI to classify and route intelligently
        if source == "auto":
            return await self._process_auto_source_query(user_query, unified_rag_handler)
        
        # PRIORITY 1: Check for ticket keys first - if found, always route to Jira
        ticket_pattern = r'\b([A-Z][A-Z0-9]+-\d+)\b'
        has_ticket_key = re.search(ticket_pattern, user_query, re.IGNORECASE)
        
        if has_ticket_key:
            ticket_key = has_ticket_key.group(1).upper()
            logger.info("=" * 80)
            logger.info("🎯 TICKET KEY DETECTED - DIRECT JIRA ROUTING")
            logger.info(f"🎫 Ticket Key: {ticket_key}")
            logger.info(f"💬 Original Query: {user_query}")
            # Route directly to Jira processing
            try:
                # Check if this is a follow-up question and extract ticket from context
                enhanced_query = await self._enhance_query_with_context(user_query)
                if enhanced_query != user_query:
                    logger.info(f"🔄 Query Enhanced with Context: '{enhanced_query}'")
                else:
                    logger.info(f"📝 Query Unchanged: '{enhanced_query}'")
                
                query_analysis = await self._analyze_query(enhanced_query)
                logger.info(f"⚙️  Executing JQL for ticket key query...")
                jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"))
                
                if isinstance(jql_result, dict) and 'results' in jql_result:
                    results = jql_result['results']
                    is_count_only = jql_result.get('is_count_only', False)
                    total_count = jql_result.get('total_count', len(results))
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    is_count_only = False
                    total_count = len(results)
                
                if results or is_count_only:
                    response = await self._generate_text_response(
                        user_query, 
                        results, 
                        query_analysis, 
                        total_count=total_count,
                        unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                        integrations=getattr(self, '_current_integrations', None),
                        theme=getattr(self, '_current_theme', None)
                    )
                    return {
                        "jql": query_analysis["jql"],
                        "response": response,
                        "data": results,
                        "intent": query_analysis.get("intent"),
                        "success": True,
                        "source": "jira",
                        "is_count_only": is_count_only,
                        "total_count": total_count
                    }
                else:
                    return {
                        "jql": query_analysis["jql"],
                        "response": f"No Jira issues found for ticket '{ticket_key}'. Please verify the ticket key is correct.",
                        "data": [],
                        "intent": query_analysis.get("intent"),
                        "success": False,
                        "source": "jira"
                    }
            except Exception as e:
                logger.error(f"Jira query processing failed: {e}")
                return {
                    "response": f"Error processing Jira query for ticket '{ticket_key}': {str(e)}",
                    "data": [],
                    "success": False,
                    "source": "jira_error"
                }
        
        # PRIORITY 2: Use AI to classify the query intelligently (instead of keyword matching)
        query_classification = await self._classify_query_with_ai(user_query)
        logger.info(f"AI classified query as: {query_classification}")
        
        if query_classification == "general_knowledge":
            logger.info(f"AI detected general knowledge query - using web search")
            return await self._process_web_search_query(user_query)
        elif query_classification == "confluence":
            logger.info(f"AI detected Confluence query - routing to Confluence")
            if not self.confluence_client:
                return {
                    "response": "Confluence is not configured",
                    "data": [],
                    "success": False,
                    "source": "confluence_not_configured"
                }
            confluence_result = await self._process_confluence_query(user_query)
            # Check success flag OR non-empty response — NOT just data list,
            # because index-first answers may have data=[] with a valid LLM response.
            if confluence_result.get('success') or confluence_result.get('response'):
                return confluence_result
            else:
                return {
                    "response": f"No Confluence documents found for '{user_query}'",
                    "data": [],
                    "success": False,
                    "source": "confluence"
                }
        # Otherwise, proceed to Jira (query_classification == "jira" or fallback)
        
        # If user explicitly selected a source, respect that selection
        if source == "jira":
            logger.info(f"User selected Jira source - skipping Confluence detection and going directly to Jira processing")
            try:
                # Check if this is a follow-up question and extract ticket from context
                enhanced_query = await self._enhance_query_with_context(user_query)
                logger.info(f"Enhanced query: '{enhanced_query}'")
                
                query_analysis = await self._analyze_query(enhanced_query)
                jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"))
                
                if isinstance(jql_result, dict) and 'results' in jql_result:
                    results = jql_result['results']
                    is_count_only = jql_result.get('is_count_only', False)
                    total_count = jql_result.get('total_count', len(results))
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    is_count_only = False
                    total_count = len(results)
                
                if results or is_count_only:
                    response = await self._generate_text_response(
                        user_query, 
                        results, 
                        query_analysis, 
                        total_count=total_count,
                        unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                        integrations=getattr(self, '_current_integrations', None),
                        theme=getattr(self, '_current_theme', None)
                    )
                    return {
                        "jql": query_analysis["jql"],
                        "response": response,
                        "data": results,
                        "intent": query_analysis.get("intent"),
                        "success": True,
                        "source": "jira",
                        "is_count_only": is_count_only,
                        "total_count": total_count
                    }
                else:
                    return {
                        "jql": query_analysis["jql"],
                        "response": f"No Jira issues found for '{user_query}'",
                        "data": [],
                        "intent": query_analysis.get("intent"),
                        "success": False,
                        "source": "jira"
                    }
            except Exception as e:
                logger.error(f"Jira query processing failed: {e}")
                return {
                    "response": f"Error processing Jira query: {str(e)}",
                    "data": [],
                    "success": False,
                    "source": "jira_error"
                }
        
        elif source == "confluence":
            logger.info(f"User selected Confluence source - searching Confluence first")
            if not self.confluence_client:
                return {
                    "response": "Confluence is not configured",
                    "data": [],
                    "success": False,
                    "source": "confluence_not_configured"
                }
            
            confluence_result = await self._process_confluence_query(user_query)
            if confluence_result.get('success') or confluence_result.get('response'):
                return confluence_result
            else:
                return {
                    "response": f"No Confluence documents found for '{user_query}'",
                    "data": [],
                    "success": False,
                    "source": "confluence"
                }

        # If source is "auto" or unspecified, use AI-based intelligent classification
        if not self.client:
            return await self._fallback_processing(user_query)
        
        # Use AI to intelligently classify the query intent
        query_classification = await self._classify_query_intent(user_query)
        logger.info(f"🤖 AI Classification Result: {query_classification}")
        
        # Route based on AI classification
        if query_classification == 'general_knowledge':
            logger.info(f"🤖 AI classified as general knowledge - using web search")
            return await self._process_web_search_query(user_query)
        elif query_classification == 'confluence' and self.confluence_client:
            logger.info(f"🤖 AI classified as Confluence query - searching Confluence")
            confluence_result = await self._process_confluence_query(user_query)
            if confluence_result.get('data'):
                return confluence_result
            # If no results, fall through to Jira as fallback
            logger.info(f"No Confluence results, falling back to Jira")
        
        # Continue with Jira processing (either AI classified as 'jira' or fallback from empty Confluence results)
        # Keep the keyword-based Confluence detection as a secondary fallback
        confluence_keywords = ['confluence', 'documentation', 'wiki', 'page', 'article', 'knowledge base', 'doc', 'guide', 'manual', 'tutorial']
        jira_keywords = ['issue', 'bug', 'task', 'story', 'epic', 'sprint', 'ticket', 'jira', 'assignee', 'reporter', 'status', 'priority']
        
        # Questions that should check Jira FIRST, then fallback to Confluence
        jira_first_keywords = [
            'working on', 'workload', 'assigned to', 'who is', 'what is', 'show me', 'list', 'count',
            'how many', 'find', 'search for', 'open', 'closed', 'in progress', 'done', 'resolved',
            'created', 'updated', 'reported', 'project', 'team', 'sprint', 'backlog', 'velocity',
            'defect leakage', 'automation', 'test coverage', 'bug ratio', 'metrics', 'kpi'
        ]
        
        query_lower = user_query.lower()
        is_confluence_query = any(keyword in query_lower for keyword in confluence_keywords)
        is_jira_query = any(keyword in query_lower for keyword in jira_keywords)
        is_jira_first_query = any(keyword in query_lower for keyword in jira_first_keywords)
        
        # Priority keywords that ALWAYS trigger Confluence search first
        confluence_priority_keywords = ['confluence', 'wiki', 'document', 'insurance', 'eligibility', 'entertainment', 'partners', 'lab', 'results', 'emr', 'careexpand']
        
        # Explicit Confluence check phrases
        confluence_check_phrases = [
            'check in confluence', 'check confluence', 'look in confluence', 'search confluence',
            'check wiki', 'look in wiki', 'search wiki', 'check documentation', 'look in documentation',
            'search documentation', 'check docs', 'look in docs', 'search docs'
        ]
        
        has_confluence_priority = any(keyword in query_lower for keyword in confluence_priority_keywords)
        has_confluence_check = any(phrase in query_lower for phrase in confluence_check_phrases)
        
        # If it's explicitly a Confluence query, or if it's not clearly a Jira query and contains common document/page terms
        document_terms = ['results', 'report', 'analysis', 'findings', 'study', 'research', 'data', 'information', 'content']
        has_document_terms = any(term in query_lower for term in document_terms)
        
        # Also check for patterns that suggest Confluence content
        confluence_patterns = [
            'view lab results', 'lab results', 'test results', 'analysis results',
            'project overview', 'documentation', 'how to', 'getting started',
            'user guide', 'api documentation', 'technical specs'
        ]
        
        has_confluence_pattern = any(pattern in query_lower for pattern in confluence_patterns)
        
        # Debug logging
        logger.info(f"Confluence detection debug for query: '{user_query}'")
        logger.info(f"  - has_confluence_priority: {has_confluence_priority}")
        logger.info(f"  - has_confluence_check: {has_confluence_check}")
        logger.info(f"  - is_confluence_query: {is_confluence_query}")
        logger.info(f"  - has_confluence_pattern: {has_confluence_pattern}")
        logger.info(f"  - is_jira_query: {is_jira_query}")
        logger.info(f"  - has_document_terms: {has_document_terms}")
        logger.info(f"  - should_search_confluence_first: {should_search_confluence_first}")
        logger.info(f"  - confluence_client available: {self.confluence_client is not None}")
        
        if should_search_confluence_first and self.confluence_client:
            if has_confluence_priority:
                logger.info(f"Detected priority Confluence keywords in query: '{user_query}' - searching Confluence first")
            elif has_confluence_check:
                logger.info(f"Detected explicit Confluence check phrase in query: '{user_query}' - searching Confluence first")
            else:
                logger.info(f"Detected document/Confluence query: '{user_query}' - searching Confluence first")
            confluence_result = await self._process_confluence_query(user_query)
            
            # Check if Confluence found results
            confluence_data = confluence_result.get('data', [])
            if confluence_data and len(confluence_data) > 0:
                logger.info(f"Confluence found {len(confluence_data)} results - returning Confluence results")
                return confluence_result
            else:
                logger.info("No Confluence results found - falling back to Jira search")
                # Fall back to Jira search
                try:
                    # Enhance query with context for follow-up questions
                    enhanced_query = await self._enhance_query_with_context(user_query)
                    query_analysis = await self._analyze_query(enhanced_query)
                    jira_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"))
                    
                    # Check if this is a user confirmation response (multiple user matches)
                    if isinstance(jira_result, dict) and jira_result.get("intent") == "user_confirmation":
                        logger.info("✅ Returning user confirmation response from _execute_jql (Confluence-first path)")
                        return jira_result
                    
                    # Generate response for Jira results
                    if isinstance(jira_result, dict) and 'results' in jira_result:
                        results = jira_result['results']
                        total_count = jira_result.get('total_count', len(results))
                    else:
                        results = jira_result if isinstance(jira_result, list) else []
                        total_count = len(results)
                    
                    if results:
                        response = await self._generate_text_response(
                            user_query, 
                            results, 
                            query_analysis,
                            unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                            integrations=getattr(self, '_current_integrations', None),
                            theme=getattr(self, '_current_theme', None)
                        )
                        # Create specific fallback message based on priority keywords
                        if has_confluence_priority:
                            priority_keywords_found = [kw for kw in confluence_priority_keywords if kw in query_lower]
                            fallback_message = f"**Priority Confluence Search Fallback**\n\nSince you mentioned '{' or '.join(priority_keywords_found)}', I searched Confluence first but found no results. Here are related Jira issues:\n\n"
                        else:
                            fallback_message = "**Confluence Search Fallback**\n\nNo relevant documentation found in Confluence, but here are related Jira issues:\n\n"
                        
                        return {
                            "jql": query_analysis["jql"],
                            "response": f"{fallback_message}{response}",
                            "data": results,
                            "intent": query_analysis.get("intent"),
                            "success": True,
                            "source": "jira_fallback"
                        }
                    else:
                        # Create specific no-results message based on priority keywords
                        if has_confluence_priority:
                            priority_keywords_found = [kw for kw in confluence_priority_keywords if kw in query_lower]
                            no_results_message = f"**Priority Confluence Search Fallback**\n\nSince you mentioned '{' or '.join(priority_keywords_found)}', I searched Confluence first but found no results. No related Jira issues were found either for '{user_query}'."
                        else:
                            no_results_message = f"**Confluence Search Fallback**\n\nNo results found in either Confluence documentation or Jira issues for '{user_query}'."
                        
                        return {
                            "jql": query_analysis["jql"],
                            "response": no_results_message,
                            "data": [],
                            "intent": query_analysis.get("intent"),
                            "success": False,
                            "source": "no_results"
                        }
                except Exception as e:
                    logger.error(f"Jira fallback search failed: {e}")
                    return {
                        "jql": "fallback_error",
                        "response": f"**Confluence Search Fallback**\n\nNo Confluence results found, and Jira fallback search failed: {str(e)}",
                        "data": [],
                        "intent": "fallback_error",
                        "success": False,
                        "source": "fallback_error"
                    }
        
        # Use QueryPlanner to detect table/factual lookups on Confluence pages.
        # e.g. "which Jira IDs were fixed yesterday in GL Enquiry workflow"
        # → intent=table_lookup, target_page="GL Enquiry Workflow"
        # These queries contain "jira" but are really asking about a Confluence table.
        _qp_plan = _confluence_query_planner.plan(user_query)
        has_table_lookup_intent = (
            _qp_plan.intent in ("table_lookup", "factual_lookup")
            and _qp_plan.target_page is not None
        )
        if has_table_lookup_intent:
            logger.info(
                f"[QueryPlanner] Detected {_qp_plan.intent!r} on page "
                f"'{_qp_plan.target_page}' — routing to Confluence first"
            )

        # Determine if this should be a Confluence-first search (defined before Jira-first check)
        should_search_confluence_first = (
            has_table_lookup_intent or  # QueryPlanner: table/factual lookup on specific page
            has_confluence_priority or  # Priority keywords always trigger Confluence
            has_confluence_check or     # Explicit "check in confluence" phrases
            is_confluence_query or
            (has_confluence_pattern and not is_jira_query) or
            (has_document_terms and not is_jira_query and '=' not in query_lower and '-' not in query_lower)
        )
        # If Confluence is not configured, never route to Confluence
        if not self.confluence_client:
            should_search_confluence_first = False
        
        # Check if this should be a Jira-first query (check Jira, then fallback to Confluence)
        should_check_jira_first = (
            query_classification == 'jira' or  # AI classified as Jira
            is_jira_query or  # Contains Jira keywords
            is_jira_first_query or  # Contains Jira-first keywords
            (not is_confluence_query and not should_search_confluence_first)  # Not a Confluence query
        )
        
        # If Jira-first query and Confluence is available, try Jira first, then fallback to Confluence
        if should_check_jira_first and self.confluence_client and not should_search_confluence_first:
            logger.info(f"🔍 Jira-first query detected: '{user_query}' - checking Jira first, will fallback to Confluence if no results")
            try:
                # Step 1: Check for person names and resolve them
                query_lower = user_query.lower()
                potential_names = []
                # Extract potential person names
                person_name_patterns = [
                    r'\b(check|show|find|list|count|who|what)\s+([A-Z][a-z]+)\s+(stories|bugs|tasks|issues|work|tickets)',
                    r'\b([A-Z][a-z]+)\'?s?\s+(stories|bugs|tasks|issues|work|tickets|workload)',
                ]
                
                for pattern in person_name_patterns:
                    matches = re.findall(pattern, user_query, re.IGNORECASE)
                    for match in matches:
                        if isinstance(match, tuple):
                            name = match[1] if len(match) > 1 else match[0]
                            if name and name[0].isupper() and len(name) > 2:
                                potential_names.append(name)
                
                # Resolve names
                resolved_names = {}
                ambiguous_names = {}
                for name in set(potential_names):
                    if name.upper() in (await self.jira_client.get_project_keys() if self.jira_client else []):
                        continue
                    formatted_name = await self._find_jira_user_by_name(name, detected_project if 'detected_project' in locals() else None)
                    if formatted_name:
                        resolved_names[name] = formatted_name
                    else:
                        ldap_users = await self._search_ldap_users(name, limit=5)
                        if len(ldap_users) > 1:
                            ambiguous_names[name] = [u['displayName'] for u in ldap_users]
                
                if ambiguous_names:
                    confirmation_parts = []
                    for name, matches in ambiguous_names.items():
                        confirmation_parts.append(f"I found multiple users matching '{name}':\n")
                        for i, match in enumerate(matches[:5], 1):
                            confirmation_parts.append(f"{i}. {match}")
                        confirmation_parts.append(f"\nPlease specify which user you meant.")
                    return {
                        "jql": "",
                        "response": "\n".join(confirmation_parts),
                        "data": [],
                        "intent": "user_confirmation",
                        "success": False,
                        "source": "user_lookup"
                    }
                
                # Replace names in query
                enhanced_query = user_query
                for original_name, formatted_name in resolved_names.items():
                    enhanced_query = re.sub(r'\b' + re.escape(original_name) + r'\b', formatted_name, enhanced_query, flags=re.IGNORECASE)
                
                # Step 2: Understand the query and generate JQL
                enhanced_query = await self._enhance_query_with_context(enhanced_query)
                query_analysis = await self._analyze_query(enhanced_query)
                
                # Step 3: Execute JQL
                jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"))
                
                # Check if this is a user confirmation response (multiple user matches)
                if isinstance(jql_result, dict) and jql_result.get("intent") == "user_confirmation":
                    logger.info("✅ Returning user confirmation response from _execute_jql (Jira-first path)")
                    return jql_result
                
                # Handle both old format (list) and new format (dict with results)
                if isinstance(jql_result, dict) and 'results' in jql_result:
                    results = jql_result['results']
                    total_count = jql_result.get('total_count', len(results))
                    is_count_only = jql_result.get('is_count_only', False)
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    total_count = len(results)
                    is_count_only = False
                
                # If Jira has results, return them
                if results or (is_count_only and total_count > 0):
                    logger.info(f"✅ Jira found {total_count} results - returning Jira results")
                    if is_count_only:
                        entities = query_analysis.get('entities', {})
                        project_ref = entities.get('project') or entities.get('project_key')
                        issue_type = entities.get('issue_type')
                        issue_label = (issue_type or 'issue').strip()
                        if issue_label and not issue_label.lower().endswith('s') and total_count != 1:
                            issue_label = f"{issue_label}s"
                        project_text = f"the {project_ref} project" if project_ref else "the selected scope"
                        response = f"There {'is' if total_count == 1 else 'are'} {total_count} {issue_label.lower()} in {project_text}."
                        self.add_context(user_query, query_analysis["jql"], [], response, query_analysis, self.last_query_context)
                        return {
                            "jql": query_analysis["jql"],
                            "response": response,
                            "data": [],
                            "intent": query_analysis["intent"],
                            "success": True,
                            "total_count": total_count,
                            "count_only": True,
                            "type": "summary",
                            "source": "jira"
                        }
                    else:
                        retrieved_count = jql_result.get('retrieved_count') if isinstance(jql_result, dict) else None
                        response = await self._generate_response(
                            user_query, 
                            query_analysis, 
                            results, 
                            total_count, 
                            retrieved_count,
                            unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                            integrations=getattr(self, '_current_integrations', None),
                            theme=getattr(self, '_current_theme', None)
                        )
                        # Extract content if response is dict
                        response_content = response.get('content', str(response)) if isinstance(response, dict) else str(response)
                        self.add_context(user_query, query_analysis["jql"], results, response_content, query_analysis, self.last_query_context)
                        return {
                            "jql": query_analysis["jql"],
                            "response": response,
                            "data": results,
                            "intent": query_analysis["intent"],
                            "success": True,
                            "source": "jira"
                        }
                else:
                    # No Jira results - fallback to Confluence
                    logger.info(f"⚠️ No Jira results found - falling back to Confluence search")
                    confluence_result = await self._process_confluence_query(user_query)
                    confluence_data = confluence_result.get('data', [])
                    
                    if confluence_data and len(confluence_data) > 0:
                        logger.info(f"✅ Confluence fallback found {len(confluence_data)} results")
                        fallback_message = f"**Jira Search Fallback**\n\nNo Jira issues found for '{user_query}', but here's relevant documentation from Confluence:\n\n"
                        return {
                            "jql": query_analysis["jql"],
                            "response": f"{fallback_message}{confluence_result.get('response', '')}",
                            "data": confluence_data,
                            "intent": query_analysis.get("intent"),
                            "success": True,
                            "source": "confluence_fallback"
                        }
                    else:
                        # No results in either source
                        return {
                            "jql": query_analysis["jql"],
                            "response": f"No results found in Jira for '{user_query}'. Also checked Confluence documentation but found no relevant content.",
                            "data": [],
                            "intent": query_analysis.get("intent"),
                            "success": False,
                            "source": "no_results"
                        }
            except Exception as e:
                logger.error(f"Jira-first search failed: {e}, falling back to Confluence")
                try:
                    confluence_result = await self._process_confluence_query(user_query)
                    if confluence_result.get('data'):
                        return {
                            "response": f"**Jira Search Error - Confluence Fallback**\n\nJira search encountered an error, but here's relevant documentation:\n\n{confluence_result.get('response', '')}",
                            "data": confluence_result.get('data', []),
                            "success": True,
                            "source": "confluence_fallback_error"
                        }
                except Exception as confluence_error:
                    logger.error(f"Confluence fallback also failed: {confluence_error}")
        
        try:
            # Step 1: Get project keys for filtering
            project_keys = []
            detected_project = None
            if self.jira_client:
                try:
                    projects = await self.jira_client.get_projects()
                    project_keys = [p.get('key', '') for p in projects]
                    # Try to detect project from query
                    query_upper = user_query.upper()
                    for project_key in project_keys:
                        if project_key in query_upper:
                            detected_project = project_key
                            break
                except Exception as e:
                    logger.warning(f"Failed to get projects: {e}")
            
            # Step 2: Check for person names in query and resolve them
            # Extract potential person names (single words that might be first names)
            query_lower = user_query.lower()
            # Common patterns: "Ajith stories", "check Ajith", "Ramesh bugs", etc.
            person_name_patterns = [
                r'\b(check|show|find|list|count|who|what)\s+([A-Z][a-z]+)\s+(stories|bugs|tasks|issues|work|tickets)',
                r'\b([A-Z][a-z]+)\'?s?\s+(stories|bugs|tasks|issues|work|tickets|workload)',
                r'(assignee|reporter|assigned to|reported by)\s*=\s*"?([A-Z][a-z]+)',
            ]
            
            potential_names = []
            for pattern in person_name_patterns:
                matches = re.findall(pattern, user_query, re.IGNORECASE)
                for match in matches:
                    if isinstance(match, tuple):
                        # Get the name part (usually the second element)
                        name = match[1] if len(match) > 1 else match[0]
                        if name and name[0].isupper() and len(name) > 2:
                            potential_names.append(name)
                    else:
                        if match and match[0].isupper() and len(match) > 2:
                            potential_names.append(match)
            
            # Also check for standalone capitalized words that might be names
            words = user_query.split()
            for i, word in enumerate(words):
                # Skip if it's a project key (all caps or has numbers)
                if word.isupper() or any(c.isdigit() for c in word):
                    continue
                # Check if it's a capitalized word that might be a name
                if word[0].isupper() and len(word) > 2 and word.lower() not in ['the', 'and', 'for', 'with', 'from', 'that', 'this']:
                    # Check if next word suggests it's a name (stories, bugs, etc.)
                    if i + 1 < len(words):
                        next_word = words[i + 1].lower()
                        if next_word in ['stories', 'bugs', 'tasks', 'issues', 'work', 'tickets', 'workload']:
                            potential_names.append(word)
            
            # Remove duplicates
            potential_names = list(set(potential_names))
            
            # For each potential name, try to resolve it
            resolved_names = {}
            ambiguous_names = {}
            
            for name in potential_names:
                # Skip if it looks like a project key or common word
                if name.upper() in project_keys or name.lower() in ['check', 'show', 'find', 'list', 'count', 'who', 'what']:
                    continue
                
                # Try to find the user
                formatted_name = await self._find_jira_user_by_name(name, detected_project)
                
                if formatted_name:
                    resolved_names[name] = formatted_name
                else:
                    # Multiple matches - search to get the list
                    ldap_users = await self._search_ldap_users(name, limit=5)
                    if len(ldap_users) > 1:
                        ambiguous_names[name] = [u['displayName'] for u in ldap_users]
            
            # If we have ambiguous names, return a confirmation response
            if ambiguous_names:
                confirmation_parts = []
                for name, matches in ambiguous_names.items():
                    confirmation_parts.append(f"I found multiple users matching '{name}':\n")
                    for i, match in enumerate(matches[:5], 1):
                        confirmation_parts.append(f"{i}. {match}")
                    confirmation_parts.append(f"\nPlease specify which user you meant, for example: '{matches[0]}' or '{matches[1]}'")
                
                return {
                    "jql": "",
                    "response": "\n".join(confirmation_parts),
                    "data": [],
                    "intent": "user_confirmation",
                    "success": False,
                    "source": "user_lookup",
                    "ambiguous_users": ambiguous_names
                }
            
            # Replace names in query with resolved formatted names
            enhanced_query = user_query
            for original_name, formatted_name in resolved_names.items():
                # Replace the name in the query (case-insensitive)
                enhanced_query = re.sub(
                    r'\b' + re.escape(original_name) + r'\b',
                    formatted_name,
                    enhanced_query,
                    flags=re.IGNORECASE
                )
                logger.info(f"Resolved name '{original_name}' -> '{formatted_name}' in query")
            
            # Step 2: Understand the query and generate JQL
            # Enhance query with context for follow-up questions
            enhanced_query = await self._enhance_query_with_context(enhanced_query)
            query_analysis = await self._analyze_query(enhanced_query)
            
            # Step 2: Execute JQL(s) - handle both single and multiple queries
            if isinstance(query_analysis["jql"], list):
                # Comparison query - execute multiple JQLs
                all_results = []
                jql_list = query_analysis["jql"]
                
                for i, jql in enumerate(jql_list):
                    try:
                        jql_result = await self._execute_jql(jql, query_analysis.get("intent"))
                        # Handle both old format (list) and new format (dict with results)
                        if isinstance(jql_result, dict) and 'results' in jql_result:
                            results = jql_result['results']
                            total_count = jql_result.get('total_count', len(results))
                        else:
                            results = jql_result if isinstance(jql_result, list) else []
                            total_count = len(results)
                        
                        all_results.append({
                            "entity": query_analysis.get("entities", {}).get(f"entity{i+1}", f"Entity {i+1}"),
                            "jql": jql,
                            "results": results,
                            "count": total_count,
                            "retrieved_count": jql_result.get('retrieved_count', len(results)) if isinstance(jql_result, dict) else len(results)
                        })
                    except Exception as e:
                        logger.warning(f"Failed to execute JQL {i+1}: {jql}, error: {e}")
                        all_results.append({
                            "entity": query_analysis.get("entities", {}).get(f"entity{i+1}", f"Entity {i+1}"),
                            "jql": jql,
                            "results": [],
                            "count": 0,
                            "retrieved_count": 0,
                            "error": str(e)
                        })
                
                # Step 3: Generate comparison response
                response = await self._generate_comparison_response(user_query, query_analysis, all_results)
                
                # Step 4: Add to context
                combined_jql = " | ".join(jql_list)
                flat_results = []
                for result_set in all_results:
                    flat_results.extend(result_set["results"])
                self.add_context(user_query, combined_jql, flat_results, response, query_analysis, self.last_query_context)
                
                return {
                    "jql": combined_jql,
                    "response": response,
                    "data": all_results,
                    "intent": query_analysis["intent"],
                    "success": True,
                    "comparison_data": all_results
                }
            else:
                # Single query - original flow
                jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"))
                # Handle both old format (list) and new format (dict with results)
                if isinstance(jql_result, dict) and 'results' in jql_result:
                    results = jql_result['results']
                    total_count = jql_result.get('total_count', len(results))
                    is_count_only = jql_result.get('is_count_only', False)
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    total_count = len(results)
                    is_count_only = False

                if is_count_only:
                    entities = query_analysis.get('entities', {})
                    project_ref = entities.get('project') or entities.get('project_key')
                    issue_type = entities.get('issue_type')

                    issue_label = (issue_type or 'issue').strip()
                    if issue_label and not issue_label.lower().endswith('s') and total_count != 1:
                        issue_label = f"{issue_label}s"

                    if project_ref:
                        project_text = f"the {project_ref} project"
                    else:
                        project_text = "the selected scope"

                    response = (
                        f"There {'is' if total_count == 1 else 'are'} {total_count} "
                        f"{issue_label.lower()} in {project_text}."
                    )

                    self.add_context(user_query, query_analysis["jql"], [], response, query_analysis, self.last_query_context)

                    return {
                        "jql": query_analysis["jql"],
                        "response": response,
                        "data": [],
                        "intent": query_analysis["intent"],
                        "success": True,
                        "total_count": total_count,
                        "count_only": True,
                        "type": "summary"
                    }
            
            # Step 3: Generate intelligent response
            retrieved_count = jql_result.get('retrieved_count') if isinstance(jql_result, dict) else None
            response = await self._generate_response(
                user_query, 
                query_analysis, 
                results, 
                total_count, 
                retrieved_count,
                unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                integrations=getattr(self, '_current_integrations', None)
            )
            
            # Step 4: Add to context
            # Extract content if response is dict
            response_content = response.get('content', str(response)) if isinstance(response, dict) else str(response)
            self.add_context(user_query, query_analysis["jql"], results, response_content, query_analysis, self.last_query_context)
            
            return {
                "jql": query_analysis["jql"],
                "response": response,
                "data": results,
                "intent": query_analysis["intent"],
                "success": True
            }
            
        except Exception as e:
            logger.error(f"AI processing error: {e}")
            return await self._fallback_processing(user_query)
    
    async def _process_auto_source_query(self, user_query: str, unified_rag_handler = None) -> Dict[str, Any]:
        """
        Smart auto mode: AI classifies query and routes to best source.
        If uncertain, searches both and returns best match.
        """
        logger.info("=" * 80)
        logger.info("🚀 WORKBUDDY QUERY ROUTING")
        logger.info("=" * 80)
        logger.info(f"📝 User Query: '{user_query}'")
        logger.info("🔀 Mode: Auto (intelligent routing)")
        
        # Use AI to classify the query
        query_classification = await self._classify_query_intent(user_query)
        
        logger.info("=" * 80)
        logger.info("📍 ROUTING DECISION")
        logger.info("=" * 80)
        logger.info(f"   → Classification: {query_classification.upper()}")
        
        # If clearly Jira, Confluence, or GitHub, route directly
        if query_classification == "jira":
            logger.info("   → Target: JIRA")
            logger.info("   → Action: Routing to Jira query processor")
            logger.info("   → Approach: Direct JQL generation and execution")
            logger.info("=" * 80)
            return await self._process_jira_query_direct(user_query)
        elif query_classification == "confluence":
            logger.info("   → Target: CONFLUENCE")
            logger.info("   → Action: Routing to Confluence query processor")
            logger.info("   → Approach: Vector search (RAG) with Databricks Vector Search")
            if not self.confluence_client:
                logger.warning("   ⚠️ Confluence client not configured")
                logger.info("   → Fallback: Routing to Jira (Confluence unavailable)")
                logger.info("=" * 80)
                return await self._process_jira_query_direct(user_query)
            logger.info("   → Confluence client: Available")
            logger.info("=" * 80)
            confluence_result = await self._process_confluence_query(user_query)
            if confluence_result.get('data'):
                logger.info("   ✅ Confluence results found, returning results")
                return confluence_result
            logger.warning("   ⚠️ No Confluence results found")
            logger.info("   → Fallback: Routing to Jira (no Confluence results)")
            logger.info("=" * 80)
            return await self._process_jira_query_direct(user_query)
        elif query_classification == "github":
            logger.info("   → Target: GITHUB")
            logger.info("   → Action: Routing to GitHub query processor")
            logger.info("   → Approach: GitHub API search with semantic search (RAG) fallback")
            if not self.github_client:
                logger.warning("   ⚠️ GitHub client not configured")
                logger.info("   → Fallback: Routing to Jira (GitHub unavailable)")
                logger.info("=" * 80)
                return await self._process_jira_query_direct(user_query)
            logger.info("   → GitHub client: Available")
            logger.info("=" * 80)
            github_result = await self._process_github_query(user_query)
            if github_result and github_result.get('success'):
                logger.info("   ✅ GitHub results found, returning results")
                return github_result
            logger.warning("   ⚠️ GitHub processing returned empty or failed")
            logger.info("   → Fallback: Routing to Jira (no GitHub results)")
            logger.info("=" * 80)
            return await self._process_jira_query_direct(user_query)
        elif query_classification == "general_knowledge":
            logger.info("   → Target: GENERAL_KNOWLEDGE")
            logger.info("   → Action: Routing to web search processor")
            logger.info("   → Approach: Web search with AI summarization")
            logger.info("=" * 80)
            return await self._process_web_search_query(user_query)
        else:
            # Uncertain classification - search both sources
            logger.warning("   ⚠️ Uncertain classification")
            logger.info("   → Action: Dual-source search (Jira + Confluence)")
            logger.info("   → Approach: Parallel search, return best match")
            logger.info("=" * 80)
            return await self._process_dual_source_query(user_query)
    
    async def _process_jira_query_direct(self, user_query: str) -> Dict[str, Any]:
        """Process query as Jira query (extracted from main flow)"""
        try:
            # Step 1: Check if this is a ticket key query - skip name detection for those
            ticket_key_pattern = r'\b[A-Z][A-Z0-9]+-\d+\b'
            if re.search(ticket_key_pattern, user_query):
                logger.info(f"🔍 Query is a ticket key, skipping name detection: '{user_query}'")
                # Skip name detection for ticket keys
                enhanced_query = await self._enhance_query_with_context(user_query)
                query_analysis = await self._analyze_query(enhanced_query)
                jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"), original_query=user_query)
                
                if isinstance(jql_result, dict) and 'results' in jql_result:
                    results = jql_result['results']
                    is_count_only = jql_result.get('is_count_only', False)
                    total_count = jql_result.get('total_count', len(results))
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    is_count_only = False
                    total_count = len(results)
                
                if results or is_count_only:
                    response = await self._generate_text_response(
                        user_query, 
                        results, 
                        query_analysis, 
                        total_count=total_count,
                        unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                        integrations=getattr(self, '_current_integrations', None),
                        theme=getattr(self, '_current_theme', None)
                    )
                    return {
                        "jql": query_analysis["jql"],
                        "response": response,
                        "data": results,
                        "intent": query_analysis.get("intent"),
                        "success": True,
                        "source": "jira",
                        "is_count_only": is_count_only,
                        "total_count": total_count
                    }
                else:
                    return {
                        "jql": query_analysis["jql"],
                        "response": f"No Jira issues found for '{user_query}'",
                        "data": [],
                        "intent": query_analysis.get("intent"),
                        "success": False,
                        "source": "jira"
                    }
            
            # Step 2: Check for person names in query and resolve them via LDAP/Jira
            # Only do this if the query might contain person names
            logger.info(f"🔍 Checking for person names in query: '{user_query}'")
            
            # Get project keys for filtering
            project_keys = []
            detected_project = None
            if self.jira_client:
                try:
                    projects = await self.jira_client.get_projects()
                    project_keys = [p.get('key', '') for p in projects]
                    # Try to detect project from query
                    query_upper = user_query.upper()
                    for project_key in project_keys:
                        if project_key in query_upper:
                            detected_project = project_key
                            break
                except Exception as e:
                    logger.warning(f"Failed to get projects: {e}")
            
            # Extract potential person names
            query_lower = user_query.lower()
            potential_names = []  # Initialize the list
            
            # FIRST: Check for comma-separated names (CDK format like "Ramesh,Ajith" or "Ramesh, Ajith")
            # Pattern to match: "show Ramesh,Ajith tickets" or "Ramesh, Ajith tickets"
            comma_name_pattern = r'\b([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)+)\b'
            comma_matches = re.findall(comma_name_pattern, user_query)
            for match in comma_matches:
                # Normalize to ensure space after comma: "Ramesh,Ajith" -> "Ramesh, Ajith"
                normalized_name = re.sub(r',\s*', ', ', match.strip())
                potential_names.append(normalized_name)
                logger.info(f"✅ Detected comma-separated name (CDK format): '{match}' -> '{normalized_name}'")
            
            # Remove comma-separated names from query to avoid double detection
            query_without_comma_names = user_query
            for comma_name in comma_matches:
                query_without_comma_names = query_without_comma_names.replace(comma_name, " ", 1)
            
            person_name_patterns = [
                r'\b(check|show|find|list|count|who|what)\s+([A-Z][a-z]+)\s+(stories|bugs|tasks|issues|work|tickets)',
                r'\b([A-Z][a-z]+)\'?s?\s+(stories|bugs|tasks|issues|work|tickets|workload)',
                r'(assignee|reporter|assigned to|reported by)\s*=\s*"?([A-Z][a-z]+)',
                # Pattern for "Show Ajith reported bugs" or "Ajith reported bugs"
                r'\b([A-Z][a-z]+)\s+(reported|assigned|created|updated|working on)',
                # Pattern for "bugs reported by Ajith" or "stories assigned to Ajith"
                r'(reported by|assigned to|created by|updated by)\s+([A-Z][a-z]+)',
            ]
            
            # Only process patterns on query without comma names to avoid duplicates
            for pattern in person_name_patterns:
                matches = re.findall(pattern, query_without_comma_names, re.IGNORECASE)
                for match in matches:
                    if isinstance(match, tuple):
                        # Get the name part (could be first or second element depending on pattern)
                        if len(match) >= 2:
                            # Check which element is likely the name (capitalized word)
                            for elem in match:
                                if isinstance(elem, str) and elem and elem[0].isupper() and len(elem) > 2:
                                    if elem.lower() not in ['reported', 'assigned', 'created', 'updated', 'working', 'show', 'check', 'find', 'list', 'count', 'who', 'what']:
                                        potential_names.append(elem)
                        else:
                            name = match[0] if match else None
                            if name and name[0].isupper() and len(name) > 2:
                                potential_names.append(name)
                    else:
                        if match and match[0].isupper() and len(match) > 2:
                            potential_names.append(match)
            
            # Also check for standalone capitalized words that might be names (only in query without comma names)
            words = query_without_comma_names.split()
            for i, word in enumerate(words):
                if word.isupper() or any(c.isdigit() for c in word):
                    continue
                if word[0].isupper() and len(word) > 2 and word.lower() not in ['the', 'and', 'for', 'with', 'from', 'that', 'this', 'check', 'show', 'find', 'list', 'count', 'who', 'what', 'reported', 'assigned', 'created', 'updated', 'last', 'month', 'week']:
                    # Check if next word suggests it's a name
                    if i + 1 < len(words):
                        next_word = words[i + 1].lower()
                        if next_word in ['stories', 'bugs', 'tasks', 'issues', 'work', 'tickets', 'workload', 'reported', 'assigned', 'created', 'updated']:
                            potential_names.append(word)
                    # Also check if previous word suggests it's a name
                    if i > 0:
                        prev_word = words[i - 1].lower()
                        if prev_word in ['show', 'check', 'find', 'list', 'count', 'who', 'what', 'by', 'to']:
                            potential_names.append(word)
            
            potential_names = list(set(potential_names))
            logger.info(f"🔍 Potential names found: {potential_names}")
            
            # If no potential names found, skip name resolution and proceed directly
            if not potential_names:
                logger.info("🔍 No person names detected in query, proceeding without name lookup")
                enhanced_query = await self._enhance_query_with_context(user_query)
                query_analysis = await self._analyze_query(enhanced_query)
                jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"), original_query=user_query)
                
                if isinstance(jql_result, dict) and 'results' in jql_result:
                    results = jql_result['results']
                    is_count_only = jql_result.get('is_count_only', False)
                    total_count = jql_result.get('total_count', len(results))
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    is_count_only = False
                    total_count = len(results)
                
                if results or is_count_only:
                    response = await self._generate_text_response(
                        user_query, 
                        results, 
                        query_analysis, 
                        total_count=total_count,
                        unified_rag_handler=getattr(self, '_current_unified_rag_handler', None),
                        integrations=getattr(self, '_current_integrations', None),
                        theme=getattr(self, '_current_theme', None)
                    )
                    return {
                        "jql": query_analysis["jql"],
                        "response": response,
                        "data": results,
                        "intent": query_analysis.get("intent"),
                        "success": True,
                        "source": "jira",
                        "is_count_only": is_count_only,
                        "total_count": total_count
                    }
                else:
                    return {
                        "jql": query_analysis["jql"],
                        "response": f"No Jira issues found for '{user_query}'",
                        "data": [],
                        "intent": query_analysis.get("intent"),
                        "success": False,
                        "source": "jira"
                    }
            
            # Resolve names via LDAP/Jira lookup (only if we found potential names)
            resolved_names = {}
            ambiguous_names = {}
            
            for name in potential_names:
                # Skip if it looks like a project key or common word
                if name.upper() in project_keys or name.lower() in ['check', 'show', 'find', 'list', 'count', 'who', 'what']:
                    continue
                
                logger.info(f"🔍 Looking up user: '{name}'")
                formatted_name = await self._find_jira_user_by_name(name, detected_project)
                
                if formatted_name:
                    resolved_names[name] = formatted_name
                    logger.info(f"✅ Resolved '{name}' -> '{formatted_name}'")
                else:
                    # Multiple matches - search to get the list
                    ldap_users = await self._search_ldap_users(name, limit=5)
                    if len(ldap_users) > 1:
                        ambiguous_names[name] = [u['displayName'] for u in ldap_users]
                        logger.info(f"⚠️ Multiple matches for '{name}': {ambiguous_names[name]}")
            
            # If we have ambiguous names, return a confirmation response
            if ambiguous_names:
                confirmation_parts = []
                for name, matches in ambiguous_names.items():
                    confirmation_parts.append(f"I found multiple users matching '{name}':\n")
                    for i, match in enumerate(matches[:5], 1):
                        confirmation_parts.append(f"{i}. {match}")
                    confirmation_parts.append(f"\nPlease specify which user you meant, for example: '{matches[0]}' or '{matches[1]}'")
                
                return {
                    "jql": "",
                    "response": "\n".join(confirmation_parts),
                    "data": [],
                    "intent": "user_confirmation",
                    "success": False,
                    "source": "user_lookup",
                    "ambiguous_users": ambiguous_names
                }
            
            # Replace names in query with resolved formatted names
            # IMPORTANT: Process comma-separated names first to avoid splitting them
            enhanced_query = user_query
            # Sort by length (longest first) to handle comma-separated names before individual parts
            sorted_names = sorted(resolved_names.items(), key=lambda x: len(x[0]), reverse=True)
            
            for original_name, formatted_name in sorted_names:
                # For comma-separated names, use a more flexible pattern that handles commas
                if ',' in original_name:
                    # Match the comma-separated name with optional spaces around comma
                    pattern = re.escape(original_name).replace(',', r'\s*,\s*')
                    enhanced_query = re.sub(
                        pattern,
                        formatted_name,
                        enhanced_query,
                        flags=re.IGNORECASE
                    )
                else:
                    # For single names, use word boundaries but check it's not part of a comma-separated name
                    # Only replace if it's not immediately followed by a comma (part of comma-separated name)
                    pattern = r'\b' + re.escape(original_name) + r'\b(?!\s*,)'
                    enhanced_query = re.sub(
                        pattern,
                        formatted_name,
                        enhanced_query,
                        flags=re.IGNORECASE
                    )
                logger.info(f"✅ Replaced '{original_name}' with '{formatted_name}' in query")
            
            # Step 2: Enhance query with context and analyze
            enhanced_query = await self._enhance_query_with_context(enhanced_query)
            query_analysis = await self._analyze_query(enhanced_query)
            
            # Step 3: Execute JQL (name normalization will happen in _execute_jql via _normalize_assignee_jql)
            jql_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"), original_query=user_query)
            
            # Check if this is a user confirmation response (multiple user matches)
            if isinstance(jql_result, dict) and jql_result.get("intent") == "user_confirmation":
                logger.info("✅ Returning user confirmation response from _execute_jql")
                # Update the pending confirmation with the original query if not already set
                if self.pending_user_confirmation and not self.pending_user_confirmation.get('original_query'):
                    self.pending_user_confirmation['original_query'] = user_query
                return jql_result
            
            if isinstance(jql_result, dict) and 'results' in jql_result:
                results = jql_result['results']
                is_count_only = jql_result.get('is_count_only', False)
                total_count = jql_result.get('total_count', len(results))
            else:
                results = jql_result if isinstance(jql_result, list) else []
                is_count_only = False
                total_count = len(results)
            
            if results or is_count_only:
                response = await self._generate_text_response(user_query, results, query_analysis, total_count=total_count)
                return {
                    "jql": query_analysis["jql"],
                    "response": response,
                    "data": results,
                    "intent": query_analysis.get("intent"),
                    "success": True,
                    "source": "jira",
                    "is_count_only": is_count_only,
                    "total_count": total_count
                }
            else:
                # Zero results — AI planner retry with alternative JQL queries
                _jira_ai_plan = await self._ai_plan_search(user_query)
                if _jira_ai_plan and len(_jira_ai_plan.get("jql_queries", [])) > 1:
                    for _alt_jql in _jira_ai_plan["jql_queries"][1:]:
                        logger.info(f"[AIPlanner] Jira retry JQL: {_alt_jql}")
                        try:
                            _alt_jql_result = await self._execute_jql(
                                _alt_jql, query_analysis.get("intent"), original_query=user_query
                            )
                            if isinstance(_alt_jql_result, dict) and _alt_jql_result.get('results'):
                                _alt_results = _alt_jql_result['results']
                                _alt_count = _alt_jql_result.get('total_count', len(_alt_results))
                                _alt_count_only = _alt_jql_result.get('is_count_only', False)
                                _alt_response = await self._generate_text_response(
                                    user_query, _alt_results, query_analysis, total_count=_alt_count
                                )
                                logger.info(f"[AIPlanner] Jira retry succeeded: {len(_alt_results)} results")
                                return {
                                    "jql": _alt_jql,
                                    "response": _alt_response,
                                    "data": _alt_results,
                                    "intent": query_analysis.get("intent"),
                                    "success": True,
                                    "source": "jira",
                                    "is_count_only": _alt_count_only,
                                    "total_count": _alt_count
                                }
                        except Exception as _je:
                            logger.warning(f"[AIPlanner] Jira retry JQL failed: {_je}")
                return {
                    "jql": query_analysis["jql"],
                    "response": f"No Jira issues found for '{user_query}'",
                    "data": [],
                    "intent": query_analysis.get("intent"),
                    "success": False,
                    "source": "jira"
                }
        except Exception as e:
            logger.error(f"Jira query processing failed: {e}")
            return {
                "response": f"Error processing Jira query: {str(e)}",
                "data": [],
                "success": False,
                "source": "jira_error"
            }

    async def _process_github_query(self, user_query: str) -> Dict[str, Any]:
        """Process GitHub-oriented questions (e.g., Actions runs, PRs)."""
        logger.info("=" * 80)
        logger.info("🐙 GITHUB QUERY PROCESSING")
        logger.info("=" * 80)
        logger.info(f"📝 Query: '{user_query}'")
        
        if not self.github_client:
            logger.warning("   ⚠️ GitHub client not configured")
            logger.info("=" * 80)
            return {
                "response": "GitHub is not configured. Please connect GitHub in settings.",
                "data": [],
                "intent": "github",
                "success": False,
                "source": "github"
            }

        logger.info("🔍 Step 1: Extracting repository and time window from query...")
        repo, days = self._extract_github_repo_and_days(user_query)
        logger.info(f"   → Extracted repo: {repo or 'None'}")
        logger.info(f"   → Extracted days: {days}")
        
        if not repo:
            logger.warning("   ⚠️ Could not identify repository from query")
            logger.info("=" * 80)
            return {
                "response": "I couldn't identify which repository to use. Please specify the repo (e.g., 'cdk-prod/intelligence-suite-ui-quality').",
                "data": [],
                "intent": "github",
                "success": False,
                "source": "github"
            }

        try:
            logger.info("🔍 Step 2: Determining query type...")
            query_lower = user_query.lower()
            
            # Check if this is a search query (issues/PRs) vs workflow runs query
            is_search_query = any(term in query_lower for term in ['issue', 'pr', 'pull request', 'search', 'find', 'show'])
            is_workflow_query = any(term in query_lower for term in ['workflow', 'action', 'ci', 'build', 'run', 'pipeline'])
            
            if is_search_query:
                logger.info("   → Query Type: Issue/PR Search")
                logger.info("   → Approach: Semantic search (RAG) with GitHub API fallback")
                logger.info("   → Step 3a: Attempting semantic search using GitHub RAG handler...")
                try:
                    from services.github_rag_handler import get_github_rag_handler
                    rag_handler = get_github_rag_handler()
                    if rag_handler:
                        logger.info("   → GitHub RAG handler available, using semantic search")
                        # Fetch recent issues/PRs for semantic search
                        search_query = f"org:{self.github_client.config.org} sort:updated-desc"
                        recent_data = await self.github_client._get("/search/issues", {"q": search_query, "per_page": 100})
                        recent_issues = recent_data.get("items", [])
                        
                        if recent_issues:
                            logger.info(f"   → Found {len(recent_issues)} recent issues/PRs for semantic search")
                            similar = await rag_handler.find_similar_issues(query=user_query, issues=recent_issues, top_k=10)
                            if similar:
                                logger.info(f"   ✅ Found {len(similar)} similar issues using semantic search")
                                logger.info("=" * 80)
                                return {
                                    "response": f"Found {len(similar)} similar GitHub issues/PRs matching your query.",
                                    "data": similar,
                                    "intent": "github_search",
                                    "success": True,
                                    "source": "github",
                                    "using_semantic": True
                                }
                            else:
                                logger.info("   → Semantic search returned no results, falling back to API search")
                        else:
                            logger.info("   → No recent issues found, falling back to API search")
                    else:
                        logger.info("   → GitHub RAG handler not available, using API search")
                except Exception as rag_err:
                    logger.warning(f"   ⚠️ Semantic search failed: {rag_err}, falling back to API search")
                
                # Fallback to GitHub API keyword search
                logger.info("   → Step 3b: Using GitHub API keyword search...")
                search_query = f"org:{self.github_client.config.org} {user_query}"
                search_data = await self.github_client._get("/search/issues", {"q": search_query, "per_page": 10})
                issues = search_data.get("items", [])
                logger.info(f"   ✅ Found {len(issues)} issues using API search")
                logger.info("=" * 80)
                return {
                    "response": f"Found {len(issues)} GitHub issues/PRs matching your query.",
                    "data": issues,
                    "intent": "github_search",
                    "success": True,
                    "source": "github",
                    "using_semantic": False
                }
            elif is_workflow_query:
                logger.info("   → Query Type: Workflow/Actions Query")
                logger.info("   → Approach: GitHub Actions API")
                logger.info("   → Step 3: Fetching workflow runs...")
                result = await self.github_client.get_workflow_runs(repo, days)
                total = result.get("total_runs", 0)
                successful = result.get("successful", 0)
                success_rate = result.get("success_rate", 0)
                logger.info(f"   ✅ Retrieved workflow runs: {successful}/{total} successful ({success_rate:.1f}%)")
                logger.info("=" * 80)
                response = (
                    f"GitHub Actions runs for {repo} in the last {days} days: "
                    f"{successful}/{total} succeeded ({success_rate:.1f}% success rate)."
                )
                return {
                    "response": response,
                    "data": result,
                    "intent": "github_actions",
                    "success": True,
                    "source": "github"
                }
            else:
                # Default to workflow runs if unclear
                logger.info("   → Query Type: Unclear, defaulting to Workflow Runs")
                logger.info("   → Approach: GitHub Actions API")
                logger.info("   → Step 3: Fetching workflow runs...")
                result = await self.github_client.get_workflow_runs(repo, days)
                total = result.get("total_runs", 0)
                successful = result.get("successful", 0)
                success_rate = result.get("success_rate", 0)
                logger.info(f"   ✅ Retrieved workflow runs: {successful}/{total} successful ({success_rate:.1f}%)")
                logger.info("=" * 80)
                response = (
                    f"GitHub Actions runs for {repo} in the last {days} days: "
                    f"{successful}/{total} succeeded ({success_rate:.1f}% success rate)."
                )
                return {
                    "response": response,
                    "data": result,
                    "intent": "github_actions",
                    "success": True,
                    "source": "github"
                }
        except Exception as e:
            logger.error(f"GitHub processing failed: {e}")
            return {
                "response": f"GitHub query failed: {e}",
                "data": [],
                "intent": "github",
                "success": False,
                "source": "github"
            }

    def _extract_github_repo_and_days(self, user_query: str) -> (Optional[str], int):
        """Heuristic extraction of repo slug and day window from natural language."""
        query_lower = user_query.lower()
        repo: Optional[str] = None
        days = 30

        # Extract from full GitHub URL if present
        url_match = re.search(r'github\.com/([^/\s]+)/([^/\s]+)', query_lower)
        if url_match:
            repo = f"{url_match.group(1)}/{url_match.group(2)}"

        # Extract owner/repo slug
        if not repo:
            owner_repo_match = re.search(r'\b([a-z0-9_.-]+/[a-z0-9_.-]+)\b', query_lower)
            if owner_repo_match:
                repo = owner_repo_match.group(1)

        # If only repo name mentioned, prepend default org
        if not repo:
            if "intelligence-suite-ui-quality" in query_lower:
                repo = "cdk-prod/intelligence-suite-ui-quality"
            else:
                default_repo = os.getenv("GITHUB_DEFAULT_REPO")
                if default_repo:
                    repo = default_repo

        # Days window
        days_match = re.search(r'(last|past)\s+(\d+)\s+days', query_lower)
        if days_match:
            days = int(days_match.group(2))

        return repo, days
    
    async def _process_dual_source_query(self, user_query: str) -> Dict[str, Any]:
        """
        Search BOTH Jira and Confluence, then return the best matching results.
        This provides comprehensive answers by checking both sources.
        """
        logger.info(f"🔍 Dual-source search: Searching both Jira and Confluence for '{user_query}'")
        
        # Search both sources in parallel
        import asyncio
        
        # Create tasks for parallel execution
        tasks = []
        
        # Search Jira
        jira_task = asyncio.create_task(self._process_jira_query_direct(user_query))
        tasks.append(("jira", jira_task))
        
        # Search Confluence (if available)
        if self.confluence_client:
            confluence_task = asyncio.create_task(self._process_confluence_query(user_query))
            tasks.append(("confluence", confluence_task))
        
        # Wait for all tasks to complete
        results = {}
        for source_name, task in tasks:
            try:
                results[source_name] = await task
            except Exception as e:
                logger.error(f"{source_name} search failed: {e}")
                results[source_name] = None
        
        jira_result = results.get("jira")
        confluence_result = results.get("confluence")
        
        # Evaluate which source has better results
        jira_score = self._score_results(jira_result, user_query) if jira_result else 0
        confluence_score = self._score_results(confluence_result, user_query) if confluence_result else 0
        
        logger.info(f"📊 Result scores - Jira: {jira_score:.2f}, Confluence: {confluence_score:.2f}")
        
        # Return the best result, or combine if both are good
        if jira_score > confluence_score and jira_score > 0.3:
            logger.info("✅ Returning Jira results (best match)")
            return jira_result
        elif confluence_score > jira_score and confluence_score > 0.3:
            logger.info("✅ Returning Confluence results (best match)")
            return confluence_result
        elif jira_score > 0 and confluence_score > 0:
            # Both have results - combine them
            logger.info("✅ Combining results from both sources")
            return await self._combine_results(user_query, jira_result, confluence_result)
        elif jira_result and jira_result.get('success'):
            logger.info("✅ Returning Jira results (only source with results)")
            return jira_result
        elif confluence_result and confluence_result.get('data'):
            logger.info("✅ Returning Confluence results (only source with results)")
            return confluence_result
        else:
            # No good results from either
            logger.info("❌ No good results from either source")
            return {
                "response": f"I searched both Jira and Confluence but couldn't find relevant information for '{user_query}'. Try rephrasing your question or be more specific.",
                "data": [],
                "success": False,
                "source": "both",
                "jira_results": jira_result.get('data', []) if jira_result else [],
                "confluence_results": confluence_result.get('data', []) if confluence_result else []
            }
    
    def _score_results(self, result: Dict[str, Any], query: str) -> float:
        """
        Score results based on relevance, quantity, and quality.
        Returns a score between 0 and 1.
        """
        if not result:
            return 0.0
        
        score = 0.0
        
        # Check if result has data
        data = result.get('data', [])
        if isinstance(data, list):
            data_count = len(data)
        else:
            data_count = 1 if data else 0
        
        # Score based on number of results (more is better, up to a point)
        if data_count > 0:
            score += min(data_count / 5.0, 0.4)  # Max 0.4 for quantity
        
        # Score based on success status
        if result.get('success', False):
            score += 0.3
        
        # Score based on total_count (for Jira queries)
        total_count = result.get('total_count', 0)
        if total_count > 0:
            score += min(total_count / 10.0, 0.2)  # Max 0.2 for total count
        
        # Check if response is meaningful (not error messages)
        response = result.get('response', '')
        error_indicators = ['not found', 'no results', 'error', 'failed', 'couldn\'t find']
        if not any(indicator.lower() in response.lower() for indicator in error_indicators):
            score += 0.1
        
        return min(score, 1.0)  # Cap at 1.0
    
    async def _combine_results(self, user_query: str, jira_result: Dict[str, Any], confluence_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Combine results from both Jira and Confluence into a unified response.
        """
        jira_data = jira_result.get('data', []) if jira_result else []
        confluence_data = confluence_result.get('data', []) if confluence_result else []
        
        jira_response = jira_result.get('response', '') if jira_result else ''
        confluence_response = confluence_result.get('response', '') if confluence_result else ''
        
        # Build combined response
        combined_parts = []
        
        # Start with AI-generated summary
        if self.client:
            summary_prompt = f"""The user asked: "{user_query}"

I found results from both Jira (work items) and Confluence (documentation):

Jira Results:
{jira_response[:500] if jira_response else 'No Jira results'}

Confluence Results:
{confluence_response[:500] if confluence_response else 'No Confluence results'}

Provide a brief, unified summary that combines the most relevant information from both sources. Be concise and focus on what directly answers the user's question."""

            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "user", "content": summary_prompt}
                    ],
                    temperature=0.7,
                    max_tokens=500
                )
                combined_parts.append(response.choices[0].message.content.strip())
            except Exception as e:
                logger.error(f"Failed to generate combined summary: {e}")
                combined_parts.append("I found relevant information in both Jira and Confluence:")
        
        # Add source indicators
        if jira_data:
            combined_parts.append(f"\n**From Jira:** {len(jira_data)} work item(s) found")
        if confluence_data:
            combined_parts.append(f"\n**From Confluence:** {len(confluence_data)} document(s) found")
        
        # Combine data (prefer Jira data first, then Confluence)
        combined_data = []
        if jira_data:
            combined_data.extend(jira_data[:3])  # Top 3 from Jira
        if confluence_data:
            combined_data.extend(confluence_data[:2])  # Top 2 from Confluence
        
        return {
            "response": "\n".join(combined_parts),
            "data": combined_data,
            "success": True,
            "source": "both",
            "jira_results": jira_data,
            "confluence_results": confluence_data,
            "jira_count": len(jira_data),
            "confluence_count": len(confluence_data)
        }
    
    def _get_project_mappings(self, project_key: str) -> Dict[str, Any]:
        """Get project-specific Jira field mappings"""
        project_key_upper = project_key.upper() if project_key else None
        mappings = self.PROJECT_JIRA_MAPPINGS.get(project_key_upper, self.PROJECT_JIRA_MAPPINGS.get('default', {}))
        return mappings
    
    def _format_project_mappings_for_prompt(self, project_key: str) -> str:
        """Format project mappings as a string for AI prompt"""
        mappings = self._get_project_mappings(project_key)
        if not mappings:
            return ""
        
        lines = []
        lines.append(f"\nPROJECT-SPECIFIC MAPPINGS FOR {project_key.upper()}:")
        lines.append("")
        
        # Issue Types
        if 'issue_types' in mappings:
            lines.append("Issue Types:")
            for issue_type, description in mappings['issue_types'].items():
                lines.append(f"  - {issue_type}: {description}")
            lines.append("")
        
        # Statuses
        if 'statuses' in mappings:
            lines.append("Status Values:")
            if 'open' in mappings['statuses']:
                lines.append("  Open Statuses: " + ", ".join([f'"{s}"' for s in mappings['statuses']['open']]))
            if 'closed' in mappings['statuses']:
                lines.append("  Closed Statuses: " + ", ".join([f'"{s}"' for s in mappings['statuses']['closed']]))
            lines.append("")
        
        # Test Types
        if 'test_types' in mappings:
            lines.append("Test Type Values (for type = Test):")
            for test_type, description in mappings['test_types'].items():
                lines.append(f"  - \"{test_type}\": {description}")
            lines.append("")
        
        # Test Statuses
        if 'test_statuses' in mappings:
            lines.append("Test Status Values (for \"Test Status\" field):")
            for test_status, description in mappings['test_statuses'].items():
                lines.append(f"  - \"{test_status}\": {description}")
            lines.append("")
        
        return "\n".join(lines)
    
    async def _enhance_query_with_context(self, user_query: str) -> str:
        """
        Enhance query by injecting context from previous questions for follow-up questions.
        
        This method detects if the user is asking a follow-up question and automatically injects:
        1. Ticket keys (e.g., "what's the update on that ticket?")
        2. Project, metric type, and time period (e.g., "what about october month?" after asking about september)
        3. Assignee/person names (e.g., "what about Karthik?" after asking about Ajith)
        4. Issue types (e.g., "what about bugs?" after asking about stories)
        5. Status filters (e.g., "what about closed ones?" after asking about open issues)
        6. Any combination of the above
        """
        query_lower = user_query.lower()
        
        # Follow-up question indicators - comprehensive list
        follow_up_indicators = [
            'what about', 'how about', 'and', 'also', 'what is', "what's", 'tell me', 'show me', 
            'give me', 'for', 'in', 'during', 'that ticket', 'this ticket', 'the ticket', 
            'that issue', 'this issue', 'the issue', 'it', 'its', "it's", 'this one', 'that one',
            'what is the update', 'whats the update', "what's the update", 'who is working on',
            'who reported', 'what is the status', "what's the status", 'what is the priority',
            "what's the priority", 'who is the reporter', 'the reporter', 'the assignee', 
            'the status', 'the priority', 'compare', 'versus', 'vs'
        ]
        
        # Check if this looks like a follow-up question
        is_follow_up = any(indicator in query_lower for indicator in follow_up_indicators)
        
        # Check what's already in the current query
        ticket_pattern = r'\b([A-Z][A-Z0-9]+-\d+)\b'
        has_ticket = re.search(ticket_pattern, user_query)
        
        # Common project keys
        project_keys = ['NDP', 'SSBYOD', 'APITRON', 'RM', 'SER', 'MRDRT', 'EFORMS', 'CCM', 'CES', 'TI']
        has_project = any(word in user_query.upper() for word in project_keys)
        
        # Common issue types
        issue_types = ['bug', 'story', 'task', 'epic', 'defect', 'test']
        has_issue_type = any(word in query_lower for word in issue_types)
        
        # Common status words
        status_words = ['open', 'closed', 'in progress', 'done', 'resolved', 'pending', 'blocked']
        has_status = any(word in query_lower for word in status_words)
        
        # Time references
        time_words = [
            'month', 'week', 'year', 'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december',
            'last week', 'last month', 'this month', 'this week', 'next month', 'today', 'yesterday'
        ]
        has_time = any(word in query_lower for word in time_words)
        
        # Metric keywords
        metric_words = [
            'defect leakage', 'automation', 'coverage', 'bug ratio', 'test story ratio',
            'leakage', 'automation %', 'coverage %', 'test coverage'
        ]
        has_metric = any(word in query_lower for word in metric_words)
        
        # Person/assignee indicators
        assignee_indicators = ['who', 'assignee', 'assigned to', 'working on', 'reporter', 'reported by']
        has_assignee_query = any(word in query_lower for word in assignee_indicators)
        
        if self.conversation_context and is_follow_up:
            # Get the most recent context
            recent_context = self.conversation_context[-1] if self.conversation_context else None
            
            if recent_context:
                enhanced_parts = []
                context_applied = False
                
                # Extract context information
                previous_project = recent_context.get('project')
                previous_metric = recent_context.get('metric_type')
                previous_time_period = recent_context.get('time_period')
                previous_issue_types = recent_context.get('issue_types') or []
                previous_status_filters = recent_context.get('status_filters') or []
                previous_entities = recent_context.get('entities', {})
                previous_assignee = previous_entities.get('assignee') or recent_context.get('assignee')
                previous_issue_type = previous_entities.get('issue_type') or recent_context.get('issue_type')
                previous_status = previous_entities.get('status') or recent_context.get('status')
                previous_query_intent = recent_context.get('query_intent', '')
                
                # If issue_types is a list, use it; otherwise create list from single issue_type
                if previous_issue_type and not previous_issue_types:
                    previous_issue_types = [previous_issue_type]
                if previous_status and not previous_status_filters:
                    previous_status_filters = [previous_status]
                
                # Handle ticket follow-up
                if not has_ticket:
                    # Extract the most recent ticket from conversation history
                    for ctx in reversed(self.conversation_context[-5:]):  # Check last 5 interactions
                        query = ctx.get('user_query', '')
                        jql = ctx.get('jql', '')
                        response = ctx.get('response', '')
                        
                        # Look for ticket keys in all fields
                        all_text = f"{query} {jql} {response}"
                        tickets = re.findall(ticket_pattern, all_text)
                        
                        if tickets:
                            recent_ticket = tickets[0]
                            logger.info(f"🎯 Detected ticket follow-up. Injecting ticket: {recent_ticket}")
                            enhanced = f"{recent_ticket} {user_query}"
                            return enhanced
                
                # Handle project follow-up (e.g., "what about SSBYOD?" after asking about NDP)
                if not has_project and previous_project:
                    enhanced_parts.append(previous_project)
                    context_applied = True
                    logger.info(f"🎯 Injecting project context: {previous_project}")
                
                # Handle metric follow-up (e.g., "what about automation?" after asking about defect leakage)
                if not has_metric and previous_metric:
                    if previous_metric == 'defect_leakage':
                        enhanced_parts.append('defect leakage')
                    elif previous_metric == 'automation':
                        enhanced_parts.append('automation percentage')
                    elif previous_metric == 'test_coverage':
                        enhanced_parts.append('test coverage')
                    elif previous_metric == 'regression_automation':
                        enhanced_parts.append('regression automation')
                    elif previous_metric == 'bug_ratio':
                        enhanced_parts.append('bug ratio')
                    elif previous_metric == 'test_story_ratio':
                        enhanced_parts.append('test story ratio')
                    context_applied = True
                    logger.info(f"🎯 Injecting metric context: {previous_metric}")
                
                # Handle issue type follow-up (e.g., "what about bugs?" after asking about stories)
                if not has_issue_type and previous_issue_types:
                    # Add the issue types from previous context
                    for issue_type in previous_issue_types:
                        if issue_type.lower() not in query_lower:
                            enhanced_parts.append(issue_type.lower())
                            context_applied = True
                            logger.info(f"🎯 Injecting issue type context: {issue_type}")
                
                # Handle status follow-up (e.g., "what about closed ones?" after asking about open)
                if not has_status and previous_status_filters:
                    # Add status filters from previous context
                    for status_filter in previous_status_filters:
                        if status_filter.lower() not in query_lower:
                            enhanced_parts.append(status_filter.lower())
                            context_applied = True
                            logger.info(f"🎯 Injecting status context: {status_filter}")
                
                # Handle assignee follow-up (e.g., "what about Karthik?" after asking about Ajith)
                if previous_assignee and previous_assignee.lower() not in query_lower:
                    # Check if current query is asking about someone else
                    # If it mentions a name or "who", inject previous assignee context for comparison
                    if has_assignee_query or any(word in query_lower for word in ['about', 'for', 'of']):
                        # Don't inject if query already has a specific name
                        # This is handled by the query analysis itself
                        pass
                
                # Handle time period follow-up (e.g., "what about October?" after asking about September)
                if has_time and previous_time_period and previous_project:
                    # Time period is already in the query, but we need to ensure project/metric context
                    if previous_project and not has_project:
                        enhanced_parts.insert(0, previous_project)
                        context_applied = True
                    if previous_metric and not has_metric:
                        if previous_metric == 'defect_leakage':
                            enhanced_parts.insert(0, 'defect leakage')
                        elif previous_metric == 'automation':
                            enhanced_parts.insert(0, 'automation')
                        elif previous_metric == 'test_coverage':
                            enhanced_parts.insert(0, 'test coverage')
                        context_applied = True
                
                # If we applied any context, build the enhanced query
                if context_applied:
                    enhanced_parts.append(user_query)
                    enhanced = " ".join(enhanced_parts)
                    logger.info(f"🎯 Enhanced query with context: '{enhanced}' (from: project={previous_project}, metric={previous_metric}, time={previous_time_period}, issue_types={previous_issue_types}, status={previous_status_filters})")
                    return enhanced
                
                # Special case: Very short follow-up questions that need full context
                # e.g., "what about october?" after "defect leakage for september in NDP"
                if len(user_query.split()) <= 4 and (has_time or has_project or has_issue_type):
                    # Try to inject all relevant context
                    context_parts = []
                    if previous_project and not has_project:
                        context_parts.append(previous_project)
                    if previous_metric and not has_metric:
                        if previous_metric == 'defect_leakage':
                            context_parts.append('defect leakage')
                        elif previous_metric == 'automation':
                            context_parts.append('automation')
                        elif previous_metric == 'test_coverage':
                            context_parts.append('test coverage')
                    if previous_issue_types and not has_issue_type:
                        context_parts.extend([it.lower() for it in previous_issue_types])
                    
                    if context_parts:
                        context_parts.append(user_query)
                        enhanced = " ".join(context_parts)
                        logger.info(f"🎯 Enhanced short follow-up query: '{enhanced}'")
                        return enhanced
        
        # Return original query if not a follow-up or context not available
        return user_query
    
    async def _analyze_query(self, user_query: str) -> Dict[str, Any]:
        """Use OpenAI to understand the query and generate appropriate JQL"""
        
        # Check if jira_client is available
        if not self.jira_client:
            logger.warning("Jira client not available for AI analysis")
            return await self._fallback_processing(user_query)
        
        # Get available projects and assignees for context
        try:
            projects = await self.jira_client.get_projects()
            project_keys = [p.get('key', '') for p in projects]
        except Exception as e:
            logger.warning(f"Failed to get projects for AI analysis: {e}")
            project_keys = []
        
        # Get recent conversation context with ticket key extraction
        context_str = ""
        extracted_tickets = []
        if self.conversation_context:
            recent_context = self.conversation_context[-3:]  # Last 3 interactions
            context_lines = []
            for ctx in recent_context:
                # Extract ticket keys from user query, JQL, and response
                query = ctx.get('user_query', '')
                jql = ctx.get('jql', '')
                response = ctx.get('response', '')
                
                # Find all ticket keys (e.g., CCM-283, NDP-20541)
                ticket_pattern = r'\b([A-Z][A-Z0-9]+-\d+)\b'
                tickets_in_query = re.findall(ticket_pattern, query)
                tickets_in_jql = re.findall(ticket_pattern, jql)
                tickets_in_response = re.findall(ticket_pattern, response)
                
                # Combine all found tickets
                all_tickets = list(set(tickets_in_query + tickets_in_jql + tickets_in_response))
                extracted_tickets.extend(all_tickets)
                
                context_lines.append(f"Previous Q: '{query}' | JQL: {jql} | Tickets: {', '.join(all_tickets) if all_tickets else 'None'}")
            
            context_str = "\n".join(context_lines)
            
            # Add explicit ticket reference section if tickets were found
            if extracted_tickets:
                unique_tickets = list(set(extracted_tickets))
                context_str += f"\n\nRecently discussed tickets: {', '.join(unique_tickets)}"
        
        # Enhance prompt with AI understanding if available
        understanding_context = ""
        detected_project = None
        if self.last_query_context:
            understanding = self.last_query_context
            detected_project = understanding.get('project')
            understanding_context = f"""
AI Query Understanding (use this to generate better JQL):
- Project: {understanding.get('project', 'not specified')}
- Time Period: {understanding.get('time_range', {}).get('start', 'N/A')} to {understanding.get('time_range', {}).get('end', 'N/A')}
- Issue Types: {understanding.get('issue_types', 'not specified')}
- Status Filters: {understanding.get('status_filters', 'not specified')}
- Query Intent: {understanding.get('query_intent', 'not specified')}
- AI Reasoning: {understanding.get('ai_reasoning', 'not specified')}
"""
        
        # Try to detect project from query if not in understanding
        if not detected_project:
            query_upper = user_query.upper()
            for project_key in project_keys:
                if project_key in query_upper:
                    detected_project = project_key
                    break
        
        # Get project-specific mappings
        project_mappings = ""
        if detected_project:
            project_mappings = self._format_project_mappings_for_prompt(detected_project)
        
        system_prompt = f"""You are an expert Jira JQL generator and query analyst. 

Available Jira Projects: {', '.join(project_keys)}

Your task is to:
1. Understand the user's natural language query
2. Generate appropriate JQL syntax
3. Identify the query intent and type
4. **CRITICAL**: Extract ticket references from conversation context for follow-up questions
5. **USE AI UNDERSTANDING**: If provided below, use the AI understanding to generate more accurate JQL

Recent conversation context:
{context_str}
{understanding_context}

FOLLOW-UP QUESTION HANDLING (HIGHEST PRIORITY):
When the current query contains contextual references like:
- "that ticket", "this ticket", "the ticket", "it", "this issue", "that issue"
- "what's the update", "who is working on it", "what's the status", "who reported it"
- "tell me more", "what about", "and that one"

YOU MUST:
1. FIRST: Extract the ticket key (e.g., CCM-283, NDP-20541) from the Recent conversation context above
2. SECOND: Generate JQL using that extracted ticket key: issue = "EXTRACTED-KEY"
3. THIRD: Set the intent based on what the user is asking about (status, reporter, assignee, etc.)

Examples of follow-up questions:
- User previously asked: "tell me about NDP-20541"
  User now asks: "what is the update on that ticket?"
  -> Extract "NDP-20541" from context -> Generate: issue = "NDP-20541", intent: "status_details"

- User previously asked: "show me CCM-283"
  User now asks: "who is the reporter?"
  -> Extract "CCM-283" from context -> Generate: issue = "CCM-283", intent: "reporter_details"

- User previously asked: "details about TI-456"
  User now asks: "what's the priority?"
  -> Extract "TI-456" from context -> Generate: issue = "TI-456", intent: "priority_details"

Rules for JQL generation:
- Use exact project keys: {', '.join(project_keys)}
- For assignee queries, use displayName in quotes: assignee = "John Doe"
- **CRITICAL - Comma-separated names**: If a name contains a comma (e.g., "Ramesh,Ajith" or "Ramesh, Ajith"), treat it as a SINGLE person's name in "Last, First" format. DO NOT split it into multiple assignee clauses. Use: assignee = "Ramesh, Ajith" (NOT assignee = "Ramesh" AND assignee = "Ajith")
- For project queries, use: project = "CCM"
- **For status values, use EXACT values from project mappings above** (e.g., for NDP: "In Progress", "Pending Approval", "Test Complete", etc.)
- **For issue types, use EXACT values from project mappings above** (e.g., for NDP: Story, Bug, Defect, Test)
- Always quote string values
- Use ORDER BY updated DESC for lists
- For counts, don't use ORDER BY
- **CRITICAL**: If project mappings are provided, use ONLY those exact status and issue type values. Do not use generic values like "To Do" or "Done" unless they appear in the project mappings.

{project_mappings}

CRITICAL - For TEST CASE queries:
- For test cases, use: type = Test (NOT type= "Test")
- For test type filtering, use the "Test Type" field with values from the project mappings above
- For automation status, use: "Test Status" field (NOT "Automation Status")
- **ALWAYS USE THE EXACT VALUES FROM PROJECT MAPPINGS** - Do not invent or guess field values
- When user asks about "regression test cases", use: "Test Type" = "Regression Testing" (check project mappings for exact value)
- When user asks about "automated test cases", use: "Test Status" = Automated (check project mappings for exact value)
- When user asks about "automation test cases", use: "Test Status" = Automated
- **CRITICAL - For "manual tests" queries**: There is NO "Manual" status. When users ask about "manual tests" or "manual test cases", they mean ALL test cases that are NOT in "Automated" status. This includes: "Automation Not Required", "Requires Automation", and "In Progress". Use: "Test Status" != Automated (this captures all non-automated tests)
- Example correct query for NDP: project = "NDP" AND type = Test AND "Test Type" = "Functional Testing" AND "Test Status" = Automated
- **IMPORTANT**: If project mappings are provided above, use ONLY those exact values. Do not use generic or guessed values like "Manual" which doesn't exist.

CRITICAL - For comparative queries:
- Detect comparison words: "vs", "versus", "compare", "who's busier", "which has more", "between"
- For comparisons, generate MULTIPLE separate JQL queries
- Return array of JQLs to fetch data for each entity separately
- IMPORTANT: For person comparisons (assignee comparisons), search ACROSS ALL PROJECTS unless specifically mentioned
- For project comparisons, search within each specific project

Intent types:
- "project_overview": General project information
- "assignee_work": What someone is working on
- "issue_details": Specific ticket information
- "reporter_details": Information about who reported an issue
- "priority_details": Information about issue priority
- "status_details": Information about issue status
- "date_details": Information about creation/update dates
- "type_details": Information about issue type
- "assignee_comparison": Comparing assignees/people
- "project_comparison": Comparing projects
- "list_items": List specific items
- "count_items": Count of items
- "status_breakdown": Status analysis

For SINGLE entity queries, respond with:
{{
    "intent": "detected_intent_type",
    "jql": "single JQL query",
    "response_type": "count|list|breakdown",
    "entities": {{
        "project": "extracted project",
        "assignee": "extracted assignee",
        "issue_type": "extracted issue type",
        "status": "extracted status"
    }}
}}

For COMPARISON queries, respond with:
{{
    "intent": "assignee_comparison|project_comparison",
    "jql": ["query for entity 1", "query for entity 2"],
    "response_type": "comparison",
    "entities": {{
        "entity1": "first entity name",
        "entity2": "second entity name",
        "comparison_type": "assignee|project"
    }}
}}

Examples:
- "Who's busier: Ashwin Thyagarajan or SARAVANAN NP?" -> Multiple JQLs: assignee = "Ashwin Thyagarajan" | assignee = "SARAVANAN NP"
- "Which project has more urgent work: CCM or CES?" -> Multiple JQLs: project = "CCM" | project = "CES"
- "Compare CCM vs TI projects" -> Multiple JQLs: project = "CCM" | project = "TI"
- "Who resolves bugs faster: Ashwin or Saravanan?" -> Multiple JQLs: assignee = "Ashwin" AND type= "Bug" | assignee = "Saravanan" AND type= "Bug"
- "Who is the reporter of CCM-283?" -> Single JQL: issue = "CCM-283"
- "CCM-283 details" -> Single JQL: issue = "CCM-283"
- "What is the priority of CCM-283?" -> Single JQL: issue = "CCM-283"
- "What is the status of CCM-283?" -> Single JQL: issue = "CCM-283"
- "When was CCM-283 created?" -> Single JQL: issue = "CCM-283"
- "What type is CCM-283?" -> Single JQL: issue = "CCM-283"
"""

        user_prompt = f"""Query: "{user_query}"

Generate appropriate JQL and analyze the intent."""

        # Log the start of JQL generation process
        logger.info("=" * 80)
        logger.info("🧠 GENERATING JQL FROM USER QUERY")
        logger.info(f"💬 User Query: {user_query}")
        if context_str:
            logger.info(f"📚 Conversation Context Available: {len(self.conversation_context)} previous interactions")
            logger.info(f"🎫 Extracted Tickets from Context: {', '.join(set(extracted_tickets)) if extracted_tickets else 'None'}")
        if understanding_context:
            logger.info(f"🤖 AI Understanding Available: Project={detected_project}, Intent={self.last_query_context.get('query_intent', 'N/A') if self.last_query_context else 'N/A'}")
        if project_mappings:
            logger.info(f"📋 Project Mappings Available for: {detected_project}")
        logger.info(f"📦 Available Projects: {', '.join(project_keys) if project_keys else 'None'}")
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            raw_response = response.choices[0].message.content.strip()
            logger.info(f"🤖 Raw AI Response: {raw_response}")
            
            result = json.loads(raw_response)

            # Clean up entities to avoid intent bleed-through into issue_type
            result['entities'] = self._sanitize_entities(result.get('entities', {}) or {}, result.get('intent'))
            if 'issue_types' in result:
                normalized_issue_types = self._normalize_issue_type_list(result.get('issue_types'))
                if normalized_issue_types:
                    result['issue_types'] = normalized_issue_types
                else:
                    result.pop('issue_types', None)
            
            # Detailed logging of the generated JQL and reasoning
            logger.info("=" * 80)
            logger.info("✅ JQL GENERATION COMPLETE")
            logger.info(f"🎯 Detected Intent: {result.get('intent', 'unknown')}")
            logger.info(f"📋 Generated JQL: {result.get('jql', 'N/A')}")
            logger.info(f"📊 Response Type: {result.get('response_type', 'unknown')}")
            if result.get('entities'):
                entities_str = ", ".join([f"{k}={v}" for k, v in result.get('entities', {}).items() if v])
                logger.info(f"🏷️  Extracted Entities: {entities_str if entities_str else 'None'}")
            if isinstance(result.get('jql'), list):
                logger.info(f"🔄 Comparison Query Detected: {len(result.get('jql', []))} JQL queries to execute")
                for i, jql in enumerate(result.get('jql', []), 1):
                    logger.info(f"   Query {i}: {jql}")
            logger.info("=" * 80)
            
            return result
            
        except Exception as e:
            logger.error(f"Query analysis failed: {e}")
            # Enhanced fallback analysis
            query_lower = user_query.lower()
            
            # Detect specific issue keys (e.g., CCM-283, CES-123)
            # re is already imported at module level
            issue_key_pattern = r'\b([A-Z]{2,}-\d+)\b'
            issue_key_match = re.search(issue_key_pattern, user_query, re.IGNORECASE)
            specific_issue_key = issue_key_match.group(1) if issue_key_match else None
            
            if specific_issue_key:
                return {
                    "intent": "issue_details",
                    "jql": f'issue = "{specific_issue_key}"',
                    "response_type": "list",
                    "entities": {"issue_key": specific_issue_key}
                }
            else:
                # Fallback to simple analysis. Keys must be quoted: some project
                # keys (e.g. IN, TO) are JQL reserved words and 400 when bare.
                quoted_keys = ", ".join(f'"{k}"' for k in project_keys)
                safe_project_clause = (
                    f'project in ({quoted_keys}) '
                    if project_keys else ''
                )
                jql = (safe_project_clause + 'ORDER BY updated DESC').strip()
                return {
                    "intent": "general_query",
                    "jql": jql,
                    "response_type": "list",
                    "entities": {}
                }
    
    def _format_name_for_jira(self, name: str) -> str:
        """
        Format name for Jira CDK format: "Last, First" (comma-separated with space)
        
        Examples:
        - "Ramesh Ajith" -> "Ramesh, Ajith"
        - "Ajith" -> "Ajith" (single name, no comma)
        - "Ramesh, Ajith" -> "Ramesh, Ajith" (already formatted)
        - "Ramesh,Ajith" -> "Ramesh, Ajith" (normalized to add space)
        """
        if not name or not isinstance(name, str):
            return name
        
        name = name.strip()
        
        # If already has comma, normalize to ensure space after comma
        if ',' in name:
            # Normalize: "Ramesh,Ajith" -> "Ramesh, Ajith"
            name = re.sub(r',\s*', ', ', name)
            return name
        
        # Split by space
        parts = name.split()
        if len(parts) >= 2:
            # Multiple words: format as "Last, First"
            # Assume last word is last name, rest is first name
            last_name = parts[-1]
            first_name = ' '.join(parts[:-1])
            return f"{last_name}, {first_name}"
        else:
            # Single word: return as-is
            return name
    
    async def _search_ldap_users(self, search_term: str, limit: int = 10) -> List[Dict[str, str]]:
        """
        Search LDAP for users matching the search term (first name, last name, or display name)
        
        Returns list of user dicts with displayName, email, sAMAccountName
        """
        try:
            from services.ldap_auth import authenticate_user_from_ldap
            import os
            from ldap3 import Server, Connection, ALL, SUBTREE, Tls
            import ssl
            from services.encryption import get_encrypted_env
            
            # Get LDAP configuration
            LDAP_SERVICE_ACCOUNT_USERNAME = os.environ.get('LDAP_SERVICE_ACCOUNT_USERNAME')
            LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED = os.environ.get('LDAP_SERVICE_ACCOUNT_PASSWORD')
            LDAP_SERVER_URL = os.environ.get('LDAP_SERVER_URL')
            
            if not all([LDAP_SERVICE_ACCOUNT_USERNAME, LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED, LDAP_SERVER_URL]):
                logger.warning("LDAP not configured, cannot search for users")
                return []
            
            # Decrypt service account password
            try:
                LDAP_SERVICE_ACCOUNT_PASSWORD = get_encrypted_env('LDAP_SERVICE_ACCOUNT_PASSWORD')
            except Exception as e:
                logger.error(f"Failed to decrypt LDAP password: {e}")
                return []
            
            # Extract username from domain format
            ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME
            if '\\' in LDAP_SERVICE_ACCOUNT_USERNAME:
                ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME.split('\\')[-1]
            
            LDAP_USER = f"cn={ldap_username},ou=Service Accounts,ou=Security,ou=GIS,dc=global,dc=cdk,dc=com"
            BASE_DN = 'ou=User Accounts,dc=global,dc=cdk,dc=com'
            
            # Connect to LDAP
            is_ldaps = LDAP_SERVER_URL.startswith('ldaps://')
            tls_config = None
            if is_ldaps:
                tls_config = Tls(validate=ssl.CERT_NONE)
            
            server = Server(LDAP_SERVER_URL, get_info=ALL, use_ssl=is_ldaps, tls=tls_config)
            conn = Connection(server, user=LDAP_USER, password=LDAP_SERVICE_ACCOUNT_PASSWORD, auto_bind=True)
            
            # Search for users matching the term (in displayName, cn, or sAMAccountName)
            search_filter = f'(|(displayName=*{search_term}*)(cn=*{search_term}*)(sAMAccountName=*{search_term}*))'
            conn.search(
                BASE_DN,
                search_filter,
                search_scope=SUBTREE,
                attributes=['cn', 'mail', 'sAMAccountName', 'displayName'],
                size_limit=limit
            )
            
            users = []
            for entry in conn.entries[:limit]:
                display_name = entry.displayName.value if hasattr(entry, 'displayName') and entry.displayName else None
                email = entry.mail.value if hasattr(entry, 'mail') and entry.mail else None
                sam_account = entry.sAMAccountName.value if hasattr(entry, 'sAMAccountName') and entry.sAMAccountName else None
                
                if display_name:
                    users.append({
                        'displayName': display_name,
                        'email': email or f"{sam_account}@cdk.com" if sam_account else None,
                        'sAMAccountName': sam_account
                    })
            
            conn.unbind()
            return users
            
        except Exception as e:
            logger.error(f"LDAP user search failed: {e}")
            return []
    
    async def _find_jira_user_by_name(self, name: str, project_key: str = None) -> Optional[str]:
        """
        Find Jira user by name, format as "Last, First" for CDK Jira format.
        If multiple matches found, returns None (caller should ask user to confirm).
        
        Returns formatted name like "Ramesh, Ajith" or None if ambiguous
        """
        # First try to get users from Jira
        if self.jira_client and project_key:
            try:
                users = await self.jira_client.get_assignable_users(project_key)
                if users:
                    # Search for matching user
                    name_lower = name.lower()
                    matches = []
                    for user in users:
                        display_name = user.get('displayName', '')
                        if name_lower in display_name.lower():
                            matches.append(display_name)
                    
                    if len(matches) == 1:
                        # Single match - format it
                        return self._format_name_for_jira(matches[0])
                    elif len(matches) > 1:
                        # Multiple matches - return None to trigger confirmation
                        logger.info(f"Multiple Jira users found for '{name}': {matches}")
                        return None
            except Exception as e:
                logger.warning(f"Failed to search Jira users: {e}")
        
        # Fallback to LDAP search
        ldap_users = await self._search_ldap_users(name, limit=10)
        if len(ldap_users) == 1:
            # Single match - format it
            return self._format_name_for_jira(ldap_users[0]['displayName'])
        elif len(ldap_users) > 1:
            # Multiple matches - return None to trigger confirmation
            logger.info(f"Multiple LDAP users found for '{name}': {[u['displayName'] for u in ldap_users]}")
            return None
        
        # No matches found - try formatting the input name as-is
        return self._format_name_for_jira(name)
    
    async def _normalize_assignee_jql(self, jql: str, project_key: str = None) -> str:
        """
        Normalize assignee/reporter clauses in JQL for CDK Jira format.
        
        CDK Jira requires names in format: "Last, First" (comma-separated)
        Example: "Ramesh, Ajith" not "Ramesh Ajith"
        
        Also handles both assignee and reporter fields.
        If a name looks like a partial name (single word, no comma), tries to look it up.
        """
        try:
            # Pattern for both assignee and reporter
            pattern = r'(assignee|reporter)\s*=\s*"([^"]+)"'
            
            async def _replace_assignee_reporter(match: re.Match) -> str:
                field = match.group(1)  # assignee or reporter
                value = match.group(2).strip()
                
                # Skip normalization for obvious technical identifiers
                if not value:
                    return match.group(0)
                if ":" in value or "@" in value:
                    # Likely accountId or email
                    return match.group(0)
                
                # If name already has comma, normalize to ensure space after comma
                if ',' in value:
                    # Normalize: "Ramesh,Ajith" -> "Ramesh, Ajith"
                    formatted_name = re.sub(r',\s*', ', ', value)
                else:
                    # Check if it's a single word that might need lookup
                    words = value.split()
                    if len(words) == 1 and len(value) > 2:
                        # Single word - try to look it up
                        logger.info(f"🔍 Single word name detected in JQL: '{value}', attempting lookup...")
                        looked_up_name = await self._find_jira_user_by_name(value, project_key)
                        if looked_up_name:
                            formatted_name = looked_up_name
                            logger.info(f"✅ Looked up '{value}' -> '{formatted_name}'")
                        else:
                            # Multiple matches or no match - need to check
                            ldap_users = await self._search_ldap_users(value, limit=5)
                            if len(ldap_users) > 1:
                                # Multiple matches found - this should have been caught earlier
                                # Store the ambiguous name to raise an exception
                                logger.warning(f"⚠️ Multiple matches for '{value}' found during JQL normalization: {[u['displayName'] for u in ldap_users]}")
                                # Raise a special exception that can be caught to return confirmation
                                raise ValueError(f"MULTIPLE_USER_MATCHES:{value}:{','.join([u['displayName'] for u in ldap_users])}")
                            elif len(ldap_users) == 1:
                                # Single match found
                                formatted_name = self._format_name_for_jira(ldap_users[0]['displayName'])
                                logger.info(f"✅ Found single LDAP match: '{value}' -> '{formatted_name}'")
                            else:
                                # No match found, format as-is (might be a last name)
                                formatted_name = self._format_name_for_jira(value)
                    else:
                        # Multiple words - format as "Last, First"
                        formatted_name = self._format_name_for_jira(value)
                
                # Use exact match with formatted name (CDK Jira supports this)
                normalized = f'{field} = "{formatted_name}"'
                
                if formatted_name != value:
                    logger.info(f"Formatted {field} name: '{value}' -> '{formatted_name}'")
                
                return normalized
            
            # Apply to both assignee and reporter (need to handle async)
            # Since we can't use async in re.sub, we'll process matches manually
            matches = list(re.finditer(pattern, jql, flags=re.IGNORECASE))
            if matches:
                # Process matches in reverse order to maintain positions
                for match in reversed(matches):
                    replacement = await _replace_assignee_reporter(match)
                    jql = jql[:match.start()] + replacement + jql[match.end():]
            
            return jql
        except ValueError as e:
            # Re-raise ValueError (used for multiple user matches) so it can be handled upstream
            error_msg = str(e)
            if error_msg.startswith("MULTIPLE_USER_MATCHES:"):
                raise  # Re-raise to be caught in _execute_jql
            logger.warning(f"Failed to normalize assignee/reporter JQL '{jql}': {e}")
            return jql
        except Exception as e:
            logger.warning(f"Failed to normalize assignee/reporter JQL '{jql}': {e}")
            return jql
    
    def _fix_split_assignee_names(self, jql: str) -> str:
        """
        Fix JQL that incorrectly splits comma-separated names into multiple assignee clauses.
        
        Example:
        - BAD: assignee = "Ramesh" AND assignee = "Ajith"
        - GOOD: assignee = "Ramesh, Ajith"
        
        This happens when the AI model incorrectly interprets "Ramesh,Ajith" as two separate names.
        """
        try:
            # Pattern to match: assignee = "Name1" AND assignee = "Name2"
            # This should be combined into: assignee = "Name1, Name2"
            pattern = r'assignee\s*=\s*"([^"]+)"\s+AND\s+assignee\s*=\s*"([^"]+)"'
            
            def replace_split_assignee(match):
                name1 = match.group(1).strip()
                name2 = match.group(2).strip()
                
                # Check if these look like they could be parts of a comma-separated name
                # (e.g., "Ramesh" and "Ajith" -> "Ramesh, Ajith")
                # Only combine if both are single words (likely first/last name parts)
                if ' ' not in name1 and ' ' not in name2 and ',' not in name1 and ',' not in name2:
                    # Ensure space after comma: "Ramesh, Ajith"
                    combined_name = f"{name1}, {name2}"
                    logger.info(f"🔧 Fixed split assignee: '{name1}' AND '{name2}' -> '{combined_name}'")
                    return f'assignee = "{combined_name}"'
                else:
                    # Keep as-is if they're already complex names
                    return match.group(0)
            
            # Apply the fix
            fixed_jql = re.sub(pattern, replace_split_assignee, jql, flags=re.IGNORECASE)
            
            if fixed_jql != jql:
                logger.info(f"✅ Fixed split assignee names in JQL")
            
            return fixed_jql
        except Exception as e:
            logger.warning(f"Failed to fix split assignee names in JQL: {e}")
            return jql

    async def _execute_jql(self, jql: str, query_intent: str = None, original_query: str = None) -> Dict[str, Any]:
        """
        Execute JQL with hybrid logic based on query intent:
        - count_items: Return only total count using maxResults=0
        - breakdown/overview: Fetch ALL issues using pagination for analysis
        """
        try:
            logger.info("=" * 80)
            logger.info("⚙️  PREPARING JQL EXECUTION")
            logger.info(f"📋 Original JQL: {jql}")
            logger.info(f"🎯 Query Intent: {query_intent or 'not specified'}")
            
            # Normalize JQL for better assignee handling before execution
            # Extract project key from JQL for user lookup
            project_key_match = re.search(r'project\s*=\s*"([^"]+)"', jql, re.IGNORECASE)
            project_key = project_key_match.group(1) if project_key_match else None
            
            original_jql = jql
            try:
                jql = await self._normalize_assignee_jql(jql, project_key)
            except ValueError as e:
                # Check if this is a multiple user matches exception
                error_msg = str(e)
                if error_msg.startswith("MULTIPLE_USER_MATCHES:"):
                    # Parse the exception to get the name and matches
                    parts = error_msg.split(":")
                    if len(parts) >= 3:
                        ambiguous_name = parts[1]
                        # Use | as delimiter to avoid splitting on commas in names like "Ramesh, Ajith"
                        matches_str = ":".join(parts[2:])  # Get everything after the second colon
                        matches = matches_str.split("|") if "|" in matches_str else matches_str.split(",")
                        # Clean up matches (remove extra spaces)
                        matches = [m.strip() for m in matches if m.strip()]
                        confirmation_parts = []
                        confirmation_parts.append(f"I found multiple users matching '{ambiguous_name}':\n")
                        for i, match in enumerate(matches[:5], 1):
                            # Show full name correctly (e.g., "1. Ramesh, Ajith" not "1. Ramesh")
                            confirmation_parts.append(f"{i}. {match}")
                        if len(matches) >= 2:
                            confirmation_parts.append(f"\nPlease specify which user you meant, for example: '{matches[0]}' or '{matches[1]}'")
                        else:
                            confirmation_parts.append(f"\nPlease specify which user you meant: '{matches[0]}'")
                        
                        logger.info(f"⚠️ Returning user confirmation request for '{ambiguous_name}'")
                        
                        # Store the confirmation context for the next query
                        # Store the confirmation context - original_query will be set by caller
                        self.pending_user_confirmation = {
                            'ambiguous_name': ambiguous_name,
                            'possible_matches': matches,
                            'original_query': original_query if original_query else None,
                            'original_jql': original_jql
                        }
                        
                        return {
                            "jql": original_jql,
                            "response": "\n".join(confirmation_parts),
                            "data": [],
                            "intent": "user_confirmation",
                            "success": False,
                            "source": "user_lookup",
                            "ambiguous_users": {ambiguous_name: matches}
                        }
                # Re-raise if it's not our special exception
                raise
            
            jql = self._normalize_issue_type_clauses(jql)
            
            # Post-process: Fix JQL that incorrectly splits comma-separated names
            # Pattern: assignee = "Name1" AND assignee = "Name2" (should be assignee = "Name1, Name2")
            jql = self._fix_split_assignee_names(jql)
            
            if jql != original_jql:
                logger.info(f"🔄 JQL Normalized (assignee/reporter/issuetype handling): {jql}")

            # Determine if this is a count-only query
            is_count_only = (
                query_intent == "count_items" or 
                query_intent == "story_count" or
                query_intent == "issue_count" or
                "count" in jql.lower() or 
                "group by" in jql.lower()
            )
            
            logger.info(f"🔍 Execution Strategy Decision:")
            logger.info(f"   - Query Intent Check: {query_intent in ['count_items', 'story_count', 'issue_count']}")
            logger.info(f"   - JQL Contains 'count': {'count' in jql.lower()}")
            logger.info(f"   - JQL Contains 'group by': {'group by' in jql.lower()}")
            logger.info(f"   → Decision: {'COUNT-ONLY' if is_count_only else 'FULL PAGINATION'} query")
            
            if is_count_only:
                # For count-only queries, use maxResults=0 to get only the total count
                logger.info(f"📊 Executing COUNT-ONLY query (maxResults=0 for efficiency)")
                logger.info(f"📋 Final JQL: {jql}")
                search_result = await self.jira_client.search(jql, max_results=0)
                
                if isinstance(search_result, dict):
                    total_count = search_result.get('total', 0)
                    logger.info(f"✅ COUNT-ONLY QUERY RESULT: {total_count} total items matching JQL")
                    logger.info("=" * 80)
                    # Return a lightweight payload that still carries the count so
                    # callers relying on data length don't see zero by mistake.
                    return {
                        'results': [{'type': 'count', 'total_count': total_count}],
                        'total_count': total_count,
                        'retrieved_count': total_count,
                        'is_count_only': True
                    }
                else:
                    logger.warning(f"⚠️  Unexpected count result format: {type(search_result)}")
                    logger.info("=" * 80)
                    return {
                        'results': [{'type': 'count', 'total_count': 0}],
                        'total_count': 0,
                        'retrieved_count': 0,
                        'is_count_only': True
                    }
            else:
                # For breakdown/overview queries, fetch ALL issues using pagination
                logger.info(f"📦 Executing FULL PAGINATION query (fetching all matching issues)")
                logger.info(f"📋 Final JQL: {jql}")
                logger.info(f"💡 Reason: Need full issue data for breakdown/analysis, not just count")
                
                # Enhanced field list for better data quality
                enhanced_fields = [
                    'key', 'summary', 'status', 'assignee', 'priority', 'type',
                    'project', 'created', 'updated', 'description', 'reporter',
                    'labels', 'components', 'fixVersions', 'duedate'
                ]
                
                # Get all results with pagination to ensure we don't miss any issues
                all_issues = []
                start_at = 0
                max_results_per_page = 100  # Increased for better efficiency
                total_count_from_api = None
                
                while True:
                    search_result = await self.jira_client.search(
                        jql, 
                        max_results=max_results_per_page, 
                        fields=enhanced_fields,
                        start_at=start_at
                    )
                    
                    # Extract issues from the Jira response structure
                    if isinstance(search_result, dict) and 'issues' in search_result:
                        issues = search_result['issues']
                        # Get total count from first page response
                        if total_count_from_api is None:
                            total_count_from_api = search_result.get('total', 0)
                        
                        # Check for pagination using total count and current position
                        has_more_pages = (start_at + len(issues)) < total_count_from_api
                        page_num = start_at//max_results_per_page + 1
                        logger.info(f"📄 Page {page_num}: Retrieved {len(issues)} issues (Total matching: {total_count_from_api}, More pages: {has_more_pages})")
                    elif isinstance(search_result, list):
                        issues = search_result
                        has_more_pages = False  # List format doesn't support pagination
                        total_count_from_api = len(issues)
                        page_num = start_at//max_results_per_page + 1
                        logger.info(f"📄 Page {page_num}: Retrieved {len(issues)} issues (list format, no pagination)")
                    else:
                        logger.error(f"❌ Unexpected search result format: {type(search_result)}")
                        break
                    
                    if not issues:
                        logger.info(f"⏹️  No more issues found, stopping pagination")
                        break
                    
                    all_issues.extend(issues)
                    
                    # Break if we've retrieved all available issues
                    if not has_more_pages or len(issues) < max_results_per_page:
                        logger.info(f"⏹️  Pagination complete: has_more_pages={has_more_pages}, current_page_size={len(issues)}, max_per_page={max_results_per_page}")
                        break
                    
                    start_at += max_results_per_page
                
                logger.info(f"✅ PAGINATION COMPLETE: Retrieved {len(all_issues)} total issues (API reported total: {total_count_from_api})")
                logger.info("=" * 80)
                
                # Filter out items with missing essential data
                filtered_results = []
                for issue in all_issues:
                    key = issue.get('key', 'UNKNOWN')
                    fields = issue.get('fields', {})
                    summary = fields.get('summary', '') if fields else ''
                    
                    # Skip items with no key or summary unless it's a specific key lookup
                    if key == 'UNKNOWN' and not summary:
                        logger.warning(f"Skipping item with missing key/summary: {issue}")
                        continue
                    
                    filtered_results.append(issue)
                
                logger.info(f"Processed {len(filtered_results)} valid issues from {len(all_issues)} total")
                
                # Hybrid fallback: if JQL returned nothing, try semantic RAG search
                if not filtered_results:
                    try:
                        rag_handler = get_jira_rag_handler()
                        if rag_handler:
                            logger.info("⚠️ No JQL results, using Jira RAG semantic search fallback")
                            recent_search = await self.jira_client.search(
                                "project is not EMPTY ORDER BY updated DESC",
                                max_results=200
                            )
                            recent_issues = recent_search.get('issues', [])
                            
                            if recent_issues:
                                similar_issues = await rag_handler.find_similar_issues(
                                    query=jql,
                                    issues=recent_issues,
                                    top_k=10
                                )
                                
                                if similar_issues:
                                    return {
                                        'results': similar_issues,
                                        'total_count': len(similar_issues),
                                        'retrieved_count': len(similar_issues),
                                        'is_count_only': False,
                                        'rag_fallback': True,
                                        'rag_method': 'jira_semantic_fallback'
                                    }
                    except Exception as rag_err:
                        logger.warning(f"Semantic fallback failed: {rag_err}")
                
                # Return both results and accurate counts for analysis
                # total_count_from_api = true Jira count, len(filtered_results) = fetched count
                return {
                    'results': filtered_results,
                    'total_count': total_count_from_api or len(filtered_results),  # True Jira count
                    'retrieved_count': len(filtered_results),  # Actually fetched count
                    'is_count_only': False
                }
                
        except Exception as e:
            logger.error(f"JQL execution failed: {e}")
            return {
                'results': [],
                'total_count': 0,
                'retrieved_count': 0,
                'is_count_only': False,
                'error': str(e)
            }
    
    async def _generate_leadership_report(self, user_query: str, query_analysis: Dict, results: List[Dict], total_count: int = None, retrieved_count: int = None) -> str:
        """
        Generate leadership-oriented AI Insight Report in structured format.
        Format: Clean, professional, dashboard-ready report for leadership and QCOE review.
        """
        from datetime import datetime, timedelta
        
        # Extract project from results or query understanding
        project = 'Unknown Project'
        if results:
            # Try to get project from first result
            first_result = results[0]
            project_field = first_result.get('fields', {}).get('project', {})
            if project_field:
                project = project_field.get('key', project_field.get('name', 'Unknown Project'))
        
        # Fallback to query understanding
        if project == 'Unknown Project' and self.last_query_context:
            project = self.last_query_context.get('project', 'Unknown Project')
        
        time_range = self.last_query_context.get('time_range', {}) if self.last_query_context else {}
        
        # Determine time period description
        time_period_desc = "Period"
        if time_range:
            start_date = time_range.get('start', '')
            end_date = time_range.get('end', '')
            if start_date and end_date:
                try:
                    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                    days_diff = (end_dt - start_dt).days
                    if days_diff == 6:
                        time_period_desc = "Last 7 Days"
                    elif days_diff == 13:
                        time_period_desc = "Last 2 Weeks"
                    elif days_diff == 29:
                        time_period_desc = "Last 30 Days"
                    else:
                        time_period_desc = f"{start_dt.strftime('%b %d')} - {end_dt.strftime('%b %d, %Y')}"
                except:
                    time_period_desc = f"{start_date} to {end_date}"
        else:
            # Try to extract from query
            query_lower = user_query.lower()
            if 'last week' in query_lower or 'past week' in query_lower:
                time_period_desc = "Last 7 Days"
            elif 'last month' in query_lower or 'past month' in query_lower:
                time_period_desc = "Last 30 Days"
        
        # Analyze results
        status_counts = {}
        priority_counts = {}
        assignee_counts = {}
        issue_details = []
        
        for issue in results:
            fields = issue.get('fields', {})
            key = issue.get('key', 'UNKNOWN')
            summary = fields.get('summary', 'No summary')
            status = fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown'
            priority = fields.get('priority', {}).get('name', 'Unknown') if fields.get('priority') else 'Unknown'
            assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
            reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
            created = fields.get('created', '')
            issue_type = fields.get('type', {}).get('name', 'Unknown') if fields.get('type') else 'Unknown'
            
            # Count status
            status_counts[status] = status_counts.get(status, 0) + 1
            
            # Count priority
            priority_counts[priority] = priority_counts.get(priority, 0) + 1
            
            # Count assignee
            assignee_counts[assignee] = assignee_counts.get(assignee, 0) + 1
            
            # Format created date
            created_date_str = "Unknown"
            if created:
                try:
                    created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                    created_date_str = created_dt.strftime('%Y-%m-%d')
                except:
                    created_date_str = created[:10] if len(created) >= 10 else created
            
            issue_details.append({
                'key': key,
                'summary': summary,
                'status': status,
                'priority': priority,
                'assignee': assignee,
                'reporter': reporter,
                'created': created_date_str,
                'issue_type': issue_type
            })
        
        # Sort issues by priority (High first) then by created date (newest first)
        priority_order = {'Highest': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Lowest': 4, 'Unknown': 5}
        issue_details.sort(key=lambda x: (priority_order.get(x['priority'], 5), x['created']), reverse=True)
        
        # Build report
        report_lines = []
        
        # Header
        report_lines.append(f"AI INSIGHT REPORT – {project} Project ({time_period_desc})")
        report_lines.append("")
        report_lines.append("(Automatically generated – summarized for leadership & QCOE review)")
        report_lines.append("")
        
        # 1. Summary
        report_lines.append("1. Summary")
        report_lines.append("")
        
        # Generate summary using AI
        summary_text = await self._generate_report_summary(user_query, results, status_counts, priority_counts, assignee_counts)
        report_lines.append(summary_text)
        report_lines.append("")
        
        # 2. Breakdown
        report_lines.append("2. Breakdown")
        report_lines.append("")
        
        # A. Status Overview
        report_lines.append("A. Status Overview")
        report_lines.append("")
        report_lines.append("Status\tCount")
        for status, count in sorted(status_counts.items(), key=lambda x: x[1], reverse=True):
            report_lines.append(f"{status}\t{count}")
        report_lines.append("")
        
        # B. Priority Split
        report_lines.append("B. Priority Split")
        report_lines.append("")
        report_lines.append("Priority\tCount")
        for priority, count in sorted(priority_counts.items(), key=lambda x: priority_order.get(x[0], 5)):
            report_lines.append(f"{priority}\t{count}")
        report_lines.append("")
        
        # C. Assignee Distribution
        report_lines.append("C. Assignee Distribution")
        report_lines.append("")
        report_lines.append("Assignee\tCount\tNotes")
        for assignee, count in sorted(assignee_counts.items(), key=lambda x: x[1], reverse=True):
            # Get priority info for this assignee
            assignee_issues = [i for i in issue_details if i['assignee'] == assignee]
            priorities = [i['priority'] for i in assignee_issues]
            high_priority = sum(1 for p in priorities if p == 'High' or p == 'Highest')
            note = f"{high_priority} High priority" if high_priority > 0 else f"All {priorities[0] if priorities else 'Medium'} priority"
            report_lines.append(f"{assignee}\t{count}\t{note}")
        report_lines.append("")
        
        # 3. Detailed Bug List
        report_lines.append("3. Detailed Bug List")
        report_lines.append("")
        
        for issue in issue_details:
            report_lines.append(f"🔹 {issue['key']} – {issue['summary']}")
            report_lines.append(f"Status: {issue['status']}")
            report_lines.append(f"Priority: {issue['priority']}")
            report_lines.append(f"Assignee: {issue['assignee']}")
            report_lines.append(f"Reporter: {issue['reporter']}")
            report_lines.append(f"Created: {issue['created']}")
            
            # Add note for high priority issues
            if issue['priority'] in ['High', 'Highest']:
                report_lines.append(f"Note: This is a {issue['priority'].lower()} priority issue and may require immediate attention.")
            report_lines.append("")
        
        # 4. Executive Insight
        report_lines.append("4. Executive Insight")
        report_lines.append("")
        executive_insights = await self._generate_executive_insights(results, status_counts, priority_counts, assignee_counts, issue_details)
        report_lines.append(executive_insights)
        report_lines.append("")
        
        # 5. Recommended Next Steps
        report_lines.append("5. Recommended Next Steps")
        report_lines.append("")
        next_steps = await self._generate_next_steps(results, status_counts, priority_counts, issue_details)
        report_lines.append(next_steps)
        report_lines.append("")
        
        return "\n".join(report_lines)
    
    async def _generate_report_summary(self, user_query: str, results: List[Dict], status_counts: Dict, priority_counts: Dict, assignee_counts: Dict) -> str:
        """Generate summary section using AI"""
        # Check if all results are bugs
        bug_count = sum(1 for r in results if r.get('fields', {}).get('type', {}).get('name', '').lower() in ['bug', 'defect'])
        is_all_bugs = bug_count == len(results)
        issue_term = "bugs" if is_all_bugs else "issues"
        
        if not self.client:
            # Fallback summary
            total = len(results)
            pending = status_counts.get('Pending Approval', 0) + status_counts.get('To Do', 0)
            in_progress = status_counts.get('In Progress', 0)
            high_priority = priority_counts.get('High', 0) + priority_counts.get('Highest', 0)
            
            return f"There are {total} new {issue_term} raised in the project during the specified period. {pending} are awaiting approval or triage, while {in_progress} are in progress. {high_priority} high-priority {issue_term if high_priority == 1 else issue_term} require immediate attention."
        
        try:
            summary_prompt = f"""Generate a concise 2-3 sentence summary for a leadership report about {issue_term}.

Query: {user_query}
Total {issue_term.capitalize()}: {len(results)}
Status Breakdown: {status_counts}
Priority Breakdown: {priority_counts}
Assignee Count: {len(assignee_counts)} people

Write a professional summary that highlights:
- Total count of {issue_term}
- Key status distribution (pending vs in progress)
- Priority concerns (high priority items)
- Overall assessment

Keep it concise and leadership-oriented. Use the term "{issue_term}" consistently."""
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a leadership report writer. Write concise, professional summaries."},
                    {"role": "user", "content": summary_prompt}
                ],
                temperature=0.3,
                max_tokens=150
            )
            
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Failed to generate summary: {e}")
            total = len(results)
            return f"There are {total} new bugs raised in the project during the specified period."
    
    async def _generate_executive_insights(self, results: List[Dict], status_counts: Dict, priority_counts: Dict, assignee_counts: Dict, issue_details: List[Dict]) -> str:
        """Generate executive insights using AI"""
        if not self.client:
            # Fallback insights
            insights = []
            pending = status_counts.get('Pending Approval', 0) + status_counts.get('To Do', 0)
            total = len(results)
            if pending > 0:
                pending_pct = (pending / total * 100) if total > 0 else 0
                insights.append(f"{pending_pct:.0f}% of newly raised bugs are still unapproved, indicating delays in triage workflow.")
            
            high_priority = priority_counts.get('High', 0) + priority_counts.get('Highest', 0)
            if high_priority > 0:
                insights.append(f"{high_priority} critical priority defect(s) need immediate focus.")
            
            return "\n".join(insights) if insights else "No critical insights at this time."
        
        try:
            insights_prompt = f"""Generate 3-5 executive insights for a leadership bug report.

Status Breakdown: {status_counts}
Priority Breakdown: {priority_counts}
Assignee Distribution: {assignee_counts}
Total Issues: {len(results)}

Generate insights that highlight:
- Workflow bottlenecks (pending approvals, triage delays)
- Priority concerns
- Patterns in issue types or assignees
- Overall health indicators

Format as bullet points, one per line, concise and actionable."""
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an executive analyst. Generate actionable insights for leadership."},
                    {"role": "user", "content": insights_prompt}
                ],
                temperature=0.4,
                max_tokens=200
            )
            
            insights = response.choices[0].message.content.strip()
            # Format as bullet points if not already
            if not insights.startswith('-') and not insights.startswith('•'):
                lines = insights.split('\n')
                formatted = []
                for line in lines:
                    line = line.strip()
                    if line:
                        if not line.startswith('-') and not line.startswith('•'):
                            formatted.append(f"- {line}")
                        else:
                            formatted.append(line)
                return "\n".join(formatted)
            return insights
        except Exception as e:
            logger.error(f"Failed to generate insights: {e}")
            return "- Review pending approvals to prevent workflow delays\n- Monitor high-priority issues closely"
    
    async def _generate_next_steps(self, results: List[Dict], status_counts: Dict, priority_counts: Dict, issue_details: List[Dict]) -> str:
        """Generate recommended next steps using AI"""
        if not self.client:
            steps = []
            pending = status_counts.get('Pending Approval', 0) + status_counts.get('To Do', 0)
            if pending > 0:
                steps.append("Fast-track approval for pending bugs to prevent next-sprint spillover.")
            
            high_priority = [i for i in issue_details if i['priority'] in ['High', 'Highest']]
            if high_priority:
                steps.append("Prioritize investigation of high-priority issues as they affect system availability.")
            
            steps.append("Schedule a short regression alignment session to avoid duplicate issues.")
            return "\n".join(f"- {step}" for step in steps)
        
        try:
            steps_prompt = f"""Generate 3-4 recommended next steps for a leadership bug report.

Status Breakdown: {status_counts}
Priority Breakdown: {priority_counts}
High Priority Issues: {len([i for i in issue_details if i['priority'] in ['High', 'Highest']])}
Pending Issues: {status_counts.get('Pending Approval', 0) + status_counts.get('To Do', 0)}

Generate concise, actionable next steps that address:
- Workflow improvements
- Priority handling
- Prevention strategies
- Team coordination

Format as professional bullet points (one per line), using polished language like "Prioritize...", "Implement...", "Establish...". Be specific and strategic."""
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a strategic project management advisor. Generate concise, actionable next steps using professional, polished language. Each step should be strategic and specific."},
                    {"role": "user", "content": steps_prompt}
                ],
                temperature=0.4,
                max_tokens=200
            )
            
            steps = response.choices[0].message.content.strip()
            # Format as bullet points if not already
            if not steps.startswith('-') and not steps.startswith('•'):
                lines = steps.split('\n')
                formatted = []
                for line in lines:
                    line = line.strip()
                    if line:
                        if not line.startswith('-') and not line.startswith('•'):
                            formatted.append(f"- {line}")
                        else:
                            formatted.append(line)
                return "\n".join(formatted)
            return steps
        except Exception as e:
            logger.error(f"Failed to generate next steps: {e}")
            return "- Prioritize fast-tracking approval for pending bugs to prevent next-sprint spillover\n- Focus on high-priority issues that may impact system availability\n- Establish regression alignment sessions to avoid duplicate issues"
    
    async def _generate_response(
        self, 
        user_query: str, 
        query_analysis: Dict, 
        results: List[Dict], 
        total_count: int = None, 
        retrieved_count: int = None,
        unified_rag_handler = None,
        integrations: List[str] = None,
        theme: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """Generate adaptive response using adaptive response engine"""
        from services.adaptive_response_engine import AdaptiveResponseEngine
        from theme.colors import get_theme
        
        # Use adaptive response engine
        adaptive_engine = AdaptiveResponseEngine(ai_client=self.client, model=self.model)
        
        # Get theme if not provided
        if theme is None:
            theme = get_theme("light")
        
        # Generate adaptive response
        response = await adaptive_engine.generate_adaptive_response(
            user_query=user_query,
            query_analysis=query_analysis,
            results=results,
            total_count=total_count,
            unified_rag_handler=unified_rag_handler,
            integrations=integrations,
            theme=theme
        )
        
        return response
        
        # Check if we should use leadership report format
        # Use it for bug/issue queries with multiple results
        query_lower = user_query.lower()
        is_bug_query = any(keyword in query_lower for keyword in ['bug', 'bugs', 'defect', 'defects', 'issue', 'issues'])
        has_multiple_results = len(results) > 1
        
        # Check if results are primarily bugs
        bug_count = sum(1 for r in results if r.get('fields', {}).get('type', {}).get('name', '').lower() in ['bug', 'defect'])
        is_mostly_bugs = bug_count > 0 and (bug_count / len(results)) >= 0.5 if results else False
        
        # Use leadership report format for bug queries with multiple results
        if (is_bug_query or is_mostly_bugs) and has_multiple_results:
            logger.info("📊 Using leadership report format for bug/issue query")
            return await self._generate_leadership_report(user_query, query_analysis, results, total_count, retrieved_count)
        
        # Check if this is a specific issue query and extract reporter context
        specific_issue_context = None
        if len(results) == 1 and results[0].get('key'):
            issue = results[0]
            fields = issue.get('fields', {})
            reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
            specific_issue_context = {
                'issue_key': issue.get('key'),
                'reporter': reporter,
                'assignee': fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned',
                'status': fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown'
            }
        
        # Prepare data summary for AI
        if not results:
            data_summary = "No matching items found."
        elif len(results) == 1 and "count" in results[0]:
            data_summary = f"Found {results[0]['count']} total items."
        else:
            # Analyze the results and create comprehensive summary
            chunk_limit = int(os.getenv("AI_RESPONSE_CHUNK_SIZE", "200"))
            if chunk_limit <= 0:
                chunk_limit = 200

            if len(results) > chunk_limit:
                data_summary = self._prepare_chunked_data_summary(
                    results, user_query, total_count, retrieved_count, specific_issue_context, chunk_limit
                )
            else:
                data_summary = self._create_detailed_analysis(results, user_query, total_count, retrieved_count, specific_issue_context)
                
                if len(results) > 5:
                    data_summary += f"... and {len(results) - 5} more items."
        
        system_prompt = """You are Work Buddy, an intelligent AI assistant helping engineering teams with Jira and project insights. Your responses should be natural, concise, and professionally polished—like a knowledgeable colleague providing thoughtful analysis.

CRITICAL RESPONSE FORMAT - ALWAYS USE THIS STRUCTURE:

1. **INTELLIGENT ANALYSIS FIRST** (2-3 sentences, max):
   Start with contextual insight, key observations, or strategic perspective
   Use professional language: "across portfolios", "demonstrates", "indicates", "reflects", "suggests"
   Example: "Ajith's current workload demonstrates a focus on pre-deployment validation activities. He's actively managing 2 stories in progress alongside 3 assigned bugs, indicating a balanced mix of feature work and quality assurance."

2. **SPECIFIC DETAILS** (if needed, 1-2 sentences):
   Provide ticket references or metrics ONLY when directly relevant
   Integrate details naturally into the narrative flow
   Example: "His most recent completion was NDP-20920, a pre-deployment validation for CDK IS-1.0.0.61, which aligns with his current focus area."

RESPONSE STYLE GUIDELINES:
- **PROFESSIONAL TONE**: Use polished, AI-style language that sounds intelligent and thoughtful
- **INSIGHT-DRIVEN**: Always lead with analysis, never raw data or ticket IDs
- **CONCISE**: Keep responses to 2-4 sentences maximum unless comprehensive analysis is requested
- **CONTEXTUAL**: Connect related information and provide strategic perspective
- **ACTIONABLE**: When appropriate, include brief recommendations or observations
- **NATURAL FLOW**: Write as if providing expert analysis, not database queries

EXCELLENT RESPONSE EXAMPLES:

User: "What is Ajith doing?"
EXCELLENT: "Ajith's current workload reflects a strategic focus on pre-deployment validation and DOCS 2.0 Phase 1 testing activities. He's actively managing 2 stories in progress and has 3 bugs assigned, indicating a balanced approach between feature development and quality assurance. His most recent completion was NDP-20920, a pre-deployment validation task for CDK IS-1.0.0.61, which demonstrates consistent focus in this domain."

User: "Who is working on NDP-123?"
EXCELLENT: "That ticket is assigned to Karthik, who is currently driving functional testing activities—the issue is in 'In Progress' status. As both assignee and reporter, he appears to be taking ownership of this work, suggesting it's a priority item in his current sprint."

User: "How many bugs in NDP?"
EXCELLENT: "The NDP project currently has 15 open bugs across the portfolio. While the majority are classified as Medium priority, there are 2 High priority issues that may require immediate attention to prevent potential impact on system availability or user experience."

BAD RESPONSES (Never do this):
❌ "Found 1 item. Key: NDP-123. Status: In Progress. Assignee: Karthik."
❌ "Ajith has 2 stories and 3 bugs."
❌ "There are 15 bugs."
(Too robotic, lacks insight, reads like database output)

REMEMBER: 
- Lead with intelligent analysis and context
- Use professional, polished language throughout
- Be concise (2-4 sentences typically)
- Provide strategic perspective, not just facts
- Sound like an expert AI assistant, not a search engine
"""

        user_prompt = f"""User asked: "{user_query}"

Query intent: {query_analysis.get('intent', 'unknown')}
JQL executed: {query_analysis.get('jql', 'N/A')}

Data found:
{data_summary}

Provide a natural, helpful response that directly answers their question."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,  # Higher temperature for more varied responses
                max_tokens=1000  # Increased for longer, more complete responses
            )
            
            ai_response = response.choices[0].message.content.strip()
            if not ai_response:
                logger.warning("AI returned an empty response. Falling back to basic summary.")
                fallback_content = self._basic_response(query_analysis, results)
                return {
                    "content": fallback_content,
                    "type": "fallback",
                    "confidence": 0.0
                }
            
            # Determine response type based on content analysis
            response_type = self._determine_response_type(user_query, ai_response, query_analysis)
            
            # Strip HTML tags from AI response
            cleaned_response = self._strip_html_tags(ai_response)
            
            return {
                "content": cleaned_response,
                "type": response_type,
                "confidence": 0.9
            }
            
        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            return {
                "content": self._basic_response(query_analysis, results),
                "type": "fallback",
                "confidence": 0.0
            }
    
    async def _generate_text_response(
        self, 
        user_query: str, 
        results: List[Dict], 
        query_analysis: Dict, 
        total_count: int = None,
        unified_rag_handler = None,
        integrations: List[str] = None,
        theme: Dict[str, str] = None
    ) -> str:
        """
        Generate text response using adaptive response engine
        Returns string (not dict) for backward compatibility
        """
        from services.adaptive_response_engine import AdaptiveResponseEngine
        from theme.colors import get_theme
        
        # Use adaptive response engine
        adaptive_engine = AdaptiveResponseEngine(ai_client=self.client, model=self.model)
        
        # Get theme if not provided
        if theme is None:
            theme = getattr(self, '_current_theme', None) or get_theme("light")
        
        # Determine actual count
        actual_count = total_count if total_count is not None else len(results)
        
        # Generate adaptive response
        response_dict = await adaptive_engine.generate_adaptive_response(
            user_query=user_query,
            query_analysis=query_analysis,
            results=results,
            total_count=actual_count,
            unified_rag_handler=unified_rag_handler,
            integrations=integrations,
            theme=theme
        )
        
        # Extract content from dict response
        if isinstance(response_dict, dict):
            return response_dict.get('content', str(response_dict))
        return str(response_dict)
    
    async def _format_concise_issue_details_with_insights(self, issue: Dict, user_query: str, query_analysis: Dict) -> str:
        """
        Format a single issue in a very simple, human way.
        - AI insight comes first as a short paragraph
        - Then one compact summary line about the ticket
        """
        key = issue.get('key', 'Unknown')
        fields = issue.get('fields', {})

        summary = fields.get('summary', 'No summary')
        status = fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown'
        assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
        reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
        priority = fields.get('priority', {}).get('name', 'Medium') if fields.get('priority') else 'Medium'
        issue_type = fields.get('type', {}).get('name', 'Task') if fields.get('type') else 'Task'

        # Format dates (just show dates, no heavy layout)
        created = fields.get('created', '')
        updated = fields.get('updated', '')
        created_date = created[:10] if created else 'N/A'
        updated_date = updated[:10] if updated else 'N/A'

        # Get AI insight first (short paragraph)
        ai_insights = await self._generate_concise_insights(issue, user_query)

        # Clean professional format
        response = f"""Issue Details

Key: {key}
Summary: {summary}
Status: {status}
Assignee: {assignee}
Priority: {priority}
Type: {issue_type}

Created: {created_date}
Updated: {updated_date}

Context:
{ai_insights}"""

        return response
    
    async def _generate_concise_insights(self, issue: Dict, user_query: str) -> str:
        """
        Generate concise, intelligent AI insights about the issue
        Focus on analysis and understanding, not just copying details
        """
        if not self.client:
            # Fallback if AI not available
            return "AI analysis unavailable. Basic details shown above."
        
        fields = issue.get('fields', {})
        key = issue.get('key', 'Unknown')
        summary = fields.get('summary', 'No summary')
        status = fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown'
        assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
        reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
        priority = fields.get('priority', {}).get('name', 'Medium') if fields.get('priority') else 'Medium'
        issue_type = fields.get('type', {}).get('name', 'Task') if fields.get('type') else 'Task'
        description = fields.get('description', '')
        
        # Remove HTML tags from description
        # re is already imported at module level
        text_description = re.sub(r'<[^>]+>', '', str(description)) if description else ""
        
        system_prompt = """You are Work Buddy, an intelligent AI assistant providing professional insights about Jira issues. Your responses should be natural, concise, and polished—like an expert analyst providing thoughtful context.

Your role:
- Provide intelligent analysis and strategic context about the issue
- Explain what the status/priority/assignment indicates in practical terms
- Identify patterns, implications, or strategic aspects
- Be concise (2-3 sentences max) but insightful
- Use professional, polished language throughout

RESPONSE STYLE:
- **PROFESSIONAL TONE**: Use polished, AI-style language that sounds intelligent and thoughtful
- **CONTEXTUAL ANALYSIS**: Explain the significance of status, priority, and assignment patterns
- **STRATEGIC PERSPECTIVE**: Connect the issue to broader work patterns or project context
- **CONCISE**: Keep to 2-3 sentences maximum
- **NATURAL FLOW**: Write as if providing expert analysis, not just stating facts

EXCELLENT STYLE EXAMPLES:

EXCELLENT: "This issue represents a pre-deployment validation task that was completed by the assignee, indicating a standard quality gate in the release process. The 'Test Complete' status suggests thorough validation was performed before moving to the next phase."

EXCELLENT: "This functional testing story for DOCS 2.0 Phase 1 demonstrates active ownership by the assignee, who both drove and verified the work. The completion status indicates successful validation of UI/UX and workflow checks before advancing the release pipeline."

EXCELLENT: "This medium-priority story reflects planned validation work rather than an urgent production issue. The current status suggests it's progressing through standard quality assurance gates."

BAD STYLE (Never do this):
❌ "The issue is assigned to Ajith. The status is Done."
❌ "This is a bug. It's in progress."
❌ "Karthik is working on this."

REMEMBER: 
- Lead with intelligent analysis and context
- Use professional, polished language
- Be concise (2-3 sentences)
- Provide strategic perspective, not just facts
- Sound like an expert AI assistant"""

        user_prompt = f"""Issue: {key}
Summary: {summary}
Status: {status}
Assignee: {assignee}
Reporter: {reporter}
Priority: {priority}
Type: {issue_type}
Description: {text_description[:500] if text_description else 'No description'}

User asked: "{user_query}"

Provide concise, intelligent insights about this issue. Focus on analysis and understanding, not just repeating the facts shown above."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=200  # Keep it concise
            )
            
            insights = response.choices[0].message.content.strip()
            return insights
            
        except Exception as e:
            logger.error(f"Failed to generate insights: {e}")
            return "Unable to generate AI insights at this time."
    
    def _format_concise_issue_details(self, issue: Dict) -> str:
        """Format issue details in a concise, easy-to-read format (fallback method)"""
        key = issue.get('key', 'Unknown')
        fields = issue.get('fields', {})
        
        summary = fields.get('summary', 'No summary')
        status = fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown'
        assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
        reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
        priority = fields.get('priority', {}).get('name', 'Medium') if fields.get('priority') else 'Medium'
        issue_type = fields.get('type', {}).get('name', 'Task') if fields.get('type') else 'Task'
        
        # Format dates
        created = fields.get('created', '')
        updated = fields.get('updated', '')
        created_date = created[:10] if created else 'N/A'
        updated_date = updated[:10] if updated else 'N/A'
        
        # Status emoji
        status_emoji = "✅" if status in ['Done', 'Closed', 'Resolved'] else "🟡" if status in ['In Progress', 'In Review'] else "🔴"
        
        # Format response
        response = f"""{key} - {summary}

Status: {status} {status_emoji}
Assignee: {assignee}
Reporter: {reporter}
Priority: {priority}
Type: {issue_type}

Created: {created_date}
Updated: {updated_date}"""
        
        # Add description if available (truncated)
        description = fields.get('description', '')
        if description:
            # Remove HTML tags and truncate
            # re is already imported at module level
            text_description = re.sub(r'<[^>]+>', '', str(description))
            if len(text_description) > 200:
                text_description = text_description[:200] + "..."
            response += f"\n\nDescription:\n{text_description}"
        
        return response
    
    def _determine_response_type(self, user_query: str, ai_response: str, query_analysis: Dict) -> str:
        """Intelligently categorize response based on content and query analysis"""
        
        query_lower = user_query.lower()
        response_lower = ai_response.lower()
        
        # Check for specific question types
        if any(word in query_lower for word in ['who', 'reporter', 'assignee', 'person']):
            return 'insight'
        
        if any(word in query_lower for word in ['priority', 'status', 'when', 'date', 'time']):
            return 'insight'
        
        if any(word in query_lower for word in ['recommend', 'suggest', 'should', 'next step', 'action']):
            return 'recommendation'
        
        if any(word in query_lower for word in ['summary', 'overview', 'total', 'count', 'how many']):
            return 'summary'
        
        # Check response content for categorization
        if any(word in response_lower for word in ['recommend', 'suggest', 'should', 'next step', 'action']):
            return 'recommendation'
        
        if any(word in response_lower for word in ['insight', 'pattern', 'trend', 'analysis', 'indicates']):
            return 'insight'
        
        if any(word in response_lower for word in ['summary', 'total', 'overview', 'count']):
            return 'summary'
        
        # Check query intent
        intent = query_analysis.get('intent', '')
        if 'comparison' in intent or 'compare' in query_lower:
            return 'analysis'
        
        if 'single_issue' in intent:
            return 'analysis'
        
        # Default categorization
        if len(response_lower) < 100:  # Short responses
            return 'insight'
        else:  # Longer responses
            return 'analysis'

    def _basic_response(self, query_analysis: Dict, results: List[Dict]) -> str:
        """Fallback response when OpenAI is not available"""
        if not results:
            return "No matching items were found for your query. Consider refining your search criteria or checking if the data exists in the system."
        
        if len(results) == 1 and "count" in results[0]:
            count = results[0]["count"]
            return f"The search returned {count} matching item{'s' if count != 1 else ''} based on your criteria."
        
        return f"The search identified {len(results)} items matching your specified criteria across the available data."
    
    async def _fallback_processing(self, user_query: str) -> Dict[str, Any]:
        """Enhanced fallback when OpenAI is not available"""
        try:
            # Get available projects
            projects = await self.jira_client.get_projects()
            project_keys = [p.get('key', '') for p in projects]
        
            # Enhanced keyword-based processing
            query_lower = user_query.lower()
            
            # Detect specific issue keys (e.g., CCM-283, CES-123)
            # re is already imported at module level
            issue_key_pattern = r'\b([A-Z]{2,}-\d+)\b'
            issue_key_match = re.search(issue_key_pattern, user_query, re.IGNORECASE)
            specific_issue_key = issue_key_match.group(1) if issue_key_match else None
            
            # Detect specific project mentions
            mentioned_project = None
            for project in projects:
                if project.get('key', '').lower() in query_lower:
                    mentioned_project = project.get('key', '')
                    break
            
            # Detect specific issue types
            issue_type = None
            if any(word in query_lower for word in ['story', 'stories', 'user story']):
                issue_type = 'Story'
            elif any(word in query_lower for word in ['defect', 'defects']):
                issue_type = 'Defect'
            elif any(word in query_lower for word in ['bug', 'bugs']):
                issue_type = 'Bug'
            elif any(word in query_lower for word in ['test case', 'test cases', 'test', 'tests']):
                issue_type = 'Test'
            elif any(word in query_lower for word in ['task', 'tasks']):
                issue_type = 'Task'
            
            # Detect assignee mentions
            assignee = None
            if 'ashwin' in query_lower:
                assignee = 'Ashwin Thyagarajan'
            elif 'ashwini' in query_lower:
                assignee = 'Ashwini Kumar'
            
            # Build JQL based on detected entities
            jql_parts = []
            
            if specific_issue_key:
                # Specific issue query
                jql_parts.append(f'issue = "{specific_issue_key}"')
            elif mentioned_project:
                jql_parts.append(f'project = "{mentioned_project}"')
            elif project_keys:
                project_list = ", ".join([f'"{k}"' for k in project_keys])
                jql_parts.append(f'project in ({project_list})')
            
            if issue_type:
                # Use 'type' instead of 'type' for broader compatibility
                jql_parts.append(f'type = "{issue_type}"')
            
            if assignee:
                jql_parts.append(f'assignee = "{assignee}"')
            
            # Detect status queries
            if any(word in query_lower for word in ['open', 'to do', 'in progress']):
                jql_parts.append('status != "Done"')
            elif 'done' in query_lower or 'completed' in query_lower:
                jql_parts.append('status = "Done"')

            # Detect date range from natural language and apply as updated filters
            date_from, date_to = self._extract_date_range(user_query)
            if date_from:
                jql_parts.append(f'updated >= "{date_from}"')
            if date_to:
                # add end-of-day time
                jql_parts.append(f'updated <= "{date_to} 23:59"')
            
            if jql_parts:
                jql = ' AND '.join(jql_parts)
            else:
                project_list = ", ".join([f'"{k}"' for k in project_keys])
                jql = f'project in ({project_list})'
            
            # Only add ORDER BY for non-specific issue queries
            if not specific_issue_key:
                jql += ' ORDER BY updated DESC'
            
            # Execute query
            jql_result = await self._execute_jql(jql, "enhanced_fallback")
            # Handle both old format (list) and new format (dict with results)
            if isinstance(jql_result, dict) and 'results' in jql_result:
                results = jql_result['results']
            else:
                results = jql_result if isinstance(jql_result, list) else []
            
            # Generate enhanced response
            response = self._enhanced_fallback_response(user_query, specific_issue_key, mentioned_project, issue_type, assignee, results)
            
            return {
                "jql": jql,
                "response": response,
                "data": results,
                "intent": "enhanced_fallback",
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Enhanced fallback processing failed: {e}")
            return {
                "jql": "",
                "response": f"I apologize, but I encountered an error processing your request: {str(e)}. Please try rephrasing your question.",
                "data": [],
                "intent": "error",
                "success": False
            }
    
    def _enhanced_fallback_response(self, user_query: str, specific_issue_key: str, project: str, issue_type: str, assignee: str, results: List[Dict]) -> str:
        """Generate enhanced fallback response"""
        if not results:
            return "I couldn't find any matching items. Try being more specific about the project, assignee, or issue type."
        
        # Count different types
        stories = sum(1 for r in results if r.get('fields', {}).get('type', {}).get('name', '') == 'Story')
        bugs = sum(1 for r in results if r.get('fields', {}).get('type', {}).get('name', '') in ['Bug', 'Defect'])
        tasks = sum(1 for r in results if r.get('fields', {}).get('type', {}).get('name', '') == 'Task')
        
        response_parts = []
        
        # Context-aware introduction
        if specific_issue_key:
            response_parts.append(f"Here are the details for {specific_issue_key}:")
        elif assignee:
            response_parts.append(f"Here's what I found for {assignee}:")
        elif project:
            response_parts.append(f"Here's what I found in the {project} project:")
        elif issue_type:
            response_parts.append(f"Here are the {issue_type.lower()}s I found:")
        else:
            response_parts.append("Here's what I found:")
        
        # Summary
        total = len(results)
        if total == 1:
            item = results[0]
            key = item.get('key', '')
            summary = item.get('fields', {}).get('summary', 'No summary')
            status = item.get('fields', {}).get('status', {}).get('name', 'Unknown')
            assignee_name = item.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned')
            
            response_parts.extend([
                f"\n**{key}: {summary}**",
                f"Status: {status}",
                f"Assignee: {assignee_name}",
                f"Priority: {item.get('fields', {}).get('priority', {}).get('name', 'Unknown')}",
                f"\nLeadership note: {assignee_name} owns this {item.get('fields', {}).get('type', {}).get('name', 'item').lower()} currently to do. Priority is {item.get('fields', {}).get('priority', {}).get('name', 'unknown').lower()}."
            ])
        else:
            response_parts.append(f"\nFound {total} items:")
            if stories > 0:
                response_parts.append(f"- {stories} stories")
            if bugs > 0:
                response_parts.append(f"- {bugs} bugs")
            if tasks > 0:
                response_parts.append(f"- {tasks} tasks")
            
            # Show first few items
            for i, item in enumerate(results[:3]):
                key = item.get('key', '')
                summary = item.get('fields', {}).get('summary', 'No summary')
                status = item.get('fields', {}).get('status', {}).get('name', 'Unknown')
                assignee_name = item.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned')
                
                response_parts.append(f"\n**{key}**: {summary}")
                response_parts.append(f"Status: {status} | Assignee: {assignee_name}")
            
            if total > 3:
                response_parts.append(f"\n...and {total - 3} more items.")
        
        # Add note about OpenAI
        response_parts.append(f"\n**Note**: For more intelligent responses and natural language processing, configure your OpenAI API key in backend/config.env")
        
        return "\n".join(response_parts)
    
    def _create_detailed_analysis(self, results: List[Dict], user_query: str, total_count: int = None, retrieved_count: int = None, specific_issue_context: Dict = None) -> str:
        """Create detailed analysis of Jira results with proper field extraction and accurate count reporting"""
        if not results:
            return "No items found."
        
        # Use provided counts or fall back to len(results)
        actual_total = total_count if total_count is not None else len(results)
        actual_retrieved = retrieved_count if retrieved_count is not None else len(results)
        
        # Extract and analyze data properly from Jira structure
        analysis = {
            'total_items': actual_total,
            'retrieved_items': actual_retrieved,
            'by_assignee': {},
            'by_reporter': {},
            'by_status': {},
            'by_type': {},
            'by_priority': {},
            'by_created_date': {},
            'by_updated_date': {},
            'items_list': [],
            'specific_issue_context': specific_issue_context
        }
        
        for item in results:
            # Extract fields properly from Jira structure
            key = item.get('key', 'UNKNOWN')
            fields = item.get('fields', {})
            
            summary = fields.get('summary', 'No summary')
            status = fields.get('status', {}).get('name', 'Unknown') if fields.get('status') else 'Unknown'
            issue_type = fields.get('type', {}).get('name', 'Unknown') if fields.get('type') else 'Unknown'
            priority = fields.get('priority', {}).get('name', 'Unknown') if fields.get('priority') else 'Unknown'
            assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
            reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
            
            # Extract dates
            created_date = fields.get('created', 'Unknown')
            updated_date = fields.get('updated', 'Unknown')
            resolution_date = fields.get('resolutiondate', 'Not resolved')
            
            # Extract project information
            project = fields.get('project', {}).get('name', 'Unknown') if fields.get('project') else 'Unknown'
            project_key = fields.get('project', {}).get('key', 'Unknown') if fields.get('project') else 'Unknown'
            
            # Extract labels and components
            labels = fields.get('labels', [])
            components = [comp.get('name', 'Unknown') for comp in fields.get('components', [])]
            
            # Extract story points if available
            story_points = fields.get('customfield_10016', 'Not estimated')  # Common story points field
            
            # Extract fix versions
            fix_versions = [version.get('name', 'Unknown') for version in fields.get('fixVersions', [])]
            
            # Count by assignee
            if assignee not in analysis['by_assignee']:
                analysis['by_assignee'][assignee] = 0
            analysis['by_assignee'][assignee] += 1
            
            # Count by reporter
            if reporter not in analysis['by_reporter']:
                analysis['by_reporter'][reporter] = 0
            analysis['by_reporter'][reporter] += 1
            
            # Count by status
            if status not in analysis['by_status']:
                analysis['by_status'][status] = 0
            analysis['by_status'][status] += 1
            
            # Count by type
            if issue_type not in analysis['by_type']:
                analysis['by_type'][issue_type] = 0
            analysis['by_type'][issue_type] += 1
            
            # Count by priority
            if priority not in analysis['by_priority']:
                analysis['by_priority'][priority] = 0
            analysis['by_priority'][priority] += 1
            
            # Count by created date (group by month)
            if created_date != 'Unknown':
                try:
                    from datetime import datetime
                    created_month = datetime.fromisoformat(created_date.replace('Z', '+00:00')).strftime('%Y-%m')
                    if created_month not in analysis['by_created_date']:
                        analysis['by_created_date'][created_month] = 0
                    analysis['by_created_date'][created_month] += 1
                except:
                    pass
            
            # Count by updated date (group by month)
            if updated_date != 'Unknown':
                try:
                    from datetime import datetime
                    updated_month = datetime.fromisoformat(updated_date.replace('Z', '+00:00')).strftime('%Y-%m')
                    if updated_month not in analysis['by_updated_date']:
                        analysis['by_updated_date'][updated_month] = 0
                    analysis['by_updated_date'][updated_month] += 1
                except:
                    pass
            
            # Add to items list
            analysis['items_list'].append({
                'key': key,
                'summary': summary,
                'status': status,
                'type': issue_type,
                'priority': priority,
                'assignee': assignee,
                'reporter': reporter,
                'created_date': created_date,
                'updated_date': updated_date,
                'resolution_date': resolution_date,
                'project': project,
                'project_key': project_key,
                'labels': labels,
                'components': components,
                'story_points': story_points,
                'fix_versions': fix_versions
            })
        
        # Create comprehensive summary
        summary_parts = []

        # Add specific issue context if available (for reporter queries)
        if specific_issue_context and specific_issue_context.get('issue_key') and specific_issue_context.get('reporter'):
            summary_parts.append(f"**{specific_issue_context['reporter']} is the reporter of {specific_issue_context['issue_key']}.**")
            summary_parts.append("")

        # Show accurate count information in the requested format
        if actual_total == actual_retrieved:
            summary_parts.append(f"Found {analysis['total_items']} total items (complete dataset analyzed):")
        else:
            summary_parts.append(f"Showing segregations for {analysis['retrieved_items']} issues (out of {analysis['total_items']} total).")

        # Add type breakdown
        if analysis['by_type']:
            summary_parts.append("\n**Issue Type Breakdown:**")
            for issue_type, count in sorted(analysis['by_type'].items(), key=lambda x: x[1], reverse=True):
                summary_parts.append(f"- {issue_type}: {count}")

        # Add assignee breakdown
        if analysis['by_assignee']:
            summary_parts.append("\n**Assignee Breakdown:**")
            for assignee, count in sorted(analysis['by_assignee'].items(), key=lambda x: x[1], reverse=True):
                summary_parts.append(f"- {assignee}: {count} items")

        # Add reporter breakdown
        if analysis['by_reporter']:
            summary_parts.append("\n**Reporter Breakdown:**")
            for reporter, count in sorted(analysis['by_reporter'].items(), key=lambda x: x[1], reverse=True):
                summary_parts.append(f"- {reporter}: {count} items")

        # Add status breakdown
        if analysis['by_status']:
            summary_parts.append("\n**Status Breakdown:**")
            for status, count in sorted(analysis['by_status'].items(), key=lambda x: x[1], reverse=True):
                summary_parts.append(f"- {status}: {count}")

        # Add priority breakdown
        if analysis['by_priority']:
            summary_parts.append("\n**Priority Breakdown:**")
            for priority, count in sorted(analysis['by_priority'].items(), key=lambda x: x[1], reverse=True):
                summary_parts.append(f"- {priority}: {count}")

        # Add created date breakdown
        if analysis['by_created_date']:
            summary_parts.append("\n**Created Date Breakdown:**")
            for date, count in sorted(analysis['by_created_date'].items(), reverse=True):
                summary_parts.append(f"- {date}: {count}")

        # Add updated date breakdown
        if analysis['by_updated_date']:
            summary_parts.append("\n**Updated Date Breakdown:**")
            for date, count in sorted(analysis['by_updated_date'].items(), reverse=True):
                summary_parts.append(f"- {date}: {count}")

        # Add sample items
        summary_parts.append("\n**Sample Items:**")
        for i, item in enumerate(analysis['items_list'][:5]):
            summary_parts.append(f"- {item['key']}: {item['summary']}")
            summary_parts.append(f"  Status: {item['status']} | Priority: {item['priority']} | Type: {item['type']}")
            summary_parts.append(f"  Assignee: {item['assignee']} | Reporter: {item['reporter']}")
            if item['created_date'] != 'Unknown':
                summary_parts.append(f"  Created: {item['created_date'][:10]} | Updated: {item['updated_date'][:10]}")
            if item['story_points'] != 'Not estimated':
                summary_parts.append(f"  Story Points: {item['story_points']}")
            summary_parts.append("")

        if len(analysis['items_list']) > 5:
            summary_parts.append(f"... and {len(analysis['items_list']) - 5} more items.")

        return "\n".join(summary_parts)

    def _prepare_chunked_data_summary(
        self,
        results: List[Dict],
        user_query: str,
        total_count: int,
        retrieved_count: int,
        specific_issue_context: Dict,
        chunk_limit: int
    ) -> str:
        """Summarize large result sets in chunks before sending to the AI model"""
        if chunk_limit <= 0:
            chunk_limit = 200

        total_chunks = math.ceil(len(results) / chunk_limit)
        chunk_summaries = []

        for chunk_index in range(total_chunks):
            start = chunk_index * chunk_limit
            chunk = results[start:start + chunk_limit]
            chunk_analysis = self._create_detailed_analysis(
                chunk,
                f"{user_query} (chunk {chunk_index + 1}/{total_chunks})",
                total_count,
                len(chunk),
                specific_issue_context
            )
            if len(chunk_analysis) > 800:
                chunk_analysis = chunk_analysis[:800] + " ...(truncated)"

            chunk_summaries.append(
                f"Chunk {chunk_index + 1}/{total_chunks} summary (items {start + 1}-{start + len(chunk)}):\n{chunk_analysis}"
            )

        header = (
            f"Chunked analysis for {len(results)} retrieved items "
            f"(total_count={total_count or len(results)}, retrieved_count={retrieved_count or len(results)}).\n"
            "Use these per-chunk insights to craft the final response."
        )
        return header + "\n\n" + "\n\n".join(chunk_summaries)
    
    async def _generate_comparison_response(self, user_query: str, query_analysis: Dict[str, Any], all_results: List[Dict]) -> str:
        """Generate comparison response using OpenAI"""
        try:
            # Prepare comparison data summary
            comparison_summary = []
            
            for result_set in all_results:
                entity = result_set["entity"]
                count = result_set["count"]
                results = result_set["results"]
                
                if result_set.get("error"):
                    comparison_summary.append(f"{entity}: Error - {result_set['error']}")
                    continue
                
                # Analyze the results for this entity
                if results:
                    retrieved_count = result_set.get('retrieved_count', len(results))
                    entity_analysis = self._create_detailed_analysis(results, f"{entity} analysis", count, retrieved_count)
                    comparison_summary.append(f"{entity}: {count} items\n{entity_analysis}")
                else:
                    comparison_summary.append(f"{entity}: 0 items (no data found)")
            
            comparison_data = "\n\n---\n\n".join(comparison_summary)
            
            # Generate comparison response using OpenAI
            system_prompt = """You are an elite AI leadership consultant specializing in comparative analysis and strategic decision-making for engineering teams. You provide sophisticated insights that help leaders make informed resource allocation and team management decisions.

RESPONSE FORMAT - ALWAYS use this exact structure with proper line breaks:

Strategic Comparison Analysis

[Clear comparison summary with exact numbers, winner/leader identification, and business impact assessment]

Key Metrics & Business Impact

[Detailed metrics comparison with specific numbers, performance indicators, and organizational implications]

Strategic Insights & Patterns

- [Key difference 1 with business context and implications]
- [Key difference 2 with resource allocation insights]
- [Key difference 3 with performance optimization opportunities]

Strategic Recommendations

- [Specific actionable recommendation 1 with implementation strategy and business impact]
- [Specific actionable recommendation 2 with resource allocation guidance and success metrics]
- [Specific actionable recommendation 3 with team optimization and performance improvement]

Risk Assessment & Mitigation

- [Identify potential risk 1 with mitigation strategy and contingency planning]
- [Identify potential risk 2 with monitoring approach and early warning indicators]
- [Identify potential risk 3 with resource reallocation and backup strategies]

Next Steps & Action Plan

- [Clear next step 1 with ownership, timeline, and success criteria]
- [Clear next step 2 with resource requirements and implementation approach]
- [Clear next step 3 with follow-up actions and performance monitoring]

IMPORTANT: Use proper line breaks (\n) between sections and bullet points. Each section should be on its own line with clear spacing.

Be specific, actionable, and leadership-focused with clear business impact and implementation strategies."""

            user_prompt = f"""User asked: "{user_query}"

Comparison data:
{comparison_data}

Provide a comprehensive comparison analysis with strategic insights and clear recommendations."""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=800
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Error generating comparison response: {e}")
            # Fallback to simple comparison
            return self._fallback_comparison_response(user_query, all_results)
    
    def _fallback_comparison_response(self, user_query: str, all_results: List[Dict]) -> str:
        """Fallback comparison response when OpenAI fails"""
        try:
            response_parts = ["**Comparison Analysis**", ""]
            
            # Extract entities and counts
            entities_data = []
            for result_set in all_results:
                entity = result_set["entity"]
                count = result_set["count"]
                entities_data.append((entity, count))
            
            # Sort by count (descending)
            entities_data.sort(key=lambda x: x[1], reverse=True)
            
            # Summary
            response_parts.append("**Results Summary:**")
            for entity, count in entities_data:
                response_parts.append(f"- **{entity}**: {count} items")
            
            response_parts.append("")
            
            # Determine winner
            if len(entities_data) >= 2:
                winner_entity, winner_count = entities_data[0]
                runner_up_entity, runner_up_count = entities_data[1]
                
                if winner_count > runner_up_count:
                    response_parts.append(f"**Winner**: {winner_entity} with {winner_count} items")
                    difference = winner_count - runner_up_count
                    response_parts.append(f"**Difference**: {difference} more items than {runner_up_entity}")
                elif winner_count == runner_up_count:
                    response_parts.append(f"**Tied**: Both {winner_entity} and {runner_up_entity} have {winner_count} items")
                
                response_parts.append("")
            
            # Basic insights
            response_parts.append("**Key Insights:**")
            total_items = sum(count for _, count in entities_data)
            if total_items > 0:
                for entity, count in entities_data:
                    percentage = (count / total_items) * 100
                    response_parts.append(f"- {entity} handles {percentage:.1f}% of the workload")
            
            return "\n".join(response_parts)
            
        except Exception as e:
            logger.error(f"Error in fallback comparison: {e}")
            return f"Comparison completed. Found data for {len(all_results)} entities."
    
    async def _process_confluence_query(self, user_query: str) -> Dict[str, Any]:
        """Process Confluence-specific queries - defaults to IS (Intelligence Suite) space"""
        try:
            logger.info("=" * 80)
            logger.info("📚 CONFLUENCE QUERY PROCESSING")
            logger.info("=" * 80)
            logger.info(f"📝 Query: '{user_query}'")
            logger.info("🔍 Approach: Vector Search (RAG) with Databricks")
            logger.info("   → Step 1: Generate query embedding using OpenAI")
            logger.info("   → Step 2: Search Databricks Vector Search index")
            logger.info("   → Step 3: Retrieve top similar documents")
            logger.info("   → Step 4: Generate response using LLM with context")
            logger.info("=" * 80)
            
            # Default to IS space for NDP project documentation
            default_space = self.PROJECT_CONFLUENCE_SPACES.get('default', 'IS')
            
            # Check for special navigation queries first
            query_lower = user_query.lower()
            
            # Check for People Directory query
            people_keywords = ['people directory', 'people', 'directory', 'browse people', 'show people', 'list people', 'team members', 'employees']
            is_people_query = any(keyword in query_lower for keyword in people_keywords)
            
            if is_people_query:
                base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
                people_url = f"{base_url}/browsepeople.action"
                response = f"""**People Directory**

I found the People Directory for you.

**Access People Directory:**
{people_url}

You can browse all team members, view their profiles, and find contact information here.

**Quick Actions:**
- Browse all team members
- Search for specific people
- View team member profiles
- Find contact information"""
                return {
                    "jql": "confluence_navigation:people_directory",
                    "response": response,
                    "data": [{"type": "navigation", "url": people_url, "title": "People Directory"}],
                    "intent": "confluence_navigation",
                    "success": True,
                    "navigation_url": people_url
                }
            
            # PRIORITY 0: First check for known project names in the query
            # This prevents false positives from generic pattern matching
            space_key = None
            space_name_mappings = {
                'intelligent suite': 'IS',
                'intelligent': 'IS',
                'information systems': 'IS',
                'information technology': 'IT',
                'development': 'DEV',
                'quality assurance': 'QA',
                'project management': 'PM',
                'human resources': 'HR',
                'finance': 'FIN',
                'operations': 'OPS',
                'engineering': 'ENG',
                'production': 'PROD',
                'testing': 'TEST',
                'engineering modernization': 'EMT',
                'engineering efficiency transformation': 'EMT',
                'dms modern enablement': 'EMT',
                'dms enablement': 'EMT',
                'automation dms': 'EMT',
                'modern enablement': 'EMT'
            }
            
            # Check for multi-word names first (more specific), sorted by length descending
            for space_name, space_code in sorted(space_name_mappings.items(), key=lambda x: -len(x[0])):
                if space_name in query_lower:
                    space_key = space_code
                    logger.info(f"PRIORITY: Mapped space name '{space_name}' to space key: {space_key}")
                    break
            
            # Check for project/space display query patterns ONLY if no project name found
            # Patterns: "display IS", "show IS project", "open IS space", "IS project", "IS space", "show me IS", "open IS"
            if not space_key:
                display_patterns = [
                    r'display\s+([A-Z0-9]{2,4})\b',  # Only short codes (2-4 chars) to avoid false positives
                    r'show\s+(?:me\s+)?([A-Z0-9]{2,4})(?:\s+project)?\b',  # Only short codes
                    r'open\s+([A-Z0-9]{2,4})(?:\s+space)?\b',  # Only short codes
                    r'([A-Z0-9]{2,4})\s+project\b',  # Only short codes
                    r'([A-Z0-9]{2,4})\s+space\b',  # Only short codes
                    r'project\s+([A-Z0-9]{2,4})\b',  # Only short codes
                    r'space\s+([A-Z0-9]{2,4})\b',  # Only short codes
                    r'go\s+to\s+([A-Z0-9]{2,4})\b',  # Only short codes
                    r'navigate\s+to\s+([A-Z0-9]{2,4})\b',  # Only short codes
                    r'browse\s+([A-Z0-9]{2,4})\b'  # Only short codes
                ]
                
                known_spaces = ['IS', 'IT', 'DEV', 'QA', 'PM', 'HR', 'FIN', 'OPS', 'ENG', 'PROD', 'TEST', 'EMT', 'DMS']
                for pattern in display_patterns:
                    match = re.search(pattern, user_query, re.IGNORECASE)
                    if match:
                        potential_key = match.group(1).upper()
                        # Only accept known space keys to avoid false positives
                        if potential_key in known_spaces:
                            space_key = potential_key
                            logger.info(f"Detected known space key from pattern: {space_key}")
                            break
            
            # Also check for common space names mentioned (standalone or in context)
            if not space_key:
                common_spaces = ['IS', 'IT', 'DEV', 'QA', 'PM', 'HR', 'FIN', 'OPS', 'ENG', 'PROD', 'TEST', 'EMT', 'DMS']
                for space in common_spaces:
                    # Check if space appears as a word (not part of another word)
                    space_pattern = r'\b' + re.escape(space) + r'\b'
                    if re.search(space_pattern, user_query, re.IGNORECASE):
                        space_key = space
                        logger.info(f"Detected common space: {space_key}")
                        break
            
            # PRIORITY 2: Handle patterns like "display [content] in [space]" or "[content] in [space]"
            # But only check for known project names, not generic uppercase words
            if not space_key:
                # Pattern: "in [space name]" or "in [space key]" - prioritize known names
                in_space_patterns = [
                    r'in\s+(?:the\s+)?(?:intelligent\s+suite|IS)\b',
                    r'in\s+(?:the\s+)?(?:information\s+systems|IS)\b',
                    r'from\s+(?:the\s+)?(?:intelligent\s+suite|IS)\s+(?:project|space)',
                    r'from\s+(?:the\s+)?(?:information\s+systems|IS)\s+(?:project|space)',
                    r'in\s+([A-Z0-9]{2,10})\s+(?:space|project)',
                    # Only match "in [KEY]" if it's followed by "space" or "project" to avoid false positives
                    r'in\s+([A-Z0-9]{2,4})\s+(?:space|project)\b'
                ]
                
                for pattern in in_space_patterns:
                    match = re.search(pattern, user_query, re.IGNORECASE)
                    if match:
                        if 'intelligent suite' in match.group(0).lower() or 'information systems' in match.group(0).lower():
                            space_key = 'IS'
                            logger.info(f"Detected 'intelligent suite' or 'information systems' -> IS")
                        elif len(match.groups()) > 0:
                            potential_key = match.group(1).upper()
                            # Only accept if it's a known space key or very short (2-4 chars) to avoid false positives
                            known_spaces = ['IS', 'IT', 'DEV', 'QA', 'PM', 'HR', 'FIN', 'OPS', 'ENG', 'PROD', 'TEST', 'EMT', 'DMS']
                            if (potential_key in known_spaces) or (2 <= len(potential_key) <= 4 and potential_key.isalnum()):
                                space_key = potential_key
                                logger.info(f"Detected space from 'in [space]' pattern: {space_key}")
                        break
            
            if space_key:
                # Check if this is a content search query (not just navigation)
                # If query contains search terms beyond just the space name, search within that space
                content_keywords = ['document', 'page', 'kpi', 'kpis', 'metric', 'metrics', 'report', 'guide', 
                                   'top', 'show', 'find', 'search', 'get', 'display', 'list', 'view']
                has_content_query = any(keyword in query_lower for keyword in content_keywords)
                
                # Also check if query has meaningful search terms beyond space name
                search_terms = self._extract_confluence_search_terms(user_query)
                # Remove space-related terms from search terms
                space_terms = [space_key.lower(), 'intelligent', 'suite', 'space', 'project', 'display', 'show', 'open']
                meaningful_terms = [term for term in search_terms.split() if term.lower() not in space_terms]
                has_meaningful_search = len(meaningful_terms) > 0
                
                if has_content_query or has_meaningful_search:
                    # This is a search query - search within the specified space
                    logger.info(f"Detected content search query in space {space_key}. Searching within space...")

                    # Extract search query (remove space-related terms)
                    if meaningful_terms:
                        search_query = ' '.join(meaningful_terms)
                    else:
                        search_query = re.sub(r'\b(intelligent\s+suite|IS|space|project|from|details|show\s+me|get|find)\b', '', user_query, flags=re.IGNORECASE).strip()

                    if not search_query or len(search_query.strip()) < 2:
                        search_query = re.sub(r'\b(show\s+me|get|find|give\s+me|can\s+you|please|details|from|the|intelligent\s+suite|IS|space|project)\b', '', user_query, flags=re.IGNORECASE).strip()

                    search_query = ' '.join(search_query.split())

                    # --- AI Planner (preferred) → regex planner (fallback) ---
                    _ai_plan = await self._ai_plan_search(user_query, space_key=space_key)
                    if _ai_plan and _ai_plan.get("confluence_search_queries"):
                        search_query = _ai_plan["confluence_search_queries"][0]
                        logger.info(f"[AIPlanner] Space search term: '{search_query}'")
                    else:
                        # Fallback: legacy regex planner
                        _qp_sp = _confluence_query_planner.plan(user_query, space=space_key)
                        if _qp_sp.target_page:
                            _qp_term = _qp_sp.target_page
                            _qp_term = re.sub(
                                r'\s+(?:in|for|on|from)\s+' + re.escape(space_key) + r'\b',
                                '', _qp_term, flags=re.IGNORECASE
                            ).strip()
                            _qp_term = re.sub(r'\b' + re.escape(space_key) + r'\b', '', _qp_term, flags=re.IGNORECASE).strip()
                            _qp_term = ' '.join(_qp_term.split())
                            if _qp_term and len(_qp_term) >= 3:
                                search_query = _qp_term
                                logger.info(f"[QueryPlanner] Space search using smart term: '{search_query}'")

                    logger.info(f"Searching for '{search_query}' in space {space_key}")

                    # ---- Index-first: try vector store filtered by space ----
                    _HIGH = 0.85; _LOW = 0.50
                    space_results = None
                    try:
                        unified_rag = get_unified_rag_handler()
                        if unified_rag and unified_rag.vector_store:
                            idx_docs = await unified_rag.hybrid_search(
                                query=user_query, top_k=8,
                                source_filter=[SourceType.CONFLUENCE], min_score=_LOW
                            )
                            # Filter to requested space
                            idx_docs = [d for d in idx_docs if d.metadata.get("space", "").upper() == space_key.upper()]
                            if idx_docs:
                                top_score = idx_docs[0].similarity_score or 0.0
                                logger.info(f"✅ [Space index] {len(idx_docs)} chunks for space {space_key} (top={top_score:.3f})")
                                # Build context and generate answer
                                ctx_parts, src_pages = [], {}
                                for doc in idx_docs:
                                    m = doc.metadata
                                    pid = m.get("page_id", "")
                                    if pid and pid not in src_pages:
                                        src_pages[pid] = {"title": m.get("title",""), "url": m.get("url",""), "breadcrumb": m.get("breadcrumb",""), "space": m.get("space",""), "space_name": m.get("space_name","")}
                                    ct = m.get("chunk_type",""); bc = m.get("breadcrumb",""); tbl = m.get("table_name",""); sec = m.get("section_heading","")
                                    hdr = f"[TABLE: {tbl or m.get('title','')}] ({bc})" if ct == "table_row" else (f"[SECTION: {sec}] ({bc})" if ct == "section" and sec else f"[{bc}]" if bc else f"[{m.get('title','')}]")
                                    ctx_parts.append(f"{hdr}\n{doc.text.strip()}")
                                chunk_context = "\n\n---\n\n".join(ctx_parts)
                                if self.client:
                                    conf_note = "The retrieved chunks are highly relevant." if top_score >= _HIGH else "The retrieved chunks are moderately relevant; answer based on what you found."
                                    try:
                                        llm_r = self.client.chat.completions.create(
                                            model=self.model,
                                            messages=[
                                                {"role": "system", "content": f"You are a knowledgeable assistant. Answer the user's question DIRECTLY using ONLY the retrieved Confluence chunks below. Synthesize the answer; do NOT just list page titles. Cite the source breadcrumb at the end. {conf_note}"},
                                                {"role": "user", "content": f"User question: {user_query}\n\nRetrieved chunks:\n\n{chunk_context[:8000]}"}
                                            ], max_tokens=2000, temperature=0.2
                                        )
                                        idx_answer = llm_r.choices[0].message.content.strip()
                                    except Exception:
                                        idx_answer = f"**Confluence Results (space={space_key})**\n\n{chunk_context[:3000]}"
                                else:
                                    idx_answer = f"**Confluence Results (space={space_key})**\n\n{chunk_context[:3000]}"
                                base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
                                return {
                                    "jql": f"confluence_index_space:{space_key}:{search_query}",
                                    "response": idx_answer + f"\n\n**{space_key} Space:** {base_url}/display/{space_key}",
                                    "data": [{"title": v["title"], "url": v["url"], "breadcrumb": v["breadcrumb"], "space": v["space"], "space_name": v["space_name"], "type": "confluence_indexed"} for v in src_pages.values()],
                                    "intent": "confluence_search_in_space", "success": True,
                                    "space": space_key, "index_used": True
                                }
                            else:
                                logger.info(f"ℹ️ No indexed chunks for space {space_key} — falling back to live CQL")
                    except Exception as _ie:
                        logger.warning(f"⚠️ Index space search failed: {_ie}")
                    # ---- Fallback: live CQL search in space ----
                    if _ai_plan and len(_ai_plan.get("confluence_search_queries", [])) > 1:
                        space_results = await self._execute_ai_confluence_searches(
                            _ai_plan["confluence_search_queries"], space_key
                        )
                    else:
                        space_results = await self.confluence_client.search_in_space(search_query, space=space_key, limit=10)

                    # ---- Extra fallback: broaden to full-text search if space search empty ----
                    if not space_results:
                        logger.info(f"No results in space {space_key} for '{search_query}', trying broader full-text search...")
                        try:
                            space_results = await self.confluence_client.search(search_query, limit=10)
                            if space_results:
                                logger.info(f"Broader full-text search found {len(space_results)} results")
                        except Exception as _fe:
                            logger.warning(f"Broader full-text search failed: {_fe}")

                    # ---- Extra fallback: try with individual keywords ----
                    if not space_results and len(search_query.split()) > 1:
                        for keyword in search_query.split():
                            if len(keyword) >= 4:
                                try:
                                    kw_results = await self.confluence_client.search_in_space(keyword, space=space_key, limit=10)
                                    if kw_results:
                                        space_results = kw_results
                                        logger.info(f"Keyword fallback '{keyword}' found {len(kw_results)} results in {space_key}")
                                        break
                                except Exception:
                                    pass

                    if space_results:
                        base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
                        display_url = f"{base_url}/display/{space_key}"
                        
                        # Fetch full page content for each result with proper error handling
                        enriched_results = []
                        for result in space_results[:5]:  # Limit to top 5 for performance
                            content_obj = result.get('content', {})
                            content_id = content_obj.get('id') if isinstance(content_obj, dict) else None
                            
                            if content_id:
                                try:
                                    # Get full page with all expanded fields
                                    full_page = await self.confluence_client.get_page(content_id)
                                    if full_page:
                                        # Verify we have the latest version
                                        version_info = full_page.get('version', {})
                                        if version_info:
                                            logger.debug(f"Page {content_id}: Version {version_info.get('number')}, Modified: {version_info.get('when')}")
                                        
                                        # Add full page content to result
                                        result['full_content'] = full_page
                                        enriched_results.append(result)
                                    else:
                                        logger.warning(f"get_page returned None for {content_id}")
                                        enriched_results.append(result)
                                except Exception as e:
                                    logger.warning(f"Failed to fetch full content for page {content_id}: {e}", exc_info=True)
                                    # Still include result even if full fetch failed
                                    enriched_results.append(result)
                            else:
                                logger.warning(f"No content ID found in result: {result.get('title', 'Unknown')}")
                                enriched_results.append(result)
                        
                        # Generate response with full page content
                        if _ai_plan:
                            _date_f = ""
                            _col_f  = _ai_plan.get("extract_field") or ""
                            _hint   = f"TASK: {_ai_plan.get('extract_type', 'factual').upper()} lookup.\n"
                            if _ai_plan.get("row_identifier"):
                                _hint += f"ROW IDENTIFIER: {_ai_plan['row_identifier']}\n"
                            if _col_f:
                                _hint += f"EXTRACT FIELD: {_col_f}\n"
                        else:
                            _sp_plan = _confluence_query_planner.plan(user_query)
                            _date_f  = _sp_plan.date_filter or ""
                            _col_f   = _sp_plan.column_filter or ""
                            _hint    = _sp_plan.build_llm_hint()
                        response = await self._generate_confluence_response(
                            user_query, enriched_results,
                            date_filter=_date_f,
                            column_filter=_col_f,
                            llm_hint=_hint,
                        )

                        # Add space link at the end
                        response += f"\n\n**{space_key} Space:** {display_url}"
                        
                        return {
                            "jql": f"confluence_search_in_space:{space_key}:{search_query}",
                            "response": response,
                            "data": enriched_results,  # Return enriched results with full content
                            "intent": "confluence_search_in_space",
                            "success": True,
                            "space": space_key,
                            "navigation_url": display_url
                        }
                    else:
                        # No results found in any search, but still provide space link
                        base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
                        display_url = f"{base_url}/display/{space_key}"
                        response = f"""**Confluence Search**

I searched for **"{search_query}"** in the {space_key} space and across Confluence but didn't find matching pages.

**Browse {space_key} Space:** {display_url}

**Suggestions:**
- Try rephrasing your query with the exact page title
- The page might be in a different Confluence space
- Browse the space directly to locate the content
- Make sure the Confluence index is up to date (re-index if needed)"""
                        return {
                            "jql": f"confluence_search_in_space:{space_key}:{search_query}",
                            "response": response,
                            "data": [],
                            "intent": "confluence_search_in_space",
                            "success": False,
                            "space": space_key,
                            "navigation_url": display_url
                        }
                else:
                    # This is just a navigation request - return space link
                    base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
                    display_url = f"{base_url}/display/{space_key}"
                    response = f"""Confluence Space

Space: {space_key}

Access {space_key} Space:
{display_url}

You can browse all pages, documentation, and content in the {space_key} space here.

Available in this space:
  - Project documentation
  - Team pages and resources
  - Process guides and procedures
  - Meeting notes and decisions"""
                    return {
                        "jql": f"confluence_navigation:display_{space_key}",
                        "response": response,
                        "data": [{"type": "navigation", "url": display_url, "title": f"{space_key} Space", "space": space_key}],
                        "intent": "confluence_navigation",
                        "success": True,
                        "navigation_url": display_url
                    }
            
            # --- AI Planner (preferred) → regex planner (fallback) ---
            _ai_plan = await self._ai_plan_search(user_query)
            if _ai_plan and _ai_plan.get("confluence_search_queries"):
                search_terms = _ai_plan["confluence_search_queries"][0]
                logger.info(f"[AIPlanner] General search term: '{search_terms}'")
                # If planner detected a space not previously identified, use it
                if not space_key and _ai_plan.get("space"):
                    space_key = _ai_plan["space"]
                    logger.info(f"[AIPlanner] Detected space from plan: {space_key}")
                # Keep _plan available as None so response-hint code can check _ai_plan
                _plan = None
            else:
                # Fallback: regex planner
                search_terms = self._extract_confluence_search_terms(user_query)
                logger.info(f"Extracted search terms: '{search_terms}'")
                _plan = _confluence_query_planner.plan(user_query)
                logger.info(
                    f"[QueryPlanner] intent={_plan.intent!r}  page={_plan.target_page!r}  "
                    f"date={_plan.date_filter!r}  col={_plan.column_filter!r}  "
                    f"search_query={_plan.search_query!r}"
                )
                if _plan.target_page and _plan.search_query:
                    search_terms = _plan.search_query
                    logger.info(f"[QueryPlanner] Overriding search_terms → '{search_terms}'")

            # ----------------------------------------------------------------
            # COLD-START / BLOCKER CHECK
            # If the index is actively being built, tell the user honestly and
            # still attempt a CQL fallback so they get something useful.
            # ----------------------------------------------------------------
            try:
                from services.indexing_scheduler import get_indexing_scheduler
                _sched = get_indexing_scheduler()
                _idx_status = _sched.get_status() if _sched else {}
                _is_indexing = _idx_status.get("is_indexing", False)
                _doc_count   = _idx_status.get("doc_count", 0)
                _progress    = _idx_status.get("progress_pct", 0)
                _phase       = _idx_status.get("phase", "idle")
            except Exception:
                _is_indexing = False
                _doc_count   = 0
                _progress    = 0
                _phase       = "idle"

            _indexing_notice = ""
            if _is_indexing:
                phase_label = {
                    "warmup":                  "building the initial index",
                    "full_confluence":         "running a full Confluence re-index",
                    "incremental_confluence":  "syncing recent Confluence changes",
                    "incremental_jira":        "syncing recent Jira updates",
                }.get(_phase, "indexing")
                _indexing_notice = (
                    f"\n\n> **Note:** The Confluence index is currently {phase_label} "
                    f"({_progress}% complete). Results shown below are from a live search "
                    f"and may be less precise — full AI-powered answers will be available "
                    f"once indexing completes."
                )
                logger.info(f"[ColdStart] Index is {phase_label} ({_progress}%) — live CQL will be used as fallback")

            # ----------------------------------------------------------------
            # INDEX-FIRST VECTOR SEARCH
            # Search the local SQLite/in-memory vector store (populated by the
            # indexing scheduler) before hitting the live Confluence API.
            # Confidence bands:
            #   ≥ 0.85  → high confidence, answer directly from chunks
            #   0.65–0.85 → moderate, answer with attribution note
            #   0.50–0.65 → possibly related, answer with caveat
            #   < 0.50  → fall through to live CQL search
            # ----------------------------------------------------------------
            HIGH_CONF   = 0.85
            MOD_CONF    = 0.65
            LOW_CONF    = 0.50

            try:
                unified_rag = get_unified_rag_handler()
                if unified_rag and unified_rag.vector_store:
                    logger.info("🔍 INDEX-FIRST: Searching local vector index for Confluence chunks...")
                    indexed_docs = await unified_rag.hybrid_search(
                        query=user_query,
                        top_k=8,
                        source_filter=[SourceType.CONFLUENCE],
                        min_score=LOW_CONF
                    )

                    if indexed_docs:
                        top_score = indexed_docs[0].similarity_score or 0.0
                        logger.info(
                            f"✅ Found {len(indexed_docs)} indexed chunks (top score={top_score:.3f})"
                        )

                        # Build context for LLM from chunk metadata + text
                        chunk_context_parts = []
                        source_pages = {}   # page_id → {title, url, breadcrumb}

                        for doc in indexed_docs:
                            m = doc.metadata
                            page_id    = m.get("page_id", "")
                            page_title = m.get("title", "Untitled")
                            breadcrumb = m.get("breadcrumb", "")
                            url        = m.get("url", "")
                            chunk_type = m.get("chunk_type", "text")
                            section    = m.get("section_heading", "")
                            table_name = m.get("table_name", "")
                            score      = doc.similarity_score or 0.0

                            # Collect unique source pages for citation list
                            if page_id and page_id not in source_pages:
                                source_pages[page_id] = {
                                    "title":      page_title,
                                    "url":        url,
                                    "breadcrumb": breadcrumb,
                                    "space":      m.get("space", ""),
                                    "space_name": m.get("space_name", ""),
                                }

                            # Build readable chunk header
                            if chunk_type == "table_row":
                                header = f"[TABLE: {table_name or page_title}] ({breadcrumb})"
                            elif chunk_type == "section" and section:
                                header = f"[SECTION: {section}] ({breadcrumb})"
                            else:
                                header = f"[{breadcrumb}]" if breadcrumb else f"[{page_title}]"

                            chunk_context_parts.append(
                                f"{header}\n{doc.text.strip()}"
                            )

                        chunk_context = "\n\n---\n\n".join(chunk_context_parts)

                        # Generate LLM response from indexed chunks
                        if self.client:
                            # Confidence note for the system prompt
                            if top_score >= HIGH_CONF:
                                conf_note = "The retrieved chunks are highly relevant."
                            elif top_score >= MOD_CONF:
                                conf_note = "The retrieved chunks are moderately relevant; answer based on what you found."
                            else:
                                conf_note = "The retrieved chunks may be partially relevant; answer what you can and note uncertainty."

                            system_prompt = f"""You are a precise AI assistant that answers questions from Confluence documentation.

ANSWER STYLE — follow this exactly:
- Start directly with the answer. No preamble like "Based on the content..." or "I found..."
- Use **bold** for every key value, name, URL, branch name, or important term
- Use `## Section Title` headers only when the answer covers multiple distinct topics
- Use bullet points ( - ) for lists of 3+ items
- One blank line between sections
- End with a compact source line: `📄 Source: Page Title (Space > Parent > Page)`
- If a URL is present, include it as: `🔗 [Page Title](url)`
- Be concise — say exactly what was asked, nothing more

CONFIDENCE NOTE: {conf_note}

DO NOT:
- Say "Key Information:" as a prefix
- Repeat the user's question back to them
- List page titles as the answer
- Add unnecessary caveats if the answer is clearly in the content"""

                            user_prompt = (
                                f"Question: {user_query}\n\n"
                                f"Confluence chunks:\n\n{chunk_context[:8000]}"
                            )

                            try:
                                llm_response = self.client.chat.completions.create(
                                    model=self.model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user",   "content": user_prompt}
                                    ],
                                    max_tokens=2000,
                                    temperature=0.2
                                )
                                answer = llm_response.choices[0].message.content.strip()
                            except Exception as llm_err:
                                logger.warning(f"LLM call failed for indexed chunks: {llm_err}")
                                # Fallback: format chunks into readable response
                                answer = _format_chunks_as_response(indexed_docs[:5], user_query)
                        else:
                            answer = _format_chunks_as_response(indexed_docs[:5], user_query)

                        # Build citation data list compatible with existing front-end format
                        citation_data = [
                            {
                                "title":      info["title"],
                                "url":        info["url"],
                                "breadcrumb": info["breadcrumb"],
                                "space":      info["space"],
                                "space_name": info["space_name"],
                                "type":       "confluence_indexed"
                            }
                            for info in source_pages.values()
                        ]

                        return {
                            "jql":     f"confluence_index:{search_terms}",
                            "response": answer,
                            "data":    citation_data,
                            "intent":  "confluence_search",
                            "success": True,
                            "index_used": True,
                            "top_score":  top_score
                        }
                    else:
                        logger.info("ℹ️ No indexed chunks met threshold — falling back to live CQL search")
                else:
                    logger.info("ℹ️ Vector store empty or unavailable — using live CQL search")
            except Exception as idx_err:
                logger.warning(f"⚠️ Index search failed, falling back to live CQL: {idx_err}")

            # ----------------------------------------------------------------
            # LIVE CQL FALLBACK (used when index is empty or scores too low)
            # ----------------------------------------------------------------
            # Detect project from query to determine which space to search
            detected_project = self._extract_project_from_query(user_query)
            target_space = self.PROJECT_CONFLUENCE_SPACES.get(detected_project or 'default', default_space)
            logger.info(f"[CQL Fallback] Target space: {target_space} (project: {detected_project or 'default'})")

            confluence_results = []

            # Strategy 1: Search target space (AI multi-query or single-query legacy)
            if _ai_plan and len(_ai_plan.get("confluence_search_queries", [])) > 1:
                logger.info(f"[AIPlanner] Strategy 1: Multi-query search in space={target_space}")
                confluence_results = await self._execute_ai_confluence_searches(
                    _ai_plan["confluence_search_queries"], target_space
                )
            else:
                logger.info(f"[CQL] Strategy 1: Searching {target_space} space with: '{search_terms}'")
                confluence_results = await self.confluence_client.search_in_space(search_terms, space=target_space, limit=10)
            logger.info(f"[CQL] Strategy 1 found {len(confluence_results)} results")

            # Strategy 2: Global search if space search failed
            if not confluence_results:
                logger.info("[CQL] Strategy 2: Global search")
                confluence_results = await self.confluence_client.search(search_terms, limit=10)
                logger.info(f"[CQL] Strategy 2 found {len(confluence_results)} results")

            # Strategy 3: Individual keywords
            if not confluence_results and len(search_terms.split()) > 1:
                logger.info("[CQL] Strategy 3: Individual keyword search")
                seen_ids: set = set()
                for keyword in search_terms.split()[:2]:
                    kw_results = await self.confluence_client.search(keyword, limit=5)
                    for r in kw_results:
                        rid = r.get('content', {}).get('id', '')
                        if rid not in seen_ids:
                            seen_ids.add(rid)
                            confluence_results.append(r)
                logger.info(f"[CQL] Strategy 3 found {len(confluence_results)} results")

            # Strategy 4: Broadest single keyword
            if not confluence_results:
                broad_term = search_terms.split()[0] if search_terms else ""
                if broad_term:
                    logger.info(f"[CQL] Strategy 4: Broadest keyword '{broad_term}'")
                    confluence_results = await self.confluence_client.search(broad_term, limit=10)
                    logger.info(f"[CQL] Strategy 4 found {len(confluence_results)} results")

            # Strategy 5: Brute-force across ALL known spaces
            # This handles queries like "Account Receivables branch" where the
            # user didn't say which space — we try every space we know.
            if not confluence_results:
                known_spaces = ['IS', 'EMT', 'DMS', 'SSBYOD', 'NDP']
                logger.info(f"[CQL] Strategy 5: Trying all known spaces: {known_spaces}")
                for kspace in known_spaces:
                    if kspace == target_space:
                        continue  # already tried this one
                    try:
                        kresults = await self.confluence_client.search_in_space(
                            search_terms, space=kspace, limit=5
                        )
                        if kresults:
                            confluence_results.extend(kresults)
                            logger.info(f"[CQL] Strategy 5 found {len(kresults)} in {kspace}")
                    except Exception:
                        pass
                if confluence_results:
                    logger.info(f"[CQL] Strategy 5 total: {len(confluence_results)} across spaces")

            logger.info(f"[CQL] Final result count: {len(confluence_results)}")

            # If CQL also returned nothing and index is being built, give a
            # clear user-friendly message instead of a blank response.
            if not confluence_results and _is_indexing:
                building_msg = (
                    "**Confluence index is being built**\n\n"
                    f"The system is currently indexing Confluence ({_progress}% complete). "
                    "Your question will be answerable with full AI precision once indexing finishes — "
                    "this usually takes a few minutes.\n\n"
                    "**What you can do right now:**\n"
                    "- Try again in a few minutes\n"
                    "- Ask a simpler keyword question (e.g. just the page title)\n"
                    "- Browse Confluence directly while the index builds"
                )
                return {
                    "jql":        f"confluence_indexing:{search_terms}",
                    "response":   building_msg,
                    "data":       [],
                    "intent":     "confluence_indexing",
                    "success":    False,
                    "index_used": False,
                    "indexing":   True,
                    "progress":   _progress
                }

            if _ai_plan:
                _date_f = ""
                _col_f  = _ai_plan.get("extract_field") or ""
                _hint   = f"TASK: {_ai_plan.get('extract_type', 'factual').upper()} lookup.\n"
                if _ai_plan.get("row_identifier"):
                    _hint += f"ROW IDENTIFIER: {_ai_plan['row_identifier']}\n"
                if _col_f:
                    _hint += f"EXTRACT FIELD: {_col_f}\n"
            else:
                _date_f = _plan.date_filter or ""
                _col_f  = _plan.column_filter or ""
                _hint   = _plan.build_llm_hint()
            response = await self._generate_confluence_response(
                user_query, confluence_results,
                date_filter=_date_f,
                column_filter=_col_f,
                llm_hint=_hint,
            )
            # Append indexing notice if index is mid-build
            if _indexing_notice:
                response += _indexing_notice

            return {
                "jql":     f"confluence_search:{search_terms}",
                "response": response,
                "data":    confluence_results,
                "intent":  "confluence_search",
                "success": True,
                "index_used": False
            }
            
        except Exception as e:
            logger.error(f"Confluence query processing failed: {e}")
            logger.error(f"Confluence client available: {self.confluence_client is not None}")
            if self.confluence_client:
                logger.error(f"Confluence client config: {self.confluence_client.cfg.base_url}")
            return {
                "jql": "confluence_error",
                "response": f"I encountered an issue searching Confluence: {str(e)}",
                "data": [],
                "intent": "confluence_error",
                "success": False
            }
    
    def _extract_confluence_search_terms(self, user_query: str) -> str:
        """
        Extract relevant search terms from Confluence queries.

        Priority order:
        1. Multi-word proper noun phrases (e.g. "GL Inquiry", "DMS Modern Enablement")
        2. Single proper nouns (capitalized words like "Automation", "EMT")
        3. Remaining meaningful words (generic terms like "repo", "branches")

        This ensures subject-specific entity names are always included in the search,
        even when they appear late in the query.
        """
        # Noise phrases to strip before processing
        noise_phrases = r'\b(i need|i want|show me|find me|get me|give me|can you|please|tell me|what is|what are|list|fetch|retrieve|details|detail|information|info)\b'
        cleaned = re.sub(noise_phrases, '', user_query, flags=re.IGNORECASE).strip()

        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'its', 'it', 'this',
            'that', 'from', 'as', 'into', 'about', 'all', 'also', 'how', 'which'
        }

        # --- Priority 1: Extract multi-word proper noun phrases (2+ consecutive Title Case words)
        # Matches things like "GL Inquiry", "DMS Modern Enablement", "AP Invoice"
        multi_word_proper = re.findall(r'\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)+)\b', user_query)

        # --- Priority 2: Single proper nouns and uppercase abbreviations
        # Use `cleaned` (noise-stripped) so words like "What" from "What is" don't appear
        single_proper = re.findall(r'\b([A-Z]{2,}|[A-Z][a-z]{2,})\b', cleaned)
        single_proper = [w for w in single_proper if w.lower() not in stop_words]

        # --- Priority 3: Remaining meaningful lowercase words
        all_words = re.findall(r'\b\w+\b', cleaned.lower())
        generic = [w for w in all_words if w not in stop_words and len(w) > 2
                   and w not in {p.lower() for phrase in multi_word_proper for p in phrase.split()}
                   and w not in {s.lower() for s in single_proper}]

        # Build final search string: proper phrases first, then single proper nouns, then generic
        parts = []
        seen = set()

        for phrase in multi_word_proper:
            if phrase.lower() not in seen:
                parts.append(phrase)
                seen.add(phrase.lower())
                # Also mark individual words so single_proper doesn't re-add them
                for w in phrase.split():
                    seen.add(w.lower())

        for word in single_proper:
            if word.lower() not in seen:
                parts.append(word)
                seen.add(word.lower())

        # Add up to 3 generic terms to fill context
        added_generic = 0
        for word in generic:
            if word not in seen and added_generic < 3:
                parts.append(word)
                seen.add(word)
                added_generic += 1

        result = ' '.join(parts[:6])  # Max 6 terms total

        if not result.strip():
            return user_query  # Fallback: use original query unchanged

        logger.debug(f"[SearchTerms] '{user_query}' → '{result}'")
        return result

    async def _ai_plan_search(
        self,
        user_query: str,
        space_key: Optional[str] = None,
        project_keys: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        One fast LLM call that reasons about the query and returns a structured
        search plan (search terms, extract hints). Always returns None on any
        failure so every caller can transparently fall back to the regex planner.
        """
        if not self.client:
            return None
        try:
            context_hint = f"[Detected space: {space_key}]\n" if space_key else ""
            if project_keys:
                context_hint += f"[Jira projects: {', '.join(project_keys)}]\n"

            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": AI_PLAN_SEARCH_SYSTEM_PROMPT},
                    {"role": "user", "content": f"{context_hint}Query: {user_query}"}
                ],
                max_tokens=400,
                temperature=0.1,
            )
            raw = resp.choices[0].message.content.strip()
            # Strip markdown fences the model may add despite instructions
            raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
            raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)

            plan = json.loads(raw)

            # Basic schema validation — return None if broken
            if not isinstance(plan.get("confluence_search_queries"), list):
                return None
            if not isinstance(plan.get("jql_queries"), list):
                plan["jql_queries"] = []

            logger.info(
                f"[AIPlanner] source={plan.get('source')} space={plan.get('space')} "
                f"queries={plan.get('confluence_search_queries')} "
                f"extract={plan.get('extract_type')} field={plan.get('extract_field')} "
                f"row={plan.get('row_identifier')} | {plan.get('reasoning', '')[:80]}"
            )
            return plan
        except Exception as e:
            logger.warning(f"[AIPlanner] Planning failed, using regex fallback: {e}")
            return None

    async def _execute_ai_confluence_searches(
        self,
        search_queries: List[str],
        space_key: Optional[str],
    ) -> List[Dict[str, Any]]:
        """
        Try each AI-planned search query sequentially; stop at first hit.
        Returns deduplicated Confluence search results.
        """
        seen_ids: set = set()
        collected: List[Dict] = []

        for sq in search_queries:
            if not sq or len(sq.strip()) < 2:
                continue
            try:
                if space_key:
                    results = await self.confluence_client.search_in_space(
                        sq, space=space_key, limit=10
                    )
                else:
                    results = await self.confluence_client.search(sq, limit=10)

                for r in results:
                    rid = (r.get('content') or {}).get('id', '')
                    if rid and rid not in seen_ids:
                        seen_ids.add(rid)
                        collected.append(r)

                if collected:
                    logger.info(
                        f"[AIPlanner] '{sq}' space={space_key} → {len(results)} hits"
                    )
                    break  # first successful query is sufficient
            except Exception as e:
                logger.warning(f"[AIPlanner] Search '{sq}' failed: {e}")

        return collected

    async def _generate_confluence_response(
        self,
        user_query: str,
        confluence_results: List[Dict],
        date_filter: str = "",
        column_filter: str = "",
        llm_hint: str = "",
    ) -> str:
        """Generate AI response for Confluence search results (CQL path)"""
        if not self.client:
            return self._basic_confluence_response(confluence_results)
        
        try:
            # Prepare data summary for AI
            base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
            if not confluence_results:
                data_summary = "No Confluence pages found matching your search."
            else:
                data_summary = f"Found {len(confluence_results)} Confluence pages:\n"
                for i, result in enumerate(confluence_results[:5]):  # Show top 5
                    title = result.get('title', 'Untitled')
                    # Get space from resultGlobalContainer if available
                    space_info = result.get('resultGlobalContainer', {})
                    space = space_info.get('title', 'Unknown Space') if space_info else 'Unknown Space'
                    space_key = space_info.get('displayName', '') if space_info else ''
                    
                    # Try to get full page content if available
                    full_content = result.get('full_content', {})
                    page_body = ""
                    page_metadata = {}
                    
                    if full_content:
                        # Get version info
                        version_info = full_content.get('version', {})
                        if version_info:
                            page_metadata['version'] = version_info.get('number', 'Unknown')
                            page_metadata['last_modified'] = version_info.get('when', 'Unknown')
                            page_metadata['modified_by'] = version_info.get('by', {}).get('displayName', 'Unknown') if version_info.get('by') else 'Unknown'
                        
                        # Try storage format first (most complete)
                        body_storage = full_content.get('body', {}).get('storage', {})
                        if body_storage and body_storage.get('value'):
                            page_body = body_storage.get('value', '')
                            # Use the proper HTML to text conversion method
                            page_body = self.confluence_client.storage_html_to_text(page_body)
                        else:
                            # Fallback to view format
                            body_view = full_content.get('body', {}).get('view', {})
                            if body_view and body_view.get('value'):
                                page_body = body_view.get('value', '')
                                page_body = re.sub(r'<[^>]+>', '', page_body)
                                page_body = html.unescape(page_body)
                    
                    # Use full content if available, otherwise use excerpt
                    # Apply relevance-based extraction to get the most query-relevant sections
                    MAX_PAGE_CONTENT = 2500
                    if page_body:
                        # Use smart relevance extraction with date/column filters
                        content_preview = self.confluence_client.extract_relevant_content(
                            page_text=page_body,
                            query=user_query,
                            max_chars=MAX_PAGE_CONTENT,
                            date_filter=date_filter,
                            column_filter=column_filter,
                        )
                    else:
                        excerpt = result.get('excerpt', '')[:600] + "..." if result.get('excerpt') else "No content available"
                        content_preview = excerpt
                    
                    # Generate URL in display format
                    page_url = ""
                    if space_key and base_url and title:
                        page_url = self._generate_confluence_page_url(base_url, space_key, title)
                    
                    data_summary += f"{i+1}. {title} (in {space})"
                    if page_url:
                        data_summary += f"\n   URL: {page_url}"
                    
                    # Add metadata if available
                    if page_metadata:
                        if page_metadata.get('last_modified'):
                            data_summary += f"\n   Last Modified: {page_metadata['last_modified']}"
                        if page_metadata.get('modified_by'):
                            data_summary += f"\n   Modified By: {page_metadata['modified_by']}"
                        if page_metadata.get('version'):
                            data_summary += f"\n   Version: {page_metadata['version']}"
                    
                    data_summary += f"\n   Full Content:\n   {content_preview}\n\n"

            # Enforce total data_summary size limit to prevent LLM context overflow
            MAX_DATA_SUMMARY = 10000
            if len(data_summary) > MAX_DATA_SUMMARY:
                data_summary = data_summary[:MAX_DATA_SUMMARY] + "\n\n[Additional content truncated - showing most relevant results]"

            # If the query planner found a specific task (table lookup, factual lookup),
            # inject that as a precise instruction at the top of the system prompt.
            _task_instruction = ""
            if llm_hint:
                _task_instruction = f"\n\nSPECIFIC TASK:\n{llm_hint}\n"

            system_prompt = f"""You are a precise AI assistant that answers questions from Confluence documentation.{_task_instruction}
ANSWER STYLE — follow this exactly:
- Start directly with the answer. No preamble like "Based on the content..." or "I found..."
- Use **bold** for every key value, name, URL, Jira ID, branch name, or important term
- For table lookups: list ALL matching Jira IDs / values as a bulleted list
- Use `## Section Title` headers only when the answer covers multiple distinct topics
- Use bullet points ( - ) for lists of 3+ items
- One blank line between sections
- End with a compact source line: `📄 Source: Page Title (Space Name)`
- If a URL is present, include it as: `🔗 [Page Title](url)`
- Be concise — say exactly what was asked, nothing more

DO NOT:
- Say "Key Information:" as a prefix
- Repeat the user's question back to them
- List page titles as the answer (e.g. "I found 3 pages titled...")
- Add unnecessary caveats when the answer is clearly present in the content
- Use long preambles before the actual answer

EXAMPLE of correct output for "what Jira IDs were fixed yesterday in GL Enquiry workflow?":
Jira IDs fixed on **03-19-2026** in **GL Enquiry Workflow**:
- **CDKGL-1234** — Fix null pointer in GL posting
- **CDKGL-5678** — Resolve balance mismatch in period close

📄 Source: GL Enquiry Workflow (EMT Space)"""

            user_prompt = f"""User Question: "{user_query}"

Confluence Page Content:
{data_summary}

Based on the Confluence content above, directly answer the user's question. Extract and present the specific information requested. If the answer is in the content, provide it clearly. If not found, say what was searched and suggest alternatives."""

            logger.info(f"Calling OpenAI with data_summary length: {len(data_summary)}")
            logger.info(f"Data summary preview: {data_summary[:300]}...")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=2000
            )

            ai_response = response.choices[0].message.content.strip()
            logger.info(f"OpenAI response length: {len(ai_response)}")
            logger.info(f"OpenAI response preview: {ai_response[:200]}...")
            
            return ai_response
            
        except Exception as e:
            logger.error(f"AI Confluence response generation failed: {e}")
            return self._basic_confluence_response(confluence_results)
    
    async def _classify_query_with_ai(self, user_query: str) -> str:
        """
        Use AI to intelligently classify the query instead of keyword matching.
        Returns: 'jira', 'confluence', 'github', or 'general_knowledge'
        """
        # Fast path: If query contains a ticket key, it's definitely Jira
        ticket_key_pattern = r'\b([A-Z]{2,}-\d+)\b'
        has_ticket_key = re.search(ticket_key_pattern, user_query, re.IGNORECASE)
        if has_ticket_key:
            logger.info(f"Fast path: Detected ticket key - routing to Jira")
            return "jira"
        
        # If AI client is not available, fall back to keyword matching
        if not self.client:
            logger.warning("AI client not available - using keyword fallback for classification")
            return self._classify_query_with_keywords(user_query)
        
        try:
            # Use AI to classify the query intelligently
            classification_prompt = """You are a query classifier for a project management assistant.

Your job is to classify user queries into ONE of these categories:
1. "jira" - Queries about work items, tasks, bugs, stories, people's workload, project status, assignments, etc.
2. "confluence" - Queries about documentation, wiki pages, knowledge base articles, guides, manuals
3. "github" - Queries about repositories, pull requests, commits, branches, workflows, Actions runs, CI/CD, or code hosting
4. "general_knowledge" - General questions not related to Jira, Confluence, or GitHub (e.g., "What is Python?", "Who is Elon Musk?")

IMPORTANT:
- Queries about PEOPLE and their WORK are ALWAYS "jira" (e.g., "What is Ajith doing?", "Ajith's workload", "Who is working on X?")
- Queries with "workload", "assigned", "working on", "tasks", "stories", "bugs" are ALWAYS "jira"
- Queries mentioning repositories, pull requests, commits, branches, workflows, CI/CD, or GitHub are "github"
- Only classify as "general_knowledge" if it's truly a general question unrelated to work/projects/code

Examples:
- "What is the workload for Ramesh, Ajith?" → jira
- "What is Ajith doing currently?" → jira
- "How many bugs in NDP?" → jira
- "Show me documentation for API" → confluence
- "How many GitHub Actions runs passed last week?" → github
- "What is Python?" → general_knowledge

Respond with ONLY ONE WORD: jira, confluence, github, or general_knowledge"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": classification_prompt},
                    {"role": "user", "content": f"Classify this query: {user_query}"}
                ],
                temperature=0.1,
                max_tokens=10
            )
            
            classification = response.choices[0].message.content.strip().lower()
            
            # Validate the classification
            if classification in ['jira', 'confluence', 'github', 'general_knowledge']:
                logger.info(f"AI classified '{user_query}' as: {classification}")
                return classification
            else:
                logger.warning(f"AI returned invalid classification '{classification}', defaulting to jira")
                return "jira"
                
        except Exception as e:
            logger.error(f"AI classification failed: {e}, falling back to keyword matching")
            return self._classify_query_with_keywords(user_query)
    
    def _classify_query_with_keywords(self, user_query: str) -> str:
        """Fallback keyword-based classification when AI is unavailable"""
        query_lower = user_query.lower()
        
        # Jira keywords
        jira_keywords = [
            'ticket', 'issue', 'bug', 'story', 'task', 'epic', 'sprint', 'jira',
            'assignee', 'reporter', 'status', 'priority', 'project', 'board',
            'workload', 'working on', 'currently doing', 'assigned to', 'working'
        ]
        
        # Confluence keywords
        confluence_keywords = [
            'confluence', 'wiki', 'document', 'documentation', 'page', 'article'
        ]

        # GitHub keywords
        github_keywords = [
            'github', 'git hub', 'repo', 'repository', 'pull request', 'pr', 'workflow',
            'actions', 'action run', 'pipeline', 'ci', 'build', 'commit', 'branch'
        ]
        
        has_jira = any(keyword in query_lower for keyword in jira_keywords)
        has_confluence = any(keyword in query_lower for keyword in confluence_keywords)
        has_github = any(keyword in query_lower for keyword in github_keywords)
        
        # Person name pattern
        person_name_pattern = r'\b[A-Z][a-z]+,\s+[A-Z][a-z]+\b'
        has_person_name = bool(re.search(person_name_pattern, user_query))
        
        if has_jira or has_person_name:
            return "jira"
        elif has_confluence:
            return "confluence"
        elif has_github:
            return "github"
        else:
            return "jira"  # Default to Jira instead of general_knowledge
    
    async def _classify_query_intent(self, user_query: str) -> str:
        """
        Use AI to intelligently classify the query intent.
        Returns: 'jira', 'confluence', 'github', or 'general_knowledge'
        
        This replaces keyword matching with intelligent AI classification.
        """
        logger.info("=" * 80)
        logger.info("🔍 WORKBUDDY INTENT CLASSIFICATION")
        logger.info("=" * 80)
        logger.info(f"📝 User Query: '{user_query}'")
        
        # Quick checks first - if explicitly mentions ticket keys, it's definitely Jira
        ticket_pattern = r'\b([A-Z][A-Z0-9]+-\d+)\b'
        if re.search(ticket_pattern, user_query, re.IGNORECASE):
            logger.info("🎯 Classification Method: Pattern Match (Ticket Key)")
            logger.info("   → Detected ticket key pattern in query")
            logger.info("   → Classification: JIRA")
            logger.info("   → Reasoning: Query contains Jira ticket key (e.g., NDP-123)")
            logger.info("=" * 80)
            return 'jira'
        
        # If AI client is not available, fall back to simple heuristics
        if not self.client:
            logger.warning("⚠️ AI client not available for query classification, using keyword fallback")
            query_lower = user_query.lower()
            
            # Check for Jira keywords
            jira_keywords = ['jira', 'ticket', 'issue', 'bug', 'story', 'assignee', 'workload', 'working on']
            jira_matches = [word for word in jira_keywords if word in query_lower]
            
            # Check for Confluence keywords
            confluence_keywords = ['confluence', 'wiki', 'document', 'page']
            confluence_matches = [word for word in confluence_keywords if word in query_lower]
            
            # Check for GitHub keywords
            github_keywords = ['github', 'actions', 'workflow', 'pull request', 'repo', 'repository', 'ci', 'build']
            github_matches = [word for word in github_keywords if word in query_lower]
            
            logger.info("🎯 Classification Method: Keyword Matching (Fallback)")
            if jira_matches:
                logger.info(f"   → Detected Jira keywords: {jira_matches}")
                logger.info("   → Classification: JIRA")
                logger.info("   → Reasoning: Query contains Jira-related keywords")
                logger.info("=" * 80)
                return 'jira'
            elif confluence_matches:
                logger.info(f"   → Detected Confluence keywords: {confluence_matches}")
                logger.info("   → Classification: CONFLUENCE")
                logger.info("   → Reasoning: Query contains Confluence/documentation keywords")
                logger.info("=" * 80)
                return 'confluence'
            elif github_matches:
                logger.info(f"   → Detected GitHub keywords: {github_matches}")
                logger.info("   → Classification: GITHUB")
                logger.info("   → Reasoning: Query contains GitHub/repository keywords")
                logger.info("=" * 80)
                return 'github'
            else:
                logger.info("   → No specific keywords detected")
                logger.info("   → Classification: GENERAL_KNOWLEDGE")
                logger.info("   → Reasoning: No work-related keywords found, treating as general knowledge")
                logger.info("=" * 80)
                return 'general_knowledge'
        
        # Use AI to classify the query intelligently
        try:
            classification_prompt = """You are a query classifier for a team collaboration tool.

Classify the following query into ONE of these categories:
1. "jira" - Questions about work items, tasks, bugs, stories, projects, team members' work, workload, assignments, sprints, or any project management related queries
2. "confluence" - Questions about documentation, wiki pages, knowledge base articles, or document searches
3. "github" - Questions about repositories, pull requests, commits, branches, workflows, actions runs, CI/CD, or release pipelines
4. "general_knowledge" - General questions not related to work items, documentation, or code (e.g., "What is Python?", "Who invented the internet?")

Examples:
- "What is Ajith working on?" → jira (asking about a person's work)
- "Show me bugs in NDP project" → jira (asking about work items)
- "What is the workload for Ramesh?" → jira (asking about a person's workload)
- "Who is assigned to NDP-123?" → jira (asking about ticket assignment)
- "How many open stories?" → jira (asking about work items)
- "Find documentation about API" → confluence (asking about documents)
- "How many GitHub Actions runs passed last week?" → github (actions/workflows)
- "Show PRs waiting for review in repo xyz" → github (pull requests)
- "What is Python?" → general_knowledge (not work-related)
- "Who invented TCP/IP?" → general_knowledge (not work-related)

Query: "{query}"

Respond with ONLY ONE WORD: jira, confluence, github, or general_knowledge"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": classification_prompt.format(query=user_query)}
                ],
                temperature=0.1,
                max_tokens=10
            )
            
            classification = response.choices[0].message.content.strip().lower()
            
            # Validate the response
            if classification in ['jira', 'confluence', 'github', 'general_knowledge']:
                logger.info("🎯 Classification Method: AI Classification")
                logger.info(f"   → AI Model: {self.model}")
                logger.info(f"   → Classification: {classification.upper()}")
                
                # Provide reasoning based on classification
                reasoning_map = {
                    'jira': "AI determined this is about work items, tasks, bugs, stories, projects, team workload, or assignments",
                    'confluence': "AI determined this is about documentation, wiki pages, knowledge base articles, or document searches",
                    'github': "AI determined this is about repositories, pull requests, commits, workflows, actions runs, or CI/CD",
                    'general_knowledge': "AI determined this is a general knowledge question not related to work items, documentation, or code"
                }
                logger.info(f"   → Reasoning: {reasoning_map.get(classification, 'Unknown')}")
                logger.info("=" * 80)
                return classification
            else:
                logger.warning(f"⚠️ AI returned unexpected classification: {classification}, defaulting to jira")
                logger.info("   → Classification: JIRA (fallback)")
                logger.info("   → Reasoning: Invalid AI response, using safe default")
                logger.info("=" * 80)
                return 'jira'
                
        except Exception as e:
            logger.error(f"❌ Query classification failed: {e}")
            logger.info("   → Classification: JIRA (fallback)")
            logger.info("   → Reasoning: Classification error, using safe default")
            logger.info("=" * 80)
            return 'jira'
    
    async def _process_web_search_query(self, user_query: str) -> Dict[str, Any]:
        """Process general knowledge queries using web search"""
        try:
            logger.info(f"Processing web search query: '{user_query}'")
            
            # Clean the query - remove web search indicators
            clean_query = user_query
            web_indicators = ['search web', 'search internet', 'search online', 'dont search', "don't search", 'not jira', 'not in jira', 'in web', 'on web']
            for indicator in web_indicators:
                clean_query = clean_query.replace(indicator, '').strip()
            
            # Use web search tool to get real-time information
            # Import web_search tool (available in the system)
            try:
                # Use the web_search tool available in the environment
                search_results = await web_search(clean_query)
                
                if search_results and len(search_results) > 0:
                    # Format the response with web search results
                    response_text = f"**Web Search Results for: {clean_query}**\n\n"
                    
                    for i, result in enumerate(search_results[:5], 1):  # Show top 5 results
                        title = result.get('title', 'No title')
                        snippet = result.get('snippet', result.get('description', result.get('content', 'No description')))
                        url = result.get('url', result.get('link', ''))
                        
                        response_text += f"**{i}. {title}**\n"
                        if url:
                            response_text += f"Link: {url}\n"
                        response_text += f"{snippet[:250] if len(snippet) > 250 else snippet}...\n\n"
                    
                    if len(search_results) > 5:
                        response_text += f"... and {len(search_results) - 5} more results.\n"
                    
                    return {
                        "jql": f"web_search:{clean_query}",
                        "response": response_text,
                        "data": search_results,
                        "intent": "web_search",
                        "success": True,
                        "source": "web"
                    }
                else:
                    # Fallback to AI if no web results
                    if self.client:
                        system_prompt = """You are a helpful AI assistant with access to current information. Answer questions accurately and informatively. For questions about companies, products, technologies, or general knowledge, provide comprehensive answers based on your knowledge."""
                        user_prompt = f"Question: {clean_query}\n\nPlease provide a clear, informative answer about this topic."
                        
                        response = self.client.chat.completions.create(
                            model=self.model,
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            temperature=0.7,
                            max_tokens=800
                        )
                        
                        ai_response = response.choices[0].message.content.strip()
                        response_text = f"**Information about: {clean_query}**\n\n{ai_response}\n\n*This information is based on my training data. For the most current information, please verify with official sources.*"
                        
                        return {
                            "jql": f"web_search:{clean_query}",
                            "response": response_text,
                            "data": [{"title": clean_query, "snippet": ai_response[:200], "source": "ai"}],
                            "intent": "web_search",
                            "success": True,
                            "source": "web"
                        }
                    else:
                        raise Exception("OpenAI client not available")
            except NameError:
                # web_search tool not available, use AI fallback
                logger.info("web_search tool not directly available, using AI fallback")
                if self.client:
                    system_prompt = """You are a helpful AI assistant with access to current information. Answer questions accurately and informatively. For questions about companies, products, technologies, or general knowledge, provide comprehensive answers based on your knowledge."""
                    user_prompt = f"Question: {clean_query}\n\nPlease provide a clear, informative answer about this topic."
                    
                    response = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.7,
                        max_tokens=800
                    )
                    
                    ai_response = response.choices[0].message.content.strip()
                    response_text = f"🌐 **Information about: {clean_query}**\n\n{ai_response}\n\n*This information is based on my training data. For the most current information, please verify with official sources.*"
                    
                    return {
                        "jql": f"web_search:{clean_query}",
                        "response": response_text,
                        "data": [{"title": clean_query, "snippet": ai_response[:200], "source": "ai"}],
                        "intent": "web_search",
                        "success": True,
                        "source": "web"
                    }
                else:
                    raise Exception("OpenAI client not available")
                
        except Exception as e:
            logger.error(f"Web search processing failed: {e}")
            # Fallback: use AI to answer if web search fails
            if self.client:
                try:
                    system_prompt = """You are a helpful AI assistant. Answer general knowledge questions based on your training data. Provide accurate, informative responses."""
                    user_prompt = f"Question: {user_query}\n\nPlease provide a clear, informative answer."
                    
                    response = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.7,
                        max_tokens=500
                    )
                    
                    ai_response = response.choices[0].message.content.strip()
                    return {
                        "jql": f"ai_answer:{user_query}",
                        "response": f"**Answer:**\n\n{ai_response}\n\n*Note: This is based on my training data. For the most current information, please search the web directly.*",
                        "data": [],
                        "intent": "general_knowledge",
                        "success": True,
                        "source": "ai"
                    }
                except Exception as ai_error:
                    logger.error(f"AI fallback also failed: {ai_error}")
            
            return {
                "jql": f"web_search_error:{user_query}",
                "response": f"I encountered an issue searching the web for '{user_query}'. Please try again or rephrase your question.",
                "data": [],
                "intent": "web_search_error",
                "success": False,
                "source": "web_error"
            }
    
    def _generate_confluence_page_url(self, base_url: str, space_key: str, page_title: str) -> str:
        """Generate Confluence page URL in display format: /display/{SPACE_KEY}/{PAGE_TITLE}"""
        if not base_url or not space_key or not page_title:
            return ""
        
        # URL encode the page title (spaces become +, special chars encoded)
        from urllib.parse import quote_plus
        encoded_title = quote_plus(page_title)
        
        return f"{base_url}/display/{space_key}/{encoded_title}"
    
    def _basic_confluence_response(self, confluence_results: List[Dict]) -> str:
        """Generate basic response for Confluence results without AI in clean professional format"""
        if not confluence_results:
            return "Documentation Search\n\nNo documentation found in Confluence. This search will now fall back to Jira issues."
        
        base_url = self.confluence_client.cfg.base_url if self.confluence_client else ""
        response = f"Documentation Found\n\nTotal: {len(confluence_results)} Confluence pages found\n\n"
        
        for i, result in enumerate(confluence_results[:5]):  # Show top 5
            title = result.get('title', 'Untitled')
            # Get space from resultGlobalContainer if available
            space_info = result.get('resultGlobalContainer', {})
            space = space_info.get('title', 'Unknown Space') if space_info else 'Unknown Space'
            space_key = space_info.get('displayName', '') if space_info else ''
            excerpt = result.get('excerpt', '')[:150] + "..." if result.get('excerpt') else "No excerpt available"
            # Clean up Confluence highlight markers
            excerpt = excerpt.replace("@@@hl@@@", "").replace("@@@endhl@@@", "")
            
            # Generate URL in display format: /display/{SPACE_KEY}/{PAGE_TITLE}
            page_url = ""
            if space_key and base_url and title:
                page_url = self._generate_confluence_page_url(base_url, space_key, title)
            elif space_key and base_url:
                # Fallback to space URL if we don't have page title
                page_url = f"{base_url}/display/{space_key}"
            
            response += f"{i+1}. {title}\n"
            response += f"   Space: {space}\n"
            if page_url:
                response += f"   Link: {page_url}\n"
            response += f"   {excerpt}\n\n"
        
        if len(confluence_results) > 5:
            response += f"... and {len(confluence_results) - 5} more pages.\n"
        
        response += "\nSuggestions:\n"
        response += "  - Click on page URLs to view full content\n"
        response += "  - Try more specific search terms for better results\n"
        response += "  - Check different spaces for related documentation\n"
        response += "  - Use 'people directory' to browse team members\n"
        response += "  - Use 'display [SPACE]' to open a specific project space\n"
        
        return response
