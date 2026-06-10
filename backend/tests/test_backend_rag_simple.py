"""Test RAG query with different variations"""
import httpx
import json

def test_query(query, description):
    """Test a single query"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    backend_url = "http://localhost:8000"
    
    print(f"\n{'='*70}")
    print(f"TEST: {description}")
    print(f"{'='*70}")
    print(f"Query: {query}")
    print("-" * 70)
    
    payload = {"query": query, "num_documents": 5}
    
    try:
        response = httpx.post(f"{backend_url}/api/rag/query", json=payload, timeout=30.0)
        result = response.json()
        
        print(f"Status: {result.get('retrieval_status', 'unknown')}")
        print(f"Documents: {result.get('context_used', 0)}")
        print(f"Citations: {len(result.get('citations', []))}")
        
        if result.get('citations'):
            print("\nCitations:")
            for i, cit in enumerate(result.get('citations', [])[:3], 1):
                print(f"  {i}. {cit.get('title', 'Unknown')}")
        
        answer = result.get('answer', '')
        if answer and len(answer) > 50:
            print(f"\nAnswer preview: {answer[:100]}...")
        elif answer:
            print(f"\nAnswer: {answer}")
        
        return result
    except Exception as e:
        print(f"ERROR: {e}")
        return None

if __name__ == "__main__":
    # Test 1: Simple query
    test_query("onboarding procedure", "Simple query without space filter")
    
    # Test 2: With IS space
    test_query("onboarding procedure in IS project", "Query with IS space filter")
    
    # Test 3: Just IS space
    test_query("onboarding in IS", "Query with IS space (short)")
    
    # Test 4: Space syntax
    test_query("space = IS AND text ~ onboarding", "Direct CQL syntax")

