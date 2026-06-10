import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Direct Confluence connection test with different configurations"""
import httpx
import os
from dotenv import load_dotenv
from services.encryption import get_encrypted_env

# Load env
env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)

base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
api_token = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")

print("=" * 70)
print("Direct Confluence Connection Test")
print("=" * 70)
print(f"Base URL: {base_url}")
print(f"Email: {email}")
print(f"Token (decrypted): {'*' * 10 if api_token else 'NOT SET'}")
print(f"Token length: {len(api_token) if api_token else 0}")
print()

# Test 1: Current configuration
print("[TEST 1] Current configuration")
print("-" * 70)
try:
    resp = httpx.get(
        f"{base_url}/rest/api/space",
        params={"limit": "1"},
        auth=(email, api_token),
        timeout=10.0,
        headers={"Accept": "application/json"}
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("✅ SUCCESS!")
        data = resp.json()
        spaces = data.get("results", []) or data.get("spaces", [])
        if spaces:
            print(f"Found space: {spaces[0].get('name', 'Unknown')}")
    else:
        print(f"Response: {resp.text[:200]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Test 2: Try with email@cdk.com format
if email and "@" not in email:
    print("[TEST 2] Trying with @cdk.com email format")
    print("-" * 70)
    test_email = f"{email}@cdk.com"
    try:
        resp = httpx.get(
            f"{base_url}/rest/api/space",
            params={"limit": "1"},
            auth=(test_email, api_token),
            timeout=10.0,
            headers={"Accept": "application/json"}
        )
        print(f"Email tried: {test_email}")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("✅ SUCCESS with @cdk.com format!")
            data = resp.json()
            spaces = data.get("results", []) or data.get("spaces", [])
            if spaces:
                print(f"Found space: {spaces[0].get('name', 'Unknown')}")
        else:
            print(f"Response: {resp.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")
    print()

# Test 3: Try with ajith.ramesh@cdk.com (from template)
print("[TEST 3] Trying with ajith.ramesh@cdk.com (from template)")
print("-" * 70)
test_email2 = "ajith.ramesh@cdk.com"
try:
    resp = httpx.get(
        f"{base_url}/rest/api/space",
        params={"limit": "1"},
        auth=(test_email2, api_token),
        timeout=10.0,
        headers={"Accept": "application/json"}
    )
    print(f"Email tried: {test_email2}")
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("✅ SUCCESS with ajith.ramesh@cdk.com!")
        data = resp.json()
        spaces = data.get("results", []) or data.get("spaces", [])
        if spaces:
            print(f"Found space: {spaces[0].get('name', 'Unknown')}")
    else:
        print(f"Response: {resp.text[:200]}")
except Exception as e:
    print(f"Error: {e}")

print()
print("=" * 70)

