"""Test RAG query for onboarding procedure"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'config', '.env'), override=True)

from services.rag_handler import get_handler

def test_query():
    """Test the onboarding procedure query"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print("=" * 70)
    print("Testing RAG Query: 'onboarding procedure'")
    print("=" * 70)
    
    # Initialize handler
    print("\n[INFO] Initializing RAG handler...")
    handler = get_handler()
    
    if not handler:
        print("[ERROR] Failed to initialize RAG handler")
        return
    
    print(f"[INFO] Handler type: {type(handler).__name__}")
    print(f"[INFO] Handler initialized: {handler is not None}\n")
    
    # Test query
    query = "onboarding procedure"
    print(f"[QUERY] Searching for: '{query}'")
    print("-" * 70)
    
    try:
        # Generate RAG response
        print("[INFO] Generating RAG response...")
        result = handler.generate_rag_response(query, num_docs=5)
        
        print(f"\n[RESULT] Status: {result.get('retrieval_status', 'unknown')}")
        print(f"[RESULT] Documents found: {result.get('context_used', 0)}")
        print(f"[RESULT] Citations: {len(result.get('citations', []))}")
        
        # Show answer
        answer = result.get('answer', 'No answer generated')
        print(f"\n[ANSWER]")
        print("-" * 70)
        print(answer)
        print("-" * 70)
        
        # Show citations
        citations = result.get('citations', [])
        if citations:
            print(f"\n[CITATIONS] ({len(citations)} found):")
            print("-" * 70)
            for i, citation in enumerate(citations, 1):
                title = citation.get('title', 'Unknown')
                url = citation.get('url', '')
                confidence = citation.get('confidence', 0.0)
                print(f"{i}. {title}")
                print(f"   URL: {url}")
                if isinstance(confidence, (int, float)):
                    print(f"   Confidence: {confidence:.2%}")
                else:
                    print(f"   Confidence: {confidence}")
                print()
        else:
            print("\n[WARNING] No citations found")
        
        # Show any errors
        if 'error' in result:
            print(f"\n[ERROR] {result['error']}")
        
        print("=" * 70)
        print("[SUCCESS] Query completed!")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n[ERROR] Query failed: {e}")
        import traceback
        traceback.print_exc()
        print("=" * 70)

if __name__ == "__main__":
    test_query()

