"""
Comprehensive Jira and Confluence API Connectivity Diagnostic
This script will test and diagnose API connection issues
"""

import sys
import os
import asyncio
import json
import logging
from pathlib import Path
import httpx
import base64

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / "backend" / "config" / ".env"
load_dotenv(env_path, override=True)

from services.encryption import get_encrypted_env, decrypt_password


async def test_jira_raw():
    """Test Jira connectivity with raw HTTP requests"""
    print("\n" + "="*100)
    print("JIRA API CONNECTIVITY TEST (RAW HTTP)")
    print("="*100)
    
    # Get configuration
    jira_url = os.getenv("JIRA_BASE_URL", "https://projects.cdk.com").rstrip("/")
    jira_email = os.getenv("JIRA_SERVICE_EMAIL", "")
    jira_token_encrypted = os.getenv("JIRA_SERVICE_API_TOKEN", "")
    
    print(f"\n📋 Configuration:")
    print(f"   Base URL: {jira_url}")
    print(f"   Email: {jira_email}")
    print(f"   Token (encrypted): {jira_token_encrypted[:50]}...")
    
    # Decrypt token
    try:
        jira_token = decrypt_password(jira_token_encrypted)
        print(f"   ✅ Token decrypted successfully")
    except Exception as e:
        print(f"   ❌ Failed to decrypt token: {e}")
        return False
    
    # Test 1: Basic Auth Header
    print(f"\n🔐 Test 1: Create Authentication Header")
    auth_string = f"{jira_email}:{jira_token}"
    auth_b64 = base64.b64encode(auth_string.encode()).decode()
    print(f"   Auth String: {jira_email}:***")
    print(f"   Base64 Auth: {auth_b64[:30]}...")
    
    # Test 2: Test connectivity to base URL
    print(f"\n🌐 Test 2: Test Base URL Connectivity")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(jira_url, follow_redirects=True)
            print(f"   Status: {resp.status_code}")
            print(f"   Headers: {dict(list(resp.headers.items())[:5])}")
            if resp.status_code == 200:
                print(f"   ✅ Base URL is accessible")
            else:
                print(f"   ⚠️  Unexpected status code: {resp.status_code}")
        except Exception as e:
            print(f"   ❌ Failed to connect: {e}")
            return False
    
    # Test 3: Test REST API endpoint
    print(f"\n🔍 Test 3: Test Jira REST API Search Endpoint (v2)")
    headers = {
        'Authorization': f'Basic {auth_b64}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    search_url = f"{jira_url}/rest/api/2/search"
    params = {
        "jql": "project is not EMPTY",
        "maxResults": 1,
        "fields": "key,summary,status"
    }
    
    print(f"   URL: {search_url}")
    print(f"   Method: GET")
    print(f"   Params: {params}")
    print(f"   Auth: Basic (email:token)")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(search_url, params=params, headers=headers)
            print(f"\n   ✅ Request sent successfully")
            print(f"   Status Code: {resp.status_code}")
            
            if resp.status_code == 200:
                print(f"   ✅ Search API is working!")
                data = resp.json()
                print(f"   Total Issues Found: {data.get('total', 0)}")
                print(f"   Response Keys: {list(data.keys())}")
                if data.get('issues'):
                    print(f"   Sample Issue: {data['issues'][0].get('key')} - {data['issues'][0].get('fields', {}).get('summary', 'N/A')}")
                return True
            elif resp.status_code == 401:
                print(f"   ❌ Authentication Failed (401)")
                print(f"   Error: {resp.text}")
                return False
            elif resp.status_code == 403:
                print(f"   ❌ Access Forbidden (403)")
                print(f"   Error: {resp.text}")
                return False
            elif resp.status_code == 404:
                print(f"   ❌ Endpoint Not Found (404)")
                print(f"   Trying v3 API...")
                # Try v3
                search_url_v3 = f"{jira_url}/rest/api/3/issues/search"
                resp_v3 = await client.get(search_url_v3, params=params, headers=headers)
                print(f"   v3 Status: {resp_v3.status_code}")
                if resp_v3.status_code == 200:
                    print(f"   ✅ v3 API works!")
                    return True
                return False
            else:
                print(f"   ⚠️  Unexpected status: {resp.status_code}")
                print(f"   Response: {resp.text[:200]}")
                return False
        except Exception as e:
            print(f"   ❌ Request failed: {e}")
            return False


async def test_confluence_raw():
    """Test Confluence connectivity with raw HTTP requests"""
    print("\n" + "="*100)
    print("CONFLUENCE API CONNECTIVITY TEST (RAW HTTP)")
    print("="*100)
    
    # Get configuration
    confluence_url = os.getenv("CONFLUENCE_BASE_URL", "https://confluence.cdk.com").rstrip("/")
    confluence_email = os.getenv("CONFLUENCE_SERVICE_EMAIL", "")
    confluence_token_encrypted = os.getenv("CONFLUENCE_SERVICE_API_TOKEN", "")
    
    print(f"\n📋 Configuration:")
    print(f"   Base URL: {confluence_url}")
    print(f"   Email: {confluence_email}")
    print(f"   Token (encrypted): {confluence_token_encrypted[:50]}...")
    
    # Decrypt token
    try:
        confluence_token = decrypt_password(confluence_token_encrypted)
        print(f"   ✅ Token decrypted successfully")
    except Exception as e:
        print(f"   ❌ Failed to decrypt token: {e}")
        return False
    
    # Test 1: Basic Auth Header
    print(f"\n🔐 Test 1: Create Authentication Header")
    auth_string = f"{confluence_email}:{confluence_token}"
    auth_b64 = base64.b64encode(auth_string.encode()).decode()
    print(f"   Auth String: {confluence_email}:***")
    print(f"   Base64 Auth: {auth_b64[:30]}...")
    
    # Test 2: Test connectivity to base URL
    print(f"\n🌐 Test 2: Test Base URL Connectivity")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(confluence_url, follow_redirects=True)
            print(f"   Status: {resp.status_code}")
            print(f"   Headers: {dict(list(resp.headers.items())[:5])}")
            if resp.status_code in [200, 301, 302]:
                print(f"   ✅ Base URL is accessible")
            else:
                print(f"   ⚠️  Unexpected status code: {resp.status_code}")
        except Exception as e:
            print(f"   ❌ Failed to connect: {e}")
            return False
    
    # Test 3: Test REST API endpoint
    print(f"\n🔍 Test 3: Test Confluence REST API Search Endpoint")
    headers = {
        'Authorization': f'Basic {auth_b64}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    search_url = f"{confluence_url}/rest/api/search"
    params = {
        "cql": 'text ~ "test"',
        "limit": "1"
    }
    
    print(f"   URL: {search_url}")
    print(f"   Method: GET")
    print(f"   Params: {params}")
    print(f"   Auth: Basic (email:token)")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(search_url, params=params, headers=headers)
            print(f"\n   ✅ Request sent successfully")
            print(f"   Status Code: {resp.status_code}")
            
            if resp.status_code == 200:
                print(f"   ✅ Search API is working!")
                data = resp.json()
                print(f"   Total Results: {data.get('size', 0)}")
                print(f"   Response Keys: {list(data.keys())}")
                if data.get('results'):
                    print(f"   Sample Result: {data['results'][0].get('content', {}).get('title', 'N/A')}")
                return True
            elif resp.status_code == 401:
                print(f"   ❌ Authentication Failed (401)")
                print(f"   Error: {resp.text[:500]}")
                return False
            elif resp.status_code == 403:
                print(f"   ❌ Access Forbidden (403)")
                print(f"   Error: {resp.text[:500]}")
                return False
            elif resp.status_code == 404:
                print(f"   ❌ Endpoint Not Found (404)")
                print(f"   Response: {resp.text[:200]}")
                return False
            else:
                print(f"   ⚠️  Unexpected status: {resp.status_code}")
                print(f"   Response: {resp.text[:500]}")
                return False
        except Exception as e:
            print(f"   ❌ Request failed: {e}")
            return False


async def main():
    """Run all tests"""
    print("\n" + "="*100)
    print("API CONNECTIVITY DIAGNOSTIC TOOL")
    print("="*100)
    print("""
This tool will diagnose issues with your Jira and Confluence API connections by:
1. Verifying configuration is loaded correctly
2. Testing authentication tokens (decryption)
3. Testing raw HTTP connectivity
4. Testing REST API endpoints
5. Providing detailed error messages for troubleshooting
    """)
    
    jira_ok = await test_jira_raw()
    confluence_ok = await test_confluence_raw()
    
    # Summary
    print("\n" + "="*100)
    print("DIAGNOSTIC SUMMARY")
    print("="*100)
    print(f"""
Jira API Status: {'✅ WORKING' if jira_ok else '❌ FAILED'}
Confluence API Status: {'✅ WORKING' if confluence_ok else '❌ FAILED'}

Expected API Endpoints:

JIRA:
  • Base URL: https://projects.cdk.com
  • v2 REST API: /rest/api/v2/search
  • v3 REST API: /rest/api/v3/issues/search
  • Full Example: https://projects.cdk.com/rest/api/v2/search?jql=...

CONFLUENCE:
  • Base URL: https://confluence.cdk.com
  • REST API: /rest/api/search
  • Full Example: https://confluence.cdk.com/rest/api/search?cql=...

Troubleshooting Tips:

If Jira is failing:
  1. Check JIRA_BASE_URL is correct (should be https://projects.cdk.com)
  2. Verify JIRA_SERVICE_EMAIL and JIRA_SERVICE_API_TOKEN are present
  3. Ensure SESSION_SECRET_KEY is correct (used for token decryption)
  4. Check firewall allows connection to projects.cdk.com
  5. Verify API token hasn't expired or been revoked
  6. Check if user has "Browse Projects" permission in Jira

If Confluence is failing:
  1. Check CONFLUENCE_BASE_URL is correct (should be https://confluence.cdk.com)
  2. Verify CONFLUENCE_SERVICE_EMAIL and CONFLUENCE_SERVICE_API_TOKEN are present
  3. Ensure SESSION_SECRET_KEY is correct (used for token decryption)
  4. Check firewall allows connection to confluence.cdk.com
  5. Verify API token hasn't expired or been revoked
  6. Check if user has appropriate space access permissions

Next Steps:
  1. If both APIs are working: Issue might be in your backend code logic
  2. If authentication fails: Regenerate tokens in Jira/Confluence
  3. If connection fails: Check network/firewall settings
  4. If endpoint not found: Verify base URLs are correct
    """)


if __name__ == "__main__":
    asyncio.run(main())
