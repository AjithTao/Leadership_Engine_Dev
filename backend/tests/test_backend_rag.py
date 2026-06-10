"""Test RAG query through backend API"""
import httpx
import json
import sys

def test_backend_rag():
    """Test the backend RAG API endpoint"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # Backend URL (adjust if different)
    backend_url = "http://localhost:8000"
    
    # Query with space filter
    query = "Onboarding procedure in IS project"
    
    print("=" * 70)
    print("Testing Backend RAG API")
    print("=" * 70)
    print(f"\n[BACKEND] URL: {backend_url}")
    print(f"[QUERY] {query}")
    print("-" * 70)
    
    # Prepare request
    payload = {
        "query": query,
        "num_documents": 5,
        "temperature": 0.7
    }
    
    try:
        # Make API call
        print("\n[INFO] Sending request to /api/rag/query...")
        response = httpx.post(
            f"{backend_url}/api/rag/query",
            json=payload,
            timeout=30.0
        )
        
        print(f"[RESPONSE] Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"[ERROR] Request failed: {response.text}")
            return
        
        result = response.json()
        
        # Display results
        print("\n[RESULT]")
        print("-" * 70)
        print(f"Success: {result.get('success', False)}")
        print(f"Retrieval Status: {result.get('retrieval_status', 'unknown')}")
        print(f"Documents Used: {result.get('context_used', 0)}")
        print(f"Model: {result.get('model', 'unknown')}")
        
        # Answer
        answer = result.get('answer', '')
        if answer:
            print(f"\n[ANSWER]")
            print("-" * 70)
            print(answer)
            print("-" * 70)
        else:
            print("\n[WARNING] No answer generated")
        
        # Citations
        citations = result.get('citations', [])
        if citations:
            print(f"\n[CITATIONS] ({len(citations)} found):")
            print("-" * 70)
            for i, citation in enumerate(citations, 1):
                title = citation.get('title', 'Unknown')
                url = citation.get('url', '')
                confidence = citation.get('confidence', 0.0)
                source_type = citation.get('source_type', 'unknown')
                print(f"{i}. {title}")
                print(f"   URL: {url}")
                print(f"   Source: {source_type}")
                if isinstance(confidence, (int, float)):
                    print(f"   Confidence: {confidence:.2%}")
                print()
        else:
            print("\n[WARNING] No citations found")
        
        # Errors
        if 'error' in result and result['error']:
            print(f"\n[ERROR] {result['error']}")
        
        print("=" * 70)
        print("[SUCCESS] Test completed!")
        print("=" * 70)
        
        # Pretty print full JSON
        print("\n[FULL RESPONSE JSON]")
        print(json.dumps(result, indent=2))
        
    except httpx.ConnectError:
        print(f"\n[ERROR] Could not connect to backend at {backend_url}")
        print("[INFO] Make sure the backend server is running:")
        print("       python backend/run_server.py")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Request failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    test_backend_rag()

