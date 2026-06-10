"""
Test script to verify Jira and Confluence API connectivity
This will test the actual endpoints being used by the backend
"""

import sys
import os
import asyncio
import json
import logging
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from services.jira import JiraClient, JiraConfig
from services.confluence import ConfluenceClient, ConfluenceConfig
from config.auth import load_config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_jira_connection():
    """Test Jira API connectivity"""
    print("\n" + "="*80)
    print("TESTING JIRA API CONNECTIVITY")
    print("="*80)
    
    try:
        # Load config
        config = load_config()
        
        print(f"\n📋 Jira Configuration:")
        print(f"   Base URL: {config.jira_base_url}")
        print(f"   Email: {config.jira_email}")
        print(f"   API Token Present: {bool(config.jira_api_token)}")
        
        # Create Jira client
        jira_cfg = JiraConfig(
            base_url=config.jira_base_url,
            email=config.jira_email,
            api_token=config.jira_api_token
        )
        
        client = JiraClient(jira_cfg)
        await client.initialize()
        
        print(f"\n✅ Jira client initialized")
        print(f"   API Version Detected: v{client._api_version}")
        
        # Test 1: Simple search
        print("\n🔍 Test 1: Simple JQL Search")
        print("   Query: 'project = PROJ' (first 5 results)")
        
        try:
            results = await client.search("project = PROJ", max_results=5)
            print(f"   ✅ Search successful!")
            print(f"   Response Status: {getattr(results, 'status_code', 'N/A')}")
            if hasattr(results, 'json'):
                data = results.json() if callable(results.json) else results.json
                print(f"   Total Issues Found: {data.get('total', 0)}")
                if data.get('issues'):
                    print(f"   Sample Issue: {data['issues'][0].get('key', 'N/A')}")
        except Exception as e:
            print(f"   ❌ Search failed: {e}")
        
        # Test 2: Check API endpoint
        print("\n🔍 Test 2: Testing Jira API Endpoint")
        url = client._url(client._api("/search"))
        print(f"   Full URL: {url}")
        
        # Close client
        if client._client:
            await client._client.aclose()
        
    except Exception as e:
        print(f"❌ Jira connection test failed: {e}")
        import traceback
        traceback.print_exc()


async def test_confluence_connection():
    """Test Confluence API connectivity"""
    print("\n" + "="*80)
    print("TESTING CONFLUENCE API CONNECTIVITY")
    print("="*80)
    
    try:
        # Load config
        config = load_config()
        
        print(f"\n📋 Confluence Configuration:")
        print(f"   Base URL: {config.confluence_base_url}")
        print(f"   Email: {config.confluence_email}")
        print(f"   API Token Present: {bool(config.confluence_api_token)}")
        
        # Create Confluence client
        conf_cfg = ConfluenceConfig(
            base_url=config.confluence_base_url,
            email=config.confluence_email,
            api_token=config.confluence_api_token
        )
        
        client = ConfluenceClient(conf_cfg)
        await client.initialize()
        
        print(f"\n✅ Confluence client initialized")
        
        # Test 1: Simple search
        print("\n🔍 Test 1: Simple Search")
        print("   Query: 'test' (first 5 results)")
        
        try:
            results = await client.search("test", limit=5)
            print(f"   ✅ Search successful!")
            print(f"   Total Results: {len(results)}")
            if results:
                print(f"   Sample Result: {results[0].get('content', {}).get('title', 'N/A')}")
        except Exception as e:
            print(f"   ❌ Search failed: {e}")
        
        # Test 2: Check API endpoint
        print("\n🔍 Test 2: Testing Confluence API Endpoint")
        url = f"{conf_cfg.base_url}/rest/api/search"
        print(f"   Full URL: {url}")
        
        # Close client
        await client.close()
        
    except Exception as e:
        print(f"❌ Confluence connection test failed: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run all connectivity tests"""
    print("\n" + "="*80)
    print("API CONNECTIVITY VERIFICATION TEST")
    print("="*80)
    print("This script will test the Jira and Confluence API connections")
    print("and verify that the backend can reach the configured endpoints.\n")
    
    await test_jira_connection()
    await test_confluence_connection()
    
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print("""
Expected API Endpoints:

JIRA:
  - Base URL: https://projects.cdk.com
  - REST API Path: /rest/api/v2/search (for Server/DC) or /rest/api/v3/search (for Cloud)
  - Full Example: https://projects.cdk.com/rest/api/v2/search?jql=project%3DKEY
  
CONFLUENCE:
  - Base URL: https://confluence.cdk.com
  - REST API Path: /rest/api/search
  - Full Example: https://confluence.cdk.com/rest/api/search?cql=text%3D...

If you see ✅ messages, the APIs are working.
If you see ❌ messages, check:
  1. Base URLs are correct
  2. Credentials (email/token) are correct
  3. Firewall/network allows connection to those servers
  4. The tokens haven't expired
""")


if __name__ == "__main__":
    asyncio.run(main())
