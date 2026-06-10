"""
GitHub RAG Handler - Vector Search for GitHub Issues and PRs
Provides semantic search for GitHub issues and pull requests using embeddings
Uses Databricks embeddings endpoint with direct HTTP calls for better compatibility
"""

import os
import logging
from typing import List, Dict, Any, Optional
import httpx
import math

logger = logging.getLogger(__name__)

class GitHubRAGHandler:
    """
    RAG handler for GitHub issues and PRs using OpenAI embeddings
    Provides semantic search for finding similar issues/PRs
    """
    
    def __init__(self):
        self.api_key = None
        self.embedding_endpoint = None
        self._initialize()
    
    def _initialize(self):
        """Initialize Databricks embeddings endpoint configuration"""
        try:
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
                logger.info(f"✅ GitHub RAG Handler initialized with Databricks embeddings endpoint: {endpoint_name}")
            else:
                logger.warning("⚠️ OPENAI_API_KEY/OPENAI_EMBEDDINGS_API_KEY not found - GitHub semantic search will use keyword matching")
        except Exception as e:
            logger.error(f"❌ Failed to initialize GitHub RAG Handler: {e}")
            self.api_key = None
            self.embedding_endpoint = None
    
    def _get_issue_text(self, issue: Dict[str, Any]) -> str:
        """Extract searchable text from a GitHub issue or PR"""
        title = issue.get('title', '')
        body = issue.get('body', '')
        state = issue.get('state', '')
        issue_type = 'Pull Request' if 'pull_request' in issue else 'Issue'
        labels = [label.get('name', '') for label in issue.get('labels', [])]
        assignees = [assignee.get('login', '') for assignee in issue.get('assignees', [])]
        repo = issue.get('repository_url', '').split('/')[-1] if issue.get('repository_url') else ''
        
        # Combine all searchable fields
        text_parts = [
            title,
            body if body else '',
            f"Type: {issue_type}",
            f"State: {state}",
            f"Labels: {', '.join(labels)}" if labels else '',
            f"Assignees: {', '.join(assignees)}" if assignees else '',
            f"Repository: {repo}" if repo else ''
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
        Find semantically similar GitHub issues/PRs using embeddings
        
        Args:
            query: Natural language query
            issues: List of GitHub issues/PRs to search through
            top_k: Number of top results to return
            
        Returns:
            List of issues/PRs sorted by similarity score
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
            
            logger.info(f"✅ Found {len(results)} similar GitHub issues/PRs for query: {query[:50]}...")
            return results
            
        except Exception as e:
            logger.error(f"❌ GitHub RAG search failed: {e}", exc_info=True)
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
        
        logger.info(f"⚠️ Using keyword fallback for GitHub search: {query[:50]}...")
        return results

# Global instance
_github_rag_handler: Optional[GitHubRAGHandler] = None

def get_github_rag_handler() -> Optional[GitHubRAGHandler]:
    """Get or create GitHub RAG handler instance"""
    global _github_rag_handler
    if _github_rag_handler is None:
        _github_rag_handler = GitHubRAGHandler()
    return _github_rag_handler

