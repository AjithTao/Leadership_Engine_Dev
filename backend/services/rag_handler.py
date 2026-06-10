# Databricks RAG Handler for Model Serving
# This file can be deployed directly to Databricks Model Serving
# It handles vector search + LLM RAG queries

import json
import os
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Note: In Databricks notebooks, replace these imports with:
# from databricks.vector_search.client import VectorSearchClient
# from databricks.sdk import WorkspaceClient
# import openai

class LeadershipRAGHandler:
    """
    RAG (Retrieval-Augmented Generation) handler for Leadership Quality Tool.
    
    Workflow:
    1. User asks a question
    2. Search Confluence docs in Vector Search index
    3. Retrieve top 5 similar documents
    4. Pass context to OpenAI GPT-4o-mini
    5. Return answer + citations + confidence scores
    """
    
    def __init__(self, 
                 vector_search_endpoint: str = "leadership-vector-endpoint",
                 vector_search_index: str = "leadership_poc.rag.confluence_index",
                 embedding_model: str = "databricks-gte-large-en",
                 llm_model: str = "databricks-gpt-5-1"):
        """
        Initialize RAG handler.
        
        In Databricks:
        - VectorSearchClient auto-initializes from workspace
        - OpenAI client auto-initializes from OPENAI_API_KEY env var
        """
        self.vector_search_endpoint = vector_search_endpoint
        self.vector_search_index = vector_search_index
        self.embedding_model = embedding_model
        self.llm_model = llm_model
        
        # These will be set after initialization
        self.vector_index = None
        self.openai_client = None
        
        logger.info("✅ RAG Handler initialized (clients will be set after initialization)")
    
    def set_clients(self, vector_index, openai_client):
        """Set clients after initialization (called in Databricks notebook)"""
        self.vector_index = vector_index
        self.openai_client = openai_client
    
    def search_documents(self, 
                        query: str, 
                        num_results: int = 5,
                        min_score: float = 0.0) -> List[Dict[str, Any]]:
        """
        Search for documents with priority:
        1. Databricks Vector Search (if available)
        2. Local persistent storage (unified_rag_handler)
        3. Confluence API (last resort)
        
        Returns:
            List of documents with id, text, score, and metadata
        """
        # Priority 1: Try Databricks Vector Search first (if available)
        if self.vector_index:
            try:
                # Vector Search similarity_search returns results
                results = self.vector_index.similarity_search(
                    query_text=query,
                    num_results=num_results
                )
                
                docs = []
                
                # Parse results from Vector Search API
                for result in results.get("result", {}).get("data_array", []):
                    score = float(result[2]) if len(result) > 2 else 0.0
                    
                    # Filter by minimum score
                    if score < min_score:
                        continue
                    
                    docs.append({
                        "id": result[0] if len(result) > 0 else "unknown",
                        "text": result[1] if len(result) > 1 else "",
                        "score": score,
                        "metadata": {
                            "page_title": result[3] if len(result) > 3 else "Unknown",
                            "source_url": result[4] if len(result) > 4 else "",
                            "source_type": result[5] if len(result) > 5 else "confluence"
                        }
                    })
                
                if docs:
                    logger.info(f"✅ Found {len(docs)} documents via Databricks Vector Search for query: {query[:50]}...")
                    return docs
                
            except Exception as e:
                logger.warning(f"⚠️  Databricks Vector search failed: {e}, trying local storage...")
        
        # Priority 2: Try local persistent storage (unified_rag_handler)
        try:
            from services.unified_rag_handler import get_unified_rag_handler, SourceType
            import asyncio
            
            unified_rag = get_unified_rag_handler()
            if unified_rag:
                # Search only Confluence documents from local storage
                # Handle both sync and async contexts
                try:
                    # Try to get running event loop (if in async context)
                    loop = asyncio.get_running_loop()
                    # If we're in async context, we can't use asyncio.run()
                    # Create a task instead (but this is sync method, so we'll use a workaround)
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as executor:
                        future = executor.submit(
                            lambda: asyncio.run(unified_rag.similarity_search(
                                query=query,
                                top_k=num_results,
                                source_filter=[SourceType.CONFLUENCE],
                                min_score=min_score
                            ))
                        )
                        results = future.result(timeout=10.0)
                except RuntimeError:
                    # No event loop running, safe to use asyncio.run()
                    results = asyncio.run(unified_rag.similarity_search(
                        query=query,
                        top_k=num_results,
                        source_filter=[SourceType.CONFLUENCE],
                        min_score=min_score
                    ))
                
                if results:
                    docs = []
                    for doc in results:
                        docs.append({
                            "id": doc.id,
                            "text": doc.text[:500] if len(doc.text) > 500 else doc.text,  # Limit text length
                            "score": doc.similarity_score or 0.0,
                            "metadata": {
                                "page_title": doc.metadata.get("title", "Unknown"),
                                "source_url": doc.metadata.get("url", ""),
                                "source_type": "confluence",
                                "space": doc.metadata.get("space", "")
                            }
                        })
                    
                    logger.info(f"✅ Found {len(docs)} documents via LOCAL STORAGE for query: {query[:50]}...")
                    return docs
                else:
                    logger.debug(f"ℹ️  No results in local storage, falling back to API...")
        except Exception as e:
            logger.warning(f"⚠️  Local storage search failed: {e}, falling back to API...")
        
        # Priority 3: Fallback to Confluence API search (last resort)
        logger.info(f"🔍 Using Confluence API fallback for query: {query[:50]}...")
        return self._search_confluence_fallback(query, num_results)
    
    def _search_confluence_fallback(self, query: str, num_results: int = 5) -> List[Dict[str, Any]]:
        """Fallback search using Confluence API when Vector Search is not available"""
        from services.encryption import get_encrypted_env
        import re
        
        base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
        email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
        # Get API token - try decryption first, fallback to plain text
        raw_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN")
        api_token = None
        
        if raw_token:
            # Check if it looks encrypted (Fernet tokens start with gAAAAA)
            if raw_token.startswith('gAAAAA'):
                try:
                    # Try to decrypt
                    api_token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")
                    logger.info(f"✅ Confluence token decrypted successfully (length: {len(api_token) if api_token else 0})")
                except Exception as decrypt_err:
                    # Decryption failed - this means token was encrypted with different key
                    logger.error(f"❌ Cannot decrypt Confluence token. Error: {decrypt_err}")
                    logger.error(f"   Token appears encrypted but decryption failed.")
                    logger.error(f"   Token preview: {raw_token[:50]}...")
                    logger.error(f"   Solution: Update .env with plain text token or re-encrypt with current SESSION_SECRET_KEY")
                    api_token = None
            else:
                # Looks like plain text, use directly
                api_token = raw_token
                logger.info(f"✅ Using Confluence token as plain text (not encrypted, length: {len(api_token)})")
        
        logger.debug(f"Confluence auth - Email: {email}, Token length: {len(api_token) if api_token else 0}, Base URL: {base_url}")

        if not (base_url and email and api_token):
            logger.warning("⚠️  Confluence fallback unavailable - missing CONFLUENCE_* env vars")
            logger.warning(f"   - Base URL: {base_url or 'NOT SET'}")
            logger.warning(f"   - Email: {email or 'NOT SET'}")
            logger.warning(f"   - Token: {'SET' if api_token else 'NOT SET'}")
            return []

        # Try to detect space from query (e.g., "in IS project", "IS space", etc.)
        space_key = None
        space_patterns = [
            r'\bin\s+([A-Z]{2,})\s+(?:project|space)',
            r'\b([A-Z]{2,})\s+(?:project|space)',
            r'space\s*[=:]\s*([A-Z]{2,})',
        ]
        
        for pattern in space_patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                space_key = match.group(1).upper()
                # Remove space reference from query for better search
                query = re.sub(pattern, '', query, flags=re.IGNORECASE).strip()
                logger.info(f"🔍 Detected space filter: {space_key}")
                break

        search_url = f"{base_url}/rest/api/search"
        
        # Build CQL query with optional space filter
        if space_key:
            cql = f'space = "{space_key}" AND text ~ "{query}"'
        else:
            cql = f'text ~ "{query}"'
        
        params = {"cql": cql, "limit": str(num_results)}

        try:
            with httpx.Client(auth=(email, api_token), timeout=15.0) as client:
                resp = client.get(search_url, params=params, headers={"Accept": "application/json"})
                resp.raise_for_status()
                results = resp.json().get("results", [])
        except Exception as e:
            logger.warning(f"⚠️  Confluence fallback search failed: {e}")
            return []

        docs: List[Dict[str, Any]] = []
        for result in results:
            content = result.get("content") or {}
            content_id = content.get("id") or result.get("id")
            title = content.get("title") or result.get("title") or "Unknown"
            excerpt = result.get("excerpt") or ""
            source_url = f"{base_url}/pages/{content_id}" if content_id else ""
            score = result.get("score", 0.0)

            docs.append({
                "id": content_id or title,
                "text": excerpt or title,
                "score": float(score) if isinstance(score, (int, float)) else 0.0,
                "metadata": {
                    "page_title": title,
                    "source_url": source_url,
                    "source_type": "confluence"
                }
            })

        logger.info(f"✅ Confluence fallback returned {len(docs)} results for query: {query[:80]}")
        return docs
    
    def generate_rag_response(self, 
                             query: str,
                             num_docs: int = 5,
                             temperature: float = 0.7) -> Dict[str, Any]:
        """
        Generate RAG response:
        1. Retrieve relevant documents
        2. Build context
        3. Call LLM
        4. Return answer + citations
        """
        if not self.openai_client:
            logger.warning("OpenAI client not initialized, using fallback response")
            # Still try to search documents even without OpenAI
            docs = self.search_documents(query, num_results=num_docs)
            if docs:
                # Return a simple summary based on document titles
                titles = [doc['metadata'].get('page_title', 'Unknown') for doc in docs]
                return {
                    "answer": f"I found {len(docs)} relevant documents: {', '.join(titles[:3])}. However, the AI response generation is not available. Please configure OPENAI_API_KEY to enable full RAG functionality.",
                    "citations": [{
                        "title": doc['metadata'].get('page_title'),
                        "url": doc['metadata'].get('source_url'),
                        "confidence": doc['score'],
                        "source_type": doc['metadata'].get('source_type', 'confluence')
                    } for doc in docs],
                    "context_used": len(docs),
                    "retrieval_status": "no_llm_available"
                }
            return {
                "answer": "RAG handler not properly initialized. Please configure OPENAI_API_KEY and ensure Confluence or Databricks Vector Search is set up.",
                "citations": [],
                "error": "Client not set",
                "retrieval_status": "not_initialized"
            }
        
        # Step 1: Retrieve documents
        logger.info(f"Retrieving documents for: {query}")
        docs = self.search_documents(query, num_results=num_docs)
        
        if not docs:
            return {
                "answer": "I couldn't find any relevant documentation to answer your question. Please try a different query.",
                "citations": [],
                "context_used": 0,
                "retrieval_status": "no_docs_found"
            }
        
        # Step 2: Build context for LLM
        context = "## Relevant Documentation\n\n"
        citations = []
        
        for i, doc in enumerate(docs, 1):
            score_pct = doc['score'] * 100 if isinstance(doc['score'], float) else 0
            context += f"**Document {i}** (Confidence: {score_pct:.1f}%)\n"
            context += f"{doc['text'][:800]}...\n"
            context += f"Source: {doc['metadata'].get('page_title', 'Unknown Document')}\n\n"
            
            citations.append({
                "title": doc['metadata'].get('page_title'),
                "url": doc['metadata'].get('source_url'),
                "confidence": doc['score'],
                "source_type": doc['metadata'].get('source_type', 'confluence')
            })
        
        # Step 3: Call LLM with context
        system_prompt = """You are an expert leadership insights assistant. Your role is to answer questions about leadership practices, team dynamics, and organizational excellence.

Guidelines:
- Answer based on the provided documentation
- Be concise but comprehensive
- Include specific examples from the documentation
- Cite which documents support your answer
- If documentation is insufficient, say so
- Provide actionable recommendations when appropriate"""
        
        user_prompt = f"""Based on the following documentation, please answer this question:

{context}

User Question: {query}

Provide a helpful, actionable answer that references the specific documents provided above."""
        
        try:
            logger.info(f"Calling {self.llm_model}...")
            
            response = self.openai_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=temperature,
                max_tokens=1000,
                top_p=0.95
            )
            
            answer = response.choices[0].message.content if response.choices else ""
            
            # Handle empty or None answer
            if not answer or not answer.strip():
                logger.warning("⚠️  LLM returned empty answer, using fallback")
                answer = f"I found {len(docs)} relevant document(s) about '{query}'. Please review the citations below for detailed information."
            
            logger.info(f"✅ LLM response generated successfully (length: {len(answer) if answer else 0})")
            
            return {
                "answer": answer,
                "citations": citations,
                "context_used": len(docs),
                "timestamp": datetime.now().isoformat(),
                "model": self.llm_model,
                "retrieval_status": "success"
            }
        
        except Exception as e:
            logger.error(f"❌ LLM call failed: {e}", exc_info=True)
            return {
                "answer": f"I encountered an error while generating a response: {str(e)}",
                "citations": citations,
                "context_used": len(docs),
                "error": str(e),
                "retrieval_status": "llm_error"
            }
    
    def batch_query(self, queries: List[str]) -> List[Dict[str, Any]]:
        """Process multiple queries in batch"""
        results = []
        for query in queries:
            results.append(self.generate_rag_response(query))
        return results


# ============================================================================
# DATABRICKS MODEL SERVING ENTRY POINT
# ============================================================================
# This section is used when deploying to Databricks Model Serving
# CURRENTLY DISABLED - Will be enabled when implementing Databricks

def initialize_handler():
    """Initialize handler with Databricks clients or fallback to local mode"""
    logger.info("=" * 60)
    logger.info("🔍 INITIALIZING RAG HANDLER")
    logger.info("=" * 60)
    
    try:
        # Try Databricks first (if available)
        try:
            logger.info("📦 Attempting to import Databricks SDK...")
            from databricks.vector_search.client import VectorSearchClient
            from databricks.sdk import WorkspaceClient
            logger.info("✅ Databricks SDK imported successfully")
            
            # Auto-initialize from Databricks environment
            logger.info("🔗 Connecting to Databricks workspace...")
            ws = WorkspaceClient()
            logger.info(f"   - Workspace URL: {ws.config.host}")
            logger.info(f"   - Token present: {'Yes' if ws.config.token else 'No'}")
            logger.info(f"   - Token length: {len(ws.config.token) if ws.config.token else 0}")
            
            logger.info("🔗 Initializing Vector Search Client...")
            vsc = VectorSearchClient(workspace_url=ws.config.host, personal_token=ws.config.token)
            logger.info("✅ Vector Search Client initialized")
            
            # Create handler instance
            handler = LeadershipRAGHandler()
            
            # Get vector search index configuration
            endpoint_name = os.getenv("DATABRICKS_VECTOR_ENDPOINT", "leadership-vector-endpoint")
            index_name = os.getenv("DATABRICKS_VECTOR_INDEX", "leadership_poc.rag.confluence_index")
            
            logger.info("📊 Connecting to Vector Search Index...")
            logger.info(f"   - Endpoint: {endpoint_name}")
            logger.info(f"   - Index: {index_name}")
            
            # Get vector search index
            vector_index = vsc.get_index(
                endpoint_name=endpoint_name,
                index_name=index_name
            )
            logger.info("✅ Vector Search Index connected successfully")
            
            # Initialize OpenAI client
            api_key = os.getenv("OPENAI_API_KEY")
            base_url = os.getenv("OPENAI_API_ENDPOINT")
            
            logger.info("🤖 Initializing OpenAI/LLM client...")
            logger.info(f"   - API Key present: {'Yes' if api_key else 'No'}")
            logger.info(f"   - API Endpoint: {base_url if base_url else 'Default (OpenAI)'}")
            
            if base_url and api_key:
                logger.info("   - Using Databricks LLM endpoint")
                from services.ai_engine import create_databricks_openai_client
                openai_client = create_databricks_openai_client(api_key, base_url)
            elif api_key:
                logger.info("   - Using OpenAI API")
                import openai
                openai_client = openai.OpenAI(api_key=api_key)
            else:
                logger.warning("   - No API key found, using default OpenAI client")
                import openai
                openai_client = openai.OpenAI()
            
            logger.info("✅ LLM client initialized")
            
            # Set clients on handler
            handler.set_clients(vector_index, openai_client)
            
            logger.info("=" * 60)
            logger.info("✅ RAG HANDLER FULLY INITIALIZED WITH DATABRICKS VECTOR SEARCH")
            logger.info("=" * 60)
            return handler
            
        except ImportError as import_err:
            # Databricks SDK not available - use local fallback
            logger.warning("=" * 60)
            logger.warning("⚠️  DATABRICKS SDK NOT AVAILABLE")
            logger.warning(f"   - Error: {import_err}")
            logger.warning("   - Falling back to local RAG mode")
            logger.warning("=" * 60)
            return initialize_local_handler()
        except Exception as e:
            logger.error("=" * 60)
            logger.error("❌ DATABRICKS INITIALIZATION FAILED")
            logger.error(f"   - Error type: {type(e).__name__}")
            logger.error(f"   - Error message: {e}")
            logger.error("   - Falling back to local mode")
            import traceback
            logger.error(f"   - Traceback: {traceback.format_exc()}")
            logger.error("=" * 60)
            return initialize_local_handler()
            
    except Exception as e:
        logger.error("=" * 60)
        logger.error("❌ FAILED TO INITIALIZE HANDLER")
        logger.error(f"   - Error: {e}")
        import traceback
        logger.error(f"   - Traceback: {traceback.format_exc()}")
        logger.error("=" * 60)
        return initialize_local_handler()


def initialize_local_handler():
    """Initialize handler for local use (without Databricks Vector Search)"""
    try:
        handler = LeadershipRAGHandler()
        
        # Initialize OpenAI client for local use
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_API_ENDPOINT")
        
        if base_url and api_key:
            from services.ai_engine import create_databricks_openai_client
            openai_client = create_databricks_openai_client(api_key, base_url)
        elif api_key:
            import openai
            openai_client = openai.OpenAI(api_key=api_key)
        else:
            logger.warning("⚠️  OPENAI_API_KEY not found, RAG will use fallback mode")
            openai_client = None
        
        # For local mode, we'll use a simple document search via Confluence API
        # This is a fallback when Vector Search is not available
        handler.openai_client = openai_client
        handler.vector_index = None  # Will trigger fallback search
        
        logger.info("✅ RAG Handler initialized in local mode (Confluence API fallback)")
        return handler
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize local handler: {e}", exc_info=True)
        return None


# Global handler instance (initialized once)
_handler = None

def get_handler():
    """Get or initialize the global RAG handler"""
    global _handler
    if _handler is None:
        _handler = initialize_handler()
    return _handler


def predict(dataframe):
    """
    Model Serving entry point.
    
    Input dataframe must have 'query' column.
    Output: list of dicts with answer, citations, etc.
    
    Example input:
        {"query": "What are best practices for delegation?"}
    
    Example output:
        {
            "answer": "Based on the documentation, effective delegation...",
            "citations": [
                {
                    "title": "Leadership Handbook",
                    "url": "https://...",
                    "confidence": 0.87,
                    "source_type": "confluence"
                }
            ],
            "context_used": 5,
            "timestamp": "2024-01-15T10:30:45.123456"
        }
    """
    if _handler is None:
        logger.error("Handler not initialized")
        return [{"error": "Handler not initialized"}]
    
    results = []
    
    for row in dataframe.to_dict(orient="records"):
        query = row.get("query", "").strip()
        
        if not query:
            results.append({"error": "Query cannot be empty"})
            continue
        
        logger.info(f"Processing query: {query}")
        response = _handler.generate_rag_response(query)
        results.append(response)
    
    return results


# ============================================================================
# LOCAL TESTING (outside Databricks)
# ============================================================================

if __name__ == "__main__":
    """
    Local testing without Databricks.
    Usage: python databricks_rag_handler.py
    """
    
    print("=" * 80)
    print("RAG HANDLER LOCAL TEST")
    print("=" * 80)
    
    # Create handler (will skip Databricks client initialization)
    handler = LeadershipRAGHandler()
    
    print("\n✓ Handler created (Databricks clients skipped)")
    print("\nNote: In actual Databricks environment:")
    print("  1. Clients auto-initialize from workspace")
    print("  2. Handler processes queries through Vector Search + LLM")
    print("  3. Results returned to Model Serving endpoint")
    
    # Show schema
    print("\n" + "=" * 80)
    print("INPUT/OUTPUT SCHEMA")
    print("=" * 80)
    
    print("\nINPUT (Model Serving Request):")
    print(json.dumps({
        "dataframe_records": [
            {
                "query": "What are best practices for team delegation?"
            }
        ]
    }, indent=2))
    
    print("\nOUTPUT (Model Serving Response):")
    print(json.dumps({
        "predictions": [
            {
                "answer": "Based on the documentation, effective delegation involves...",
                "citations": [
                    {
                        "title": "Leadership Handbook - Delegation",
                        "url": "https://confluence.cdk.com/...",
                        "confidence": 0.87,
                        "source_type": "confluence"
                    }
                ],
                "context_used": 5,
                "timestamp": "2024-01-15T10:30:45.123456",
                "model": "databricks-gpt-5-1",
                "retrieval_status": "success"
            }
        ]
    }, indent=2))
    
    print("\n" + "=" * 80)
    print("For deployment: Copy this file to Databricks notebook cell and run")
    print("=" * 80)
