import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Helper script to fix Confluence token encryption"""
import os
from dotenv import load_dotenv
from services.encryption import encrypt_password, decrypt_password

env_path = os.path.join(os.path.dirname(__file__), 'config', '.env')
load_dotenv(env_path, override=True)

print("=" * 70)
print("Confluence Token Encryption Fix")
print("=" * 70)
print()

current_token = os.getenv("CONFLUENCE_SERVICE_API_TOKEN", "")
print(f"Current token in .env: {current_token[:50]}...")
print(f"Length: {len(current_token)}")
print()

# Try to decrypt
try:
    decrypted = decrypt_password(current_token)
    print(f"✅ Token can be decrypted!")
    print(f"Decrypted value: {decrypted[:10]}...")
    print()
    print("Token is working correctly. The issue might be with email or base URL.")
except Exception as e:
    print(f"❌ Cannot decrypt token: {e}")
    print()
    print("OPTIONS:")
    print("1. If you have the PLAIN TEXT token, I can encrypt it for you")
    print("2. Or update .env to use plain text token directly")
    print()
    
    # Ask for plain text token
    plain_token = input("Enter your Confluence API token (plain text) or press Enter to skip: ").strip()
    
    if plain_token:
        # Encrypt it
        encrypted = encrypt_password(plain_token)
        print()
        print("=" * 70)
        print("ENCRYPTED TOKEN (copy this to your .env file):")
        print("=" * 70)
        print(f"CONFLUENCE_SERVICE_API_TOKEN={encrypted}")
        print("=" * 70)
        print()
        print("Update backend/config/.env with the above line, then restart backend.")

