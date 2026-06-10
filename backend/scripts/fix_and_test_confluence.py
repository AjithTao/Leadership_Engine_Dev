import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Fix Confluence token and test immediately"""
import os
import httpx
from dotenv import load_dotenv
from services.encryption import encrypt_password

env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)

print("=" * 70)
print("Confluence Token Fix & Test")
print("=" * 70)
print()

base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
current_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN", "")

print(f"Current config:")
print(f"  Base URL: {base_url}")
print(f"  Email: {email}")
print(f"  Token in .env: {'Encrypted' if current_token.startswith('gAAAAA') else 'Plain text'}")
print()

# Get plain text token
print("Enter your Confluence API token (plain text):")
print("(This will be used to test and optionally update .env)")
plain_token = input("Token: ").strip()

if not plain_token:
    print("No token provided. Exiting.")
    exit(1)

print()
print("Testing connection with plain text token...")
print("-" * 70)

# Test 1: Basic connection
try:
    resp = httpx.get(
        f"{base_url}/rest/api/space",
        params={"limit": "1"},
        auth=(email, plain_token),
        timeout=10.0,
        headers={"Accept": "application/json"}
    )
    
    if resp.status_code == 200:
        print("✅ Authentication successful!")
        data = resp.json()
        spaces = data.get("results", []) or data.get("spaces", [])
        if spaces:
            print(f"   Found space: {spaces[0].get('name', 'Unknown')}")
        
        # Test 2: Search query
        print()
        print("Testing search query: 'onboarding procedure in IS project'...")
        print("-" * 70)
        
        search_resp = httpx.get(
            f"{base_url}/rest/api/search",
            params={"cql": 'space = "IS" AND text ~ "onboarding procedure"', "limit": "5"},
            auth=(email, plain_token),
            timeout=10.0,
            headers={"Accept": "application/json"}
        )
        
        if search_resp.status_code == 200:
            results = search_resp.json().get("results", [])
            print(f"✅ Search successful! Found {len(results)} results")
            print()
            for i, result in enumerate(results[:5], 1):
                content = result.get("content", {})
                title = content.get("title", "Unknown")
                content_id = content.get("id", "")
                url = f"{base_url}/pages/{content_id}" if content_id else ""
                print(f"  {i}. {title}")
                print(f"     URL: {url}")
                print()
            
            # Ask if user wants to update .env
            print()
            print("=" * 70)
            update = input("Update .env file with encrypted token? (y/n): ").strip().lower()
            if update == 'y':
                encrypted = encrypt_password(plain_token)
                # Read current .env
                with open(env_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                
                # Update the token line
                updated = False
                with open(env_path, 'w', encoding='utf-8') as f:
                    for line in lines:
                        if line.startswith('CONFLUENCE_SERVICE_API_TOKEN='):
                            f.write(f'CONFLUENCE_SERVICE_API_TOKEN={encrypted}\n')
                            updated = True
                        else:
                            f.write(line)
                
                if updated:
                    print(f"✅ Updated {env_path} with encrypted token")
                    print("   Restart backend server to use new token")
                else:
                    print(f"⚠️  Could not find CONFLUENCE_SERVICE_API_TOKEN in .env")
                    print(f"   Add this line manually:")
                    print(f"   CONFLUENCE_SERVICE_API_TOKEN={encrypted}")
        else:
            print(f"❌ Search failed: {search_resp.status_code}")
            print(search_resp.text[:300])
    else:
        print(f"❌ Authentication failed: {resp.status_code}")
        print(f"Response: {resp.text[:300]}")
        print()
        print("Possible issues:")
        print("  1. Email format - try full email (e.g., rameshaj@cdk.com)")
        print("  2. Token is incorrect or expired")
        print("  3. Base URL is wrong")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print()
print("=" * 70)

