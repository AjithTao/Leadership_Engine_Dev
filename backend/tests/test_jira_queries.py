import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Test Jira-related queries through the chat endpoint"""
import httpx
import json
import time

backend_url = "http://localhost:8000"

# Test queries for Jira
test_queries = [
    "show me open bugs",
    "how many tickets are in progress",
    "what are the recent issues in NDP project",
    "show me high priority bugs",
    "what tickets were created last week",
    "list all open stories",
]

print("=" * 70)
print("Testing Jira-Related Queries")
print("=" * 70)
print(f"Backend: {backend_url}")
print(f"Endpoint: /api/chat")
print()

for i, query in enumerate(test_queries, 1):
    print(f"\n{'='*70}")
    print(f"TEST {i}/{len(test_queries)}: {query}")
    print(f"{'='*70}")
    
    payload = {
        "message": query,
        "source": "auto"  # Let it auto-detect Jira
    }
    
    try:
        print(f"Sending request...")
        start_time = time.time()
        response = httpx.post(
            f"{backend_url}/api/chat",
            json=payload,
            timeout=60.0
        )
        elapsed = time.time() - start_time
        
        print(f"Status: {response.status_code} (took {elapsed:.2f}s)")
        
        if response.status_code == 200:
            result = response.json()
            
            # Show response structure
            print(f"\nResponse keys: {list(result.keys())}")
            
            # Show answer/message
            answer = result.get('response') or result.get('message') or result.get('answer', '')
            if answer:
                print(f"\n📝 ANSWER:")
                print("-" * 70)
                if len(answer) > 500:
                    print(answer[:500] + "...")
                    print(f"\n[Truncated - full answer is {len(answer)} characters]")
                else:
                    print(answer)
                print("-" * 70)
            else:
                print("\n⚠️  No answer in response")
            
            # Show data if available
            if 'data' in result:
                data = result['data']
                print(f"\n📊 DATA:")
                print("-" * 70)
                if isinstance(data, list):
                    print(f"Found {len(data)} items")
                    if len(data) > 0:
                        print(f"Sample item keys: {list(data[0].keys()) if isinstance(data[0], dict) else 'N/A'}")
                        if len(data) <= 3:
                            for j, item in enumerate(data, 1):
                                print(f"\n  {j}. {json.dumps(item, indent=2)[:200]}...")
                elif isinstance(data, dict):
                    print(f"Data keys: {list(data.keys())}")
                    print(json.dumps(data, indent=2)[:300] + "...")
                else:
                    print(f"Data type: {type(data)}")
                print("-" * 70)
            
            # Show JQL if generated
            if 'jql' in result:
                print(f"\n🔍 Generated JQL:")
                print(f"   {result['jql']}")
            
            # Show success status
            success = result.get('success', False)
            print(f"\n✅ Success: {success}")
            
        else:
            print(f"❌ Request failed: {response.status_code}")
            print(f"Response: {response.text[:300]}")
    
    except httpx.ConnectError:
        print(f"❌ Cannot connect to backend at {backend_url}")
        print("Make sure backend is running!")
        break
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Small delay between requests
    if i < len(test_queries):
        time.sleep(1)

print(f"\n{'='*70}")
print("Testing Complete!")
print(f"{'='*70}")

