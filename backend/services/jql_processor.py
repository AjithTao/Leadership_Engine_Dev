"""
Enhanced JQL Processing Layer
Implements advanced JQL features including multi-entity handling, fallback queries, 
pre-aggregation, risk identification, URL enrichment, and response validation.
"""

import re
import json
import asyncio
import logging
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from enum import Enum
from services.jira_rag_handler import get_jira_rag_handler

logger = logging.getLogger(__name__)

class ResponseFormat(Enum):
    TEXT = "text"
    JSON = "json"

@dataclass
class JQLQuery:
    """Represents a JQL query with metadata"""
    query: str
    description: str
    priority: int = 1
    fallback_queries: List[str] = None
    
    def __post_init__(self):
        if self.fallback_queries is None:
            self.fallback_queries = []

@dataclass
class QueryResult:
    """Represents the result of a JQL query execution"""
    issues: List[Dict[str, Any]]
    total_count: int
    jql_used: str
    execution_time_ms: int
    has_more: bool = False
    errors: List[str] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []

@dataclass
class AggregatedData:
    """Pre-aggregated counts and metrics"""
    total_issues: int
    done_count: int
    in_progress_count: int
    to_do_count: int
    blocked_count: int
    by_assignee: Dict[str, int]
    by_project: Dict[str, int]
    by_issue_type: Dict[str, int]
    risks: List[Dict[str, Any]]
    oldest_tickets: List[Dict[str, Any]]
    recently_updated: List[Dict[str, Any]]

class EnhancedJQLProcessor:
    """Enhanced JQL processor with advanced features"""
    
    def __init__(self, jira_client, ai_engine=None):
        self.jira_client = jira_client
        self.ai_engine = ai_engine  # Add AI engine for enhanced responses
        self.conversation_memory = []  # Store last 10 interactions
        self.current_sprint_cache = None
        self.cache_timestamp = None
        
    async def process_query(self, query: str, format: ResponseFormat = ResponseFormat.TEXT) -> Dict[str, Any]:
        """Process a user query with enhanced JQL features"""
        
        # PRIORITY: Check for test case queries first (these should ALWAYS go to Jira)
        test_case_keywords = ['test case', 'test cases', 'regression test', 'automated test', 'manual test', 
                             'test automation', 'automation status', 'test status', 'test type']
        is_test_case_query = any(keyword in query.lower() for keyword in test_case_keywords)
        
        # Check if this is a Confluence query (only if NOT a test case query)
        is_confluence_query = False
        if not is_test_case_query:
            confluence_keywords = ['confluence', 'documentation', 'wiki', 'page', 'article', 'knowledge base']
            # Removed 'doc' from keywords as it's too generic and can match test case queries
            is_confluence_query = any(keyword in query.lower() for keyword in confluence_keywords)
        
        logger.info(f"🔍 Query: '{query}' - Test case query: {is_test_case_query}, Confluence detected: {is_confluence_query}")
        logger.info(f"🔍 AI engine exists: {self.ai_engine is not None}")
        logger.info(f"🔍 Confluence client exists: {self.ai_engine.confluence_client is not None if self.ai_engine else False}")
        
        if is_confluence_query and self.ai_engine and self.ai_engine.confluence_client:
            # Delegate to AI engine for Confluence processing
            confluence_result = await self.ai_engine._process_confluence_query(query)
            return {
                'response': confluence_result['response'],
                'format': format.value,
                'data': confluence_result['data'],
                'aggregated': {},
                'risks': [],
                'conversation_context': self._get_recent_context()
            }
        elif is_confluence_query:
            # Confluence query detected but no Confluence client available
            return {
                'response': 'I detected this as a Confluence query, but Confluence is not configured. Please configure your Confluence connection in the settings to search documentation.',
                'format': format.value,
                'data': [],
                'aggregated': {},
                'risks': [],
                'conversation_context': self._get_recent_context()
            }
        
        # Store in conversation memory
        self._add_to_memory(query)
        
        # Analyze query for multi-entity handling
        entities = self._extract_entities(query)
        
        # Generate JQL queries (potentially multiple for comparisons)
        jql_queries = await self._generate_jql_queries(query, entities)
        
        # Execute queries with fallback support
        results = await self._execute_queries_with_fallback(jql_queries)
        
        # Pre-aggregate data
        aggregated_data = self._aggregate_data(results)
        
        # Identify risks
        risks = self._identify_risks(results)
        
        # Enrich with URLs
        enriched_results = self._enrich_with_urls(results)
        
        # Generate response
        if format == ResponseFormat.JSON:
            response = self._generate_json_response(enriched_results, aggregated_data, risks)
        else:
            response = await self._generate_text_response(enriched_results, aggregated_data, risks, query)
        
        # Validate response
        validated_response = self._validate_response(response, query)
        
        return {
            'response': validated_response,
            'format': format.value,
            'data': enriched_results,
            'aggregated': aggregated_data,
            'risks': risks,
            'conversation_context': self._get_recent_context()
        }
    
    def _add_to_memory(self, query: str):
        """Add query to conversation memory"""
        self.conversation_memory.append({
            'query': query,
            'timestamp': datetime.now(),
            'entities': self._extract_entities(query)
        })
        
        # Keep only last 10 interactions
        if len(self.conversation_memory) > 10:
            self.conversation_memory = self.conversation_memory[-10:]
    
    def _extract_entities(self, query: str) -> Dict[str, List[str]]:
        """Extract entities from query with improved pattern matching"""
        entities = {
            'assignees': [],
            'projects': [],
            'issue_types': [],
            'statuses': [],
            'keywords': [],
            'tickets': []
        }
        
        query_lower = query.lower()
        
        # Extract ticket references (PROJ-123, CCM-456, etc.)
        ticket_pattern = r'\b([A-Z]{2,}-\d+)\b'
        entities['tickets'] = re.findall(ticket_pattern, query)
        
        # Extract assignee names with proper format handling:
        # - "Ajith" = single person (first name only)
        # - "Ajith,Ramesh" or "Ajith Ramesh" = same person (first + last name)
        # - "ajith and ramesh" = two different persons
        assignees = self._extract_assignee_names(query)
        entities['assignees'] = assignees
        
        # Extract project keys
        project_pattern = r'\b(CCM|CES|GTMS|TI|PROJ)\b'
        entities['projects'] = re.findall(project_pattern, query.upper())
        
        # Extract issue types
        issue_type_patterns = ['story', 'bug', 'task', 'epic', 'subtask']
        for itype in issue_type_patterns:
            if itype in query_lower:
                entities['issue_types'].append(itype.title())
        
        # Extract statuses
        status_patterns = ['done', 'in progress', 'to do', 'blocked', 'closed', 'open']
        for status in status_patterns:
            if status in query_lower:
                entities['statuses'].append(status.title())
        
        # Extract keywords for context
        keywords = ['sprint', 'current', 'this week', 'last week', 'today', 'yesterday', 'compare', 'vs', 'versus']
        for keyword in keywords:
            if keyword in query_lower:
                entities['keywords'].append(keyword)
        
        return entities
    
    def _extract_assignee_names(self, query: str) -> List[str]:
        """
        Extract assignee names with proper format handling:
        - "Ajith" = single person (first name only)
        - "Ajith,Ramesh" or "Ramesh,Ajith" = same person (last, first format - preserve comma)
        - "Ajith Ramesh" = same person (first + last name, space-separated)
        - "ajith and ramesh" = two different persons (when 'and' is used)
        
        Returns list of assignee names (each name can be single or "First Last" or "Last, First")
        """
        query_lower = query.lower()
        assignees = []
        
        # FIRST: Check for comma-separated names like "Ramesh,Ajith" BEFORE other processing
        # This handles the case where someone asks "Ramesh,Ajith story" - we want "Ramesh,Ajith" as one person
        comma_name_pattern = r'\b([A-Z][a-z]+,\s*[A-Z][a-z]+)\b'
        comma_matches = re.findall(comma_name_pattern, query)
        if comma_matches:
            # Found comma-separated name(s) - these are single persons (Last, First format)
            for match in comma_matches:
                # Normalize: ensure proper capitalization and spacing
                name_parts = [p.strip().title() for p in match.split(',')]
                comma_name = ','.join(name_parts)
                if comma_name:
                    assignees.append(comma_name)
                    # Remove this name from query to avoid double extraction
                    query = query.replace(match, '')
        
        # Check if "and" is present - indicates multiple people
        if ' and ' in query_lower:
            # Split by "and" to get multiple people
            parts = re.split(r'\s+and\s+', query_lower)
            for part in parts:
                part = part.strip()
                if not part:
                    continue
                
                # Skip if this part was already extracted as comma-separated
                if any(part.lower() in a.lower() or a.lower() in part.lower() for a in assignees):
                    continue
                
                # Check if this part has comma (e.g., "ajith,ramesh" = one person)
                if ',' in part:
                    # Comma-separated = one person (preserve comma format for Jira)
                    name_parts = [p.strip().title() for p in part.split(',')]
                    comma_name = ','.join(name_parts)  # Keep comma format
                    if comma_name:
                        assignees.append(comma_name)
                else:
                    # Check if it's space-separated (e.g., "ajith ramesh" = one person)
                    words = part.split()
                    if len(words) >= 2:
                        # Multiple words = full name (one person)
                        full_name = ' '.join([w.title() for w in words])
                        assignees.append(full_name)
                    elif len(words) == 1:
                        # Single word = first name only (one person)
                        assignees.append(words[0].title())
        else:
            # No "and" - treat as single person (could be first name, or first+last)
            # Skip if we already extracted a comma-separated name
            if not assignees:
                # Check for comma-separated in remaining query (e.g., "Ajith,Ramesh")
                if ',' in query:
                    # Extract the comma-separated part
                    # Pattern: word,word (possibly with spaces)
                    comma_pattern = r'\b([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)+)\b'
                    comma_match = re.search(comma_pattern, query)
                    if comma_match:
                        name_parts = [p.strip().title() for p in comma_match.group(1).split(',')]
                        comma_name = ','.join(name_parts)
                        if comma_name:
                            assignees.append(comma_name)
                else:
                    # Extract name patterns from query
                    # Pattern 1: Full name "First Last" (two capitalized words together)
                    full_name_pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b'
                    full_matches = re.findall(full_name_pattern, query)
                    if full_matches:
                        # Found full name(s) - add them
                        for match in full_matches:
                            assignees.append(match)
                    else:
                        # Pattern 2: Single first name (common names)
                        first_name_pattern = r'\b(ajith|kumar|ashwin|thyagarajan|priya|john|jane|mike|sarah|david|lisa|ramesh)\b'
                        first_matches = re.findall(first_name_pattern, query_lower)
                        if first_matches:
                            # If multiple first names found without "and", treat as one person's name parts
                            if len(first_matches) > 1:
                                # Multiple names without "and" = one person (e.g., "ajith ramesh")
                                full_name = ' '.join([m.title() for m in first_matches])
                                assignees.append(full_name)
                            else:
                                # Single first name
                                assignees.append(first_matches[0].title())
        
        # Remove duplicates while preserving order
        seen = set()
        unique_assignees = []
        for assignee in assignees:
            assignee_lower = assignee.lower()
            if assignee_lower not in seen:
                seen.add(assignee_lower)
                unique_assignees.append(assignee)
        
        return unique_assignees
    
    async def _generate_jql_queries(self, query: str, entities: Dict[str, List[str]]) -> List[JQLQuery]:
        """Generate JQL queries with multi-entity support"""
        queries = []
        
        # Check for comparison queries
        if any(comp_word in query.lower() for comp_word in ['compare', 'vs', 'versus', 'against']):
            queries.extend(await self._generate_comparison_queries(query, entities))
        else:
            queries.extend(await self._generate_single_queries(query, entities))
        
        return queries
    
    async def _generate_comparison_queries(self, query: str, entities: Dict[str, List[str]]) -> List[JQLQuery]:
        """Generate multiple JQL queries for comparison scenarios"""
        queries = []
        
        # Extract multiple assignees for comparison
        assignees = entities.get('assignees', [])
        if len(assignees) >= 2:
            for assignee in assignees:
                assignee_info = self.jira_client.get_assignee_info(assignee)
                if assignee_info:
                    jql = f'assignee = "{assignee_info["accountId"]}"'
                    queries.append(JQLQuery(
                        query=jql,
                        description=f"Tickets assigned to {assignee}",
                        priority=1
                    ))
        
        # Extract multiple projects for comparison
        projects = entities.get('projects', [])
        if len(projects) >= 2:
            for project in projects:
                jql = f'project = "{project}"'
                queries.append(JQLQuery(
                    query=jql,
                    description=f"Tickets in project {project}",
                    priority=1
                ))
        
        return queries
    
    async def _generate_single_queries(self, query: str, entities: Dict[str, List[str]]) -> List[JQLQuery]:
        """Generate single JQL query based on entities"""
        jql_parts = []
        
        # Sprint context - use same logic as Jira UI with fallback
        if 'sprint' in query.lower() or 'current' in query.lower():
            # First try openSprints() function like Jira UI
            jql_parts.append('sprint in openSprints()')
            
            # Add fallback for when no active sprint exists
            try:
                # Check if we have a board_id to get latest closed sprint
                if hasattr(self.jira_client, 'cfg') and self.jira_client.cfg.board_id:
                    latest_closed_sprint_id = await self.jira_client.get_latest_closed_sprint_id(self.jira_client.cfg.board_id)
                    if latest_closed_sprint_id:
                        # Add fallback query using latest closed sprint
                        fallback_sprint_query = f'sprint = {latest_closed_sprint_id}'
                        logger.info(f"Added fallback sprint query: {fallback_sprint_query}")
            except Exception as e:
                logger.warning(f"Could not get latest closed sprint for fallback: {e}")
        
        # Assignee filter
        assignees = entities.get('assignees', [])
        if assignees:
            # Try to get accountIds first for better accuracy
            account_ids = []
            name_fallbacks = []
            
            for assignee in assignees:
                # Use async method since we're in an async context
                assignee_info = await self.jira_client._get_assignee_info_async(assignee)
                if assignee_info and assignee_info.get("accountId"):
                    account_ids.append(assignee_info["accountId"])
                else:
                    # Fallback to name matching
                    name_fallbacks.append(assignee)
            
            if account_ids:
                # Use accountId with 'in' clause for multiple assignees (more efficient)
                if len(account_ids) == 1:
                    jql_parts.append(f'assignee = "{account_ids[0]}"')
                else:
                    # Multiple assignees: use 'in' clause
                    account_ids_str = ', '.join([f'"{aid}"' for aid in account_ids])
                    jql_parts.append(f'assignee in ({account_ids_str})')
            elif name_fallbacks:
                # Fallback to name matching
                if len(name_fallbacks) == 1:
                    # Check if it's comma-separated (e.g., "Ramesh,Ajith")
                    if ',' in name_fallbacks[0]:
                        # Use 'in' clause with comma-separated name as single string
                        jql_parts.append(f"assignee in ('{name_fallbacks[0]}')")
                    else:
                        # Regular name matching
                        jql_parts.append(f'assignee ~ "{name_fallbacks[0]}"')
                else:
                    # Multiple assignees: use 'in' clause with names
                    names_str = ', '.join([f"'{name}'" for name in name_fallbacks])
                    jql_parts.append(f'assignee in ({names_str})')
        
        # Project filter
        projects = entities.get('projects', [])
        if projects:
            project_conditions = [f'project = "{proj}"' for proj in projects]
            jql_parts.append(f'({" OR ".join(project_conditions)})')
        
        # Issue type filter
        issue_types = entities.get('issue_types', [])
        if issue_types:
            type_conditions = [f'type= "{itype}"' for itype in issue_types]
            jql_parts.append(f'({" OR ".join(type_conditions)})')
        
        # Status filter
        statuses = entities.get('statuses', [])
        if statuses:
            status_conditions = [f'status = "{status}"' for status in statuses]
            jql_parts.append(f'({" OR ".join(status_conditions)})')
        
        # Time-based filters
        if 'this week' in query.lower():
            jql_parts.append('updated >= startOfWeek()')
        elif 'last week' in query.lower():
            jql_parts.append('updated >= startOfWeek(-1) AND updated < startOfWeek()')
        elif 'today' in query.lower():
            jql_parts.append('updated >= startOfDay()')
        elif 'yesterday' in query.lower():
            jql_parts.append('updated >= startOfDay(-1) AND updated < startOfDay()')
        
        # Build final JQL
        base_jql = ' AND '.join(jql_parts) if jql_parts else 'ORDER BY updated DESC'
        final_jql = f'{base_jql} ORDER BY updated DESC'
        
        # Log the generated JQL for debugging
        logger.info(f"Generated JQL for sprint query: {final_jql}")
        
        # Generate fallback queries
        fallback_queries = []
        if jql_parts:
            # For sprint queries, add specific sprint fallbacks
            if 'sprint' in query.lower() or 'current' in query.lower():
                try:
                    if hasattr(self.jira_client, 'cfg') and self.jira_client.cfg.board_id:
                        latest_closed_sprint_id = await self.jira_client.get_latest_closed_sprint_id(self.jira_client.cfg.board_id)
                        if latest_closed_sprint_id:
                            # Replace openSprints() with specific sprint ID
                            sprint_fallback_parts = [part.replace('sprint in openSprints()', f'sprint = {latest_closed_sprint_id}') for part in jql_parts]
                            sprint_fallback_jql = ' AND '.join(sprint_fallback_parts)
                            fallback_queries.append(f'{sprint_fallback_jql} ORDER BY updated DESC')
                            logger.info(f"Added sprint fallback: {sprint_fallback_jql}")
                except Exception as e:
                    logger.warning(f"Could not create sprint fallback: {e}")
            
            # Remove sprint filter entirely (but only if it's not a sprint-specific question)
            if not ('sprint' in query.lower() or 'current' in query.lower()):
                fallback_jql = ' AND '.join([part for part in jql_parts if 'sprint' not in part.lower()])
                if fallback_jql:
                    fallback_queries.append(f'{fallback_jql} ORDER BY updated DESC')
            else:
                # For sprint questions, ensure we don't degrade to project-level queries
                logger.info("Sprint-specific question detected - avoiding project-level fallback")
            
            # Expand time range
            time_fallback = ' AND '.join([part for part in jql_parts if 'updated' not in part.lower()])
            if time_fallback:
                fallback_queries.append(f'{time_fallback} AND updated >= -30d ORDER BY updated DESC')
        
        return [JQLQuery(
            query=final_jql,
            description="Primary query",
            priority=1,
            fallback_queries=fallback_queries
        )]
    
    async def _execute_queries_with_fallback(self, queries: List[JQLQuery]) -> List[QueryResult]:
        """Execute queries with fallback support"""
        results = []
        
        for jql_query in queries:
            result = await self._execute_single_query(jql_query)
            results.append(result)
        
        return results
    
    async def _execute_single_query(self, jql_query: JQLQuery) -> QueryResult:
        """Execute a single JQL query with fallback support"""
        start_time = datetime.now()
        
        try:
            # Try primary query
            issues = await self.jira_client.search(jql_query.query, max_results=100)
            
            if issues.get('total', 0) == 0 and jql_query.fallback_queries:
                # Try fallback queries
                for fallback_jql in jql_query.fallback_queries:
                    fallback_issues = await self.jira_client.search(fallback_jql, max_results=100)
                    if fallback_issues.get('total', 0) > 0:
                        issues = fallback_issues
                        jql_query.query = fallback_jql  # Update to show which query worked
                        break
            
            # If no results from JQL at all, try semantic fallback (RAG) on recent issues
            if issues.get('total', 0) == 0:
                try:
                    rag_handler = get_jira_rag_handler()
                    if rag_handler:
                        logger.info("⚠️ JQL returned 0 issues, using Jira RAG semantic fallback")
                        recent_search = await self.jira_client.search(
                            "project is not EMPTY ORDER BY updated DESC",
                            max_results=200
                        )
                        recent_issues = recent_search.get('issues', [])
                        if recent_issues:
                            similar = await rag_handler.find_similar_issues(
                                query=jql_query.query,
                                issues=recent_issues,
                                top_k=10
                            )
                            if similar:
                                # Replace issues with semantic results structure
                                issues = {
                                    'issues': similar,
                                    'total': len(similar),
                                    'rag_fallback': True
                                }
                                logger.info(f"Semantic fallback found {len(similar)} issues")
                except Exception as rag_err:
                    logger.warning(f"Semantic fallback failed: {rag_err}")
            
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            
            # Log result for debugging
            total_issues = issues.get('total', 0)
            print(f"📋 JQL EXECUTED: '{jql_query.query}' → {total_issues} issues found", flush=True)
            logger.info(f"JQL '{jql_query.query}' returned {total_issues} total issues")
            if issues.get('issues'):
                first_few_keys = [issue.get('key') for issue in issues.get('issues', [])[:3]]
                print(f"🎫 SAMPLE TICKETS: {', '.join(first_few_keys)}", flush=True)
                logger.info(f"First few ticket keys: {first_few_keys}")
            
            return QueryResult(
                issues=issues.get('issues', []),
                total_count=issues.get('total', 0),
                jql_used=jql_query.query,
                execution_time_ms=int(execution_time),
                has_more=issues.get('total', 0) > len(issues.get('issues', []))
            )
            
        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            return QueryResult(
                issues=[],
                total_count=0,
                jql_used=jql_query.query,
                execution_time_ms=int(execution_time),
                errors=[str(e)]
            )
    
    def _aggregate_data(self, results: List[QueryResult]) -> AggregatedData:
        """Pre-aggregate counts and metrics"""
        all_issues = []
        for result in results:
            all_issues.extend(result.issues)
        
        # Count by status
        status_counts = {'Done': 0, 'In Progress': 0, 'To Do': 0, 'Blocked': 0}
        by_assignee = {}
        by_project = {}
        by_issue_type = {}
        
        for issue in all_issues:
            # Status counting
            status = issue.get('fields', {}).get('status', {}).get('name', 'Unknown')
            if status in status_counts:
                status_counts[status] += 1
            
            # Assignee counting
            assignee = issue.get('fields', {}).get('assignee', {})
            if assignee:
                assignee_name = assignee.get('displayName', 'Unknown')
                by_assignee[assignee_name] = by_assignee.get(assignee_name, 0) + 1
            
            # Project counting
            project = issue.get('fields', {}).get('project', {})
            if project:
                project_key = project.get('key', 'Unknown')
                by_project[project_key] = by_project.get(project_key, 0) + 1
            
            # Issue type counting
            issue_type = issue.get('fields', {}).get('type', {})
            if issue_type:
                type_name = issue_type.get('name', 'Unknown')
                by_issue_type[type_name] = by_issue_type.get(type_name, 0) + 1
        
        return AggregatedData(
            total_issues=len(all_issues),
            done_count=status_counts['Done'],
            in_progress_count=status_counts['In Progress'],
            to_do_count=status_counts['To Do'],
            blocked_count=status_counts['Blocked'],
            by_assignee=by_assignee,
            by_project=by_project,
            by_issue_type=by_issue_type,
            risks=[],  # Will be populated by _identify_risks
            oldest_tickets=sorted(all_issues, key=lambda x: x.get('fields', {}).get('created', ''))[:5],
            recently_updated=sorted(all_issues, key=lambda x: x.get('fields', {}).get('updated', ''), reverse=True)[:5]
        )
    
    def _identify_risks(self, results: List[QueryResult]) -> List[Dict[str, Any]]:
        """Identify risk indicators"""
        risks = []
        all_issues = []
        for result in results:
            all_issues.extend(result.issues)
        
        # Find oldest open tickets
        open_issues = [issue for issue in all_issues 
                     if issue.get('fields', {}).get('status', {}).get('name') not in ['Done', 'Closed']]
        
        if open_issues:
            oldest_issues = sorted(open_issues, key=lambda x: x.get('fields', {}).get('created', ''))[:3]
            for issue in oldest_issues:
                created_date = issue.get('fields', {}).get('created', '')
                if created_date:
                    try:
                        # Handle both ISO format with and without timezone
                        if created_date.endswith('Z'):
                            created_dt = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
                        else:
                            created_dt = datetime.fromisoformat(created_date)
                        
                        # Ensure both datetimes are timezone-aware
                        if created_dt.tzinfo is None:
                            created_dt = created_dt.replace(tzinfo=timezone.utc)
                        
                        now = datetime.now(timezone.utc)
                        days_old = (now - created_dt).days
                        
                        if days_old > 30:  # More than 30 days old
                            risks.append({
                                'type': 'old_ticket',
                                'severity': 'high' if days_old > 60 else 'medium',
                                'issue_key': issue.get('key'),
                                'summary': issue.get('fields', {}).get('summary', ''),
                                'days_old': days_old,
                                'assignee': issue.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned')
                            })
                    except Exception as e:
                        # Skip issues with invalid date formats
                        continue
        
        # Find frequently updated tickets (potential blockers)
        frequently_updated = []
        for issue in all_issues:
            updated_count = len(issue.get('changelog', {}).get('histories', []))
            if updated_count > 10:  # More than 10 updates
                frequently_updated.append({
                    'type': 'frequent_updates',
                    'severity': 'medium',
                    'issue_key': issue.get('key'),
                    'summary': issue.get('fields', {}).get('summary', ''),
                    'update_count': updated_count,
                    'assignee': issue.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned')
                })
        
        risks.extend(frequently_updated[:3])  # Top 3 frequently updated
        
        return risks
    
    def _enrich_with_urls(self, results: List[QueryResult]) -> List[QueryResult]:
        """Enrich results with clickable JIRA URLs"""
        base_url = self.jira_client.cfg.base_url.rstrip('/')
        
        for result in results:
            for issue in result.issues:
                issue_key = issue.get('key')
                if issue_key:
                    issue['jira_url'] = f"{base_url}/browse/{issue_key}"
        
        return results
    
    async def _generate_text_response(self, results: List[QueryResult], aggregated: AggregatedData, 
                               risks: List[Dict[str, Any]], original_query: str) -> str:
        """Generate human-readable text response with AI enhancement"""
        
        # Generate basic response first
        response_parts = []
        
        # Direct answer based on query type
        if 'compare' in original_query.lower() or 'vs' in original_query.lower():
            response_parts.append(self._generate_comparison_response(results, aggregated))
        elif 'status' in original_query.lower() or 'sprint' in original_query.lower():
            response_parts.append(self._generate_status_response(aggregated))
        elif 'blocked' in original_query.lower():
            response_parts.append(self._generate_blocked_response(results, aggregated))
        else:
            response_parts.append(self._generate_general_response(results, aggregated))
        
        # Add risk alerts if any
        if risks:
            risk_text = self._generate_risk_alerts(risks)
            if risk_text:
                response_parts.append(risk_text)
        
        basic_response = '\n\n'.join(response_parts)
        
        # If AI engine is available, enhance the response
        if self.ai_engine and self.ai_engine.client:
            try:
                # Prepare data for AI enhancement
                issues_data = []
                for result in results:
                    issues_data.extend(result.issues)
                
                # Use AI engine to enhance the response
                enhanced_response = await self._enhance_with_ai(original_query, basic_response, issues_data, aggregated)
                return enhanced_response
            except Exception as e:
                logger.warning(f"AI enhancement failed, using basic response: {e}")
                return basic_response
        
        return basic_response
    
    def _generate_comparison_response(self, results: List[QueryResult], aggregated: AggregatedData) -> str:
        """Generate comparison response"""
        response = "**Comparison Results:**\n"
        
        for i, result in enumerate(results):
            if result.total_count > 0:
                response += f"\n**Set {i+1}:** {result.total_count} tickets\n"
                response += f"- Done: {aggregated.done_count}\n"
                response += f"- In Progress: {aggregated.in_progress_count}\n"
                response += f"- To Do: {aggregated.to_do_count}\n"
                
                # Show top assignees
                top_assignees = sorted(aggregated.by_assignee.items(), key=lambda x: x[1], reverse=True)[:3]
                if top_assignees:
                    response += f"- Top contributors: {', '.join([f'{name} ({count})' for name, count in top_assignees])}\n"
        
        return response
    
    def _generate_status_response(self, aggregated: AggregatedData) -> str:
        """Generate status response"""
        response = f"**Current Status:**\n"
        response += f"- Total tickets: {aggregated.total_issues}\n"
        response += f"- Done: {aggregated.done_count}\n"
        response += f"- In Progress: {aggregated.in_progress_count}\n"
        response += f"- To Do: {aggregated.to_do_count}\n"
        response += f"- Blocked: {aggregated.blocked_count}\n"
        
        if aggregated.by_assignee:
            response += f"\n**By Assignee:**\n"
            for assignee, count in sorted(aggregated.by_assignee.items(), key=lambda x: x[1], reverse=True):
                response += f"- {assignee}: {count} tickets\n"
        
        return response
    
    def _generate_blocked_response(self, results: List[QueryResult], aggregated: AggregatedData) -> str:
        """Generate blocked tickets response"""
        blocked_issues = []
        for result in results:
            for issue in result.issues:
                status = issue.get('fields', {}).get('status', {}).get('name', '')
                if status.lower() in ['blocked', 'waiting']:
                    blocked_issues.append(issue)
        
        if not blocked_issues:
            return "No blocked tickets found."
        
        response = f"**Blocked Tickets ({len(blocked_issues)}):**\n"
        for issue in blocked_issues[:5]:  # Show top 5
            issue_key = issue.get('key')
            summary = issue.get('fields', {}).get('summary', '')
            assignee = issue.get('fields', {}).get('assignee', {}).get('displayName', 'Unassigned')
            response += f"- {issue_key}: {summary} (assigned to {assignee})\n"
        
        return response
    
    def _generate_general_response(self, results: List[QueryResult], aggregated: AggregatedData) -> str:
        """Generate general response"""
        total_issues = sum(result.total_count for result in results)
        
        response = f"**Found {total_issues} tickets:**\n"
        response += f"- Done: {aggregated.done_count}\n"
        response += f"- In Progress: {aggregated.in_progress_count}\n"
        response += f"- To Do: {aggregated.to_do_count}\n"
        response += f"- Blocked: {aggregated.blocked_count}\n"
        
        # Show recent examples
        if aggregated.recently_updated:
            response += f"\n**Recent Examples:**\n"
            for issue in aggregated.recently_updated[:3]:
                issue_key = issue.get('key')
                summary = issue.get('fields', {}).get('summary', '')
                status = issue.get('fields', {}).get('status', {}).get('name', '')
                response += f"- {issue_key}: {summary} ({status})\n"
        
        return response
    
    def _generate_risk_alerts(self, risks: List[Dict[str, Any]]) -> str:
        """Generate risk alerts"""
        if not risks:
            return ""
        
        response = "**⚠️ Risk Alerts:**\n"
        
        for risk in risks:
            if risk['type'] == 'old_ticket':
                severity_icon = "🔴" if risk['severity'] == 'high' else "🟡"
                response += f"{severity_icon} {risk['issue_key']} is {risk['days_old']} days old (assigned to {risk['assignee']})\n"
            elif risk['type'] == 'frequent_updates':
                response += f"🟡 {risk['issue_key']} has {risk['update_count']} updates (potential blocker)\n"
        
        return response
    
    def _generate_json_response(self, results: List[QueryResult], aggregated: AggregatedData, 
                               risks: List[Dict[str, Any]]) -> str:
        """Generate machine-readable JSON response"""
        json_data = {
            'summary': {
                'total_issues': aggregated.total_issues,
                'status_counts': {
                    'done': aggregated.done_count,
                    'in_progress': aggregated.in_progress_count,
                    'to_do': aggregated.to_do_count,
                    'blocked': aggregated.blocked_count
                },
                'by_assignee': aggregated.by_assignee,
                'by_project': aggregated.by_project,
                'by_issue_type': aggregated.by_issue_type
            },
            'risks': risks,
            'recent_tickets': [
                {
                    'key': issue.get('key'),
                    'summary': issue.get('fields', {}).get('summary'),
                    'status': issue.get('fields', {}).get('status', {}).get('name'),
                    'assignee': issue.get('fields', {}).get('assignee', {}).get('displayName'),
                    'url': issue.get('jira_url')
                }
                for issue in aggregated.recently_updated[:10]
            ],
            'execution_info': {
                'queries_executed': len(results),
                'total_execution_time_ms': sum(result.execution_time_ms for result in results),
                'jql_queries': [result.jql_used for result in results]
            }
        }
        
        return json.dumps(json_data, indent=2)
    
    def _validate_response(self, response: str, original_query: str) -> str:
        """Validate response and auto-reprompt if needed"""
        response_lower = response.lower()
        
        # Check for required elements
        has_ticket_ids = bool(re.search(r'\b[A-Z]{2,}-\d+\b', response))
        has_counts = bool(re.search(r'\b\d+\b', response))
        has_statuses = any(status in response_lower for status in ['done', 'in progress', 'to do', 'blocked'])
        
        # If missing critical elements, try to enhance response
        if not has_ticket_ids or not has_counts or not has_statuses:
            enhanced_response = self._enhance_response(response, original_query)
            if enhanced_response != response:
                return enhanced_response
        
        return response
    
    def _enhance_response(self, response: str, original_query: str) -> str:
        """Enhance response with missing elements"""
        # This would typically involve re-prompting the LLM with specific instructions
        # For now, we'll add a note about missing data
        enhancement_note = "\n\n*Note: Some specific ticket details may not be available in the current data.*"
        return response + enhancement_note
    
    def _get_recent_context(self) -> List[Dict[str, Any]]:
        """Get recent conversation context"""
        return self.conversation_memory[-5:] if self.conversation_memory else []
    
    async def _get_current_sprint_id(self) -> Optional[str]:
        """Get current sprint ID with caching"""
        # Check cache first
        if self.current_sprint_cache and self.cache_timestamp:
            if datetime.now() - self.cache_timestamp < timedelta(minutes=30):
                return self.current_sprint_cache
        
        try:
            # Get active sprints
            sprints = await self.jira_client.get_active_sprints()
            if sprints:
                # Find current sprint (active and not closed)
                for sprint in sprints:
                    if sprint.get('state') == 'active':
                        self.current_sprint_cache = str(sprint.get('id'))
                        self.cache_timestamp = datetime.now()
                        return self.current_sprint_cache
            
            return None
        except Exception as e:
            logger.error(f"Failed to get current sprint: {e}")
            return None
    
    async def _enhance_with_ai(self, original_query: str, basic_response: str, 
                              issues_data: List[Dict[str, Any]], aggregated: AggregatedData) -> str:
        """Enhance basic response using AI engine"""
        try:
            # Create a mock query analysis for the AI engine
            query_analysis = {
                "intent": "general_query",
                "jql": "project is not EMPTY",
                "response_type": "list"
            }
            
            # Use the AI engine's response generation
            enhanced_response = await self.ai_engine._generate_response(
                original_query, 
                query_analysis, 
                issues_data, 
                aggregated.total_issues,
                len(issues_data)
            )
            
            return enhanced_response
            
        except Exception as e:
            logger.error(f"AI enhancement failed: {e}")
            return basic_response
