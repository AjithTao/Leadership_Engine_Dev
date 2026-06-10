import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Quick test script to verify Confluence authentication"""
import os
import httpx
import sys
from dotenv import load_dotenv

# Load environment variables (same way backend/main.py does)
env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)
# Also try loading from root config
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'config', '.env'), override=True)

# Import encryption utility to decrypt the token
from services.encryption import get_encrypted_env

base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
# Decrypt the API token (it's stored encrypted in .env)
api_token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")

print("=" * 60)
print("Confluence Authentication Test")
print("=" * 60)

if not base_url:
    print("[ERROR] CONFLUENCE_BASE_URL not set")
    sys.exit(1)
if not email:
    print("[ERROR] CONFLUENCE_SERVICE_EMAIL not set")
    sys.exit(1)
if not api_token:
    print("[ERROR] CONFLUENCE_SERVICE_API_TOKEN not set")
    sys.exit(1)

print(f"[INFO] Base URL: {base_url}")
print(f"[INFO] Email: {email}")
print(f"[INFO] Token: {'*' * 10 if api_token else 'NOT SET'}")

# Test connection
test_url = f"{base_url}/rest/api/space"
print(f"\n[TEST] Connecting to: {test_url}")

try:
    resp = httpx.get(
        test_url,
        params={"limit": "1"},
        auth=(email, api_token),
        timeout=10.0,
        headers={"Accept": "application/json"}
    )
    
    print(f"[RESULT] Status Code: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        spaces = data.get("results", []) or data.get("spaces", [])
        if spaces:
            print(f"[SUCCESS] Authentication successful!")
            print(f"[INFO] Found {len(spaces)} space(s)")
            if spaces:
                print(f"[INFO] Sample space: {spaces[0].get('name', 'N/A')}")
        else:
            print(f"[WARNING] Authentication successful but no spaces returned")
    else:
        print(f"[ERROR] Authentication failed")
        print(f"[RESPONSE] {resp.text[:300]}")
        sys.exit(1)
        
except Exception as e:
    print(f"[ERROR] Connection failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("=" * 60)
print("[SUCCESS] Confluence configuration is working!")
print("=" * 60)

