"""
FalconX Backend Services Module

This module exports all business logic services for the FalconX backend.
"""

# Import all services for easier access
try:
    from .jira import JiraClient
except ImportError:
    JiraClient = None

try:
    from .confluence import ConfluenceConfig
except ImportError:
    ConfluenceConfig = None

try:
    from .ai_engine import IntelligentAIEngine
except ImportError:
    IntelligentAIEngine = None

try:
    from .chatbot_engine import AdvancedChatbotEngine, QueryIntent
except ImportError:
    AdvancedChatbotEngine = None
    QueryIntent = None

try:
    from .analytics import AdvancedAnalyticsEngine
except ImportError:
    AdvancedAnalyticsEngine = None

try:
    from .jql_processor import EnhancedJQLProcessor, ResponseFormat
except ImportError:
    EnhancedJQLProcessor = None
    ResponseFormat = None

try:
    from .router import intent_router
except ImportError:
    intent_router = None

try:
    from .entity_extractor import extract_entities
except ImportError:
    extract_entities = None

try:
    from .summarizer import summarize_text
except ImportError:
    summarize_text = None

try:
    from .rag_handler import query_rag_endpoint
except ImportError:
    query_rag_endpoint = None

__all__ = [
    'JiraClient',
    'ConfluenceConfig',
    'IntelligentAIEngine',
    'AdvancedChatbotEngine',
    'QueryIntent',
    'AdvancedAnalyticsEngine',
    'EnhancedJQLProcessor',
    'ResponseFormat',
    'intent_router',
    'extract_entities',
    'summarize_text',
    'query_rag_endpoint',
]
