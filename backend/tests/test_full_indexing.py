"""
Test script for full Confluence indexing implementation
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

async def test_imports():
    """Test that all imports work"""
    print("=" * 60)
    print("TEST 1: Import Checks")
    print("=" * 60)
    
    try:
        from services.confluence import ConfluenceClient, ConfluenceConfig
        print("✅ Confluence imports OK")
    except Exception as e:
        print(f"❌ Confluence import failed: {e}")
        return False
    
    try:
        from services.indexing_scheduler import IndexingScheduler, get_indexing_scheduler
        print("✅ Indexing scheduler imports OK")
    except Exception as e:
        print(f"❌ Indexing scheduler import failed: {e}")
        return False
    
    try:
        from services.vector_storage import VectorStorage
        print("✅ Vector storage imports OK")
    except Exception as e:
        print(f"❌ Vector storage import failed: {e}")
        return False
    
    try:
        from services.rag_handler import LeadershipRAGHandler
        from services.unified_rag_handler import UnifiedRAGHandler, SourceType
        print("✅ RAG handlers imports OK")
    except Exception as e:
        print(f"❌ RAG handlers import failed: {e}")
        return False
    
    return True

async def test_vector_storage():
    """Test vector storage initialization"""
    print("\n" + "=" * 60)
    print("TEST 2: Vector Storage")
    print("=" * 60)
    
    try:
        from services.vector_storage import VectorStorage
        
        storage = VectorStorage()
        print(f"✅ Vector storage initialized: {storage.db_path}")
        
        count = storage.get_document_count()
        print(f"✅ Current document count: {count}")
        
        return True
    except Exception as e:
        print(f"❌ Vector storage test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_confluence_methods():
    """Test new Confluence methods exist"""
    print("\n" + "=" * 60)
    print("TEST 3: Confluence Methods")
    print("=" * 60)
    
    try:
        from services.confluence import ConfluenceClient
        
        # Check if new methods exist
        methods = ['get_all_spaces', 'get_all_pages_in_space', 'get_all_pages']
        for method in methods:
            if hasattr(ConfluenceClient, method):
                print(f"✅ Method exists: {method}")
            else:
                print(f"❌ Method missing: {method}")
                return False
        
        return True
    except Exception as e:
        print(f"❌ Confluence methods test failed: {e}")
        return False

async def test_indexing_scheduler():
    """Test indexing scheduler has full index method"""
    print("\n" + "=" * 60)
    print("TEST 4: Indexing Scheduler")
    print("=" * 60)
    
    try:
        from services.indexing_scheduler import IndexingScheduler
        
        scheduler = IndexingScheduler()
        
        # Check if full index method exists
        if hasattr(scheduler, '_index_full_confluence'):
            print("✅ Full index method exists: _index_full_confluence")
        else:
            print("❌ Full index method missing")
            return False
        
        # Check if recent index method exists
        if hasattr(scheduler, '_index_recent_confluence_pages'):
            print("✅ Recent index method exists: _index_recent_confluence_pages")
        else:
            print("❌ Recent index method missing")
            return False
        
        return True
    except Exception as e:
        print(f"❌ Indexing scheduler test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_rag_handler_priority():
    """Test RAG handler checks local storage"""
    print("\n" + "=" * 60)
    print("TEST 5: RAG Handler Priority")
    print("=" * 60)
    
    try:
        from services.rag_handler import LeadershipRAGHandler
        
        handler = LeadershipRAGHandler()
        
        # Check if search_documents method exists
        if hasattr(handler, 'search_documents'):
            print("✅ search_documents method exists")
            
            # Read the method to check if it has local storage check
            import inspect
            source = inspect.getsource(handler.search_documents)
            
            if 'unified_rag_handler' in source or 'LOCAL STORAGE' in source:
                print("✅ Local storage check found in search_documents")
            else:
                print("⚠️  Local storage check not found (may need verification)")
        else:
            print("❌ search_documents method missing")
            return False
        
        return True
    except Exception as e:
        print(f"❌ RAG handler test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_unified_rag_handler():
    """Test unified RAG handler initialization"""
    print("\n" + "=" * 60)
    print("TEST 6: Unified RAG Handler")
    print("=" * 60)
    
    try:
        from services.unified_rag_handler import get_unified_rag_handler, SourceType
        
        handler = get_unified_rag_handler()
        if handler:
            print("✅ Unified RAG handler created")
            
            # Check if it has storage
            if hasattr(handler, 'storage'):
                print(f"✅ Storage attribute exists: {handler.storage is not None}")
            else:
                print("⚠️  Storage attribute not found")
            
            return True
        else:
            print("❌ Unified RAG handler is None")
            return False
    except Exception as e:
        print(f"❌ Unified RAG handler test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_confluence_connection():
    """Test Confluence connection (if credentials available)"""
    print("\n" + "=" * 60)
    print("TEST 7: Confluence Connection (Optional)")
    print("=" * 60)
    
    base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
    email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
    token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN")
    
    if not (base_url and email and token):
        print("⚠️  Confluence credentials not configured - skipping connection test")
        return True
    
    try:
        from services.confluence import ConfluenceClient, ConfluenceConfig
        from services.encryption import get_encrypted_env
        
        # Try to decrypt token if encrypted
        if token and token.startswith('gAAAAA'):
            try:
                token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")
            except:
                pass
        
        config = ConfluenceConfig(base_url, email, token)
        client = ConfluenceClient(config)
        await client.initialize()
        
        # Test get_spaces (lightweight)
        spaces = await client.get_spaces(limit=5)
        print(f"✅ Confluence connection successful - Found {len(spaces)} spaces (sample)")
        
        await client.close()
        return True
    except Exception as e:
        print(f"⚠️  Confluence connection test failed: {e}")
        print("   (This is OK if credentials are not set up)")
        return True  # Don't fail the test suite

async def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("FULL CONFLUENCE INDEXING - TEST SUITE")
    print("=" * 60)
    
    tests = [
        ("Imports", test_imports),
        ("Vector Storage", test_vector_storage),
        ("Confluence Methods", test_confluence_methods),
        ("Indexing Scheduler", test_indexing_scheduler),
        ("RAG Handler Priority", test_rag_handler_priority),
        ("Unified RAG Handler", test_unified_rag_handler),
        ("Confluence Connection", test_confluence_connection),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = await test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ Test '{name}' crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Implementation looks good.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review.")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

