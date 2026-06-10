import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Test token format and decryption"""
import os
from dotenv import load_dotenv
from services.encryption import decrypt_password, encrypt_password

env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)

raw_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN", "")
print(f"Raw token from .env: {raw_token[:50]}...")
print(f"Token length: {len(raw_token)}")
print(f"Starts with 'gAAAAA': {raw_token.startswith('gAAAAA')}")
print()

# Try to decrypt
try:
    decrypted = decrypt_password(raw_token)
    print(f"✅ Decryption successful!")
    print(f"Decrypted token: {decrypted[:10]}... (length: {len(decrypted)})")
except Exception as e:
    print(f"❌ Decryption failed: {e}")
    print()
    print("The token might be:")
    print("1. Already plain text (not encrypted)")
    print("2. Encrypted with a different key")
    print("3. In wrong format")
    print()
    print("Let's check if it's already plain text...")
    # If it looks like an API token (alphanumeric, specific length)
    if len(raw_token) < 50 and raw_token.isalnum():
        print(f"Token looks like plain text (short, alphanumeric)")
        print(f"Trying to use it directly...")

