"""
Demonstrate how Confluence queries work with indexed IS space documents
Shows example questions and how the system responds
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

async def demonstrate_is_queries():
    """Show how queries work with IS space documents"""
    print("=" * 80)
    print("IS SPACE QUERY DEMONSTRATION")
    print("=" * 80)
    print("\nThis shows how the system searches indexed IS documents")
    print("when you ask Confluence-related questions.\n")
    
    try:
        # Initialize RAG handler
        from services.unified_rag_handler import get_unified_rag_handler, SourceType
        from services.rag_handler import get_handler
        
        unified_rag = get_unified_rag_handler()
        await unified_rag.initialize()
        
        rag_handler = get_handler()
        
        # Check how many IS documents we have
        from services.vector_storage import VectorStorage
        storage = VectorStorage()
        all_docs = storage.load_all_documents()
        is_docs = [doc for doc in all_docs.values() 
                  if doc.source_type == SourceType.CONFLUENCE 
                  and doc.metadata.get('space') == 'IS']
        
        print(f"📊 Current Status:")
        print(f"   - IS documents indexed: {len(is_docs)}")
        print(f"   - Storage location: {storage.db_path}")
        
        if len(is_docs) == 0:
            print("\n⚠️  No IS documents indexed yet!")
            print("   Please run: python index_is_space.py first")
            return
        
        # Example queries
        example_queries = [
            {
                "question": "What is the onboarding procedure in IS project?",
                "description": "Looking for onboarding information"
            },
            {
                "question": "Show me release notes for CDK_IS",
                "description": "Searching for release documentation"
            },
            {
                "question": "What are the top KPIs in Intelligence Suite?",
                "description": "Finding KPI information"
            },
            {
                "question": "How do I add tests to tickets in IS?",
                "description": "Looking for process documentation"
            },
            {
                "question": "What are the standard practices for releases?",
                "description": "Finding release practices"
            },
            {
                "question": "Show me sprint retrospectives",
                "description": "Searching for retrospective documents"
            },
            {
                "question": "What is the JIRA standard practice in IS?",
                "description": "Finding JIRA practices"
            }
        ]
        
        print("\n" + "=" * 80)
        print("EXAMPLE QUERIES AND RESULTS")
        print("=" * 80)
        
        for i, query_info in enumerate(example_queries, 1):
            query = query_info["question"]
            description = query_info["description"]
            
            print(f"\n{'='*80}")
            print(f"Query {i}: {query}")
            print(f"Context: {description}")
            print(f"{'='*80}")
            
            # Search using unified RAG handler (local storage)
            print("\n🔍 Searching local storage (IS indexed documents)...")
            results = await unified_rag.similarity_search(
                query=query,
                top_k=5,
                source_filter=[SourceType.CONFLUENCE],
                min_score=0.0
            )
            
            # Filter to IS space results
            is_results = [r for r in results if r.metadata.get('space') == 'IS']
            
            if is_results:
                print(f"✅ Found {len(is_results)} relevant documents from IS space:\n")
                
                for j, result in enumerate(is_results, 1):
                    title = result.metadata.get('title', 'Unknown')
                    score = result.similarity_score or 0.0
                    url = result.metadata.get('url', '')
                    text_preview = result.text[:150].replace('\n', ' ') + "..." if len(result.text) > 150 else result.text
                    
                    print(f"   {j}. {title}")
                    print(f"      Relevance Score: {score:.3f} ({score*100:.1f}% match)")
                    print(f"      URL: {url}")
                    print(f"      Preview: {text_preview}")
                    print()
            else:
                print("   ⚠️  No IS documents found for this query")
                print("   (System would fallback to Confluence API search)")
            
            # Also show what RAG handler would return
            print("🔍 Testing RAG handler search (checks local storage first)...")
            try:
                rag_results = rag_handler.search_documents(query, num_results=3)
                if rag_results:
                    print(f"   ✅ RAG handler found {len(rag_results)} results")
                    for j, result in enumerate(rag_results[:3], 1):
                        title = result.get('metadata', {}).get('page_title', 'Unknown')
                        score = result.get('score', 0.0)
                        print(f"      {j}. {title} (score: {score:.3f})")
                else:
                    print("   ℹ️  RAG handler returned no results (would use API fallback)")
            except Exception as e:
                print(f"   ⚠️  RAG handler test failed: {e}")
        
        print("\n" + "=" * 80)
        print("HOW IT WORKS")
        print("=" * 80)
        print("""
1. You ask a question (e.g., "What is the onboarding procedure in IS project?")

2. System checks in this order:
   a. ✅ Local Storage (IS indexed documents) - FAST (50-100ms)
   b. ⚠️  Confluence API (if nothing found locally) - SLOWER (500-2000ms)

3. Results are ranked by relevance (similarity score 0.0-1.0)

4. Top results are returned with:
   - Document title
   - Relevance score
   - URL to original page
   - Content preview

5. The AI generates an answer based on the retrieved documents
        """)
        
        print("=" * 80)
        print("TRY THESE QUESTIONS IN YOUR CHAT INTERFACE:")
        print("=" * 80)
        print("\n1. 'What is the onboarding procedure in IS project?'")
        print("2. 'Show me release notes for CDK_IS'")
        print("3. 'What are the top KPIs?'")
        print("4. 'How do I add tests to tickets?'")
        print("5. 'What are the standard practices for releases?'")
        print("6. 'Show me sprint retrospectives'")
        print("7. 'What is the JIRA standard practice?'")
        print("\n💡 Tip: The system will search your indexed IS documents first,")
        print("   making queries 10-20x faster than API calls!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    result = asyncio.run(demonstrate_is_queries())
    exit(0 if result else 1)

