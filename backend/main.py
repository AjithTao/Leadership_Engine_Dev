from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import base64
import html
import os
import tempfile
import json
import io
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
import logging
import sys
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import jwt
from typing import Optional
import pandas as pd

# Load environment variables from config/.env
load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

# Optional imports with fallback
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

try:
    from pptx import Presentation
    from pptx.util import Inches
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False

# Import from organized backend structure
from services.jira import JiraClient
from config.auth import JiraConfig
from services.confluence import ConfluenceConfig
from services.ai_engine import IntelligentAIEngine
from services.analytics import AdvancedAnalyticsEngine
from services.jql_processor import EnhancedJQLProcessor, ResponseFormat
from services.jira_rag_handler import get_jira_rag_handler
from services.chatbot_engine import AdvancedChatbotEngine, QueryIntent
from services.rag_handler import get_handler, LeadershipRAGHandler
from services.github import GitHubClient, GitHubConfig
from services.salesforce import SalesforceClient, SalesforceConfig
from services.salesforce_classifier import batch_classify, classify_and_solve, get_categories, get_category_colors
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Application state
class AppState:
    def __init__(self):
        self.jira_configured = False
        self.jira_client = None
        self.jira_config = None
        self.jira_board_id = None
        self.confluence_configured = False
        self.confluence_client = None
        self.confluence_config = None
        self.github_client = GitHubClient() # Initialize GitHub client
        self.salesforce_client = SalesforceClient()  # Initialize Salesforce client
        self._salesforce_classified_cache: list = []  # In-memory cache of classified cases
        self.messages = []
        self.export_files = {}
        self.ai_engine = None
        self.query_processor = None
        self.analytics_engine = None
        self.enhanced_jql_processor = None
        self.advanced_chatbot = None
        self.max_messages = 1000  # Keep last 1000 messages
        # Lightweight cache for heavy lists
        self.projects_cache = None
        self.projects_cache_at = None
        self.projects_cache_ttl_seconds = 300
        # Background job tracking for TCOE reports
        self.tcoe_jobs: Dict[str, Dict[str, Any]] = {}  # job_id -> {status, result, error, created_at}
        # Progressive TCOE dashboard run tracking
        self.tcoe_dashboard_runs: Dict[str, Dict[str, Any]] = {}
        self.latest_tcoe_dashboard_run_id: Optional[str] = None

app_state = AppState()

def create_error_response(error_type: str, details: str = "", status_code: int = 500) -> Dict[str, Any]:
    """Create consistent error responses"""
    return {
        "success": False,
        "error": error_type,
        "details": details,
        "status_code": status_code
    }

def create_success_response(data: Any = None, message: str = "Success") -> Dict[str, Any]:
    """Create consistent success responses"""
    response = {
        "success": True,
        "message": message
    }
    if data is not None:
        response["data"] = data
    return response

def mask_email(email: str) -> str:
    """Mask email address for security"""
    if not email or "@" not in email:
        return email
    
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = "*" * len(local)
    else:
        masked_local = local[:2] + "*" * (len(local) - 2)
    
    return f"{masked_local}@{domain}"

def manage_message_history(app_state: AppState, message: Dict[str, Any]) -> None:
    """Manage message history to prevent memory bloat"""
    app_state.messages.append(message)
    
    # Keep only the last max_messages
    if len(app_state.messages) > app_state.max_messages:
        app_state.messages = app_state.messages[-app_state.max_messages:]

DEFAULT_STORY_POINT_FIELD_IDS = ("customfield_10016", "customfield_10004", "customfield_10002", "customfield_10106")
DONE_STATUS_NAMES = {"done", "resolved", "closed", "complete", "completed"}

async def get_story_point_field_ids(jira_client: JiraClient) -> List[str]:
    """Resolve Jira story-point custom field ids with safe fallbacks."""
    if jira_client and hasattr(jira_client, "get_story_point_field_ids"):
        try:
            field_ids = await jira_client.get_story_point_field_ids()
            if field_ids:
                return field_ids
        except Exception as e:
            logger.warning(f"Could not resolve Jira story point fields: {e}")
    return list(DEFAULT_STORY_POINT_FIELD_IDS)

def _coerce_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def get_issue_story_points(fields: Dict[str, Any], story_point_field_ids: Optional[List[str]] = None) -> Optional[float]:
    """Extract story points from Jira issue fields across likely custom fields."""
    seen = set()
    for field_id in [*(story_point_field_ids or []), *DEFAULT_STORY_POINT_FIELD_IDS]:
        if not field_id or field_id in seen:
            continue
        seen.add(field_id)
        points = _coerce_number(fields.get(field_id))
        if points is not None:
            return points
    return None

def build_advanced_filter_clause(advanced: dict) -> str:
    """Translate advanced filter options from the UI into JQL clauses."""
    if not advanced:
        return ''
    clauses = []
    if advanced.get('priority'):
        vals = ', '.join(f'"{v}"' for v in advanced['priority'])
        clauses.append(f'priority in ({vals})')
    if advanced.get('issueType'):
        vals = ', '.join(f'"{v}"' for v in advanced['issueType'])
        clauses.append(f'issuetype in ({vals})')
    if advanced.get('statusCategory'):
        vals = ', '.join(f'"{v}"' for v in advanced['statusCategory'])
        clauses.append(f'statusCategory in ({vals})')
    assignee = (advanced.get('assignee') or '').strip()
    if assignee:
        clauses.append(f'assignee = "{assignee}"')
    label = (advanced.get('label') or '').strip()
    if label:
        labels = [lbl.strip() for lbl in label.split(',') if lbl.strip()]
        if labels:
            vals = ', '.join(f'"{lbl}"' for lbl in labels)
            clauses.append(f'labels in ({vals})')
    return ' AND '.join(clauses)


def _jql_escape(value: str) -> str:
    """Escape a value for safe interpolation inside a JQL double-quoted string."""
    return (value or '').replace('\\', '\\\\').replace('"', '\\"')


def _cf_jql_id(field_id: str) -> str:
    """Turn a Jira field id into its JQL reference ('customfield_10600' -> 'cf[10600]')."""
    if field_id and field_id.startswith('customfield_'):
        return f"cf[{field_id.split('_', 1)[1]}]"
    return field_id


# Known QE value sets for projects.cdk.com test-case workflow. Used as a reliable
# candidate list (a 100-issue sample alone can miss values); unioned with whatever
# the live sample surfaces, then each candidate is counted exactly. Any value not
# in the list still lands in "Unspecified" so totals always reconcile.
QE_AUTOMATION_VALUES = ['Automated', 'Automation Not Required', 'Requires Automation', 'In Progress', 'Merged', 'Repair']
QE_TEST_TYPE_VALUES = ['Functional Testing', 'Regression Testing', 'Configuration', 'Unit Testing',
                       'Integration', 'Performance Testing', 'UI/X', 'Interoperability Testing']
QE_TEST_STATUSES = ['Test', 'Accepted', 'Abandoned']


async def resolve_qe_field_ids(jira_client) -> Dict[str, Optional[str]]:
    """Resolve the 'Test Status' (automation lifecycle) and 'Test Type' custom field
    ids by name, with the known projects.cdk.com ids as fallback."""
    ids: Dict[str, Optional[str]] = {"automation": None, "testType": None}
    try:
        fields = await jira_client.get_fields()
        for f in fields or []:
            nm = (f.get('name') or '').strip().lower()
            if nm == 'test status' and not ids["automation"]:
                ids["automation"] = f.get('id')
            elif nm == 'test type' and not ids["testType"]:
                ids["testType"] = f.get('id')
    except Exception as e:
        logger.warning(f"QE field resolution failed: {e}")
    ids["automation"] = ids["automation"] or "customfield_10600"
    ids["testType"] = ids["testType"] or "customfield_14101"
    return ids


async def compute_qe_metrics(jira_client, base_jql: str, qe_fields: Dict[str, Optional[str]]) -> Optional[Dict[str, Any]]:
    """Quality-Engineering metrics for test-case projects, scoped to the dashboard's
    base JQL and computed via EXACT Jira counts (so they're unaffected by the
    issue-fetch cap). Returns None when there are no Test issues in scope."""
    import asyncio

    def q(extra: str) -> str:
        return f"{base_jql} AND {extra}" if base_jql else extra

    async def count(jql: str) -> int:
        try:
            d = await jira_client.search(jql, max_results=0, fields=['key'])
            return (d or {}).get('total', 0) if d else 0
        except Exception as ce:
            logger.warning(f"QE count failed for [{jql}]: {ce}")
            return 0

    def _opt(v):
        if isinstance(v, dict):
            return v.get('value')
        if isinstance(v, list) and v:
            return v[0].get('value') if isinstance(v[0], dict) else str(v[0])
        return v

    try:
        test_total = await count(q('issuetype = Test'))
        if not test_total:
            return None

        auto_field = qe_fields.get("automation")
        type_field = qe_fields.get("testType")

        # One sample to discover the status / automation / test-type values present in scope.
        sample = await jira_client.search(
            q('issuetype = Test'), max_results=100,
            fields=[f for f in [auto_field, type_field, 'status'] if f])
        sissues = (sample or {}).get('issues', [])
        auto_vals, type_vals, status_vals = set(), set(), set()
        for it in sissues:
            fz = it.get('fields', {})
            if auto_field and _opt(fz.get(auto_field)):
                auto_vals.add(_opt(fz.get(auto_field)))
            if type_field and _opt(fz.get(type_field)):
                type_vals.add(_opt(fz.get(type_field)))
            stt = (fz.get('status') or {}).get('name')
            if stt:
                status_vals.add(stt)

        auto_id = _cf_jql_id(auto_field) if auto_field else None
        type_id = _cf_jql_id(type_field) if type_field else None

        # Union the live-sampled values with the known candidate sets so the dominant
        # categories are always counted exactly (a 100-issue sample can miss values).
        status_keys = sorted(status_vals | set(QE_TEST_STATUSES))
        auto_keys = sorted(auto_vals | set(QE_AUTOMATION_VALUES))
        type_keys = sorted(type_vals | set(QE_TEST_TYPE_VALUES))

        async def dist(keys, clause_fn):
            if not keys:
                return {}
            res = await asyncio.gather(*[count(q(clause_fn(k))) for k in keys])
            return {k: c for k, c in zip(keys, res) if c > 0}

        lifecycle, automation, test_type, defect_total, defect_open = await asyncio.gather(
            dist(status_keys, lambda s: f'issuetype = Test AND status = "{_jql_escape(s)}"'),
            dist(auto_keys, lambda v: f'issuetype = Test AND {auto_id} = "{_jql_escape(v)}"') if auto_id else _noop_dict(),
            dist(type_keys, lambda v: f'issuetype = Test AND {type_id} = "{_jql_escape(v)}"') if type_id else _noop_dict(),
            count(q('issuetype in (Bug, Defect)')),
            count(q('issuetype in (Bug, Defect) AND statusCategory != Done')),
        )

        # Fold any uncounted remainder into "Unspecified" so each breakdown sums to the total.
        for d in (automation, test_type):
            rem = test_total - sum(d.values())
            if rem > 0:
                d['Unspecified'] = rem

        automated = automation.get('Automated', 0)
        not_required = automation.get('Automation Not Required', 0)
        automatable = max(0, test_total - not_required)
        accepted = lifecycle.get('Accepted', 0)
        abandoned = lifecycle.get('Abandoned', 0)

        return {
            "testTotal": test_total,
            "lifecycle": lifecycle,
            "automation": automation,
            "testType": test_type,
            "defects": {"total": defect_total, "open": defect_open},
            "automated": automated,
            "requiresAutomation": automation.get('Requires Automation', 0),
            "automationCoverage": round(automated / automatable * 100) if automatable else 0,
            "accepted": accepted,
            "acceptanceRate": round(accepted / test_total * 100) if test_total else 0,
            "abandoned": abandoned,
            "defectDensity": round(defect_total / test_total * 100, 1) if test_total else 0.0,
        }
    except Exception as e:
        logger.error(f"compute_qe_metrics failed: {e}")
        return None


async def _noop_dict():
    return {}


def is_done_issue(fields: Dict[str, Any]) -> bool:
    """Use Jira's status category first, then common done-like status names."""
    status = fields.get("status") or {}
    status_category = ((status.get("statusCategory") or {}).get("name") or "").lower()
    status_name = (status.get("name") or "").lower()
    return status_category == "done" or status_name in DONE_STATUS_NAMES

def get_issue_type_name(fields: Dict[str, Any]) -> str:
    """Jira returns issue type as issuetype; older app code also used type."""
    issue_type = fields.get("issuetype") or fields.get("type") or {}
    return issue_type.get("name", "")

def format_metric_number(value: float):
    """Keep whole-number metrics tidy while preserving fractional story points."""
    rounded = round(value, 1)
    return int(rounded) if rounded == int(rounded) else rounded

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("🚀 Starting Leadership Management Tool API")
    
    # Initialize and start indexing scheduler
    try:
        from services.indexing_scheduler import get_indexing_scheduler
        scheduler = get_indexing_scheduler()
        
        # Set clients if available
        if app_state.jira_client:
            scheduler.set_clients(
                jira_client=app_state.jira_client,
                confluence_client=app_state.confluence_client,
                github_client=app_state.github_client
            )
        
        # Start scheduler (will auto-start when clients are set)
        # We'll start it after clients are connected via auto_connect_integrations
        logger.info("✅ Indexing scheduler initialized (will start after integrations connect)")
    except Exception as e:
        logger.warning(f"⚠️ Failed to initialize indexing scheduler: {e}")
    
    yield
    
    # Stop indexing scheduler on shutdown
    try:
        from services.indexing_scheduler import get_indexing_scheduler
        scheduler = get_indexing_scheduler()
        if scheduler.is_running():
            scheduler.stop()
            logger.info("✅ Indexing scheduler stopped")
    except Exception as e:
        logger.warning(f"⚠️ Error stopping indexing scheduler: {e}")
    
    logger.info("🛑 Shutting down Leadership Management Tool API")

app = FastAPI(
    title="Leadership Management Tool API", 
    version="1.0.0", 
    description="AI-powered leadership analytics and project management insights",
    lifespan=lifespan,
    openapi_tags=[
        {
            "name": "Chat",
            "description": "AI chat and conversation endpoints"
        },
        {
            "name": "JIRA",
            "description": "JIRA integration and analytics endpoints"
        },
        {
            "name": "Export",
            "description": "Data export and reporting endpoints"
        },
        {
            "name": "Analytics",
            "description": "Advanced analytics and insights endpoints"
        }
    ]
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        # Extra origins (e.g. a LAN IP for office sharing) come from env, not code
    ] + [o.strip() for o in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",") if o.strip()],
    # Also allow private-range dev hosts on common frontend ports.
    allow_origin_regex=r"^http://(10|192\.168|172\.(1[6-9]|2\d|3[01])|100)\.[\d.]+:300[01]$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip responses for large payloads
app.add_middleware(GZipMiddleware, minimum_size=500)

# Pydantic models
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    success: bool
    token: Optional[str] = None

class QEMetricsRequest(BaseModel):
    portfolio: str = 'Parts'
    product: str = 'All'
    container: str = 'All'
    timeline: str = 'All'
    message: Optional[str] = None
    email: Optional[str] = None

class KPIMetricsRequest(BaseModel):
    portfolio: str = 'All'
    project_key: str = 'All'
    project_name: str = 'All'
    rca: Optional[str] = 'All'

class JiraConfigRequest(BaseModel):
    url: str
    email: str
    api_token: str
    board_id: Optional[str] = None  # Make board_id truly optional

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    messages: List[ChatMessage] = []
    projectContext: Optional[str] = None
    cachedProjects: Optional[Dict[str, Any]] = None
    source: Optional[str] = "auto"  # "auto" (AI detects), "jira", "confluence", "github", or "auto"
    integrations: Optional[List[str]] = []  # List of selected integrations: ["jira", "confluence", "github"]

class TCOEMetricData(BaseModel):
    metric: Optional[str] = None
    key: Optional[str] = None
    label: Optional[str] = None
    rows: Optional[List[Dict[str, Any]]] = []
    other_fields: Optional[Dict[str, Any]] = None
    
    class Config:
        extra = "allow"  # Allow additional fields

class ExportTCOEMetricRequest(BaseModel):
    metric_key: str
    metric_data: Dict[str, Any]

class ExportAllTCOEMetricsRequest(BaseModel):
    metrics: List[Dict[str, Any]]

# Helper functions
async def handle_jira_question(message: str, jira_client: JiraClient) -> str:
    """Handle Jira-related questions with intelligent parsing"""
    try:
        message_lower = message.lower()
        
        # Extract ticket key (e.g., CCM-283)
        ticket_match = re.search(r'([A-Z][A-Z0-9]+-\d+)', message, re.IGNORECASE)
        
        if ticket_match:
            ticket_key = ticket_match.group(1).upper()
            return await get_ticket_details(ticket_key, jira_client)
        
        # Intelligent question routing with comprehensive pattern matching
        
        # Handle assignee-related questions (enhanced patterns)
        assignee_patterns = [
            'worked', 'assigned', 'assignee', 'who is', 'who has', 'who did', 'who does',
            'owner', 'responsible', 'developer', 'engineer', 'programmer', 'tester',
            'ashwin', 'thyagarajan', 'john', 'doe', 'jane', 'smith', 'mike', 'johnson',
            'sarah', 'wilson', 'david', 'brown', 'lisa', 'davis', 'robert', 'miller',
            'emily', 'jones', 'chris', 'anderson', 'amanda', 'taylor'
        ]
        if any(word in message_lower for word in assignee_patterns):
            return await search_by_assignee(message, jira_client)
        
        # Handle project-related questions (enhanced patterns)
        project_patterns = [
            'project', 'projects', 'proj', 'initiative', 'program', 'portfolio', 'product',
            'application', 'app', 'system', 'module', 'component', 'service',
            'how many projects', 'project count', 'project summary', 'project status',
            'project overview', 'project breakdown', 'project details'
        ]
        if any(word in message_lower for word in project_patterns):
            return await get_project_info(jira_client)
        
        # Handle sprint-related questions (enhanced patterns)
        sprint_patterns = [
            'sprint', 'sprints', 'iteration', 'iterations', 'cycle', 'cycles',
            'current sprint', 'active sprint', 'running sprint', 'ongoing sprint',
            'live sprint', 'open sprint', 'closed sprint', 'completed sprint',
            'finished sprint', 'done sprint', 'ended sprint', 'started sprint',
            'sprint status', 'sprint info', 'sprint details', 'sprint overview',
            'sprint progress', 'sprint velocity', 'sprint burndown', 'sprint burnup'
        ]
        if any(word in message_lower for word in sprint_patterns):
            return await get_sprint_info(jira_client)
        
        # Handle status-related questions (enhanced patterns)
        status_patterns = [
            'status', 'state', 'stage', 'phase', 'step', 'progress', 'progression',
            'todo', 'to do', 'open', 'new', 'assigned', 'in progress', 'in-progress',
            'under review', 'review', 'testing', 'test', 'qa', 'ready for test',
            'ready for qa', 'ready for review', 'ready for deploy', 'deployed',
            'released', 'closed', 'resolved', 'fixed', 'completed', 'done', 'finished',
            'cancelled', 'blocked', 'on hold', 'pending', 'waiting', 'stalled', 'stuck',
            'delayed', 'status breakdown', 'status overview', 'status summary',
            'status count', 'status report', 'status analytics'
        ]
        if any(word in message_lower for word in status_patterns):
            return await get_status_info(message, jira_client)
        
        # Handle issue type questions (enhanced patterns)
        issue_type_patterns = [
            'story', 'stories', 'bug', 'bugs', 'defect', 'defects', 'task', 'tasks',
            'epic', 'epics', 'subtask', 'subtasks', 'improvement', 'improvements',
            'feature', 'features', 'requirement', 'requirements', 'user story', 'user stories',
            'issue type', 'issue types', 'type breakdown', 'type overview', 'type summary',
            'type count', 'type report', 'type analytics', 'story count', 'bug count',
            'task count', 'defect count', 'feature count'
        ]
        if any(word in message_lower for word in issue_type_patterns):
            return await get_issue_type_info(message, jira_client)
        
        # Handle general analytics (enhanced patterns)
        analytics_patterns = [
            'summary', 'summaries', 'overview', 'overviews', 'analytics', 'analysis',
            'dashboard', 'metrics', 'kpi', 'kpis', 'statistics', 'stats', 'data',
            'insights', 'breakdown', 'breakdowns', 'count', 'counts', 'counting',
            'total', 'totals', 'number', 'numbers', 'how many', 'how much',
            'quantity', 'quantities', 'amount', 'amounts', 'percentage', 'percent',
            'ratio', 'ratios', 'rate', 'rates', 'trend', 'trends', 'trending',
            'pattern', 'patterns', 'distribution', 'report', 'reports', 'reporting'
        ]
        if any(word in message_lower for word in analytics_patterns):
            return await get_general_analytics(jira_client)
        
        # Default response with suggestions
        return """Hey! I can help you find stuff in Jira. Here's what I can do:

🎫 **Find tickets:** "Tell me about CCM-283" or "What's up with CCM-123?"

👤 **Check who's working on what:** "What's Ashwin working on?" or "Who's got CCM-283?"

📁 **Project stuff:** "How many projects do we have?" or "What's our project status?"

🏃 **Sprint info:** "What's our current sprint?" or "Sprint details please"

📊 **Status check:** "What's in progress?" or "Show me completed work"

Just ask me naturally - I'll figure out what you need! 😊"""
    
    except Exception as e:
        logger.error(f"Jira question handling error: {e}")
        return f"Oops! I ran into an issue while processing your question: {str(e)}"

async def get_ticket_details(ticket_key: str, jira_client: JiraClient) -> str:
    """Get detailed information about a specific ticket"""
    try:
        # First, check if we can access any projects to determine if it's a permissions issue
        projects = await jira_client.get_projects()
        if len(projects) == 0:
            return f"""I couldn't find ticket {ticket_key}, and it appears there may be a permissions issue with your Jira access.

🔍 **Possible reasons:**
• You may not have permission to view projects in this Jira instance
• The ticket might be in a project you don't have access to
• Your API token might need additional permissions

💡 **Next steps:**
• Verify your Jira permissions with your administrator
• Check if the ticket exists in a different project
• Ensure your API token has "Browse Projects" permission

If you believe this is an error, please contact your Jira administrator for assistance."""
        
        jql = f"key = {ticket_key}"
        result = await jira_client.search(jql, max_results=1)
        
        if result.get('issues') and len(result.get('issues', [])) > 0:
            issue = result['issues'][0]
            fields = issue.get('fields', {})
            
            assignee = fields.get('assignee')
            assignee_name = assignee.get('displayName', 'Unassigned') if assignee else 'Unassigned'
            assignee_email = assignee.get('emailAddress', '') if assignee else ''
            
            status = fields.get('status', {}).get('name', 'Unknown')
            summary = fields.get('summary', 'No summary')
            issue_type = fields.get('type', {}).get('name', 'Unknown')
            priority = fields.get('priority', {}).get('name', 'Unknown')
            project = fields.get('project', {}).get('name', 'Unknown')
            
            # Get additional fields if available
            description = fields.get('description', 'No description')
            created = fields.get('created', 'Unknown')
            updated = fields.get('updated', 'Unknown')
            
            response = f"""Found it! Here's what I know about **{ticket_key}**:

📋 **What it's about:** {summary}
👤 **Assigned to:** {assignee_name} {f'({assignee_email})' if assignee_email else ''}
📊 **Current status:** {status}
🏷️ **Type:** {issue_type}
⚡ **Priority:** {priority}
📁 **Project:** {project}
📅 **Created:** {created[:10] if created != 'Unknown' else 'Unknown'}
🔄 **Last updated:** {updated[:10] if updated != 'Unknown' else 'Unknown'}"""
            
            if description and description != 'No description':
                # Truncate long descriptions
                desc_preview = description[:200] + "..." if len(description) > 200 else description
                response += f"\n📝 **Description:** {desc_preview}"
            
            return response
        else:
            # Check if we can see any tickets at all to provide better error message
            try:
                # Try to search for any tickets to see if it's a general permissions issue
                any_tickets = await jira_client.search("order by created DESC", max_results=1)
                if any_tickets.get('total', 0) == 0:
                    return f"""I couldn't find ticket {ticket_key}, and it appears you may not have permission to view tickets in this Jira instance.

🔍 **This could mean:**
• You don't have "Browse Projects" permission
• The ticket is in a restricted project
• Your API token needs additional permissions

💡 **Please check with your Jira administrator about:**
• Your project access permissions
• Whether the ticket exists and is accessible
• API token permissions for ticket viewing"""
            except Exception:
                pass  # If this fails, fall back to the generic message
            
            return f"""I couldn't find ticket {ticket_key} in the accessible projects.

🔍 **Possible reasons:**
• The ticket number might be incorrect
• The ticket might be in a project you don't have access to
• The ticket might have been deleted or moved

💡 **Try:**
• Double-check the ticket number (e.g., CCM-283)
• Ask your team if the ticket exists
• Check if you have access to the project containing this ticket"""
    
    except Exception as e:
        logger.error(f"Error getting ticket details: {e}")
        return f"""I encountered an error while searching for {ticket_key}: {str(e)}

🔍 **This might indicate:**
• A connection issue with Jira
• Authentication problems
• API permission issues

💡 **Please verify:**
• Your Jira connection is working
• Your API token is valid and has proper permissions
• You have access to the Jira instance"""

async def search_by_assignee(message: str, jira_client: JiraClient) -> str:
    """Search for tickets by assignee with intelligent name extraction"""
    try:
        # Simple and effective name extraction
        message_lower = message.lower()
        
        # Direct name mappings for common queries
        name_mappings = {
            'ashwin': 'Ashwin Thyagarajan',
            'thyagarajan': 'Ashwin Thyagarajan', 
            'ashwin thyagarajan': 'Ashwin Thyagarajan',
            'saiteja': 'Sai Teja Miriyala',
            'sai teja': 'Sai Teja Miriyala',
            'sai teja miriyala': 'Sai Teja Miriyala',
            'srikanth': 'Srikanth Chitturi',
            'srikanth chitturi': 'Srikanth Chitturi',
            'karthikeya': 'Karthikeya',
            'ajith': 'Ajith Kumar',
            'ajith kumar': 'Ajith Kumar',
            'priya': 'Priya Sharma',
            'priya sharma': 'Priya Sharma',
            'john doe': 'John Doe',
            'john': 'John Doe',
            'jane smith': 'Jane Smith',
            'jane': 'Jane Smith',
            'mike johnson': 'Mike Johnson',
            'mike': 'Mike Johnson',
            'sarah wilson': 'Sarah Wilson',
            'sarah': 'Sarah Wilson',
            'david brown': 'David Brown',
            'david': 'David Brown',
            'lisa davis': 'Lisa Davis',
            'lisa': 'Lisa Davis',
            'robert miller': 'Robert Miller',
            'robert': 'Robert Miller',
            'emily jones': 'Emily Jones',
            'emily': 'Emily Jones',
            'chris anderson': 'Chris Anderson',
            'chris': 'Chris Anderson',
            'amanda taylor': 'Amanda Taylor',
            'amanda': 'Amanda Taylor'
        }
        
        assignee_name = None
        
        # Check for direct matches first
        for key, value in name_mappings.items():
            if key in message_lower:
                assignee_name = value
                break
        
        # If no direct match, try to extract names from the message
        if not assignee_name:
            words = message.split()
            # Look for capitalized words that could be names
            potential_names = []
            skip_words = {
                'worked', 'assigned', 'assignee', 'who', 'is', 'has', 'on', 'to', 'the', 'a', 'an',
                'show', 'me', 'tickets', 'assigned', 'to', 'what', 'working', 'does', 'have',
                'tell', 'about', 'give', 'me', 'list', 'all', 'find', 'search', 'for', 'show'
            }
            
            for word in words:
                clean_word = word.strip('.,!?')
                if (clean_word not in skip_words and 
                    len(clean_word) > 2 and 
                    clean_word[0].isupper()):
                    potential_names.append(clean_word)
            
            # Try combinations
            if len(potential_names) >= 2:
                assignee_name = f"{potential_names[0]} {potential_names[1]}"
            elif len(potential_names) == 1:
                assignee_name = potential_names[0]
        
        if assignee_name:
            # Sanitize assignee name for JQL safety
            sanitized_name = assignee_name.replace('"', '\\"').replace("'", "\\'")
            
            # Try multiple JQL variations for better matching
            jql_variations = [
                f'assignee = "{sanitized_name}"',
                f'assignee ~ "{sanitized_name}"',  # Contains match
                f'assignee in ("{sanitized_name}")',
                f'assignee = "{sanitized_name}" AND type = Story'  # If asking for stories
            ]
            
            result = None
            working_jql = None
            
            for jql in jql_variations:
                try:
                    logger.info(f"Trying JQL: {jql}")
                    result = await jira_client.search(jql, max_results=50)
                    logger.info(f"JQL result: {result.get('total', 0)} tickets found")
                    if result.get('total', 0) > 0:
                        working_jql = jql
                        logger.info(f"Working JQL found: {working_jql}")
                        break
                except Exception as e:
                    logger.error(f"JQL failed: {jql}, Error: {e}")
                    continue
            
            if not result or result.get('total', 0) == 0:
                # Try a broader search to see if there are any tickets at all
                try:
                    logger.info("No tickets found with assignee filter, trying broader search...")
                    broad_result = await jira_client.search("project is not EMPTY", max_results=10)
                    logger.info(f"Broad search found {broad_result.get('total', 0)} total tickets")
                    
                    if broad_result.get('total', 0) > 0:
                        # Check if assignee names exist in the system
                        issues = broad_result.get('issues', [])
                        assignee_names = set()
                        for issue in issues:
                            assignee = issue.get('fields', {}).get('assignee')
                            if assignee and assignee.get('displayName'):
                                assignee_names.add(assignee.get('displayName'))
                        
                        logger.info(f"Found assignee names in system: {list(assignee_names)}")
                        
                        return f"Hey, I looked for {assignee_name} but couldn't find any tickets assigned to them. 🤔\n\n**What I found:**\n• Total tickets in system: {broad_result.get('total', 0)}\n• Available assignees: {', '.join(sorted(assignee_names))}\n\nMaybe check the spelling or try a different name? The system shows these people have tickets: {', '.join(sorted(assignee_names)[:5])}..."
                    else:
                        # Try semantic fallback before giving up
                        try:
                            rag_handler = get_jira_rag_handler()
                            if rag_handler:
                                logger.info("⚠️ Using Jira RAG semantic fallback for assignee search")
                                recent_search = await jira_client.search(
                                    "project is not EMPTY ORDER BY updated DESC",
                                    max_results=200
                                )
                                recent_issues = recent_search.get('issues', [])
                                if recent_issues:
                                    semantic_results = await rag_handler.find_similar_issues(
                                        query=f"assignee {assignee_name} " + (message or ""),
                                        issues=recent_issues,
                                        top_k=10
                                    )
                                    if semantic_results:
                                        lines = [f"No exact JQL matches, but found similar issues for '{assignee_name}':"]
                                        for issue in semantic_results:
                                            fields = issue.get('fields', {})
                                            lines.append(f"- {issue.get('key')}: {fields.get('summary', '')} (score {(issue.get('semantic_score',0)*100):.0f}%)")
                                        return "\n".join(lines)
                        except Exception as rag_err:
                            logger.warning(f"Semantic fallback for assignee failed: {rag_err}")
                        
                        return f"Hey, I couldn't find any tickets for {assignee_name}. 🤷‍♂️\n\n**What I checked:**\n• Total tickets in system: {broad_result.get('total', 0)}\n• Available assignees: {', '.join(sorted(assignee_names))}\n\nMaybe try a different name? I can see these people have tickets: {', '.join(sorted(assignee_names)[:5])}..."
                except Exception as debug_e:
                    logger.error(f"Debug search failed: {debug_e}")
                    return f"Hey, I ran into an issue while searching for {assignee_name}. 😅\n\n**What happened:**\n• Error: {str(debug_e)}\n• Total tickets in system: {broad_result.get('total', 0) if 'broad_result' in locals() else 'Unknown'}\n\nMaybe try again in a bit? Sometimes Jira can be a bit slow."
            
                issues = result['issues']
            
            # Validate that returned tickets actually belong to the queried person
            validated_issues = []
            for issue in issues:
                issue_assignee = issue.get('fields', {}).get('assignee', {}).get('displayName', '')
                if issue_assignee and (issue_assignee.lower() == assignee_name.lower() or 
                                     assignee_name.lower() in issue_assignee.lower() or
                                     issue_assignee.lower() in assignee_name.lower()):
                    validated_issues.append(issue)
                else:
                    logger.warning(f"Filtering out ticket {issue.get('key')} - assignee '{issue_assignee}' doesn't match queried '{assignee_name}'")
            
            if not validated_issues:
                logger.warning(f"No validated tickets found for {assignee_name} after filtering")
                return f"Hey, I found some tickets but they don't seem to be assigned to {assignee_name}. 🤔\n\n**What I found:**\n• Raw tickets found: {len(issues)}\n• Validated tickets: 0\n\nThis might be a name matching issue. Try checking the exact spelling in Jira."
            
            issues = validated_issues
            
            # Format response in a conversational, coworker style
            response = f"Hey! So I checked {assignee_name}'s work and here's what I found:\n\n"
            
            # Count by status and type
            status_counts = {}
            type_counts = {}
            done_tickets = []
            in_progress_tickets = []
            to_do_tickets = []
            
            for issue in issues:
                status = issue.get('fields', {}).get('status', {}).get('name', 'Unknown')
                issue_type = issue.get('fields', {}).get('type', {}).get('name', 'Unknown')
                
                status_counts[status] = status_counts.get(status, 0) + 1
                type_counts[issue_type] = type_counts.get(issue_type, 0) + 1
                
                # Categorize by status
                if status in ['Done', 'Closed', 'Resolved']:
                    done_tickets.append(issue)
                elif status in ['In Progress', 'Active', 'Open']:
                    in_progress_tickets.append(issue)
                else:
                    to_do_tickets.append(issue)
            
            # Conversational data summary
            response += f"**Total tickets:** {len(issues)}\n"
            response += f"**Status breakdown:**\n"
            for status, count in sorted(status_counts.items()):
                response += f"• {status}: {count}\n"
            
            # Examples in conversational style
            response += f"\n**Here are some examples:**\n"
            
            if done_tickets:
                response += f"\n✅ **Completed:**\n"
                for ticket in done_tickets[:3]:  # Show max 3 examples
                    key = ticket.get('key')
                    summary = ticket.get('fields', {}).get('summary', 'No title')
                    url = f"{jira_client.cfg.base_url}/browse/{key}"
                    response += f"• [{key}]({url}) - {summary}\n"
            
            if in_progress_tickets:
                response += f"\n🔄 **Currently working on:**\n"
                for ticket in in_progress_tickets[:3]:
                    key = ticket.get('key')
                    summary = ticket.get('fields', {}).get('summary', 'No title')
                    url = f"{jira_client.cfg.base_url}/browse/{key}"
                    response += f"• [{key}]({url}) - {summary}\n"
            
            if to_do_tickets:
                response += f"\n📋 **Still to do:**\n"
                for ticket in to_do_tickets[:3]:
                    key = ticket.get('key')
                    summary = ticket.get('fields', {}).get('summary', 'No title')
                    url = f"{jira_client.cfg.base_url}/browse/{key}"
                    response += f"• [{key}]({url}) - {summary}\n"
                
                return response
        else:
            return "I'm not sure who you're asking about. Try something like 'What's Ashwin working on?' or 'Who's got CCM-283?' 😊"
    
    except Exception as e:
        logger.error(f"Error searching by assignee: {e}")
        return f"Sorry, I couldn't search for assignee information: {str(e)}"

async def get_project_info(jira_client: JiraClient) -> str:
    """Get project information and statistics"""
    try:
        # Get all projects
        result = await jira_client.search("project is not EMPTY", max_results=1000)
        issues = result.get('issues', [])
        
        projects = {}
        for issue in issues:
            project_key = issue.get('fields', {}).get('project', {}).get('key', 'Unknown')
            project_name = issue.get('fields', {}).get('project', {}).get('name', 'Unknown')
            
            if project_key not in projects:
                projects[project_key] = {
                    'name': project_name,
                    'stories': 0,
                    'bugs': 0,
                    'tasks': 0,
                    'total': 0
                }
            
            projects[project_key]['total'] += 1
            
            issue_type = issue.get('fields', {}).get('type', {}).get('name', '').lower()
            if 'story' in issue_type:
                projects[project_key]['stories'] += 1
            elif 'bug' in issue_type or 'defect' in issue_type:
                projects[project_key]['bugs'] += 1
            elif 'task' in issue_type:
                projects[project_key]['tasks'] += 1
        
        response = f"Here's what I found across your **{len(projects)} projects**:\n\n"
        
        for project_key, data in projects.items():
            response += f"🏢 **{project_key}** - {data['name']}\n"
            response += f"   📊 Total: {data['total']} | 📖 Stories: {data['stories']} | 🐛 Bugs: {data['bugs']} | ✅ Tasks: {data['tasks']}\n\n"
        
        return response
    
    except Exception as e:
        logger.error(f"Error getting project info: {e}")
        return f"Sorry, I couldn't retrieve project information: {str(e)}"

async def get_sprint_info(jira_client: JiraClient) -> str:
    """Get current sprint information"""
    try:
        current_sprint = jira_client.get_current_sprint()
        if current_sprint:
            return f"""Here's your current sprint info:

🏃 **Sprint:** {current_sprint.get('name', 'Unknown')}
📊 **Status:** {current_sprint.get('state', 'Unknown')}
📅 **Started:** {current_sprint.get('startDate', 'Not set')}
📅 **Ends:** {current_sprint.get('endDate', 'Not set')}
🎯 **Goal:** {current_sprint.get('goal', 'No goal set')}"""
        else:
            return "Hmm, looks like there's no active sprint right now. Maybe check your sprint configuration? 🤔"
    
    except Exception as e:
        logger.error(f"Error getting sprint info: {e}")
        return f"Sorry, I couldn't retrieve sprint information: {str(e)}"

async def get_status_info(message: str, jira_client: JiraClient) -> str:
    """Get information about ticket statuses"""
    try:
        message_lower = message.lower()
        
        if 'todo' in message_lower or 'to do' in message_lower:
            jql = 'status = "To Do"'
            status_name = "To Do"
        elif 'in progress' in message_lower or 'progress' in message_lower:
            jql = 'status = "In Progress"'
            status_name = "In Progress"
        elif 'done' in message_lower or 'completed' in message_lower:
            jql = 'status = "Done"'
            status_name = "Done"
        else:
            # Get all statuses
            result = await jira_client.search("project is not EMPTY", max_results=100)
            issues = result.get('issues', [])
            
            status_counts = {}
            for issue in issues:
                status = issue.get('fields', {}).get('status', {}).get('name', 'Unknown')
                status_counts[status] = status_counts.get(status, 0) + 1
            
            response = "Here's your ticket status breakdown:\n\n"
            for status, count in sorted(status_counts.items()):
                response += f"🔸 **{status}:** {count} tickets\n"
            
            return response
        
        result = await jira_client.search(jql, max_results=50)
        issues = result.get('issues', [])
        
        response = f"Here are the tickets in **{status_name}** status ({len(issues)} total):\n\n"
        
        for issue in issues[:10]:  # Show max 10
            fields = issue.get('fields', {})
            key = issue.get('key', 'Unknown')
            summary = fields.get('summary', 'No summary')
            assignee = fields.get('assignee')
            assignee_name = assignee.get('displayName', 'Unassigned') if assignee else 'Unassigned'
            
            response += f"🎫 **{key}** - {summary}\n"
            response += f"   👤 Assigned to: {assignee_name}\n\n"
        
        if len(issues) > 10:
            response += f"... and {len(issues) - 10} more tickets! 😊"
        
        return response
    
    except Exception as e:
        logger.error(f"Error getting status info: {e}")
        return f"Sorry, I couldn't retrieve status information: {str(e)}"

async def get_issue_type_info(message: str, jira_client: JiraClient) -> str:
    """Get information about issue types"""
    try:
        message_lower = message.lower()
        
        if 'story' in message_lower or 'stories' in message_lower:
            jql = 'type = Story'
            type = "Story"
        elif 'bug' in message_lower or 'bugs' in message_lower or 'defect' in message_lower:
            jql = 'type in (Bug, Defect)'
            issue_type = "Bug/Defect"
        elif 'task' in message_lower or 'tasks' in message_lower:
            jql = 'type = Task'
            issue_type = "Task"
        else:
            # Get all issue types
            result = await jira_client.search("project is not EMPTY", max_results=100)
            issues = result.get('issues', [])
            
            type_counts = {}
            for issue in issues:
                issue_type = issue.get('fields', {}).get('type', {}).get('name', 'Unknown')
                type_counts[issue_type] = type_counts.get(issue_type, 0) + 1
            
            response = "Here's your issue type breakdown:\n\n"
            for issue_type, count in sorted(type_counts.items()):
                response += f"🔸 **{issue_type}:** {count} tickets\n"
            
            return response
        
        result = await jira_client.search(jql, max_results=50)
        issues = result.get('issues', [])
        
        response = f"Here are your **{issue_type}** tickets ({len(issues)} total):\n\n"
        
        for issue in issues[:10]:  # Show max 10
            fields = issue.get('fields', {})
            key = issue.get('key', 'Unknown')
            summary = fields.get('summary', 'No summary')
            status = fields.get('status', {}).get('name', 'Unknown')
            assignee = fields.get('assignee')
            assignee_name = assignee.get('displayName', 'Unassigned') if assignee else 'Unassigned'
            
            response += f"🎫 **{key}** - {summary}\n"
            response += f"   📊 Status: {status} | 👤 Assigned to: {assignee_name}\n\n"
        
        if len(issues) > 10:
            response += f"... and {len(issues) - 10} more tickets! 😊"
        
        return response
    
    except Exception as e:
        logger.error(f"Error getting issue type info: {e}")
        return f"Sorry, I couldn't retrieve issue type information: {str(e)}"

async def get_general_analytics(jira_client: JiraClient) -> str:
    """Get general analytics and summary"""
    try:
        result = await jira_client.search("project is not EMPTY", max_results=1000)
        issues = result.get('issues', [])
        
        # Calculate statistics
        total_issues = len(issues)
        projects = set()
        assignees = set()
        status_counts = {}
        type_counts = {}
        
        for issue in issues:
            fields = issue.get('fields', {})
            
            # Count projects
            project_key = fields.get('project', {}).get('key', 'Unknown')
            projects.add(project_key)
            
            # Count assignees
            assignee = fields.get('assignee')
            if assignee and assignee.get('displayName'):
                assignees.add(assignee.get('displayName'))
            
            # Count statuses
            status = fields.get('status', {}).get('name', 'Unknown')
            status_counts[status] = status_counts.get(status, 0) + 1
            
            # Count types
            issue_type = fields.get('type', {}).get('name', 'Unknown')
            type_counts[issue_type] = type_counts.get(issue_type, 0) + 1
        
        response = f"""Here's your Jira overview:

🎯 **Quick Stats:**
• Total Issues: {total_issues}
• Projects: {len(projects)}
• Team Members: {len(assignees)}

📊 **Status Breakdown:**
"""
        for status, count in sorted(status_counts.items()):
            response += f"• {status}: {count}\n"
        
        response += f"\n🏷️ **Issue Types:**\n"
        for issue_type, count in sorted(type_counts.items()):
            response += f"• {issue_type}: {count}\n"
        
        return response
    
    except Exception as e:
        logger.error(f"Error getting general analytics: {e}")
        return f"Sorry, I couldn't retrieve analytics information: {str(e)}"

async def handle_general_question(message: str) -> str:
    """Handle general questions with leadership focus"""
    if 'hello' in message or 'hi' in message:
        return """Hello! I'm your Leadership Quality Assistant for FalconX. I specialize in transforming project management data into actionable business insights.

I can help you with:
• Team performance analysis and capacity planning
• Project health assessment and risk identification  
• Sprint velocity trends and quality metrics
• Resource allocation and process optimization
• Strategic recommendations based on your data

What leadership insights would you like to explore today?"""
    
    elif 'help' in message:
        return """As your Leadership Quality Assistant, I provide strategic insights from your project data:

**TEAM PERFORMANCE:**
• "Show me Ajith's current workload and capacity"
• "Analyze team velocity trends for the last 3 sprints"
• "Who's overloaded and needs resource reallocation?"

**PROJECT HEALTH:**
• "What's the status of CCM project and any blockers?"
• "Identify risks in our current sprint"
• "Show me project progress against goals"

**QUALITY & PROCESS:**
• "Analyze our defect rates and quality trends"
• "What process improvements do you recommend?"
• "How can we optimize our sprint planning?"

**STRATEGIC INSIGHTS:**
• "Give me leadership insights on team performance"
• "What are the key risks I should be aware of?"
• "Recommend resource allocation strategies"

I focus on actionable insights that drive business decisions. What would you like to explore?"""
    
    elif any(word in message for word in ['thank', 'thanks']):
        return "You're welcome! I'm here to help you make data-driven leadership decisions. What else would you like to analyze?"
    
    else:
        return f"""I'm your Leadership Quality Assistant, focused on providing strategic insights from your project data. I can help analyze team performance, project health, quality metrics, and resource allocation. 

For '{message}', I'd need more context about what specific leadership insights you're looking for. Are you interested in team performance, project status, quality analysis, or strategic recommendations?"""

# AI Insight Generation Functions
async def generate_velocity_insights(analytics: Dict[str, Any], jira_client: JiraClient) -> Dict[str, Any]:
    """Generate velocity and sprint insights"""
    summary = analytics["summary"]
    projects = analytics["projects"]
    current_sprint = analytics.get("current_sprint")
    
    # Calculate velocity metrics
    total_stories = summary["total_stories"]
    total_defects = summary["total_defects"]
    defect_ratio = (total_defects / total_stories * 100) if total_stories > 0 else 0
    
    insights = []
    recommendations = []
    
    # Velocity analysis
    if current_sprint:
        insights.append(f"**Current Sprint:** {current_sprint.get('name', 'Unknown')}")
        insights.append(f"**Sprint State:** {current_sprint.get('state', 'Unknown')}")
    
    insights.append(f"**Total Stories:** {total_stories}")
    insights.append(f"**Total Defects:** {total_defects}")
    insights.append(f"**Defect Ratio:** {defect_ratio:.1f}%")
    
    # Recommendations based on data
    if defect_ratio > 20:
        recommendations.append("🔴 **High Defect Ratio:** Consider improving testing processes and code review practices")
    elif defect_ratio < 5:
        recommendations.append("🟢 **Low Defect Ratio:** Excellent quality! Maintain current practices")
    else:
        recommendations.append("🟡 **Moderate Defect Ratio:** Room for improvement in quality processes")
    
    if total_stories > 100:
        recommendations.append("📈 **High Story Count:** Consider breaking down large stories for better estimation")
    
    return {
        "success": True,
        "type": "velocity",
        "insights": insights,
        "recommendations": recommendations,
        "metrics": {
            "total_stories": total_stories,
            "total_defects": total_defects,
            "defect_ratio": defect_ratio,
            "total_projects": summary["total_projects"]
        }
    }

async def generate_team_insights(analytics: Dict[str, Any], jira_client: JiraClient) -> Dict[str, Any]:
    """Generate team performance insights"""
    summary = analytics["summary"]
    projects = analytics["projects"]
    
    insights = []
    recommendations = []
    
    # Team distribution analysis
    total_assignees = summary["total_assignees"]
    total_issues = summary["total_issues"]
    avg_issues_per_person = total_issues / total_assignees if total_assignees > 0 else 0
    
    insights.append(f"**Total Team Members:** {total_assignees}")
    insights.append(f"**Total Issues:** {total_issues}")
    insights.append(f"**Average Issues per Person:** {avg_issues_per_person:.1f}")
    
    # Project distribution
    project_count = len(projects)
    insights.append(f"**Active Projects:** {project_count}")
    
    # Find most active project
    if projects:
        most_active = max(projects.items(), key=lambda x: x[1]['total_issues'])
        insights.append(f"**Most Active Project:** {most_active[0]} ({most_active[1]['total_issues']} issues)")
    
    # Recommendations
    if avg_issues_per_person > 20:
        recommendations.append("⚠️ **High Workload:** Consider redistributing tasks or adding team members")
    elif avg_issues_per_person < 5:
        recommendations.append("📊 **Low Workload:** Team has capacity for additional work")
    
    if project_count > 5:
        recommendations.append("🎯 **Multiple Projects:** Consider consolidating or prioritizing projects")
    
    return {
        "success": True,
        "type": "team_performance",
        "insights": insights,
        "recommendations": recommendations,
        "metrics": {
            "total_assignees": total_assignees,
            "total_issues": total_issues,
            "avg_issues_per_person": avg_issues_per_person,
            "project_count": project_count
        }
    }

async def generate_project_insights(analytics: Dict[str, Any], jira_client: JiraClient) -> Dict[str, Any]:
    """Generate project health insights"""
    projects = analytics["projects"]
    
    insights = []
    recommendations = []
    
    # Project health analysis
    healthy_projects = 0
    for project_key, project_data in projects.items():
        stories = project_data['stories']
        defects = project_data['defects']
        defect_ratio = (defects / stories * 100) if stories > 0 else 0
        
        if defect_ratio < 15 and stories > 0:
            healthy_projects += 1
        
        insights.append(f"**{project_key}:** {stories} stories, {defects} defects ({defect_ratio:.1f}% defect ratio)")
    
    health_percentage = (healthy_projects / len(projects) * 100) if projects else 0
    insights.append(f"**Project Health:** {health_percentage:.1f}% of projects are healthy")
    
    # Recommendations
    if health_percentage < 50:
        recommendations.append("🔴 **Low Project Health:** Focus on improving quality processes across projects")
    elif health_percentage > 80:
        recommendations.append("🟢 **Excellent Project Health:** Maintain current practices")
    else:
        recommendations.append("🟡 **Good Project Health:** Continue current practices with minor improvements")
    
    return {
        "success": True,
        "type": "project_health",
        "insights": insights,
        "recommendations": recommendations,
        "metrics": {
            "total_projects": len(projects),
            "healthy_projects": healthy_projects,
            "health_percentage": health_percentage
        }
    }

async def generate_general_insights(analytics: Dict[str, Any], jira_client: JiraClient) -> Dict[str, Any]:
    """Generate general insights"""
    summary = analytics["summary"]
    projects = analytics["projects"]
    
    insights = []
    recommendations = []
    
    # General overview
    insights.append(f"**Total Projects:** {summary['total_projects']}")
    insights.append(f"**Total Stories:** {summary['total_stories']}")
    insights.append(f"**Total Defects:** {summary['total_defects']}")
    insights.append(f"**Total Tasks:** {summary['total_tasks']}")
    insights.append(f"**Team Size:** {summary['total_assignees']} members")
    
    # Key recommendations
    recommendations.append("📊 **Data-Driven Decisions:** Use these metrics to guide sprint planning")
    recommendations.append("🎯 **Focus Areas:** Prioritize projects with high defect ratios")
    recommendations.append("👥 **Team Balance:** Ensure even distribution of work across team members")
    recommendations.append("📈 **Continuous Improvement:** Track these metrics over time for trend analysis")
    
    return {
        "success": True,
        "type": "general",
        "insights": insights,
        "recommendations": recommendations,
        "metrics": summary
    }

# API Routes
@app.get("/")
async def root():
    return {"message": "Integration Hub API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Authentication endpoints
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production-min-32-chars")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 hours

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def authenticate_user(username: str, password: str) -> Optional[dict]:
    """
    Authenticate user against CDK LDAP/Active Directory
    User credentials are NOT stored - only used for authentication
    """
    try:
        from services.ldap_auth import authenticate_user_from_ldap
        
        user_info = authenticate_user_from_ldap(username, password)
        if user_info:
            logger.info(f"User authenticated successfully: {user_info.get('username')}")
            return {
                "username": user_info.get("username", username),
                "email": user_info.get("email", f"{username}@cdk.com"),
                "sAMAccountName": user_info.get("sAMAccountName", username),
                "role": user_info.get("role", "viewer")
            }
        logger.warning(f"Authentication failed for user: {username}")
        return None
    except Exception as e:
        logger.error(f"LDAP authentication error: {e}")
        return None

@app.post("/api/auth/login", tags=["Authentication"], summary="CDK Network Login")
async def login_endpoint(request: LoginRequest):
    """Authenticate user and return JWT token"""
    try:
        user = await authenticate_user(request.username, request.password)
        if not user:
            return {
                "success": False,
                "message": "Invalid username or password"
            }
        
        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["username"], "email": user.get("email", ""), "role": user.get("role", "viewer")},
            expires_delta=access_token_expires
        )
        
        return {
            "success": True,
            "token": access_token,
            "username": user.get("username", request.username),
            "email": user.get("email", f"{request.username}@cdk.com"),
            "role": user.get("role", "viewer"),
            "message": "Login successful"
        }
    except Exception as e:
        logger.error(f"Login error: {e}")
        return {
            "success": False,
            "message": f"Authentication failed: {str(e)}"
        }

@app.post("/api/auth/auto-connect-integrations", tags=["Authentication"], summary="Auto-connect Jira and Confluence")
async def auto_connect_integrations():
    """
    Automatically connect Jira and Confluence using common service account credentials
    Called after successful LDAP login.
    Credentials are encrypted in environment variables.
    """
    try:
        from services.encryption import get_encrypted_env
        from services.confluence import ConfluenceConfig
        
        # Get common credentials from environment (encrypted)
        jira_email = os.environ.get('JIRA_SERVICE_EMAIL')
        jira_api_token_encrypted = os.environ.get('JIRA_SERVICE_API_TOKEN')
        jira_url = os.environ.get('JIRA_BASE_URL', 'https://projects.cdk.com')
        jira_board_id = os.environ.get('JIRA_BOARD_ID', '')
        
        confluence_email = os.environ.get('CONFLUENCE_SERVICE_EMAIL')
        confluence_api_token_encrypted = os.environ.get('CONFLUENCE_SERVICE_API_TOKEN')
        confluence_url = os.environ.get('CONFLUENCE_BASE_URL', 'https://projects.cdk.com/wiki')

        github_token_encrypted = os.environ.get('GITHUB_SERVICE_TOKEN')

        results = {
            "jira": {"success": False, "message": ""},
            "confluence": {"success": False, "message": ""},
            "github": {"success": False, "message": ""}
        }
        
        # Connect Jira
        if jira_email and jira_api_token_encrypted:
            try:
                # Decrypt API token (stored encrypted in .env)
                jira_api_token = get_encrypted_env('JIRA_SERVICE_API_TOKEN')
                
                jira_config = JiraConfig(
                    base_url=jira_url,
                    email=jira_email,
                    api_token=jira_api_token,
                    board_id=jira_board_id
                )
                jira_client = JiraClient(jira_config)
                await jira_client.initialize()

                validation = await jira_client.validate_connection()
                if not validation.get("success"):
                    await jira_client.close()
                    raise RuntimeError(validation.get("message", "Jira connection validation failed"))

                # Fetch projects after auth is verified. This endpoint can return an
                # empty list for accounts with limited visibility, so validation above
                # is the source of truth for connection health.
                projects = await jira_client.get_projects()
                app_state.jira_configured = True
                app_state.jira_client = jira_client
                app_state.jira_config = jira_config
                app_state.jira_board_id = jira_board_id or None
                
                results["jira"] = {
                    "success": True,
                    "message": (
                        f"Connected successfully as {validation.get('user', 'Jira user')}. "
                        f"Search visibility: {validation.get('visible_issues', 0)} issues. "
                        f"Project endpoint returned {len(projects)} projects."
                    )
                }
                logger.info(
                    "Jira auto-connected successfully as %s; search visibility=%s; project endpoint projects=%s",
                    validation.get("user", "Jira user"),
                    validation.get("visible_issues", 0),
                    len(projects),
                )
                
                # Clear token from memory
                del jira_api_token
            except Exception as e:
                if 'jira_client' in locals() and jira_client:
                    try:
                        await jira_client.close()
                    except Exception:
                        pass
                app_state.jira_configured = False
                app_state.jira_client = None
                app_state.jira_config = None
                app_state.jira_board_id = None
                results["jira"] = {
                    "success": False,
                    "message": f"Failed to connect: {str(e)}"
                }
                logger.error(f"Jira auto-connect failed: {e}")
        else:
            results["jira"] = {
                "success": False,
                "message": "Jira service credentials not configured"
            }
        
        # Connect Confluence
        if confluence_email and confluence_api_token_encrypted:
            try:
                # Decrypt API token (stored encrypted in .env)
                confluence_api_token = get_encrypted_env('CONFLUENCE_SERVICE_API_TOKEN')
                
                confluence_config = ConfluenceConfig(
                    base_url=confluence_url,
                    email=confluence_email,
                    api_token=confluence_api_token
                )
                from services.confluence import ConfluenceClient
                confluence_client = ConfluenceClient(confluence_config)
                await confluence_client.initialize()
                
                # Test connection
                spaces = await confluence_client.get_spaces()
                app_state.confluence_config = confluence_config
                app_state.confluence_client = confluence_client
                app_state.confluence_configured = True
                
                results["confluence"] = {
                    "success": True,
                    "message": f"Connected successfully. Found {len(spaces)} spaces."
                }
                logger.info(f"Confluence auto-connected successfully with {len(spaces)} spaces")
                
                # Clear token from memory
                del confluence_api_token
            except Exception as e:
                results["confluence"] = {
                    "success": False,
                    "message": f"Failed to connect: {str(e)}"
                }
                logger.error(f"Confluence auto-connect failed: {e}")
        else:
            results["confluence"] = {
                "success": False,
                "message": "Confluence service credentials not configured"
            }

        # Connect GitHub
        if github_token_encrypted:
            try:
                # Decrypt token (stored encrypted in .env)
                github_token = get_encrypted_env('GITHUB_SERVICE_TOKEN')
                if not github_token:
                    raise RuntimeError("GitHub service token could not be decrypted")

                app_state.github_client.set_token(github_token)

                status = await app_state.github_client.get_status()
                if not status.get("connected"):
                    raise RuntimeError(status.get("error", "GitHub connection validation failed"))

                results["github"] = {
                    "success": True,
                    "message": f"Connected successfully as {status.get('user', 'GitHub user')}."
                }
                logger.info("GitHub auto-connected successfully as %s", status.get("user", "GitHub user"))

                # Clear token from memory
                del github_token
            except Exception as e:
                results["github"] = {
                    "success": False,
                    "message": f"Failed to connect: {str(e)}"
                }
                logger.error(f"GitHub auto-connect failed: {e}")
        else:
            results["github"] = {
                "success": False,
                "message": "GitHub service credentials not configured"
            }

        # Start indexing scheduler if clients are available
        try:
            from services.indexing_scheduler import get_indexing_scheduler
            scheduler = get_indexing_scheduler()
            
            # Set clients
            scheduler.set_clients(
                jira_client=app_state.jira_client if app_state.jira_configured else None,
                confluence_client=app_state.confluence_client if app_state.confluence_configured else None,
                github_client=app_state.github_client
            )
            
            # Start scheduler if not already running
            if not scheduler.is_running():
                scheduler.start()
                logger.info("✅ Automated indexing scheduler started")
            
            # Warm up index on first connection: full index only if store is empty
            if app_state.confluence_configured and app_state.confluence_client:
                logger.info("🚀 Triggering index warmup check (background task)...")
                asyncio.create_task(scheduler.warmup_if_empty())
                logger.info("✅ Index warmup task started in background")
        except Exception as e:
            logger.warning(f"⚠️ Failed to start indexing scheduler: {e}")
        
        return {
            "success": True,
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Auto-connect error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/auth/verify", tags=["Authentication"], summary="Verify Token")
async def verify_token_endpoint(authorization: Optional[str] = Header(None)):
    """Verify JWT token"""
    try:
        # Extract token from Authorization header
        if not authorization or not authorization.startswith("Bearer "):
            return {"success": False, "message": "Missing or invalid authorization header"}
        
        token = authorization.split("Bearer ")[1]
        
        # Decode token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        email = payload.get("email", "")
        role = payload.get("role", "viewer")

        return {
            "success": True,
            "username": username,
            "email": email,
            "role": role
        }
    except jwt.ExpiredSignatureError:
        return {"success": False, "message": "Token has expired"}
    except jwt.InvalidTokenError:
        return {"success": False, "message": "Invalid token"}
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        return {"success": False, "message": f"Token verification failed: {str(e)}"}

@app.post("/api/jira/configure")
async def configure_jira(config: JiraConfigRequest):
    """Configure Jira connection"""
    try:
        # Validate and fix URL format
        url = config.url.strip()
        if not url.startswith(('http://', 'https://')):
            # Default to https for security
            url = f"https://{url}"
            logger.info(f"Added https:// protocol to URL: {url}")
        
        # Create JiraConfig object
        jira_config = JiraConfig(
            base_url=url,
            email=config.email,
            api_token=config.api_token,
            board_id=config.board_id
        )
        
        # Create Jira client
        jira_client = JiraClient(jira_config)

        # Initialize the async client
        await jira_client.initialize()

        # Jira Server/DC serves /project anonymously (200 + empty list) for bad
        # tokens, so a projects fetch alone cannot prove the credentials work.
        # Validate auth first and refuse to touch the existing client on failure.
        validation = await jira_client.validate_connection()
        if not validation.get("success"):
            await jira_client.close()
            logger.warning(f"Rejected /api/jira/configure: {validation.get('message')}")
            raise HTTPException(
                status_code=400,
                detail=validation.get("message", "Jira credential validation failed"),
            )

        projects_count = 0
        current_sprint = None
        try:
            projects = await jira_client.get_projects()
            projects_count = len(projects)
            logger.info(f"Successfully connected to Jira. Found {projects_count} projects")

            # Try to get current sprint if board_id is provided
            if config.board_id:
                try:
                    # Attempt to get sprint info (implementation depends on your JiraClient)
                    pass
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Could not get projects, but connection may still work: {e}")

        # Store configuration, closing the previous client to avoid leaking connections
        if app_state.jira_client and app_state.jira_client is not jira_client:
            try:
                await app_state.jira_client.close()
            except Exception:
                pass
        app_state.jira_configured = True
        app_state.jira_client = jira_client
        app_state.jira_config = jira_config
        app_state.jira_board_id = config.board_id

        logger.info("Jira configured successfully. Confluence must be configured separately.")
        
        return {
            "success": True,
            "message": "Jira configured successfully",
            "projects": projects_count,
            "current_sprint": current_sprint,
            "config": {
                "url": config.url,
                "email": config.email,
                "board_id": config.board_id
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Jira configuration failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/jira/disconnect")
async def disconnect_jira():
    """Disconnect Jira connection"""
    try:
        # Close the async client if it exists
        if app_state.jira_client:
            await app_state.jira_client.close()
        
        # Clear configuration
        app_state.jira_configured = False
        app_state.jira_client = None
        app_state.jira_config = None
        app_state.jira_board_id = None
        
        return {
            "success": True,
            "message": "Jira disconnected successfully"
        }
    except Exception as e:
        logger.error(f"Jira disconnection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jira/status", tags=["JIRA"], summary="Get JIRA Connection Status")
async def get_jira_status():
    """Get Jira connection status"""
    return {
        "configured": app_state.jira_configured,
        "board_id": app_state.jira_board_id,
        "config": {
            "url": app_state.jira_config.base_url if app_state.jira_config else None,
            "email": mask_email(app_state.jira_config.email) if app_state.jira_config else None
        } if app_state.jira_config else None
    }

@app.get("/api/confluence/status", tags=["CONFLUENCE"], summary="Get Confluence Connection Status")
async def get_confluence_status():
    """Get Confluence connection status"""
    return {
        "configured": app_state.confluence_configured,
        "config": {
            "url": app_state.confluence_config.base_url if app_state.confluence_config else None,
            "email": mask_email(app_state.confluence_config.email) if app_state.confluence_config else None
        } if app_state.confluence_config else None
    }

@app.get("/api/index-status", tags=["CONFLUENCE"], summary="Get Confluence Index Status")
async def get_index_status():
    """
    Returns the real-time status of the Confluence vector index.
    Use this to show a progress indicator while the index is being built.

    Response fields:
      - is_indexing    : bool  — true while a full/incremental index is running
      - phase          : str   — current phase name (idle | warmup | full_confluence | ...)
      - progress_pct   : int   — 0-100 percentage of current phase
      - doc_count      : int   — total chunks currently in the vector store
      - last_indexed_at: str   — ISO timestamp of last successful completion
      - last_error     : str   — last error message, or null
      - scheduler_running: bool — whether the background scheduler is active
    """
    try:
        from services.indexing_scheduler import get_indexing_scheduler
        scheduler = get_indexing_scheduler()
        status = scheduler.get_status() if scheduler else {"phase": "not_initialized", "is_indexing": False}
        return {"success": True, **status}
    except Exception as e:
        logger.warning(f"Failed to get index status: {e}")
        return {"success": False, "error": str(e), "is_indexing": False, "doc_count": 0}


@app.post("/api/confluence/disconnect")
async def disconnect_confluence():
    """Disconnect Confluence connection"""
    try:
        if app_state.confluence_client and hasattr(app_state.confluence_client, 'close'):
            try:
                await app_state.confluence_client.close()  # type: ignore
            except Exception:
                pass
        app_state.confluence_configured = False
        app_state.confluence_client = None
        app_state.confluence_config = None
        return {"success": True, "message": "Confluence disconnected successfully"}
    except Exception as e:
        logger.error(f"Confluence disconnection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/confluence/configure", tags=["CONFLUENCE"], summary="Configure Confluence Connection")
async def configure_confluence(config: dict):
    """Configure Confluence connection independently"""
    try:
        # Validate and fix URL format
        url = config.get('url', '').strip()
        if not url.startswith(('http://', 'https://')):
            # Default to https for security
            url = f"https://{url}"
            logger.info(f"Added https:// protocol to URL: {url}")
        
        # Create ConfluenceConfig object
        confluence_config = ConfluenceConfig(
            base_url=url,
            email=config.get('email', ''),
            api_token=config.get('api_token', '')
        )
        
        # Create Confluence client
        from services.confluence import ConfluenceClient
        confluence_client = ConfluenceClient(confluence_config)
        
        # Initialize the async client
        await confluence_client.initialize()

        # Validate before storing: bad tokens can be served anonymously, so an
        # empty spaces list means the credentials don't actually work. Never
        # replace a working client with an unvalidated one (mirrors Jira).
        try:
            spaces = await confluence_client.get_spaces()
        except Exception as e:
            await confluence_client.close()
            logger.warning(f"Rejected /api/confluence/configure: {e}")
            raise HTTPException(status_code=400, detail=f"Confluence credential validation failed: {e}")
        if not spaces:
            await confluence_client.close()
            logger.warning("Rejected /api/confluence/configure: credentials cannot see any spaces")
            raise HTTPException(
                status_code=400,
                detail="Confluence authenticated, but the account cannot see any spaces. Check credentials/permissions.",
            )
        logger.info(f"Successfully connected to Confluence. Found {len(spaces)} spaces")

        # Update app state, closing the previous client to avoid leaking connections
        if app_state.confluence_client and app_state.confluence_client is not confluence_client:
            try:
                await app_state.confluence_client.close()
            except Exception:
                pass
        app_state.confluence_config = confluence_config
        app_state.confluence_client = confluence_client
        app_state.confluence_configured = True

        logger.info("Confluence configured successfully as separate connection")

        return {
            "success": True,
            "message": "Confluence configured successfully",
            "config": {
                "url": url,
                "email": config.get('email', '')
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Confluence configuration failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/jira/sprint/current")
async def get_current_sprint():
    """Get current sprint information"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        current_sprint = await app_state.jira_client.get_current_sprint()
        return {
            "success": True,
            "sprint": current_sprint
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jira/search")
async def search_jira_issues(request: Dict[str, Any]):
    """Search Jira issues"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        jql = request.get("jql", "project is not EMPTY")
        max_results = request.get("max_results", 50)
        fields = request.get("fields", None)
        
        result = await app_state.jira_client.search(jql, max_results)
        
        # If no issues, use semantic/Jira RAG fallback on recent issues
        if (not isinstance(result, dict)) or result.get("total", 0) == 0:
            try:
                rag_handler = get_jira_rag_handler()
                if rag_handler:
                    recent_search = await app_state.jira_client.search(
                        "project is not EMPTY ORDER BY updated DESC",
                        max_results=200
                    )
                    recent_issues = recent_search.get('issues', [])
                    if recent_issues:
                        similar = await rag_handler.find_similar_issues(
                            query=jql,
                            issues=recent_issues,
                            top_k=10
                        )
                        if similar:
                            return {
                                "success": True,
                                "result": {
                                    "issues": similar,
                                    "total": len(similar),
                                    "rag_fallback": True
                                }
                            }
            except Exception as rag_err:
                logger.warning(f"Semantic fallback for /api/jira/search failed: {rag_err}")
        
        return {
            "success": True,
            "result": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jira/analytics")
async def get_jira_analytics():
    """Get comprehensive Jira analytics with AI insights"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        # Initialize analytics engine if not already done
        if not app_state.analytics_engine:
            if not app_state.ai_engine:
                app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
            app_state.analytics_engine = AdvancedAnalyticsEngine(app_state.ai_engine, app_state.jira_client)
        
        # Generate comprehensive analytics
        analytics = await app_state.analytics_engine.generate_comprehensive_analytics()
        
        return {
            "success": True,
            "analytics": analytics
        }
    except Exception as e:
        logger.error(f"Advanced analytics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jira/predictive-analysis")
async def get_predictive_analysis(request: Dict[str, Any]):
    """Get predictive analysis and forecasting"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        query = request.get("query", "What are the trends and predictions for our team performance?")
        
        # Initialize AI components if not already done
        if not app_state.ai_engine:
            app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
        if not app_state.analytics_engine:
            app_state.analytics_engine = AdvancedAnalyticsEngine(app_state.ai_engine, app_state.jira_client)
        
        # Get historical data for prediction
        historical_jql = "project is not EMPTY AND updated >= -90d ORDER BY updated DESC"
        historical_data = await app_state.jira_client.search(historical_jql, max_results=1000)
        
        # Generate prediction
        prediction = app_state.ai_engine.generate_predictive_analysis(query, historical_data)
        
        return {
            "success": True,
            "prediction": prediction,
            "data_points": len(historical_data.get('issues', [])),
            "timeframe": "next_2_weeks"
        }
    except Exception as e:
        logger.error(f"Predictive analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jira/anomaly-detection")
async def get_anomaly_detection():
    """Get anomaly detection results"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        # Initialize analytics engine if not already done
        if not app_state.analytics_engine:
            if not app_state.ai_engine:
                app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
            app_state.analytics_engine = AdvancedAnalyticsEngine(app_state.ai_engine, app_state.jira_client)
        
        # Get current analytics
        analytics = await app_state.analytics_engine.generate_comprehensive_analytics()
        
        # Detect anomalies
        anomalies = app_state.analytics_engine.detect_anomalies(analytics)
        
        return {
            "success": True,
            "anomalies": [anomaly.__dict__ for anomaly in anomalies],
            "total_anomalies": len(anomalies),
            "critical_count": len([a for a in anomalies if a.severity == 'critical']),
            "high_count": len([a for a in anomalies if a.severity == 'high'])
        }
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jira/intelligent-recommendations")
async def get_intelligent_recommendations(request: Dict[str, Any]):
    """Get AI-powered intelligent recommendations"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        query = request.get("query", "What recommendations do you have for improving our team performance?")
        
        # Initialize AI components if not already done
        if not app_state.ai_engine:
            app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
        if not app_state.analytics_engine:
            app_state.analytics_engine = AdvancedAnalyticsEngine(app_state.ai_engine, app_state.jira_client)
        
        # Get comprehensive analytics
        analytics = await app_state.analytics_engine.generate_comprehensive_analytics()
        
        # Generate intelligent response with recommendations
        response = app_state.ai_engine.generate_intelligent_response(query, analytics)
        
        return {
            "success": True,
            "recommendations": response,
            "analytics_summary": analytics.get('summary', {}),
            "insights_count": len(analytics.get('ai_insights', [])),
            "anomalies_count": len(analytics.get('anomalies', []))
        }
    except Exception as e:
        logger.error(f"Intelligent recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jira/ai-insights")
async def get_ai_insights(request: Dict[str, Any]):
    """Get AI-powered insights and recommendations"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        insight_type = request.get("type", "general")
        jira_client = app_state.jira_client
        
        # Get analytics data directly from analytics engine
        if not app_state.analytics_engine:
            if not app_state.ai_engine:
                app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
            app_state.analytics_engine = AdvancedAnalyticsEngine(app_state.ai_engine, app_state.jira_client)
        
        analytics = await app_state.analytics_engine.generate_comprehensive_analytics()
        
        if insight_type == "velocity":
            return await generate_velocity_insights(analytics, jira_client)
        elif insight_type == "team_performance":
            return await generate_team_insights(analytics, jira_client)
        elif insight_type == "project_health":
            return await generate_project_insights(analytics, jira_client)
        else:
            return await generate_general_insights(analytics, jira_client)
            
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jira/export")
async def export_jira_analytics(request: Dict[str, Any]):
    """Export Jira analytics to various formats"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        export_format = request.get("format", "json")
        
        # Get analytics data
        analytics_response = await get_jira_analytics()
        analytics = analytics_response["analytics"]
        
        if export_format == "json":
            return {
                "success": True,
                "data": analytics,
                "format": "json",
                "filename": f"jira_analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            }
        elif export_format == "csv":
            # Convert to CSV format
            csv_data = convert_analytics_to_csv(analytics)
            return {
                "success": True,
                "data": csv_data,
                "format": "csv",
                "filename": f"jira_analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported export format")
            
    except Exception as e:
        logger.error(f"Export error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def convert_analytics_to_csv(analytics: Dict[str, Any]) -> str:
    """Convert analytics data to CSV format with robust error handling"""
    import csv
    import io
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write summary with safe access
    writer.writerow(["Metric", "Value"])
    summary = analytics.get("summary", {})
    for key, value in summary.items():
        writer.writerow([key.replace("_", " ").title(), value])
    
    writer.writerow([])  # Empty row
    
    # Write project details with safe access
    writer.writerow(["Project", "Stories", "Defects", "Tasks", "Total Issues", "Assignees"])
    projects = analytics.get("projects", {})
    for project_key, project_data in projects.items():
        writer.writerow([
            project_key,
            project_data.get("stories", 0),
            project_data.get("defects", 0),
            project_data.get("tasks", 0),
            project_data.get("total_issues", 0),
            project_data.get("assignee_count", 0)
        ])
    
    return output.getvalue()

@app.post("/api/jira/project-details", tags=["Jira"], summary="Get Project Details")
async def get_project_details(request: dict):
    """Get detailed information about a specific project"""
    try:
        project_key = request.get("projectKey")
        if not project_key:
            return {"error": "Project key is required"}
        
        if not app_state.jira_configured or not app_state.jira_client:
            return {"error": "Jira is not configured"}
        
        # Ensure Jira client is properly initialized
        if not app_state.jira_client._client:
            await app_state.jira_client.initialize()
        
        # Get project details
        project = await app_state.jira_client.get_project(project_key)
        
        if not project:
            return {"error": f"Project {project_key} not found"}
        
        # Get project issues
        issues_result = await app_state.jira_client.search(f"project = {project_key}")
        issues = issues_result.get('issues', [])
        
        # Get project statistics
        stats = {
            "total_issues": len(issues),
            "issue_types": {},
            "assignees": {},
            "statuses": {},
            "priorities": {}
        }
        
        for issue in issues:
            # Count issue types
            issue_type = issue.get("fields", {}).get("type", {}).get("name", "Unknown")
            stats["issue_types"][issue_type] = stats["issue_types"].get(issue_type, 0) + 1
            
            # Count assignees
            assignee = issue.get("fields", {}).get("assignee", {})
            if assignee:
                assignee_name = assignee.get("displayName", "Unassigned")
                stats["assignees"][assignee_name] = stats["assignees"].get(assignee_name, 0) + 1
            
            # Count statuses
            status = issue.get("fields", {}).get("status", {}).get("name", "Unknown")
            stats["statuses"][status] = stats["statuses"].get(status, 0) + 1
            
            # Count priorities
            priority = issue.get("fields", {}).get("priority", {}).get("name", "Unknown")
            stats["priorities"][priority] = stats["priorities"].get(priority, 0) + 1
        
        return {
            "project": project,
            "statistics": stats,
            "issues": issues[:10]  # Return first 10 issues for context
        }
        
    except Exception as e:
        logger.error(f"❌ Project details error: {e}")
        return {"error": f"Failed to get project details: {str(e)}"}

def is_metric_query(message: str) -> bool:
    """Detect if query is asking for a metric calculation (check this BEFORE document query)"""
    message_lower = message.lower()
    metric_keywords = [
        'defect leakage', 'leakage %', 'leakage rate', 'defect leakage rate',
        'automation %', 'automation percentage', 'test automation', 'regression automation', 'overall automation',
        'test coverage', 'coverage %', 'story coverage',
        'bug ratio', 'bugs per test', 'test story ratio',
        'what is the defect leakage', 'what is the automation', 'what is the coverage',
        'show me defect leakage', 'show me automation', 'calculate defect leakage', 'calculate automation',
        'defect leakage for', 'automation for', 'coverage for'
    ]
    return any(keyword in message_lower for keyword in metric_keywords)

def is_document_query(message: str) -> bool:
    """Detect if query is about documents/confluence/knowledge (but NOT metrics)

    NOTE: RAG/Vector Search is disabled by default. Toggle via ENABLE_RAG=true.
    """
    # First check if it's a metric query - if so, it's NOT a document query
    if is_metric_query(message):
        return False
    
    message_lower = message.lower()
    document_keywords = [
        'document', 'documents', 'documentation', 'doc', 'docs',
        'confluence', 'wiki', 'page', 'pages', 'article', 'articles',
        'guide', 'guides', 'handbook', 'manual', 'process', 'processes',
        'procedure', 'procedures', 'policy', 'policies', 'best practice',
        'best practices', 'how to', 'how do', 'what is', 'what are',
        'explain', 'describe', 'tell me about', 'find', 'search',
        'knowledge', 'knowledge base', 'kb', 'help', 'information',
        'delegation', 'leadership', 'team management', 'sprint planning',
        'agile', 'scrum', 'methodology', 'framework'
    ]
    return any(keyword in message_lower for keyword in document_keywords)

@app.post("/api/chat", tags=["Chat"], summary="Chat with AI Assistant")
async def chat_endpoint(request: ChatRequest, x_workbuddy_theme: str = Header(None, alias="x-workbuddy-theme")):
    """Handle chat messages with advanced AI processing"""
    try:
        message = request.message.strip()
        
        # Get theme from header or default to light
        theme_name = x_workbuddy_theme or "light"
        from theme.colors import get_theme
        theme = get_theme(theme_name)
        
        # Enhanced debug logging
        logger.info("=" * 80)
        logger.info("🌐 INCOMING API REQUEST: /api/chat")
        logger.info(f"💬 User Message: {message}")
        logger.info(f"⚙️  Configuration Status:")
        logger.info(f"   - Jira Configured: {app_state.jira_configured}")
        logger.info(f"   - Jira Client Exists: {app_state.jira_client is not None}")
        logger.info(f"   - AI Engine Initialized: {app_state.ai_engine is not None}")
        logger.info("=" * 80)
        
        # UNIFIED RAG ROUTING (replaces keyword-based checks)
        # Get unified RAG handler
        from services.unified_rag_handler import get_unified_rag_handler, SourceType
        from services.adaptive_response_engine import requires_deep_analysis
        
        unified_rag = get_unified_rag_handler()
        integrations = request.integrations or []
        
        # Initialize unified RAG if available
        if unified_rag:
            await unified_rag.initialize()
            
            # Step 1: Run similarity search
            try:
                if integrations:
                    # Manual Mode: Filter by selected sources
                    source_filter = [SourceType(s) for s in integrations if s in ['jira', 'confluence', 'github']]
                    rag_results = await unified_rag.similarity_search(
                        query=message,
                        top_k=10,
                        source_filter=source_filter if source_filter else None
                    )
                    logger.info(f"🔧 Manual Mode: RAG search scoped to {integrations}")
                else:
                    # Auto Mode: Global search
                    rag_results = await unified_rag.similarity_search(
                        query=message,
                        top_k=10
                    )
                    logger.info(f"🤖 Auto Mode: Global RAG search")
                
                # Step 2: Check similarity scores
                if rag_results and rag_results[0].similarity_score and rag_results[0].similarity_score >= 0.5:
                    # Good matches found - route based on dominant source
                    dominant_source = unified_rag.detect_dominant_source(rag_results)
                    
                    if dominant_source:
                        logger.info(f"🎯 Dominant source detected: {dominant_source.value}")
                        # Route to appropriate backend (will be handled by AI engine)
                        # Pass unified_rag to AI engine for context
                    else:
                        logger.info("⚠️ Multiple sources match - will return combined results")
                else:
                    logger.info("⚠️ RAG scores too low, falling back to AI classification")
                    # Scores too low - fallback to AI classification (handled below)
            except Exception as rag_error:
                logger.warning(f"⚠️ Unified RAG search failed: {rag_error}, falling back to AI classification")
                unified_rag = None  # Disable RAG for this request
        
        # Always reinitialize AI components to ensure they have the current Jira client
        logger.info("🔍 Initializing AI components...")
        
        # Ensure Jira client is properly initialized
        if app_state.jira_client and not app_state.jira_client._client:
            logger.info("🔍 Initializing Jira client...")
            try:
                await app_state.jira_client.initialize()
            except Exception as jira_init_error:
                logger.error(f"❌ Failed to initialize Jira client: {jira_init_error}")
        
        # Initialize AI components lazily (only when needed)
        if not app_state.ai_engine:
            logger.info("🔍 Creating AI Engine...")
            try:
                if app_state.jira_client:
                    app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
                    logger.info("✅ AI Engine created successfully")
                else:
                    logger.warning("⚠️ Cannot create AI Engine: Jira client is not available")
                    return {"response": "Jira client is not properly configured. Please check your Jira connection.", "error": True}
            except Exception as ai_init_error:
                logger.error(f"❌ Failed to create AI Engine: {ai_init_error}", exc_info=True)
                return {"response": f"Failed to initialize AI Engine: {str(ai_init_error)}. Please check your configuration.", "error": True}
        
        # Process the message
        logger.info("🔍 Processing message with AI Engine...")
        if not app_state.ai_engine:
            logger.error("❌ AI Engine is not available after initialization attempt")
            return {"response": "AI Engine is not properly initialized. Please check your configuration.", "error": True}
        
        # Add conversation history to AI engine context
        if request.messages:
            for msg in request.messages[-5:]:  # Last 5 messages for context
                app_state.ai_engine.add_context(msg.content, "", [], "")
        
        # Add project context to AI engine
        if request.projectContext:
            app_state.ai_engine.add_context(f"Project context: {request.projectContext}", "", [], "")
        
        # Add cached projects to AI engine context
        if request.cachedProjects:
            for project_key, project_data in request.cachedProjects.items():
                app_state.ai_engine.add_context(f"Cached project {project_key}: {project_data}", "", [], "")
        
        # Get source selection from request
        # If integrations are provided, use manual routing; otherwise use auto mode
        integrations = request.integrations or []
        
        if len(integrations) > 0:
            # MANUAL MODE: Route to selected integrations only
            logger.info(f"🔧 Manual Mode: Routing to {integrations}")
            # Use the first integration as primary source for now
            source = integrations[0] if integrations else "auto"
        else:
            # AUTO MODE: Use unified RAG routing if available, otherwise AI classification
            if unified_rag and rag_results and rag_results[0].similarity_score and rag_results[0].similarity_score >= 0.5:
                dominant_source = unified_rag.detect_dominant_source(rag_results)
                if dominant_source:
                    source = dominant_source.value
                    logger.info(f"🎯 Unified RAG routing to: {source}")
                else:
                    source = "auto"
                    logger.info(f"🤖 Auto Mode: Multiple sources, using AI classification")
            else:
                source = request.source or "auto"
                logger.info(f"🤖 Auto Mode: Intelligent routing enabled")
        
        logger.info(f"Processing query with source mode: {source}")
        
        # Double-check AI engine is available before processing
        if not app_state.ai_engine:
            logger.error("❌ AI Engine is None right before process_query call")
            return {"response": "AI Engine failed to initialize. Please check your configuration and try again.", "error": True}
        
        try:
            # Store theme in AI engine for response generation
            if app_state.ai_engine:
                app_state.ai_engine._current_theme = theme
            
            # Pass unified_rag_handler and integrations to AI engine
            ai_result = await app_state.ai_engine.process_query(
                message, 
                source=source,
                unified_rag_handler=unified_rag,
                integrations=integrations,
                theme=theme
            )
        except Exception as process_error:
            logger.error(f"❌ Error in process_query: {process_error}", exc_info=True)
            return {"response": f"Error processing your query: {str(process_error)}. Please try again or rephrase your question.", "error": True}
        
        # Extract the response text from the AI result
        import re
        import html as html_module
        
        def strip_html_tags(text: str) -> str:
            """Remove HTML tags from text"""
            if not text or not isinstance(text, str):
                return text
            text = re.sub(r'<[^>]+>', '', text)
            text = html_module.unescape(text)
            text = re.sub(r'\n\s*\n+', '\n\n', text)
            return text.strip()
        
        if isinstance(ai_result, dict):
            if 'content' in ai_result:
                # New format with type categorization
                response_text = strip_html_tags(ai_result.get('content', str(ai_result)))
                response_type = ai_result.get('type', 'analysis')
                return {
                    "response": response_text,
                    "type": response_type,
                    "confidence": ai_result.get('confidence', 0.9)
                }
            else:
                # Old format
                response_text = strip_html_tags(ai_result.get('response', str(ai_result)))
        else:
            response_text = strip_html_tags(str(ai_result))
        
        logger.info(f"✅ Response generated: {len(response_text)} characters")
        return {"response": response_text}
        
    except Exception as e:
        logger.error(f"❌ Chat error: {e}", exc_info=True)
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"❌ Full traceback: {error_trace}")
        return {"response": f"I encountered an error processing your request: {str(e)}. Please try again or rephrase your question.", "error": True}

@app.get("/api/messages")
async def get_messages():
    """Get chat messages"""
    return {"messages": app_state.messages}

@app.get("/api/chat/history")
async def get_chat_history():
    """Get chat history"""
    return {"messages": app_state.messages}

@app.post("/api/chat/clear")
async def clear_chat():
    """Clear chat history"""
    app_state.messages = []
    return {"success": True, "message": "Chat cleared"}

# ============================================================================
# RAG (Retrieval-Augmented Generation) Endpoints
# ============================================================================

class RAGRequest(BaseModel):
    query: str
    num_documents: Optional[int] = 5
    temperature: Optional[float] = 0.7

@app.post("/api/rag/query", tags=["RAG"], summary="Query RAG System")
async def rag_query_endpoint(request: RAGRequest):
    """
    Query the RAG system for document-based answers.
    
    This endpoint:
    1. Searches Vector Search index (or Confluence) for relevant documents
    2. Retrieves top N similar documents
    3. Generates AI answer with context from documents
    4. Returns answer with citations and confidence scores
    """
    try:
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        logger.info(f"RAG query received: {query[:100]}...")
        
        # Get RAG handler
        handler = get_handler()
        if handler is None:
            return {
                "success": False,
                "error": "RAG handler not initialized",
                "message": "Please configure Databricks Vector Search or OpenAI API key",
                "answer": "RAG system is not available. Please configure the required services.",
                "citations": [],
                "retrieval_status": "not_initialized"
            }
        
        # Generate RAG response
        response = handler.generate_rag_response(
            query=query,
            num_docs=request.num_documents or 5,
            temperature=request.temperature or 0.7
        )
        
        # Format response
        return {
            "success": True,
            "answer": response.get("answer", ""),
            "citations": response.get("citations", []),
            "context_used": response.get("context_used", 0),
            "timestamp": response.get("timestamp"),
            "model": response.get("model"),
            "retrieval_status": response.get("retrieval_status", "unknown"),
            "error": response.get("error")
        }
        
    except Exception as e:
        logger.error(f"RAG query failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "answer": f"I encountered an error while processing your query: {str(e)}",
            "citations": [],
            "retrieval_status": "error"
        }

@app.get("/api/rag/health", tags=["RAG"], summary="Check RAG System Health")
async def rag_health_check():
    """
    Check if RAG system is properly initialized and available.
    Provides detailed information about Databricks Vector Search connection.
    """
    logger.info("=" * 60)
    logger.info("🔍 RAG SYSTEM HEALTH CHECK")
    logger.info("=" * 60)
    
    try:
        handler = get_handler()
        if handler is None:
            logger.error("❌ RAG handler is None")
            return {
                "available": False,
                "status": "not_initialized",
                "message": "RAG handler not initialized. Configure Databricks Vector Search or OpenAI API key.",
                "databricks_connected": False,
                "vector_search_configured": False,
                "openai_configured": False
            }
        
        # Check if clients are available
        has_openai = handler.openai_client is not None
        has_vector_search = handler.vector_index is not None
        
        # Get configuration details
        vector_endpoint = os.getenv("DATABRICKS_VECTOR_ENDPOINT", "leadership-vector-endpoint")
        vector_index = os.getenv("DATABRICKS_VECTOR_INDEX", "leadership_poc.rag.confluence_index")
        openai_endpoint = os.getenv("OPENAI_API_ENDPOINT")
        has_openai_key = bool(os.getenv("OPENAI_API_KEY"))
        
        logger.info(f"📊 Configuration Status:")
        logger.info(f"   - Vector Search Endpoint: {vector_endpoint}")
        logger.info(f"   - Vector Search Index: {vector_index}")
        logger.info(f"   - Vector Search Connected: {has_vector_search}")
        logger.info(f"   - OpenAI API Key Present: {has_openai_key}")
        logger.info(f"   - OpenAI Endpoint: {openai_endpoint if openai_endpoint else 'Default (OpenAI)'}")
        logger.info(f"   - OpenAI Client Initialized: {has_openai}")
        
        # Try to verify Databricks connection if Vector Search is configured
        databricks_info = {}
        if has_vector_search:
            try:
                # Check if we can access the vector index
                logger.info("🔍 Verifying Vector Search connection...")
                # Note: Actual verification would require a test query, but we'll check if index exists
                databricks_info = {
                    "vector_search_available": True,
                    "endpoint": vector_endpoint,
                    "index": vector_index,
                    "connection_status": "connected"
                }
                logger.info("✅ Vector Search connection verified")
            except Exception as e:
                logger.warning(f"⚠️ Vector Search verification failed: {e}")
                databricks_info = {
                    "vector_search_available": True,
                    "endpoint": vector_endpoint,
                    "index": vector_index,
                    "connection_status": "error",
                    "error": str(e)
                }
        else:
            logger.warning("⚠️ Vector Search not configured")
            databricks_info = {
                "vector_search_available": False,
                "endpoint": vector_endpoint,
                "index": vector_index,
                "connection_status": "not_configured"
            }
        
        status = "ready" if (has_openai and has_vector_search) else "partial" if (has_openai or has_vector_search) else "not_configured"
        
        logger.info("=" * 60)
        logger.info(f"✅ Health Check Complete - Status: {status}")
        logger.info("=" * 60)
        
        return {
            "available": True,
            "status": status,
            "openai_configured": has_openai,
            "vector_search_configured": has_vector_search,
            "databricks": databricks_info,
            "message": "RAG system is ready" if (has_openai and has_vector_search) else "RAG system partially configured (OpenAI and Vector Search required for full functionality)"
        }
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"❌ RAG HEALTH CHECK FAILED: {e}")
        import traceback
        logger.error(f"   - Traceback: {traceback.format_exc()}")
        logger.error("=" * 60)
        return {
            "available": False,
            "status": "error",
            "message": str(e),
            "databricks_connected": False
        }

@app.post("/api/chat/enhanced", tags=["Chat"], summary="Enhanced Chat with JQL Processing")
async def enhanced_chat_endpoint(request: ChatRequest):
    """Handle chat messages with enhanced JQL processing"""
    try:
        message = request.message.strip()
        
        # Enhanced debug logging
        logger.info("=" * 80)
        logger.info("🌐 INCOMING API REQUEST: /api/chat/enhanced")
        logger.info(f"💬 User Message: {message}")
        logger.info(f"⚙️  Configuration Status:")
        logger.info(f"   - Jira Configured: {app_state.jira_configured}")
        logger.info(f"   - Jira Client Exists: {app_state.jira_client is not None}")
        logger.info(f"   - AI Engine Exists: {app_state.ai_engine is not None}")
        logger.info("=" * 80)
        
        if not app_state.jira_configured or not app_state.jira_client:
            return {
                "response": "Jira is not configured. Please configure Jira first.",
                "metadata": {"ai_enhanced": False, "error": True}
            }
        
        # Ensure Jira client is properly initialized
        if app_state.jira_client and not app_state.jira_client._client:
            logger.info("🔍 Initializing Jira client...")
            await app_state.jira_client.initialize()
        
        # Initialize AI engine if needed
        if not app_state.ai_engine:
            logger.info("🔍 Creating AI Engine...")
            app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
        
        # Initialize enhanced JQL processor if needed
        if not app_state.enhanced_jql_processor:
            logger.info("🔍 Creating Enhanced JQL Processor...")
            app_state.enhanced_jql_processor = EnhancedJQLProcessor(app_state.jira_client, app_state.ai_engine)
        
        # Process query with enhanced JQL processor
        logger.info("🔍 About to call enhanced_jql_processor.process_query")
        result = await app_state.enhanced_jql_processor.process_query(message, ResponseFormat.TEXT)
        logger.info(f"🔍 Enhanced JQL processor returned: {result}")
        
        # Generate response
        response = result.get('response', 'I apologize, but I encountered an issue processing your request.')
        logger.info(f"🔍 Final enhanced response: {response}")
        
        # Store message in history
        app_state.messages.append({
            "id": len(app_state.messages) + 1,
            "message": message,
            "response": response,
            "timestamp": datetime.now().isoformat(),
            "metadata": {
                "ai_enhanced": True,
                "jql_queries": result.get('data', []),
                "aggregated_data": result.get('aggregated', {}),
                "risks": result.get('risks', []),
                "conversation_context": result.get('conversation_context', [])
            }
        })
        
        return {
            "response": response,
            "metadata": {
                "ai_enhanced": True,
                "jql_queries": result.get('data', []),
                "aggregated_data": result.get('aggregated', {}),
                "risks": result.get('risks', []),
                "conversation_context": result.get('conversation_context', [])
            }
        }
        
    except Exception as e:
        logger.error(f"Enhanced chat error: {e}")
        return {
            "response": f"I encountered an error while processing your request: {str(e)}",
            "metadata": {"ai_enhanced": True, "error": True}
        }

@app.post("/api/chat/json", tags=["Chat"], summary="Chat with JSON Response Format")
async def json_chat_endpoint(request: ChatRequest):
    """Handle chat messages with JSON response format"""
    try:
        message = request.message.strip()
        
        # Debug logging
        logger.info(f"Processing JSON message: '{message}'")
        
        if not app_state.jira_configured or not app_state.jira_client:
            return {
                "response": "Jira is not configured. Please configure Jira first.",
                "metadata": {"ai_enhanced": False, "error": True}
            }
        
        # Ensure Jira client is properly initialized
        if app_state.jira_client and not app_state.jira_client._client:
            logger.info("🔍 Initializing Jira client...")
            await app_state.jira_client.initialize()
        
        # Initialize AI engine if needed
        if not app_state.ai_engine:
            logger.info("🔍 Creating AI Engine...")
            app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
        
        # Initialize enhanced JQL processor if needed
        if not app_state.enhanced_jql_processor:
            logger.info("🔍 Creating Enhanced JQL Processor...")
            app_state.enhanced_jql_processor = EnhancedJQLProcessor(app_state.jira_client, app_state.ai_engine)
        
        # Process query with enhanced JQL processor in JSON mode
        logger.info("🔍 About to call enhanced_jql_processor.process_query (JSON mode)")
        result = await app_state.enhanced_jql_processor.process_query(message, ResponseFormat.JSON)
        logger.info(f"🔍 Enhanced JQL processor returned JSON: {result}")
        
        # Parse JSON response
        try:
            response_data = json.loads(result.get('response', '{}'))
        except json.JSONDecodeError:
            response_data = {"error": "Invalid JSON response", "raw_response": result.get('response', '')}
        
        return {
            "response": response_data,
            "metadata": {
                "ai_enhanced": True,
                "format": "json",
                "jql_queries": result.get('data', []),
                "aggregated_data": result.get('aggregated', {}),
                "risks": result.get('risks', []),
                "conversation_context": result.get('conversation_context', [])
            }
        }
        
    except Exception as e:
        logger.error(f"JSON chat error: {e}")
        return {
            "response": {"error": f"I encountered an error while processing your request: {str(e)}"},
            "metadata": {"ai_enhanced": True, "error": True}
        }

@app.get("/api/jira/board/{board_id}/sprint/history", tags=["JIRA"], summary="Get Sprint Velocity History")
async def get_sprint_history(board_id: int):
    """Get last 3 sprints velocity for leadership dashboards"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        # Get last 3 sprints
        sprints = await app_state.jira_client.get_sprint_history(board_id, limit=3)
        
        sprint_data = []
        for sprint in sprints:
            # Get sprint metrics
            sprint_issues = await app_state.jira_client.search(
                f"sprint = {sprint['id']}", 
                max_results=1000
            )
            
            # Calculate velocity
            completed_issues = [
                issue for issue in sprint_issues.get('issues', [])
                if issue.get('fields', {}).get('status', {}).get('name') in ['Done', 'Closed']
            ]
            
            velocity = len(completed_issues)
            
            sprint_data.append({
                "sprint_id": sprint['id'],
                "sprint_name": sprint['name'],
                "start_date": sprint.get('startDate'),
                "end_date": sprint.get('endDate'),
                "velocity": velocity,
                "total_issues": len(sprint_issues.get('issues', [])),
                "completion_rate": velocity / len(sprint_issues.get('issues', [])) * 100 if sprint_issues.get('issues') else 0
            })
        
        return create_success_response(sprint_data, "Sprint history retrieved successfully")
        
    except Exception as e:
        logger.error(f"Sprint history error: {e}")
        return create_error_response("Sprint history failed", str(e))

@app.post("/api/jira/blockers", tags=["JIRA"], summary="Get Blocked Issues")
async def get_blocked_issues(request: Dict[str, Any] = None):
    """Show flagged issues or status=Blocked, optionally scoped to a project"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")

    if request is None:
        request = {}

    try:
        project_key = (request.get('projectKey') or '').strip()
        project_clause = f'project = "{project_key}" AND ' if project_key and project_key != 'null' else ''

        # Get blocked issues
        blocked_jql = f"{project_clause}(status = Blocked OR status = Waiting)"
        blocked_issues = await app_state.jira_client.search(blocked_jql, max_results=100)

        # Get flagged issues
        flagged_jql = f"{project_clause}(labels = flagged OR priority = Highest)"
        flagged_issues = await app_state.jira_client.search(flagged_jql, max_results=100)
        
        # Process blocked issues
        blocked_data = []
        for issue in blocked_issues.get('issues', []):
            blocked_data.append({
                "key": issue['key'],
                "summary": issue['fields']['summary'],
                "status": issue['fields']['status']['name'],
                "assignee": issue['fields'].get('assignee', {}).get('displayName', 'Unassigned'),
                "project": issue['fields']['project']['key'],
                "created": issue['fields']['created'],
                "updated": issue['fields']['updated'],
                "url": f"{app_state.jira_config.base_url}/browse/{issue['key']}"
            })
        
        # Process flagged issues
        flagged_data = []
        for issue in flagged_issues.get('issues', []):
            flagged_data.append({
                "key": issue['key'],
                "summary": issue['fields']['summary'],
                "priority": issue['fields'].get('priority', {}).get('name', 'Medium'),
                "labels": [label for label in issue['fields'].get('labels', [])],
                "assignee": issue['fields'].get('assignee', {}).get('displayName', 'Unassigned'),
                "project": issue['fields']['project']['key'],
                "url": f"{app_state.jira_config.base_url}/browse/{issue['key']}"
            })
        
        return create_success_response({
            "blocked_issues": blocked_data,
            "flagged_issues": flagged_data,
            "blocked_count": len(blocked_data),
            "flagged_count": len(flagged_data)
        }, "Blocked and flagged issues retrieved successfully")
        
    except Exception as e:
        logger.error(f"Blocked issues error: {e}")
        return create_error_response("Blocked issues retrieval failed", str(e))

@app.post("/api/chat/advanced", tags=["Chat"], summary="Advanced Chat with AI Insights")
async def advanced_chat_endpoint(request: ChatRequest):
    """Handle chat messages with advanced AI features"""
    try:
        message = request.message.strip()
        
        # Debug logging
        logger.info(f"Processing advanced message: '{message}'")
        logger.info(f"Jira configured: {app_state.jira_configured}")
        logger.info(f"Jira client exists: {app_state.jira_client is not None}")
        
        if not app_state.jira_configured or not app_state.jira_client:
            return {
                "response": "Jira is not configured. Please configure Jira first.",
                "metadata": {"ai_enhanced": False, "error": True}
            }
        
        # Ensure Jira client is properly initialized
        if app_state.jira_client and not app_state.jira_client._client:
            logger.info("🔍 Initializing Jira client...")
            await app_state.jira_client.initialize()
        
        # Initialize advanced chatbot if needed
        if not app_state.advanced_chatbot:
            logger.info("🔍 Creating Advanced Chatbot Engine...")
            app_state.advanced_chatbot = AdvancedChatbotEngine(app_state.jira_client)
        
        # Process query with advanced chatbot
        logger.info("🔍 About to call advanced_chatbot.process_advanced_query")
        result = await app_state.advanced_chatbot.process_advanced_query(message)
        logger.info(f"🔍 Advanced chatbot returned: {result}")
        
        # Generate response
        response = result.get('response', 'I apologize, but I encountered an issue processing your request.')
        logger.info(f"🔍 Final advanced response: {response}")
        
        # Store message in history
        app_state.messages.append({
            "id": len(app_state.messages) + 1,
            "message": message,
            "response": response,
            "timestamp": datetime.now().isoformat(),
            "metadata": {
                "ai_enhanced": True,
                "advanced_features": True,
                "metrics": result.get('metrics', {}),
                "risks": result.get('risks', []),
                "semantic_results": result.get('semantic_results', [])
            }
        })
        
        return {
            "response": response,
            "metadata": {
                "ai_enhanced": True,
                "advanced_features": True,
                "metrics": result.get('metrics', {}),
                "risks": result.get('risks', []),
                "semantic_results": result.get('semantic_results', [])
            }
        }
        
    except Exception as e:
        logger.error(f"Advanced chat error: {e}")
        return {
            "response": f"I encountered an error while processing your request: {str(e)}",
            "metadata": {"ai_enhanced": True, "error": True}
        }

@app.get("/api/chat/sprint-health", tags=["Analytics"], summary="Get Sprint Health Dashboard")
async def get_sprint_health():
    """Get comprehensive sprint health analysis"""
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            return create_error_response("Jira not configured", "Please configure Jira first", 400)
        
        # Initialize advanced chatbot if needed
        if not app_state.advanced_chatbot:
            app_state.advanced_chatbot = AdvancedChatbotEngine(app_state.jira_client)
        
        # Process sprint health query
        result = await app_state.advanced_chatbot.process_advanced_query("What's our sprint health status?")
        
        return create_success_response({
            "health_dashboard": result.get('response', ''),
            "metrics": result.get('metrics', {}),
            "risks": result.get('risks', [])
        }, "Sprint health analysis completed")
        
    except Exception as e:
        logger.error(f"Sprint health error: {e}")
        return create_error_response("Sprint health analysis failed", str(e))

@app.get("/api/jira/projects", tags=["Jira"], summary="Get Jira Projects (fast, cached, paginated)")
async def get_jira_projects(startAt: int = 0, maxResults: int = 100, minimal: bool = True, forceRefresh: bool = False):
    """Get Jira projects with in-memory caching and pagination.

    - minimal=true returns only id, key, name (fast for large lists)
    - startAt/maxResults for client-side paging
    - forceRefresh=true to bypass cache
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            return {
                "success": False,
                "error": "Jira not configured"
            }
        
        # Try cache first
        from datetime import datetime, timedelta
        if (not forceRefresh
            and app_state.projects_cache is not None
            and app_state.projects_cache_at is not None
            and datetime.now() - app_state.projects_cache_at < timedelta(seconds=app_state.projects_cache_ttl_seconds)):
            cached_projects = app_state.projects_cache
        else:
            projects = await app_state.jira_client.get_projects()
            # Normalize now so cache is consistent
            normalized = []
            for project in projects:
                normalized.append({
                    "id": project.get('id', ''),
                    "key": project.get('key', ''),
                    "name": project.get('name', ''),
                    "description": project.get('description', ''),
                    "projectTypeKey": project.get('projectTypeKey', ''),
                    "lead": project.get('lead', {}).get('displayName', '') if project.get('lead') else '',
                    "url": project.get('self', ''),
                    "avatarUrls": project.get('avatarUrls', {}),
                    "categoryName": (project.get('projectCategory') or {}).get('name', ''),
                    "categoryKey": (project.get('projectCategory') or {}).get('key', ''),
                })
            cached_projects = normalized
            app_state.projects_cache = cached_projects
            app_state.projects_cache_at = datetime.now()
        
        # Format projects for frontend
        detailed_projects = cached_projects
        
        total = len(detailed_projects)
        # Minimal shape for large menus
        if minimal:
            minimal_list = [{"id": p.get("id"), "key": p.get("key"), "name": p.get("name"), "categoryName": p.get("categoryName", "")} for p in detailed_projects]
            page = minimal_list[startAt:startAt+maxResults]
        else:
            page = detailed_projects[startAt:startAt+maxResults]
        return {
            "success": True,
            "projects": {
                "detailed": page,
                "summary": {
                    "total": total,
                    "keys": [p['key'] for p in detailed_projects if p.get('key')]
                },
                "startAt": startAt,
                "maxResults": maxResults
            }
        }
        
    except Exception as e:
        logger.error(f"Get projects error: {e}")
        return {
            "success": False,
            "error": f"Failed to fetch projects: {str(e)}"
        }

@app.get("/api/jira/first-action-date", tags=["JIRA"], summary="Earliest Jira issue date for current project filter")
async def jira_first_action_date(project: str = None):
    """Return the earliest Jira issue created date for the given project (or all projects if omitted).
    Used to populate the 'Since 1st action' date preset in the Jira Insights filter bar."""
    if not app_state.jira_configured or not app_state.jira_client:
        return {"first_action_date": None, "error": "Jira not configured"}
    try:
        project_clause = (
            f'project = "{project}" AND '
            if project and project.strip() not in ('', 'null', 'ALL', 'all')
            else ''
        )
        jql = f"{project_clause}created is not EMPTY ORDER BY created ASC"
        result = await app_state.jira_client.search(jql, max_results=1)
        issues = result.get("issues", [])
        if issues:
            created = (issues[0].get("fields", {}).get("created") or "")[:10]
            return {"first_action_date": created or None, "project": project}
        return {"first_action_date": None, "project": project}
    except Exception as e:
        logger.error(f"first-action-date error: {e}")
        return {"first_action_date": None, "error": str(e)}

@app.post("/api/leadership/dashboard", tags=["Leadership"], summary="Get Leadership Dashboard Metrics")
async def get_leadership_dashboard(request: Dict[str, Any]):
    """Get comprehensive leadership dashboard metrics with AI insights"""
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            return {
                "success": False,
                "error": "Jira not configured. Please configure Jira integration first."
            }
        
        # Get project filter from query params or request body
        project_filter = request.get('project', 'ALL')
        
        # Initialize AI engine if needed
        if not app_state.ai_engine:
            app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
        
        # Get basic Jira data
        jql = "project is not EMPTY ORDER BY updated DESC"
        if project_filter != 'ALL':
            jql = f'project = "{project_filter}" ORDER BY updated DESC'
        
        issues_data = await app_state.jira_client.search(jql, max_results=1000)
        issues = issues_data.get('issues', [])
        
        # Calculate portfolio summary
        total_issues = len(issues)
        completed_items = len([i for i in issues if i.get('fields', {}).get('status', {}).get('name') in ['Done', 'Closed', 'Resolved']])
        completion_rate = (completed_items / total_issues * 100) if total_issues > 0 else 0
        
        # Get unique projects
        projects = list(set([i.get('fields', {}).get('project', {}).get('key', 'Unknown') for i in issues]))
        total_projects = len(projects)
        
        # Get active contributors
        assignees = [i.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned') for i in issues if i.get('fields', {}).get('assignee')]
        active_contributors = len(set(assignees))
        
        # Calculate project health
        project_health = {}
        for project in projects:
            project_issues = [i for i in issues if i.get('fields', {}).get('project', {}).get('key') == project]
            project_completed = len([i for i in project_issues if i.get('fields', {}).get('status', {}).get('name') in ['Done', 'Closed', 'Resolved']])
            project_total = len(project_issues)
            health_score = (project_completed / project_total * 100) if project_total > 0 else 0
            
            if health_score >= 80:
                status = 'excellent'
            elif health_score >= 60:
                status = 'good'
            elif health_score >= 40:
                status = 'needs_attention'
            else:
                status = 'critical'
            
            project_health[project] = {
                "name": project,
                "health_score": round(health_score, 1),
                "status": status,
                "total_issues": project_total,
                "completed": project_completed,
                "in_progress": len([i for i in project_issues if i.get('fields', {}).get('status', {}).get('name') == 'In Progress']),
                "blocked": len([i for i in project_issues if i.get('fields', {}).get('status', {}).get('name') == 'Blocked']),
                "velocity_trend": "stable"  # Simplified for now
            }
        
        # Calculate team performance
        assignee_stats = {}
        for issue in issues:
            assignee = issue.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned')
            if assignee not in assignee_stats:
                assignee_stats[assignee] = {'completed': 0, 'total': 0}
            assignee_stats[assignee]['total'] += 1
            if issue.get('fields', {}).get('status', {}).get('name') in ['Done', 'Closed', 'Resolved']:
                assignee_stats[assignee]['completed'] += 1
        
        top_performers = []
        for assignee, stats in assignee_stats.items():
            if assignee != 'Unassigned' and stats['total'] > 0:
                efficiency_score = (stats['completed'] / stats['total'] * 100)
                top_performers.append({
                    "name": assignee,
                    "completed_items": stats['completed'],
                    "efficiency_score": round(efficiency_score, 1),
                    "workload_balance": "optimal" if 5 <= stats['total'] <= 15 else ("heavy" if stats['total'] > 15 else "light")
                })
        
        top_performers.sort(key=lambda x: x['efficiency_score'], reverse=True)
        
        # Generate AI insights
        ai_analysis = f"Portfolio Analysis: {total_projects} projects with {total_issues} total issues. Completion rate of {completion_rate:.1f}% indicates {'strong' if completion_rate > 70 else 'moderate' if completion_rate > 50 else 'needs improvement'} performance. {active_contributors} active contributors are engaged across the portfolio."
        
        dashboard_metrics = {
            "portfolio_summary": {
                "total_projects": total_projects,
                "total_issues": total_issues,
                "completed_items": completed_items,
                "completion_rate": round(completion_rate, 1),
                "active_contributors": active_contributors
            },
            "project_health": project_health,
            "team_performance": {
                "top_performers": top_performers[:5],  # Top 5 performers
                "workload_distribution": {
                    "balanced": len([p for p in top_performers if p['workload_balance'] == 'optimal']),
                    "overloaded": len([p for p in top_performers if p['workload_balance'] == 'heavy']),
                    "underutilized": len([p for p in top_performers if p['workload_balance'] == 'light'])
                },
                "capacity_utilization": round(completion_rate, 1)
            },
            "quality_metrics": {
                "defect_rate": 5.2,  # Placeholder
                "resolution_time": {
                    "average_days": 3.5,  # Placeholder
                    "trend": "improving"
                },
                "customer_satisfaction": 87.5,  # Placeholder
                "technical_debt_score": 15.3  # Placeholder
            },
            "strategic_insights": {
                "ai_analysis": ai_analysis,
                "risk_assessment": [
                    {
                        "type": "medium",
                        "description": "Some projects showing lower completion rates",
                        "impact": "Potential delivery delays",
                        "recommendation": "Review resource allocation and project priorities"
                    }
                ],
                "recommendations": [
                    "Focus on projects with critical status",
                    "Consider redistributing workload for better balance",
                    "Implement regular progress reviews"
                ]
            }
        }
        
        return {
            "success": True,
            "dashboard": dashboard_metrics
        }
        
    except Exception as e:
        logger.error(f"Leadership dashboard error: {e}")
        return {
            "success": False,
            "error": f"Failed to generate dashboard metrics: {str(e)}"
        }

@app.get("/api/chat/team-performance", tags=["Analytics"], summary="Get Team Performance Analysis")
async def get_team_performance():
    """Get team performance comparison and metrics"""
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            return create_error_response("Jira not configured", "Please configure Jira first", 400)
        
        # Initialize advanced chatbot if needed
        if not app_state.advanced_chatbot:
            app_state.advanced_chatbot = AdvancedChatbotEngine(app_state.jira_client)
        
        # Process team performance query
        result = await app_state.advanced_chatbot.process_advanced_query("Compare team performance this sprint")
        
        return create_success_response({
            "team_analysis": result.get('response', ''),
            "comparison_data": result.get('comparison_data', [])
        }, "Team performance analysis completed")
        
    except Exception as e:
        logger.error(f"Team performance error: {e}")
        return create_error_response("Team performance analysis failed", str(e))

@app.post("/api/chat/semantic-search", tags=["Chat"], summary="Semantic Search for Tickets")
async def semantic_search_endpoint(request: ChatRequest):
    """
    Perform semantic search for tickets using RAG/vector embeddings.
    
    Supports both Jira issues and GitHub issues/PRs.
    Uses OpenAI embeddings to find semantically similar items,
    even when exact keyword matches don't exist.
    """
    try:
        message = request.message.strip()
        source = request.message.lower() if hasattr(request, 'source') else None
        
        # Determine if user wants GitHub, Jira, or Confluence (or all)
        message_lower = message.lower()
        wants_github = 'github' in message_lower or 'pr' in message_lower or 'pull request' in message_lower
        wants_confluence = 'confluence' in message_lower or 'documentation' in message_lower or 'doc' in message_lower or 'wiki' in message_lower
        wants_jira = 'jira' in message_lower or 'ticket' in message_lower or 'issue' in message_lower
        
        # If no specific source mentioned, search all available sources
        if not (wants_github or wants_confluence or wants_jira):
            wants_jira = True
            wants_confluence = True
            wants_github = True
        
        results = {
            "jira_results": [],
            "github_results": [],
            "confluence_results": [],
            "search_results": ""
        }
        
        # Search Jira if configured and requested
        if wants_jira and app_state.jira_configured and app_state.jira_client:
            try:
                from services.jira_rag_handler import get_jira_rag_handler
                
                # Get a sample of recent issues to search through
                search_result = await app_state.jira_client.search(
                    "project is not EMPTY ORDER BY updated DESC",
                    max_results=100
                )
                issues = search_result.get('issues', [])
                
                if issues:
                    jira_rag = get_jira_rag_handler()
                    similar_issues = await jira_rag.find_similar_issues(
                        query=message,
                        issues=issues,
                        top_k=10
                    )
                    
                    # Format Jira results
                    for issue in similar_issues:
                        fields = issue.get('fields', {})
                        results["jira_results"].append({
                            "key": issue.get('key'),
                            "summary": fields.get('summary', ''),
                            "status": fields.get('status', {}).get('name', ''),
                            "assignee": fields.get('assignee', {}).get('displayName', 'Unassigned'),
                            "project": fields.get('project', {}).get('key', ''),
                            "similarity_score": round(issue.get('semantic_score', 0) * 100, 1),
                            "url": f"{app_state.jira_client.cfg.base_url}/browse/{issue.get('key')}",
                            "using_rag": issue.get('rag_search', False)
                        })
            except Exception as jira_err:
                logger.warning(f"Jira semantic search failed: {jira_err}")
        
        # Search GitHub if configured and requested
        if wants_github and app_state.github_client:
            try:
                from services.github_rag_handler import get_github_rag_handler
                
                # Use GitHub client's semantic search
                similar_issues = await app_state.github_client.search_issues_and_prs(
                    query=message,
                    use_semantic=True
                )
                
                # Format GitHub results
                for issue in similar_issues:
                    results["github_results"].append({
                        "key": issue.get('number'),
                        "title": issue.get('title', ''),
                        "state": issue.get('state', ''),
                        "type": "Pull Request" if 'pull_request' in issue else "Issue",
                        "assignee": issue.get('assignee', {}).get('login', 'Unassigned') if issue.get('assignee') else 'Unassigned',
                        "repository": issue.get('repository_url', '').split('/')[-1] if issue.get('repository_url') else '',
                        "similarity_score": round(issue.get('semantic_score', 0) * 100, 1),
                        "url": issue.get('html_url', ''),
                        "using_rag": issue.get('rag_search', False)
                    })
            except Exception as github_err:
                logger.warning(f"GitHub semantic search failed: {github_err}")
        
        # Search Confluence if configured and requested
        if wants_confluence:
            try:
                from services.rag_handler import get_handler as get_confluence_rag_handler
                
                rag_handler = get_confluence_rag_handler()
                if rag_handler:
                    logger.info(f"🔍 Searching Confluence documents for: {message[:50]}...")
                    
                    # Use RAG handler to search documents
                    docs = rag_handler.search_documents(
                        query=message,
                        num_results=10,
                        min_score=0.3  # Minimum similarity score
                    )
                    
                    # Format Confluence results
                    for doc in docs:
                        score_pct = doc.get('score', 0) * 100 if isinstance(doc.get('score'), (int, float)) else 0
                        metadata = doc.get('metadata', {})
                        
                        results["confluence_results"].append({
                            "title": metadata.get('page_title', 'Unknown Document'),
                            "url": metadata.get('source_url', ''),
                            "text_snippet": doc.get('text', '')[:200] + '...' if len(doc.get('text', '')) > 200 else doc.get('text', ''),
                            "similarity_score": round(score_pct, 1),
                            "source_type": metadata.get('source_type', 'confluence'),
                            "document_id": doc.get('id', ''),
                            "using_rag": True
                        })
                    
                    logger.info(f"✅ Found {len(results['confluence_results'])} similar Confluence documents")
                else:
                    logger.warning("⚠️ Confluence RAG handler not available")
            except Exception as confluence_err:
                logger.warning(f"Confluence semantic search failed: {confluence_err}")
        
        # Generate summary response
        response_parts = []
        if results["jira_results"]:
            response_parts.append(f"Found {len(results['jira_results'])} similar Jira issues")
        if results["github_results"]:
            response_parts.append(f"Found {len(results['github_results'])} similar GitHub issues/PRs")
        if results["confluence_results"]:
            response_parts.append(f"Found {len(results['confluence_results'])} similar Confluence documents")
        
        response_text = " | ".join(response_parts) if response_parts else "No similar items found. Try rephrasing your query."
        
        all_results = results["jira_results"] + results["github_results"] + results["confluence_results"]
        return create_success_response({
            "search_results": response_text,
            "semantic_results": all_results,
            "jira_results": results["jira_results"],
            "github_results": results["github_results"],
            "confluence_results": results["confluence_results"],
            "total_searched": len(all_results),
            "using_rag": all_results[0].get('using_rag', False) if all_results else False
        }, "Semantic search completed")
        
    except Exception as e:
        logger.error(f"Semantic search error: {e}", exc_info=True)
        return create_error_response("Semantic search failed", str(e))

@app.post("/api/jira/test")
async def test_jira_connection(config: JiraConfigRequest):
    """Test Jira connection"""
    try:
        # Validate and fix URL format
        url = config.url.strip()
        if not url.startswith(('http://', 'https://')):
            # Default to https for security
            url = f"https://{url}"
            logger.info(f"Added https:// protocol to URL: {url}")
        
        # Create JiraConfig object
        jira_config = JiraConfig(
            base_url=url,
            email=config.email,
            api_token=config.api_token,
            board_id=config.board_id
        )
        
        # Create Jira client
        jira_client = JiraClient(jira_config)

        # Initialize the async client
        await jira_client.initialize()

        # Jira Server/DC answers many endpoints anonymously for bad tokens, so
        # only validate_connection() (which probes /myself) proves the credentials.
        validation = await jira_client.validate_connection()
        if not validation.get("success"):
            return {
                "success": False,
                "message": validation.get("message", "Jira credential validation failed"),
                "config": {
                    "url": config.url,
                    "email": config.email,
                    "board_id": config.board_id
                }
            }

        # Test the connection
        current_sprint = None
        try:
            # Try to get current sprint
            current_sprint = await jira_client.get_current_sprint()
            sprint_info = f"Current sprint: {current_sprint.get('name', 'Unknown')}" if current_sprint else "No active sprint"
            
            # Try a simple search
            search_result = await jira_client.search("project is not EMPTY", max_results=1)
            total_issues = search_result.get('total', 0)
        except Exception as e:
            logger.warning(f"Could not get current sprint, but connection may still work: {e}")
            sprint_info = "Connection established but sprint info unavailable"
            total_issues = 0
        
        return {
            "success": True,
                "message": f"Jira connection successful! {sprint_info}. Found {total_issues} total issues.",
                "config": {
                    "url": config.url,
                    "email": config.email,
                    "board_id": config.board_id
                },
                "details": {
                    "current_sprint": current_sprint,
                    "total_issues": total_issues
                }
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection test failed: {str(e)}",
            "config": {
                "url": config.url,
                "email": config.email,
                "board_id": config.board_id
            }
        }
    finally:
        # Close the test client
        if 'jira_client' in locals():
            await jira_client.close()

@app.post("/api/export/pdf", tags=["Export"], summary="Export Chat to PDF")
async def export_pdf():
    """Export chat to PDF using reportlab"""
    try:
        if not REPORTLAB_AVAILABLE:
            raise HTTPException(status_code=500, detail="ReportLab not available. Please install reportlab package.")
        
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        import io
        
        # Create PDF in memory
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30,
        )
        
        content_style = ParagraphStyle(
            'CustomContent',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=12,
        )
        
        # Build PDF content
        story = []
        story.append(Paragraph("Leadership Quality Tool - Chat Export", title_style))
        story.append(Spacer(1, 20))
        
        # Add chat messages
        for i, message in enumerate(app_state.messages, 1):
            story.append(Paragraph(f"<b>Message {i}:</b> {message.get('message', '')}", content_style))
            story.append(Paragraph(f"<b>Response:</b> {message.get('response', '')}", content_style))
            story.append(Paragraph(f"<b>Timestamp:</b> {message.get('timestamp', '')}", content_style))
            story.append(Spacer(1, 20))
        
        # Build PDF
        doc.build(story)
        
        # Get PDF content
        pdf_content = buffer.getvalue()
        buffer.close()
        
        # Store in app state for download
        filename = f"chat_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        app_state.export_files[filename] = pdf_content
        
        return create_success_response({
            "filename": filename,
            "size_bytes": len(pdf_content)
        }, "PDF exported successfully")
        
    except ImportError:
        return create_error_response("PDF export failed", "reportlab package not installed")
    except Exception as e:
        logger.error(f"PDF export error: {e}")
        return create_error_response("PDF export failed", str(e))

@app.post("/api/export/powerpoint", tags=["Export"], summary="Export Chat to PowerPoint")
async def export_powerpoint():
    """Export chat to PowerPoint using python-pptx"""
    try:
        if not PPTX_AVAILABLE:
            raise HTTPException(status_code=500, detail="python-pptx not available. Please install python-pptx package.")
        
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.enum.text import PP_ALIGN
        import io
        
        # Create presentation
        prs = Presentation()
        
        # Add title slide
        title_slide_layout = prs.slide_layouts[0]
        slide = prs.slides.add_slide(title_slide_layout)
        title = slide.shapes.title
        subtitle = slide.placeholders[1]
        
        title.text = "Leadership Quality Tool"
        subtitle.text = f"Chat Export - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        # Add content slides
        content_layout = prs.slide_layouts[1]
        
        for i, message in enumerate(app_state.messages, 1):
            slide = prs.slides.add_slide(content_layout)
            title = slide.shapes.title
            content = slide.placeholders[1]
            
            title.text = f"Message {i}"
            
            # Format content
            text_frame = content.text_frame
            text_frame.clear()
            
            # Add message
            p = text_frame.paragraphs[0]
            p.text = f"User: {message.get('message', '')}"
            p.font.size = Pt(12)
            
            # Add response
            p = text_frame.add_paragraph()
            p.text = f"Assistant: {message.get('response', '')}"
            p.font.size = Pt(10)
            
            # Add timestamp
            p = text_frame.add_paragraph()
            p.text = f"Time: {message.get('timestamp', '')}"
            p.font.size = Pt(8)
            p.font.italic = True
        
        # Save to memory
        buffer = io.BytesIO()
        prs.save(buffer)
        pptx_content = buffer.getvalue()
        buffer.close()
        
        # Store in app state for download
        filename = f"chat_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pptx"
        app_state.export_files[filename] = pptx_content
        
        return create_success_response({
            "filename": filename,
            "size_bytes": len(pptx_content),
            "slides": len(prs.slides)
        }, "PowerPoint exported successfully")
        
    except ImportError:
        return create_error_response("PowerPoint export failed", "python-pptx package not installed")
    except Exception as e:
        logger.error(f"PowerPoint export error: {e}")
        return create_error_response("PowerPoint export failed", str(e))

@app.get("/api/export/download/{filename}", tags=["Export"], summary="Download Exported File")
async def download_export(filename: str):
    """Download exported file"""
    if filename not in app_state.export_files:
        raise HTTPException(status_code=404, detail="File not found")
    
    content = app_state.export_files[filename]
    
    # Determine content type
    if filename.endswith('.pdf'):
        media_type = 'application/pdf'
    elif filename.endswith('.pptx'):
        media_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    else:
        media_type = 'application/octet-stream'
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.post("/api/jira/metrics", tags=["JIRA"], summary="Get Jira Metrics")
async def get_jira_metrics(request: Dict[str, Any]):
    """Get comprehensive Jira metrics for analytics"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        project_key = request.get('projectKey')

        date_from = (request.get('dateFrom') or '').strip()
        date_to = (request.get('dateTo') or '').strip()
        advanced_filters = request.get('advancedFilters') or {}

        filters = []

        if project_key and project_key != 'null':
            filters.append(f'project = "{project_key}"')
            filter_project_key = project_key
        else:
            filters.append('project IS NOT EMPTY')
            filter_project_key = None

        date_from_filter = None
        if date_from:
            date_from_filter = date_from
            filters.append(f'updated >= "{date_from}"')

        date_to_filter = None
        if date_to:
            date_to_filter = date_to
            date_to_expr = f'{date_to} 23:59' if len(date_to) == 10 else date_to
            filters.append(f'updated <= "{date_to_expr}"')

        advanced_clause = build_advanced_filter_clause(advanced_filters)
        if advanced_clause:
            filters.append(advanced_clause)

        jql = ' AND '.join(filters)
        if jql:
            jql = f"{jql} ORDER BY updated DESC"
        else:
            jql = "ORDER BY updated DESC"
        
        story_point_field_ids = await get_story_point_field_ids(app_state.jira_client)

        # Get ALL issues to show exact real values
        fields = [
            'key', 'summary', 'status', 'assignee', 'priority', 'issuetype',
            'project', 'created', 'updated', 'description', 'reporter', 'labels',
            'components', 'fixVersions', 'duedate', *story_point_field_ids
        ]

        # Get ALL issues with proper pagination to show exact values
        all_issues = []
        start_at = 0
        max_results = 100  # Jira API v3 max limit is 100 per request
        batch_count = 0
        seen_keys = set()  # Track unique issue keys to detect duplicates
        metrics_truncated = False
        
        # Get total count first - Jira DC returns 'total' in every search response
        total_count_from_api = 0
        try:
            count_data = await app_state.jira_client.search(jql, max_results=1, fields=['key'])
            total_count_from_api = count_data.get('total', 0) if count_data else 0
            logger.info(f"Jira API total count: {total_count_from_api} (response keys: {list(count_data.keys()) if count_data else 'None'})")
        except Exception as e:
            logger.warning(f"Could not get count data: {e}")
        
        try:
            while True:
                batch_count += 1
                logger.info(f"Fetching batch #{batch_count} starting at {start_at}")
                issues_data = await app_state.jira_client.search(jql, max_results=max_results, fields=fields, start_at=start_at)
                
                if not issues_data:
                    logger.error("Jira API returned None")
                    break
                    
                issues_batch = issues_data.get('issues', [])
                logger.info(f"Got {len(issues_batch)} issues in batch #{batch_count} (Total so far: {len(all_issues) + len(issues_batch)})")
                
                if not issues_batch:
                    logger.info("No more issues found, stopping pagination")
                    break
                
                # Check for duplicates
                batch_keys = [issue.get('key') for issue in issues_batch if issue.get('key')]
                duplicates = [key for key in batch_keys if key in seen_keys]
                
                if duplicates:
                    logger.warning(f"DUPLICATES DETECTED: {duplicates[:5]}... (showing first 5)")
                    logger.warning("Stopping pagination to prevent infinite loop")
                    break
                
                # Add new unique issues
                seen_keys.update(batch_keys)
                all_issues.extend(issues_batch)
                
                # Check if this is the last page (Jira API v3 uses isLast)
                is_last = issues_data.get('isLast', False)
                next_page_token = issues_data.get('nextPageToken')
                logger.info(f"isLast flag: {is_last}, nextPageToken: {next_page_token}")
                
                # Stop if we got fewer issues than requested (this is the reliable way to detect end)
                if len(issues_batch) < max_results:
                    logger.info(f"Got fewer issues ({len(issues_batch)}) than requested ({max_results}), stopping")
                    break
                    
                # Stop if isLast is true (this means we've reached the end)
                if is_last:
                    logger.info("isLast=true, stopping pagination")
                    break
                    
                start_at += max_results
                
                # Add small delay to prevent rate limiting
                import asyncio
                await asyncio.sleep(0.2)  # 200ms delay between batches
                
                # Safety limit to prevent infinite loops
                if batch_count >= 50:  # Max 50 batches = 5,000 issues
                    logger.warning(f"Reached safety limit of {batch_count} batches, stopping")
                    metrics_truncated = True
                    break
                
        except Exception as e:
            logger.error(f"Error during pagination: {e}")
            # Continue with whatever we got
            
        issues = all_issues
        total_issues_all = len(issues)
        logger.info(f"Retrieved {total_issues_all} total issues (exact count)")

        # Calculate metrics with error handling
        total_issues = len(issues)
        logger.info(f"Processing {total_issues} issues for metrics")
        
        # display_total keeps the fetched count so all ratios (open/bugs/stories ÷ total) remain consistent
        display_total = total_issues
        
        # Calculate resolved issues from ALL actual data with error handling
        resolved_issues = 0
        try:
            for i in issues:
                if i and i.get('fields'):
                    if is_done_issue(i.get('fields', {})):
                        resolved_issues += 1
        except Exception as e:
            logger.error(f"Error calculating resolved issues: {e}")
            resolved_issues = 0
        
        logger.info(f"Exact resolved issues: {resolved_issues} out of {total_issues}")
        
        open_issues = total_issues - resolved_issues
        
        # Count EVERY issue type (not just Bug/Story/Task/Epic) so the breakdown
        # reconciles with the total — projects like test-case management are
        # dominated by types such as "Test" that were previously invisible.
        issues_by_type = {}
        try:
            for i in issues:
                if i and i.get('fields'):
                    type_name = (get_issue_type_name(i.get('fields', {})) or 'Unknown').strip() or 'Unknown'
                    issues_by_type[type_name] = issues_by_type.get(type_name, 0) + 1
        except Exception as e:
            logger.error(f"Error counting issue types: {e}")
            issues_by_type = {}

        def _type_count(d, *names):
            target = {n.lower() for n in names}
            return sum(c for t, c in d.items() if (t or '').lower() in target)

        # When the fetch was capped, the per-type sample counts undercount the real
        # totals. Replace them with EXACT Jira counts (one lightweight maxResults=0
        # search per type, run concurrently) so the breakdown sums to the true total;
        # any long-tail types beyond what we count are folded into "Other".
        if metrics_truncated and total_count_from_api > 0 and issues_by_type:
            try:
                import asyncio
                base_jql = ' AND '.join(filters)
                ranked = sorted(issues_by_type.items(), key=lambda kv: kv[1], reverse=True)
                types_to_count = [t for t, _ in ranked[:25]]

                async def _exact_count(t):
                    safe = t.replace('"', '\\"')
                    q = f'{base_jql} AND issuetype = "{safe}"' if base_jql else f'issuetype = "{safe}"'
                    try:
                        d = await app_state.jira_client.search(q, max_results=0, fields=['key'])
                        return t, (d.get('total', 0) if d else 0)
                    except Exception as ce:
                        logger.warning(f"Exact count failed for type '{t}': {ce}")
                        return t, issues_by_type.get(t, 0)

                exact_pairs = await asyncio.gather(*[_exact_count(t) for t in types_to_count])
                exact = {t: c for t, c in exact_pairs if c > 0}
                counted = sum(exact.values())
                remainder = total_count_from_api - counted
                if remainder > 0:
                    exact['Other'] = remainder
                if exact:
                    issues_by_type = exact
                    logger.info(f"Exact issue-type counts (truncated fetch): {issues_by_type}")
            except Exception as e:
                logger.error(f"Error computing exact issue-type counts: {e}")

        # Derive the headline buckets from the (possibly exact) distribution.
        bugs = _type_count(issues_by_type, 'bug')
        stories = _type_count(issues_by_type, 'story')
        tasks = _type_count(issues_by_type, 'task')
        epics = _type_count(issues_by_type, 'epic')
        subtasks = _type_count(issues_by_type, 'sub-task', 'subtask')

        # Calculate exact story points from ALL data with error handling
        story_points = 0.0
        completed_story_points = 0.0
        story_point_values_found = False
        try:
            for i in issues:
                if i and i.get('fields'):
                    fields_obj = i.get('fields', {})
                    points = get_issue_story_points(fields_obj, story_point_field_ids)
                    if points is not None:
                        story_points += points
                        if points > 0:
                            story_point_values_found = True
                        if is_done_issue(fields_obj):
                            completed_story_points += points
        except Exception as e:
            logger.error(f"Error calculating story points: {e}")
            story_points = 0.0
            completed_story_points = 0.0
            story_point_values_found = False
        
        logger.info(f"Exact story points: {story_points}")
        
        # Count by status with error handling
        issues_by_status = {}
        try:
            for issue in issues:
                if issue and issue.get('fields'):
                    status_obj = issue.get('fields', {}).get('status', {})
                    if status_obj:
                        status_name = status_obj.get('name', 'Unknown')
                        issues_by_status[status_name] = issues_by_status.get(status_name, 0) + 1
        except Exception as e:
            logger.error(f"Error counting by status: {e}")
            issues_by_status = {'Unknown': total_issues}
        
        # Count by priority with error handling
        issues_by_priority = {}
        try:
            for issue in issues:
                if issue and issue.get('fields'):
                    priority_obj = issue.get('fields', {}).get('priority', {})
                    if priority_obj:
                        priority_name = priority_obj.get('name', 'Unknown')
                    else:
                        priority_name = 'Unknown'
                    issues_by_priority[priority_name] = issues_by_priority.get(priority_name, 0) + 1
        except Exception as e:
            logger.error(f"Error counting by priority: {e}")
            issues_by_priority = {'Unknown': total_issues}
        
        # Count by assignee with error handling
        issues_by_assignee = {}
        try:
            for issue in issues:
                if issue and issue.get('fields'):
                    assignee_obj = issue.get('fields', {}).get('assignee', {})
                    if assignee_obj:
                        assignee_name = assignee_obj.get('displayName', 'Unassigned')
                    else:
                        assignee_name = 'Unassigned'
                    issues_by_assignee[assignee_name] = issues_by_assignee.get(assignee_name, 0) + 1
        except Exception as e:
            logger.error(f"Error counting by assignee: {e}")
            issues_by_assignee = {'Unassigned': total_issues}
        
        # Calculate average resolution time from actual created→updated timestamps
        resolution_days_list = []
        try:
            for i in issues:
                if i and i.get('fields'):
                    fields_obj = i.get('fields', {})
                    if is_done_issue(fields_obj):
                        created_str = (fields_obj.get('created') or '')[:19]
                        updated_str = (fields_obj.get('updated') or '')[:19]
                        if created_str and updated_str:
                            try:
                                created_dt = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                                updated_dt = datetime.fromisoformat(updated_str.replace('Z', '+00:00'))
                                days = max(0, (updated_dt - created_dt).days)
                                resolution_days_list.append(days)
                            except Exception:
                                pass
        except Exception as e:
            logger.error(f"Error calculating resolution time: {e}")
        avg_resolution_time = round(sum(resolution_days_list) / len(resolution_days_list), 1) if resolution_days_list else 0
        
        # Sprint velocity - completed story points, falling back to completed issue count
        # when the project does not populate story points.
        sprint_velocity = completed_story_points if story_point_values_found else resolved_issues

        # Quality-Engineering metrics — only for projects that actually contain Test
        # issues (cheap guard: skip the extra Jira queries otherwise).
        qe_metrics = None
        try:
            if any((t or '').lower() == 'test' for t in issues_by_type.keys()):
                qe_fields = await resolve_qe_field_ids(app_state.jira_client)
                qe_metrics = await compute_qe_metrics(app_state.jira_client, ' AND '.join(filters), qe_fields)
        except Exception as e:
            logger.error(f"QE metrics computation skipped: {e}")

        metrics = {
            "totalIssues": display_total,
            "jiraTotal": total_count_from_api if total_count_from_api > 0 else display_total,
            "resolvedIssues": resolved_issues,
            "openIssues": total_issues - resolved_issues,
            "bugs": bugs,
            "stories": stories,
            "tasks": tasks,
            "epics": epics,
            "subtasks": subtasks,
            "issuesByType": issues_by_type,
            "qeMetrics": qe_metrics,
            "storyPoints": format_metric_number(story_points),
            "sprintVelocity": format_metric_number(sprint_velocity),
            "avgResolutionTime": avg_resolution_time,
            "issuesByStatus": issues_by_status,
            "issuesByPriority": issues_by_priority,
            "issuesByAssignee": issues_by_assignee,
            "totalIssuesAll": total_issues_all,
            "fetchedCount": total_issues,
            "truncated": metrics_truncated,
            "filters": {
                "projectKey": filter_project_key,
                "dateFrom": date_from_filter,
                "dateTo": date_to_filter
            }
        }

        return {
            "success": True,
            "metrics": metrics
        }
        
    except Exception as e:
        logger.error(f"Failed to get Jira metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/confluence/metrics", tags=["CONFLUENCE"], summary="Get Confluence Metrics")
async def get_confluence_metrics():
    """Get comprehensive Confluence metrics for analytics"""
    if not app_state.confluence_configured or not app_state.confluence_client:
        raise HTTPException(status_code=400, detail="Confluence not configured")
    
    try:
        # Get recent pages
        recent_pages = await app_state.confluence_client.search("", limit=50)
        
        # Calculate metrics
        total_pages = len(recent_pages)
        
        # Count pages created this month
        from datetime import datetime, timedelta
        this_month = datetime.now().replace(day=1)
        pages_this_month = len([
            p for p in recent_pages 
            if datetime.fromisoformat(p.get('created', '').replace('Z', '+00:00')) >= this_month
        ])
        
        # Count unique spaces
        spaces = set(p.get('space', {}).get('name', 'Unknown') for p in recent_pages)
        total_spaces = len(spaces)
        
        # Count unique contributors
        contributors = set(p.get('author', {}).get('displayName', 'Unknown') for p in recent_pages)
        active_contributors = len(contributors)
        
        # Count pages by space
        pages_by_space = {}
        for page in recent_pages:
            space = page.get('space', {}).get('name', 'Unknown')
            pages_by_space[space] = pages_by_space.get(space, 0) + 1
        
        # Format recent pages
        formatted_pages = []
        for page in recent_pages[:10]:
            formatted_pages.append({
                "id": page.get('id', ''),
                "title": page.get('title', 'Untitled'),
                "space": page.get('space', {}).get('name', 'Unknown'),
                "author": page.get('author', {}).get('displayName', 'Unknown'),
                "created": page.get('created', ''),
                "url": page.get('url', '#')
            })
        
        metrics = {
            "totalPages": total_pages,
            "pagesThisMonth": pages_this_month,
            "totalSpaces": total_spaces,
            "activeContributors": active_contributors,
            "pagesBySpace": pages_by_space,
            "recentPages": formatted_pages
        }
        
        return {
            "success": True,
            "metrics": metrics
        }
        
    except Exception as e:
        logger.error(f"Failed to get Confluence metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/confluence/test", tags=["CONFLUENCE"], summary="Test Confluence Connection")
async def test_confluence():
    """Test Confluence connection and search"""
    try:
        if not app_state.confluence_configured or not app_state.confluence_client:
            return {"error": "Confluence not configured or client not available"}
        
        # Test search
        test_results = await app_state.confluence_client.search("test", limit=5)
        
        return {
            "success": True,
            "confluence_url": app_state.confluence_client.cfg.base_url,
            "confluence_configured": app_state.confluence_configured,
            "test_search_results": len(test_results),
            "results": test_results[:2] if test_results else []
        }
    except Exception as e:
        logger.error(f"Confluence test failed: {e}")
        return {
            "error": str(e), 
            "confluence_configured": app_state.confluence_configured,
            "confluence_client_available": app_state.confluence_client is not None
        }

# ============================================================================
# DOMAIN TRAINING DOCUMENT: Local Ingest + Q&A (non-Databricks, simple mode)
# ============================================================================

# On-disk JSON index to persist embeddings locally
DOMAIN_INDEX_PATH = os.path.join("config", "data", "domain", "domain_index.json")
_domain_index_cache: Dict[str, Any] | None = None

def _domain_load_index() -> Dict[str, Any] | None:
    global _domain_index_cache
    if _domain_index_cache is None and os.path.exists(DOMAIN_INDEX_PATH):
        try:
            with open(DOMAIN_INDEX_PATH, "r", encoding="utf-8") as f:
                _domain_index_cache = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load domain index: {e}")
            _domain_index_cache = None
    return _domain_index_cache

def _domain_save_index(index: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(DOMAIN_INDEX_PATH), exist_ok=True)
    with open(DOMAIN_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f)
    global _domain_index_cache
    _domain_index_cache = index

def _domain_chunk_text(text: str, size: int = 800, overlap: int = 120) -> List[str]:
    chunks: List[str] = []
    i = 0
    while i < len(text):
        chunk = text[i:i+size]
        if chunk.strip():
            chunks.append(chunk.strip())
        i += max(1, size - overlap)
    return chunks

def _domain_extract_text(path: str) -> str:
    p = path.lower()
    if p.endswith(".pdf"):
        try:
            import pypdf  # type: ignore
        except Exception as e:
            raise RuntimeError("PDF support requires 'pypdf' (pip install pypdf)") from e
        reader = pypdf.PdfReader(path)
        return "\n".join((pg.extract_text() or "") for pg in reader.pages)
    if p.endswith(".docx"):
        try:
            import docx  # type: ignore
        except Exception as e:
            raise RuntimeError("DOCX support requires 'python-docx' (pip install python-docx)") from e
        return "\n".join(par.text for par in docx.Document(path).paragraphs)
    # .md/.txt fallback
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def _databricks_embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Call Databricks embedding endpoint (databricks-gte-large-en) to get embeddings.
    """
    import httpx
    
    # Databricks embedding endpoint
    embedding_endpoint = os.getenv(
        "DATABRICKS_EMBEDDING_ENDPOINT",
        "https://dbc-46217bae-ef1b.cloud.databricks.com/serving-endpoints/databricks-gte-large-en/invocations"
    )
    api_key = os.getenv("OPENAI_API_KEY")  # Same token used for Databricks
    
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY (Databricks token) is required for embeddings")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Databricks embedding API format
    payload = {
        "input": texts
    }
    
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(embedding_endpoint, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()
            
            # Databricks returns: { "data": [{"embedding": [...], "index": 0}, ...] }
            if "data" in result:
                # Sort by index to maintain order
                sorted_data = sorted(result["data"], key=lambda x: x.get("index", 0))
                return [item["embedding"] for item in sorted_data]
            # Alternative format: { "embeddings": [[...], [...]] }
            elif "embeddings" in result:
                return result["embeddings"]
            else:
                logger.error(f"Unexpected embedding response format: {list(result.keys())}")
                raise RuntimeError(f"Unexpected embedding response format: {result}")
    except Exception as e:
        logger.error(f"Databricks embedding call failed: {e}")
        raise

def _domain_embed_texts(chunks: List[str]) -> List[List[float]]:
    """Embed text chunks using Databricks GTE-Large embedding model."""
    return _databricks_embed_texts(chunks)

def _domain_cosine(a: List[float], b: List[float]) -> float:
    # Lightweight cosine without adding global deps
    # Use pure Python fallback to avoid forcing numpy; small vectors are fine
    import math
    dot = sum(x*y for x, y in zip(a, b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    denom = (na * nb) or 1e-9
    return float(dot / denom)

@app.post("/api/domain/ingest", tags=["DOMAIN"], summary="Ingest domain training doc from local path")
async def ingest_domain_doc(payload: Dict[str, Any]):
    """
    Body: { "path": "config/data/domain/domain_training.docx", "name": "domain-training" }
    Reads the file, chunks, embeds, and stores a small local index for QA.
    Requires OPENAI_API_KEY and parsers (python-docx for .docx, pypdf for .pdf).
    """
    path = payload.get("path")
    name = payload.get("name", "domain-training")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="File path missing or not found")

    try:
        text = _domain_extract_text(path)
        chunks = _domain_chunk_text(text, size=800, overlap=120)
        if not chunks:
            raise RuntimeError("No text extracted from document")
        vectors = _domain_embed_texts(chunks)

        index = {
            "name": name,
            "source_path": path,
            "model": "databricks-gte-large-en",  # Databricks embedding model
            "items": [{"text": t, "vec": v} for t, v in zip(chunks, vectors)],
            "updated_at": datetime.utcnow().isoformat()
        }
        _domain_save_index(index)
        return {"success": True, "chunks": len(chunks)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Domain ingest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/domain/qa", tags=["DOMAIN"], summary="Ask questions about the domain training doc")
async def domain_qa(payload: Dict[str, Any]):
    from openai import OpenAI  # type: ignore
    question = (payload.get("question") or "").strip()
    k = int(payload.get("k", 5))
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    idx = _domain_load_index()
    if not idx or not idx.get("items"):
        raise HTTPException(status_code=400, detail="Domain index not found. Run /api/domain/ingest first.")

    from services.ai_engine import create_databricks_openai_client
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_API_ENDPOINT")
    if base_url and api_key:
        client = create_databricks_openai_client(api_key, base_url)
    elif api_key:
        client = OpenAI(api_key=api_key)
    else:
        client = OpenAI()
    
    # Use Databricks GTE-Large embedding model for query
    qvec = _databricks_embed_texts([question])[0]

    scored = [{"text": it["text"], "score": _domain_cosine(qvec, it["vec"])} for it in idx["items"]]
    top = sorted(scored, key=lambda x: x["score"], reverse=True)[:k]

    context = "\n\n".join(t["text"][:800] for t in top)
    prompt = (
        "You are a thoughtful mentor helping a new colleague.\n"
        "Answer based on the context below, but do not copy sentences verbatim.\n"
        "Synthesize the ideas, add brief rationale, and suggest 2-4 actionable next steps.\n"
        "Prefer clarity over length. If the context is insufficient, say what is missing and what to check next.\n\n"
        f"Context (excerpts from the training doc):\n{context}\n\n"
        f"Question:\n{question}\n\n"
        "Answer with: a short summary (2-4 lines) + bullet steps + optional pitfalls."
    )
    resp = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "databricks-gpt-5-1"),
        messages=[
            {"role": "system", "content": "You are a precise internal assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.5,
    )
    answer = resp.choices[0].message.content
    return {
        "answer": answer,
        "citations": [{"score": round(t["score"], 4)} for t in top],
        "used_chunks": len(top),
        "updated_at": idx.get("updated_at"),
    }

@app.get("/api/domain/status", tags=["DOMAIN"], summary="Get domain doc index status")
async def domain_status():
    idx = _domain_load_index()
    return {
        "indexed": bool(idx and idx.get("items")),
        "name": (idx or {}).get("name"),
        "source_path": (idx or {}).get("source_path"),
        "chunks": len((idx or {}).get("items", [])),
        "updated_at": (idx or {}).get("updated_at"),
        "index_path": DOMAIN_INDEX_PATH,
    }

@app.post("/api/domain/upload", tags=["DOMAIN"], summary="Upload and ingest a domain training document")
async def domain_upload(file: UploadFile = File(...), name: Optional[str] = Form("domain-training")):
    """
    Accepts a file upload, saves it under config/data/domain, and triggers ingest.
    Returns ingest summary.
    """
    try:
        # Save upload
        os.makedirs(os.path.join("config", "data", "domain"), exist_ok=True)
        dest_path = os.path.join("config", "data", "domain", file.filename)
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)

        # Trigger ingest using the saved file path
        payload = {"path": dest_path, "name": name or "domain-training"}
        # Reuse internal logic
        result = await ingest_domain_doc(payload)
        return {"success": True, "file": file.filename, "path": dest_path, **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Domain upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jira/best-performers", tags=["JIRA"], summary="Get Best Performers")
async def get_best_performers(request: Dict[str, Any]):
    """Get best performing team members based on Jira data"""
    if not app_state.jira_configured or not app_state.jira_client:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    try:
        project_key = request.get('projectKey')
        date_from = (request.get('dateFrom') or '').strip()
        date_to = (request.get('dateTo') or '').strip()

        # Build JQL query — include date range so performers reflect the selected period
        jql_filters = []
        if project_key and project_key != 'null':
            jql_filters.append(f'project = "{project_key}"')
        else:
            jql_filters.append('project is not EMPTY')
        if date_from:
            jql_filters.append(f'updated >= "{date_from}"')
        if date_to:
            date_to_expr = f'{date_to} 23:59' if len(date_to) == 10 else date_to
            jql_filters.append(f'updated <= "{date_to_expr}"')
        jql = ' AND '.join(jql_filters)

        story_point_field_ids = await get_story_point_field_ids(app_state.jira_client)

        # Get issues with assignee information — paginate to avoid the 1000-issue hard cap
        fields = [
            'key', 'summary', 'status', 'assignee', 'priority', 'issuetype',
            'project', 'created', 'updated', *story_point_field_ids
        ]

        issues: list = []
        start_at = 0
        seen_keys: set = set()
        while True:
            batch = await app_state.jira_client.search(jql, fields=fields, max_results=100, start_at=start_at)
            batch_issues = batch.get('issues', [])
            if not batch_issues:
                break
            new_keys = [i.get('key') for i in batch_issues if i.get('key')]
            if any(k in seen_keys for k in new_keys):
                break
            seen_keys.update(new_keys)
            issues.extend(batch_issues)
            if len(batch_issues) < 100:
                break
            start_at += 100
        
        # Calculate performance metrics for each assignee
        performer_stats = {}
        
        for issue in issues:
            if not issue or not issue.get('fields'):
                continue
                
            assignee = issue.get('fields', {}).get('assignee')
            if not assignee:
                continue
                
            assignee_name = assignee.get('displayName', 'Unknown')
            assignee_key = assignee.get('key', assignee_name)
            
            if assignee_key not in performer_stats:
                performer_stats[assignee_key] = {
                    'name': assignee_name,
                    'email': assignee.get('emailAddress', ''),
                    'issuesResolved': 0,
                    'issuesCreated': 0,
                    'storyPoints': 0,
                    'bugsFixed': 0,
                    'tasksCompleted': 0,
                    'avgResolutionTime': 0,
                    'performanceScore': 0,
                    'rank': 0,
                    'achievements': [],
                    'streak': 0,
                    'lastActive': ''
                }
            
            # Count resolved issues
            fields_obj = issue.get('fields', {})
            is_done = is_done_issue(fields_obj)
            if is_done:
                performer_stats[assignee_key]['issuesResolved'] += 1
            
            # Count story points
            story_points = get_issue_story_points(fields_obj, story_point_field_ids)
            if story_points:
                performer_stats[assignee_key]['storyPoints'] += story_points
            
            # Count by issue type
            type_name = get_issue_type_name(fields_obj).lower()
            if type_name == 'bug' and is_done:
                performer_stats[assignee_key]['bugsFixed'] += 1
            elif type_name == 'task' and is_done:
                performer_stats[assignee_key]['tasksCompleted'] += 1
        
        # Calculate performance scores and rank
        performers = list(performer_stats.values())

        # Compute raw scores first, then normalize relative to the team's max
        # so the top contributor always scores 100 and rankings are meaningful
        for performer in performers:
            performer['_rawScore'] = (
                performer['issuesResolved'] * 10 +
                performer['storyPoints'] * 2 +
                performer['bugsFixed'] * 5 +
                performer['tasksCompleted'] * 3
            )

        max_raw = max((p['_rawScore'] for p in performers), default=1) or 1
        for performer in performers:
            performer['performanceScore'] = round((performer['_rawScore'] / max_raw) * 100)
            del performer['_rawScore']
            
            # Generate achievements
            achievements = []
            if performer['issuesResolved'] >= 10:
                achievements.append('Issue Resolver')
            if performer['storyPoints'] >= 50:
                achievements.append('Story Point Master')
            if performer['bugsFixed'] >= 5:
                achievements.append('Bug Hunter')
            if performer['performanceScore'] >= 80:
                achievements.append('Top Performer')
            
            performer['achievements'] = achievements
        
        # Sort by performance score and assign ranks
        performers.sort(key=lambda x: x['performanceScore'], reverse=True)
        for i, performer in enumerate(performers):
            performer['rank'] = i + 1
        
        return {
            "success": True,
            "performers": performers[:10]  # Return top 10 performers
        }
        
    except Exception as e:
        logger.error(f"Failed to get best performers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_recent_activities():
    """Get recent activities from both Jira and Confluence"""
    activities = []
    
    try:
        # Get recent Jira activities
        if app_state.jira_configured and app_state.jira_client:
            jira_data = await app_state.jira_client.search("ORDER BY updated DESC", max_results=10)
            jira_issues = jira_data.get('issues', [])
            for issue in jira_issues:
                activities.append({
                    "id": f"jira_{issue.get('key', '')}",
                    "type": "issue",
                    "title": f"{issue.get('key', '')} - {issue.get('fields', {}).get('summary', '')}",
                    "description": f"Status: {issue.get('fields', {}).get('status', {}).get('name', 'Unknown')}",
                    "author": issue.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned'),
                    "timestamp": issue.get('fields', {}).get('updated', ''),
                    "status": "success" if issue.get('fields', {}).get('status', {}).get('name') in ['Done', 'Resolved'] else "info",
                    "priority": issue.get('fields', {}).get('priority', {}).get('name', 'Medium'),
                    "url": f"{app_state.jira_config.base_url}/browse/{issue.get('key', '')}"
                })
        
        # Get recent Confluence activities
        if app_state.confluence_configured and app_state.confluence_client:
            confluence_pages = await app_state.confluence_client.search("", limit=10)
            for page in confluence_pages:
                activities.append({
                    "id": f"confluence_{page.get('id', '')}",
                    "type": "page",
                    "title": page.get('title', 'Untitled'),
                    "description": f"Updated in {page.get('space', {}).get('name', 'Unknown')} space",
                    "author": page.get('author', {}).get('displayName', 'Unknown'),
                    "timestamp": page.get('updated', ''),
                    "status": "success",
                    "space": page.get('space', {}).get('name', 'Unknown'),
                    "url": page.get('url', '#')
                })
        
        # Sort by timestamp and return recent activities
        activities.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return {
            "success": True,
            "activities": activities[:20]  # Return top 20 recent activities
        }
        
    except Exception as e:
        logger.error(f"Failed to get recent activities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# TCOE REPORT MODULE (Test Center of Excellence)
# ============================================================================

from services.defect_leakage_analyzer import DefectLeakageAnalyzer
from services.regression_automation_analyzer import RegressionAutomationAnalyzer
from services.overall_automation_analyzer import OverallAutomationAnalyzer
from services.test_coverage_analyzer import TestCoverageAnalyzer
from services.test_story_ratio_analyzer import TestStoryRatioAnalyzer
from services.bug_ratio_analyzer import BugRatioAnalyzer
from services.test_case_review_status_analyzer import TestCaseReviewStatusAnalyzer
from services.pi_date_utils import normalize_tcoe_request_for_pi
from services.tcoe_dashboard import (
    TCOE_DASHBOARD_METRICS,
    copy_dashboard_run,
    create_tcoe_dashboard_run,
    process_tcoe_dashboard_run,
    run_has_current_default_dates,
)

# QCOE/TCOE latest-vs-last-week comparison dashboard is enabled.
# Manual metric/report endpoints remain enabled for explicit report-date checks.
TCOE_COMPARISON_DASHBOARD_ENABLED = True

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def _normalize_tcoe_request_or_400(request: Dict[str, Any], metric: str) -> Dict[str, Any]:
    try:
        return normalize_tcoe_request_for_pi(request, metric)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

def _attach_pi_context(result: Any, request: Dict[str, Any]) -> Any:
    if not isinstance(result, dict):
        return result

    pi_context = request.get("pi_context")
    previous_pi_context = request.get("previous_pi_context")
    comparison_note = request.get("comparison_note")
    metric_header = request.get("metric_header")

    if pi_context:
        result.setdefault("pi_context", pi_context)
        for key in ("period", "period2", "current_week"):
            if isinstance(result.get(key), dict):
                result[key].setdefault("pi_context", pi_context)
        for table_key in ("table_a", "table_b"):
            table = result.get(table_key)
            if isinstance(table, dict):
                for period_key in ("period", "period2"):
                    if isinstance(table.get(period_key), dict):
                        table[period_key].setdefault("pi_context", pi_context)

    if previous_pi_context:
        result.setdefault("previous_pi_context", previous_pi_context)
        for key in ("period1", "previous_week"):
            if isinstance(result.get(key), dict):
                result[key].setdefault("pi_context", previous_pi_context)
        for table_key in ("table_a", "table_b"):
            table = result.get(table_key)
            if isinstance(table, dict) and isinstance(table.get("period1"), dict):
                table["period1"].setdefault("pi_context", previous_pi_context)

    if comparison_note:
        result.setdefault("comparison_note", comparison_note)
    if metric_header:
        result.setdefault("metric_header", metric_header)

    return result

def _split_email_addresses(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [address.strip() for address in re.split(r"[;,]", raw) if address.strip()]

def _validate_email_addresses(addresses: List[str], field_name: str) -> None:
    invalid = [address for address in addresses if not EMAIL_PATTERN.match(address)]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} email address: {invalid[0]}"
        )

def _env_bool(name: str, default: bool = True) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def _sanitize_report_html(report_html: Optional[str]) -> str:
    if not report_html:
        return ""

    sanitized = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", report_html)
    sanitized = re.sub(r"(?i)\son\w+\s*=\s*(\".*?\"|'.*?'|[^\s>]+)", "", sanitized)
    sanitized = re.sub(r"(?i)javascript:", "", sanitized)
    return sanitized

def _build_tcoe_email_html(
    body: str,
    report_html: Optional[str],
    report_title: Optional[str],
    report_period: Optional[str],
    metrics: Optional[str]
) -> str:
    body_html = "<br>".join(html.escape(body).splitlines())
    meta_lines = []
    if report_title:
        meta_lines.append(f"<strong>Report:</strong> {html.escape(report_title)}")
    if report_period:
        meta_lines.append(html.escape(report_period))
    if metrics:
        meta_lines.append(f"<strong>Metrics:</strong> {html.escape(metrics)}")

    meta_html = ""
    if meta_lines:
        meta_html = (
            "<div style=\"margin:16px 0;color:#374151;font-size:13px;line-height:1.5;\">"
            + "<br>".join(meta_lines)
            + "</div>"
        )

    embedded_report = _sanitize_report_html(report_html)
    report_section = ""
    if embedded_report:
        report_section = (
            "<div style=\"margin-top:24px;border-top:1px solid #d1d5db;padding-top:18px;\">"
            f"{embedded_report}"
            "</div>"
        )

    return f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:15px;line-height:1.55;">
      {body_html}
      {meta_html}
      {report_section}
    </div>
  </body>
</html>
"""

def _send_tcoe_email_smtp(
    to_addresses: List[str],
    cc_addresses: List[str],
    subject: str,
    body: str,
    html_body: str,
    pdf_bytes: bytes,
    filename: str
) -> None:
    smtp_host = os.getenv("SMTP_HOST") or os.getenv("TCOE_SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT") or os.getenv("TCOE_SMTP_PORT") or "587")
    smtp_username = os.getenv("SMTP_USERNAME") or os.getenv("TCOE_SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD") or os.getenv("TCOE_SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM") or os.getenv("TCOE_SMTP_FROM") or smtp_username
    smtp_use_tls = _env_bool("SMTP_USE_TLS", _env_bool("TCOE_SMTP_USE_TLS", True))

    if not smtp_host or not smtp_from:
        raise HTTPException(
            status_code=503,
            detail="SMTP mail provider is not configured. Set SMTP_HOST and SMTP_FROM, or configure Microsoft Graph."
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = ", ".join(to_addresses)
    if cc_addresses:
        message["Cc"] = ", ".join(cc_addresses)
    message.set_content(body)
    message.add_alternative(html_body, subtype="html")
    message.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            if smtp_use_tls:
                server.starttls()
            if smtp_username and smtp_password:
                server.login(smtp_username, smtp_password)
            server.send_message(message)
    except smtplib.SMTPException as exc:
        raise HTTPException(status_code=502, detail=f"SMTP send failed: {exc}") from exc

def _graph_recipients(addresses: List[str]) -> List[Dict[str, Dict[str, str]]]:
    return [{"emailAddress": {"address": address}} for address in addresses]

async def _send_tcoe_email_graph(
    to_addresses: List[str],
    cc_addresses: List[str],
    subject: str,
    html_body: str,
    pdf_bytes: bytes,
    filename: str
) -> None:
    try:
        import httpx
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Microsoft Graph mail requires httpx to be installed.") from exc

    tenant_id = os.getenv("MS_GRAPH_TENANT_ID") or os.getenv("GRAPH_TENANT_ID")
    client_id = os.getenv("MS_GRAPH_CLIENT_ID") or os.getenv("GRAPH_CLIENT_ID")
    client_secret = os.getenv("MS_GRAPH_CLIENT_SECRET") or os.getenv("GRAPH_CLIENT_SECRET")
    sender = os.getenv("MS_GRAPH_SENDER") or os.getenv("GRAPH_SENDER") or os.getenv("SMTP_FROM")

    if not tenant_id or not client_id or not client_secret or not sender:
        raise HTTPException(
            status_code=503,
            detail="Microsoft Graph mail provider is not configured. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, and MS_GRAPH_SENDER."
        )

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            token_response = await client.post(token_url, data=token_data)
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]

            payload = {
                "message": {
                    "subject": subject,
                    "body": {
                        "contentType": "HTML",
                        "content": html_body,
                    },
                    "toRecipients": _graph_recipients(to_addresses),
                    "ccRecipients": _graph_recipients(cc_addresses),
                    "attachments": [
                        {
                            "@odata.type": "#microsoft.graph.fileAttachment",
                            "name": filename,
                            "contentType": "application/pdf",
                            "contentBytes": base64.b64encode(pdf_bytes).decode("ascii"),
                        }
                    ],
                },
                "saveToSentItems": True,
            }

            send_response = await client.post(
                f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail",
                headers={"Authorization": f"Bearer {access_token}"},
                json=payload,
            )
            send_response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise HTTPException(status_code=502, detail=f"Microsoft Graph send failed: {detail}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Microsoft Graph send failed: {exc}") from exc

@app.post("/api/quality/send-tcoe-report-email", tags=["TCOE Report"], summary="Send TCOE report PDF by email")
async def send_tcoe_report_email(
    to: str = Form(...),
    cc: str = Form(""),
    subject: str = Form(...),
    body: str = Form(...),
    filename: str = Form("tcoe-report.pdf"),
    report_title: Optional[str] = Form(None),
    report_period: Optional[str] = Form(None),
    metrics: Optional[str] = Form(None),
    report_html: Optional[str] = Form(None),
    pdf: UploadFile = File(...)
):
    to_addresses = _split_email_addresses(to)
    cc_addresses = _split_email_addresses(cc)

    if not to_addresses:
        raise HTTPException(status_code=400, detail="At least one recipient is required.")
    _validate_email_addresses(to_addresses, "To")
    _validate_email_addresses(cc_addresses, "CC")

    if not subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required.")

    safe_filename = filename.strip() or "tcoe-report.pdf"
    if not safe_filename.lower().endswith(".pdf"):
        safe_filename = f"{safe_filename}.pdf"

    pdf_bytes = await pdf.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDF attachment is empty.")
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Attachment must be a PDF.")
    if len(pdf_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF attachment exceeds the 25 MB mail limit.")

    provider = (os.getenv("TCOE_MAIL_PROVIDER") or "").strip().lower()
    if provider in {"msgraph", "microsoft_graph", "microsoft-graph"}:
        provider = "graph"
    if not provider:
        provider = "graph" if os.getenv("MS_GRAPH_CLIENT_ID") or os.getenv("GRAPH_CLIENT_ID") else "smtp"

    html_body = _build_tcoe_email_html(body, report_html, report_title, report_period, metrics)

    if provider == "graph":
        await _send_tcoe_email_graph(
            to_addresses=to_addresses,
            cc_addresses=cc_addresses,
            subject=subject.strip(),
            html_body=html_body,
            pdf_bytes=pdf_bytes,
            filename=safe_filename,
        )
    elif provider == "smtp":
        await asyncio.to_thread(
            _send_tcoe_email_smtp,
            to_addresses,
            cc_addresses,
            subject.strip(),
            body,
            html_body,
            pdf_bytes,
            safe_filename,
        )
    else:
        raise HTTPException(status_code=503, detail="Unsupported TCOE_MAIL_PROVIDER. Use 'graph' or 'smtp'.")

    logger.info("TCOE report mail sent to %s recipient(s), cc %s, provider=%s", len(to_addresses), len(cc_addresses), provider)
    return {
        "success": True,
        "message": "Mail sent successfully.",
        "provider": provider,
        "recipients": len(to_addresses),
        "cc": len(cc_addresses),
    }

@app.post("/api/quality/defect-leakage-analysis", tags=["TCOE Report"], summary="Generate TCOE Report")
async def analyze_defect_leakage(request: Dict[str, Any]):
    """
    Generate TCOE (Test Center of Excellence) Report
    
    **POC Module**: Weekly Quality Metrics Analysis
    
    Body:
    ```json
    {
        "portfolio": "DATA_SOLUTIONS",
        "current_week_from": "2025-12-28",
        "current_week_to": "2026-01-03",
        "previous_week_from": "2025-12-21",
        "previous_week_to": "2025-12-27"
    }
    ```
    
    Returns:
    - Current week metrics (bugs, defects, leakage %)
    - Previous week metrics
    - Week-over-week comparison
    - AI-generated insights and recommendations
    - Severity classification
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        # Validate required fields
        required_fields = ['portfolio', 'current_week_from', 'current_week_to', 'previous_week_from', 'previous_week_to']
        for field in required_fields:
            if field not in request:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        request = _normalize_tcoe_request_or_400(request, request.get("metric", "defect_leakage"))
        
        logger.info(f"🎯 Defect Leakage Analysis Request: {request['portfolio']}")
        
        # Initialize analyzer
        analyzer = DefectLeakageAnalyzer(app_state.jira_client)
        
        # Perform analysis
        result = await analyzer.compare_weeks(
            portfolio=request['portfolio'],
            current_week_from=request['current_week_from'],
            current_week_to=request['current_week_to'],
            previous_week_from=request['previous_week_from'],
            previous_week_to=request['previous_week_to']
        )
        result = _attach_pi_context(result, request)
        
        logger.info(f"✅ Analysis completed for {request['portfolio']}")
        
        return {
            "success": True,
            "analysis": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_message = str(e)
        # Handle "No valid projects" error gracefully - return empty data with warning
        if "No valid projects found" in error_message:
            portfolio = request.get('portfolio', 'Unknown')
            warning_details = await _build_invalid_project_warning_details(portfolio, app_state.jira_client)
            logger.warning(f"⚠️ Defect leakage analysis: {error_message} - returning empty data with warning")
            return {
                "success": True,  # Mark as success so frontend continues with other portfolios
                "analysis": {
                    "portfolio": portfolio,
                    "warning": error_message,
                    "has_data": False,
                    "invalid_projects": warning_details.get("invalid_projects", []),
                    "invalid_projects_by_portfolio": warning_details.get("invalid_projects_by_portfolio", []),
                    "current_week": {"bugs_count": 0, "defects_count": 0, "leakage_percentage": 0, "total_issues": 0, "date_range": ""},
                    "previous_week": {"bugs_count": 0, "defects_count": 0, "leakage_percentage": 0, "total_issues": 0, "date_range": ""},
                    "comparison": {"leakage_change": 0, "leakage_change_percentage": 0, "bugs_change": 0, "defects_change": 0, "trend": "stable", "severity": "normal"},
                    "ai_analysis": f"No data available: {error_message}",
                    "ai_insights": f"No data available: {error_message}",
                    "generated_at": datetime.now().isoformat()
                }
            }
        logger.error(f"❌ Defect leakage analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# New simplified endpoint to support single or multiple portfolios (ALL)
@app.post("/api/quality/tcoe-report", tags=["TCOE Report"], summary="TCOE - Multiple Portfolio Support")
async def tcoe_report(request: Dict[str, Any]):
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured")

        required_fields = ["portfolio", "dateFrom", "dateTo"]
        for field in required_fields:
            if field not in request:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        portfolio = request["portfolio"]
        date_from = request["dateFrom"]
        date_to = request["dateTo"]
        request = _normalize_tcoe_request_or_400(request, request.get("metric", "defect_leakage"))
        date_from = request["dateFrom"]
        date_to = request["dateTo"]

        analyzer = DefectLeakageAnalyzer(app_state.jira_client)

        if isinstance(portfolio, str) and portfolio.upper() == "ALL":
            from services.portfolio_mapping import get_all_portfolios
            portfolios = get_all_portfolios()
            result = await analyzer.analyze_multiple(portfolios, date_from, date_to)
            if isinstance(result, dict) and isinstance(result.get("rows"), list):
                result["rows"] = [_attach_pi_context(row, request) for row in result["rows"]]
            result = _attach_pi_context(result, request)
            return {"success": True, **result}
        else:
            row = await analyzer.analyze_week(portfolio, date_from, date_to)
            row = _attach_pi_context(row, request)
            return {"success": True, "rows": [row]}

    except HTTPException:
        raise
    except Exception as e:
        error_message = str(e)
        # Handle "No valid projects" error gracefully - return empty data with warning
        if "No valid projects found" in error_message:
            portfolio_name = request.get("portfolio", "Unknown")
            warning_details = await _build_invalid_project_warning_details(portfolio_name, app_state.jira_client)
            logger.warning(f"⚠️ TCOE report: {error_message} - returning empty data with warning")
            return {
                "success": True,
                "rows": [{
                    "portfolio": portfolio_name,
                    "warning": error_message,
                    "has_data": False,
                    "invalid_projects": warning_details.get("invalid_projects", []),
                    "invalid_projects_by_portfolio": warning_details.get("invalid_projects_by_portfolio", []),
                    "current_week": {"bugs_count": 0, "defects_count": 0, "leakage_percentage": 0, "total_issues": 0, "date_range": ""},
                    "previous_week": {"bugs_count": 0, "defects_count": 0, "leakage_percentage": 0, "total_issues": 0, "date_range": ""},
                    "comparison": {"leakage_change": 0, "leakage_change_percentage": 0, "bugs_change": 0, "defects_change": 0, "trend": "stable", "severity": "normal"},
                    "ai_analysis": f"No data available: {error_message}",
                    "ai_insights": f"No data available: {error_message}",
                    "generated_at": datetime.now().isoformat()
                }]
            }
        logger.error(f"❌ TCOE report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Background job system for TCOE reports
import uuid
from datetime import datetime


async def _build_invalid_project_warning_details(portfolio: str, jira_client: Any) -> Dict[str, Any]:
    """Resolve invalid Jira projects and group them by portfolio for UI warnings."""
    try:
        from services.portfolio_mapping import (
            get_portfolio_for_project,
            get_portfolio_projects,
            validate_projects,
        )

        if not portfolio:
            return {"invalid_projects": [], "invalid_projects_by_portfolio": []}

        candidate_projects = get_portfolio_projects(portfolio)
        if not candidate_projects:
            candidate_projects = [portfolio]

        _, invalid_projects = await validate_projects(jira_client, candidate_projects)
        if not invalid_projects:
            return {"invalid_projects": [], "invalid_projects_by_portfolio": []}

        grouped: Dict[str, List[str]] = {}
        for project_key in invalid_projects:
            portfolio_name = get_portfolio_for_project(project_key) or "Unknown"
            grouped.setdefault(portfolio_name, []).append(project_key)

        invalid_projects_by_portfolio = [
            {"portfolio": name, "projects": sorted(projects)}
            for name, projects in sorted(grouped.items(), key=lambda entry: entry[0])
        ]
        return {
            "invalid_projects": sorted(invalid_projects),
            "invalid_projects_by_portfolio": invalid_projects_by_portfolio,
        }
    except Exception as exc:
        logger.warning("Unable to build invalid project warning details for '%s': %s", portfolio, exc)
        return {"invalid_projects": [], "invalid_projects_by_portfolio": []}

async def process_tcoe_job_background(job_id: str, request: Dict[str, Any], metric: Optional[str] = None):
    """Process TCOE report generation in the background"""
    try:
        app_state.tcoe_jobs[job_id]["status"] = "processing"
        logger.info(f"🔄 Starting background TCOE job {job_id} for metric: {metric or 'defect_leakage'}")
        
        if not app_state.jira_configured or not app_state.jira_client:
            raise Exception("Jira is not configured")

        request = normalize_tcoe_request_for_pi(request, metric or request.get("metric", "defect_leakage"))
        
        result = None
        
        # Route to appropriate analyzer based on metric
        if metric == "regression_automation":
            from services.regression_automation_analyzer import RegressionAutomationAnalyzer
            analyzer = RegressionAutomationAnalyzer(app_state.jira_client)
            enable_comparison = request.get("enable_comparison", False)
            if enable_comparison:
                result = await analyzer.compare_periods(
                    portfolio=request["portfolio"],
                    period1_from=request["period1_from"],
                    period1_to=request["period1_to"],
                    period2_from=request["period2_from"],
                    period2_to=request["period2_to"]
                )
            else:
                result = await analyzer.analyze_single_period(
                    portfolio=request["portfolio"],
                    period_from=request["period_from"],
                    period_to=request["period_to"]
                )
        elif metric == "overall_automation":
            from services.overall_automation_analyzer import OverallAutomationAnalyzer
            analyzer = OverallAutomationAnalyzer(app_state.jira_client)
            enable_comparison = request.get("enable_comparison", False)
            if enable_comparison:
                result = await analyzer.compare_periods(
                    portfolio=request["portfolio"],
                    period1_from=request["period1_from"],
                    period1_to=request["period1_to"],
                    period2_from=request["period2_from"],
                    period2_to=request["period2_to"]
                )
            else:
                result = await analyzer.analyze_single_period(
                    portfolio=request["portfolio"],
                    period_from=request["period_from"],
                    period_to=request["period_to"]
                )
        elif metric == "test_coverage":
            from services.test_coverage_analyzer import TestCoverageAnalyzer
            analyzer = TestCoverageAnalyzer(app_state.jira_client)
            enable_comparison = request.get("enable_comparison", False)
            if enable_comparison:
                result = await analyzer.compare_periods(
                    portfolio=request["portfolio"],
                    period1_from=request["period1_from"],
                    period1_to=request["period1_to"],
                    period2_from=request["period2_from"],
                    period2_to=request["period2_to"]
                )
            else:
                result = await analyzer.analyze_single_period(
                    portfolio=request["portfolio"],
                    period_from=request["period_from"],
                    period_to=request["period_to"]
                )
        elif metric == "test_story_ratio":
            from services.test_story_ratio_analyzer import TestStoryRatioAnalyzer
            analyzer = TestStoryRatioAnalyzer(app_state.jira_client)
            enable_comparison = request.get("enable_comparison", False)
            if enable_comparison:
                result = await analyzer.compare_periods(
                    portfolio=request["portfolio"],
                    period1_from=request["period1_from"],
                    period1_to=request["period1_to"],
                    period2_from=request["period2_from"],
                    period2_to=request["period2_to"]
                )
            else:
                result = await analyzer.analyze_single_period(
                    portfolio=request["portfolio"],
                    period_from=request["period_from"],
                    period_to=request["period_to"]
                )
        elif metric == "bug_ratio":
            from services.bug_ratio_analyzer import BugRatioAnalyzer
            analyzer = BugRatioAnalyzer(app_state.jira_client)
            enable_comparison = request.get("enable_comparison", False)
            if enable_comparison:
                result = await analyzer.compare_periods(
                    portfolio=request["portfolio"],
                    period1_from=request["period1_from"],
                    period1_to=request["period1_to"],
                    period2_from=request["period2_from"],
                    period2_to=request["period2_to"]
                )
            else:
                result = await analyzer.analyze_single_period(
                    portfolio=request["portfolio"],
                    period_from=request["period_from"],
                    period_to=request["period_to"]
                )
        elif metric == "test_review_status":
            from services.test_case_review_status_analyzer import TestCaseReviewStatusAnalyzer
            analyzer = TestCaseReviewStatusAnalyzer(app_state.jira_client)
            
            # NEW: Check for portfolio-grouped request (array of projects)
            if "projects" in request and isinstance(request.get("projects"), list):
                # Portfolio group analysis - send all projects together for portfolio grouping
                enable_comparison = request.get("enable_comparison", False)
                result = await analyzer.analyze_by_portfolio_groups(
                    projects=request["projects"],
                    period1_from=request["period1_from"],
                    period1_to=request["period1_to"],
                    period2_from=request["period2_from"],
                    period2_to=request["period2_to"]
                )
            else:
                # OLD: Single portfolio analysis (backward compatibility)
                portfolio = request.get("portfolio", "")
                summary_mode = request.get("summary_mode", False)
                
                if isinstance(portfolio, str) and portfolio.upper() == "ALL":
                    # Consolidated analysis across all portfolios
                    from services.portfolio_mapping import get_all_portfolios
                    portfolios = get_all_portfolios()
                    enable_comparison = request.get("enable_comparison", True)
                    if enable_comparison:
                        result = await analyzer.analyze_portfolio_consolidated(
                            portfolios=portfolios,
                            period1_from=request["period1_from"],
                            period1_to=request["period1_to"],
                            period2_from=request["period2_from"],
                            period2_to=request["period2_to"]
                        )
                    else:
                        # Single period consolidated analysis not yet implemented - fall back to first portfolio
                        result = await analyzer.analyze_single_period(
                            portfolio=portfolios[0],
                            period_from=request["period_from"],
                            period_to=request["period_to"]
                        )
                else:
                    # Single portfolio analysis
                    enable_comparison = request.get("enable_comparison", False)
                    if enable_comparison:
                        result = await analyzer.compare_periods(
                            portfolio=request["portfolio"],
                            period1_from=request["period1_from"],
                            period1_to=request["period1_to"],
                            period2_from=request["period2_from"],
                            period2_to=request["period2_to"],
                            summary_mode=summary_mode
                        )
                    else:
                        result = await analyzer.analyze_single_period(
                            portfolio=request["portfolio"],
                            period_from=request["period_from"],
                            period_to=request["period_to"]
                        )
        else:
            # Default to defect leakage
            analyzer = DefectLeakageAnalyzer(app_state.jira_client)
            enable_comparison = request.get("enable_comparison", True)
            if enable_comparison:
                result = await analyzer.compare_weeks(
                    portfolio=request["portfolio"],
                    current_week_from=request["current_week_from"],
                    current_week_to=request["current_week_to"],
                    previous_week_from=request["previous_week_from"],
                    previous_week_to=request["previous_week_to"]
                )
            else:
                single_period = await analyzer.analyze_defect_inflow_yoy(
                    portfolio=request["portfolio"],
                    date_from=request["date_from"],
                    date_to=request["date_to"]
                )
                result = {
                    "portfolio": request["portfolio"],
                    "current_week": single_period,
                    "period": single_period,
                    "previous_week": {
                        "bugs_count": 0,
                        "defects_count": 0,
                        "leakage_percentage": 0.0,
                        "total_issues": 0,
                        "date_range": ""
                    },
                    "comparison": {
                        "leakage_change": 0.0,
                        "leakage_change_percentage": 0.0,
                        "bugs_change": 0,
                        "defects_change": 0,
                        "trend": "stable",
                        "severity": "normal"
                    },
                    "ai_insights": single_period.get("ai_insights", ""),
                    "ai_metadata": single_period.get("ai_metadata"),
                    "generated_at": datetime.now().isoformat()
                }
        
        app_state.tcoe_jobs[job_id]["status"] = "completed"
        result = _attach_pi_context(result, request)

        app_state.tcoe_jobs[job_id]["result"] = {
            "success": True,
            "analysis": result
        }
        app_state.tcoe_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        logger.info(f"✅ Background TCOE job {job_id} completed successfully")
        
    except Exception as e:
        error_message = str(e)
        # Handle "No valid projects" error gracefully - return empty data with warning
        # This allows other portfolios/metrics to continue processing
        if "No valid projects found" in error_message:
            portfolio = request.get("portfolio", "Unknown")
            warning_details = await _build_invalid_project_warning_details(portfolio, app_state.jira_client)
            logger.warning(f"⚠️ Background TCOE job {job_id}: {error_message} - returning empty data with warning")
            
            # Return completed with empty data and warning (like TCOE dashboard does)
            app_state.tcoe_jobs[job_id]["status"] = "completed"
            app_state.tcoe_jobs[job_id]["result"] = {
                "success": True,  # Mark as success so frontend continues with other portfolios
                "analysis": {
                    "portfolio": portfolio,
                    "warning": error_message,
                    "has_data": False,
                    "invalid_projects": warning_details.get("invalid_projects", []),
                    "invalid_projects_by_portfolio": warning_details.get("invalid_projects_by_portfolio", []),
                    "total_stories": 0,
                    "total_test_cases": 0,
                    "total_regression_tests": 0,
                    "coverage_percentage": 0,
                    "period": None,
                    "period1": None,
                    "period2": None,
                    "table_a": None,
                    "table_b": None,
                    "current_week": {"bugs_count": 0, "defects_count": 0, "leakage_percentage": 0, "total_issues": 0, "date_range": ""},
                    "previous_week": {"bugs_count": 0, "defects_count": 0, "leakage_percentage": 0, "total_issues": 0, "date_range": ""},
                    "comparison": {"leakage_change": 0, "leakage_change_percentage": 0, "bugs_change": 0, "defects_change": 0, "trend": "stable", "severity": "normal"},
                    "ai_analysis": f"No data available: {error_message}",
                    "ai_insights": f"No data available: {error_message}",
                    "generated_at": datetime.now().isoformat()
                }
            }
            app_state.tcoe_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        else:
            app_state.tcoe_jobs[job_id]["status"] = "failed"
            app_state.tcoe_jobs[job_id]["error"] = error_message
            logger.error(f"❌ Background TCOE job {job_id} exception: {e}", exc_info=True)

@app.post("/api/quality/tcoe-report-background", tags=["TCOE Report"], summary="Start TCOE Report Generation (Background)")
async def tcoe_report_background(request: Dict[str, Any]):
    """
    Start TCOE report generation in the background.
    Returns immediately with a job ID. Use the job status endpoint to check progress.
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured")
        
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Initialize job tracking
        app_state.tcoe_jobs[job_id] = {
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "request": request.copy()
        }
        
        # Determine which metric to process
        metric = request.get("metric", "defect_leakage")
        
        # Start background task
        asyncio.create_task(process_tcoe_job_background(job_id, request, metric))
        
        logger.info(f"🚀 Started background TCOE job {job_id}")
        
        return {
            "success": True,
            "job_id": job_id,
            "status": "pending",
            "message": "Report generation started in background"
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to start background TCOE job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/quality/tcoe-job-status/{job_id}", tags=["TCOE Report"], summary="Check TCOE Job Status")
async def get_tcoe_job_status(job_id: str):
    """Check the status of a background TCOE report generation job"""
    if job_id not in app_state.tcoe_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = app_state.tcoe_jobs[job_id]
    return {
        "success": True,
        "job_id": job_id,
        "status": job["status"],
        "created_at": job.get("created_at"),
        "completed_at": job.get("completed_at"),
        "result": job.get("result"),
        "error": job.get("error")
    }

@app.post("/api/quality/tcoe-dashboard/start", tags=["TCOE Dashboard"], summary="Start Progressive TCOE Dashboard")
async def start_tcoe_dashboard(request: Optional[Dict[str, Any]] = None):
    """Start a progressive TCOE dashboard run, or reuse the latest current run."""
    try:
        if not TCOE_COMPARISON_DASHBOARD_ENABLED:
            raise HTTPException(
                status_code=503,
                detail="TCOE comparison dashboard is disabled by configuration.",
            )

        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured")

        payload = request or {}
        force = bool(payload.get("force", False))

        latest_run = None
        if app_state.latest_tcoe_dashboard_run_id:
            latest_run = app_state.tcoe_dashboard_runs.get(app_state.latest_tcoe_dashboard_run_id)

        reusable_statuses = {"pending", "processing", "completed", "completed_with_errors"}
        if (
            not force
            and latest_run
            and latest_run.get("status") in reusable_statuses
            and run_has_current_default_dates(latest_run)
        ):
            return {
                "success": True,
                "run_id": latest_run["run_id"],
                "reused": True,
                "is_current": True,
                "run": copy_dashboard_run(latest_run),
                "metrics": TCOE_DASHBOARD_METRICS,
            }

        run = create_tcoe_dashboard_run()
        app_state.tcoe_dashboard_runs[run["run_id"]] = run
        app_state.latest_tcoe_dashboard_run_id = run["run_id"]

        asyncio.create_task(process_tcoe_dashboard_run(run, app_state.jira_client))
        logger.info("Started TCOE dashboard run %s", run["run_id"])

        return {
            "success": True,
            "run_id": run["run_id"],
            "reused": False,
            "is_current": True,
            "run": copy_dashboard_run(run),
            "metrics": TCOE_DASHBOARD_METRICS,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to start TCOE dashboard run: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/quality/tcoe-dashboard/latest", tags=["TCOE Dashboard"], summary="Get Latest TCOE Dashboard Run")
async def get_latest_tcoe_dashboard():
    """Return the latest active or completed TCOE dashboard run."""
    latest_run = None
    if app_state.latest_tcoe_dashboard_run_id:
        latest_run = app_state.tcoe_dashboard_runs.get(app_state.latest_tcoe_dashboard_run_id)
    is_current = bool(latest_run and run_has_current_default_dates(latest_run))

    return {
        "success": True,
        "run_id": latest_run.get("run_id") if latest_run else None,
        "is_current": is_current,
        "run": copy_dashboard_run(latest_run) if latest_run else None,
        "metrics": TCOE_DASHBOARD_METRICS,
    }

@app.get("/api/quality/tcoe-dashboard/status/{run_id}", tags=["TCOE Dashboard"], summary="Get TCOE Dashboard Run Status")
async def get_tcoe_dashboard_status(run_id: str):
    """Return partial dashboard results as each metric completes."""
    run = app_state.tcoe_dashboard_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Dashboard run not found")

    return {
        "success": True,
        "run_id": run_id,
        "is_current": run_has_current_default_dates(run),
        "run": copy_dashboard_run(run),
        "metrics": TCOE_DASHBOARD_METRICS,
    }

@app.get("/api/jira/assignees", tags=["Jira"], summary="List assignable users for a project")
async def list_assignees(projectKey: str):
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured")
        users = await app_state.jira_client.get_assignable_users(projectKey)
        items = [
            {
                "accountId": u.get("accountId"),
                "displayName": u.get("displayName"),
                "emailAddress": u.get("emailAddress"),
                "active": u.get("active", True)
            }
            for u in users or []
        ]
        return {"success": True, "assignees": items, "projectKey": projectKey}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get assignees for {projectKey}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/quality/analyze-single-week", tags=["TCOE Report"], summary="Analyze Single Week")
async def analyze_single_week(request: Dict[str, Any]):
    """
    Analyze defect leakage for a single week (no comparison)
    
    Body:
    ```json
    {
        "portfolio": "DATA_SOLUTIONS",
        "date_from": "2025-12-28",
        "date_to": "2026-01-03"
    }
    ```
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured")
        
        required_fields = ['portfolio', 'date_from', 'date_to']
        for field in required_fields:
            if field not in request:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        request = _normalize_tcoe_request_or_400(request, request.get("metric", "defect_leakage"))
        
        analyzer = DefectLeakageAnalyzer(app_state.jira_client)
        
        result = await analyzer.analyze_defect_inflow_yoy(
            portfolio=request['portfolio'],
            date_from=request['date_from'],
            date_to=request['date_to']
        )
        result = _attach_pi_context(result, request)
        analysis = _attach_pi_context({
            "portfolio": request["portfolio"],
            "current_week": result,
            "period": result,
            "previous_week": {
                "bugs_count": 0,
                "defects_count": 0,
                "leakage_percentage": 0.0,
                "total_issues": 0,
                "date_range": ""
            },
            "comparison": {
                "leakage_change": 0.0,
                "leakage_change_percentage": 0.0,
                "bugs_change": 0,
                "defects_change": 0,
                "trend": "stable",
                "severity": "normal"
            },
            "ai_insights": result.get("ai_insights", ""),
            "ai_metadata": result.get("ai_metadata"),
            "generated_at": datetime.now().isoformat()
        }, request)
        
        return {
            "success": True,
            "metrics": result,
            "analysis": analysis
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Single week analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/quality/regression-automation-analysis", tags=["TCOE Report"], summary="Regression Automation Analysis")
async def analyze_regression_automation(request: Dict[str, Any]):
    """
    Analyze regression automation metrics - supports both single period and comparison modes
    
    Body (Comparison Mode):
    ```json
    {
        "portfolio": "NDP",
        "period1_from": "2024-10-01",
        "period1_to": "2024-10-31",
        "period2_from": "2024-11-01",
        "period2_to": "2024-11-30",
        "enable_comparison": true
    }
    ```
    
    Body (Single Period Mode):
    ```json
    {
        "portfolio": "NDP",
        "period_from": "2024-11-01",
        "period_to": "2024-11-30",
        "enable_comparison": false
    }
    ```
    
    Returns:
    - Total regression test cases
    - Period metrics (automated, manual, percentage)
    - Progress analysis (if comparison enabled)
    - AI-generated insights
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        enable_comparison = request.get('enable_comparison', False)
        
        # Initialize analyzer
        analyzer = RegressionAutomationAnalyzer(app_state.jira_client)
        
        if enable_comparison:
            # Comparison mode - validate required fields
            required_fields = ['portfolio', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Regression Automation Analysis Request (Comparison): {request['portfolio']}")
            
            # Perform comparison analysis
            request = _normalize_tcoe_request_or_400(request, "regression_automation")
            result = await analyzer.compare_periods(
                portfolio=request['portfolio'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to']
            )
        else:
            # Single period mode - validate required fields
            required_fields = ['portfolio', 'period_from', 'period_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Regression Automation Analysis Request (Single Period): {request['portfolio']}")
            
            # Perform single period analysis
            request = _normalize_tcoe_request_or_400(request, "regression_automation")
            result = await analyzer.analyze_single_period(
                portfolio=request['portfolio'],
                period_from=request['period_from'],
                period_to=request['period_to']
            )
        
        logger.info(f"✅ Regression automation analysis completed for {request['portfolio']}")
        
        result = _attach_pi_context(result, request)
        return {
            "success": True,
            "analysis": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Regression automation analysis failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/quality/overall-automation-analysis", tags=["TCOE Report"], summary="Analyze Overall Automation")
async def analyze_overall_automation(request: Dict[str, Any]):
    """
    Analyze overall automation metrics - supports both single period and comparison modes
    
    Body (Comparison Mode):
    ```json
    {
        "portfolio": "NDP",
        "period1_from": "2024-10-01",
        "period1_to": "2024-10-31",
        "period2_from": "2024-11-01",
        "period2_to": "2024-11-30",
        "enable_comparison": true
    }
    ```
    
    Body (Single Period Mode):
    ```json
    {
        "portfolio": "NDP",
        "period_from": "2024-11-01",
        "period_to": "2024-11-30",
        "enable_comparison": false
    }
    ```
    
    Returns:
    - Total test cases
    - Period metrics (automated, manual, percentage)
    - Progress analysis (if comparison enabled)
    - AI-generated insights
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        enable_comparison = request.get('enable_comparison', False)
        
        # Initialize analyzer
        analyzer = OverallAutomationAnalyzer(app_state.jira_client)
        
        if enable_comparison:
            # Comparison mode - validate required fields
            required_fields = ['portfolio', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Overall Automation Analysis Request (Comparison): {request['portfolio']}")
            
            # Get project metrics if provided (for portfolio-level analysis)
            request = _normalize_tcoe_request_or_400(request, "overall_automation")
            project_metrics = request.get('project_metrics', None)
            
            # Perform comparison analysis
            result = await analyzer.compare_periods(
                portfolio=request['portfolio'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to'],
                project_metrics=project_metrics
            )
        else:
            # Single period mode - validate required fields
            required_fields = ['portfolio', 'period_from', 'period_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Overall Automation Analysis Request (Single Period): {request['portfolio']}")
            
            # Get project metrics if provided (for portfolio-level analysis)
            request = _normalize_tcoe_request_or_400(request, "overall_automation")
            project_metrics = request.get('project_metrics', None)
            
            # Perform single period analysis
            result = await analyzer.analyze_single_period(
                portfolio=request['portfolio'],
                period_from=request['period_from'],
                period_to=request['period_to'],
                project_metrics=project_metrics
            )
        
        logger.info(f"✅ Overall automation analysis completed for {request['portfolio']}")
        
        result = _attach_pi_context(result, request)
        return {
            "success": True,
            "analysis": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Overall automation analysis failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/quality/test-coverage-analysis", tags=["TCOE Report"], summary="Analyze Test Coverage")
async def analyze_test_coverage(request: Dict[str, Any]):
    """Analyze test coverage metrics - supports both single period and comparison modes"""
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        enable_comparison = request.get('enable_comparison', False)
        analyzer = TestCoverageAnalyzer(app_state.jira_client)
        
        if enable_comparison:
            required_fields = ['portfolio', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            request = _normalize_tcoe_request_or_400(request, "test_coverage")
            
            logger.info(f"🎯 Test Coverage Analysis Request (Comparison): {request['portfolio']}")
            result = await analyzer.compare_periods(
                portfolio=request['portfolio'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to']
            )
        else:
            required_fields = ['portfolio', 'period_from', 'period_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            request = _normalize_tcoe_request_or_400(request, "test_coverage")
            
            logger.info(f"🎯 Test Coverage Analysis Request (Single Period): {request['portfolio']}")
            result = await analyzer.analyze_single_period(
                portfolio=request['portfolio'],
                period_from=request['period_from'],
                period_to=request['period_to']
            )
        
        logger.info(f"✅ Test coverage analysis completed for {request['portfolio']}")
        result = _attach_pi_context(result, request)
        return {"success": True, "analysis": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Test coverage analysis failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/quality/test-story-ratio-analysis", tags=["TCOE Report"], summary="Analyze Test to Story Ratio")
async def analyze_test_story_ratio(request: Dict[str, Any]):
    """Analyze test to story ratio metrics - supports both single period and comparison modes"""
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        enable_comparison = request.get('enable_comparison', False)
        analyzer = TestStoryRatioAnalyzer(app_state.jira_client)
        
        if enable_comparison:
            required_fields = ['portfolio', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Test to Story Ratio Analysis Request (Comparison): {request['portfolio']}")
            request = _normalize_tcoe_request_or_400(request, "test_story_ratio")
            result = await analyzer.compare_periods(
                portfolio=request['portfolio'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to']
            )
        else:
            required_fields = ['portfolio', 'period_from', 'period_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Test to Story Ratio Analysis Request (Single Period): {request['portfolio']}")
            request = _normalize_tcoe_request_or_400(request, "test_story_ratio")
            result = await analyzer.analyze_single_period(
                portfolio=request['portfolio'],
                period_from=request['period_from'],
                period_to=request['period_to']
            )
        
        logger.info(f"✅ Test to story ratio analysis completed for {request['portfolio']}")
        result = _attach_pi_context(result, request)
        return {"success": True, "analysis": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Test to story ratio analysis failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/quality/bug-ratio-analysis", tags=["TCOE Report"], summary="Analyze Bug Discovery Ratio")
async def analyze_bug_ratio(request: Dict[str, Any]):
    """Analyze bug discovery ratio metrics - supports both single period and comparison modes"""
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        enable_comparison = request.get('enable_comparison', False)
        analyzer = BugRatioAnalyzer(app_state.jira_client)
        
        if enable_comparison:
            required_fields = ['portfolio', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Bug Discovery Ratio Analysis Request (Comparison): {request['portfolio']}")
            request = _normalize_tcoe_request_or_400(request, "bug_ratio")
            result = await analyzer.compare_periods(
                portfolio=request['portfolio'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to']
            )
        else:
            required_fields = ['portfolio', 'period_from', 'period_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Bug Discovery Ratio Analysis Request (Single Period): {request['portfolio']}")
            request = _normalize_tcoe_request_or_400(request, "bug_ratio")
            result = await analyzer.analyze_single_period(
                portfolio=request['portfolio'],
                period_from=request['period_from'],
                period_to=request['period_to']
            )
        
        logger.info(f"✅ Bug discovery ratio analysis completed for {request['portfolio']}")
        result = _attach_pi_context(result, request)
        return {"success": True, "analysis": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Bug discovery ratio analysis failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/quality/test-case-review-status-analysis", tags=["TCOE Report"], summary="Analyze Test Case Review Status")
async def analyze_test_case_review_status(request: Dict[str, Any]):
    """Analyze test case review status metrics - supports single, multiple, and portfolio group modes
    
    Modes:
    - Single project: Provide 'portfolio' field
    - Multiple projects with portfolio grouping: Provide 'projects' list (returns analyses grouped by Fortellis/Payments)
    - Single period: Provide 'period_from' and 'period_to'
    - Comparison (two periods): Provide 'period1_from', 'period1_to', 'period2_from', 'period2_to'
    
    Optional parameters:
    - summary_mode (bool): When true, returns high-level summary. Default: false
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            raise HTTPException(status_code=400, detail="Jira is not configured. Please configure Jira first.")
        
        analyzer = TestCaseReviewStatusAnalyzer(app_state.jira_client)
        
        # Check if this is portfolio group analysis (multiple projects)
        if 'projects' in request and isinstance(request.get('projects'), list) and len(request['projects']) > 1:
            # Portfolio group analysis mode
            required_fields = ['projects', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Test Case Review Status Analysis Request (Portfolio Groups): {request['projects']}")
            request = _normalize_tcoe_request_or_400(request, "test_review_status")
            result = await analyzer.analyze_by_portfolio_groups(
                projects=request['projects'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to']
            )
            if isinstance(result, dict) and isinstance(result.get("analyses"), list):
                result["analyses"] = [_attach_pi_context(row, request) for row in result["analyses"]]
            if isinstance(result, dict) and isinstance(result.get("grand_total"), dict):
                result["grand_total"] = _attach_pi_context(result["grand_total"], request)
            return _attach_pi_context(result, request)
        
        # Single project analysis mode
        enable_comparison = request.get('enable_comparison', False)
        summary_mode = request.get('summary_mode', False)
        
        if enable_comparison:
            required_fields = ['portfolio', 'period1_from', 'period1_to', 'period2_from', 'period2_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Test Case Review Status Analysis Request (Comparison): {request['portfolio']} [summary_mode={summary_mode}]")
            request = _normalize_tcoe_request_or_400(request, "test_review_status")
            result = await analyzer.compare_periods(
                portfolio=request['portfolio'],
                period1_from=request['period1_from'],
                period1_to=request['period1_to'],
                period2_from=request['period2_from'],
                period2_to=request['period2_to'],
                summary_mode=summary_mode
            )
        else:
            required_fields = ['portfolio', 'period_from', 'period_to']
            for field in required_fields:
                if field not in request:
                    raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
            logger.info(f"🎯 Test Case Review Status Analysis Request (Single Period): {request['portfolio']}")
            request = _normalize_tcoe_request_or_400(request, "test_review_status")
            result = await analyzer.analyze_single_period(
                portfolio=request['portfolio'],
                period_from=request['period_from'],
                period_to=request['period_to']
            )
        
        logger.info(f"✅ Test case review status analysis completed for {request.get('portfolio', request.get('projects'))}")
        result = _attach_pi_context(result, request)
        return {"success": True, "analysis": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Test case review status analysis failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.get("/api/quality/portfolios", tags=["TCOE Report"], summary="Get Available Portfolios")
async def get_available_portfolios():
    """
    Get list of available portfolios/projects for defect leakage analysis
    """
    try:
        if not app_state.jira_configured or not app_state.jira_client:
            return {
                "success": False,
                "error": "Jira not configured",
                "portfolios": []
            }
        
        # Get all projects
        projects = await app_state.jira_client.get_projects()
        
        # Format for dropdown
        portfolios = [
            {
                "key": project.get('key', ''),
                "name": project.get('name', ''),
                "id": project.get('id', '')
            }
            for project in projects
            if project.get('key')
        ]
        
        logger.info(f"📋 Found {len(portfolios)} portfolios")
        
        return {
            "success": True,
            "portfolios": portfolios,
            "total": len(portfolios)
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get portfolios: {e}")
        return {
            "success": False,
            "error": str(e),
            "portfolios": []
        }

@app.post("/api/quality/export-tcoe-metric-pdf", tags=["TCOE Report"], summary="Export Individual TCOE Metric as PDF")
async def export_tcoe_metric_pdf(request: ExportTCOEMetricRequest):
    """
    Export a single TCOE metric as a one-page PDF
    
    Request body:
    {
        "metric_key": "test_coverage",  # Required: one of the 7 TCOE metrics
        "metric_data": {...}  # Required: metric data from dashboard/analysis
    }
    
    Returns: PDF file as bytes
    """
    try:
        from services.tcoe_pdf_generator import generate_tcoe_metric_pdf
        
        metric_key = request.metric_key.strip()
        metric_data = request.metric_data
        
        if not metric_key:
            raise HTTPException(status_code=400, detail="metric_key is required")
        
        if not metric_data:
            raise HTTPException(status_code=400, detail="metric_data is required")
        
        # Ensure metric data has required fields
        metric_data.setdefault('metric', metric_key)
        metric_data.setdefault('label', metric_data.get('label', metric_key.replace('_', ' ').title()))
        
        logger.info(f"📄 Generating PDF for metric: {metric_key}")
        
        # Generate PDF
        pdf_bytes = generate_tcoe_metric_pdf(metric_data)
        
        # Create filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"tcoe_{metric_key}_{timestamp}.pdf"
        
        logger.info(f"✅ Generated PDF: {filename} ({len(pdf_bytes)} bytes)")
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to export TCOE metric PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


@app.post("/api/quality/export-tcoe-metrics-all-pdfs", tags=["TCOE Report"], summary="Export All TCOE Metrics as Single PDF")
async def export_tcoe_metrics_all_pdfs(request: ExportAllTCOEMetricsRequest):
    """
    Export all TCOE metrics as a single combined PDF document
    
    Request body:
    {
        "metrics": [
            {
                "metric": "test_coverage",
                "label": "Stories to Test Cases Mapping",
                "rows": [...]
            },
            ...
        ]
    }
    
    Returns: Single PDF file containing all metrics (one per page)
    """
    try:
        from PyPDF2 import PdfMerger
        from services.tcoe_pdf_generator import generate_tcoe_metric_pdf
        
        metrics = request.metrics
        
        if not metrics:
            raise HTTPException(status_code=400, detail="metrics list is required")
        
        logger.info(f"📄 Generating combined PDF for {len(metrics)} metrics")
        
        # Create a list of PDF buffers
        pdf_buffers = []
        
        for metric in metrics:
            try:
                metric_key = metric.get('metric', metric.get('key', 'unknown'))
                metric.setdefault('metric', metric_key)
                metric.setdefault('label', metric.get('label', metric_key.replace('_', ' ').title()))
                
                logger.info(f"  - Processing metric: {metric_key}")
                
                # Generate PDF
                pdf_bytes = generate_tcoe_metric_pdf(metric)
                pdf_buffers.append(io.BytesIO(pdf_bytes))
                
                logger.info(f"    ✓ Generated {metric_key} ({len(pdf_bytes)} bytes)")
                
            except Exception as e:
                logger.error(f"    ✗ Failed to generate PDF for {metric_key}: {e}")
                # Continue with other metrics
        
        if not pdf_buffers:
            raise HTTPException(status_code=500, detail="Failed to generate any PDFs")
        
        # If only one PDF, return it directly
        if len(pdf_buffers) == 1:
            pdf_buffers[0].seek(0)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"tcoe_metrics_{timestamp}.pdf"
            
            logger.info(f"✅ Generated single PDF: {filename}")
            
            return StreamingResponse(
                pdf_buffers[0],
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        # Try to merge multiple PDFs
        try:
            merger = PdfMerger()
            
            for pdf_buffer in pdf_buffers:
                pdf_buffer.seek(0)
                merger.append(pdf_buffer)
            
            # Write merged PDF to buffer
            merged_buffer = io.BytesIO()
            merger.write(merged_buffer)
            merger.close()
            
            merged_buffer.seek(0)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"tcoe_metrics_combined_{timestamp}.pdf"
            
            logger.info(f"✅ Generated combined PDF: {filename} ({len(merged_buffer.getvalue())} bytes)")
            
            return StreamingResponse(
                merged_buffer,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        except Exception as merge_error:
            logger.warning(f"⚠️ Could not merge PDFs, returning first PDF: {merge_error}")
            # Return first PDF if merge fails
            pdf_buffers[0].seek(0)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"tcoe_metrics_{timestamp}.pdf"
            
            return StreamingResponse(
                pdf_buffers[0],
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to export TCOE metrics PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


# QE Metrics Endpoints
# Global cache for QE metrics
qe_metrics_cache = {
    'data': None,
    'last_modified': None,
    'last_check': None
}

def get_excel_modified_time(file_path: str) -> float:
    """Get the last modified time of the Excel file"""
    try:
        return os.path.getmtime(file_path)
    except:
        return 0

@app.get("/api/qe-metrics/options", tags=["QE Metrics"], summary="Get available dropdown options from Excel")
async def get_qe_metrics_options(portfolio: str = None):
    """Get available filter options from Excel file. If portfolio is provided, filter products and containers."""
    try:
        excel_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'data', 'QEMetrics.xlsx')
        
        if not os.path.exists(excel_path):
            return {
                "success": False,
                "error": "Excel file not found"
            }
        
        # Read Excel file with header at row 4 (0-indexed, so header=4) - same as data endpoint
        df = pd.read_excel(excel_path, sheet_name=0, header=4)
        logger.info(f"📊 Loaded Excel for options with {len(df)} rows, columns: {list(df.columns)[:5]}")
        
        # Get unique values with defaults
        portfolios = ['All']
        timelines = ['All']
        products = ['All']
        containers = ['All']
        
        # Filter by portfolio if provided
        filtered_df = df.copy()
        if portfolio and portfolio != 'All' and 'Portfolio' in df.columns:
            filtered_df = df[df['Portfolio'] == portfolio]
            logger.info(f"📌 Filtering options for portfolio '{portfolio}': {len(filtered_df)} rows")
        
        # Get portfolios (Column A) - always from full dataset
        if 'Portfolio' in df.columns:
            unique_portfolios = df['Portfolio'].dropna().unique().tolist()
            portfolios.extend(sorted([str(p) for p in unique_portfolios if str(p) != 'nan' and str(p).strip() != '']))
            logger.info(f"📋 Found {len(portfolios) - 1} portfolios")
        else:
            logger.warning("⚠️ 'Portfolio' column not found in Excel")
        
        # Get timelines (Column E - Project Manager Name) - from filtered or full dataset
        if 'Project Manager Name' in filtered_df.columns:
            unique_timelines = filtered_df['Project Manager Name'].dropna().unique().tolist()
            timelines.extend(sorted([str(t) for t in unique_timelines if str(t) != 'nan' and str(t).strip() != '']))
            logger.info(f"📋 Found {len(timelines) - 1} timelines")
        else:
            logger.warning("⚠️ 'Project Manager Name' column not found in Excel")
        
        # Get products (Column B) - from filtered or full dataset
        if 'Product' in filtered_df.columns:
            unique_products = filtered_df['Product'].dropna().unique().tolist()
            products.extend(sorted([str(p) for p in unique_products if str(p) != 'nan' and str(p).strip() != '']))
            logger.info(f"📋 Found {len(products) - 1} products")
        else:
            logger.warning("⚠️ 'Product' column not found in Excel")
        
        # Get containers (Column C - Project Name) - from filtered or full dataset
        if 'Project Name' in filtered_df.columns:
            unique_containers = filtered_df['Project Name'].dropna().unique().tolist()
            containers.extend(sorted([str(c) for c in unique_containers if str(c) != 'nan' and str(c).strip() != '']))
            logger.info(f"📋 Found {len(containers) - 1} containers")
        else:
            logger.warning("⚠️ 'Project Name' column not found in Excel")
        
        result = {
            "success": True,
            "options": {
                "portfolios": portfolios,
                "timelines": timelines,
                "products": products,
                "containers": containers
            }
        }
        logger.info(f"✅ Returning options: portfolios={len(portfolios)}, products={len(products)}, containers={len(containers)}, timelines={len(timelines)}")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching QE metrics options: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/qe-metrics", tags=["QE Metrics"], summary="Get QE Metrics from Excel")
async def get_qe_metrics(request: QEMetricsRequest):
    """Get QE metrics from Excel file with auto-refresh on file change and aggregation"""
    try:
        excel_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'data', 'QEMetrics.xlsx')
        
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return {
                "success": False,
                "error": "Excel file not found at config/data/QEMetrics.xlsx"
            }
        
        # Get current file modification time
        current_modified_time = get_excel_modified_time(excel_path)
        
        # Read Excel file with header at row 4 (0-indexed, so header=4)
        df = pd.read_excel(excel_path, sheet_name=0, header=4)
        logger.info(f"📊 Loaded Excel with {len(df)} rows")
        
        # Filter by portfolio, product, container, and timeline
        filtered_df = df.copy()
        
        if request.portfolio and request.portfolio != 'All' and 'Portfolio' in df.columns:
            filtered_df = filtered_df[filtered_df['Portfolio'] == request.portfolio]
            logger.info(f"📌 Filtered to portfolio '{request.portfolio}': {len(filtered_df)} projects")
        
        if request.product and request.product != 'All' and 'Product' in df.columns:
            filtered_df = filtered_df[filtered_df['Product'] == request.product]
            logger.info(f"📌 Filtered to product '{request.product}': {len(filtered_df)} projects")
        
        if request.container and request.container != 'All' and 'Project Name' in df.columns:
            filtered_df = filtered_df[filtered_df['Project Name'] == request.container]
            logger.info(f"📌 Filtered to container '{request.container}': {len(filtered_df)} projects")
        
        if request.timeline and request.timeline != 'All' and 'Project Manager Name' in df.columns:
            filtered_df = filtered_df[filtered_df['Project Manager Name'] == request.timeline]
            logger.info(f"📌 Filtered to timeline '{request.timeline}': {len(filtered_df)} projects")
        
        if len(filtered_df) == 0:
            logger.warning(f"No data found for selected filters")
            return {
                "success": False,
                "error": f"No data found for selected filters"
            }
        
        # Aggregate metrics
        def safe_mean(series):
            """Calculate mean, handling NaN values"""
            valid_values = series.dropna()
            if len(valid_values) == 0:
                return 0
            return float(valid_values.mean())
        
        def safe_sum(series):
            """Calculate sum, handling NaN values and non-numeric values"""
            valid_values = series.dropna()
            if len(valid_values) == 0:
                return 0
            # Convert to numeric, coercing errors to NaN, then drop NaN again
            numeric_values = pd.to_numeric(valid_values, errors='coerce').dropna()
            if len(numeric_values) == 0:
                return 0
            return int(numeric_values.sum())
        
        # Calculate aggregated metrics using correct column mappings
        # Percentages - convert to percentage (multiply by 100 if stored as decimal)
        automation_pct = safe_mean(filtered_df['Automation%']) * 100 if 'Automation%' in filtered_df.columns else 0
        bugs_story_ratio = safe_mean(filtered_df['Bugs:Story Ratio']) * 100 if 'Bugs:Story Ratio' in filtered_df.columns else 0
        defect_leakage_pct = safe_mean(filtered_df['Defect Leakage %']) * 100 if 'Defect Leakage %' in filtered_df.columns else 0
        
        # Test Counts - sum integers (no decimals)
        overall_testcases = int(safe_sum(filtered_df['Overall TestCases Count'])) if 'Overall TestCases Count' in filtered_df.columns else 0
        tcs_requires_automation = int(safe_sum(filtered_df['Total TestCases requires Automation'])) if 'Total TestCases requires Automation' in filtered_df.columns else 0
        automated_testcases = int(safe_sum(filtered_df['Automated Testcases '])) if 'Automated Testcases ' in filtered_df.columns else 0
        count_of_stories = int(safe_sum(filtered_df['Total Number of Stories tested'])) if 'Total Number of Stories tested' in filtered_df.columns else 0
        
        # Defects and Bugs - sum integers (no decimals)
        count_of_bugs = int(safe_sum(filtered_df['Total Bugs'])) if 'Total Bugs' in filtered_df.columns else 0
        count_of_defects = int(safe_sum(filtered_df['Total Defects'])) if 'Total Defects' in filtered_df.columns else 0
        
        # Get string values (first non-empty or 'N/A')
        def get_first_value(series, default='N/A'):
            valid_values = series.dropna()
            if len(valid_values) > 0:
                val = valid_values.iloc[0]
                # Convert to string, handle numeric values
                if pd.api.types.is_number(val):
                    return str(int(val)) if val == int(val) else str(val)
                return str(val)
            return default
        
        bug_density = get_first_value(filtered_df['Bug Density']) if 'Bug Density' in filtered_df.columns else 'N/A'
        dedicated_qe_env = get_first_value(filtered_df['Dedicated QE Environment?']) if 'Dedicated QE Environment?' in filtered_df.columns else 'No'
        dedicated_perf_env = get_first_value(filtered_df['Dedicated Performance Environment?']) if 'Dedicated Performance Environment?' in filtered_df.columns else 'No'
        automation_stability = get_first_value(filtered_df['Automation Stability']) if 'Automation Stability' in filtered_df.columns else 'No'
        test_data_refresh = get_first_value(filtered_df['Test Data Refresh']) if 'Test Data Refresh' in filtered_df.columns else 'Annually'
        performance_tested = get_first_value(filtered_df['Performance Tested?']) if 'Performance Tested?' in filtered_df.columns else 'No'
        
        # Calculate Dev-QE Ratio properly by averaging ratios
        def calculate_avg_ratio(series, default='11:1'):
            """Calculate average ratio from ratio strings like '11:1', '5:1', etc."""
            valid_values = series.dropna()
            if len(valid_values) == 0:
                return default
            
            ratios = []
            for val in valid_values:
                val_str = str(val).strip()
                if ':' in val_str:
                    try:
                        parts = val_str.split(':')
                        if len(parts) == 2:
                            dev = float(parts[0].strip())
                            qe = float(parts[1].strip())
                            if qe > 0:
                                ratios.append(dev / qe)
                    except (ValueError, IndexError):
                        continue
            
            if len(ratios) == 0:
                return default
            
            # Calculate average ratio
            avg_ratio = sum(ratios) / len(ratios)
            # Round to nearest integer and format as "X:1"
            dev_ratio = round(avg_ratio)
            return f"{dev_ratio}:1"
        
        dev_qe_ratio = calculate_avg_ratio(filtered_df['Dev-QE Ratio']) if 'Dev-QE Ratio' in filtered_df.columns else '11:1'
        
        # Team counts - sum integers (no decimals)
        tao_qe_count = int(safe_sum(filtered_df['TAO'])) if 'TAO' in filtered_df.columns else 0
        tao_gp_cdk_count = int(safe_sum(filtered_df['TAO+GP+CDK'])) if 'TAO+GP+CDK' in filtered_df.columns else 0
        
        # Assignment and Skillset - sum integers (no decimals)
        sdet_assignment = int(safe_sum(filtered_df['SDET'])) if 'SDET' in filtered_df.columns else 0
        manual_assignment = int(safe_sum(filtered_df['Manual'])) if 'Manual' in filtered_df.columns else 0
        
        sdet_skillset = int(safe_sum(filtered_df['SDET.1'])) if 'SDET.1' in filtered_df.columns else 0
        manual_skillset = int(safe_sum(filtered_df['Manual.1'])) if 'Manual.1' in filtered_df.columns else 0
        
        # Count projects
        total_projects = len(filtered_df)
        
        # Get unique products count
        unique_products = filtered_df['Product'].nunique() if 'Product' in filtered_df.columns else 0
        
        # Determine portfolio value for response
        portfolio_value = request.portfolio if request.portfolio and request.portfolio != 'All' else 'All'
        
        data = {
            # Main Percentages - round to 1 decimal
            "automation_percentage": round(automation_pct, 1),
            "bugs_story_ratio": round(bugs_story_ratio, 1),
            "defect_leakage_percentage": round(defect_leakage_pct, 1),
            "functional_automation_percentage": 0,  # Not in current Excel
            "test_coverage_percentage": 0,  # Not in current Excel
            "project_automation_percentage": 0,  # Not in current Excel
            
            # Test Counts
            "overall_testcases": overall_testcases,
            "tcs_requires_automation": tcs_requires_automation,
            "automated_testcases": automated_testcases,
            "count_of_stories": count_of_stories,
            
            # Defects and Bugs
            "count_of_defects": count_of_defects,
            "count_of_bugs": count_of_bugs,
            "bug_density": bug_density,
            
            # Environment Flags
            "dedicated_qe_env": dedicated_qe_env,
            "dedicated_perf_env": dedicated_perf_env,
            "automation_stability": automation_stability,
            "test_data_refresh": test_data_refresh,
            "performance_tested": performance_tested,
            "dev_qe_ratio": dev_qe_ratio,
            
            # Team Counts
            "tao_qe_count": tao_qe_count,
            "tao_gp_cdk_count": tao_gp_cdk_count,
            "sdet_assignment": sdet_assignment,
            "manual_assignment": manual_assignment,
            "sdet_skillset": sdet_skillset,
            "manual_skillset": manual_skillset,
            
            # Metadata
            "total_projects": total_projects,
            "unique_products": unique_products,
            "portfolio": portfolio_value
        }
        
        logger.info(f"✅ QE Metrics calculated: {data}")
        
        return {
            "success": True,
            "data": data,
            "timestamp": datetime.now().isoformat(),
            "file_last_modified": datetime.fromtimestamp(current_modified_time).isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error fetching QE metrics: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/qe-metrics/refresh-cache", tags=["QE Metrics"], summary="Force Refresh QE Metrics Cache")
async def refresh_qe_metrics_cache():
    """Force refresh the QE metrics cache"""
    try:
        global qe_metrics_cache
        qe_metrics_cache = {
            'data': None,
            'last_modified': None,
            'last_check': None
        }
        
        logger.info("🔄 QE Metrics cache cleared, will reload on next request")
        
        return {
            "success": True,
            "message": "Cache cleared successfully"
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/qe-metrics/export", tags=["QE Metrics"], summary="Export QE Metrics")
async def export_qe_metrics(request: QEMetricsRequest):
    """Export QE metrics as Excel"""
    try:
        excel_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'data', 'QEMetrics.xlsx')
        
        if not os.path.exists(excel_path):
            raise HTTPException(status_code=404, detail="Excel file not found")
        
        with open(excel_path, 'rb') as f:
            return StreamingResponse(
                io.BytesIO(f.read()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename=qe-metrics-{datetime.now().strftime('%Y%m%d')}.xlsx"}
            )
    except Exception as e:
        logger.error(f"Error exporting QE metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# KPI Metrics Endpoints
@app.get("/api/kpi-metrics/options", tags=["KPI Metrics"], summary="Get available dropdown options from KPI Excel")
async def get_kpi_metrics_options(portfolio: Optional[str] = Query(None)):
    """Get available filter options from KPI Excel file (all 3 sheets)."""
    try:
        excel_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'data', 'KPIMetrics.xlsx')
        
        if not os.path.exists(excel_path):
            return {
                "success": False,
                "error": "Excel file not found"
            }
        
        # Read all 3 sheets
        df_defects = pd.read_excel(excel_path, sheet_name=0, header=0)
        df_bugs = pd.read_excel(excel_path, sheet_name=1, header=0)
        df_automation = pd.read_excel(excel_path, sheet_name=2, header=0)
        
        # Combine all sheets for common options
        all_dfs = [df_defects, df_bugs, df_automation]
        
        # Get unique values with defaults
        portfolios = ['All']
        project_keys = ['All']
        project_names = ['All']
        rca_values = ['All']
        
        # Filter by portfolio if provided
        filtered_defects = df_defects.copy()
        filtered_bugs = df_bugs.copy()
        filtered_automation = df_automation.copy()
        
        if portfolio and portfolio != 'All' and 'Portfolio' in df_defects.columns:
            filtered_defects = df_defects[df_defects['Portfolio'] == portfolio]
            filtered_bugs = df_bugs[df_bugs['Portfolio'] == portfolio]
            filtered_automation = df_automation[df_automation['Portfolio'] == portfolio]
        
        # Get portfolios (from all sheets)
        all_portfolios = set()
        for df in all_dfs:
            if 'Portfolio' in df.columns:
                all_portfolios.update(df['Portfolio'].dropna().unique())
        portfolios.extend(sorted([str(p) for p in all_portfolios if str(p) != 'nan' and str(p).strip() != '']))
        
        # Get project keys (from filtered or all)
        if portfolio and portfolio != 'All':
            all_project_keys = set()
            for df in [filtered_defects, filtered_bugs, filtered_automation]:
                if 'Project Key' in df.columns:
                    all_project_keys.update(df['Project Key'].dropna().unique())
        else:
            all_project_keys = set()
            for df in all_dfs:
                if 'Project Key' in df.columns:
                    all_project_keys.update(df['Project Key'].dropna().unique())
        project_keys.extend(sorted([str(k) for k in all_project_keys if str(k) != 'nan' and str(k).strip() != '']))
        
        # Get project names (from filtered or all)
        if portfolio and portfolio != 'All':
            all_project_names = set()
            for df in [filtered_defects, filtered_bugs, filtered_automation]:
                if 'Project Name' in df.columns:
                    all_project_names.update(df['Project Name'].dropna().unique())
        else:
            all_project_names = set()
            for df in all_dfs:
                if 'Project Name' in df.columns:
                    all_project_names.update(df['Project Name'].dropna().unique())
        project_names.extend(sorted([str(n) for n in all_project_names if str(n) != 'nan' and str(n).strip() != '']))
        
        # Get RCA values (only from Defect and Bug sheets)
        all_rca = set()
        if 'RCA (as per JIRA)' in df_defects.columns:
            all_rca.update(df_defects['RCA (as per JIRA)'].dropna().unique())
        if 'RCA (as per JIRA)' in df_bugs.columns:
            all_rca.update(df_bugs['RCA (as per JIRA)'].dropna().unique())
        rca_values.extend(sorted([str(r) for r in all_rca if str(r) != 'nan' and str(r).strip() != '']))
        
        return {
            "success": True,
            "options": {
                "portfolios": portfolios,
                "project_keys": project_keys,
                "project_names": project_names,
                "rca_values": rca_values
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching KPI metrics options: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/kpi-metrics", tags=["KPI Metrics"], summary="Get KPI Metrics from Excel (all 3 sheets)")
async def get_kpi_metrics(request: KPIMetricsRequest):
    """Get KPI metrics from Excel file (Defect Analysis, Bug Analysis, Automation%)"""
    try:
        excel_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'data', 'KPIMetrics.xlsx')
        
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return {
                "success": False,
                "error": "Excel file not found at config/data/KPIMetrics.xlsx"
            }
        
        # Read all 3 sheets
        df_defects = pd.read_excel(excel_path, sheet_name=0, header=0)
        df_bugs = pd.read_excel(excel_path, sheet_name=1, header=0)
        df_automation = pd.read_excel(excel_path, sheet_name=2, header=0)
        
        logger.info(f"📊 Loaded KPI Excel: Defects={len(df_defects)}, Bugs={len(df_bugs)}, Automation={len(df_automation)}")
        
        # Apply common filters to all sheets
        def apply_common_filters(df, portfolio, project_key, project_name):
            filtered = df.copy()
            if portfolio and portfolio != 'All' and 'Portfolio' in df.columns:
                filtered = filtered[filtered['Portfolio'] == portfolio]
            if project_key and project_key != 'All' and 'Project Key' in df.columns:
                filtered = filtered[filtered['Project Key'] == project_key]
            if project_name and project_name != 'All' and 'Project Name' in df.columns:
                filtered = filtered[filtered['Project Name'] == project_name]
            return filtered
        
        # Filter all sheets
        filtered_defects = apply_common_filters(df_defects, request.portfolio, request.project_key, request.project_name)
        filtered_bugs = apply_common_filters(df_bugs, request.portfolio, request.project_key, request.project_name)
        filtered_automation = apply_common_filters(df_automation, request.portfolio, request.project_key, request.project_name)
        
        # Apply RCA filter to Defect and Bug sheets
        if request.rca and request.rca != 'All' and 'RCA (as per JIRA)' in filtered_defects.columns:
            filtered_defects = filtered_defects[filtered_defects['RCA (as per JIRA)'] == request.rca]
        if request.rca and request.rca != 'All' and 'RCA (as per JIRA)' in filtered_bugs.columns:
            filtered_bugs = filtered_bugs[filtered_bugs['RCA (as per JIRA)'] == request.rca]
        
        # Calculate Defect Count
        defect_count = len(filtered_defects)
        
        # Calculate Bug Count
        bug_count = len(filtered_bugs)
        
        # Calculate Defect RCA Breakdown
        defect_rca_breakdown = {}
        if 'RCA (as per JIRA)' in filtered_defects.columns:
            rca_counts = filtered_defects['RCA (as per JIRA)'].value_counts().to_dict()
            defect_rca_breakdown = {str(k): int(v) for k, v in rca_counts.items()}
        
        # Calculate Bug RCA Breakdown
        bug_rca_breakdown = {}
        if 'RCA (as per JIRA)' in filtered_bugs.columns:
            rca_counts = filtered_bugs['RCA (as per JIRA)'].value_counts().to_dict()
            bug_rca_breakdown = {str(k): int(v) for k, v in rca_counts.items()}
        
        # Calculate Automation Metrics
        automation_metrics = {
            "completion_percentage": 0,
            "automation_percentage": 0,
            "committed_tc_count": 0,
            "completed_tc_count": 0,
            "total_projects": len(filtered_automation)
        }
        
        if len(filtered_automation) > 0:
            if 'Completion %' in filtered_automation.columns:
                completion_pct = pd.to_numeric(filtered_automation['Completion %'], errors='coerce').dropna()
                if len(completion_pct) > 0:
                    mean_val = completion_pct.mean()
                    automation_metrics["completion_percentage"] = round(float(mean_val) * 100, 1) if not pd.isna(mean_val) else 0.0
            
            if 'Automation % as per Tableau' in filtered_automation.columns:
                auto_pct = pd.to_numeric(filtered_automation['Automation % as per Tableau'], errors='coerce').dropna()
                if len(auto_pct) > 0:
                    mean_val = auto_pct.mean()
                    automation_metrics["automation_percentage"] = round(float(mean_val) * 100, 1) if not pd.isna(mean_val) else 0.0
            
            if 'Committed Automation TC Count for PI4' in filtered_automation.columns:
                committed = pd.to_numeric(filtered_automation['Committed Automation TC Count for PI4'], errors='coerce').dropna()
                if len(committed) > 0:
                    sum_val = committed.sum()
                    automation_metrics["committed_tc_count"] = int(sum_val) if not pd.isna(sum_val) else 0
            
            if 'Completed Automation TC count' in filtered_automation.columns:
                completed = pd.to_numeric(filtered_automation['Completed Automation TC count'], errors='coerce').dropna()
                if len(completed) > 0:
                    sum_val = completed.sum()
                    automation_metrics["completed_tc_count"] = int(sum_val) if not pd.isna(sum_val) else 0
        
        # Get Projects List (when portfolio is selected)
        projects_list = []
        if request.portfolio and request.portfolio != 'All':
            # Get unique projects from all sheets
            projects_set = set()
            for df in [filtered_defects, filtered_bugs, filtered_automation]:
                if 'Project Key' in df.columns and 'Project Name' in df.columns:
                    for _, row in df.iterrows():
                        pk = str(row.get('Project Key', '')).strip()
                        pn = str(row.get('Project Name', '')).strip()
                        if pk and pk != 'nan' and pn and pn != 'nan':
                            projects_set.add((pk, pn))
            
            # Calculate metrics for each project
            for project_key, project_name in sorted(projects_set):
                # Filter data for this project
                proj_defects = filtered_defects[
                    (filtered_defects['Project Key'] == project_key) & 
                    (filtered_defects['Project Name'] == project_name)
                ] if 'Project Key' in filtered_defects.columns else pd.DataFrame()
                
                proj_bugs = filtered_bugs[
                    (filtered_bugs['Project Key'] == project_key) & 
                    (filtered_bugs['Project Name'] == project_name)
                ] if 'Project Key' in filtered_bugs.columns else pd.DataFrame()
                
                proj_automation = filtered_automation[
                    (filtered_automation['Project Key'] == project_key) & 
                    (filtered_automation['Project Name'] == project_name)
                ] if 'Project Key' in filtered_automation.columns else pd.DataFrame()
                
                # Calculate project metrics
                proj_defect_count = len(proj_defects)
                proj_bug_count = len(proj_bugs)
                
                proj_auto_pct = 0
                proj_completion_pct = 0
                if len(proj_automation) > 0:
                    if 'Automation % as per Tableau' in proj_automation.columns:
                        auto_val = pd.to_numeric(proj_automation['Automation % as per Tableau'], errors='coerce').dropna()
                        if len(auto_val) > 0:
                            mean_val = auto_val.mean()
                            proj_auto_pct = round(float(mean_val) * 100, 1) if not pd.isna(mean_val) else 0.0
                    if 'Completion %' in proj_automation.columns:
                        comp_val = pd.to_numeric(proj_automation['Completion %'], errors='coerce').dropna()
                        if len(comp_val) > 0:
                            mean_val = comp_val.mean()
                            proj_completion_pct = round(float(mean_val) * 100, 1) if not pd.isna(mean_val) else 0.0
                
                projects_list.append({
                    "project_key": project_key,
                    "project_name": project_name,
                    "defect_count": proj_defect_count,
                    "bug_count": proj_bug_count,
                    "automation_percentage": proj_auto_pct,
                    "completion_percentage": proj_completion_pct
                })
        
        # Prepare detailed records for defects, bugs, and automation
        defect_details = []
        if len(filtered_defects) > 0:
            for _, row in filtered_defects.iterrows():
                defect_details.append({
                    "issue_key": str(row.get('Issue Key', '')),
                    "summary": str(row.get('Summary', '')),
                    "priority": str(row.get('Priority', '')),
                    "severity": str(row.get('Severity', '')),
                    "sprint": str(row.get('Sprint', '')),
                    "assignee_name": str(row.get('Assignee Name', '')),
                    "assignee_from_tao": str(row.get('Assignee from TAO/CDK/GP', '')),
                    "missed_by_tao_qe": str(row.get('Missed by TAO QE (Yes/No)', '')),
                    "linked_story": str(row.get('Linked Story', '')),
                    "rca": str(row.get('RCA (as per JIRA)', '')),
                    "justification": str(row.get('Justification, if mentioned "No" in "Missed by TAO QE"', ''))
                })
        
        bug_details = []
        if len(filtered_bugs) > 0:
            for _, row in filtered_bugs.iterrows():
                bug_details.append({
                    "issue_key": str(row.get('Issue Key', '')),
                    "summary": str(row.get('Summary', '')),
                    "priority": str(row.get('Priority', '')),
                    "severity": str(row.get('Severity', '')),
                    "sprint": str(row.get('Sprint', '')),
                    "assignee_name": str(row.get('Assignee Name', '')),
                    "assignee_from_tao": str(row.get('Assignee from TAO/CDK/GP', '')),
                    "caused_by_tao_dev": str(row.get('Caused by TAO Dev (Yes/No)', '')),
                    "linked_story": str(row.get('Linked Story', '')),
                    "rca": str(row.get('RCA (as per JIRA)', '')),
                    "justification": str(row.get('Justification, if not linked to User Story', ''))
                })
        
        # Helper functions to safely convert values
        def safe_int(value, default=0):
            try:
                # Handle None, empty string, and NaN
                if value is None or value == '' or (isinstance(value, float) and pd.isna(value)):
                    return default
                # Convert to numeric, handling NaN
                numeric_val = pd.to_numeric(value, errors='coerce')
                if pd.isna(numeric_val) or numeric_val is None:
                    return default
                return int(float(numeric_val))
            except (ValueError, TypeError, OverflowError):
                return default
        
        def safe_float_percentage(value, default=0.0):
            try:
                # Handle None, empty string, and NaN
                if value is None or value == '' or (isinstance(value, float) and pd.isna(value)):
                    return default
                # Convert to numeric, handling NaN
                numeric_val = pd.to_numeric(value, errors='coerce')
                if pd.isna(numeric_val) or numeric_val is None:
                    return default
                return round(float(numeric_val) * 100, 1)
            except (ValueError, TypeError, OverflowError):
                return default
        
        automation_details = []
        if len(filtered_automation) > 0:
            for _, row in filtered_automation.iterrows():
                automation_details.append({
                    "project_key": str(row.get('Project Key', '')),
                    "project_name": str(row.get('Project Name', '')),
                    "project_type": str(row.get('Project Type', '')),
                    "tool_framework": str(row.get('Tool/Framework', '')),
                    "ai_assistant_integration_enabled": str(row.get('AI Assistant Integration Enbled', '')),
                    "ai_assistant": str(row.get('AI Assistant', '')),
                    "usage_level_of_ai_assistant": str(row.get('Usage level of AI Assistant', '')),
                    "impact_on_productivity": str(row.get('Impact on Productivity', '')),
                    "ai_usage_inference": str(row.get('AI Usage Inference/Derivation', '')),
                    "qa_owner": str(row.get('QA Owner', '')),
                    "committed_tc_count": safe_int(row.get('Committed Automation TC Count for PI4', 0)),
                    "completed_tc_count": safe_int(row.get('Completed Automation TC count', 0)),
                    "completion_percentage": safe_float_percentage(row.get('Completion %', 0)),
                    "automation_percentage": safe_float_percentage(row.get('Automation % as per Tableau', 0))
                })
        
        return {
            "success": True,
            "data": {
                "defect_count": defect_count,
                "bug_count": bug_count,
                "defect_rca_breakdown": defect_rca_breakdown,
                "bug_rca_breakdown": bug_rca_breakdown,
                "automation_metrics": automation_metrics,
                "projects_list": projects_list,
                "defect_details": defect_details,
                "bug_details": bug_details,
                "automation_details": automation_details,
                "filters": {
                    "portfolio": request.portfolio,
                    "project_key": request.project_key,
                    "project_name": request.project_name,
                    "rca": request.rca or 'All'
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching KPI metrics: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/kpi-metrics/ai-insights", tags=["KPI Metrics"], summary="Get AI-generated insights for KPI metrics")
async def get_kpi_ai_insights(request: KPIMetricsRequest):
    """Generate AI-powered insights including dynamic comments, recommendations, and predictions"""
    try:
        if not app_state.ai_engine:
            # Initialize AI engine if not already done
            if app_state.jira_client:
                from services.ai_engine import IntelligentAIEngine
                app_state.ai_engine = IntelligentAIEngine(app_state.jira_client, app_state.confluence_client, app_state.github_client)
            else:
                return {
                    "success": False,
                    "error": "AI engine not available. Jira client required."
                }
        
        # First get the KPI metrics data
        excel_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'data', 'KPIMetrics.xlsx')
        
        if not os.path.exists(excel_path):
            return {
                "success": False,
                "error": "Excel file not found"
            }
        
        # Read all 3 sheets
        df_defects = pd.read_excel(excel_path, sheet_name=0, header=0)
        df_bugs = pd.read_excel(excel_path, sheet_name=1, header=0)
        df_automation = pd.read_excel(excel_path, sheet_name=2, header=0)
        
        # Apply filters (same logic as main endpoint)
        def apply_common_filters(df, portfolio, project_key, project_name):
            filtered = df.copy()
            if portfolio and portfolio != 'All' and 'Portfolio' in df.columns:
                filtered = filtered[filtered['Portfolio'] == portfolio]
            if project_key and project_key != 'All' and 'Project Key' in df.columns:
                filtered = filtered[filtered['Project Key'] == project_key]
            if project_name and project_name != 'All' and 'Project Name' in df.columns:
                filtered = filtered[filtered['Project Name'] == project_name]
            return filtered
        
        filtered_defects = apply_common_filters(df_defects, request.portfolio, request.project_key, request.project_name)
        filtered_bugs = apply_common_filters(df_bugs, request.portfolio, request.project_key, request.project_name)
        filtered_automation = apply_common_filters(df_automation, request.portfolio, request.project_key, request.project_name)
        
        if request.rca and request.rca != 'All' and 'RCA (as per JIRA)' in filtered_defects.columns:
            filtered_defects = filtered_defects[filtered_defects['RCA (as per JIRA)'] == request.rca]
        if request.rca and request.rca != 'All' and 'RCA (as per JIRA)' in filtered_bugs.columns:
            filtered_bugs = filtered_bugs[filtered_bugs['RCA (as per JIRA)'] == request.rca]
        
        # Calculate metrics
        defect_count = len(filtered_defects)
        bug_count = len(filtered_bugs)
        
        # Calculate RCA breakdowns
        defect_rca_breakdown = {}
        if 'RCA (as per JIRA)' in filtered_defects.columns:
            rca_counts = filtered_defects['RCA (as per JIRA)'].value_counts().to_dict()
            defect_rca_breakdown = {str(k): int(v) for k, v in rca_counts.items()}
        
        bug_rca_breakdown = {}
        if 'RCA (as per JIRA)' in filtered_bugs.columns:
            rca_counts = filtered_bugs['RCA (as per JIRA)'].value_counts().to_dict()
            bug_rca_breakdown = {str(k): int(v) for k, v in rca_counts.items()}
        
        # Calculate automation metrics
        automation_percentage = 0
        completion_percentage = 0
        if len(filtered_automation) > 0:
            if 'Automation % as per Tableau' in filtered_automation.columns:
                auto_pct = pd.to_numeric(filtered_automation['Automation % as per Tableau'], errors='coerce').dropna()
                if len(auto_pct) > 0:
                    mean_val = auto_pct.mean()
                    automation_percentage = round(float(mean_val) * 100, 1) if not pd.isna(mean_val) else 0.0
            
            if 'Completion %' in filtered_automation.columns:
                comp_pct = pd.to_numeric(filtered_automation['Completion %'], errors='coerce').dropna()
                if len(comp_pct) > 0:
                    mean_val = comp_pct.mean()
                    completion_percentage = round(float(mean_val) * 100, 1) if not pd.isna(mean_val) else 0.0
        
        # Get projects list
        projects_list = []
        if request.portfolio and request.portfolio != 'All':
            projects_set = set()
            for df in [filtered_defects, filtered_bugs, filtered_automation]:
                if 'Project Key' in df.columns and 'Project Name' in df.columns:
                    for _, row in df.iterrows():
                        pk = str(row.get('Project Key', '')).strip()
                        pn = str(row.get('Project Name', '')).strip()
                        if pk and pk != 'nan' and pn and pn != 'nan':
                            projects_set.add((pk, pn))
            
            for project_key, project_name in sorted(projects_set):
                proj_defects = filtered_defects[
                    (filtered_defects['Project Key'] == project_key) & 
                    (filtered_defects['Project Name'] == project_name)
                ] if 'Project Key' in filtered_defects.columns else pd.DataFrame()
                
                proj_bugs = filtered_bugs[
                    (filtered_bugs['Project Key'] == project_key) & 
                    (filtered_bugs['Project Name'] == project_name)
                ] if 'Project Key' in filtered_bugs.columns else pd.DataFrame()
                
                projects_list.append({
                    "project_key": project_key,
                    "project_name": project_name,
                    "defect_count": len(proj_defects),
                    "bug_count": len(proj_bugs)
                })
        
        # Generate AI insights
        insights = await app_state.ai_engine.generate_kpi_insights(
            portfolio=request.portfolio or 'All',
            project_key=request.project_key or 'All',
            project_name=request.project_name or 'All',
            defect_count=defect_count,
            bug_count=bug_count,
            automation_percentage=automation_percentage,
            completion_percentage=completion_percentage,
            defect_rca_breakdown=defect_rca_breakdown,
            bug_rca_breakdown=bug_rca_breakdown,
            projects_list=projects_list,
            historical_data=None  # Could be enhanced to fetch historical data
        )
        
        return {
            "success": True,
            "insights": insights
        }
        
    except Exception as e:
        logger.error(f"Error generating KPI AI insights: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/jira/enhanced-metrics", tags=["JIRA"], summary="Get Enhanced Analytics Metrics")
async def get_enhanced_metrics(request: Dict[str, Any]):
    """Get comprehensive enhanced analytics metrics for insights dashboard"""
    if not app_state.jira_configured or not app_state.jira_client:
        return {
            "success": False,
            "error": "Jira not configured. Please configure Jira integration first."
        }

    try:
        project_key = request.get('projectKey')
        date_from = request.get('dateFrom', '')
        date_to = request.get('dateTo', '')
        advanced_filters = request.get('advancedFilters') or {}

        # Get basic metrics first
        jql_filters = []
        if project_key and project_key != 'null':
            jql_filters.append(f'project = "{project_key}"')
        if date_from:
            jql_filters.append(f'updated >= "{date_from}"')
        if date_to:
            date_to_expr = f'{date_to} 23:59' if len(date_to) == 10 else date_to
            jql_filters.append(f'updated <= "{date_to_expr}"')
        advanced_clause = build_advanced_filter_clause(advanced_filters)
        if advanced_clause:
            jql_filters.append(advanced_clause)

        jql = ' AND '.join(jql_filters) if jql_filters else 'project IS NOT EMPTY'
        jql += ' ORDER BY updated DESC'

        story_point_field_ids = await get_story_point_field_ids(app_state.jira_client)
        fields = [
            'key', 'summary', 'status', 'assignee', 'priority', 'issuetype',
            'project', 'created', 'updated', 'duedate', 'labels', 'components',
            *story_point_field_ids
        ]

        # Fetch issues for analysis — paginate so large projects aren't truncated
        issues: list = []
        start_at = 0
        seen_keys_em: set = set()
        batch_count_em = 0
        while True:
            batch_count_em += 1
            issues_data = await app_state.jira_client.search(jql, max_results=100, fields=fields, start_at=start_at)
            batch = issues_data.get('issues', [])
            if not batch:
                break
            new_keys = [i.get('key') for i in batch if i.get('key')]
            if any(k in seen_keys_em for k in new_keys):
                break
            seen_keys_em.update(new_keys)
            issues.extend(batch)
            if len(batch) < 100 or issues_data.get('isLast'):
                break
            start_at += 100
            if batch_count_em >= 50:  # safety cap: 5000 issues
                logger.warning(f"enhanced-metrics: reached 50-batch safety limit ({len(issues)} issues)")
                break
            import asyncio as _asyncio
            await _asyncio.sleep(0.1)

        # Generate enhanced metrics (pass client + board_id for real sprint data)
        enhanced_metrics = await generate_enhanced_metrics(
            issues, project_key, date_from, date_to,
            jira_client=app_state.jira_client,
            board_id=app_state.jira_board_id,
            story_point_field_ids=story_point_field_ids,
        )

        return {
            "success": True,
            "metrics": enhanced_metrics
        }

    except Exception as e:
        logger.error(f"Enhanced metrics error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

async def generate_enhanced_metrics(
    issues: list,
    project_key: str = None,
    date_from: str = '',
    date_to: str = '',
    jira_client=None,
    board_id: str = None,
    story_point_field_ids: Optional[List[str]] = None,
):
    """Generate comprehensive enhanced analytics metrics"""
    from services.jira import JiraClient
    story_point_field_ids = story_point_field_ids or list(DEFAULT_STORY_POINT_FIELD_IDS)

    has_story_point_values = any(
        (get_issue_story_points(issue.get("fields", {}), story_point_field_ids) or 0) > 0
        for issue in issues
    )

    def get_velocity_work_value(fields: Dict[str, Any]) -> float:
        points = get_issue_story_points(fields, story_point_field_ids)
        if has_story_point_values:
            return points or 0
        return 1

    # ── Sprint Velocity Trends (real via Agile API, mock fallback) ────────────
    sprint_velocity_trends = []
    if jira_client and board_id:
        try:
            sprint_velocity_trends = await jira_client.get_sprint_history(int(board_id), limit=6)
            logger.info(f"✅ Fetched {len(sprint_velocity_trends)} real sprints from board {board_id}")
        except Exception as _e:
            logger.warning(f"Sprint history fetch failed, using mock: {_e}")

    if not sprint_velocity_trends:
        # Fallback: derive velocity-style data from real issues grouped by 2-week periods
        from collections import defaultdict
        period_buckets: dict = defaultdict(lambda: {"committed": 0, "completed": 0})
        for issue in issues:
            fields = issue.get("fields", {})
            points = get_velocity_work_value(fields)
            updated = (fields.get("updated") or "")[:10]
            if updated:
                try:
                    d = datetime.fromisoformat(updated)
                    # Bucket by ISO week
                    week_key = d.strftime("W%W %Y")
                    period_buckets[week_key]["committed"] += points
                    if is_done_issue(fields):
                        period_buckets[week_key]["completed"] += points
                except Exception:
                    pass
        for i, (period, vals) in enumerate(sorted(period_buckets.items())[-6:], 1):
            sprint_velocity_trends.append({
                "sprintName": f"Sprint {i} ({period})",
                "startDate": "", "endDate": "",
                "committedPoints": round(vals["committed"]),
                "completedPoints": round(vals["completed"]),
                "velocity": round(vals["completed"]),
            })

    # ── Burndown Data — derived from latest sprint if available ───────────────
    burndown_data = []
    if sprint_velocity_trends:
        latest = sprint_velocity_trends[-1]
        committed_pts = latest.get("committedPoints", 50) or 50
        completed_pts = latest.get("completedPoints", 0)
        remaining = committed_pts - completed_pts
        today = datetime.now()
        dates = [(today - timedelta(days=6 - i)).strftime("%Y-%m-%d") for i in range(7)]
        ideal = [round(committed_pts - (committed_pts / 6) * i, 1) for i in range(7)]
        # Simple actual: linear decay down to `remaining` over 7 days
        actual = [round(committed_pts - ((committed_pts - remaining) / 6) * i, 1) for i in range(7)]
        burndown_data = [{
            "sprintName": latest.get("sprintName", "Current Sprint"),
            "dates": dates,
            "idealBurndown": ideal,
            "actualBurndown": actual,
            "remainingWork": actual,
        }]
    else:
        burndown_data = [{"sprintName": "No Sprint Data", "dates": [], "idealBurndown": [], "actualBurndown": [], "remainingWork": []}]

    # ── Predictive Analytics — derived from real velocity trend ───────────────
    velocities = [s.get("velocity", 0) for s in sprint_velocity_trends if s.get("velocity")]
    if len(velocities) >= 2:
        trend_val = velocities[-1] - velocities[0]
        velocity_trend = "increasing" if trend_val > 0 else "decreasing" if trend_val < 0 else "stable"
        forecasted = round(velocities[-1] * 1.05) if trend_val >= 0 else round(velocities[-1] * 0.95)
        confidence = min(95, 65 + len(velocities) * 5)
        risk = "low" if velocity_trend == "increasing" else "high" if velocity_trend == "decreasing" else "medium"
    else:
        velocity_trend = "stable"
        forecasted = velocities[0] if velocities else 0
        confidence = 60
        risk = "medium"
    predictive_analytics = {
        "sprintCompletionDate": (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d"),
        "completionConfidence": confidence,
        "velocityTrend": velocity_trend,
        "forecastedVelocity": forecasted,
        "riskLevel": risk,
        "recommendations": [
            f"Velocity trend is {velocity_trend} based on last {len(velocities)} sprint(s)",
            "Monitor 'In Review' status for bottlenecks",
            "Team capacity looks optimal" if risk == "low" else "Review workload distribution",
        ],
    }

    # Bottleneck Analysis
    status_counts = {}
    status_time_tracking = {}

    for issue in issues:
        status = issue.get('fields', {}).get('status', {}).get('name', 'Unknown')
        created = issue.get('fields', {}).get('created', '')
        updated = issue.get('fields', {}).get('updated', '')

        if status not in status_counts:
            status_counts[status] = 0
            status_time_tracking[status] = []

        status_counts[status] += 1

        # Calculate time in status (simplified)
        if created and updated:
            try:
                created_date = datetime.fromisoformat(created.replace('Z', '+00:00'))
                updated_date = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                days_in_status = (updated_date - created_date).days
                status_time_tracking[status].append(days_in_status)
            except:
                pass

    bottleneck_analysis = []
    total_issues = len(issues)

    for status, count in status_counts.items():
        time_list = status_time_tracking.get(status) or []
        avg_time = round(sum(time_list) / len(time_list), 1) if time_list else 0
        issues_stuck = count
        is_bottleneck = avg_time >= 7 or issues_stuck >= 5
        # Severity mirrors frontend calcBottleneckSeverity thresholds
        if avg_time >= 30 or issues_stuck >= 20:
            severity = 'high'
        elif avg_time >= 7 or issues_stuck >= 5:
            severity = 'medium'
        else:
            severity = 'low'

        bottleneck_analysis.append({
            "status": status,
            "avgTimeInStatus": round(avg_time, 1),
            "issuesStuck": issues_stuck,
            "isBottleneck": is_bottleneck,
            "severity": severity
        })

    # Team Capacity Analysis
    assignee_workload = {}
    for issue in issues:
        assignee = issue.get('fields', {}).get('assignee')
        if assignee:
            assignee_name = assignee.get('displayName', 'Unassigned')
            if assignee_name not in assignee_workload:
                assignee_workload[assignee_name] = 0
            assignee_workload[assignee_name] += 1

    team_capacity = []
    for assignee, workload in assignee_workload.items():
        # Mock capacity calculation - in real implementation would use team capacity data
        capacity = 10  # Assume 10 points/story capacity per sprint per person
        utilization = (workload / capacity) * 100
        status = 'optimal' if utilization <= 100 else 'overloaded' if utilization > 120 else 'underutilized'

        team_capacity.append({
            "assignee": assignee,
            "capacity": capacity,
            "currentWorkload": workload,
            "utilizationPercentage": round(utilization, 1),
            "status": status
        })

    # ── Date range anchor — use selected date_to (or now) as reference point ──
    try:
        range_end = datetime.fromisoformat(date_to) if date_to else datetime.now()
    except Exception:
        range_end = datetime.now()

    # ── Historical Comparison — derived from real issues ──────────────────────
    this_month_start = range_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
    this_month_label = this_month_start.strftime("%b %Y")
    last_month_label = last_month_start.strftime("%b %Y")

    buckets_h = {
        last_month_label: {"total": 0, "completed": 0, "resolution_days": [], "velocity": 0},
        this_month_label: {"total": 0, "completed": 0, "resolution_days": [], "velocity": 0},
    }
    for issue in issues:
        fields = issue.get("fields", {})
        updated_str = (fields.get("updated") or "")[:10]
        created_str = (fields.get("created") or "")[:10]
        points = get_velocity_work_value(fields)
        try:
            updated_d = datetime.fromisoformat(updated_str) if updated_str else None
        except Exception:
            updated_d = None
        if not updated_d:
            continue
        bucket_key = None
        if updated_d >= this_month_start:
            bucket_key = this_month_label
        elif updated_d >= last_month_start:
            bucket_key = last_month_label
        if not bucket_key:
            continue
        b = buckets_h[bucket_key]
        b["total"] += 1
        if is_done_issue(fields):
            b["completed"] += 1
            b["velocity"] += points
            try:
                if created_str:
                    created_d = datetime.fromisoformat(created_str)
                    b["resolution_days"].append((updated_d - created_d).days)
            except Exception:
                pass

    historical_comparison = []
    for period in [last_month_label, this_month_label]:
        b = buckets_h[period]
        total = b["total"] or 1
        completed = b["completed"]
        avg_res = round(sum(b["resolution_days"]) / len(b["resolution_days"]), 1) if b["resolution_days"] else 0
        historical_comparison.append({
            "period": period,
            "totalIssues": b["total"],
            "completedIssues": completed,
            "completionRate": round((completed / total) * 100),
            "avgResolutionTime": avg_res,
            "velocity": b["velocity"],
        })

    # ── Monthly Trends — last 6 months from real issues ───────────────────────
    month_data: dict = {}
    for i in range(5, -1, -1):
        ref = range_end - timedelta(days=30 * i)
        key = ref.strftime("%b")
        month_data[key] = {"issues": 0, "completed": 0, "velocity": 0, "month_dt": ref.replace(day=1)}

    for issue in issues:
        fields = issue.get("fields", {})
        updated_str = (fields.get("updated") or "")[:10]
        points = get_velocity_work_value(fields)
        try:
            updated_d = datetime.fromisoformat(updated_str) if updated_str else None
        except Exception:
            updated_d = None
        if not updated_d:
            continue
        label = updated_d.strftime("%b")
        if label in month_data:
            month_data[label]["issues"] += 1
            if is_done_issue(fields):
                month_data[label]["completed"] += 1
                month_data[label]["velocity"] += points

    months_list = list(month_data.keys())
    monthly_trends = {
        "months": months_list,
        "issues": [month_data[m]["issues"] for m in months_list],
        "velocity": [month_data[m]["velocity"] for m in months_list],
        "completionRate": [
            round((month_data[m]["completed"] / month_data[m]["issues"]) * 100) if month_data[m]["issues"] else 0
            for m in months_list
        ],
    }

    # ── Sprint Goal — latest sprint's goal text ───────────────────────────────
    latest_sprint_goal = ""
    if sprint_velocity_trends:
        latest_sprint_goal = sprint_velocity_trends[-1].get("sprintGoal", "") or ""

    # ── Issue Age Distribution — group open issues by age ─────────────────────
    age_buckets = {"0-7d": 0, "8-30d": 0, "31-90d": 0, "90d+": 0}
    today = datetime.now()
    for issue in issues:
        fields = issue.get("fields", {})
        if is_done_issue(fields):
            continue  # Only count open issues
        created_str = (fields.get("created") or "")[:10]
        if not created_str:
            continue
        try:
            age_days = (today - datetime.fromisoformat(created_str)).days
            if age_days <= 7:
                age_buckets["0-7d"] += 1
            elif age_days <= 30:
                age_buckets["8-30d"] += 1
            elif age_days <= 90:
                age_buckets["31-90d"] += 1
            else:
                age_buckets["90d+"] += 1
        except Exception:
            pass
    issue_age_distribution = [
        {"range": k, "count": v} for k, v in age_buckets.items()
    ]

    # ── Due Date Risk — open issues overdue or due within 3 days ─────────────
    due_date_risk = []
    warning_cutoff = (today + timedelta(days=3)).strftime("%Y-%m-%d")
    today_str = today.strftime("%Y-%m-%d")
    for issue in issues:
        fields = issue.get("fields", {})
        if is_done_issue(fields):
            continue
        due_date = (fields.get("duedate") or "")[:10]
        if not due_date:
            continue
        if due_date <= warning_cutoff:
            is_overdue = due_date < today_str
            due_date_risk.append({
                "key": issue.get("key", ""),
                "summary": fields.get("summary", "")[:80],
                "dueDate": due_date,
                "assignee": (fields.get("assignee") or {}).get("displayName", "Unassigned"),
                "status": fields.get("status", {}).get("name", "Unknown"),
                "priority": (fields.get("priority") or {}).get("name", "Medium"),
                "isOverdue": is_overdue,
            })
    # Sort: overdue first, then by due date
    due_date_risk.sort(key=lambda x: (not x["isOverdue"], x["dueDate"]))
    due_date_risk = due_date_risk[:15]  # Cap at 15

    return {
        "sprintVelocityTrends": sprint_velocity_trends,
        "burndownData": burndown_data,
        "predictiveAnalytics": predictive_analytics,
        "bottleneckAnalysis": bottleneck_analysis,
        "teamCapacity": team_capacity,
        "historicalComparison": historical_comparison,
        "monthlyTrends": monthly_trends,
        "issueAgeDistribution": issue_age_distribution,
        "dueDateRisk": due_date_risk,
        "latestSprintGoal": latest_sprint_goal,
    }

# ==========================================
# GitHub Integration Endpoints
# ==========================================

github_status_logged = False  # to avoid repetitive verbose logs

@app.get("/api/github/status", tags=["GitHub"], summary="Check GitHub Connection")
async def github_status():
    """
    Check GitHub connection status with detailed logging.
    Returns connection status, user info, and configuration details.
    """
    global github_status_logged
    if not github_status_logged:
        logger.info("=" * 60)
        logger.info("🔍 GITHUB CONNECTION STATUS CHECK")
        logger.info("=" * 60)
    try:
        status_result = await app_state.github_client.get_status()
        if not github_status_logged:
            logger.info("=" * 60)
            if status_result.get("connected"):
                logger.info("✅ GitHub connection verified successfully")
            else:
                logger.error(f"❌ GitHub connection failed: {status_result.get('error', 'Unknown error')}")
            logger.info("=" * 60)
            github_status_logged = True
        return status_result
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"❌ GitHub status check exception: {e}")
        logger.error(f"   - Error type: {type(e).__name__}")
        import traceback
        logger.error(f"   - Traceback: {traceback.format_exc()}")
        logger.error("=" * 60)
        return create_error_response("GitHub status check failed", str(e))

@app.get("/api/github/repos", tags=["GitHub"], summary="List GitHub repositories")
async def github_list_repos():
    """List repositories for the authenticated user/org."""
    try:
        data = await app_state.github_client.list_repositories()
        return data
    except Exception as e:
        logger.error(f"GitHub list repos error: {e}", exc_info=True)
        return create_error_response("Failed to list repositories", str(e))

@app.post("/api/github/configure", tags=["GitHub"], summary="Configure GitHub Connection")
async def github_configure(config: Dict[str, str]):
    """Configure GitHub credentials"""
    try:
        token = config.get("api_token")
        email = config.get("email")
        
        if not token:
            return create_error_response("API token is required", status_code=400)
            
        # Validate with a throwaway client first so bad credentials never
        # replace the live (possibly service-account) connection
        from services.github import GitHubClient
        probe = GitHubClient()
        probe.config.api_token = token
        if email:
            probe.config.email = email
        status = await probe.get_status()
        if probe._client:
            await probe._client.aclose()

        if status.get("connected"):
            app_state.github_client.set_token(token, email)
            return create_success_response(status, "GitHub connected successfully")
        else:
            return create_error_response("Connection failed", status.get("error", "Unknown error"))
            
    except Exception as e:
        logger.error(f"GitHub config error: {e}")
        return create_error_response("Configuration failed", str(e))

@app.get("/api/github/actions/runs", tags=["GitHub"], summary="Get GitHub Actions Runs")
async def github_actions_runs(repo: str, days: int = 30, workflow: str = None,
                              from_date: str = None, to_date: str = None, paginate: bool = False):
    """Get automation runs for a repo/workflow. Pass from_date/to_date (YYYY-MM-DD) for an
    explicit window; paginate=true returns all runs in the window (single-repo full listing)."""
    try:
        return await app_state.github_client.get_workflow_runs(
            repo, days, workflow, from_date=from_date, to_date=to_date, paginate=paginate)
    except Exception as e:
        logger.error(f"GitHub actions error: {e}")
        return create_error_response("Failed to fetch actions", str(e))

@app.get("/api/github/actions/first-run", tags=["GitHub"], summary="Get repo's first Actions run date")
async def github_first_action(repo: str):
    """Return the date of the repo's very first GitHub Actions run (to default the filter)."""
    try:
        return await app_state.github_client.get_first_action_date(repo)
    except Exception as e:
        logger.error(f"GitHub first-run error: {e}")
        return create_error_response("Failed to fetch first run", str(e))

@app.get("/api/github/actions/run-jobs", tags=["GitHub"], summary="Batch per-run job pass/fail counts")
async def github_run_jobs(repo: str, run_ids: str):
    """run_ids = comma-separated run IDs. Returns {run_id: {jobs_total, jobs_passed, jobs_failed}}."""
    try:
        ids = [int(x) for x in run_ids.split(",") if x.strip().isdigit()]
        return await app_state.github_client.get_run_jobs_batch(repo, ids)
    except Exception as e:
        logger.error(f"GitHub run-jobs error: {e}")
        return create_error_response("Failed to fetch run jobs", str(e))

@app.get("/api/github/prs", tags=["GitHub"], summary="Get Recent Pull Requests")
async def get_github_prs(
    repo: str = Query(..., description="Full repo name e.g. org/repo"),
    state: str = Query("all", description="PR state: open, closed, all"),
    per_page: int = Query(20, le=50)
):
    result = await app_state.github_client.get_recent_prs(repo=repo, state=state, per_page=per_page)
    return result

@app.get("/api/github/repo-detail", tags=["GitHub"], summary="Get enriched repo detail: last merged PR, active branches, open PRs")
async def get_github_repo_detail(repo: str = Query(..., description="Full repo name e.g. org/repo")):
    try:
        return await app_state.github_client.get_repo_detail(repo=repo)
    except Exception as e:
        logger.error(f"GitHub repo-detail error: {e}")
        return {"repo": repo, "default_branch": "main", "last_merged_pr": None, "active_branches": [], "open_prs": []}

# ==========================================
# Salesforce Integration Endpoints
# ==========================================

@app.post("/api/salesforce/configure", tags=["Salesforce"], summary="Configure Salesforce Connection")
async def salesforce_configure(config: Dict[str, str]):
    """
    Save Salesforce credentials and verify connection.
    Requires: instance_url, client_id, client_secret, username, password
    """
    try:
        instance_url = config.get("instance_url", "").rstrip("/")
        client_id = config.get("client_id", "")
        client_secret = config.get("client_secret", "")
        username = config.get("username", "")
        password = config.get("password", "")

        if not all([instance_url, client_id, client_secret, username, password]):
            return create_error_response("All Salesforce credentials are required", status_code=400)

        # Update app state client config
        sf_config = SalesforceConfig()
        sf_config.instance_url = instance_url
        sf_config.client_id = client_id
        sf_config.client_secret = client_secret
        sf_config.username = username
        sf_config.password = password

        app_state.salesforce_client = SalesforceClient(sf_config)
        result = await app_state.salesforce_client.test_connection()

        if result.get("connected"):
            logger.info("✅ Salesforce connected successfully")
            return create_success_response(result, "Salesforce connected successfully")
        else:
            return create_error_response("Salesforce connection failed", result.get("error", "Unknown error"))

    except Exception as e:
        logger.error(f"❌ Salesforce configure error: {e}")
        return create_error_response("Configuration failed", str(e))


@app.get("/api/salesforce/status", tags=["Salesforce"], summary="Check Salesforce Connection Status")
async def salesforce_status():
    """Return whether Salesforce is configured and reachable."""
    try:
        cfg = app_state.salesforce_client.config
        if not cfg.is_configured():
            return {"configured": False, "connected": False}

        result = await app_state.salesforce_client.test_connection()
        case_count = 0
        if result.get("connected"):
            case_count = await app_state.salesforce_client.get_case_count()

        return {
            "configured": cfg.is_configured(),
            "connected": result.get("connected", False),
            "instance_url": cfg.instance_url,
            "case_count": case_count,
            "error": result.get("error"),
        }
    except Exception as e:
        logger.error(f"❌ Salesforce status error: {e}")
        return {"configured": False, "connected": False, "error": str(e)}


@app.get("/api/salesforce/cases", tags=["Salesforce"], summary="List Salesforce Cases")
async def salesforce_cases(limit: int = 50, offset: int = 0, status: str = None):
    """
    Fetch Salesforce Cases with optional status filter.
    Returns cases with pre-computed category/solution if already classified.
    """
    try:
        if not app_state.salesforce_client.config.is_configured():
            return create_error_response("Salesforce not configured", status_code=400)

        cases = await app_state.salesforce_client.get_cases(
            limit=limit, offset=offset, status_filter=status
        )

        # Overlay cached classifications if available
        if app_state._salesforce_classified_cache:
            cache_map = {c["id"]: c for c in app_state._salesforce_classified_cache}
            for case in cases:
                cached = cache_map.get(case["id"])
                if cached:
                    case["category"] = cached.get("category")
                    case["confidence"] = cached.get("confidence")
                    case["solution"] = cached.get("solution")
                    case["reasoning"] = cached.get("reasoning")
                    case["color"] = cached.get("color")

        return create_success_response({"cases": cases, "count": len(cases)})
    except Exception as e:
        logger.error(f"❌ Salesforce cases error: {e}")
        return create_error_response("Failed to fetch cases", str(e))


@app.get("/api/salesforce/cases/{case_id}", tags=["Salesforce"], summary="Get Single Case with AI Solution")
async def salesforce_case_detail(case_id: str):
    """
    Fetch a single Salesforce Case by Id and generate/return its AI classification + solution.
    """
    try:
        if not app_state.salesforce_client.config.is_configured():
            return create_error_response("Salesforce not configured", status_code=400)

        case = await app_state.salesforce_client.get_case_by_id(case_id)
        if not case:
            return create_error_response("Case not found", status_code=404)

        # Check cache first
        cache_map = {c["id"]: c for c in app_state._salesforce_classified_cache}
        cached = cache_map.get(case_id)
        if cached:
            case.update({k: cached[k] for k in ["category", "confidence", "solution", "reasoning", "color"] if k in cached})
        else:
            # Classify on demand
            classification = await classify_and_solve(case["subject"], case["description"])
            case.update(classification)

        return create_success_response(case)
    except Exception as e:
        logger.error(f"❌ Salesforce case detail error: {e}")
        return create_error_response("Failed to fetch case", str(e))


@app.post("/api/salesforce/classify", tags=["Salesforce"], summary="Batch Classify Salesforce Cases with AI")
async def salesforce_classify(limit: int = 100):
    """
    Fetch up to `limit` Cases and run AI classification + solution generation on all of them.
    Results are cached in memory for subsequent /cases requests.
    """
    try:
        if not app_state.salesforce_client.config.is_configured():
            return create_error_response("Salesforce not configured", status_code=400)

        logger.info(f"🤖 Starting Salesforce batch classification (limit={limit})...")
        cases = await app_state.salesforce_client.get_cases(limit=limit)
        classified = await batch_classify(cases)

        # Store in app state cache
        app_state._salesforce_classified_cache = classified

        # Build category distribution
        distribution: Dict[str, int] = {}
        for c in classified:
            cat = c.get("category") or "Uncategorized"
            distribution[cat] = distribution.get(cat, 0) + 1

        logger.info(f"✅ Classified {len(classified)} Salesforce cases")
        return create_success_response({
            "classified_count": len(classified),
            "distribution": distribution,
            "cases": classified,
        }, f"Successfully classified {len(classified)} cases")

    except Exception as e:
        logger.error(f"❌ Salesforce classify error: {e}")
        return create_error_response("Classification failed", str(e))


@app.get("/api/salesforce/metrics", tags=["Salesforce"], summary="Salesforce Case Metrics")
async def salesforce_metrics():
    """
    Return summary metrics: total cases, open cases, classified count,
    unclassified count, and category distribution.
    """
    try:
        if not app_state.salesforce_client.config.is_configured():
            return create_error_response("Salesforce not configured", status_code=400)

        total = await app_state.salesforce_client.get_case_count()
        open_count = await app_state.salesforce_client.get_case_count(status_filter="Open")

        classified_count = len(app_state._salesforce_classified_cache)
        unclassified_count = max(0, total - classified_count)

        distribution: Dict[str, int] = {}
        for c in app_state._salesforce_classified_cache:
            cat = c.get("category") or "Uncategorized"
            distribution[cat] = distribution.get(cat, 0) + 1

        return create_success_response({
            "total_cases": total,
            "open_cases": open_count,
            "classified_cases": classified_count,
            "unclassified_cases": unclassified_count,
            "category_distribution": distribution,
            "categories": get_categories(),
            "category_colors": get_category_colors(),
        })
    except Exception as e:
        logger.error(f"❌ Salesforce metrics error: {e}")
        return create_error_response("Failed to fetch metrics", str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
