"""
Utility script to encrypt passwords for .env file
Usage: python encrypt_password.py <plain_password>
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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

