import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Test a single Jira query"""
import httpx
import json

backend_url = "http://localhost:8000"
query = "show me open bugs"

print("=" * 70)
print("Testing Jira Query")
print("=" * 70)
print(f"Query: {query}")
print()

payload = {"message": query, "source": "auto"}

try:
    response = httpx.post(f"{backend_url}/api/chat", json=payload, timeout=60.0)
    result = response.json()
    
    print(f"Status: {response.status_code}")
    print(f"Response keys: {list(result.keys())}")
    print()
    
    # Show answer
    answer = result.get('response') or result.get('message') or result.get('answer', '')
    if answer:
        print("📝 ANSWER:")
        print("-" * 70)
        print(answer)
        print("-" * 70)
    else:
        print("⚠️  No answer")
    
    # Show data
    if 'data' in result:
        data = result['data']
        print(f"\n📊 DATA:")
        print("-" * 70)
        if isinstance(data, list):
            print(f"Found {len(data)} items")
            if len(data) > 0 and len(data) <= 5:
                for i, item in enumerate(data, 1):
                    print(f"\n{i}. {json.dumps(item, indent=2)}")
            elif len(data) > 5:
                print(f"Showing first 3 of {len(data)} items:")
                for i, item in enumerate(data[:3], 1):
                    key = item.get('key', item.get('id', 'Unknown'))
                    summary = item.get('summary', item.get('title', 'No summary'))
                    print(f"  {i}. {key}: {summary}")
        print("-" * 70)
    
    # Show JQL
    if 'jql' in result:
        print(f"\n🔍 Generated JQL:")
        print(f"   {result['jql']}")
    
    print(f"\n✅ Success: {result.get('success', 'N/A')}")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

