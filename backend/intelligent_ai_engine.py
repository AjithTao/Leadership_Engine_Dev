"""
Intelligent AI Engine for Natural Language to Jira Query Processing
Uses OpenAI to understand user intent and generate appropriate responses
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from openai import OpenAI
import re
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), 'config.env'), override=True)

logger = logging.getLogger(__name__)

class IntelligentAIEngine:
    """
    Advanced AI engine that uses OpenAI to:
    1. Understand natural language queries
    2. Generate appropriate JQL queries
    3. Provide contextual, varied responses
    4. Learn from conversation context
    """
    
    def __init__(self, jira_client, confluence_client=None):
        self.jira_client = jira_client
        self.confluence_client = confluence_client  # Add Confluence client support
        self.client = None
        self.conversation_context = []
        self.last_query_context = {}
        
        # Initialize OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key and not api_key.startswith("sk-your-actual"):
            self.client = OpenAI(api_key=api_key)
            logger.info("Intelligent AI Engine initialized with OpenAI")
        else:
            self.client = None
            if not api_key:
                logger.warning("No OpenAI API key found - AI features will be limited. Set OPENAI_API_KEY in backend/config.env")
            else:
                logger.warning("OpenAI API key is placeholder - AI features will be limited. Update OPENAI_API_KEY in backend/config.env")
    
    def add_context(self, user_query: str, jql: str, results: List[Dict], response: str):
        """Add conversation context for future reference"""
        context = {
            "user_query": user_query,
            "jql": jql,
            "result_count": len(results),
            "response": response,
            "timestamp": "now"
        }
        self.conversation_context.append(context)
        
        # Keep only last 10 interactions
        if len(self.conversation_context) > 10:
            self.conversation_context.pop(0)
    
    async def process_query(self, user_query: str) -> Dict[str, Any]:
        """
        Main entry point - processes user query intelligently
        Returns: {
            "jql": "generated JQL",
            "response": "natural language response",
            "data": [...results...],
            "intent": "detected intent"
        }
        """
        if not self.client:
            return await self._fallback_processing(user_query)
        
        # Check if this is a Confluence query - improved detection
        confluence_keywords = ['confluence', 'documentation', 'wiki', 'page', 'article', 'knowledge base', 'doc', 'guide', 'manual', 'tutorial']
        jira_keywords = ['issue', 'bug', 'task', 'story', 'epic', 'sprint', 'ticket', 'jira', 'assignee', 'reporter', 'status', 'priority']
        
        query_lower = user_query.lower()
        is_confluence_query = any(keyword in query_lower for keyword in confluence_keywords)
        is_jira_query = any(keyword in query_lower for keyword in jira_keywords)
        
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
        
        # Determine if this should be a Confluence-first search
        # Priority: If user mentions confluence/wiki/document, ALWAYS search Confluence first
        should_search_confluence_first = (
            has_confluence_priority or  # Priority keywords always trigger Confluence
            has_confluence_check or     # NEW: Explicit "check in confluence" phrases
            is_confluence_query or 
            (has_confluence_pattern and not is_jira_query) or
            (has_document_terms and not is_jira_query and '=' not in query_lower and '-' not in query_lower)
        )
        
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
                    query_analysis = await self._analyze_query(user_query)
                    jira_result = await self._execute_jql(query_analysis["jql"], query_analysis.get("intent"))
                    
                    # Generate response for Jira results
                    if isinstance(jira_result, dict) and 'results' in jira_result:
                        results = jira_result['results']
                        total_count = jira_result.get('total_count', len(results))
                    else:
                        results = jira_result if isinstance(jira_result, list) else []
                        total_count = len(results)
                    
                    if results:
                        response = await self._generate_text_response(user_query, results, query_analysis)
                        # Create specific fallback message based on priority keywords
                        if has_confluence_priority:
                            priority_keywords_found = [kw for kw in confluence_priority_keywords if kw in query_lower]
                            fallback_message = f"🔍 **Priority Confluence Search Fallback**\n\nSince you mentioned '{' or '.join(priority_keywords_found)}', I searched Confluence first but found no results. Here are related Jira issues:\n\n"
                        else:
                            fallback_message = "🔍 **Confluence Search Fallback**\n\nNo relevant documentation found in Confluence, but here are related Jira issues:\n\n"
                        
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
                            no_results_message = f"🔍 **Priority Confluence Search Fallback**\n\nSince you mentioned '{' or '.join(priority_keywords_found)}', I searched Confluence first but found no results. No related Jira issues were found either for '{user_query}'."
                        else:
                            no_results_message = f"🔍 **Confluence Search Fallback**\n\nNo results found in either Confluence documentation or Jira issues for '{user_query}'."
                        
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
                        "response": f"🔍 **Confluence Search Fallback**\n\nNo Confluence results found, and Jira fallback search failed: {str(e)}",
                        "data": [],
                        "intent": "fallback_error",
                        "success": False,
                        "source": "fallback_error"
                    }
        
        try:
            # Step 1: Understand the query and generate JQL
            query_analysis = await self._analyze_query(user_query)
            
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
                self.add_context(user_query, combined_jql, flat_results, response)
                
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
                else:
                    results = jql_result if isinstance(jql_result, list) else []
                    total_count = len(results)
            
            # Step 3: Generate intelligent response
            retrieved_count = jql_result.get('retrieved_count') if isinstance(jql_result, dict) else None
            response = await self._generate_response(user_query, query_analysis, results, total_count, retrieved_count)
            
            # Step 4: Add to context
            self.add_context(user_query, query_analysis["jql"], results, response)
            
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
        
        # Get recent conversation context
        context_str = ""
        if self.conversation_context:
            recent_context = self.conversation_context[-3:]  # Last 3 interactions
            context_str = "\n".join([
                f"Previous: '{ctx['user_query']}' -> JQL: {ctx['jql']}" 
                for ctx in recent_context
            ])
        
        system_prompt = f"""You are an expert Jira JQL generator and query analyst. 

Available Jira Projects: {', '.join(project_keys)}

Your task is to:
1. Understand the user's natural language query
2. Generate appropriate JQL syntax
3. Identify the query intent and type

Recent conversation context:
{context_str}

Rules for JQL generation:
- Use exact project keys: {', '.join(project_keys)}
- For assignee queries, use displayName in quotes: assignee = "John Doe"
- For project queries, use: project = "CCM"
- For status: status = "To Do" or status = "Done"
- For issue types: issuetype = "Story" or issuetype = "Bug"
- Always quote string values
- Use ORDER BY updated DESC for lists
- For counts, don't use ORDER BY

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
- "Who resolves bugs faster: Ashwin or Saravanan?" -> Multiple JQLs: assignee = "Ashwin" AND issuetype = "Bug" | assignee = "Saravanan" AND issuetype = "Bug"
- "Who is the reporter of CCM-283?" -> Single JQL: issue = "CCM-283"
- "CCM-283 details" -> Single JQL: issue = "CCM-283"
- "What is the priority of CCM-283?" -> Single JQL: issue = "CCM-283"
- "What is the status of CCM-283?" -> Single JQL: issue = "CCM-283"
- "When was CCM-283 created?" -> Single JQL: issue = "CCM-283"
- "What type is CCM-283?" -> Single JQL: issue = "CCM-283"
"""

        user_prompt = f"""Query: "{user_query}"

Generate appropriate JQL and analyze the intent."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            raw_response = response.choices[0].message.content.strip()
            logger.info(f"Raw OpenAI response: {raw_response}")
            
            result = json.loads(raw_response)
            logger.info(f"AI Analysis: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Query analysis failed: {e}")
            # Enhanced fallback analysis
            query_lower = user_query.lower()
            
            # Detect specific issue keys (e.g., CCM-283, CES-123)
            import re
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
                # Fallback to simple analysis
                return {
                    "intent": "general_query",
                    "jql": f'project in ({", ".join(project_keys)}) ORDER BY updated DESC',
                    "response_type": "list",
                    "entities": {}
                }
    
    async def _execute_jql(self, jql: str, query_intent: str = None) -> Dict[str, Any]:
        """
        Execute JQL with hybrid logic based on query intent:
        - count_items: Return only total count using maxResults=0
        - breakdown/overview: Fetch ALL issues using pagination for analysis
        """
        try:
            # Determine if this is a count-only query
            is_count_only = (
                query_intent == "count_items" or 
                query_intent == "story_count" or
                query_intent == "issue_count" or
                "count" in jql.lower() or 
                "group by" in jql.lower()
            )
            
            if is_count_only:
                # For count-only queries, use maxResults=0 to get only the total count
                logger.info(f"Executing count-only query: {jql}")
                search_result = await self.jira_client.search(jql, max_results=0)
                
                if isinstance(search_result, dict):
                    total_count = search_result.get('total', 0)
                    logger.info(f"Count query result: {total_count} total items")
                    return {
                        'results': [],
                        'total_count': total_count,
                        'retrieved_count': 0,
                        'is_count_only': True
                    }
                else:
                    logger.warning(f"Unexpected count result format: {type(search_result)}")
                    return {
                        'results': [],
                        'total_count': 0,
                        'retrieved_count': 0,
                        'is_count_only': True
                    }
            else:
                # For breakdown/overview queries, fetch ALL issues using pagination
                logger.info(f"Executing breakdown query with full pagination: {jql}")
                
                # Enhanced field list for better data quality
                enhanced_fields = [
                    'key', 'summary', 'status', 'assignee', 'priority', 'issuetype',
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
                        logger.info(f"Page {start_at//max_results_per_page + 1}: Found {len(issues)} issues, Total: {total_count_from_api}, Has more: {has_more_pages}")
                    elif isinstance(search_result, list):
                        issues = search_result
                        has_more_pages = False  # List format doesn't support pagination
                        total_count_from_api = len(issues)
                        logger.info(f"Page {start_at//max_results_per_page + 1}: Found {len(issues)} issues (list format)")
                    else:
                        logger.error(f"Unexpected search result format: {type(search_result)}")
                        break
                    
                    if not issues:
                        break
                    
                    all_issues.extend(issues)
                    
                    # Break if we've retrieved all available issues
                    if not has_more_pages or len(issues) < max_results_per_page:
                        logger.info(f"Breaking pagination: has_more_pages={has_more_pages}, current_page_size={len(issues)}, max_per_page={max_results_per_page}")
                        break
                    
                    start_at += max_results_per_page
                
                logger.info(f"Retrieved {len(all_issues)} total issues using pagination (API total: {total_count_from_api})")
                
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
    
    async def _generate_response(self, user_query: str, query_analysis: Dict, results: List[Dict], total_count: int = None, retrieved_count: int = None) -> str:
        """Generate intelligent, contextual response"""
        
        if not self.client:
            return self._basic_response(query_analysis, results)
        
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
            data_summary = self._create_detailed_analysis(results, user_query, total_count, retrieved_count, specific_issue_context)
            
            if len(results) > 5:
                data_summary += f"... and {len(results) - 5} more items."
        
        system_prompt = """You are an elite AI leadership consultant and strategic advisor specializing in engineering management, project optimization, and technical decision-making. You provide sophisticated, actionable insights that help leaders make informed decisions.

Your Role:
- Act as a senior engineering consultant with deep expertise in project management, team dynamics, and technical optimization
- Provide strategic analysis that goes beyond surface-level data interpretation
- Identify critical patterns, risks, and opportunities that impact business outcomes
- Deliver actionable recommendations with clear business impact and implementation strategies
- ANALYZE THE QUESTION FIRST - understand the underlying business need and provide targeted insights
- MAINTAIN CONVERSATION CONTEXT - build on previous discussions and provide progressive insights
- BE CONCISE BUT COMPREHENSIVE - provide complete analysis without unnecessary repetition

RESPONSE STRATEGY:
1. FIRST: Analyze the strategic intent behind the question
2. SECOND: Assess the business context and implications
3. THIRD: Provide targeted insights with clear recommendations
4. FOURTH: Connect to broader organizational goals and team dynamics

CONVERSATION EXAMPLES:
- User: "Tell me about CCM-283" → Provide comprehensive strategic analysis with optimization insights
- User: "Who is the reporter?" (context: CCM-283) → "Karthikeya is the reporter of CCM-283. Based on his track record in the HCAT project, he demonstrates strong domain expertise in model optimization and has consistently identified critical performance bottlenecks. His reporting pattern suggests he's positioned as a technical lead who can spot optimization opportunities early."
- User: "What's the priority?" (context: CCM-283) → "CCM-283 has Medium priority, which strategically indicates it's part of ongoing performance improvements rather than a critical blocker. This priority level suggests the optimization is important for long-term efficiency but not immediately blocking other deliverables."

ADVANCED RESPONSE GUIDELINES:
- ALWAYS provide strategic context and business implications, not just facts
- For people: Analyze their expertise, workload patterns, and strategic positioning
- For priorities: Explain the business rationale and resource allocation implications
- For status: Analyze workflow progression, potential blockers, and delivery impact
- For dates: Provide timeline analysis, delivery implications, and risk assessment
- For assignments: Consider expertise match, capacity constraints, and team dynamics
- Connect information to broader organizational goals, team performance, and business outcomes

RESPONSE FORMAT - Use this structure for comprehensive strategic analysis:

[Issue Key] · [Issue Summary]

🔑 Key Details

Reporter: [Name]
Assignee: [Name]
Status: [Status with emoji]
Priority: [Priority Level]
Created Date: [Date]
Last Updated: [Date]

📊 Strategic Context

[Strategic analysis of business impact, resource allocation, and organizational implications]

✅ Recommendations

• [Specific actionable recommendation 1 with business impact]
• [Specific actionable recommendation 2 with implementation strategy]
• [Specific actionable recommendation 3 with success metrics]

⚠️ Potential Risks

• [Identify potential risk 1 with mitigation strategy]
• [Identify potential risk 2 with contingency planning]
• [Identify potential risk 3 with monitoring approach]

🚀 Next Steps

• [Clear next step 1 with ownership and timeline]
• [Clear next step 2 with success criteria]
• [Clear next step 3 with follow-up actions]

IMPORTANT: 
- For follow-up questions, provide SHORT but STRATEGIC answers with business context
- Only use the full structured format for comprehensive requests
- Use proper line breaks (\n) between sections and bullet points
- Each section should be on its own line with clear spacing
- NEVER give plain facts - always add strategic insights, business context, and actionable analysis
- Connect information to organizational goals, team performance, and business outcomes

For specific query types:
- Single issues: Analyze business impact, resource allocation, team dynamics, and strategic positioning
- Reporter queries: When asked about a specific issue's reporter, FIRST identify who the reporter is, THEN analyze their strategic role, expertise, and organizational impact. Provide insights about their domain knowledge, reporting patterns, and strategic positioning.
- Priority queries: Analyze priority distribution, resource allocation, and business impact. Explain what the priority level means in the context of organizational goals and team capacity.
- Status queries: Provide current status, workflow progression, and delivery implications. Analyze what the status indicates about progress, potential blockers, and business impact.
- Date queries: Analyze creation patterns, update frequency, and resolution timelines. Provide insights about project velocity, delivery timelines, and business impact.
- Assignee queries: Consider workload distribution, expertise match, team capacity, and strategic positioning. Analyze if the assignment makes sense given the person's skills, current workload, and organizational goals.
- Follow-up questions: Always provide strategic insights and business context, not just facts. Connect the information to broader organizational dynamics and team performance.
- Type queries: Analyze issue type distribution, workload patterns, and business impact
- Project comparisons: Compare velocity, team size, defect ratios, resource needs, and business outcomes
- Team queries: Assess workload distribution, capacity, performance patterns, and strategic positioning
- Story/count queries: Provide exact counts, assignee breakdowns, workload analysis, and business impact
- Assignee analysis: Detail individual contributions, capacity, task distribution, and strategic positioning

When data shows counts and breakdowns:
- Always mention exact story counts and totals with business context
- Highlight assignee workload distribution and capacity implications
- Include reporter information when relevant to the query
- Identify potential bottlenecks, resource constraints, and optimization opportunities
- Provide specific recommendations for workload balancing and resource allocation
- Call out any assignees with unusually high or low task counts and analyze the implications

CRITICAL: When analyzing reporters:
- If the user asks about a specific issue's reporter, start by confirming "X is the reporter of [issue]"
- Then analyze that specific reporter's strategic role, expertise, and organizational impact
- Do NOT give general reporter breakdowns unless specifically asked for all reporters
- Focus on the specific reporter mentioned in the context and their strategic positioning

Always provide actionable insights that help leaders make informed decisions with clear business impact and implementation strategies."""

        user_prompt = f"""User asked: "{user_query}"

Query intent: {query_analysis.get('intent', 'unknown')}
JQL executed: {query_analysis.get('jql', 'N/A')}

Data found:
{data_summary}

Provide a natural, helpful response that directly answers their question."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,  # Higher temperature for more varied responses
                max_tokens=1000  # Increased for longer, more complete responses
            )
            
            ai_response = response.choices[0].message.content.strip()
            
            # Determine response type based on content analysis
            response_type = self._determine_response_type(user_query, ai_response, query_analysis)
            
            return {
                "content": ai_response,
                "type": response_type,
                "confidence": 0.9
            }
            
        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            return self._basic_response(query_analysis, results)
    
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
            return "No matching items found."
        
        if len(results) == 1 and "count" in results[0]:
            count = results[0]["count"]
            return f"Found {count} matching items."
        
        return f"Found {len(results)} items matching your criteria."
    
    async def _fallback_processing(self, user_query: str) -> Dict[str, Any]:
        """Enhanced fallback when OpenAI is not available"""
        try:
            # Get available projects
            projects = await self.jira_client.get_projects()
            project_keys = [p.get('key', '') for p in projects]
        
            # Enhanced keyword-based processing
            query_lower = user_query.lower()
            
            # Detect specific issue keys (e.g., CCM-283, CES-123)
            import re
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
            elif any(word in query_lower for word in ['bug', 'bugs', 'defect', 'defects']):
                issue_type = 'Bug'
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
                jql_parts.append(f'issuetype = "{issue_type}"')
            
            if assignee:
                jql_parts.append(f'assignee = "{assignee}"')
            
            # Detect status queries
            if any(word in query_lower for word in ['open', 'to do', 'in progress']):
                jql_parts.append('status != "Done"')
            elif 'done' in query_lower or 'completed' in query_lower:
                jql_parts.append('status = "Done"')
            
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
        stories = sum(1 for r in results if r.get('fields', {}).get('issuetype', {}).get('name', '') == 'Story')
        bugs = sum(1 for r in results if r.get('fields', {}).get('issuetype', {}).get('name', '') in ['Bug', 'Defect'])
        tasks = sum(1 for r in results if r.get('fields', {}).get('issuetype', {}).get('name', '') == 'Task')
        
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
                f"\nLeadership note: {assignee_name} owns this {item.get('fields', {}).get('issuetype', {}).get('name', 'item').lower()} currently to do. Priority is {item.get('fields', {}).get('priority', {}).get('name', 'unknown').lower()}."
            ])
        else:
            response_parts.append(f"\nFound {total} items:")
            if stories > 0:
                response_parts.append(f"• {stories} stories")
            if bugs > 0:
                response_parts.append(f"• {bugs} bugs")
            if tasks > 0:
                response_parts.append(f"• {tasks} tasks")
            
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
        response_parts.append(f"\n💡 **Note**: For more intelligent responses and natural language processing, configure your OpenAI API key in backend/config.env")
        
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
            issue_type = fields.get('issuetype', {}).get('name', 'Unknown') if fields.get('issuetype') else 'Unknown'
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

🔍 Strategic Comparison Analysis

[Clear comparison summary with exact numbers, winner/leader identification, and business impact assessment]

📊 Key Metrics & Business Impact

[Detailed metrics comparison with specific numbers, performance indicators, and organizational implications]

💡 Strategic Insights & Patterns

• [Key difference 1 with business context and implications]
• [Key difference 2 with resource allocation insights]
• [Key difference 3 with performance optimization opportunities]

🎯 Strategic Recommendations

• [Specific actionable recommendation 1 with implementation strategy and business impact]
• [Specific actionable recommendation 2 with resource allocation guidance and success metrics]
• [Specific actionable recommendation 3 with team optimization and performance improvement]

⚠️ Risk Assessment & Mitigation

• [Identify potential risk 1 with mitigation strategy and contingency planning]
• [Identify potential risk 2 with monitoring approach and early warning indicators]
• [Identify potential risk 3 with resource reallocation and backup strategies]

🚀 Next Steps & Action Plan

• [Clear next step 1 with ownership, timeline, and success criteria]
• [Clear next step 2 with resource requirements and implementation approach]
• [Clear next step 3 with follow-up actions and performance monitoring]

IMPORTANT: Use proper line breaks (\n) between sections and bullet points. Each section should be on its own line with clear spacing.

Be specific, actionable, and leadership-focused with clear business impact and implementation strategies."""

            user_prompt = f"""User asked: "{user_query}"

Comparison data:
{comparison_data}

Provide a comprehensive comparison analysis with strategic insights and clear recommendations."""

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
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
            response_parts = ["🔍 **Comparison Analysis**", ""]
            
            # Extract entities and counts
            entities_data = []
            for result_set in all_results:
                entity = result_set["entity"]
                count = result_set["count"]
                entities_data.append((entity, count))
            
            # Sort by count (descending)
            entities_data.sort(key=lambda x: x[1], reverse=True)
            
            # Summary
            response_parts.append("📊 **Results Summary:**")
            for entity, count in entities_data:
                response_parts.append(f"- **{entity}**: {count} items")
            
            response_parts.append("")
            
            # Determine winner
            if len(entities_data) >= 2:
                winner_entity, winner_count = entities_data[0]
                runner_up_entity, runner_up_count = entities_data[1]
                
                if winner_count > runner_up_count:
                    response_parts.append(f"🏆 **Winner**: {winner_entity} with {winner_count} items")
                    difference = winner_count - runner_up_count
                    response_parts.append(f"📈 **Difference**: {difference} more items than {runner_up_entity}")
                elif winner_count == runner_up_count:
                    response_parts.append(f"🤝 **Tied**: Both {winner_entity} and {runner_up_entity} have {winner_count} items")
                
                response_parts.append("")
            
            # Basic insights
            response_parts.append("💡 **Key Insights:**")
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
        """Process Confluence-specific queries"""
        try:
            logger.info(f"Processing Confluence query: '{user_query}'")
            
            # Extract search terms from the query
            search_terms = self._extract_confluence_search_terms(user_query)
            logger.info(f"Extracted search terms: '{search_terms}'")
            
            # Search Confluence
            logger.info("Searching Confluence...")
            logger.info(f"Confluence client type: {type(self.confluence_client)}")
            logger.info(f"Confluence client config: {self.confluence_client.cfg.base_url if self.confluence_client else 'None'}")
            
            # Try multiple search strategies
            confluence_results = []
            
            # Strategy 1: Search with extracted terms
            logger.info(f"Strategy 1: Searching with extracted terms: '{search_terms}'")
            confluence_results = await self.confluence_client.search(search_terms, limit=10)
            logger.info(f"Strategy 1 found {len(confluence_results)} results")
            
            # Strategy 2: If no results, try individual keywords
            if not confluence_results and len(search_terms.split()) > 1:
                individual_keywords = search_terms.split()
                logger.info(f"Strategy 2: Searching with individual keywords: {individual_keywords}")
                for keyword in individual_keywords[:2]:  # Try top 2 keywords
                    keyword_results = await self.confluence_client.search(keyword, limit=5)
                    confluence_results.extend(keyword_results)
                    logger.info(f"Keyword '{keyword}' found {len(keyword_results)} results")
                # Remove duplicates
                seen_ids = set()
                confluence_results = [r for r in confluence_results if r.get('content', {}).get('id') not in seen_ids and not seen_ids.add(r.get('content', {}).get('id', ''))]
                logger.info(f"Strategy 2 total unique results: {len(confluence_results)}")
            
            # Strategy 3: If still no results, try broader search
            if not confluence_results:
                logger.info("Strategy 3: Trying broader search with 'insurance eligibility'")
                broader_results = await self.confluence_client.search("insurance eligibility", limit=10)
                confluence_results.extend(broader_results)
                logger.info(f"Strategy 3 found {len(broader_results)} results")
            
            logger.info(f"Final Confluence results: {len(confluence_results)}")
            logger.info(f"Confluence results: {confluence_results}")
            
            # Generate AI response for Confluence data
            logger.info("Generating AI response for Confluence data...")
            response = await self._generate_confluence_response(user_query, confluence_results)
            logger.info(f"Generated response length: {len(response)} characters")
            logger.info(f"Response preview: {response[:200]}...")
            
            return {
                "jql": f"confluence_search:{search_terms}",
                "response": response,
                "data": confluence_results,
                "intent": "confluence_search",
                "success": True
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
        """Extract relevant search terms from Confluence queries"""
        import re
        
        # Remove only very common stop words, keep important terms
        stop_words = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were']
        
        # Clean the query
        query_lower = user_query.lower()
        
        # Remove common phrases but keep important content
        query_lower = re.sub(r'\b(i need|i want|show me|find me|get me|give me|can you|please)\b', '', query_lower)
        
        # Split into words and filter
        words = query_lower.split()
        search_terms = []
        
        for word in words:
            # Remove punctuation and clean
            clean_word = re.sub(r'[^\w]', '', word)
            if clean_word and clean_word not in stop_words and len(clean_word) > 1:
                search_terms.append(clean_word)
        
        # If no meaningful terms found, try the original query
        if not search_terms:
            return user_query
        
        # Return meaningful terms for better search
        return ' '.join(search_terms[:5])  # Allow more keywords for better results
    
    async def _generate_confluence_response(self, user_query: str, confluence_results: List[Dict]) -> str:
        """Generate AI response for Confluence search results"""
        if not self.client:
            return self._basic_confluence_response(confluence_results)
        
        try:
            # Prepare data summary for AI
            if not confluence_results:
                data_summary = "No Confluence pages found matching your search."
            else:
                data_summary = f"Found {len(confluence_results)} Confluence pages:\n"
                for i, result in enumerate(confluence_results[:5]):  # Show top 5
                    title = result.get('title', 'Untitled')
                    # Get space from resultGlobalContainer if available
                    space_info = result.get('resultGlobalContainer', {})
                    space = space_info.get('title', 'Unknown Space') if space_info else 'Unknown Space'
                    excerpt = result.get('excerpt', '')[:100] + "..." if result.get('excerpt') else "No excerpt available"
                    data_summary += f"{i+1}. {title} (in {space})\n   {excerpt}\n\n"
            
            system_prompt = """You are an elite AI knowledge management consultant specializing in documentation analysis and strategic information retrieval. You help leaders find and understand critical information that drives business decisions.

Your Role:
- Help users find relevant documentation and knowledge base articles with strategic context
- Provide summaries and insights about Confluence content that impact business decisions
- Suggest related topics and pages that enhance understanding
- Explain how documentation relates to their work and organizational goals
- Connect information to broader business context and strategic initiatives

Response Guidelines:
- Be helpful and informative with strategic business context
- Provide context about why pages might be relevant to their work and goals
- Suggest next steps for finding more information and making decisions
- Use a conversational, helpful tone with professional insights
- Include specific page titles and spaces when relevant
- Connect documentation to business outcomes and decision-making

Format your response in a clear, structured way with:
- Summary of what was found with business relevance
- Key pages and their strategic importance
- Suggestions for next steps with business impact
- Related topics to explore for comprehensive understanding
- Strategic insights about the information found"""

            user_prompt = f"""User Query: "{user_query}"

Confluence Search Results:
{data_summary}

Please provide a helpful response about these Confluence search results."""

            logger.info(f"Calling OpenAI with data_summary length: {len(data_summary)}")
            logger.info(f"Data summary preview: {data_summary[:300]}...")
            
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1200
            )
            
            ai_response = response.choices[0].message.content.strip()
            logger.info(f"OpenAI response length: {len(ai_response)}")
            logger.info(f"OpenAI response preview: {ai_response[:200]}...")
            
            return ai_response
            
        except Exception as e:
            logger.error(f"AI Confluence response generation failed: {e}")
            return self._basic_confluence_response(confluence_results)
    
    def _basic_confluence_response(self, confluence_results: List[Dict]) -> str:
        """Generate basic response for Confluence results without AI"""
        if not confluence_results:
            return "📚 **Confluence Search**\n\nNo documentation found in Confluence. This search will now fall back to Jira issues."
        
        response = f"📚 **Found {len(confluence_results)} Confluence pages:**\n\n"
        
        for i, result in enumerate(confluence_results[:5]):  # Show top 5
            title = result.get('title', 'Untitled')
            # Get space from resultGlobalContainer if available
            space_info = result.get('resultGlobalContainer', {})
            space = space_info.get('title', 'Unknown Space') if space_info else 'Unknown Space'
            excerpt = result.get('excerpt', '')[:150] + "..." if result.get('excerpt') else "No excerpt available"
            
            response += f"**{i+1}. {title}**\n"
            response += f"   📍 Space: {space}\n"
            response += f"   📝 {excerpt}\n\n"
        
        if len(confluence_results) > 5:
            response += f"... and {len(confluence_results) - 5} more pages.\n"
        
        response += "\n💡 **Suggestions:**\n"
        response += "- Click on page titles to view full content\n"
        response += "- Try more specific search terms for better results\n"
        response += "- Check different spaces for related documentation\n"
        
        return response
