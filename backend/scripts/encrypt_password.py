"""
Utility script to encrypt passwords for .env file
Usage: python encrypt_password.py <plain_password>
"""
import sys
import os

# Add parent directory to path
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

# Load config/.env BEFORE importing the encryption module: the key is derived
# from SESSION_SECRET_KEY at import time, and it must be the same key the
# backend uses to decrypt. Otherwise values get encrypted with the built-in
# default key and the backend fails with InvalidToken.
from dotenv import load_dotenv
load_dotenv(os.path.join(_BACKEND_DIR, 'config', '.env'))

from services.encryption import encrypt_password

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python encrypt_password.py <plain_password>")
        sys.exit(1)
    
    plain_password = sys.argv[1]
    encrypted = encrypt_password(plain_password)
    print(f"Encrypted password: {encrypted}")
    print(f"\nAdd this to your .env file:")
    print(f"ENCRYPTED_PASSWORD={encrypted}")

