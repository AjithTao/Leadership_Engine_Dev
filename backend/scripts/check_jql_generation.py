import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Check what JQL is generated for the queries"""
import httpx
import json

backend_url = "http://localhost:8000"

queries = [
    "show me docs2.0 export excel bugs in NDP",
    "show me docs drilldown issues in NDP",
    "show me recent bugs on pdf in NDP",
]

print("=" * 70)
print("Checking JQL Generation")
print("=" * 70)
print()

for query in queries:
    print(f"\nQuery: {query}")
    print("-" * 70)
    
    payload = {"message": query, "source": "auto"}
    
    try:
        response = httpx.post(f"{backend_url}/api/chat", json=payload, timeout=60.0)
        result = response.json()
        
        if 'jql' in result:
            print(f"Generated JQL: {result['jql']}")
        else:
            print("⚠️  No JQL in response")
        
        # Check answer
        answer = result.get('response', '')
        if "No Jira issues found" in answer:
            print("❌ No issues found")
        elif "Found" in answer:
            import re
            match = re.search(r'Found (\d+)', answer)
            if match:
                print(f"✅ Found {match.group(1)} issues")
        
    except Exception as e:
        print(f"❌ Error: {e}")

print(f"\n{'='*70}")

