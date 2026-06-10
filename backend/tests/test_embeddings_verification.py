"""
Test file to verify Databricks embeddings work for Jira, Confluence, and GitHub
Before implementing changes to main codebase
"""

import os
import sys
import httpx
import asyncio
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv
import math

# Add parent directory to path to import from backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'config', '.env'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger(__name__)

# Databricks Configuration
DATABRICKS_TOKEN = os.getenv("OPENAI_API_KEY")  # Databricks token
EMBEDDING_ENDPOINT = os.getenv(
    "DATABRICKS_EMBEDDING_ENDPOINT",
    "https://dbc-46217bae-ef1b.cloud.databricks.com/serving-endpoints/databricks-gte-large-en/invocations"
)

class EmbeddingsTester:
    """Test embeddings for Jira, Confluence, and GitHub"""
    
    def __init__(self):
        self.token = DATABRICKS_TOKEN
        self.embedding_endpoint = EMBEDDING_ENDPOINT
        
        if not self.token:
            raise ValueError("OPENAI_API_KEY (Databricks token) is required")
        
        logger.info(f"✅ Initialized with embedding endpoint: {self.embedding_endpoint}")
    
    async def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Get embeddings using Databricks endpoint (following the pattern from other team)
        """
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "input": texts
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                logger.info(f"📤 Sending embedding request for {len(texts)} text(s)...")
                response = await client.post(
                    self.embedding_endpoint,
                    json=payload,
                    headers=headers
                )
                response.raise_for_status()
                result = response.json()
                
                # Handle Databricks response format
                if "data" in result:
                    # Format: { "data": [{"embedding": [...], "index": 0}, ...] }
                    sorted_data = sorted(result["data"], key=lambda x: x.get("index", 0))
                    embeddings = [item["embedding"] for item in sorted_data]
                    logger.info(f"✅ Received {len(embeddings)} embeddings (format: data)")
                    return embeddings
                elif "embeddings" in result:
                    # Format: { "embeddings": [[...], [...]] }
                    embeddings = result["embeddings"]
                    logger.info(f"✅ Received {len(embeddings)} embeddings (format: embeddings)")
                    return embeddings
                else:
                    logger.error(f"❌ Unexpected response format. Keys: {list(result.keys())}")
                    logger.error(f"Response sample: {str(result)[:500]}")
                    raise ValueError(f"Unexpected response format: {list(result.keys())}")
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ HTTP error: {e.response.status_code}")
            logger.error(f"Response: {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"❌ Embedding call failed: {e}")
            raise
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        magnitude1 = math.sqrt(sum(a * a for a in vec1))
        magnitude2 = math.sqrt(sum(a * a for a in vec2))
        
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0
        
        return dot_product / (magnitude1 * magnitude2)
    
    async def test_jira_embeddings(self, query: str) -> Dict[str, Any]:
        """
        Test Jira embeddings: "list bugs that are impacting docs2.0 export excel"
        """
        logger.info("=" * 80)
        logger.info("🔍 TESTING JIRA EMBEDDINGS")
        logger.info(f"Query: {query}")
        
        # Sample Jira issues (in real scenario, fetch from Jira API)
        sample_issues = [
            {
                "key": "DOCS-123",
                "summary": "Export to Excel feature broken in docs2.0",
                "description": "Users cannot export data to Excel format in the new docs2.0 interface. Error occurs when clicking export button.",
                "type": "Bug",
                "status": "Open"
            },
            {
                "key": "DOCS-456",
                "summary": "Excel export timeout issue",
                "description": "Large datasets cause timeout when exporting to Excel in docs2.0",
                "type": "Bug",
                "status": "In Progress"
            },
            {
                "key": "DOCS-789",
                "summary": "Add new export formats",
                "description": "Request to add CSV and PDF export options to docs2.0",
                "type": "Story",
                "status": "To Do"
            },
            {
                "key": "DOCS-321",
                "summary": "Fix Excel formatting in docs2.0 export",
                "description": "Excel cells are not properly formatted when exporting from docs2.0. Numbers appear as text.",
                "type": "Bug",
                "status": "Resolved"
            }
        ]
        
        try:
            # Get query embedding
            logger.info("📤 Getting query embedding...")
            query_embeddings = await self.get_embeddings([query])
            query_embedding = query_embeddings[0]
            logger.info(f"✅ Query embedding dimension: {len(query_embedding)}")
            
            # Prepare issue texts
            issue_texts = []
            for issue in sample_issues:
                text = f"{issue['summary']} {issue['description']} Type: {issue['type']} Status: {issue['status']}"
                issue_texts.append(text)
            
            # Get embeddings for all issues (batch call)
            logger.info(f"📤 Getting embeddings for {len(issue_texts)} issues...")
            issue_embeddings = await self.get_embeddings(issue_texts)
            logger.info(f"✅ Received {len(issue_embeddings)} issue embeddings")
            
            # Calculate similarities
            results = []
            for issue, issue_embedding in zip(sample_issues, issue_embeddings):
                similarity = self.cosine_similarity(query_embedding, issue_embedding)
                results.append({
                    "issue": issue,
                    "similarity": similarity,
                    "score": round(similarity * 100, 2)
                })
            
            # Sort by similarity
            results.sort(key=lambda x: x['similarity'], reverse=True)
            
            logger.info(f"✅ Found {len(results)} issues")
            for i, result in enumerate(results, 1):
                logger.info(f"  {i}. {result['issue']['key']}: {result['issue']['summary']} (Score: {result['score']}%)")
            
            return {
                "success": True,
                "query": query,
                "results": results,
                "top_match": results[0] if results else None
            }
            
        except Exception as e:
            logger.error(f"❌ Jira embeddings test failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    async def test_confluence_embeddings(self, query: str) -> Dict[str, Any]:
        """
        Test Confluence embeddings: "show Onboarding Procedure from Confluence"
        """
        logger.info("=" * 80)
        logger.info("🔍 TESTING CONFLUENCE EMBEDDINGS")
        logger.info(f"Query: {query}")
        
        # Sample Confluence pages (in real scenario, fetch from Confluence API)
        sample_pages = [
            {
                "title": "Employee Onboarding Procedure",
                "content": "This document outlines the complete onboarding procedure for new employees. Step 1: Complete HR paperwork. Step 2: IT setup. Step 3: Team introduction.",
                "url": "https://confluence.example.com/onboarding"
            },
            {
                "title": "Developer Onboarding Guide",
                "content": "Guide for new developers joining the team. Includes environment setup, code repository access, and development workflow procedures.",
                "url": "https://confluence.example.com/dev-onboarding"
            },
            {
                "title": "Project Management Procedures",
                "content": "Documentation on how we manage projects, track progress, and coordinate between teams.",
                "url": "https://confluence.example.com/pm-procedures"
            },
            {
                "title": "Onboarding Checklist",
                "content": "Checklist for new employee onboarding: 1. Complete forms 2. Get access 3. Attend orientation 4. Meet team members.",
                "url": "https://confluence.example.com/onboarding-checklist"
            }
        ]
        
        try:
            # Get query embedding
            logger.info("📤 Getting query embedding...")
            query_embeddings = await self.get_embeddings([query])
            query_embedding = query_embeddings[0]
            logger.info(f"✅ Query embedding dimension: {len(query_embedding)}")
            
            # Prepare page texts
            page_texts = [f"{page['title']} {page['content']}" for page in sample_pages]
            
            # Get embeddings for all pages (batch call)
            logger.info(f"📤 Getting embeddings for {len(page_texts)} pages...")
            page_embeddings = await self.get_embeddings(page_texts)
            logger.info(f"✅ Received {len(page_embeddings)} page embeddings")
            
            # Calculate similarities
            results = []
            for page, page_embedding in zip(sample_pages, page_embeddings):
                similarity = self.cosine_similarity(query_embedding, page_embedding)
                results.append({
                    "page": page,
                    "similarity": similarity,
                    "score": round(similarity * 100, 2)
                })
            
            # Sort by similarity
            results.sort(key=lambda x: x['similarity'], reverse=True)
            
            logger.info(f"✅ Found {len(results)} pages")
            for i, result in enumerate(results, 1):
                logger.info(f"  {i}. {result['page']['title']} (Score: {result['score']}%)")
            
            return {
                "success": True,
                "query": query,
                "results": results,
                "top_match": results[0] if results else None
            }
            
        except Exception as e:
            logger.error(f"❌ Confluence embeddings test failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    async def test_github_embeddings(self, query: str) -> Dict[str, Any]:
        """
        Test GitHub embeddings: "what are the branches there in intelligence-suite-ui-quality"
        """
        logger.info("=" * 80)
        logger.info("🔍 TESTING GITHUB EMBEDDINGS")
        logger.info(f"Query: {query}")
        
        # Sample GitHub branches (in real scenario, fetch from GitHub API)
        sample_branches = [
            {
                "name": "main",
                "description": "Main production branch for intelligence-suite-ui-quality",
                "repo": "intelligence-suite-ui-quality"
            },
            {
                "name": "develop",
                "description": "Development branch for intelligence-suite-ui-quality",
                "repo": "intelligence-suite-ui-quality"
            },
            {
                "name": "feature/quality-improvements",
                "description": "Feature branch for quality improvements in intelligence-suite-ui-quality",
                "repo": "intelligence-suite-ui-quality"
            },
            {
                "name": "hotfix/ui-bug-fix",
                "description": "Hotfix branch for UI bug fixes in intelligence-suite-ui-quality",
                "repo": "intelligence-suite-ui-quality"
            },
            {
                "name": "release/v2.0",
                "description": "Release branch for version 2.0 of intelligence-suite-ui-quality",
                "repo": "intelligence-suite-ui-quality"
            }
        ]
        
        try:
            # Get query embedding
            logger.info("📤 Getting query embedding...")
            query_embeddings = await self.get_embeddings([query])
            query_embedding = query_embeddings[0]
            logger.info(f"✅ Query embedding dimension: {len(query_embedding)}")
            
            # Prepare branch texts
            branch_texts = [
                f"Branch: {branch['name']} Repository: {branch['repo']} Description: {branch['description']}"
                for branch in sample_branches
            ]
            
            # Get embeddings for all branches (batch call)
            logger.info(f"📤 Getting embeddings for {len(branch_texts)} branches...")
            branch_embeddings = await self.get_embeddings(branch_texts)
            logger.info(f"✅ Received {len(branch_embeddings)} branch embeddings")
            
            # Calculate similarities
            results = []
            for branch, branch_embedding in zip(sample_branches, branch_embeddings):
                similarity = self.cosine_similarity(query_embedding, branch_embedding)
                results.append({
                    "branch": branch,
                    "similarity": similarity,
                    "score": round(similarity * 100, 2)
                })
            
            # Sort by similarity
            results.sort(key=lambda x: x['similarity'], reverse=True)
            
            logger.info(f"✅ Found {len(results)} branches")
            for i, result in enumerate(results, 1):
                logger.info(f"  {i}. {result['branch']['name']} (Score: {result['score']}%)")
            
            return {
                "success": True,
                "query": query,
                "results": results,
                "top_match": results[0] if results else None
            }
            
        except Exception as e:
            logger.error(f"❌ GitHub embeddings test failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


async def main():
    """Run all embedding tests"""
    print("=" * 80)
    print("🧪 DATABRICKS EMBEDDINGS TEST")
    print("=" * 80)
    
    try:
        tester = EmbeddingsTester()
    except ValueError as e:
        print(f"❌ Initialization failed: {e}")
        print("Please set OPENAI_API_KEY environment variable with your Databricks token")
        return
    
    # Test queries
    queries = [
        {
            "source": "Jira",
            "query": "list bugs that are impacting docs2.0 export excel",
            "test_func": tester.test_jira_embeddings
        },
        {
            "source": "Confluence",
            "query": "show Onboarding Procedure from Confluence",
            "test_func": tester.test_confluence_embeddings
        },
        {
            "source": "GitHub",
            "query": "what are the branches there in intelligence-suite-ui-quality",
            "test_func": tester.test_github_embeddings
        }
    ]
    
    all_results = []
    
    for test_case in queries:
        try:
            result = await test_case["test_func"](test_case["query"])
            all_results.append({
                "source": test_case["source"],
                "query": test_case["query"],
                "result": result
            })
        except Exception as e:
            logger.error(f"❌ Test failed for {test_case['source']}: {e}")
            all_results.append({
                "source": test_case["source"],
                "query": test_case["query"],
                "result": {"success": False, "error": str(e)}
            })
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    
    for result in all_results:
        source = result["source"]
        query = result["query"]
        test_result = result["result"]
        
        if test_result.get("success"):
            top_match = test_result.get("top_match")
            if top_match:
                score = top_match.get("score", 0)
                print(f"✅ {source}: Success (Top match score: {score}%)")
                # Show top match details
                if source == "Jira":
                    issue = top_match.get("issue", {})
                    print(f"   Top match: {issue.get('key')} - {issue.get('summary')}")
                elif source == "Confluence":
                    page = top_match.get("page", {})
                    print(f"   Top match: {page.get('title')}")
                elif source == "GitHub":
                    branch = top_match.get("branch", {})
                    print(f"   Top match: {branch.get('name')}")
            else:
                print(f"⚠️ {source}: Success but no matches found")
        else:
            error = test_result.get("error", "Unknown error")
            print(f"❌ {source}: Failed - {error}")
    
    print("=" * 80)
    
    # Overall status
    success_count = sum(1 for r in all_results if r["result"].get("success"))
    total_count = len(all_results)
    
    print(f"\n🎯 Overall: {success_count}/{total_count} tests passed")
    
    if success_count == total_count:
        print("✅ All embeddings tests passed! Ready to integrate into main codebase.")
    else:
        print("⚠️ Some tests failed. Please check the errors above.")
    
    return all_results


if __name__ == "__main__":
    asyncio.run(main())

