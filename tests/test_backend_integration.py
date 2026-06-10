"""Test backend Jira and Confluence clients with actual integration"""
import sys
import os
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

# Load environment
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / "backend" / "config" / ".env"
load_dotenv(env_path, override=True)

async def test_jira_client():
    print("\n" + "="*60)
    print("TESTING JIRA CLIENT (Backend Code)")
    print("="*60)
    
    from services.jira import JiraClient, JiraConfig
    
    # Get config from environment
    jira_config = JiraConfig(
        base_url=os.getenv("JIRA_BASE_URL", "https://projects.cdk.com"),
        email=os.getenv("JIRA_SERVICE_EMAIL", ""),
        api_token=os.getenv("JIRA_SERVICE_API_TOKEN", "")
    )
    
    print(f"\nConfiguration:")
    print(f"  Base URL: {jira_config.base_url}")
    print(f"  Email: {jira_config.email}")
    print(f"  Token: {jira_config.api_token[:20]}...")
    
    client = JiraClient(jira_config)
    await client.initialize()
    
    # Test 1: Validate connection
    print(f"\n1. Validating connection...")
    try:
        result = await client.validate_connection()
        if result.get("success"):
            print(f"   ✅ SUCCESS! User: {result.get('user')}")
            print(f"   Visible Issues: {result.get('visible_issues')}")
        else:
            print(f"   ❌ Failed: {result.get('message')}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 2: Search
    print(f"\n2. Testing search...")
    try:
        result = await client.search("project is not EMPTY ORDER BY updated DESC", max_results=3)
        if result.get("issues"):
            print(f"   ✅ SUCCESS! Found {result.get('total')} issues")
            for issue in result["issues"][:3]:
                key = issue.get("key")
                summary = issue.get("fields", {}).get("summary", "N/A")[:40]
                print(f"      - {key}: {summary}...")
        else:
            print(f"   ❌ No issues found or error: {result.get('error')}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Close client
    if client._client:
        await client._client.aclose()

async def test_confluence_client():
    print("\n" + "="*60)
    print("TESTING CONFLUENCE CLIENT (Backend Code)")
    print("="*60)
    
    from services.confluence import ConfluenceClient, ConfluenceConfig
    
    # Get config from environment
    conf_config = ConfluenceConfig(
        base_url=os.getenv("CONFLUENCE_BASE_URL", "https://confluence.cdk.com"),
        email=os.getenv("CONFLUENCE_SERVICE_EMAIL", ""),
        api_token=os.getenv("CONFLUENCE_SERVICE_API_TOKEN", "")
    )
    
    print(f"\nConfiguration:")
    print(f"  Base URL: {conf_config.base_url}")
    print(f"  Email: {conf_config.email}")
    print(f"  Token: {conf_config.api_token[:20]}...")
    
    client = ConfluenceClient(conf_config)
    await client.initialize()
    
    # Test 1: Search
    print(f"\n1. Testing search...")
    try:
        results = await client.search("documentation", limit=3)
        if results:
            print(f"   ✅ SUCCESS! Found {len(results)} pages")
            for page in results[:3]:
                title = page.get("content", {}).get("title", page.get("title", "N/A"))[:40]
                print(f"      - {title}...")
        else:
            print(f"   ⚠️ No results found")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Close client
    await client.close()

async def main():
    print("\n" + "="*60)
    print("BACKEND INTEGRATION TEST")
    print("="*60)
    print("Testing Jira and Confluence clients with actual backend code...")
    
    await test_jira_client()
    await test_confluence_client()
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)
    print("\nIf both tests show SUCCESS, your backend is correctly configured!")

if __name__ == "__main__":
    import warnings
    warnings.filterwarnings('ignore')
    asyncio.run(main())
