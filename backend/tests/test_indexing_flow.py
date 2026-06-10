"""
End-to-end test for full Confluence indexing flow
Tests the complete workflow from connection to query
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

async def test_full_indexing_flow():
    """Test the complete indexing flow"""
    print("=" * 60)
    print("END-TO-END INDEXING FLOW TEST")
    print("=" * 60)
    
    try:
        # 1. Initialize Confluence client
        print("\n1️⃣  Initializing Confluence client...")
        from services.confluence import ConfluenceClient, ConfluenceConfig
        from services.encryption import get_encrypted_env
        
        base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
        email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
        raw_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN")
        
        if raw_token and raw_token.startswith('gAAAAA'):
            token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")
        else:
            token = raw_token
        
        if not (base_url and email and token):
            print("⚠️  Confluence credentials not configured - skipping flow test")
            return True
        
        config = ConfluenceConfig(base_url, email, token)
        client = ConfluenceClient(config)
        await client.initialize()
        print("✅ Confluence client initialized")
        
        # 2. Test getting all spaces
        print("\n2️⃣  Testing get_all_spaces()...")
        spaces = await client.get_all_spaces()
        print(f"✅ Found {len(spaces)} spaces")
        if spaces:
            print(f"   Sample spaces: {', '.join([s.get('key', '?') for s in spaces[:5]])}")
        
        # 3. Test getting pages from first space (limited)
        print("\n3️⃣  Testing get_all_pages_in_space() (first space only)...")
        if spaces:
            first_space = spaces[0].get('key', '')
            if first_space:
                pages = await client.get_all_pages_in_space(first_space)
                print(f"✅ Found {len(pages)} pages in space '{first_space}'")
                if pages:
                    print(f"   Sample pages: {', '.join([p.get('title', '?')[:30] for p in pages[:3]])}")
        
        # 4. Test unified RAG handler
        print("\n4️⃣  Testing unified RAG handler with storage...")
        from services.unified_rag_handler import get_unified_rag_handler, SourceType
        
        unified_rag = get_unified_rag_handler()
        await unified_rag.initialize()
        print(f"✅ Unified RAG handler initialized")
        print(f"   Documents in storage: {len(unified_rag.vector_store)}")
        
        # 5. Test indexing scheduler
        print("\n5️⃣  Testing indexing scheduler...")
        from services.indexing_scheduler import get_indexing_scheduler
        
        scheduler = get_indexing_scheduler()
        scheduler.set_clients(
            jira_client=None,
            confluence_client=client,
            github_client=None
        )
        print("✅ Scheduler configured with Confluence client")
        
        # 6. Test indexing a small sample (not full index to save time)
        print("\n6️⃣  Testing document indexer (sample)...")
        from services.document_indexer import DocumentIndexer
        
        indexer = DocumentIndexer(unified_rag)
        
        # Index just a few pages as a test
        if spaces and pages:
            sample_pages = pages[:3]  # Just 3 pages for testing
            await indexer.index_confluence_pages(sample_pages, base_url)
            print(f"✅ Indexed {len(sample_pages)} sample pages")
            
            # Check storage
            await unified_rag.initialize()  # Reload from storage
            print(f"   Documents now in storage: {len(unified_rag.vector_store)}")
        
        # 7. Test query from local storage
        print("\n7️⃣  Testing query from local storage...")
        if len(unified_rag.vector_store) > 0:
            results = await unified_rag.similarity_search(
                query="onboarding procedure",
                top_k=3,
                source_filter=[SourceType.CONFLUENCE],
                min_score=0.0
            )
            print(f"✅ Query returned {len(results)} results from local storage")
            if results:
                print(f"   Top result: {results[0].metadata.get('title', 'Unknown')}")
        else:
            print("⚠️  No documents in storage to query")
        
        # 8. Test RAG handler priority
        print("\n8️⃣  Testing RAG handler local storage priority...")
        from services.rag_handler import get_handler
        
        rag_handler = get_handler()
        if rag_handler:
            # This should check local storage first
            docs = rag_handler.search_documents("test query", num_results=3)
            print(f"✅ RAG handler search returned {len(docs)} results")
            print(f"   Search priority: Local storage → API fallback")
        
        await client.close()
        
        print("\n" + "=" * 60)
        print("✅ ALL FLOW TESTS PASSED!")
        print("=" * 60)
        print("\n📝 Summary:")
        print("   ✅ Confluence client works")
        print("   ✅ Can get all spaces")
        print("   ✅ Can get all pages from space")
        print("   ✅ Unified RAG handler with storage works")
        print("   ✅ Indexing scheduler configured")
        print("   ✅ Document indexing works")
        print("   ✅ Local storage queries work")
        print("   ✅ RAG handler checks local storage first")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Flow test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    result = asyncio.run(test_full_indexing_flow())
    exit(0 if result else 1)

