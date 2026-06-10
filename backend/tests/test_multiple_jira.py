import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Test multiple Jira query types"""
import httpx
import json
import time

backend_url = "http://localhost:8000"

queries = [
    ("show me open bugs", "Basic query"),
    ("how many tickets are in progress", "Count query"),
    ("what are the recent issues in NDP project", "Project-specific"),
    ("show me high priority bugs", "Priority filter"),
]

print("=" * 70)
print("Testing Multiple Jira Query Types")
print("=" * 70)
print()

for query, description in queries:
    print(f"\n{'='*70}")
    print(f"Query: {query}")
    print(f"Type: {description}")
    print(f"{'='*70}")
    
    payload = {"message": query, "source": "auto"}
    
    try:
        start = time.time()
        response = httpx.post(f"{backend_url}/api/chat", json=payload, timeout=60.0)
        elapsed = time.time() - start
        result = response.json()
        
        answer = result.get('response', '')
        
        # Show summary
        print(f"⏱️  Response time: {elapsed:.2f}s")
        
        if answer:
            # Show first 300 chars of answer
            preview = answer[:300] + "..." if len(answer) > 300 else answer
            print(f"\n📝 Answer Preview:")
            print("-" * 70)
            print(preview)
            print("-" * 70)
            
            # Count issues mentioned
            if "Found" in answer and "issues" in answer:
                import re
                match = re.search(r'Found (\d+)', answer)
                if match:
                    print(f"\n📊 Issues found: {match.group(1)}")
        
        # Show data if available
        if 'data' in result and result['data']:
            data = result['data']
            if isinstance(data, list):
                print(f"📋 Data items: {len(data)}")
                if len(data) > 0:
                    print(f"   Sample: {data[0].get('key', 'N/A')} - {data[0].get('summary', 'N/A')[:50]}")
        
        # Show JQL if generated
        if 'jql' in result:
            print(f"\n🔍 Generated JQL: {result['jql'][:100]}...")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    time.sleep(1)  # Small delay

print(f"\n{'='*70}")
print("Testing Complete!")
print(f"{'='*70}")

