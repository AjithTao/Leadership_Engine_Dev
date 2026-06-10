"""
Quick test to show IS space documents without full indexing
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'), override=True)

async def show_is_documents():
    """Show IS space documents without full indexing"""
    print("=" * 80)
    print("IS (Intelligent Suite) SPACE - DOCUMENT PREVIEW")
    print("=" * 80)
    
    try:
        # 1. Initialize Confluence client
        print("\n1️⃣  Connecting to Confluence...")
        from services.confluence import ConfluenceClient, ConfluenceConfig
        from services.encryption import get_encrypted_env
        
        base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
        email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
        raw_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN")
        
        if raw_token and raw_token.startswith('gAAAAA'):
            token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")
        else:
            token = raw_token
        
        if not (base_url and email and token):
            print("❌ Confluence credentials not configured")
            return
        
        config = ConfluenceConfig(base_url, email, token)
        client = ConfluenceClient(config)
        await client.initialize()
        print(f"✅ Connected to: {base_url}")
        
        # 2. Get first 20 pages from IS space (quick preview)
        print("\n2️⃣  Fetching first 20 pages from IS space...")
        print("   (This may take a moment...)")
        
        # Get pages with pagination
        all_pages = []
        start = 0
        limit = 20  # Just get first 20 for preview
        
        url = f"{base_url}/rest/api/content"
        params = {
            "spaceKey": "IS",
            "type": "page",
            "limit": str(limit),
            "start": str(start),
            "expand": "body.storage,body.view,version,space,metadata"
        }
        
        import httpx
        async with httpx.AsyncClient(auth=(email, token), timeout=60.0) as http_client:
            response = await http_client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            all_pages = data.get("results", [])
        
        print(f"✅ Retrieved {len(all_pages)} pages from IS space")
        
        if not all_pages:
            print("⚠️  No pages found in IS space")
            await client.close()
            return
        
        # 3. Show pages with details
        print("\n" + "=" * 80)
        print(f"DOCUMENTS FROM IS SPACE (Showing {len(all_pages)} pages)")
        print("=" * 80)
        
        for i, page in enumerate(all_pages, 1):
            page_id = page.get('id', 'Unknown')
            title = page.get('title', 'Untitled')
            
            # Get page body
            body_storage = page.get('body', {}).get('storage', {}).get('value', '')
            body_view = page.get('body', {}).get('view', {}).get('value', '')
            body_text = body_view or body_storage
            
            # Clean HTML (basic)
            import re
            import html
            body_text = re.sub(r'<[^>]+>', '', body_text)
            body_text = html.unescape(body_text)
            body_text = body_text.replace('&nbsp;', ' ').strip()
            
            # Get version info
            version = page.get('version', {})
            version_num = version.get('number', '?')
            last_modified = version.get('when', 'Unknown')
            
            # Get space info
            space = page.get('space', {})
            space_key = space.get('key', 'IS')
            space_name = space.get('name', 'Intelligent Suite')
            
            # Get URL
            page_url = f"{base_url}/pages/viewpage.action?pageId={page_id}"
            
            print(f"\n📄 Document {i}:")
            print(f"   Title: {title}")
            print(f"   Page ID: {page_id}")
            print(f"   Space: {space_name} ({space_key})")
            print(f"   Version: {version_num}")
            print(f"   Last Modified: {last_modified[:19] if len(last_modified) > 19 else last_modified}")
            print(f"   URL: {page_url}")
            
            # Show content preview (first 300 chars)
            if body_text:
                preview = body_text[:300].replace('\n', ' ').strip()
                preview = preview + "..." if len(body_text) > 300 else preview
                print(f"   Content Preview: {preview}")
            else:
                print(f"   Content Preview: (No content)")
            
            print("-" * 80)
        
        await client.close()
        
        print("\n" + "=" * 80)
        print("✅ DOCUMENT PREVIEW COMPLETE!")
        print("=" * 80)
        print(f"\n📊 Summary:")
        print(f"   - Pages shown: {len(all_pages)}")
        print(f"   - Space: IS (Intelligent Suite)")
        print(f"\n💡 To index all pages, run: test_is_space_indexing.py")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    result = asyncio.run(show_is_documents())
    exit(0 if result else 1)

