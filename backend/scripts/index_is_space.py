import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""
Index all pages from IS (Intelligent Suite) space into local storage
"""
import asyncio
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

async def index_all_is_pages():
    """Index all pages from IS space"""
    print("=" * 80)
    print("INDEXING ALL PAGES FROM IS (Intelligent Suite) SPACE")
    print("=" * 80)
    
    start_time = datetime.now()
    
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
            return False
        
        config = ConfluenceConfig(base_url, email, token)
        client = ConfluenceClient(config)
        await client.initialize()
        print(f"✅ Connected to: {base_url}")
        
        # 2. Get all pages from IS space
        print("\n2️⃣  Fetching ALL pages from IS space...")
        print("   (This may take a few minutes depending on number of pages...)")
        
        is_pages = await client.get_all_pages_in_space("IS")
        print(f"✅ Retrieved {len(is_pages)} pages from IS space")
        
        if not is_pages:
            print("⚠️  No pages found in IS space")
            await client.close()
            return False
        
        # 3. Initialize unified RAG handler and indexer
        print("\n3️⃣  Initializing indexing system...")
        from services.unified_rag_handler import get_unified_rag_handler, SourceType
        from services.document_indexer import DocumentIndexer
        
        unified_rag = get_unified_rag_handler()
        await unified_rag.initialize()
        indexer = DocumentIndexer(unified_rag)
        print("✅ Indexing system ready")
        
        # 4. Index all pages
        print(f"\n4️⃣  Indexing {len(is_pages)} pages into local storage...")
        print("   (This will generate embeddings for each page - may take several minutes...)")
        print("   (Progress will be shown every 5 pages)\n")
        
        indexed_count = 0
        failed_count = 0
        
        # Index in batches for better progress tracking
        batch_size = 5
        for i in range(0, len(is_pages), batch_size):
            batch = is_pages[i:i+batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(is_pages) + batch_size - 1) // batch_size
            
            try:
                # Index the batch
                await indexer.index_confluence_pages(batch, base_url)
                indexed_count += len(batch)
                
                # Show progress
                print(f"   ✅ Batch {batch_num}/{total_batches}: Indexed {min(i+batch_size, len(is_pages))}/{len(is_pages)} pages")
                
            except Exception as e:
                # If batch fails, try individual pages
                for page in batch:
                    try:
                        await indexer.index_confluence_pages([page], base_url)
                        indexed_count += 1
                    except Exception as page_err:
                        failed_count += 1
                        page_title = page.get('title', 'Unknown')
                        print(f"   ⚠️  Failed to index '{page_title}': {page_err}")
        
        print(f"\n   ✅ Indexing complete: {indexed_count} successful, {failed_count} failed")
        
        # 5. Verify what's in storage
        print("\n5️⃣  Verifying indexed documents in storage...")
        await unified_rag.initialize()  # Reload from storage
        
        from services.vector_storage import VectorStorage
        storage = VectorStorage()
        all_docs = storage.load_all_documents()
        
        is_docs = [doc for doc in all_docs.values() 
                  if doc.source_type == SourceType.CONFLUENCE 
                  and doc.metadata.get('space') == 'IS']
        
        print(f"✅ Found {len(is_docs)} IS documents in storage")
        
        # 6. Show sample of indexed documents
        print("\n6️⃣  Sample of indexed documents:")
        print("-" * 80)
        for i, doc in enumerate(is_docs[:10], 1):
            title = doc.metadata.get('title', 'Unknown')
            page_id = doc.metadata.get('id', 'Unknown')
            has_embedding = 'Yes' if doc.embedding else 'No'
            print(f"   {i}. {title} (ID: {page_id}, Embedding: {has_embedding})")
        
        if len(is_docs) > 10:
            print(f"   ... and {len(is_docs) - 10} more documents")
        
        # 7. Test a query
        print("\n7️⃣  Testing query on indexed documents...")
        test_queries = ["onboarding", "release", "KPI"]
        
        for query in test_queries:
            results = await unified_rag.similarity_search(
                query=query,
                top_k=3,
                source_filter=[SourceType.CONFLUENCE],
                min_score=0.0
            )
            
            # Filter to IS space results
            is_results = [r for r in results if r.metadata.get('space') == 'IS']
            
            if is_results:
                print(f"\n   Query: '{query}'")
                for j, result in enumerate(is_results[:3], 1):
                    title = result.metadata.get('title', 'Unknown')
                    score = result.similarity_score or 0.0
                    print(f"      {j}. {title} (score: {score:.3f})")
        
        await client.close()
        
        # Summary
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print("\n" + "=" * 80)
        print("✅ INDEXING COMPLETE!")
        print("=" * 80)
        print(f"\n📊 Summary:")
        print(f"   - Total pages in IS space: {len(is_pages)}")
        print(f"   - Successfully indexed: {indexed_count}")
        print(f"   - Failed: {failed_count}")
        print(f"   - Documents in storage: {len(is_docs)}")
        print(f"   - Time taken: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        print(f"   - Storage location: {storage.db_path}")
        print(f"\n🎉 All IS space pages are now indexed and ready for fast queries!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    result = asyncio.run(index_all_is_pages())
    exit(0 if result else 1)

