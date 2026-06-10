"""
Test script to index IS (Intelligent Suite) space and show documents
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

async def index_and_show_is_documents():
    """Index IS space and show documents"""
    print("=" * 80)
    print("IS (Intelligent Suite) SPACE INDEXING TEST")
    print("=" * 80)
    
    try:
        # 1. Initialize Confluence client
        print("\n1️⃣  Connecting to Confluence...")
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
            print("❌ Confluence credentials not configured")
            return
        
        config = ConfluenceConfig(base_url, email, token)
        client = ConfluenceClient(config)
        await client.initialize()
        print(f"✅ Connected to: {base_url}")
        
        # 2. Get all pages from IS space
        print("\n2️⃣  Fetching all pages from IS space...")
        is_pages = await client.get_all_pages_in_space("IS")
        print(f"✅ Found {len(is_pages)} pages in IS space")
        
        if not is_pages:
            print("⚠️  No pages found in IS space")
            await client.close()
            return
        
        # 3. Show first 10 pages with details
        print("\n" + "=" * 80)
        print("DOCUMENTS FROM IS SPACE (First 10 pages)")
        print("=" * 80)
        
        for i, page in enumerate(is_pages[:10], 1):
            page_id = page.get('id', 'Unknown')
            title = page.get('title', 'Untitled')
            
            # Get page body
            body_storage = page.get('body', {}).get('storage', {}).get('value', '')
            body_view = page.get('body', {}).get('view', {}).get('value', '')
            body_text = body_view or body_storage
            
            # Clean HTML (basic)
            import re
            body_text = re.sub(r'<[^>]+>', '', body_text)
            body_text = body_text.replace('&nbsp;', ' ').strip()
            
            # Get version info
            version = page.get('version', {})
            version_num = version.get('number', '?')
            last_modified = version.get('when', 'Unknown')
            
            # Get space info
            space = page.get('space', {})
            space_key = space.get('key', 'IS')
            space_name = space.get('name', 'Intelligent Suite')
            
            # Get URL
            page_url = f"{base_url}/pages/viewpage.action?pageId={page_id}"
            
            print(f"\n📄 Document {i}:")
            print(f"   Title: {title}")
            print(f"   Page ID: {page_id}")
            print(f"   Space: {space_name} ({space_key})")
            print(f"   Version: {version_num}")
            print(f"   Last Modified: {last_modified}")
            print(f"   URL: {page_url}")
            
            # Show content preview (first 200 chars)
            if body_text:
                preview = body_text[:200] + "..." if len(body_text) > 200 else body_text
                print(f"   Content Preview: {preview}")
            else:
                print(f"   Content Preview: (No content)")
            
            print("-" * 80)
        
        # 4. Index these pages
        print("\n3️⃣  Indexing IS space pages into local storage...")
        from services.unified_rag_handler import get_unified_rag_handler, SourceType
        from services.document_indexer import DocumentIndexer
        
        unified_rag = get_unified_rag_handler()
        await unified_rag.initialize()
        indexer = DocumentIndexer(unified_rag)
        
        # Index all IS pages
        await indexer.index_confluence_pages(is_pages, base_url)
        print(f"✅ Indexed {len(is_pages)} pages from IS space")
        
        # 5. Verify what's in storage
        print("\n4️⃣  Verifying indexed documents in storage...")
        await unified_rag.initialize()  # Reload from storage
        
        # Get IS documents from storage
        from services.vector_storage import VectorStorage
        storage = VectorStorage()
        all_docs = storage.load_all_documents()
        
        is_docs = [doc for doc in all_docs.values() 
                  if doc.source_type == SourceType.CONFLUENCE 
                  and doc.metadata.get('space') == 'IS']
        
        print(f"✅ Found {len(is_docs)} IS documents in storage")
        
        # Show stored documents
        print("\n" + "=" * 80)
        print("STORED DOCUMENTS FROM IS SPACE (First 10)")
        print("=" * 80)
        
        for i, doc in enumerate(is_docs[:10], 1):
            print(f"\n📦 Stored Document {i}:")
            print(f"   ID: {doc.id}")
            print(f"   Title: {doc.metadata.get('title', 'Unknown')}")
            print(f"   Space: {doc.metadata.get('space', 'Unknown')}")
            print(f"   URL: {doc.metadata.get('url', 'N/A')}")
            print(f"   Text Length: {len(doc.text)} characters")
            print(f"   Has Embedding: {'Yes' if doc.embedding else 'No'}")
            
            # Show text preview
            text_preview = doc.text[:200] + "..." if len(doc.text) > 200 else doc.text
            print(f"   Text Preview: {text_preview}")
            print("-" * 80)
        
        # 6. Test a query
        print("\n5️⃣  Testing query on IS documents...")
        query = "onboarding"
        results = await unified_rag.similarity_search(
            query=query,
            top_k=5,
            source_filter=[SourceType.CONFLUENCE],
            min_score=0.0
        )
        
        # Filter to IS space results
        is_results = [r for r in results if r.metadata.get('space') == 'IS']
        
        print(f"✅ Query '{query}' returned {len(is_results)} results from IS space:")
        for i, result in enumerate(is_results[:5], 1):
            print(f"   {i}. {result.metadata.get('title', 'Unknown')} (score: {result.similarity_score:.3f})")
        
        await client.close()
        
        print("\n" + "=" * 80)
        print("✅ INDEXING COMPLETE!")
        print("=" * 80)
        print(f"\n📊 Summary:")
        print(f"   - Total pages in IS space: {len(is_pages)}")
        print(f"   - Pages indexed: {len(is_pages)}")
        print(f"   - Documents in storage: {len(is_docs)}")
        print(f"   - Storage location: {storage.db_path}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    result = asyncio.run(index_and_show_is_documents())
    exit(0 if result else 1)

