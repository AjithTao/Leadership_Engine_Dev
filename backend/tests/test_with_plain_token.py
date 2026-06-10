import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Quick test with plain text token"""
import httpx
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)

base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
email = os.getenv("CONFLUENCE_SERVICE_EMAIL")

print("=" * 70)
print("Quick Confluence Test with Plain Text Token")
print("=" * 70)
print(f"Base URL: {base_url}")
print(f"Email: {email}")
print()

# Get token from user or env
token = os.getenv("CONFLUENCE_PLAIN_TOKEN")  # Can set this as env var
if not token:
    print("Enter your Confluence API token (plain text):")
    token = input("Token: ").strip()

if not token:
    print("No token provided. Exiting.")
    exit(1)

print()
print("Testing connection...")
print("-" * 70)

try:
    resp = httpx.get(
        f"{base_url}/rest/api/space",
        params={"limit": "1"},
        auth=(email, token),
        timeout=10.0,
        headers={"Accept": "application/json"}
    )
    
    print(f"Status Code: {resp.status_code}")
    
    if resp.status_code == 200:
        print("✅ SUCCESS! Authentication works!")
        data = resp.json()
        spaces = data.get("results", []) or data.get("spaces", [])
        if spaces:
            print(f"Found space: {spaces[0].get('name', 'Unknown')}")
        
        print()
        print("Now testing search query...")
        print("-" * 70)
        
        # Test search
        search_resp = httpx.get(
            f"{base_url}/rest/api/search",
            params={"cql": 'space = "IS" AND text ~ "onboarding"', "limit": "5"},
            auth=(email, token),
            timeout=10.0,
            headers={"Accept": "application/json"}
        )
        
        if search_resp.status_code == 200:
            results = search_resp.json().get("results", [])
            print(f"✅ Search successful! Found {len(results)} results")
            for i, result in enumerate(results[:3], 1):
                content = result.get("content", {})
                title = content.get("title", "Unknown")
                print(f"  {i}. {title}")
        else:
            print(f"Search failed: {search_resp.status_code}")
            print(search_resp.text[:200])
            
    else:
        print(f"❌ Authentication failed")
        print(f"Response: {resp.text[:300]}")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print()
print("=" * 70)

