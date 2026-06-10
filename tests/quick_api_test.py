"""Quick test of Jira and Confluence APIs with plain text tokens"""
import os
import asyncio
import httpx
import base64

# Tokens come from the environment (see .env.example)
JIRA_TOKEN = os.environ["JIRA_API_TOKEN"]
CONFLUENCE_TOKEN = os.environ["CONFLUENCE_API_TOKEN"]
EMAIL = "rameshaj"

JIRA_URL = "https://projects.cdk.com"
CONFLUENCE_URL = "https://confluence.cdk.com"

async def test_jira():
    print("\n" + "="*60)
    print("TESTING JIRA API")
    print("="*60)
    
    # Create auth headers - try both Bearer (for PAT) and Basic
    auth_string = f"{EMAIL}:{JIRA_TOKEN}"
    auth_b64 = base64.b64encode(auth_string.encode()).decode()
    
    headers_bearer = {
        'Authorization': f'Bearer {JIRA_TOKEN}',
        'Accept': 'application/json'
    }
    headers_basic = {
        'Authorization': f'Basic {auth_b64}',
        'Accept': 'application/json'
    }
    headers = headers_bearer  # Try Bearer first (PAT authentication)
    
    # Test /myself endpoint
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        print(f"\n1. Testing /rest/api/2/myself...")
        try:
            resp = await client.get(f"{JIRA_URL}/rest/api/2/myself", headers=headers)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                user = resp.json()
                print(f"   ✅ SUCCESS! Logged in as: {user.get('displayName', user.get('name', 'Unknown'))}")
            else:
                print(f"   ❌ Failed: {resp.text[:200]}")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        
        # Test search
        print(f"\n2. Testing /rest/api/2/search...")
        try:
            params = {"jql": "project is not EMPTY", "maxResults": 1}
            resp = await client.get(f"{JIRA_URL}/rest/api/2/search", headers=headers, params=params)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"   ✅ SUCCESS! Found {data.get('total', 0)} issues")
                if data.get('issues'):
                    issue = data['issues'][0]
                    print(f"   Sample: {issue.get('key')} - {issue.get('fields', {}).get('summary', 'N/A')[:50]}")
            else:
                print(f"   ❌ Failed: {resp.text[:200]}")
        except Exception as e:
            print(f"   ❌ Error: {e}")

async def test_confluence():
    print("\n" + "="*60)
    print("TESTING CONFLUENCE API")
    print("="*60)
    
    # Create auth headers - try both Bearer (for PAT) and Basic
    auth_string = f"{EMAIL}:{CONFLUENCE_TOKEN}"
    auth_b64 = base64.b64encode(auth_string.encode()).decode()
    
    headers_bearer = {
        'Authorization': f'Bearer {CONFLUENCE_TOKEN}',
        'Accept': 'application/json'
    }
    headers_basic = {
        'Authorization': f'Basic {auth_b64}',
        'Accept': 'application/json'
    }
    headers = headers_bearer  # Try Bearer first (PAT authentication)
    
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        print(f"\n1. Testing /rest/api/search...")
        try:
            params = {"cql": 'type=page', "limit": 1}
            resp = await client.get(f"{CONFLUENCE_URL}/rest/api/search", headers=headers, params=params)
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"   ✅ SUCCESS! Found {data.get('totalSize', data.get('size', 0))} pages")
                if data.get('results'):
                    page = data['results'][0]
                    title = page.get('content', {}).get('title', page.get('title', 'N/A'))
                    print(f"   Sample: {title[:50]}")
            else:
                print(f"   ❌ Failed: {resp.text[:300]}")
        except Exception as e:
            print(f"   ❌ Error: {e}")

async def main():
    print("\n" + "="*60)
    print("DIRECT API TEST (with plain text tokens)")
    print("="*60)
    await test_jira()
    await test_confluence()
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)

if __name__ == "__main__":
    import warnings
    warnings.filterwarnings('ignore')
    asyncio.run(main())
