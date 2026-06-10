"""
Enhanced Issue Analyzer
Provides deep analysis of individual issues with root cause and fix recommendations
"""
import logging
import json
from typing import Dict, List, Any, Optional
from services.unified_rag_handler import UnifiedRAGHandler, SourceType

logger = logging.getLogger(__name__)

class EnhancedIssueAnalyzer:
    """
    Provides deep analysis of individual issues with:
    - Root cause analysis
    - Fix recommendations
    - Related context from all sources
    """
    
    def __init__(self, ai_client=None, model: str = "gpt-4o-mini"):
        self.ai_client = ai_client
        self.model = model
    
    def _extract_issue_details(self, issue: Dict[str, Any]) -> Dict[str, Any]:
        """Extract relevant details from Jira issue"""
        fields = issue.get('fields', {})
        
        # Extract comments with safe None handling
        comment_obj = fields.get('comment')
        comments = comment_obj.get('comments', []) if comment_obj and isinstance(comment_obj, dict) else []
        comment_texts = []
        for comment in comments:
            author_obj = comment.get('author') if isinstance(comment, dict) else None
            author = author_obj.get('displayName', 'Unknown') if author_obj and isinstance(author_obj, dict) else 'Unknown'
            body = comment.get('body', '') if isinstance(comment, dict) else ''
            created = comment.get('created', '') if isinstance(comment, dict) else ''
            comment_texts.append(f"{author} ({created}): {body}")
        
        # Safely extract nested fields with proper None checks
        status_obj = fields.get('status')
        status = status_obj.get('name', 'Unknown') if status_obj and isinstance(status_obj, dict) else 'Unknown'
        
        priority_obj = fields.get('priority')
        priority = priority_obj.get('name', 'Unknown') if priority_obj and isinstance(priority_obj, dict) else 'Unknown'
        
        reporter_obj = fields.get('reporter')
        reporter = reporter_obj.get('displayName', 'Unknown') if reporter_obj and isinstance(reporter_obj, dict) else 'Unknown'
        
        assignee_obj = fields.get('assignee')
        assignee = assignee_obj.get('displayName', 'Unassigned') if assignee_obj and isinstance(assignee_obj, dict) else 'Unassigned'
        
        issue_type_obj = fields.get('issuetype')
        issue_type = issue_type_obj.get('name', '') if issue_type_obj and isinstance(issue_type_obj, dict) else ''
        
        project_obj = fields.get('project')
        project = project_obj.get('key', '') if project_obj and isinstance(project_obj, dict) else ''
        
        return {
            'key': issue.get('key'),
            'summary': fields.get('summary', ''),
            'description': fields.get('description', '') or '',
            'status': status,
            'priority': priority,
            'reporter': reporter,
            'assignee': assignee,
            'created': fields.get('created', ''),
            'updated': fields.get('updated', ''),
            'comments': '\n'.join(comment_texts),
            'issue_type': issue_type,
            'project': project
        }
    
    async def _find_related_context(
        self,
        issue_details: Dict,
        unified_rag: UnifiedRAGHandler
    ) -> Dict[str, List]:
        """
        Find related information from all sources:
        - Similar Jira issues
        - Related Confluence documentation
        - Related GitHub PRs/issues
        
        Optimized: Reduced top_k and uses early termination
        Gracefully handles empty vector store
        """
        if not unified_rag:
            logger.debug("Unified RAG handler not available, skipping related context search")
            return {'jira_issues': [], 'confluence_docs': [], 'github_items': []}
        
        # Build search query from issue
        search_query = f"{issue_details['summary']} {issue_details['description']}"
        
        try:
            # Check if vector store has documents
            if not unified_rag.vector_store or len(unified_rag.vector_store) == 0:
                logger.debug("Vector store is empty, skipping RAG search. Analysis will proceed without related context.")
                return {'jira_issues': [], 'confluence_docs': [], 'github_items': []}
            
            # Search across all sources with reduced top_k for speed
            results = await unified_rag.similarity_search(
                query=search_query,
                top_k=5,  # Reduced from 10 for faster results
                min_score=0.65  # Slightly higher threshold
            )
            
            if not results:
                logger.debug("No related context found via RAG search")
                return {'jira_issues': [], 'confluence_docs': [], 'github_items': []}
            
            # Group by source
            related = {
                'jira_issues': [],
                'confluence_docs': [],
                'github_items': []
            }
            
            for doc in results:
                if doc.source_type == SourceType.JIRA and doc.id != f"jira_{issue_details['key']}":
                    related['jira_issues'].append(doc)
                elif doc.source_type == SourceType.CONFLUENCE:
                    related['confluence_docs'].append(doc)
                elif doc.source_type == SourceType.GITHUB:
                    related['github_items'].append(doc)
            
            logger.debug(f"Found related context: {len(related['jira_issues'])} issues, {len(related['confluence_docs'])} docs, {len(related['github_items'])} GitHub items")
            return related
        except Exception as e:
            logger.warning(f"RAG search failed (non-critical): {e}. Analysis will proceed without related context.")
            return {'jira_issues': [], 'confluence_docs': [], 'github_items': []}
    
    async def _call_ai_analysis(self, prompt: str, system_role: str = "You are an expert software engineer.") -> str:
        """Call AI for analysis"""
        if not self.ai_client:
            return "AI analysis not available. Please configure OpenAI API key."
        
        try:
            response = self.ai_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_role},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2000
            )
            
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"AI analysis failed: {e}")
            return f"Failed to generate analysis: {str(e)}"
    
    async def _analyze_root_cause(
        self,
        issue_details: Dict,
        related_context: Dict
    ) -> Dict[str, Any]:
        """AI-powered root cause analysis with caching"""
        from services.performance_cache import get_performance_cache
        
        cache = get_performance_cache()
        issue_key = issue_details.get('key', '')
        cache_key = cache._generate_key('root_cause', issue_key, json.dumps(related_context, sort_keys=True))
        
        # Check cache
        cached_analysis = cache.get(cache_key)
        if cached_analysis is not None:
            logger.debug("Using cached root cause analysis")
            return cached_analysis
        
        # Format related context (limit to top 2 for speed)
        similar_issues = []
        for doc in related_context.get('jira_issues', [])[:2]:
            similar_issues.append(f"- {doc.metadata.get('id', 'Unknown')}: {doc.metadata.get('summary', '')}")
        
        docs = []
        for doc in related_context.get('confluence_docs', [])[:2]:
            docs.append(f"- {doc.metadata.get('title', 'Unknown')}")
        
        prs = []
        for doc in related_context.get('github_items', [])[:2]:
            prs.append(f"- {doc.metadata.get('title', 'Unknown')} ({doc.metadata.get('type', 'item')})")
        
        prompt = f"""You are an expert software engineer analyzing a bug report.

ISSUE DETAILS:
- Key: {issue_details['key']}
- Summary: {issue_details['summary']}
- Description: {issue_details['description']}
- Status: {issue_details['status']}
- Priority: {issue_details['priority']}
- Reporter: {issue_details['reporter']}
- Assignee: {issue_details['assignee']}
- Comments: {issue_details['comments']}

RELATED CONTEXT:
- Similar Issues:
{chr(10).join(similar_issues) if similar_issues else '  None found'}

- Documentation:
{chr(10).join(docs) if docs else '  None found'}

- Related PRs/Issues:
{chr(10).join(prs) if prs else '  None found'}

Provide a comprehensive root cause analysis:

1. **PRIMARY ISSUE**: What is the core problem?
2. **CONTRIBUTING FACTORS**: What led to this issue?
3. **SYMPTOMS**: What are the observable effects?
4. **IMPACT**: Who/what is affected?
5. **PATTERN ANALYSIS**: Is this a recurring issue? (Check similar issues)
6. **TECHNICAL ROOT CAUSE**: What in the code/system causes this?

Be specific, technical, and actionable."""
        
        analysis = await self._call_ai_analysis(
            prompt,
            "You are an expert software engineer with 15+ years of experience in debugging and root cause analysis."
        )
        
        result = {
            'analysis': analysis,
            'primary_issue': analysis.split('**PRIMARY ISSUE**:')[1].split('**')[0].strip() if '**PRIMARY ISSUE**:' in analysis else '',
            'contributing_factors': analysis.split('**CONTRIBUTING FACTORS**:')[1].split('**')[0].strip() if '**CONTRIBUTING FACTORS**:' in analysis else ''
        }
        
        # Cache the result (6 hours)
        cache.set(cache_key, result, ttl=21600)
        return result
    
    async def _generate_fix_suggestions(
        self,
        issue_details: Dict,
        root_cause: Dict,
        related_context: Dict
    ) -> Dict[str, Any]:
        """Generate actionable fix recommendations"""
        similar_issues = []
        for doc in related_context.get('jira_issues', [])[:3]:
            similar_issues.append(f"- {doc.metadata.get('id', 'Unknown')}: {doc.metadata.get('summary', '')}")
        
        docs = []
        for doc in related_context.get('confluence_docs', [])[:3]:
            docs.append(f"- {doc.metadata.get('title', 'Unknown')}: {doc.metadata.get('url', '')}")
        
        prs = []
        for doc in related_context.get('github_items', [])[:3]:
            prs.append(f"- {doc.metadata.get('title', 'Unknown')}: {doc.metadata.get('url', '')}")
        
        prompt = f"""You are a senior software engineer providing fix recommendations.

ISSUE: {issue_details['key']} - {issue_details['summary']}

ROOT CAUSE ANALYSIS:
{root_cause.get('analysis', '')}

RELATED CONTEXT:
- Similar resolved issues:
{chr(10).join(similar_issues) if similar_issues else '  None found'}

- Documentation:
{chr(10).join(docs) if docs else '  None found'}

- Previous fix attempts:
{chr(10).join(prs) if prs else '  None found'}

Provide comprehensive fix recommendations:

1. **IMMEDIATE FIX** (Quick Win - can be done in hours):
   - Specific code changes needed
   - File locations and functions
   - Estimated time
   - Risk assessment

2. **PROPER FIX** (Long-term - 1-2 days):
   - Architectural changes if needed
   - Refactoring suggestions
   - Testing requirements
   - Performance considerations

3. **PREVENTION** (Future):
   - How to prevent similar issues
   - Code review checkpoints
   - Test coverage needed
   - Documentation updates

4. **RELATED WORK**:
   - Reference similar fixes that worked
   - Link to documentation
   - Reference related PRs

Be specific with:
- Code file paths
- Function names
- Step-by-step approach
- Testing strategy"""
        
        suggestions = await self._call_ai_analysis(
            prompt,
            "You are a senior software engineer with expertise in code architecture, debugging, and software engineering best practices."
        )
        
        return {
            'suggestions': suggestions,
            'immediate_fix': suggestions.split('**IMMEDIATE FIX**')[1].split('**')[0].strip() if '**IMMEDIATE FIX**' in suggestions else '',
            'proper_fix': suggestions.split('**PROPER FIX**')[1].split('**')[0].strip() if '**PROPER FIX**' in suggestions else ''
        }
    
    async def analyze_issue_comprehensively(
        self,
        issue: Dict[str, Any],
        user_query: str,
        unified_rag_handler: Optional[UnifiedRAGHandler] = None,
        integrations: Optional[List[str]] = None,
        theme: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Comprehensive issue analysis with fix suggestions
        """
        # Extract issue details
        issue_details = self._extract_issue_details(issue)
        
        # Find related context via unified RAG
        related_context = await self._find_related_context(
            issue_details, unified_rag_handler
        )
        
        # Generate root cause analysis
        root_cause = await self._analyze_root_cause(
            issue_details, related_context
        )
        
        # Generate fix recommendations
        fix_suggestions = await self._generate_fix_suggestions(
            issue_details, root_cause, related_context
        )
        
        # Format comprehensive response
        return self._format_analysis_response(
            issue_details, root_cause, fix_suggestions, related_context, theme
        )
    
    def _format_analysis_response(
        self,
        issue_details: Dict,
        root_cause: Dict,
        fix_suggestions: Dict,
        related_context: Dict,
        theme: Dict[str, str]
    ) -> str:
        """Format comprehensive analysis response with HTML and theme"""
        # Format related resources
        related_html = ""
        resources = []
        
        for doc in related_context.get('jira_issues', [])[:3]:
            doc_id = doc.metadata.get('id', 'Unknown')
            doc_url = doc.metadata.get('url', '')
            doc_summary = doc.metadata.get('summary', '')
            resources.append(f'<a href="{doc_url}" style="color:{theme["PRIMARY_BLUE"]}; text-decoration:none;">{doc_id}</a>: {doc_summary}')
        
        for doc in related_context.get('confluence_docs', [])[:3]:
            doc_title = doc.metadata.get('title', 'Unknown')
            doc_url = doc.metadata.get('url', '')
            resources.append(f'<a href="{doc_url}" style="color:{theme["PRIMARY_BLUE"]}; text-decoration:none;">{doc_title}</a>')
        
        for doc in related_context.get('github_items', [])[:3]:
            doc_title = doc.metadata.get('title', 'Unknown')
            doc_url = doc.metadata.get('url', '')
            resources.append(f'<a href="{doc_url}" style="color:{theme["PRIMARY_BLUE"]}; text-decoration:none;">{doc_title}</a>')
        
        if resources:
            related_html = f"""
    <div style="margin-top:16px;">
        <b>Related Signals</b><br>
        <div style="margin-top:8px;">
            {''.join(f'<div style="margin-bottom:6px;">{r}</div>' for r in resources)}
        </div>
    </div>"""
        else:
            related_html = f"""
    <div style="margin-top:16px; color:{theme['TEXT_SECONDARY']}; font-size:13px;">
        Note: Related context search is not available. Analysis is based on the issue details only.
    </div>"""
        
        # Generate AI conclusion (fresh each time)
        conclusion = "Review the analysis above and proceed with recommended fixes."
        
        response = f"""
<div style="font-size:14px; line-height:1.6; color:{theme['TEXT_PRIMARY']};">
    <div style="font-size:16px; font-weight:600; color:{theme['PRIMARY_BLUE']};">
        Issue Analysis — {issue_details['key']}: {issue_details['summary']}
    </div>
    <div style="margin-top:16px;">
        <b>Issue Summary</b><br>
        Reported by <b>{issue_details['reporter']}</b>, assigned to <b>{issue_details['assignee']}</b>.<br>
        Status: <b>{issue_details['status']}</b>, Priority: <b>{issue_details['priority']}</b>.
    </div>
    <div style="margin-top:16px;">
        <b>Root Cause</b><br>
        <div style="margin-top:8px; color:{theme['TEXT_PRIMARY']};">
            {root_cause.get('analysis', 'Analysis not available')}
        </div>
    </div>
    <div style="margin-top:16px;">
        <b>Recommended Fix</b><br>
        <div style="margin-top:8px; color:{theme['TEXT_PRIMARY']};">
            {fix_suggestions.get('suggestions', 'Suggestions not available')}
        </div>
    </div>
    {related_html}
    <div style="
        margin-top:20px;
        background:{theme['CARD_SUCCESS_BG']};
        border-left:4px solid {theme['CARD_SUCCESS_BORDER']};
        padding:10px 14px;
        border-radius:5px;
        color:{theme['TEXT_PRIMARY']};
        font-size:13px;
    ">
        {conclusion}
    </div>
</div>"""
        
        return response

