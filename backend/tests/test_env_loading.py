import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Test if backend environment loading works correctly"""
import os
import sys
from dotenv import load_dotenv

# Load environment the same way backend/main.py does
env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
print(f"Loading .env from: {env_path}")
print(f"File exists: {os.path.exists(env_path)}")

load_dotenv(env_path, override=True)

# Check variables
base_url = os.getenv("CONFLUENCE_BASE_URL", "").rstrip("/")
email = os.getenv("CONFLUENCE_SERVICE_EMAIL")
api_token_raw = os.getenv("CONFLUENCE_SERVICE_API_TOKEN")

print(f"\n[ENV VARS]")
print(f"CONFLUENCE_BASE_URL: {base_url}")
print(f"CONFLUENCE_SERVICE_EMAIL: {email}")
print(f"CONFLUENCE_SERVICE_API_TOKEN (raw): {'*' * 20 if api_token_raw else 'NOT SET'}")
print(f"Token length: {len(api_token_raw) if api_token_raw else 0}")
print(f"Token starts with 'gAAAAA': {api_token_raw.startswith('gAAAAA') if api_token_raw else False}")

# Try to decrypt
from services.encryption import get_encrypted_env
try:
    api_token_decrypted = get_encrypted_env("CONFLUENCE_SERVICE_API_TOKEN")
    print(f"\n[DECRYPTION]")
    print(f"Decrypted token: {'*' * 20 if api_token_decrypted else 'FAILED'}")
    print(f"Decrypted length: {len(api_token_decrypted) if api_token_decrypted else 0}")
    print(f"Decryption successful: {bool(api_token_decrypted)}")
except Exception as e:
    print(f"\n[DECRYPTION ERROR] {e}")
    import traceback
    traceback.print_exc()

