"""
Adaptive Response Engine
Decides response mode based on user query intent
Supports HTML formatting with theme-aware colors
"""
import logging
from typing import Dict, List, Any, Optional
from services.unified_rag_handler import UnifiedRAGHandler, SourceType
from services.enhanced_issue_analyzer import EnhancedIssueAnalyzer
from theme.colors import get_theme

logger = logging.getLogger(__name__)

def requires_deep_analysis(query: str) -> bool:
    """
    Determine if user query requires deep engineering analysis.
    
    Returns True only if query contains explicit analysis keywords.
    Otherwise returns False for simple factual queries.
    """
    query_lower = query.lower()
    
    # Analysis keywords that trigger deep analysis
    analysis_keywords = [
        'why',                    # "why is it failing"
        'root cause',             # "root cause analysis"
        'analysis',               # "give me analysis"
        'analyse',                # British spelling
        'explain',                # "explain the issue"
        'give fix',               # "give fix for this"
        'how to fix',             # "how to fix this"
        'engineering fix',        # "engineering fix"
        'what is causing',        # "what is causing this"
        'why is it failing',      # "why is it failing"
        'debug',                  # "debug this issue"
        'rca',                    # "rca for this"
        'postmortem',             # "postmortem"
        'deep dive',              # "deep dive into"
        'technical explanation',  # "technical explanation"
        'recommendation',        # "recommendations"
        'recommendations',        # plural
        'fix suggestion',        # "fix suggestions"
        'how can we fix',        # "how can we fix"
        'what should we do',     # "what should we do"
        'troubleshoot',          # "troubleshoot"
        'investigate',           # "investigate"
        'diagnose',              # "diagnose"
    ]
    
    # Check if any analysis keyword exists in query
    return any(keyword in query_lower for keyword in analysis_keywords)

class AdaptiveResponseEngine:
    """Adaptive response engine that decides response mode"""
    
    def __init__(self, ai_client=None, model: str = "gpt-4o-mini"):
        self.ai_client = ai_client
        self.model = model
    
    async def generate_dynamic_insight(self, issue_fields: Dict, user_query: str) -> str:
        """
        Generate dynamic AI insight - fresh every time, no templates
        Limited to maximum 3 lines for simple responses
        """
        if not self.ai_client:
            return "Review this issue for context and next steps."
        
        try:
            prompt = f"""Create a concise insight summarizing this issue's context. 
It must be fresh each time and not use templates. Be specific and actionable.
CRITICAL: Maximum 3 lines. Keep it brief and focused.

Issue fields: {issue_fields}
User query: {user_query}

Provide a brief, intelligent insight about this issue in maximum 3 lines."""
            
            response = self.ai_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a concise technical advisor. Generate fresh, specific insights in maximum 3 lines. Be brief and focused."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=150
            )
            
            insight = response.choices[0].message.content.strip()
            
            # Enforce 3-line maximum by truncating if needed
            lines = insight.split('\n')
            if len(lines) > 3:
                insight = '\n'.join(lines[:3])
                # Remove any trailing incomplete sentences
                if insight and not insight[-1] in '.!?':
                    # Find last complete sentence
                    last_period = insight.rfind('.')
                    last_exclamation = insight.rfind('!')
                    last_question = insight.rfind('?')
                    last_sentence_end = max(last_period, last_exclamation, last_question)
                    if last_sentence_end > 0:
                        insight = insight[:last_sentence_end + 1]
            
            return insight
        except Exception as e:
            logger.warning(f"Failed to generate dynamic insight: {e}")
            return "Review this issue for context and next steps."
    
    async def _generate_simple_with_insight(self, results: List[Dict], user_query: str, theme: Dict[str, str]) -> str:
        """Helper to generate simple response with async insight generation"""
        # Generate insight for single issue
        if len(results) == 1:
            issue = results[0]
            fields = issue.get('fields', {})
            insight = await self.generate_dynamic_insight(fields, user_query)
            
            # Build response with insight
            issue_key = issue.get('key', '')
            summary = fields.get('summary', 'No summary')
            status = fields.get('status', {}).get('name', 'Unknown')
            priority = fields.get('priority', {}).get('name', 'Unknown')
            reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
            assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
            created = fields.get('created', 'Unknown')
            updated = fields.get('updated', 'Unknown')
            
            jira_url = ""
            if issue.get('self'):
                self_link = issue.get('self', '')
                if '/rest/api/' in self_link:
                    base_url = self_link.split('/rest/api/')[0]
                    jira_url = f"{base_url}/browse/{issue_key}"
            
            response = f"""
<div style="font-size:14px; line-height:1.5; color:{theme['TEXT_PRIMARY']};">
    <div style="font-size:15px; font-weight:600; color:{theme['PRIMARY_BLUE']};">
        {issue_key} — {summary}
    </div>
    <div style="margin-top:10px;">
        <b>Status:</b> {status}<br>
        <b>Priority:</b> {priority}<br>
        <b>Reporter:</b> {reporter}<br>
        <b>Assignee:</b> {assignee}<br>
        <b>Created:</b> {created}<br>
        <b>Updated:</b> {updated}<br>"""
            
            if jira_url:
                response += f"""
        <b>Link:</b> <a href="{jira_url}" style="color:{theme['PRIMARY_BLUE']}; text-decoration:none;">{jira_url}</a>"""
            
            response += f"""
    </div>
    <div style="
        margin-top:15px;
        background:{theme['CARD_INFO_BG']};
        border-left:4px solid {theme['CARD_INFO_BORDER']};
        padding:10px 14px;
        border-radius:5px;
        color:{theme['TEXT_PRIMARY']};
        font-size:13px;
    ">
        {insight}
    </div>
</div>"""
            return response
        else:
            # Multiple issues - generate insight and use existing method
            try:
                insight = await self.generate_dynamic_insight({"count": len(results)}, user_query)
            except:
                insight = f"Found {len(results)} issues matching your query."
            
            # Use the existing method but replace insight
            base_response = self.generate_simple_factual_response(results, user_query, theme)
            # Replace default insight with generated one
            base_response = base_response.replace(
                f"Found {len(results)} issues matching your query.",
                insight
            )
            return base_response
    
    def generate_simple_factual_response(
        self,
        results: List[Dict],
        user_query: str,
        theme: Dict[str, str]
    ) -> str:
        """
        Generate simple, factual response with HTML formatting and theme colors.
        Only returns ticket details with dynamic AI insight.
        """
        if not results:
            return f"""<div style="font-size:14px; color:{theme['TEXT_PRIMARY']};">No matching issues found.</div>"""
        
        if len(results) == 1:
            # Single issue - return basic details only
            issue = results[0]
            fields = issue.get('fields', {})
            issue_key = issue.get('key', '')
            summary = fields.get('summary', 'No summary')
            status = fields.get('status', {}).get('name', 'Unknown')
            priority = fields.get('priority', {}).get('name', 'Unknown')
            reporter = fields.get('reporter', {}).get('displayName', 'Unknown') if fields.get('reporter') else 'Unknown'
            assignee = fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned'
            created = fields.get('created', 'Unknown')
            updated = fields.get('updated', 'Unknown')
            
            # Build Jira URL if available
            jira_url = ""
            if issue.get('self'):
                self_link = issue.get('self', '')
                if '/rest/api/' in self_link:
                    base_url = self_link.split('/rest/api/')[0]
                    jira_url = f"{base_url}/browse/{issue_key}"
            
            # Default insight (will be replaced by async version)
            insight = "Review this issue for context and next steps."
            
            response = f"""
<div style="font-size:14px; line-height:1.5; color:{theme['TEXT_PRIMARY']};">
    <div style="font-size:15px; font-weight:600; color:{theme['PRIMARY_BLUE']};">
        {issue_key} — {summary}
    </div>
    <div style="margin-top:10px;">
        <b>Status:</b> {status}<br>
        <b>Priority:</b> {priority}<br>
        <b>Reporter:</b> {reporter}<br>
        <b>Assignee:</b> {assignee}<br>
        <b>Created:</b> {created}<br>
        <b>Updated:</b> {updated}<br>"""
            
            if jira_url:
                response += f"""
        <b>Link:</b> <a href="{jira_url}" style="color:{theme['PRIMARY_BLUE']}; text-decoration:none;">{jira_url}</a>"""
            
            response += f"""
    </div>
    <div style="
        margin-top:15px;
        background:{theme['CARD_INFO_BG']};
        border-left:4px solid {theme['CARD_INFO_BORDER']};
        padding:10px 14px;
        border-radius:5px;
        color:{theme['TEXT_PRIMARY']};
        font-size:13px;
    ">
        {insight}
    </div>
</div>"""
            
            return response
        
        else:
            # Multiple issues - return formatted list
            items_html = ""
            for issue in results[:10]:  # Limit to 10
                fields = issue.get('fields', {})
                issue_key = issue.get('key', '')
                summary = fields.get('summary', 'No summary')
                status = fields.get('status', {}).get('name', 'Unknown')
                priority = fields.get('priority', {}).get('name', 'Unknown')
                
                items_html += f"""
        <div style="margin-bottom:10px;">
            <span style="font-weight:600; color:{theme['PRIMARY_BLUE']};">{issue_key}</span> — {summary}
            <div style="font-size:13px; color:{theme['TEXT_SECONDARY']};">
                Status: {status}, Priority: {priority}
            </div>
        </div>"""
            
            remaining = len(results) - 10 if len(results) > 10 else 0
            remaining_text = f"… and {remaining} more." if remaining > 0 else ""
            
            # Default insight for multiple issues
            insight = f"Found {len(results)} issues matching your query."
            
            response = f"""
<div style="font-size:14px; color:{theme['TEXT_PRIMARY']};">
    <div style="font-size:15px; font-weight:600; margin-bottom:12px;">
        Found {len(results)} issues:
    </div>
    {items_html}
    {remaining_text}
    <div style="
        margin-top:15px;
        background:{theme['CARD_WARNING_BG']};
        border-left:4px solid {theme['CARD_WARNING_BORDER']};
        padding:10px 14px;
        border-radius:5px;
        color:{theme['TEXT_PRIMARY']};
        font-size:13px;
    ">
        {insight}
    </div>
</div>"""
            
            return response
    
    async def generate_deep_analysis_response(
        self,
        issue: Dict,
        user_query: str,
        unified_rag_handler: Optional[UnifiedRAGHandler] = None,
        integrations: Optional[List[str]] = None,
        theme: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Generate comprehensive engineering analysis with:
        - Root cause analysis
        - Fix recommendations
        - Related context
        
        Optimized: Uses caching and parallel operations
        """
        try:
            from services.performance_cache import get_performance_cache
            
            cache = get_performance_cache()
            issue_key = issue.get('key', '')
            cache_key = cache._generate_key('deep_analysis', issue_key, user_query)
            
            # Check cache first
            cached_analysis = cache.get(cache_key)
            if cached_analysis is not None:
                logger.info("✅ Using cached deep analysis")
                return cached_analysis
            
            analyzer = EnhancedIssueAnalyzer(ai_client=self.ai_client, model=self.model)
            
            # Get comprehensive analysis
            analysis = await analyzer.analyze_issue_comprehensively(
                issue=issue,
                user_query=user_query,
                unified_rag_handler=unified_rag_handler,
                integrations=integrations,
                theme=theme or get_theme("light")
            )
            
            # Cache for 6 hours (analysis doesn't change often)
            cache.set(cache_key, analysis, ttl=21600)
            
            return analysis
        except Exception as e:
            logger.error(f"Error generating deep analysis: {e}", exc_info=True)
            raise  # Re-raise to be caught by caller for fallback
    
    async def generate_adaptive_response(
        self,
        user_query: str,
        query_analysis: Dict,
        results: List[Dict],
        total_count: int = None,
        unified_rag_handler: Optional[UnifiedRAGHandler] = None,
        integrations: Optional[List[str]] = None,
        theme: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Adaptive response engine - decides response mode based on user query.
        """
        # Get theme if not provided
        if theme is None:
            theme = get_theme("light")
        
        # Step 1: Check if deep analysis is required
        needs_analysis = requires_deep_analysis(user_query)
        
        logger.info(f"🔍 Query analysis mode: {'DEEP ANALYSIS' if needs_analysis else 'SIMPLE FACTUAL'}")
        
        # Step 2: Route to appropriate response mode
        if not needs_analysis:
            # SIMPLE MODE: Return factual details only
            logger.info("📋 Generating simple factual response")
            
            if not results:
                return {
                    "content": f"""<div style="font-size:14px; color:{theme['TEXT_PRIMARY']};">No matching issues found.</div>""",
                    "type": "simple",
                    "confidence": 1.0
                }
            
            # For single issue queries, return simple details
            if len(results) == 1:
                content = await self._generate_simple_with_insight(results, user_query, theme)
                return {
                    "content": content,
                    "type": "simple",
                    "confidence": 1.0
                }
            
            # For multiple results, return simple list
            content = await self._generate_simple_with_insight(results, user_query, theme)
            return {
                "content": content,
                "type": "simple",
                "confidence": 1.0
            }
        
        else:
            # DEEP ANALYSIS MODE: Generate comprehensive analysis
            logger.info("🔬 Generating deep engineering analysis")
            
            if not results:
                return {
                    "content": f"""<div style="font-size:14px; color:{theme['TEXT_PRIMARY']};">No matching issues found for analysis.</div>""",
                    "type": "analysis",
                    "confidence": 0.0
                }
            
            # For single issue, provide deep analysis
            if len(results) == 1:
                # Index the issue on-the-fly if RAG is available (for future searches)
                if unified_rag_handler:
                    try:
                        from services.document_indexer import DocumentIndexer
                        indexer = DocumentIndexer(unified_rag_handler)
                        await indexer.index_jira_issues([results[0]], jira_base_url="")
                        logger.debug(f"Indexed issue {results[0].get('key')} for future RAG searches")
                    except Exception as e:
                        logger.debug(f"Failed to index issue (non-critical): {e}")
                
                try:
                    analysis = await self.generate_deep_analysis_response(
                        issue=results[0],
                        user_query=user_query,
                        unified_rag_handler=unified_rag_handler,
                        integrations=integrations,
                        theme=theme
                    )
                    return {
                        "content": analysis,
                        "type": "analysis",
                        "confidence": 0.9
                    }
                except Exception as e:
                    logger.error(f"Deep analysis failed: {e}, falling back to simple factual response")
                    # Fallback to simple factual response if analysis fails
                    content = await self._generate_simple_with_insight(results, user_query, theme)
                    content += f"""<div style="margin-top:10px; color:{theme['TEXT_SECONDARY']}; font-size:13px;">Note: Deep analysis unavailable. Showing basic issue details.</div>"""
                    return {
                        "content": content,
                        "type": "simple",
                        "confidence": 0.7
                    }
            
            # For multiple issues with analysis request, analyze the first one
            if len(results) > 1:
                # User asked for analysis but got multiple results
                # Analyze the most relevant one (first result)
                try:
                    analysis = await self.generate_deep_analysis_response(
                        issue=results[0],
                        user_query=user_query,
                        unified_rag_handler=unified_rag_handler,
                        integrations=integrations,
                        theme=theme
                    )
                    
                    # Add note about other results
                    analysis += f"""<div style="margin-top:10px; color:{theme['TEXT_SECONDARY']}; font-size:13px;">Note: Found {len(results)} total issues. Analysis provided for the most relevant issue ({results[0].get('key')}).</div>"""
                    
                    return {
                        "content": analysis,
                        "type": "analysis",
                        "confidence": 0.9
                    }
                except Exception as e:
                    logger.error(f"Deep analysis failed: {e}, falling back to simple factual response")
                    # Fallback to simple factual response if analysis fails
                    content = await self._generate_simple_with_insight(results, user_query, theme)
                    content += f"""<div style="margin-top:10px; color:{theme['TEXT_SECONDARY']}; font-size:13px;">Note: Deep analysis unavailable. Showing basic issue details.</div>"""
                    return {
                        "content": content,
                        "type": "simple",
                        "confidence": 0.7
                    }
        
        # Fallback
        theme = theme or get_theme("light")
        return {
            "content": f"""<div style="font-size:14px; color:{theme['TEXT_PRIMARY']};">Unable to generate response.</div>""",
            "type": "error",
            "confidence": 0.0
        }

