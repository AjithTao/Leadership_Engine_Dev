"""
Jira RAG Handler - Vector Search for Jira Issues
Provides semantic search for Jira issues using embeddings
Uses Databricks embeddings endpoint with direct HTTP calls for better compatibility
"""

import os
import logging
from typing import List, Dict, Any, Optional
import httpx
import math

logger = logging.getLogger(__name__)

class JiraRAGHandler:
    """
    RAG handler for Jira issues using OpenAI embeddings
    Provides semantic search for finding similar issues
    """
    
    def __init__(self):
        self.api_key = None
        self.embedding_endpoint = None
        self._initialize()
    
    def _initialize(self):
        """Initialize Databricks embeddings endpoint configuration"""
        try:
            # Prefer dedicated embeddings key/endpoint if provided
            self.api_key = os.getenv("OPENAI_EMBEDDINGS_API_KEY") or os.getenv("OPENAI_API_KEY")
            self.embedding_endpoint = os.getenv(
                "DATABRICKS_EMBEDDING_ENDPOINT",
                os.getenv(
                    "OPENAI_EMBEDDINGS_API_ENDPOINT",
                    "https://dbc-46217bae-ef1b.cloud.databricks.com/serving-endpoints/databricks-gte-large-en/invocations"
                )
            )

            if self.api_key:
                endpoint_name = self.embedding_endpoint.split("/serving-endpoints/")[1].split("/")[0] if "/serving-endpoints/" in self.embedding_endpoint else "custom"
                logger.info(f"✅ Jira RAG Handler initialized with Databricks embeddings endpoint: {endpoint_name}")
            else:
                logger.warning("⚠️ OPENAI_API_KEY/OPENAI_EMBEDDINGS_API_KEY not found - Jira semantic search will use keyword matching")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Jira RAG Handler: {e}", exc_info=True)
            self.api_key = None
            self.embedding_endpoint = None
    
    def _get_issue_text(self, issue: Dict[str, Any]) -> str:
        """Extract searchable text from a Jira issue"""
        fields = issue.get('fields', {})
        summary = fields.get('summary', '')
        description = fields.get('description', '')
        
        # Safely extract nested fields with None checks
        issue_type_obj = fields.get('type') or fields.get('issuetype')
        issue_type = issue_type_obj.get('name', '') if issue_type_obj else ''
        
        status_obj = fields.get('status')
        status = status_obj.get('name', '') if status_obj else ''
        
        # Fix: Handle None assignee properly
        assignee_obj = fields.get('assignee')
        if assignee_obj and isinstance(assignee_obj, dict):
            assignee = assignee_obj.get('displayName', 'Unassigned')
        else:
            assignee = 'Unassigned'
        
        # Fix: Handle None project properly
        project_obj = fields.get('project')
        if project_obj and isinstance(project_obj, dict):
            project = project_obj.get('key', '')
        else:
            project = ''
        
        # Combine all searchable fields
        text_parts = [
            summary,
            description if description else '',
            f"Issue type: {issue_type}" if issue_type else '',
            f"Status: {status}" if status else '',
            f"Assignee: {assignee}",
            f"Project: {project}" if project else ''
        ]
        
        return " ".join(filter(None, text_parts))
    
    async def _get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Get embeddings using Databricks endpoint (direct HTTP approach)
        Uses batch processing for efficiency
        """
        if not self.api_key or not self.embedding_endpoint:
            raise ValueError("API key or embedding endpoint not configured")
        
        # Ensure endpoint URL is correct (remove any /api/2.0/ if accidentally added)
        endpoint_url = self.embedding_endpoint
        if "/api/2.0/serving-endpoints/" in endpoint_url:
            endpoint_url = endpoint_url.replace("/api/2.0/serving-endpoints/", "/serving-endpoints/")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "input": texts
        }
        
        try:
            logger.debug(f"📤 Calling embeddings endpoint: {endpoint_url}")
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    endpoint_url,
                    json=payload,
                    headers=headers
                )
                response.raise_for_status()
                result = response.json()
                
                # Handle Databricks response format
                if "data" in result:
                    # Format: { "data": [{"embedding": [...], "index": 0}, ...] }
                    sorted_data = sorted(result["data"], key=lambda x: x.get("index", 0))
                    return [item["embedding"] for item in sorted_data]
                elif "embeddings" in result:
                    # Format: { "embeddings": [[...], [...]] }
                    return result["embeddings"]
                else:
                    logger.error(f"Unexpected embedding response format: {list(result.keys())}")
                    raise ValueError(f"Unexpected response format: {list(result.keys())}")
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting embeddings: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Failed to get embeddings: {e}")
            raise
    
    async def find_similar_issues(
        self, 
        query: str, 
        issues: List[Dict[str, Any]], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find semantically similar Jira issues using embeddings
        
        Args:
            query: Natural language query
            issues: List of Jira issues to search through
            top_k: Number of top results to return
            
        Returns:
            List of issues sorted by similarity score
        """
        if not self.api_key or not self.embedding_endpoint:
            # Fallback to keyword matching
            return self._keyword_fallback(query, issues, top_k)
        
        try:
            # Get query embedding
            query_embeddings = await self._get_embeddings([query])
            query_embedding = query_embeddings[0]
            
            # Prepare issue texts for batch embedding
            issue_texts = [self._get_issue_text(issue) for issue in issues]
            
            # Get embeddings for all issues in one batch call (more efficient)
            issue_embeddings = await self._get_embeddings(issue_texts)
            
            # Calculate similarity for each issue
            issue_scores = []
            for issue, issue_embedding in zip(issues, issue_embeddings):
                similarity = self._cosine_similarity(query_embedding, issue_embedding)
                issue_scores.append({
                    'issue': issue,
                    'similarity': similarity,
                    'score': similarity
                })
            
            # Sort by similarity and return top_k
            issue_scores.sort(key=lambda x: x['similarity'], reverse=True)
            top_issues = issue_scores[:top_k]
            
            # Add similarity score to issues
            results = []
            for item in top_issues:
                issue = item['issue'].copy()
                issue['semantic_score'] = item['similarity']
                issue['rag_search'] = True
                results.append(issue)
            
            logger.info(f"✅ Found {len(results)} similar issues for query: {query[:50]}...")
            return results
            
        except Exception as e:
            logger.error(f"❌ Jira RAG search failed: {e}", exc_info=True)
            # Fallback to keyword matching
            return self._keyword_fallback(query, issues, top_k)
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        import math
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        magnitude1 = math.sqrt(sum(a * a for a in vec1))
        magnitude2 = math.sqrt(sum(a * a for a in vec2))
        
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0
        
        return dot_product / (magnitude1 * magnitude2)
    
    def _keyword_fallback(
        self, 
        query: str, 
        issues: List[Dict[str, Any]], 
        top_k: int
    ) -> List[Dict[str, Any]]:
        """Fallback to keyword-based search when embeddings unavailable"""
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        issue_scores = []
        for issue in issues:
            issue_text = self._get_issue_text(issue).lower()
            issue_words = set(issue_text.split())
            
            # Calculate Jaccard similarity
            intersection = len(query_words.intersection(issue_words))
            union = len(query_words.union(issue_words))
            similarity = intersection / union if union > 0 else 0.0
            
            issue_scores.append({
                'issue': issue,
                'similarity': similarity
            })
        
        # Sort and return top_k
        issue_scores.sort(key=lambda x: x['similarity'], reverse=True)
        top_issues = issue_scores[:top_k]
        
        results = []
        for item in top_issues:
            issue = item['issue'].copy()
            issue['semantic_score'] = item['similarity']
            issue['rag_search'] = False  # Using keyword fallback
            results.append(issue)
        
        logger.info(f"⚠️ Using keyword fallback for Jira search: {query[:50]}...")
        return results

# Global instance
_jira_rag_handler: Optional[JiraRAGHandler] = None

def get_jira_rag_handler() -> Optional[JiraRAGHandler]:
    """Get or create Jira RAG handler instance"""
    global _jira_rag_handler
    if _jira_rag_handler is None:
        _jira_rag_handler = JiraRAGHandler()
    return _jira_rag_handler

