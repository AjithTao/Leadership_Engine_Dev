"""
Test all RAG handlers (Jira, GitHub, Confluence) to verify embeddings work correctly
"""

import os
import sys
import asyncio
import logging
from typing import Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'config', '.env'))

# Import RAG handlers
from services.jira_rag_handler import get_jira_rag_handler
from services.github_rag_handler import get_github_rag_handler
from services.rag_handler import get_handler

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger(__name__)


async def test_jira_rag_handler():
    """Test Jira RAG handler with sample issues"""
    logger.info("=" * 80)
    logger.info("🧪 TESTING JIRA RAG HANDLER")
    logger.info("=" * 80)
    
    handler = get_jira_rag_handler()
    if not handler:
        logger.error("❌ Jira RAG handler not available")
        return {"success": False, "error": "Handler not initialized"}
    
    # Sample Jira issues
    sample_issues = [
        {
            "key": "DOCS-123",
            "fields": {
                "summary": "Export to Excel feature broken in docs2.0",
                "description": "Users cannot export data to Excel format in the new docs2.0 interface. Error occurs when clicking export button.",
                "type": {"name": "Bug"},
                "status": {"name": "Open"},
                "assignee": {"displayName": "John Doe"},
                "project": {"key": "DOCS"}
            }
        },
        {
            "key": "DOCS-456",
            "fields": {
                "summary": "Excel export timeout issue",
                "description": "Large datasets cause timeout when exporting to Excel in docs2.0",
                "type": {"name": "Bug"},
                "status": {"name": "In Progress"},
                "assignee": {"displayName": "Jane Smith"},
                "project": {"key": "DOCS"}
            }
        },
        {
            "key": "DOCS-789",
            "fields": {
                "summary": "Add new export formats",
                "description": "Request to add CSV and PDF export options to docs2.0",
                "type": {"name": "Story"},
                "status": {"name": "To Do"},
                "assignee": {"displayName": "Bob Johnson"},
                "project": {"key": "DOCS"}
            }
        },
        {
            "key": "DOCS-321",
            "fields": {
                "summary": "Fix Excel formatting in docs2.0 export",
                "description": "Excel cells are not properly formatted when exporting from docs2.0. Numbers appear as text.",
                "type": {"name": "Bug"},
                "status": {"name": "Resolved"},
                "assignee": {"displayName": "Alice Brown"},
                "project": {"key": "DOCS"}
            }
        }
    ]
    
    query = "list bugs that are impacting docs2.0 export excel"
    
    try:
        logger.info(f"📝 Query: {query}")
        logger.info(f"📊 Testing with {len(sample_issues)} issues...")
        
        results = await handler.find_similar_issues(query, sample_issues, top_k=3)
        
        if results:
            logger.info(f"✅ Found {len(results)} similar issues")
            for i, result in enumerate(results, 1):
                key = result.get('key', 'Unknown')
                summary = result.get('fields', {}).get('summary', 'No summary')
                score = result.get('semantic_score', 0)
                rag_search = result.get('rag_search', False)
                
                logger.info(f"  {i}. {key}: {summary}")
                logger.info(f"     Score: {score:.2%}, RAG: {rag_search}")
            
            return {
                "success": True,
                "results_count": len(results),
                "top_score": results[0].get('semantic_score', 0) if results else 0,
                "using_rag": results[0].get('rag_search', False) if results else False
            }
        else:
            logger.warning("⚠️ No results returned")
            return {"success": False, "error": "No results"}
            
    except Exception as e:
        logger.error(f"❌ Jira RAG test failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


async def test_github_rag_handler():
    """Test GitHub RAG handler with sample issues/PRs"""
    logger.info("=" * 80)
    logger.info("🧪 TESTING GITHUB RAG HANDLER")
    logger.info("=" * 80)
    
    handler = get_github_rag_handler()
    if not handler:
        logger.error("❌ GitHub RAG handler not available")
        return {"success": False, "error": "Handler not initialized"}
    
    # Sample GitHub branches/issues
    sample_items = [
        {
            "title": "main",
            "body": "Main production branch for intelligence-suite-ui-quality",
            "state": "open",
            "repository_url": "https://api.github.com/repos/org/intelligence-suite-ui-quality",
            "labels": [],
            "assignees": []
        },
        {
            "title": "develop",
            "body": "Development branch for intelligence-suite-ui-quality",
            "state": "open",
            "repository_url": "https://api.github.com/repos/org/intelligence-suite-ui-quality",
            "labels": [],
            "assignees": []
        },
        {
            "title": "feature/quality-improvements",
            "body": "Feature branch for quality improvements in intelligence-suite-ui-quality",
            "state": "open",
            "repository_url": "https://api.github.com/repos/org/intelligence-suite-ui-quality",
            "labels": [{"name": "enhancement"}],
            "assignees": []
        },
        {
            "title": "hotfix/ui-bug-fix",
            "body": "Hotfix branch for UI bug fixes in intelligence-suite-ui-quality",
            "state": "open",
            "repository_url": "https://api.github.com/repos/org/intelligence-suite-ui-quality",
            "labels": [{"name": "bug"}],
            "assignees": []
        },
        {
            "title": "release/v2.0",
            "body": "Release branch for version 2.0 of intelligence-suite-ui-quality",
            "state": "open",
            "repository_url": "https://api.github.com/repos/org/intelligence-suite-ui-quality",
            "labels": [{"name": "release"}],
            "assignees": []
        }
    ]
    
    query = "what are the branches there in intelligence-suite-ui-quality"
    
    try:
        logger.info(f"📝 Query: {query}")
        logger.info(f"📊 Testing with {len(sample_items)} items...")
        
        results = await handler.find_similar_issues(query, sample_items, top_k=3)
        
        if results:
            logger.info(f"✅ Found {len(results)} similar items")
            for i, result in enumerate(results, 1):
                title = result.get('title', 'Unknown')
                score = result.get('semantic_score', 0)
                rag_search = result.get('rag_search', False)
                
                logger.info(f"  {i}. {title}")
                logger.info(f"     Score: {score:.2%}, RAG: {rag_search}")
            
            return {
                "success": True,
                "results_count": len(results),
                "top_score": results[0].get('semantic_score', 0) if results else 0,
                "using_rag": results[0].get('rag_search', False) if results else False
            }
        else:
            logger.warning("⚠️ No results returned")
            return {"success": False, "error": "No results"}
            
    except Exception as e:
        logger.error(f"❌ GitHub RAG test failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


async def test_confluence_rag_handler():
    """Test Confluence RAG handler"""
    logger.info("=" * 80)
    logger.info("🧪 TESTING CONFLUENCE RAG HANDLER")
    logger.info("=" * 80)
    
    handler = get_handler()
    if not handler:
        logger.warning("⚠️ Confluence RAG handler not available (may need Databricks Vector Search setup)")
        return {"success": False, "error": "Handler not initialized", "note": "Requires Databricks Vector Search"}
    
    query = "show Onboarding Procedure from Confluence"
    
    try:
        logger.info(f"📝 Query: {query}")
        logger.info("📊 Testing RAG response generation...")
        
        response = handler.generate_rag_response(query, num_docs=3, temperature=0.7)
        
        if response:
            answer = response.get('answer', '')
            citations = response.get('citations', [])
            context_used = response.get('context_used', 0)
            retrieval_status = response.get('retrieval_status', 'unknown')
            
            logger.info(f"✅ Generated response")
            logger.info(f"   Answer length: {len(answer)} characters")
            logger.info(f"   Citations: {len(citations)}")
            logger.info(f"   Context used: {context_used} documents")
            logger.info(f"   Status: {retrieval_status}")
            
            if answer:
                logger.info(f"   Answer preview: {answer[:200]}...")
            
            return {
                "success": True,
                "has_answer": bool(answer),
                "citations_count": len(citations),
                "context_used": context_used,
                "retrieval_status": retrieval_status
            }
        else:
            logger.warning("⚠️ No response generated")
            return {"success": False, "error": "No response"}
            
    except Exception as e:
        logger.error(f"❌ Confluence RAG test failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


async def main():
    """Run all RAG handler tests"""
    print("=" * 80)
    print("🧪 TESTING ALL RAG HANDLERS")
    print("=" * 80)
    print()
    
    results = {}
    
    # Test Jira RAG Handler
    try:
        jira_result = await test_jira_rag_handler()
        results["Jira"] = jira_result
    except Exception as e:
        logger.error(f"❌ Jira test exception: {e}", exc_info=True)
        results["Jira"] = {"success": False, "error": str(e)}
    
    print()
    
    # Test GitHub RAG Handler
    try:
        github_result = await test_github_rag_handler()
        results["GitHub"] = github_result
    except Exception as e:
        logger.error(f"❌ GitHub test exception: {e}", exc_info=True)
        results["GitHub"] = {"success": False, "error": str(e)}
    
    print()
    
    # Test Confluence RAG Handler
    try:
        confluence_result = await test_confluence_rag_handler()
        results["Confluence"] = confluence_result
    except Exception as e:
        logger.error(f"❌ Confluence test exception: {e}", exc_info=True)
        results["Confluence"] = {"success": False, "error": str(e)}
    
    # Summary
    print()
    print("=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    
    for handler_name, result in results.items():
        if result.get("success"):
            if handler_name in ["Jira", "GitHub"]:
                score = result.get("top_score", 0)
                rag = result.get("using_rag", False)
                count = result.get("results_count", 0)
                status = "✅ PASS" if rag else "⚠️ PASS (keyword fallback)"
                print(f"{status} | {handler_name}: Found {count} results, Top score: {score:.2%}, Using RAG: {rag}")
            else:  # Confluence
                has_answer = result.get("has_answer", False)
                citations = result.get("citations_count", 0)
                status = "✅ PASS" if has_answer else "⚠️ PASS (no answer)"
                print(f"{status} | {handler_name}: Answer generated: {has_answer}, Citations: {citations}")
        else:
            error = result.get("error", "Unknown error")
            note = result.get("note", "")
            print(f"❌ FAIL | {handler_name}: {error}" + (f" ({note})" if note else ""))
    
    print("=" * 80)
    
    # Overall status
    success_count = sum(1 for r in results.values() if r.get("success"))
    total_count = len(results)
    
    print(f"\n🎯 Overall: {success_count}/{total_count} handlers passed")
    
    if success_count == total_count:
        print("✅ All RAG handlers are working correctly!")
    elif success_count > 0:
        print("⚠️ Some handlers passed, some failed. Check errors above.")
    else:
        print("❌ All handlers failed. Please check configuration.")
    
    return results


if __name__ == "__main__":
    asyncio.run(main())

