import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Test specific Jira queries with product names and project filters"""
import httpx
import json
import time

backend_url = "http://localhost:8000"

queries = [
    "show me docs2.0 export excel bugs in NDP",
    "show me docs drilldown issues in NDP",
    "show me recent bugs on pdf in NDP",
]

print("=" * 70)
print("Testing Specific Jira Queries")
print("=" * 70)
print()

for i, query in enumerate(queries, 1):
    print(f"\n{'='*70}")
    print(f"TEST {i}/{len(queries)}")
    print(f"Query: {query}")
    print(f"{'='*70}")
    
    payload = {"message": query, "source": "auto"}
    
    try:
        start = time.time()
        response = httpx.post(f"{backend_url}/api/chat", json=payload, timeout=60.0)
        elapsed = time.time() - start
        result = response.json()
        
        print(f"⏱️  Response time: {elapsed:.2f}s")
        print(f"Status: {response.status_code}")
        print()
        
        answer = result.get('response', '')
        
        if answer:
            print("📝 ANSWER:")
            print("-" * 70)
            # Show full answer if reasonable length, otherwise truncate
            if len(answer) < 1000:
                print(answer)
            else:
                print(answer[:800])
                print("\n... [truncated - showing first 800 chars] ...")
                print(f"\n[Full answer is {len(answer)} characters]")
            print("-" * 70)
        else:
            print("⚠️  No answer generated")
        
        # Show data if available
        if 'data' in result and result['data']:
            data = result['data']
            if isinstance(data, list):
                print(f"\n📊 DATA:")
                print("-" * 70)
                print(f"Found {len(data)} items")
                if len(data) > 0:
                    print(f"\nFirst {min(5, len(data))} items:")
                    for j, item in enumerate(data[:5], 1):
                        key = item.get('key', 'N/A')
                        summary = item.get('summary', 'No summary')
                        status = item.get('status', {}).get('name', 'N/A') if isinstance(item.get('status'), dict) else item.get('status', 'N/A')
                        priority = item.get('priority', {}).get('name', 'N/A') if isinstance(item.get('priority'), dict) else item.get('priority', 'N/A')
                        print(f"\n  {j}. {key}")
                        print(f"     Summary: {summary[:80]}{'...' if len(summary) > 80 else ''}")
                        print(f"     Status: {status}, Priority: {priority}")
                print("-" * 70)
        
        # Show JQL if generated
        if 'jql' in result:
            print(f"\n🔍 Generated JQL:")
            print(f"   {result['jql']}")
        
        # Show success status
        success = result.get('success', 'N/A')
        print(f"\n✅ Success: {success}")
        
        # Check for errors
        if 'error' in result:
            print(f"\n⚠️  Error: {result['error']}")
        
    except httpx.ConnectError:
        print(f"❌ Cannot connect to backend at {backend_url}")
        break
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Small delay between requests
    if i < len(queries):
        time.sleep(2)

print(f"\n{'='*70}")
print("Testing Complete!")
print(f"{'='*70}")

